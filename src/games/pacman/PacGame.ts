import { ControllerInputState } from '../../net/BinaryProtocol';
import { HostSDKContext, PlatformGame, PlatformPlayer } from '../../sdk/GameSDK';
import { PacAudioEngine } from './PacAudioEngine';
import {
  PAC_GHOST_SPAWNS,
  PAC_MAZE_HEIGHT,
  PAC_MAZE_WIDTH,
  PAC_PELLET,
  PAC_POWER_PELLET,
  PAC_SPAWNS,
  countPowerPellets,
  createPelletGrid,
  isMazeWall,
} from './PacMaze';

const TILE = 48;
const VIEW_SIZE = PAC_MAZE_WIDTH * TILE;

const PAC_FALLBACK_COLORS = [
  '#ffd60a',
  '#ff9f1c',
  '#a3e635',
  '#38bdf8',
  '#c084fc',
  '#f472b6',
  '#2dd4bf',
  '#fb7185',
];

// Ghosts use a fixed palette so they never read as Pac-Man bodies.
const GHOST_NEON_COLORS = ['#ff4d6d', '#b26bff', '#22d3ee', '#fb923c'];

function parseHexColor(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((char) => char + char)
          .join('')
      : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;

  return [hue * 60, saturation, lightness];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (value: number): string =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function neonColor(hex: string, fallback: string): string {
  const rgb = parseHexColor(hex);
  if (!rgb) return fallback;
  const [hue, saturation, lightness] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  if (saturation < 0.18 || lightness < 0.12) return fallback;
  return hslToHex(hue, Math.max(0.9, saturation), Math.min(0.68, Math.max(0.58, lightness)));
}
const COUNTDOWN_SECONDS = 3;
const POWER_SECONDS = 7;
const DASH_SECONDS = 0.55;
const DASH_COOLDOWN_SECONDS = 3.5;
const PAC_SPEED = 5.2;
const GHOST_SPEED = 5.0;
const PAC_LIVES = 3;
const GHOST_RESPAWN_SECONDS = 4;

const DIR_UP = { x: 0, y: -1 };
const DIR_DOWN = { x: 0, y: 1 };
const DIR_LEFT = { x: -1, y: 0 };
const DIR_RIGHT = { x: 1, y: 0 };
const DIRECTIONS = [DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT];

type Team = 'pac' | 'ghost';
type Phase = 'waiting' | 'countdown' | 'playing' | 'results';

interface Direction {
  x: number;
  y: number;
}

interface PacPlayerState {
  player: PlatformPlayer;
  team: Team;
  teamIndex: number;
  x: number;
  y: number;
  dir: Direction;
  wantDir: Direction;
  spawn: { x: number; y: number };
  lives: number;
  eliminated: boolean;
  respawnTimer: number;
  invulnTimer: number;
  poweredTimer: number;
  dashTimer: number;
  dashCooldown: number;
  stunTimer: number;
  prevBoost: boolean;
  hasMoved: boolean;
}

const COVER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#070d1c"/>
      <stop offset="100%" stop-color="#0b1a38"/>
    </linearGradient>
    <linearGradient id="pac" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fde047"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <g stroke="#2563eb" stroke-width="5" stroke-linecap="round" opacity="0.5" fill="none">
    <path d="M80 80h130v60h90V80h120v60h140"/>
    <path d="M80 180h60v80h110v-50h100v50h110v-80h100"/>
    <path d="M150 260h340"/>
  </g>
  <g fill="#fde68a" opacity="0.9">
    <circle cx="110" cy="120" r="4"/><circle cx="170" cy="120" r="4"/><circle cx="230" cy="120" r="4"/>
    <circle cx="300" cy="120" r="4"/><circle cx="380" cy="120" r="4"/><circle cx="450" cy="120" r="4"/>
    <circle cx="110" cy="220" r="4"/><circle cx="190" cy="220" r="4"/><circle cx="300" cy="220" r="4"/>
  </g>
  <circle cx="360" cy="200" r="8" fill="#f472b6"/>
  <g transform="translate(250 200)">
    <path d="M0 0 L36 -30 A46 46 0 1 0 36 30 Z" fill="url(#pac)"/>
    <circle cx="10" cy="-20" r="5" fill="#0b1020"/>
  </g>
  <g transform="translate(470 170)">
    <path d="M-32 22V-6a32 32 0 0 1 64 0v28l-10-8-11 8-11-8-11 8z" fill="#ef4444"/>
    <circle cx="-11" cy="-12" r="9" fill="#fff"/><circle cx="11" cy="-12" r="9" fill="#fff"/>
    <circle cx="-8" cy="-12" r="4" fill="#1e3a8a"/><circle cx="14" cy="-12" r="4" fill="#1e3a8a"/>
  </g>
  <text x="320" y="327" text-anchor="middle" fill="#e2e8f0" font-family="system-ui,sans-serif" font-weight="900" font-size="25" letter-spacing="4">PAC-MAN GHOST HUNT</text>
</svg>
`)}`;

export class PacGame implements PlatformGame {
  readonly id = 'pacman-ghost-hunt';
  readonly title = 'Pac-Man: Ghost Hunt';
  readonly subtitle =
    'Pertarungan 2 tim di labirin! Tim Pac-Man harus mengumpulkan semua power pellet untuk menang, sementara tim Ghost bekerja sama mengejar dan menghabiskan nyawa Pac-Man.';
  readonly badge = '2-8 PLAYER • PAC VS GHOST';
  readonly accentColor = '#facc15';
  readonly coverImage = COVER_SVG;
  readonly minPlayers = 2;
  readonly maxPlayers = 8;
  readonly controllerLayout: 'arena-dpad' = 'arena-dpad';

  private container: HTMLElement | null = null;
  private sdk: HostSDKContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private mazeLayer: HTMLCanvasElement | null = null;
  private rafId: number | null = null;
  private lastTime = 0;
  private audio = new PacAudioEngine();
  private unlockAudioOnce = (): void => {
    this.audio.unlock();
  };

  private powerEl: HTMLElement | null = null;
  private livesEl: HTMLElement | null = null;
  private ghostsEl: HTMLElement | null = null;
  private boardEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private countdownEl: HTMLElement | null = null;
  private waitingEl: HTMLElement | null = null;
  private waitingTextEl: HTMLElement | null = null;
  private resultsEl: HTMLElement | null = null;

  private players: PacPlayerState[] = [];
  private pelletGrid = createPelletGrid();
  private powerPelletsEaten = 0;
  private powerPelletsTotal = 0;

  private phase: Phase = 'waiting';
  private countdownTimer = COUNTDOWN_SECONDS;
  private roundNumber = 1;
  private bannerTimer = 0;
  private telemetryTimer = 0;
  private hudTimer = 0;

  mount(container: HTMLElement, sdk: HostSDKContext): void {
    this.container = container;
    this.sdk = sdk;
    this.players = [];
    this.pelletGrid = createPelletGrid();
    this.powerPelletsEaten = 0;
    this.powerPelletsTotal = countPowerPellets(this.pelletGrid);
    this.phase = 'waiting';
    this.countdownTimer = COUNTDOWN_SECONDS;
    this.roundNumber = 1;
    this.bannerTimer = 0;
    this.telemetryTimer = 0;
    this.hudTimer = 0;

    container.innerHTML = `
      <canvas id="pac-canvas" width="${VIEW_SIZE}" height="${VIEW_SIZE}" style="position:absolute;z-index:1;display:block;border-radius:18px;box-shadow:0 0 60px rgba(37,99,235,0.25),0 20px 60px rgba(0,0,0,0.55);"></canvas>

      <div class="game-topbar">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button id="pac-exit" class="btn btn-danger" style="padding:8px 14px;font-weight:900;">✕ Exit</button>
          <div class="hud-pill" style="color:#fde047;">⚡ POWER <span id="pac-power">0/4</span></div>
          <div class="hud-pill" style="color:#fda4af;">♥ PAC <span id="pac-lives">0</span></div>
          <div class="hud-pill" style="color:#fca5a5;">👻 GHOST <span id="pac-ghosts">0</span></div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;min-width:0;">
          <button id="pac-mute" class="btn btn-secondary" style="padding:8px 12px;font-weight:800;font-size:12px;white-space:nowrap;">🔊 Musik ON</button>
          <div id="pac-board" class="hud-pill" style="max-width:48vw;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px;color:#cbd5e1;"></div>
        </div>
      </div>

      <div id="pac-banner" style="position:absolute;left:50%;top:14%;transform:translateX(-50%);z-index:25;pointer-events:none;opacity:0;transition:opacity 0.22s ease;font-size:clamp(18px,2.6vw,32px);font-weight:900;letter-spacing:0.05em;text-shadow:0 3px 18px rgba(0,0,0,0.85);text-align:center;white-space:nowrap;"></div>

      <div id="pac-countdown" style="position:absolute;inset:0;z-index:20;display:none;align-items:center;justify-content:center;pointer-events:none;font-size:clamp(70px,13vw,170px);font-weight:900;color:#facc15;text-shadow:0 0 34px rgba(250,204,21,0.75);">${COUNTDOWN_SECONDS}</div>

      <div id="pac-waiting" style="position:absolute;inset:0;z-index:45;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,0.72);backdrop-filter:blur(5px);padding:20px;pointer-events:none;">
        <div style="max-width:520px;text-align:center;color:#e2e8f0;">
          <div style="font-size:12px;font-weight:900;letter-spacing:0.2em;color:#fde047;">MENUNGGU PEMAIN</div>
          <div id="pac-wait-text" style="font-size:46px;font-weight:900;margin:8px 0 4px;">0/2</div>
          <p style="margin:0;color:#94a3b8;font-size:14px;line-height:1.5;">Butuh minimal 1 Pac-Man dan 1 Ghost.<br>Semua pemain manusia — bot tidak dipakai di game ini.</p>
        </div>
      </div>

      <div id="pac-results" style="position:absolute;inset:0;z-index:50;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,0.76);backdrop-filter:blur(7px);padding:20px;"></div>
    `;

    this.canvas = container.querySelector('#pac-canvas') as HTMLCanvasElement | null;
    this.ctx = this.canvas?.getContext('2d') ?? null;
    this.powerEl = container.querySelector('#pac-power');
    this.livesEl = container.querySelector('#pac-lives');
    this.ghostsEl = container.querySelector('#pac-ghosts');
    this.boardEl = container.querySelector('#pac-board');
    this.bannerEl = container.querySelector('#pac-banner');
    this.countdownEl = container.querySelector('#pac-countdown');
    this.waitingEl = container.querySelector('#pac-waiting');
    this.waitingTextEl = container.querySelector('#pac-wait-text');
    this.resultsEl = container.querySelector('#pac-results');

    this.buildMazeLayer();
    this.syncPlayers();
    this.layout();
    this.updateHud();

    this.audio.unlock();
    window.addEventListener('pointerdown', this.unlockAudioOnce, { once: true });
    window.addEventListener('keydown', this.unlockAudioOnce, { once: true });

    if (this.players.length >= 2) this.startRound();
    else this.showWaiting();

    container.querySelector('#pac-exit')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });

    const soundBtn = container.querySelector('#pac-mute') as HTMLButtonElement | null;
    soundBtn?.addEventListener('click', () => {
      this.audio.unlock();
      const muted = !this.audio.isMuted();
      this.audio.setMuted(muted);
      soundBtn.textContent = muted ? '🔇 Musik OFF' : '🔊 Musik ON';
      soundBtn.classList.toggle('btn-danger', muted);
      soundBtn.classList.toggle('btn-secondary', !muted);
    });

    window.addEventListener('resize', this.handleResize);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  unmount(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointerdown', this.unlockAudioOnce);
    window.removeEventListener('keydown', this.unlockAudioOnce);
    this.audio.destroy();
    this.players = [];
    this.mazeLayer = null;
    this.canvas = null;
    this.ctx = null;
    if (this.container) this.container.innerHTML = '';
    this.container = null;
    this.sdk = null;
  }

  private loop = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    const rosterChanged = this.syncPlayers();
    if (rosterChanged) {
      if (this.players.length < 2) this.showWaiting();
      else this.startRound();
    }

    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      this.updateCountdown();
      if (this.countdownTimer <= 0) {
        this.phase = 'playing';
        if (this.countdownEl) this.countdownEl.style.display = 'none';
        this.showBanner('GO!', '#facc15', 0.9);
      }
    } else if (this.phase === 'playing') {
      this.updatePlaying(dt);
    }

    this.updateBanner(dt);
    this.render(now / 1000);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private startRound(): void {
    if (this.players.length < 2) {
      this.showWaiting();
      return;
    }

    this.assignTeams();
    this.pelletGrid = createPelletGrid();
    this.powerPelletsEaten = 0;
    this.powerPelletsTotal = countPowerPellets(this.pelletGrid);
    this.countdownTimer = COUNTDOWN_SECONDS;
    this.telemetryTimer = 0;
    this.hudTimer = 0;

    for (const state of this.players) this.resetPlayerForRound(state);

    this.phase = 'countdown';
    if (this.resultsEl) this.resultsEl.style.display = 'none';
    if (this.waitingEl) this.waitingEl.style.display = 'none';
    if (this.countdownEl) {
      this.countdownEl.style.display = 'flex';
      this.countdownEl.textContent = String(COUNTDOWN_SECONDS);
    }
    this.audio.startMusic();
    this.updateHud();
  }

  private assignTeams(): void {
    const sorted = [...this.players].sort((a, b) => a.player.slot - b.player.slot);
    const count = sorted.length;
    const ghostCount = Math.max(1, Math.floor(count / 2));
    const offset = (this.roundNumber - 1) % count;
    const ghostIndices = new Set<number>();
    for (let i = 0; i < ghostCount; i++) ghostIndices.add((offset + i) % count);

    let pacIndex = 0;
    let ghostIndex = 0;
    for (let i = 0; i < sorted.length; i++) {
      const state = sorted[i];
      state.team = ghostIndices.has(i) ? 'ghost' : 'pac';
      state.teamIndex = state.team === 'ghost' ? ghostIndex++ : pacIndex++;
    }
  }

  private resetPlayerForRound(state: PacPlayerState): void {
    state.lives = state.team === 'pac' ? PAC_LIVES : 0;
    state.eliminated = false;
    state.respawnTimer = 0;
    state.invulnTimer = 1.2;
    state.poweredTimer = 0;
    state.dashTimer = 0;
    state.dashCooldown = 0;
    state.stunTimer = 0;
    state.prevBoost = false;
    state.hasMoved = false;
    this.placeAtSpawn(state);
  }

  private placeAtSpawn(state: PacPlayerState): void {
    const spawns = state.team === 'ghost' ? PAC_GHOST_SPAWNS : PAC_SPAWNS;
    const spawn = spawns[state.teamIndex % spawns.length];
    state.spawn = { ...spawn };
    state.x = spawn.x;
    state.y = spawn.y;
    state.dir = this.openDirAt(spawn.x, spawn.y);
    state.wantDir = state.dir;
  }

  private respawnPacAtRandom(state: PacPlayerState): void {
    const currentX = Math.round(state.x);
    const currentY = Math.round(state.y);
    const others = this.players.filter(
      (other) => other !== state && !other.eliminated && other.respawnTimer <= 0
    );

    const candidates = PAC_SPAWNS.filter(
      (spawn) => spawn.x !== currentX || spawn.y !== currentY
    );
    const safe = candidates.filter(
      (spawn) =>
        others.every((other) => Math.hypot(other.x - spawn.x, other.y - spawn.y) >= 1.5) &&
        others.every(
          (other) =>
            other.team !== 'ghost' ||
            Math.hypot(other.x - spawn.x, other.y - spawn.y) >= 2.5
        )
    );
    const pool = safe.length > 0 ? safe : candidates.length > 0 ? candidates : PAC_SPAWNS;
    const spawn = pool[Math.floor(Math.random() * pool.length)];

    state.x = spawn.x;
    state.y = spawn.y;
    state.dir = this.openDirAt(spawn.x, spawn.y);
    state.wantDir = state.dir;
  }

  private showWaiting(): void {
    this.phase = 'waiting';
    this.audio.stopMusic();
    if (this.countdownEl) this.countdownEl.style.display = 'none';
    if (this.resultsEl) this.resultsEl.style.display = 'none';
    if (this.waitingEl) this.waitingEl.style.display = 'flex';
    if (this.waitingTextEl) this.waitingTextEl.textContent = `${this.players.length}/2`;
    this.updateHud();
  }

  private updatePlaying(dt: number): void {
    for (const state of this.players) {
      this.updatePlayer(state, dt);
      if (this.phase !== 'playing') return;
    }

    this.checkCollisions();
    if (this.phase !== 'playing') return;

    if (this.alivePacCount() === 0) {
      this.finishRound('ghost');
      return;
    }
    if (this.powerPelletsEaten >= this.powerPelletsTotal) {
      this.finishRound('pac');
      return;
    }

    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 1 / 15) {
      this.telemetryTimer = 0;
      this.sendTelemetry();
    }

    this.hudTimer += dt;
    if (this.hudTimer >= 0.12) {
      this.hudTimer = 0;
      this.updateHud();
    }
  }

  private updatePlayer(state: PacPlayerState, dt: number): void {
    state.invulnTimer = Math.max(0, state.invulnTimer - dt);
    state.poweredTimer = Math.max(0, state.poweredTimer - dt);
    state.dashTimer = Math.max(0, state.dashTimer - dt);
    state.dashCooldown = Math.max(0, state.dashCooldown - dt);
    state.stunTimer = Math.max(0, state.stunTimer - dt);

    if (state.eliminated) return;

    if (state.respawnTimer > 0) {
      state.respawnTimer -= dt;
      if (state.respawnTimer <= 0) {
        this.placeAtSpawn(state);
        state.hasMoved = false;
        state.invulnTimer = 1.2;
        state.respawnTimer = 0;
      }
      return;
    }

    if (state.stunTimer > 0) return;

    const input = this.sdk?.getInput(state.player.id);
    const wanted = this.inputToDirection(input);
    if (wanted) {
      state.wantDir = wanted;
      state.hasMoved = true;
    }
    if (input?.boost && !state.prevBoost) this.tryDash(state);
    state.prevBoost = Boolean(input?.boost);

    if (!state.hasMoved) return;

    this.moveEntity(state, this.playerSpeed(state) * dt, true);
    if (state.team === 'pac') {
      this.consumePellet(state);
      if (this.phase !== 'playing') return;
    }
  }

  private playerSpeed(state: PacPlayerState): number {
    let speed = state.team === 'ghost' ? GHOST_SPEED : PAC_SPEED;
    if (state.team === 'pac' && state.poweredTimer > 0) speed *= 1.1;
    if (state.dashTimer > 0) speed *= 1.85;
    return speed;
  }

  private inputToDirection(input: ControllerInputState | undefined): Direction | null {
    if (!input) return null;
    if (input.gas) return DIR_UP;
    if (input.brake) return DIR_DOWN;
    if (input.steer < -0.28) return DIR_LEFT;
    if (input.steer > 0.28) return DIR_RIGHT;
    return null;
  }

  private tryDash(state: PacPlayerState): void {
    if (state.dashCooldown > 0 || state.stunTimer > 0) return;
    state.dashTimer = DASH_SECONDS;
    state.dashCooldown = DASH_COOLDOWN_SECONDS;
    this.sdk?.sendVibrate(state.player.id, 22);
  }

  private moveEntity(
    entity: { x: number; y: number; dir: Direction; wantDir: Direction },
    distance: number,
    allowReverse: boolean
  ): void {
    let budget = Math.max(0, distance);
    let guard = 0;

    while (budget > 1e-5 && guard++ < 64) {
      const centerX = Math.round(entity.x);
      const centerY = Math.round(entity.y);
      const atCenter =
        Math.abs(entity.x - centerX) < 1e-6 && Math.abs(entity.y - centerY) < 1e-6;

      if (atCenter) {
        entity.x = centerX;
        entity.y = centerY;
        if (!isMazeWall(centerX + entity.wantDir.x, centerY + entity.wantDir.y)) {
          entity.dir = entity.wantDir;
        }
        if (isMazeWall(centerX + entity.dir.x, centerY + entity.dir.y)) break;
      } else if (
        allowReverse &&
        entity.wantDir.x === -entity.dir.x &&
        entity.wantDir.y === -entity.dir.y
      ) {
        entity.dir = entity.wantDir;
      }

      const nextX =
        entity.dir.x > 0
          ? Math.floor(entity.x) + 1
          : entity.dir.x < 0
            ? Math.ceil(entity.x) - 1
            : entity.x;
      const nextY =
        entity.dir.y > 0
          ? Math.floor(entity.y) + 1
          : entity.dir.y < 0
            ? Math.ceil(entity.y) - 1
            : entity.y;

      if (isMazeWall(nextX, nextY)) {
        entity.x = centerX;
        entity.y = centerY;
        break;
      }

      const remaining = Math.abs(nextX - entity.x) + Math.abs(nextY - entity.y);
      if (remaining <= budget) {
        entity.x = nextX;
        entity.y = nextY;
        budget -= remaining;
      } else {
        entity.x += entity.dir.x * budget;
        entity.y += entity.dir.y * budget;
        budget = 0;
      }
    }
  }

  private consumePellet(state: PacPlayerState): void {
    const tx = Math.round(state.x);
    const ty = Math.round(state.y);
    if (tx < 0 || ty < 0 || tx >= PAC_MAZE_WIDTH || ty >= PAC_MAZE_HEIGHT) return;
    if (Math.abs(state.x - tx) + Math.abs(state.y - ty) > 0.45) return;

    const index = ty * PAC_MAZE_WIDTH + tx;
    const cell = this.pelletGrid[index];
    if (cell === 0) return;

    this.pelletGrid[index] = 0;

    if (cell === PAC_POWER_PELLET) {
      this.powerPelletsEaten += 1;
      state.poweredTimer = POWER_SECONDS;
      this.audio.playPower();
      this.showBanner(`${state.player.name} POWER MODE!`, '#f472b6', 1.1);
      this.sdk?.sendVibrate(state.player.id, [30, 40, 30]);
      if (this.powerPelletsEaten >= this.powerPelletsTotal) {
        this.finishRound('pac');
      }
    } else {
      this.audio.playChomp();
    }
  }

  private checkCollisions(): void {
    const pacmen = this.players.filter((state) => state.team === 'pac' && !state.eliminated);
    const ghosts = this.players.filter(
      (state) => state.team === 'ghost' && state.respawnTimer <= 0
    );

    for (const pac of pacmen) {
      for (const ghost of ghosts) {
        if (Math.hypot(pac.x - ghost.x, pac.y - ghost.y) > 0.72) continue;
        if (pac.poweredTimer > 0) {
          if (ghost.invulnTimer <= 0) this.eatGhost(pac, ghost);
        } else if (pac.invulnTimer <= 0 && ghost.invulnTimer <= 0) {
          this.loseLife(pac);
          if (this.phase !== 'playing') return;
          break;
        }
      }
    }
  }

  private loseLife(pac: PacPlayerState): void {
    pac.lives = Math.max(0, pac.lives - 1);
    pac.poweredTimer = 0;
    pac.dashTimer = 0;
    pac.stunTimer = 1.0;
    pac.invulnTimer = 2.2;

    this.audio.playDeath();
    this.sdk?.sendVibrate(pac.player.id, [130, 50, 130]);

    if (pac.lives <= 0) {
      pac.eliminated = true;
      this.showBanner(`${pac.player.name} GUGUR!`, '#ef4444', 1.3);
      if (this.alivePacCount() === 0) this.finishRound('ghost');
      return;
    }

    this.respawnPacAtRandom(pac);
    pac.hasMoved = false;
    this.showBanner(`${pac.player.name} kehilangan 1 nyawa!`, '#f87171', 1);
  }

  private eatGhost(pac: PacPlayerState, ghost: PacPlayerState): void {
    ghost.respawnTimer = GHOST_RESPAWN_SECONDS;
    ghost.poweredTimer = 0;
    ghost.dashTimer = 0;
    ghost.stunTimer = 0;
    this.audio.playGhostEaten();
    this.showBanner(`${pac.player.name} makan ${ghost.player.name}!`, pac.player.color, 1.1);
    this.sdk?.sendVibrate(pac.player.id, [40, 25, 50]);
    this.sdk?.sendVibrate(ghost.player.id, [110, 40, 140]);
  }

  private finishRound(winner: Team): void {
    if (this.phase === 'results') return;
    this.phase = 'results';
    this.audio.stopMusic();
    if (winner === 'pac') this.audio.playWin();
    else this.audio.playGhostWin();
    if (this.countdownEl) this.countdownEl.style.display = 'none';
    if (this.waitingEl) this.waitingEl.style.display = 'none';
    this.updateHud();
    this.showResults(winner);
    for (const state of this.players) this.sdk?.sendVibrate(state.player.id, [60, 40, 60]);
  }

  private showResults(winner: Team): void {
    if (!this.resultsEl) return;

    const pacAlive = this.alivePacCount();
    const aliveGhosts = this.players.filter((state) => state.team === 'ghost').length;
    const winnerName = winner === 'pac' ? 'PAC-MAN MENANG!' : 'GHOST MENANG!';
    const winnerColor = winner === 'pac' ? '#facc15' : '#f87171';
    const reason =
      winner === 'pac'
        ? `Semua ${this.powerPelletsTotal} power pellet berhasil dikonsumsi.`
        : 'Semua nyawa Pac-Man sudah habis.';

    const rows = [...this.players]
      .sort((a, b) => a.player.slot - b.player.slot)
      .map((state) => {
        const status =
          state.team === 'ghost'
            ? state.respawnTimer > 0
              ? `RESPAWN ${Math.ceil(state.respawnTimer)}s`
              : 'AKTIF'
            : state.eliminated
              ? 'GUGUR'
              : `♥ ${state.lives}`;
        return `
          <div style="display:flex;justify-content:space-between;gap:18px;padding:7px 12px;border-radius:10px;background:${state.team === winner ? 'rgba(250,204,21,0.13)' : 'rgba(15,23,42,0.65)'};">
            <span style="font-weight:800;color:${state.player.color};">P${state.player.slot + 1} ${this.escapeHtml(state.player.name)}</span>
            <span style="font-weight:800;color:${state.team === 'ghost' ? '#fca5a5' : '#fde047'};">${state.team === 'ghost' ? 'GHOST' : 'PAC-MAN'} • ${status}</span>
          </div>
        `;
      })
      .join('');

    this.resultsEl.style.display = 'flex';
    this.resultsEl.innerHTML = `
      <div style="width:min(540px,100%);background:linear-gradient(160deg,#0f172a,#111c36);border:2px solid ${winnerColor};border-radius:22px;padding:26px 30px;color:#fff;box-shadow:0 28px 70px rgba(0,0,0,0.65);text-align:center;">
        <div style="font-size:12px;font-weight:900;letter-spacing:0.18em;color:${winnerColor};">RONDE ${this.roundNumber} SELESAI</div>
        <h2 style="margin:10px 0 4px;font-size:30px;font-weight:900;">${winnerName}</h2>
        <p style="margin:0 0 18px;color:#94a3b8;font-size:13px;">${reason}</p>
        <div style="display:flex;gap:10px;justify-content:center;margin-bottom:18px;font-size:13px;color:#cbd5e1;">
          <span>POWER ${this.powerPelletsEaten}/${this.powerPelletsTotal}</span>
          <span>•</span>
          <span>PAC ALIVE ${pacAlive}</span>
          <span>•</span>
          <span>GHOST ${aliveGhosts}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:22px;text-align:left;">${rows}</div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="pac-rematch" class="btn btn-primary">Ronde Baru</button>
          <button id="pac-hub" class="btn btn-secondary">Kembali ke Hub</button>
        </div>
      </div>
    `;

    this.resultsEl.querySelector('#pac-rematch')?.addEventListener('click', () => {
      this.roundNumber += 1;
      this.startRound();
    });
    this.resultsEl.querySelector('#pac-hub')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });
  }

  private alivePacCount(): number {
    return this.players.filter((state) => state.team === 'pac' && !state.eliminated).length;
  }

  private totalPacLives(): number {
    return this.players
      .filter((state) => state.team === 'pac')
      .reduce((sum, state) => sum + state.lives, 0);
  }

  private syncPlayers(): boolean {
    const live = (this.sdk?.getPlayers() ?? []).filter((player) => !player.isBot);
    const ids = new Set(live.map((player) => player.id));
    let changed = false;

    const before = this.players.length;
    this.players = this.players.filter((state) => {
      const keep = ids.has(state.player.id);
      if (!keep) changed = true;
      return keep;
    });
    if (this.players.length !== before) changed = true;

    for (const player of live) {
      const existing = this.players.find((state) => state.player.id === player.id);
      if (existing) {
        if (existing.player.slot !== player.slot) changed = true;
        existing.player = player;
      } else {
        this.players.push(this.createPlayerState(player));
        changed = true;
      }
    }

    return changed;
  }

  private createPlayerState(player: PlatformPlayer): PacPlayerState {
    const spawn = { ...PAC_SPAWNS[player.slot % PAC_SPAWNS.length] };
    const dir = this.openDirAt(spawn.x, spawn.y);
    return {
      player,
      team: 'pac',
      teamIndex: 0,
      x: spawn.x,
      y: spawn.y,
      dir,
      wantDir: dir,
      spawn,
      lives: PAC_LIVES,
      eliminated: false,
      respawnTimer: 0,
      invulnTimer: 1.2,
      poweredTimer: 0,
      dashTimer: 0,
      dashCooldown: 0,
      stunTimer: 0,
      prevBoost: false,
      hasMoved: false,
    };
  }

  private openDirAt(x: number, y: number): Direction {
    for (const dir of DIRECTIONS) {
      if (!isMazeWall(x + dir.x, y + dir.y)) return dir;
    }
    return DIR_RIGHT;
  }

  private sendTelemetry(): void {
    if (this.players.length === 0) return;
    const visible = this.players.filter(
      (state) => !state.eliminated && state.respawnTimer <= 0
    );
    const blips = visible.map((state) => ({
      slot: state.player.slot + (state.team === 'ghost' ? 100 : 0),
      x: Math.max(0, Math.min(255, Math.round((state.x / (PAC_MAZE_WIDTH - 1)) * 255))),
      z: Math.max(0, Math.min(255, Math.round((state.y / (PAC_MAZE_HEIGHT - 1)) * 255))),
    }));
    const pacAlive = this.alivePacCount();
    const ghostAlive = this.players.filter((state) => state.team === 'ghost').length;

    for (const state of this.players) {
      this.sdk?.sendTelemetry(state.player.id, {
        rank: pacAlive,
        totalPlayers: ghostAlive,
        lap: this.powerPelletsEaten,
        maxLaps: this.powerPelletsTotal,
        speedKmh: 0,
        turboCharge: Math.round((state.poweredTimer / POWER_SECONDS) * 100),
        turboZone: state.poweredTimer > 0 ? 2 : 0,
        itemId: state.team === 'ghost' ? 2 : 1,
        fruits: state.team === 'pac' ? state.lives : 0,
        boostCooldownSec: Math.ceil(state.dashCooldown),
        karts: blips,
      });
    }
  }

  private updateHud(): void {
    if (this.powerEl) this.powerEl.textContent = `${this.powerPelletsEaten}/${this.powerPelletsTotal}`;
    if (this.livesEl) this.livesEl.textContent = String(this.totalPacLives());
    if (this.ghostsEl) {
      this.ghostsEl.textContent = String(
        this.players.filter((state) => state.team === 'ghost').length
      );
    }
    if (this.waitingTextEl && this.phase === 'waiting') {
      this.waitingTextEl.textContent = `${this.players.length}/2`;
    }
    if (!this.boardEl) return;

    const sorted = [...this.players].sort((a, b) => a.player.slot - b.player.slot);
    if (sorted.length === 0) {
      this.boardEl.textContent = 'Menunggu pemain...';
      return;
    }

    this.boardEl.textContent = sorted
      .map((state) => {
        if (state.team === 'ghost') {
          return `P${state.player.slot + 1} GHOST${state.respawnTimer > 0 ? ' RESPAWN' : ''}`;
        }
        return `P${state.player.slot + 1} PAC ${state.eliminated ? 'OUT' : `♥${state.lives}`}`;
      })
      .join('   ');
  }

  private updateCountdown(): void {
    if (!this.countdownEl) return;
    const value = Math.ceil(Math.max(0, this.countdownTimer));
    this.countdownEl.textContent = value > 0 ? String(value) : 'GO!';
  }

  private showBanner(text: string, color: string, duration: number): void {
    if (!this.bannerEl) return;
    this.bannerEl.textContent = text;
    this.bannerEl.style.color = color;
    this.bannerEl.style.opacity = '1';
    this.bannerTimer = duration;
  }

  private updateBanner(dt: number): void {
    if (this.bannerTimer <= 0) return;
    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0 && this.bannerEl) this.bannerEl.style.opacity = '0';
  }

  private escapeHtml(value: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return value.replace(/[&<>"']/g, (char) => map[char] ?? char);
  }

  private handleResize = (): void => {
    this.layout();
  };

  private layout(): void {
    if (!this.container || !this.canvas) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const topBar = 72;
    const bottomPad = 14;
    const availableHeight = Math.max(220, height - topBar - bottomPad);
    const size = Math.max(220, Math.min(width * 0.9, availableHeight));
    const left = (width - size) / 2;
    const top = topBar + (availableHeight - size) / 2;

    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.style.left = `${left}px`;
    this.canvas.style.top = `${top}px`;
  }

  private buildMazeLayer(): void {
    const layer = document.createElement('canvas');
    layer.width = VIEW_SIZE;
    layer.height = VIEW_SIZE;
    const ctx = layer.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#050a16';
    ctx.fillRect(0, 0, VIEW_SIZE, VIEW_SIZE);

    const glow = ctx.createRadialGradient(
      VIEW_SIZE / 2,
      VIEW_SIZE / 2,
      VIEW_SIZE * 0.1,
      VIEW_SIZE / 2,
      VIEW_SIZE / 2,
      VIEW_SIZE * 0.72
    );
    glow.addColorStop(0, 'rgba(30,64,175,0.18)');
    glow.addColorStop(1, 'rgba(5,10,22,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, VIEW_SIZE, VIEW_SIZE);

    ctx.fillStyle = '#0a1730';
    for (let y = 0; y < PAC_MAZE_HEIGHT; y++) {
      for (let x = 0; x < PAC_MAZE_WIDTH; x++) {
        if (isMazeWall(x, y)) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    const isOpenEdge = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= PAC_MAZE_WIDTH || y >= PAC_MAZE_HEIGHT) return true;
      return !isMazeWall(x, y);
    };

    ctx.beginPath();
    for (let y = 0; y < PAC_MAZE_HEIGHT; y++) {
      for (let x = 0; x < PAC_MAZE_WIDTH; x++) {
        if (!isMazeWall(x, y)) continue;
        const left = x * TILE;
        const top = y * TILE;
        const right = left + TILE;
        const bottom = top + TILE;
        if (isOpenEdge(x, y - 1)) {
          ctx.moveTo(left, top);
          ctx.lineTo(right, top);
        }
        if (isOpenEdge(x, y + 1)) {
          ctx.moveTo(left, bottom);
          ctx.lineTo(right, bottom);
        }
        if (isOpenEdge(x - 1, y)) {
          ctx.moveTo(left, top);
          ctx.lineTo(left, bottom);
        }
        if (isOpenEdge(x + 1, y)) {
          ctx.moveTo(right, top);
          ctx.lineTo(right, bottom);
        }
      }
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#2563eb';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    this.mazeLayer = layer;
  }

  private render(time: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.mazeLayer) return;

    ctx.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE);
    ctx.drawImage(this.mazeLayer, 0, 0);
    this.drawPellets(ctx, time);
    this.drawPlayers(ctx, time);
  }

  private drawPellets(ctx: CanvasRenderingContext2D, time: number): void {
    const pulse = 1 + Math.sin(time * 5) * 0.16;

    ctx.fillStyle = '#fde68a';
    for (let y = 0; y < PAC_MAZE_HEIGHT; y++) {
      for (let x = 0; x < PAC_MAZE_WIDTH; x++) {
        if (this.pelletGrid[y * PAC_MAZE_WIDTH + x] !== PAC_PELLET) continue;
        ctx.beginPath();
        ctx.arc((x + 0.5) * TILE, (y + 0.5) * TILE, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let y = 0; y < PAC_MAZE_HEIGHT; y++) {
      for (let x = 0; x < PAC_MAZE_WIDTH; x++) {
        if (this.pelletGrid[y * PAC_MAZE_WIDTH + x] !== PAC_POWER_PELLET) continue;
        const px = (x + 0.5) * TILE;
        const py = (y + 0.5) * TILE;
        const radius = 8.5 * pulse;
        ctx.save();
        ctx.shadowColor = '#f472b6';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#f9a8d4';
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(251,207,232,0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawPlayers(ctx: CanvasRenderingContext2D, time: number): void {
    const anyPacPowered = this.players.some(
      (state) => state.team === 'pac' && state.poweredTimer > 0 && !state.eliminated
    );
    const visible = [...this.players]
      .filter((state) => !state.eliminated && state.respawnTimer <= 0)
      .sort((a, b) => a.y - b.y);

    for (const state of visible) {
      const radius = TILE * 0.35;
      const wobble = state.stunTimer > 0 ? Math.sin(time * 30) * 2 : 0;
      const px = (state.x + 0.5) * TILE + wobble;
      const py = (state.y + 0.5) * TILE;
      const color =
        state.team === 'ghost'
          ? GHOST_NEON_COLORS[state.teamIndex % GHOST_NEON_COLORS.length]
          : neonColor(
              state.player.color,
              PAC_FALLBACK_COLORS[state.player.slot % PAC_FALLBACK_COLORS.length]
            );

      if (state.team === 'ghost' && anyPacPowered) {
        ctx.save();
        ctx.globalAlpha = 0.3 + Math.abs(Math.sin(time * 12)) * 0.3;
        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, py, radius + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (state.team === 'pac' && state.poweredTimer > 0) {
        ctx.save();
        ctx.globalAlpha = 0.28 + Math.abs(Math.sin(time * 10)) * 0.24;
        ctx.fillStyle = '#f472b6';
        ctx.beginPath();
        ctx.arc(px, py, radius + 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (state.dashTimer > 0) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = color;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.arc(
            px - state.dir.x * i * 9,
            py - state.dir.y * i * 9,
            radius * (1 - i * 0.12),
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
        ctx.restore();
      }

      const blink = state.invulnTimer > 0 && Math.floor(time * 12) % 2 === 0;
      ctx.save();
      ctx.globalAlpha = blink ? 0.45 : 1;

      if (state.team === 'ghost') {
        this.drawGhostBody(ctx, px, py, radius, color, state.dir);
      } else {
        const angle = Math.atan2(state.dir.y, state.dir.x);
        const mouth =
          state.stunTimer > 0
            ? 0.12
            : 0.22 + Math.abs(Math.sin(time * 11 + state.player.slot)) * 0.3;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.arc(px, py, radius, angle + mouth, angle + Math.PI * 2 - mouth);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = state.poweredTimer > 0 ? 28 : 22;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = '#fffbe6';
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.stroke();
      }

      if (state.stunTimer > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('×  ×', px, py + 4);
      }
      ctx.restore();

      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '900 14px system-ui, sans-serif';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(2,6,23,0.92)';
      const label = `P${state.player.slot + 1}`;
      ctx.strokeText(label, px, py - radius - 10);
      ctx.fillStyle = color;
      ctx.fillText(label, px, py - radius - 10);
      ctx.restore();
    }
  }

  private drawGhostBody(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    radius: number,
    color: string,
    dir: Direction
  ): void {
    const bottom = py + radius * 0.7;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py - 2, radius, Math.PI, 0);
    ctx.lineTo(px + radius, bottom);
    const step = (radius * 2) / 4;
    for (let i = 0; i < 4; i++) {
      const x1 = px + radius - i * step;
      const x2 = x1 - step;
      const dip = i % 2 === 0 ? 6 : -5;
      ctx.quadraticCurveTo((x1 + x2) / 2, bottom + dip, x2, bottom);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(2,6,23,0.6)';
    ctx.stroke();
    ctx.restore();

    const eyeOffsetX = dir.x * 2.5;
    const eyeOffsetY = dir.y * 2.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px - 5.5, py - 4, 5.4, 0, Math.PI * 2);
    ctx.arc(px + 5.5, py - 4, 5.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.arc(px - 5.5 + eyeOffsetX, py - 4 + eyeOffsetY, 2.5, 0, Math.PI * 2);
    ctx.arc(px + 5.5 + eyeOffsetX, py - 4 + eyeOffsetY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
