import {
  BOMBER_GRID_H,
  BOMBER_GRID_W,
  BomberBlast,
  BomberBomb,
  BomberParticle,
  BomberPlayerState,
  BomberPowerup,
  HazardRuntime,
  POWERUP_INFO,
  TILE_CRATE,
  TILE_LAVA,
  TILE_PAD,
  TILE_WALL,
} from './BomberState';
import { ArenaRuntime } from './BomberArenas';

const TILE = 50;
const WORLD_W = BOMBER_GRID_W * TILE;
const WORLD_H = BOMBER_GRID_H * TILE;

export interface BomberRenderFrame {
  players: BomberPlayerState[];
  bombs: BomberBomb[];
  blasts: BomberBlast[];
  powerups: BomberPowerup[];
  particles: BomberParticle[];
  hazard: HazardRuntime;
  time: number;
  shake: number;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function safeColor(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : '#94a3b8';
}

function playerWorldPos(player: BomberPlayerState): { x: number; y: number } {
  if (!player.moving) return { x: player.tx, y: player.ty };
  return {
    x: player.fromX + (player.toX - player.fromX) * player.moveT,
    y: player.fromY + (player.toY - player.fromY) * player.moveT,
  };
}

export class BomberRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private staticLayer: HTMLCanvasElement | null = null;
  private arena: ArenaRuntime | null = null;
  private dpr = 1;
  private clientW = 800;
  private clientH = 650;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.clientW = Math.max(1, Math.round(rect.width) || 800);
    this.clientH = Math.max(1, Math.round(rect.height) || 650);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const backingW = Math.max(1, Math.round(this.clientW * this.dpr));
    const backingH = Math.max(1, Math.round(this.clientH * this.dpr));
    if (this.canvas.width !== backingW) this.canvas.width = backingW;
    if (this.canvas.height !== backingH) this.canvas.height = backingH;
    this.scale = Math.min(this.clientW / WORLD_W, this.clientH / WORLD_H);
    this.offsetX = (this.clientW - WORLD_W * this.scale) / 2;
    this.offsetY = (this.clientH - WORLD_H * this.scale) / 2;
  }

  setArena(arena: ArenaRuntime): void {
    this.arena = arena;
    this.buildStaticLayer();
  }

  destroy(): void {
    this.staticLayer = null;
    this.arena = null;
  }

  draw(frame: BomberRenderFrame): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const palette = this.arena?.def.palette;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = palette?.bg ?? '#05070d';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.arena || !this.staticLayer) return;

    const shakeX = (Math.random() - 0.5) * frame.shake;
    const shakeY = (Math.random() - 0.5) * frame.shake;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    ctx.translate(this.offsetX + shakeX, this.offsetY + shakeY);
    ctx.scale(this.scale, this.scale);
    ctx.drawImage(this.staticLayer, 0, 0);

    this.drawCrates(ctx, frame.time);
    this.drawPads(ctx, frame.time);
    this.drawLava(ctx, frame.time);
    this.drawHazard(ctx, frame);
    this.drawPowerups(ctx, frame);
    this.drawBombs(ctx, frame);
    this.drawBlasts(ctx, frame);
    this.drawPlayers(ctx, frame);
    this.drawParticles(ctx, frame.particles);

    ctx.restore();
  }

  private buildStaticLayer(): void {
    if (!this.arena) return;
    const layer = document.createElement('canvas');
    layer.width = WORLD_W;
    layer.height = WORLD_H;
    const ctx = layer.getContext('2d');
    if (!ctx) {
      this.staticLayer = layer;
      return;
    }
    const palette = this.arena.def.palette;
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    for (let y = 0; y < BOMBER_GRID_H; y++) {
      for (let x = 0; x < BOMBER_GRID_W; x++) {
        const tile = this.arena.tiles[y * BOMBER_GRID_W + x];
        const px = x * TILE;
        const py = y * TILE;
        if (tile === TILE_WALL) {
          this.drawWall(ctx, px, py);
          continue;
        }
        const floor = (x + y) % 2 === 0 ? palette.floorA : palette.floorB;
        ctx.fillStyle = floor;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = 'rgba(0,0,0,0.16)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        if (tile === TILE_LAVA) {
          ctx.fillStyle = '#2a0b06';
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = palette.hazard;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(px + 6, py + 6, TILE - 12, TILE - 12);
          ctx.globalAlpha = 1;
        } else if (tile === TILE_PAD) {
          ctx.fillStyle = palette.pad;
          ctx.globalAlpha = 0.14;
          ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = palette.pad;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 7.5, py + 7.5, TILE - 15, TILE - 15);
          ctx.globalAlpha = 1;
        }
      }
    }

    this.staticLayer = layer;
  }

  private drawWall(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    if (!this.arena) return;
    const palette = this.arena.def.palette;
    ctx.fillStyle = palette.wall;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = palette.wallTop;
    ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(px + 4, py + TILE - 12, TILE - 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(px + 4, py + 4, TILE - 8, 4);
  }

  private drawCrates(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.arena) return;
    const palette = this.arena.def.palette;
    for (let y = 0; y < BOMBER_GRID_H; y++) {
      for (let x = 0; x < BOMBER_GRID_W; x++) {
        if (this.arena.tiles[y * BOMBER_GRID_W + x] !== TILE_CRATE) continue;
        const px = x * TILE;
        const py = y * TILE;
        const wobble = Math.sin(time * 1.4 + x * 0.8 + y * 0.6) * 0.6;
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(px + 5, py + 8, TILE - 8, TILE - 8);
        ctx.fillStyle = palette.crate;
        ctx.fillRect(px + 4, py + 4 + wobble, TILE - 8, TILE - 8);
        ctx.strokeStyle = palette.crateEdge;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 4.5, py + 4.5 + wobble, TILE - 9, TILE - 9);
        ctx.beginPath();
        ctx.moveTo(px + 8, py + 8 + wobble);
        ctx.lineTo(px + TILE - 8, py + TILE - 8 + wobble);
        ctx.moveTo(px + TILE - 8, py + 8 + wobble);
        ctx.lineTo(px + 8, py + TILE - 8 + wobble);
        ctx.globalAlpha = 0.45;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawPads(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.arena) return;
    const palette = this.arena.def.palette;
    for (let y = 0; y < BOMBER_GRID_H; y++) {
      for (let x = 0; x < BOMBER_GRID_W; x++) {
        if (this.arena.tiles[y * BOMBER_GRID_W + x] !== TILE_PAD) continue;
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        const pulse = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(time * 4 + (x + y) * 0.7));
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = palette.pad;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(cx - 12, cy + i * 9 + 5);
          ctx.lineTo(cx, cy + i * 9 - 4);
          ctx.lineTo(cx + 12, cy + i * 9 + 5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawLava(ctx: CanvasRenderingContext2D, time: number): void {
    if (!this.arena) return;
    const palette = this.arena.def.palette;
    for (const tile of this.arena.def.lavaTiles) {
      const cx = tile.x * TILE + TILE / 2;
      const cy = tile.y * TILE + TILE / 2;
      const pulse = 0.75 + 0.25 * Math.sin(time * 3 + (tile.x + tile.y) * 0.9);
      const gradient = ctx.createRadialGradient(cx, cy, 4, cx, cy, TILE * 0.85);
      gradient.addColorStop(0, palette.hazard);
      gradient.addColorStop(0.5, 'rgba(249,115,22,0.55)');
      gradient.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.globalAlpha = pulse;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fde68a';
      for (let i = 0; i < 3; i++) {
        const bx = cx + Math.sin(time * 1.7 + i * 2.1 + tile.x) * 12;
        const by = cy + Math.cos(time * 1.4 + i * 1.9 + tile.y) * 12;
        ctx.beginPath();
        ctx.arc(bx, by, 2 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawHazard(ctx: CanvasRenderingContext2D, frame: BomberRenderFrame): void {
    if (!this.arena || !this.arena.def.hazard) return;
    const hazard = frame.hazard;
    if (hazard.phase === 'idle') return;
    const palette = this.arena.def.palette;
    const telegraph = hazard.phase === 'telegraph';
    const pulse = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(frame.time * (telegraph ? 14 : 24)));
    ctx.fillStyle = palette.hazard;
    ctx.globalAlpha = telegraph ? pulse : 0.55;
    for (const tile of this.arena.hazardTiles) {
      ctx.fillRect(tile.x * TILE + 2, tile.y * TILE + 2, TILE - 4, TILE - 4);
    }
    ctx.globalAlpha = 1;
  }

  private drawPowerups(ctx: CanvasRenderingContext2D, frame: BomberRenderFrame): void {
    for (const powerup of frame.powerups) {
      const info = POWERUP_INFO[powerup.type];
      const bob = Math.sin(frame.time * 3 + powerup.x * 0.9 + powerup.y * 0.7) * 2.5;
      const cx = powerup.x * TILE + TILE / 2;
      const cy = powerup.y * TILE + TILE / 2 + bob;
      ctx.save();
      ctx.shadowColor = info.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(8,12,23,0.82)';
      roundRectPath(ctx, cx - 17, cy - 17, 34, 34, 9);
      ctx.fill();
      ctx.strokeStyle = info.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = info.color;
      ctx.font = '900 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.short, cx, cy + 1);
      ctx.restore();
    }
  }

  private drawBombs(ctx: CanvasRenderingContext2D, frame: BomberRenderFrame): void {
    for (const bomb of frame.bombs) {
      const cx = bomb.x * TILE + TILE / 2;
      const cy = bomb.y * TILE + TILE / 2;
      const urgent = bomb.fuse < 0.7;
      const pulse = 1 + 0.08 * Math.sin(frame.time * (urgent ? 30 : 16) + bomb.id);
      const radius = 16 * pulse;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx + 2, cy + 10, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = urgent ? '#7f1d1d' : '#111827';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = urgent ? '#f87171' : '#334155';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 6, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - radius);
      ctx.quadraticCurveTo(cx + 12, cy - radius - 8, cx + 8, cy - radius - 15);
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(cx + 8, cy - radius - 16, 3 + Math.sin(frame.time * 30) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBlasts(ctx: CanvasRenderingContext2D, frame: BomberRenderFrame): void {
    for (const blast of frame.blasts) {
      const alpha = Math.max(0, Math.min(1, blast.timer / blast.maxTimer));
      const cx = blast.x * TILE + TILE / 2;
      const cy = blast.y * TILE + TILE / 2;
      const radius = TILE * (0.38 + 0.34 * alpha);
      const gradient = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
      gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
      gradient.addColorStop(0.35, 'rgba(253,224,71,0.95)');
      gradient.addColorStop(0.7, 'rgba(249,115,22,0.75)');
      gradient.addColorStop(1, 'rgba(239,68,68,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawPlayers(ctx: CanvasRenderingContext2D, frame: BomberRenderFrame): void {
    for (const player of frame.players) {
      if (!player.onMap || player.lives <= 0) continue;
      const pos = playerWorldPos(player);
      const cx = (pos.x + 0.5) * TILE;
      const cy = (pos.y + 0.5) * TILE;
      const color = safeColor(player.player.color);
      const blinking = player.invuln > 0;
      const alpha = blinking ? 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(frame.time * 24)) : 1;
      const shieldPulse = player.shield > 0 ? 0.62 + 0.3 * Math.sin(frame.time * 6) : 0;

      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 15, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha;
      roundRectPath(ctx, cx - 16, cy - 17, 32, 32, 9);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      const facing = player.facing;
      const notchX = cx + facing.x * 11;
      const notchY = cy + facing.y * 11;
      ctx.fillStyle = 'rgba(8,12,23,0.72)';
      ctx.beginPath();
      ctx.arc(notchX, notchY, 3.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 6, 2.4, 0, Math.PI * 2);
      ctx.arc(cx + 5, cy - 6, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (shieldPulse > 0) {
        ctx.globalAlpha = shieldPulse;
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 23, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const name = player.player.name.length > 13
        ? `${player.player.name.slice(0, 12)}…`
        : player.player.name;
      ctx.font = '800 11px Inter, system-ui, sans-serif';
      const textWidth = Math.min(140, ctx.measureText(name).width + 14);
      ctx.fillStyle = 'rgba(8,12,23,0.72)';
      roundRectPath(ctx, cx - textWidth / 2, cy - 40, textWidth, 17, 8);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, cx, cy - 31.5);
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, particles: BomberParticle[]): void {
    for (const particle of particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (0.4 + alpha * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
