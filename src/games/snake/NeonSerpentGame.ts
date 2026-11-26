import { BotLevel, HostSDKContext, PlatformGame, PlatformPlayer } from '../../sdk/GameSDK';
import { SerpentAudioEngine } from './SerpentAudioEngine';

const WORLD_W = 1800;
const WORLD_H = 1000;
const WALL = 46;
const PLAY_LEFT = WALL;
const PLAY_RIGHT = WORLD_W - WALL;
const PLAY_TOP = WALL;
const PLAY_BOTTOM = WORLD_H - WALL;

const HEAD_RADIUS = 17;
const BODY_RADIUS = 13;
const SEGMENT_SPACING = 9;
const BASE_MASS = 8;
const MIN_BOOST_MASS = 5.5;
const BASE_SPEED = 182;
const BOOST_MULTIPLIER = 1.8;
const BOOST_DRAIN_PER_SEC = 4;
const TURN_RATE = 8;
const KEYBOARD_TURN_RATE = 4.6;
const BOT_TURN_RATE = 6.2;
const ROUND_SECONDS = 120;
const COUNTDOWN_SECONDS = 3;
const RESPAWN_SECONDS = 3;
const PELLET_TARGET = 220;
const MAX_POINTS = 260;
const MAX_PELLETS = 800;

const SNAKE_FALLBACK_COLORS = [
  '#22d3ee',
  '#f472b6',
  '#a3e635',
  '#facc15',
  '#c084fc',
  '#fb923c',
  '#4ade80',
  '#38bdf8',
  '#f87171',
  '#e2e8f0',
];

const PELLET_COLORS = ['#f472b6', '#22d3ee', '#facc15', '#a3e635', '#c084fc'];

const COVER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050b17"/>
      <stop offset="100%" stop-color="#0b1a38"/>
    </linearGradient>
    <linearGradient id="snake" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#a3e635"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <g stroke="#1d4ed8" stroke-width="4" opacity="0.35" fill="none">
    <path d="M40 300 C 140 220, 90 120, 210 100 S 360 200, 470 150 S 520 40, 600 60"/>
  </g>
  <g fill="#fde68a">
    <circle cx="120" cy="90" r="5"/><circle cx="190" cy="150" r="4"/><circle cx="300" cy="80" r="5"/>
    <circle cx="390" cy="230" r="4"/><circle cx="520" cy="110" r="5"/><circle cx="560" cy="270" r="4"/>
  </g>
  <path d="M90 250 C 190 190, 190 130, 300 150 S 420 230, 500 180 S 550 90, 600 110"
        fill="none" stroke="#0b1a38" stroke-width="42" stroke-linecap="round"/>
  <path d="M90 250 C 190 190, 190 130, 300 150 S 420 230, 500 180 S 550 90, 600 110"
        fill="none" stroke="url(#snake)" stroke-width="28" stroke-linecap="round"/>
  <path d="M90 250 C 190 190, 190 130, 300 150 S 420 230, 500 180 S 550 90, 600 110"
        fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="7" stroke-linecap="round"/>
  <circle cx="602" cy="112" r="27" fill="#22d3ee"/>
  <circle cx="612" cy="102" r="6" fill="#05202a"/>
  <circle cx="611" cy="101" r="2" fill="#fff"/>
  <text x="320" y="330" text-anchor="middle" fill="#e2e8f0" font-family="system-ui,sans-serif" font-weight="900" font-size="27" letter-spacing="5">NEON SERPENT</text>
</svg>
`)}`;

interface Direction {
  x: number;
  y: number;
}

interface SnakePoint {
  x: number;
  y: number;
}

interface SnakeState {
  player: PlatformPlayer;
  x: number;
  y: number;
  angle: number;
  targetAngle: number;
  mass: number;
  points: SnakePoint[];
  alive: boolean;
  respawnTimer: number;
  invulnTimer: number;
  boosting: boolean;
  dropTimer: number;
  botThink: number;
  botBoostTimer: number;
}

interface Pellet {
  x: number;
  y: number;
  r: number;
  color: string;
  value: number;
}

type Phase = 'waiting' | 'countdown' | 'playing' | 'results';

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function targetSegments(mass: number): number {
  return Math.min(MAX_POINTS, Math.max(24, Math.round(16 + mass * 2.4)));
}

function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function rotateToward(from: number, to: number, maxStep: number): number {
  return from + clamp(shortestAngleDelta(from, to), -maxStep, maxStep);
}

export class NeonSerpentGame implements PlatformGame {
  readonly id = 'neon-serpent';
  readonly title = 'Neon Serpent';
  readonly subtitle =
    'Makan pellet, tumbuh panjang, boost, dan jegal kepala lawan. Arena slither-style untuk 2-10 pemain.';
  readonly badge = '2-10 PLAYER • ARENA';
  readonly accentColor = '#22d3ee';
  readonly coverImage = COVER_SVG;
  readonly minPlayers = 2;
  readonly maxPlayers = 10;
  readonly controllerLayout: 'arena-dpad' = 'arena-dpad';

  private container: HTMLElement | null = null;
  private sdk: HostSDKContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private arenaLayer: HTMLCanvasElement | null = null;
  private rafId: number | null = null;
  private lastTime = 0;

  private timeEl: HTMLElement | null = null;
  private playersEl: HTMLElement | null = null;
  private boardEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private countdownEl: HTMLElement | null = null;
  private waitingEl: HTMLElement | null = null;
  private resultsEl: HTMLElement | null = null;

  private players: SnakeState[] = [];
  private pellets: Pellet[] = [];
  private phase: Phase = 'waiting';
  private countdownTimer = COUNTDOWN_SECONDS;
  private timeLeft = ROUND_SECONDS;
  private roundNumber = 1;
  private bannerTimer = 0;
  private telemetryTimer = 0;
  private hudTimer = 0;

  private audio = new SerpentAudioEngine();
  private unlockAudioOnce = (): void => {
    this.audio.unlock();
  };

  mount(container: HTMLElement, sdk: HostSDKContext): void {
    this.container = container;
    this.sdk = sdk;
    this.players = [];
    this.pellets = [];
    this.phase = 'waiting';
    this.countdownTimer = COUNTDOWN_SECONDS;
    this.timeLeft = ROUND_SECONDS;
    this.roundNumber = 1;
    this.bannerTimer = 0;
    this.telemetryTimer = 0;
    this.hudTimer = 0;

    container.innerHTML = `
      <canvas id="serp-canvas" width="${WORLD_W}" height="${WORLD_H}" style="position:absolute;z-index:1;display:block;border-radius:20px;box-shadow:0 0 70px rgba(34,211,238,0.18),0 20px 60px rgba(0,0,0,0.6);"></canvas>

      <div class="game-topbar">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button id="serp-exit" class="btn btn-danger" style="padding:8px 14px;font-weight:900;">✕ Exit</button>
          <div class="hud-pill" style="color:#67e8f9;">⏱ <span id="serp-time">${ROUND_SECONDS}</span>s</div>
          <div class="hud-pill" style="color:#a3e635;">🐍 <span id="serp-players">0</span> pemain</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;min-width:0;">
          <button id="serp-mute" class="btn btn-secondary" style="padding:8px 12px;font-weight:800;font-size:12px;white-space:nowrap;">🔊 Musik ON</button>
          <div id="serp-board" class="hud-pill" style="max-width:48vw;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px;color:#cbd5e1;"></div>
        </div>
      </div>

      <div id="serp-banner" style="position:absolute;left:50%;top:15%;transform:translateX(-50%);z-index:25;pointer-events:none;opacity:0;transition:opacity 0.22s ease;font-size:clamp(18px,2.6vw,32px);font-weight:900;letter-spacing:0.05em;text-shadow:0 3px 18px rgba(0,0,0,0.85);text-align:center;white-space:nowrap;"></div>

      <div id="serp-countdown" style="position:absolute;inset:0;z-index:20;display:none;align-items:center;justify-content:center;pointer-events:none;font-size:clamp(70px,13vw,170px);font-weight:900;color:#22d3ee;text-shadow:0 0 34px rgba(34,211,238,0.8);">${COUNTDOWN_SECONDS}</div>

      <div id="serp-waiting" style="position:absolute;inset:0;z-index:45;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,0.75);backdrop-filter:blur(5px);padding:20px;pointer-events:none;">
        <div style="max-width:520px;text-align:center;color:#e2e8f0;">
          <div style="font-size:12px;font-weight:900;letter-spacing:0.2em;color:#22d3ee;">MENUNGGU PEMAIN</div>
          <div style="font-size:44px;font-weight:900;margin:8px 0 4px;">NEON SERPENT</div>
          <p style="margin:0;color:#94a3b8;font-size:14px;line-height:1.5;">Tambahkan pemain atau bot untuk mulai.</p>
        </div>
      </div>

      <div id="serp-results" style="position:absolute;inset:0;z-index:50;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,0.76);backdrop-filter:blur(7px);padding:20px;"></div>
    `;

    this.canvas = container.querySelector('#serp-canvas') as HTMLCanvasElement | null;
    this.ctx = this.canvas?.getContext('2d') ?? null;
    this.timeEl = container.querySelector('#serp-time');
    this.playersEl = container.querySelector('#serp-players');
    this.boardEl = container.querySelector('#serp-board');
    this.bannerEl = container.querySelector('#serp-banner');
    this.countdownEl = container.querySelector('#serp-countdown');
    this.waitingEl = container.querySelector('#serp-waiting');
    this.resultsEl = container.querySelector('#serp-results');

    this.buildArenaLayer();
    this.syncPlayers();
    this.layout();
    this.updateHud();

    this.audio.unlock();
    window.addEventListener('pointerdown', this.unlockAudioOnce, { once: true });
    window.addEventListener('keydown', this.unlockAudioOnce, { once: true });

    if (this.players.length > 0) this.startRound();
    else this.showWaiting();

    container.querySelector('#serp-exit')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });

    const soundBtn = container.querySelector('#serp-mute') as HTMLButtonElement | null;
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
    this.pellets = [];
    this.arenaLayer = null;
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
    if (this.players.length === 0) {
      if (this.phase !== 'waiting') this.showWaiting();
    } else if (this.phase === 'waiting') {
      this.startRound();
    } else if (rosterChanged && this.phase === 'playing') {
      this.showBanner('PEMAIN BARU MASUK!', '#22d3ee', 1);
    }

    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      this.updateCountdown();
      if (this.countdownTimer <= 0) {
        this.phase = 'playing';
        if (this.countdownEl) this.countdownEl.style.display = 'none';
        this.showBanner('GO!', '#22d3ee', 0.9);
      }
    } else if (this.phase === 'playing') {
      this.updatePlaying(dt);
    }

    this.updateBanner(dt);
    this.render(now / 1000);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private startRound(): void {
    if (this.players.length === 0) {
      this.showWaiting();
      return;
    }

    this.pellets = [];
    for (let i = 0; i < PELLET_TARGET; i++) this.spawnPellet();
    for (const state of this.players) this.resetSnake(state);

    this.timeLeft = ROUND_SECONDS;
    this.countdownTimer = COUNTDOWN_SECONDS;
    this.telemetryTimer = 0;
    this.hudTimer = 0;
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

  private showWaiting(): void {
    this.phase = 'waiting';
    this.audio.stopMusic();
    if (this.countdownEl) this.countdownEl.style.display = 'none';
    if (this.resultsEl) this.resultsEl.style.display = 'none';
    if (this.waitingEl) this.waitingEl.style.display = 'flex';
    this.updateHud();
  }

  private updatePlaying(dt: number): void {
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.finishRound();
      return;
    }

    for (const state of this.players) this.updateSnake(state, dt);
    this.checkCollisions();

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

  private updateSnake(state: SnakeState, dt: number): void {
    state.invulnTimer = Math.max(0, state.invulnTimer - dt);
    state.botBoostTimer = Math.max(0, state.botBoostTimer - dt);

    if (!state.alive) {
      state.respawnTimer -= dt;
      if (state.respawnTimer <= 0) {
        this.resetSnake(state);
        this.audio.playSpawn();
      }
      return;
    }

    let wantBoost = false;
    if (state.player.isBot) {
      this.updateBot(state, dt);
      wantBoost = state.botBoostTimer > 0;
    } else {
      const input = this.sdk?.getInput(state.player.id);
      if (input) {
        if (state.player.id === 'local_p1') {
          state.angle += input.steer * KEYBOARD_TURN_RATE * dt;
          state.targetAngle = state.angle;
        } else {
          state.targetAngle = input.steer * Math.PI;
        }
        wantBoost = input.boost;
      }
    }

    if (!state.player.isBot) {
      const turnRate = state.player.id === 'local_p1' ? 0 : TURN_RATE;
      if (turnRate > 0) state.angle = rotateToward(state.angle, state.targetAngle, turnRate * dt);
    } else {
      state.angle = rotateToward(state.angle, state.targetAngle, BOT_TURN_RATE * dt);
    }

    const canBoost = state.mass > MIN_BOOST_MASS;
    state.boosting = wantBoost && canBoost;
    if (state.boosting) {
      state.mass = Math.max(MIN_BOOST_MASS, state.mass - BOOST_DRAIN_PER_SEC * dt);
      state.dropTimer += dt;
      if (state.dropTimer >= 0.35) {
        state.dropTimer = 0;
        this.dropBoostPellet(state);
      }
      this.audio.playBoost();
    } else {
      state.dropTimer = 0;
    }

    const botSpeed = state.player.isBot ? this.botSpeedMultiplier(state.player.botLevel) : 1;
    const speed = BASE_SPEED * (state.boosting ? BOOST_MULTIPLIER : 1) * botSpeed;
    state.x += Math.cos(state.angle) * speed * dt;
    state.y += Math.sin(state.angle) * speed * dt;

    const head = { x: state.x, y: state.y };
    if (
      state.points.length === 0 ||
      Math.hypot(head.x - state.points[0].x, head.y - state.points[0].y) >= SEGMENT_SPACING
    ) {
      state.points.unshift(head);
    }

    const wantedPoints = targetSegments(state.mass);
    while (state.points.length > wantedPoints) state.points.pop();

    if (
      state.x < PLAY_LEFT + HEAD_RADIUS ||
      state.x > PLAY_RIGHT - HEAD_RADIUS ||
      state.y < PLAY_TOP + HEAD_RADIUS ||
      state.y > PLAY_BOTTOM - HEAD_RADIUS
    ) {
      this.killSnake(state, 'menabrak dinding');
      return;
    }

    this.eatPellets(state);
  }

  private botSpeedMultiplier(level: BotLevel | undefined): number {
    if (level === 'easy') return 0.88;
    if (level === 'hard') return 1.03;
    if (level === 'god') return 1.08;
    return 0.96;
  }

  private updateBot(state: SnakeState, dt: number): void {
    state.botThink -= dt;
    if (state.botThink > 0) return;
    state.botThink = 0.1 + Math.random() * 0.1;

    const centerX = (PLAY_LEFT + PLAY_RIGHT) / 2;
    const centerY = (PLAY_TOP + PLAY_BOTTOM) / 2;
    let targetAngle = Math.atan2(centerY - state.y, centerX - state.x);

    const edgeMargin = 180;
    const nearEdge =
      state.x < PLAY_LEFT + edgeMargin ||
      state.x > PLAY_RIGHT - edgeMargin ||
      state.y < PLAY_TOP + edgeMargin ||
      state.y > PLAY_BOTTOM - edgeMargin;

    if (!nearEdge) {
      let nearestPellet: Pellet | null = null;
      let bestDist = Infinity;
      for (const pellet of this.pellets) {
        const dist = Math.hypot(pellet.x - state.x, pellet.y - state.y);
        if (dist < bestDist) {
          bestDist = dist;
          nearestPellet = pellet;
        }
      }
      if (nearestPellet) {
        targetAngle = Math.atan2(nearestPellet.y - state.y, nearestPellet.x - state.x);
      }

      for (const other of this.players) {
        if (other === state || !other.alive) continue;
        const dist = Math.hypot(other.x - state.x, other.y - state.y);
        if (dist < 145) {
          targetAngle = Math.atan2(state.y - other.y, state.x - other.x);
          break;
        }
      }
    }

    state.targetAngle = targetAngle;
    if (state.mass > 20 && Math.random() < 0.05) state.botBoostTimer = 0.55;
  }

  private eatPellets(state: SnakeState): void {
    for (let i = this.pellets.length - 1; i >= 0; i--) {
      const pellet = this.pellets[i];
      if (Math.hypot(pellet.x - state.x, pellet.y - state.y) > HEAD_RADIUS + pellet.r + 2) {
        continue;
      }
      state.mass += pellet.value;
      this.pellets.splice(i, 1);
      this.spawnPellet();
      this.audio.playPickup();
    }
  }

  private checkCollisions(): void {
    for (let i = 0; i < this.players.length; i++) {
      const a = this.players[i];
      if (!a.alive || a.invulnTimer > 0) continue;

      for (let j = i + 1; j < this.players.length; j++) {
        const b = this.players[j];
        if (!b.alive || b.invulnTimer > 0) continue;

        const headDist = Math.hypot(a.x - b.x, a.y - b.y);
        if (headDist < HEAD_RADIUS * 1.8) {
          this.killSnake(a, 'tabrakan kepala');
          this.killSnake(b, 'tabrakan kepala');
          continue;
        }

        if (a.alive) {
          for (const point of b.points) {
            if (Math.hypot(a.x - point.x, a.y - point.y) < HEAD_RADIUS + BODY_RADIUS * 0.82) {
              this.killSnake(a, `menabrak ${b.player.name}`);
              break;
            }
          }
        }
        if (b.alive) {
          for (const point of a.points) {
            if (Math.hypot(b.x - point.x, b.y - point.y) < HEAD_RADIUS + BODY_RADIUS * 0.82) {
              this.killSnake(b, `menabrak ${a.player.name}`);
              break;
            }
          }
        }
      }
    }
  }

  private killSnake(state: SnakeState, reason: string): void {
    if (!state.alive) return;
    state.alive = false;
    state.boosting = false;
    state.respawnTimer = RESPAWN_SECONDS;
    this.dropBodyPellets(state);
    state.points = [];
    this.audio.playDeath();
    this.showBanner(`${state.player.name} ${reason}!`, '#f87171', 1);
    this.sdk?.sendVibrate(state.player.id, [120, 45, 150]);
  }

  private resetSnake(state: SnakeState): void {
    state.mass = BASE_MASS;
    state.alive = true;
    state.respawnTimer = 0;
    state.invulnTimer = 1.5;
    state.boosting = false;
    state.dropTimer = 0;
    state.botThink = 0;
    state.botBoostTimer = 0;

    const spawn = this.findSafeSpawn();
    state.x = spawn.x;
    state.y = spawn.y;
    const centerX = (PLAY_LEFT + PLAY_RIGHT) / 2;
    const centerY = (PLAY_TOP + PLAY_BOTTOM) / 2;
    state.angle = Math.atan2(centerY - spawn.y, centerX - spawn.x);
    state.targetAngle = state.angle;

    state.points = [];
    const count = Math.min(20, targetSegments(state.mass));
    for (let i = 0; i < count; i++) {
      state.points.push({
        x: state.x - Math.cos(state.angle) * i * SEGMENT_SPACING,
        y: state.y - Math.sin(state.angle) * i * SEGMENT_SPACING,
      });
    }
  }

  private findSafeSpawn(): Direction {
    const marginX = 230;
    const marginY = 230;
    let best = { x: (PLAY_LEFT + PLAY_RIGHT) / 2, y: (PLAY_TOP + PLAY_BOTTOM) / 2 };
    let bestDistance = -1;

    for (let attempt = 0; attempt < 24; attempt++) {
      const x = PLAY_LEFT + marginX + Math.random() * (PLAY_RIGHT - PLAY_LEFT - marginX * 2);
      const y = PLAY_TOP + marginY + Math.random() * (PLAY_BOTTOM - PLAY_TOP - marginY * 2);
      let minDistance = Infinity;

      for (const other of this.players) {
        if (!other.alive) continue;
        minDistance = Math.min(minDistance, Math.hypot(other.x - x, other.y - y));
        for (let i = 0; i < other.points.length; i += 3) {
          const point = other.points[i];
          minDistance = Math.min(minDistance, Math.hypot(point.x - x, point.y - y));
        }
      }

      if (minDistance > bestDistance) {
        bestDistance = minDistance;
        best = { x, y };
      }
      if (minDistance > 260) break;
    }

    return best;
  }

  private spawnPellet(): void {
    if (this.pellets.length >= MAX_PELLETS) return;
    const color = PELLET_COLORS[Math.floor(Math.random() * PELLET_COLORS.length)];
    this.pellets.push({
      x: PLAY_LEFT + 18 + Math.random() * (PLAY_RIGHT - PLAY_LEFT - 36),
      y: PLAY_TOP + 18 + Math.random() * (PLAY_BOTTOM - PLAY_TOP - 36),
      r: 4 + Math.random() * 2.2,
      color,
      value: 1,
    });
  }

  private dropBoostPellet(state: SnakeState): void {
    const tail = state.points[state.points.length - 1];
    if (!tail || this.pellets.length >= MAX_PELLETS) return;
    this.pellets.push({
      x: tail.x + (Math.random() - 0.5) * 14,
      y: tail.y + (Math.random() - 0.5) * 14,
      r: 5,
      color: '#a3e635',
      value: 1,
    });
  }

  private dropBodyPellets(state: SnakeState): void {
    for (let i = 0; i < state.points.length; i += 4) {
      if (this.pellets.length >= MAX_PELLETS) break;
      const point = state.points[i];
      this.pellets.push({
        x: point.x + (Math.random() - 0.5) * 18,
        y: point.y + (Math.random() - 0.5) * 18,
        r: 5.5,
        color: '#facc15',
        value: 1,
      });
    }
  }

  private finishRound(): void {
    if (this.phase === 'results') return;
    this.phase = 'results';
    this.audio.stopMusic();
    this.audio.playWin();
    if (this.countdownEl) this.countdownEl.style.display = 'none';
    if (this.waitingEl) this.waitingEl.style.display = 'none';
    this.updateHud();
    this.showResults();
    for (const state of this.players) this.sdk?.sendVibrate(state.player.id, [60, 40, 60]);
  }

  private showResults(): void {
    if (!this.resultsEl) return;
    const sorted = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.mass - a.mass;
    });
    const winner = sorted[0];
    const rows = sorted
      .map((state, index) => {
        const status = state.alive ? `${Math.round(state.mass)}` : 'MATI';
        return `
          <div style="display:flex;justify-content:space-between;gap:18px;padding:7px 12px;border-radius:10px;background:${index === 0 ? 'rgba(34,211,238,0.13)' : 'rgba(15,23,42,0.65)'};">
            <span style="font-weight:800;color:${this.snakeColor(state)};">${index + 1}. P${state.player.slot + 1} ${this.escapeHtml(state.player.name)}</span>
            <span style="font-weight:900;color:#f8fafc;">${status}</span>
          </div>
        `;
      })
      .join('');

    this.resultsEl.style.display = 'flex';
    this.resultsEl.innerHTML = `
      <div style="width:min(540px,100%);background:linear-gradient(160deg,#0f172a,#111c36);border:2px solid #22d3ee;border-radius:22px;padding:26px 30px;color:#fff;box-shadow:0 28px 70px rgba(0,0,0,0.65);text-align:center;">
        <div style="font-size:12px;font-weight:900;letter-spacing:0.18em;color:#22d3ee;">RONDE ${this.roundNumber} SELESAI</div>
        <h2 style="margin:10px 0 4px;font-size:30px;font-weight:900;">🏆 ${winner ? this.escapeHtml(winner.player.name) : 'Tidak ada pemenang'}</h2>
        <p style="margin:0 0 18px;color:#94a3b8;font-size:13px;">Panjang ular tertinggi menang.</p>
        <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:22px;text-align:left;">${rows}</div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="serp-rematch" class="btn btn-primary">Ronde Baru</button>
          <button id="serp-hub" class="btn btn-secondary">Kembali ke Hub</button>
        </div>
      </div>
    `;

    this.resultsEl.querySelector('#serp-rematch')?.addEventListener('click', () => {
      this.roundNumber += 1;
      this.startRound();
    });
    this.resultsEl.querySelector('#serp-hub')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });
  }

  private syncPlayers(): boolean {
    const live = this.sdk?.getPlayers() ?? [];
    const ids = new Set(live.map((player) => player.id));
    let changed = false;

    const before = this.players.length;
    this.players = this.players.filter((state) => {
      const keep = ids.has(state.player.id);
      if (!keep) {
        if (state.alive) this.dropBodyPellets(state);
        changed = true;
      }
      return keep;
    });
    if (this.players.length !== before) changed = true;

    for (const player of live) {
      const existing = this.players.find((state) => state.player.id === player.id);
      if (existing) {
        existing.player = player;
      } else {
        const state = this.createPlayerState(player);
        this.players.push(state);
        if (this.phase === 'playing' || this.phase === 'countdown') this.resetSnake(state);
        changed = true;
      }
    }

    return changed;
  }

  private createPlayerState(player: PlatformPlayer): SnakeState {
    return {
      player,
      x: (PLAY_LEFT + PLAY_RIGHT) / 2,
      y: (PLAY_TOP + PLAY_BOTTOM) / 2,
      angle: 0,
      targetAngle: 0,
      mass: BASE_MASS,
      points: [],
      alive: false,
      respawnTimer: 0,
      invulnTimer: 0,
      boosting: false,
      dropTimer: 0,
      botThink: 0,
      botBoostTimer: 0,
    };
  }

  private sendTelemetry(): void {
    if (this.players.length === 0) return;
    const sorted = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.mass - a.mass;
    });
    const visible = this.players.filter((state) => state.alive);
    const blips = visible.map((state) => ({
      slot: state.player.slot,
      x: clamp(Math.round(((state.x - PLAY_LEFT) / (PLAY_RIGHT - PLAY_LEFT)) * 255), 0, 255),
      z: clamp(Math.round(((state.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * 255), 0, 255),
    }));

    for (const state of this.players) {
      const fuel = clamp((state.mass - MIN_BOOST_MASS) / 12, 0, 1) * 100;
      this.sdk?.sendTelemetry(state.player.id, {
        rank: sorted.indexOf(state) + 1,
        totalPlayers: this.players.length,
        lap: Math.max(0, Math.ceil(this.timeLeft)),
        maxLaps: ROUND_SECONDS,
        speedKmh: Math.min(255, Math.round(state.mass)),
        turboCharge: Math.round(fuel),
        turboZone: state.boosting ? 2 : 0,
        itemId: state.alive ? 1 : 0,
        fruits: 0,
        boostCooldownSec: state.alive ? 0 : Math.ceil(state.respawnTimer),
        karts: blips,
      });
    }
  }

  private updateHud(): void {
    if (this.timeEl) this.timeEl.textContent = String(Math.max(0, Math.ceil(this.timeLeft)));
    if (this.playersEl) this.playersEl.textContent = String(this.players.length);
    if (!this.boardEl) return;

    const sorted = [...this.players].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.mass - a.mass;
    });
    if (sorted.length === 0) {
      this.boardEl.textContent = 'Menunggu pemain...';
      return;
    }
    this.boardEl.textContent = sorted
      .slice(0, 4)
      .map(
        (state, index) =>
          `${index + 1}. P${state.player.slot + 1} ${state.player.name} ${Math.round(state.mass)}`
      )
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

  private snakeColor(state: SnakeState): string {
    return neonColor(
      state.player.color,
      SNAKE_FALLBACK_COLORS[state.player.slot % SNAKE_FALLBACK_COLORS.length]
    );
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
    const availableWidth = Math.max(220, width * 0.92);
    const scale = Math.min(availableWidth / WORLD_W, availableHeight / WORLD_H);
    const cssWidth = WORLD_W * scale;
    const cssHeight = WORLD_H * scale;
    const left = (width - cssWidth) / 2;
    const top = topBar + (availableHeight - cssHeight) / 2;

    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.style.left = `${left}px`;
    this.canvas.style.top = `${top}px`;
  }

  private buildArenaLayer(): void {
    const layer = document.createElement('canvas');
    layer.width = WORLD_W;
    layer.height = WORLD_H;
    const ctx = layer.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#050b17';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    const glow = ctx.createRadialGradient(
      WORLD_W / 2,
      WORLD_H / 2,
      80,
      WORLD_W / 2,
      WORLD_H / 2,
      WORLD_W * 0.72
    );
    glow.addColorStop(0, 'rgba(14,116,144,0.22)');
    glow.addColorStop(1, 'rgba(5,11,23,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.strokeStyle = 'rgba(34,211,238,0.07)';
    ctx.lineWidth = 1;
    for (let x = PLAY_LEFT; x <= PLAY_RIGHT; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, PLAY_TOP);
      ctx.lineTo(x, PLAY_BOTTOM);
      ctx.stroke();
    }
    for (let y = PLAY_TOP; y <= PLAY_BOTTOM; y += 64) {
      ctx.beginPath();
      ctx.moveTo(PLAY_LEFT, y);
      ctx.lineTo(PLAY_RIGHT, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#0891b2';
    ctx.lineWidth = 7;
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 22;
    ctx.strokeRect(PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 2;
    ctx.strokeRect(PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP);

    this.arenaLayer = layer;
  }

  private render(time: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.arenaLayer) return;

    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    ctx.drawImage(this.arenaLayer, 0, 0);
    this.drawPellets(ctx, time);
    this.drawSnakes(ctx, time);
  }

  private drawPellets(ctx: CanvasRenderingContext2D, time: number): void {
    const pulse = 0.85 + Math.sin(time * 4) * 0.15;
    ctx.save();
    ctx.shadowBlur = 9;
    for (const pellet of this.pellets) {
      ctx.shadowColor = pellet.color;
      ctx.fillStyle = pellet.color;
      ctx.beginPath();
      ctx.arc(pellet.x, pellet.y, pellet.r * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSnakes(ctx: CanvasRenderingContext2D, time: number): void {
    const visible = this.players
      .filter((state) => state.alive)
      .sort((a, b) => a.mass - b.mass);

    for (const state of visible) {
      const color = this.snakeColor(state);
      const blink = state.invulnTimer > 0 && Math.floor(time * 12) % 2 === 0;
      ctx.save();
      ctx.globalAlpha = blink ? 0.45 : 1;

      if (state.points.length > 1) {
        ctx.beginPath();
        const tail = state.points[state.points.length - 1];
        ctx.moveTo(tail.x, tail.y);
        for (let i = state.points.length - 2; i >= 0; i--) {
          const point = state.points[i];
          ctx.lineTo(point.x, point.y);
        }
        ctx.lineTo(state.x, state.y);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = BODY_RADIUS * 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = state.boosting ? 28 : 17;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 5;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        for (let i = 4; i < state.points.length; i += 7) {
          const point = state.points[i];
          ctx.beginPath();
          ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.shadowColor = color;
      ctx.shadowBlur = state.boosting ? 28 : 18;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(state.x, state.y, HEAD_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = '#e6fffb';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      const perp = state.angle + Math.PI / 2;
      const eyeForward = HEAD_RADIUS * 0.38;
      const eyeSide = HEAD_RADIUS * 0.36;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(
        state.x + Math.cos(state.angle) * eyeForward + Math.cos(perp) * eyeSide,
        state.y + Math.sin(state.angle) * eyeForward + Math.sin(perp) * eyeSide,
        4.6,
        0,
        Math.PI * 2
      );
      ctx.arc(
        state.x + Math.cos(state.angle) * eyeForward - Math.cos(perp) * eyeSide,
        state.y + Math.sin(state.angle) * eyeForward - Math.sin(perp) * eyeSide,
        4.6,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.beginPath();
      ctx.arc(
        state.x + Math.cos(state.angle) * (eyeForward + 2) + Math.cos(perp) * eyeSide,
        state.y + Math.sin(state.angle) * (eyeForward + 2) + Math.sin(perp) * eyeSide,
        2,
        0,
        Math.PI * 2
      );
      ctx.arc(
        state.x + Math.cos(state.angle) * (eyeForward + 2) - Math.cos(perp) * eyeSide,
        state.y + Math.sin(state.angle) * (eyeForward + 2) - Math.sin(perp) * eyeSide,
        2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '900 14px system-ui, sans-serif';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(2,6,23,0.95)';
      const label = `P${state.player.slot + 1}`;
      ctx.strokeText(label, state.x, state.y - HEAD_RADIUS - 12);
      ctx.fillStyle = color;
      ctx.fillText(label, state.x, state.y - HEAD_RADIUS - 12);
      ctx.restore();
    }
  }
}
