import { ControllerInputState } from '../../net/BinaryProtocol';
import { HostSDKContext, PlatformGame } from '../../sdk/GameSDK';
import { BotWorld, updateBotAI } from './BomberAI';
import {
  ARENA_IDS,
  ArenaRuntime,
  BOMBER_ARENA_BY_ID,
  BOMBER_ARENAS,
  BomberArenaChoice,
  BomberArenaDef,
  BomberArenaId,
  arenaIndexOf,
  bombAtTile,
  buildArenaRuntime,
  computeBombBlast,
  computeDangerTiles,
  computeHazardTiles,
  indexOfTile,
  isBomberArenaId,
  renderArenaPreviewSvg,
  tileAt,
} from './BomberArenas';
import { BomberAudioEngine } from './BomberAudioEngine';
import { BomberRenderer } from './BomberRenderer';
import { BOMBER_CSS } from './BomberStyles';
import {
  BOMBER_BASE_BOMBS,
  BOMBER_BASE_RANGE,
  BOMBER_BLAST_SECONDS,
  BOMBER_BOMB_FUSE,
  BOMBER_COUNTDOWN_SECONDS,
  BOMBER_DASH_COOLDOWN,
  BOMBER_DASH_MULTIPLIER,
  BOMBER_DASH_SECONDS,
  BOMBER_GRID_H,
  BOMBER_GRID_W,
  BOMBER_MAX_BOMBS,
  BOMBER_MAX_PARTICLES,
  BOMBER_MAX_PLAYERS,
  BOMBER_MAX_RANGE,
  BOMBER_MAX_ROUNDS,
  BOMBER_MAX_SPEED,
  BOMBER_PAD_MULTIPLIER,
  BOMBER_PAD_SECONDS,
  BOMBER_RESPAWN_SECONDS,
  BOMBER_ROUND_END_SECONDS,
  BOMBER_ROUND_WIN_TARGET,
  BOMBER_SHIELD_SECONDS,
  BOMBER_SPAWN_PROTECT_SECONDS,
  BOMBER_SPEED_STEP,
  BOMBER_START_LIVES,
  BomberBlast,
  BomberBomb,
  BomberParticle,
  BomberPhase,
  BomberPlayerState,
  BomberPowerup,
  BomberRoundReason,
  DIRECTION_VECTORS,
  Direction,
  HazardRuntime,
  POWERUP_INFO,
  PowerupType,
  SPAWN_POINTS,
  TILE_CRATE,
  TILE_EMPTY,
  TILE_PAD,
  Vec2,
  directionFromVector,
  makePlayerState,
} from './BomberState';
import { NO_ARENA_INDEX, packBomberTelemetry } from './BomberTelemetry';

const COVER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs>
    <radialGradient id="bmbBg" cx="50%" cy="20%" r="85%">
      <stop offset="0" stop-color="#7c2d12"/>
      <stop offset="0.5" stop-color="#1e1b4b"/>
      <stop offset="1" stop-color="#05070d"/>
    </radialGradient>
    <linearGradient id="bmbBomb" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f97316"/>
      <stop offset="1" stop-color="#b91c1c"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bmbBg)"/>
  <g opacity="0.22" stroke="#f8fafc" stroke-width="1">
    <path d="M0 60h640M0 120h640M0 180h640M0 240h640M0 300h640"/>
    <path d="M80 0v360M160 0v360M240 0v360M320 0v360M400 0v360M480 0v360M560 0v360"/>
  </g>
  <g>
    <rect x="70" y="70" width="64" height="64" rx="9" fill="#78350f" stroke="#f59e0b" stroke-width="4"/>
    <path d="M78 78l48 48M126 78l-48 48" stroke="#f59e0b" stroke-width="4" opacity="0.7"/>
    <rect x="506" y="238" width="64" height="64" rx="9" fill="#78350f" stroke="#f59e0b" stroke-width="4"/>
    <path d="M514 246l48 48M562 246l-48 48" stroke="#f59e0b" stroke-width="4" opacity="0.7"/>
    <rect x="154" y="226" width="58" height="58" rx="8" fill="#334155" stroke="#64748b" stroke-width="4"/>
    <rect x="428" y="76" width="58" height="58" rx="8" fill="#334155" stroke="#64748b" stroke-width="4"/>
  </g>
  <g transform="translate(255 130)">
    <circle cx="65" cy="82" r="46" fill="url(#bmbBomb)" stroke="#111827" stroke-width="6"/>
    <circle cx="48" cy="64" r="12" fill="rgba(255,255,255,0.45)"/>
    <path d="M82 38c18-8 20-26 11-39" fill="none" stroke="#fbbf24" stroke-width="7" stroke-linecap="round"/>
    <circle cx="93" cy="0" r="10" fill="#fde68a"/>
  </g>
  <g transform="translate(137 150)">
    <rect width="44" height="44" rx="12" fill="#22d3ee" stroke="#f8fafc" stroke-width="3"/>
    <circle cx="16" cy="18" r="3" fill="#0f172a"/><circle cx="29" cy="18" r="3" fill="#0f172a"/>
  </g>
  <g transform="translate(470 160)">
    <rect width="44" height="44" rx="12" fill="#f472b6" stroke="#f8fafc" stroke-width="3"/>
    <circle cx="16" cy="18" r="3" fill="#0f172a"/><circle cx="29" cy="18" r="3" fill="#0f172a"/>
  </g>
  <g transform="translate(318 178)">
    <circle cx="0" cy="0" r="78" fill="none" stroke="#f97316" stroke-width="3" opacity="0.3"/>
    <circle cx="0" cy="0" r="112" fill="none" stroke="#f97316" stroke-width="2" opacity="0.16"/>
  </g>
  <text x="320" y="310" text-anchor="middle" fill="#f8fafc" font-family="Inter, system-ui, sans-serif" font-size="38" font-weight="900" letter-spacing="3">BOMBER PARTY</text>
  <text x="320" y="336" text-anchor="middle" fill="#fdba74" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="800" letter-spacing="4">4 ARENAS • LAST ONE STANDING</text>
</svg>
`)}`;

const BOMBER_TILE_PX = 50;
const POWERUP_ORDER: PowerupType[] = ['bomb', 'fire', 'speed', 'shield'];

interface BannerState {
  text: string;
  color: string;
  timer: number;
}

export class BomberGame implements PlatformGame {
  readonly id = 'bomber-party';
  readonly title = 'Bomber Party';
  readonly subtitle =
    'Pilih satu dari empat arena, jatuhkan bom, hancurkan peti, dan jadilah yang terakhir bertahan. Ledakan berantai, perisai, dan lava siap mengacaukan pertarungan!';
  readonly badge = '2-10 PLAYER • 4 ARENA';
  readonly accentColor = '#f97316';
  readonly coverImage = COVER_SVG;
  readonly minPlayers = 2;
  readonly maxPlayers = BOMBER_MAX_PLAYERS;
  readonly controllerLayout: 'arena-dpad' = 'arena-dpad';

  private container: HTMLElement | null = null;
  private sdk: HostSDKContext | null = null;
  private audio = new BomberAudioEngine();
  private renderer: BomberRenderer | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private players: BomberPlayerState[] = [];
  private bombs: BomberBomb[] = [];
  private blasts: BomberBlast[] = [];
  private powerups: BomberPowerup[] = [];
  private particles: BomberParticle[] = [];
  private arena: ArenaRuntime | null = null;
  private hazard: HazardRuntime = {
    active: false,
    phase: 'idle',
    timer: 0,
    eruptionTiles: [],
  };

  private phase: BomberPhase = 'arena-select';
  private arenaChoice: BomberArenaChoice = 'palm-cove';
  private currentArenaId: BomberArenaId | null = null;
  private round = 0;
  private roundTimer = 0;
  private countdown = 0;
  private phaseTimer = 0;
  private lastCountdownSecond = 0;
  private roundWinners: number[] = [];
  private roundReason: BomberRoundReason = 'draw';
  private matchChampions: BomberPlayerState[] = [];
  private lastRosterKey = '';
  private roundCardKey = '';
  private matchCardKey = '';

  private nextBombId = 1;
  private nextPowerupId = 1;
  private rafId: number | null = null;
  private lastTime = 0;
  private hudTimer = 0;
  private telemetryTimer = 0;
  private shake = 0;
  private banner: BannerState = { text: '', color: '#f8fafc', timer: 0 };

  private canvasEl: HTMLCanvasElement | null = null;
  private arenaWrapEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private countdownEl: HTMLElement | null = null;
  private selectOverlayEl: HTMLElement | null = null;
  private arenaGridEl: HTMLElement | null = null;
  private selectRosterEl: HTMLElement | null = null;
  private startBtnEl: HTMLButtonElement | null = null;
  private selectNoteEl: HTMLElement | null = null;
  private roundOverlayEl: HTMLElement | null = null;
  private roundCardEl: HTMLElement | null = null;
  private matchOverlayEl: HTMLElement | null = null;
  private matchCardEl: HTMLElement | null = null;
  private arenaPillEl: HTMLElement | null = null;
  private roundPillEl: HTMLElement | null = null;
  private timerPillEl: HTMLElement | null = null;
  private alivePillEl: HTMLElement | null = null;
  private muteBtnEl: HTMLButtonElement | null = null;
  private sideArenaEl: HTMLElement | null = null;
  private scoreboardEl: HTMLElement | null = null;

  private unlockAudioOnce = (): void => {
    this.audio.unlock();
  };

  mount(container: HTMLElement, sdk: HostSDKContext): void {
    this.container = container;
    this.sdk = sdk;
    this.players = [];
    this.bombs = [];
    this.blasts = [];
    this.powerups = [];
    this.particles = [];
    this.arena = null;
    this.hazard = { active: false, phase: 'idle', timer: 0, eruptionTiles: [] };
    this.phase = 'arena-select';
    this.currentArenaId = null;
    this.round = 0;
    this.roundTimer = 0;
    this.countdown = 0;
    this.phaseTimer = 0;
    this.roundWinners = [];
    this.roundReason = 'draw';
    this.matchChampions = [];
    this.lastRosterKey = '';
    this.roundCardKey = '';
    this.matchCardKey = '';
    this.nextBombId = 1;
    this.nextPowerupId = 1;
    this.shake = 0;
    this.hudTimer = 0;
    this.telemetryTimer = 0;
    this.banner = { text: '', color: '#f8fafc', timer: 0 };

    container.innerHTML = `
      <style>${BOMBER_CSS}</style>
      <div class="bmb-stage">
        <div class="game-topbar">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button type="button" class="btn btn-danger" data-bmb-action="exit" style="padding:8px 14px;font-weight:900;">Keluar</button>
            <div class="hud-pill" id="bmb-arena-pill">PILIH ARENA</div>
            <div class="hud-pill" id="bmb-round-pill">RONDE -</div>
            <div class="hud-pill" id="bmb-timer-pill">WAKTU --</div>
            <div class="hud-pill" id="bmb-alive-pill">0 HIDUP</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button type="button" class="btn btn-secondary" id="bmb-mute" data-bmb-action="mute" style="padding:8px 12px;font-size:12px;font-weight:800;">Suara ON</button>
          </div>
        </div>

        <div class="bmb-layout">
          <div class="bmb-arena-wrap" id="bmb-arena-wrap">
            <canvas id="bmb-canvas"></canvas>
            <div class="bmb-countdown" id="bmb-countdown">3</div>
            <div class="bmb-banner" id="bmb-banner"></div>
          </div>
          <aside class="bmb-side">
            <div class="bmb-side-head"><span>Papan Skor</span><span id="bmb-side-arena">-</span></div>
            <div id="bmb-scoreboard" style="display:flex;flex-direction:column;gap:6px;"></div>
            <div style="margin-top:auto;font-size:10px;line-height:1.45;color:#64748b;">
              Gerak: D-Pad HP / WASD. Bom: A / E. Dash: B / Shift.
            </div>
          </aside>
        </div>

        <div class="bmb-overlay" id="bmb-select-overlay">
          <div class="bmb-select-card">
            <div class="bmb-select-head">
              <div>
                <div class="bmb-kicker">Bomber Party</div>
                <h2 class="bmb-select-title">Pilih Arena</h2>
                <p class="bmb-select-sub">
                  Empat arena dengan aturan dan bahaya berbeda. Pilih satu arena, kumpulkan pemain,
                  lalu mulai pertandingan. Setiap ronde dimenangkan oleh pemain terakhir yang bertahan
                  atau semua penyintas saat waktu habis.
                </p>
              </div>
              <button type="button" class="btn btn-danger" data-bmb-action="exit" style="padding:8px 14px;">Keluar</button>
            </div>
            <div class="bmb-arena-grid" id="bmb-arena-grid"></div>
            <div class="bmb-select-footer">
              <div>
                <div style="font-size:11px;font-weight:900;letter-spacing:.12em;color:#94a3b8;text-transform:uppercase;margin-bottom:6px;">Pemain di Room</div>
                <div class="bmb-roster" id="bmb-select-roster"></div>
              </div>
              <div class="bmb-start-wrap">
                <button type="button" class="bmb-start-btn" id="bmb-start-btn" data-bmb-action="start">Mulai Pertandingan</button>
                <div class="bmb-select-note" id="bmb-select-note">Minimal 2 pemain.</div>
              </div>
            </div>
          </div>
        </div>

        <div class="bmb-overlay" id="bmb-round-overlay">
          <div class="bmb-result-card" id="bmb-round-card"></div>
        </div>
        <div class="bmb-overlay" id="bmb-match-overlay">
          <div class="bmb-result-card" id="bmb-match-card"></div>
        </div>
      </div>
    `;

    this.canvasEl = container.querySelector('#bmb-canvas');
    this.arenaWrapEl = container.querySelector('#bmb-arena-wrap');
    this.bannerEl = container.querySelector('#bmb-banner');
    this.countdownEl = container.querySelector('#bmb-countdown');
    this.selectOverlayEl = container.querySelector('#bmb-select-overlay');
    this.arenaGridEl = container.querySelector('#bmb-arena-grid');
    this.selectRosterEl = container.querySelector('#bmb-select-roster');
    this.startBtnEl = container.querySelector('#bmb-start-btn');
    this.selectNoteEl = container.querySelector('#bmb-select-note');
    this.roundOverlayEl = container.querySelector('#bmb-round-overlay');
    this.roundCardEl = container.querySelector('#bmb-round-card');
    this.matchOverlayEl = container.querySelector('#bmb-match-overlay');
    this.matchCardEl = container.querySelector('#bmb-match-card');
    this.arenaPillEl = container.querySelector('#bmb-arena-pill');
    this.roundPillEl = container.querySelector('#bmb-round-pill');
    this.timerPillEl = container.querySelector('#bmb-timer-pill');
    this.alivePillEl = container.querySelector('#bmb-alive-pill');
    this.muteBtnEl = container.querySelector('#bmb-mute');
    this.sideArenaEl = container.querySelector('#bmb-side-arena');
    this.scoreboardEl = container.querySelector('#bmb-scoreboard');

    this.buildArenaCards();
    if (this.canvasEl) {
      this.renderer = new BomberRenderer(this.canvasEl);
    }

    container.addEventListener('click', this.handleClick);
    window.addEventListener('pointerdown', this.unlockAudioOnce, { once: true });
    window.addEventListener('keydown', this.unlockAudioOnce, { once: true });
    window.addEventListener('resize', this.handleResize);
    if (typeof ResizeObserver !== 'undefined' && this.arenaWrapEl) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.arenaWrapEl);
    }

    this.audio.unlock();
    this.syncPlayers(true);
    this.syncArenaSelectionUi();
    this.renderHud();
    this.sendAllTelemetry();
    this.handleResize();

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  unmount(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('pointerdown', this.unlockAudioOnce);
    window.removeEventListener('keydown', this.unlockAudioOnce);
    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.container?.removeEventListener('click', this.handleClick);
    this.audio.destroy();
    this.renderer?.destroy();
    this.renderer = null;
    this.players = [];
    this.bombs = [];
    this.blasts = [];
    this.powerups = [];
    this.particles = [];
    this.arena = null;
    this.canvasEl = null;
    if (this.container) this.container.innerHTML = '';
    this.container = null;
    this.sdk = null;
  }

  private handleResize = (): void => {
    this.renderer?.resize();
  };

  private handleClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-bmb-card],[data-bmb-action]'
    );
    if (!target) return;
    target.blur();

    const card = target.dataset.bmbCard;
    if (card) {
      if (card === 'random') {
        this.arenaChoice = 'random';
      } else if (isBomberArenaId(card)) {
        this.arenaChoice = card;
      }
      this.syncArenaSelectionUi();
      this.renderHud();
      this.sendAllTelemetry();
      return;
    }

    const action = target.dataset.bmbAction;
    if (!action) return;
    if (action === 'exit') {
      this.sdk?.exitToHub();
    } else if (action === 'start') {
      this.startFromSelection();
    } else if (action === 'mute') {
      this.toggleMute();
    } else if (action === 'rematch') {
      if (this.phase === 'match-over' && this.currentArenaId) {
        this.startMatch(this.currentArenaId);
      }
    } else if (action === 'change-arena') {
      if (this.phase === 'match-over') this.enterArenaSelect();
    } else if (action === 'skip-round') {
      if (this.phase === 'round-end') this.advanceAfterRound();
    }
  };

  private loop = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    this.syncPlayers(false);

    if (this.phase === 'countdown') {
      this.updateCountdown(dt);
    } else if (this.phase === 'playing') {
      this.updatePlaying(dt);
    } else if (this.phase === 'round-end') {
      this.updateRoundEnd(dt);
    } else if (this.phase === 'match-over') {
      this.updateBlasts(dt);
      this.updateParticles(dt);
    }

    this.banner.timer = Math.max(0, this.banner.timer - dt);
    this.shake = Math.max(0, this.shake - dt * 26);

    this.hudTimer += dt;
    if (this.hudTimer >= 0.1) {
      this.hudTimer = 0;
      this.renderHud();
    }

    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 1 / 15) {
      this.telemetryTimer = 0;
      this.sendAllTelemetry();
    }

    this.renderFrame(now / 1000);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private buildArenaCards(): void {
    if (!this.arenaGridEl) return;
    const cards = BOMBER_ARENAS.map(
      (def) => `
      <button type="button" class="bmb-arena-card" data-bmb-card="${def.id}">
        <div class="bmb-arena-preview">${renderArenaPreviewSvg(def)}</div>
        <div class="bmb-arena-name"><span>${def.name}</span><span class="bmb-arena-diff">${def.difficulty}</span></div>
        <div class="bmb-arena-sub">${def.subtitle}</div>
        <div class="bmb-arena-tags">${def.tags
          .map((tag) => `<span class="bmb-tag">${tag}</span>`)
          .join('')}</div>
      </button>
    `
    ).join('');

    this.arenaGridEl.innerHTML =
      cards +
      `
      <button type="button" class="bmb-arena-card random" data-bmb-card="random">
        <div class="bmb-arena-random-visual">ACAK</div>
        <div class="bmb-arena-name"><span>Random Arena</span><span class="bmb-arena-diff">Kejutan</span></div>
        <div class="bmb-arena-sub">Pilih satu arena secara acak saat pertandingan dimulai.</div>
        <div class="bmb-arena-tags"><span class="bmb-tag">Acak</span><span class="bmb-tag">Semua Arena</span></div>
      </button>
    `;
  }

  private syncArenaSelectionUi(): void {
    if (this.arenaGridEl) {
      this.arenaGridEl.querySelectorAll<HTMLElement>('[data-bmb-card]').forEach((card) => {
        card.classList.toggle('selected', card.dataset.bmbCard === this.arenaChoice);
      });
    }

    const enough = this.players.length >= this.minPlayers;
    if (this.startBtnEl) {
      this.startBtnEl.disabled = !enough;
      this.startBtnEl.textContent = enough ? 'Mulai Pertandingan' : 'Butuh Minimal 2 Pemain';
    }
    if (this.selectNoteEl) {
      this.selectNoteEl.textContent = enough
        ? 'Host memilih arena. Kontroler HP otomatis masuk mode siaga.'
        : 'Tambah pemain atau bot untuk memulai pertandingan.';
    }
    if (this.selectRosterEl) {
      if (this.players.length === 0) {
        this.selectRosterEl.innerHTML =
          '<span style="font-size:12px;color:#94a3b8;">Belum ada pemain di room.</span>';
      } else {
        this.selectRosterEl.innerHTML = [...this.players]
          .sort((a, b) => a.slot - b.slot)
          .map(
            (state) => `
            <span class="bmb-roster-chip">
              <span class="bmb-roster-dot" style="background:${this.safeColor(state.player.color)};"></span>
              ${this.escapeHtml(state.player.name)}
              <small>${state.player.isBot ? 'BOT' : `P${state.slot + 1}`}</small>
            </span>
          `
          )
          .join('');
      }
    }
  }

  private syncPlayers(force: boolean): void {
    if (!this.sdk) return;
    const live = this.sdk.getPlayers().slice(0, BOMBER_MAX_PLAYERS);
    const key = live
      .map((player) => player.id)
      .sort()
      .join('|');
    const changed = force || key !== this.lastRosterKey;

    this.players = this.players.filter((state) =>
      live.some((player) => player.id === state.player.id)
    );

    for (const player of live) {
      const existing = this.players.find((state) => state.player.id === player.id);
      if (existing) {
        existing.player = player;
        existing.slot = player.slot;
      } else {
        this.players.push(makePlayerState(player, this.players.length));
      }
    }
    this.players.sort((a, b) => a.slot - b.slot);

    if (!changed) return;
    this.lastRosterKey = key;
    const liveIds = new Set(live.map((player) => player.id));
    this.bombs = this.bombs.filter((bomb) => liveIds.has(bomb.ownerId));

    if (this.phase === 'arena-select') {
      this.syncArenaSelectionUi();
      this.renderHud();
      return;
    }

    if (this.players.length < this.minPlayers) {
      this.enterArenaSelect();
      return;
    }

    if (this.phase === 'match-over') {
      this.matchChampions = this.computeChampions();
      this.renderHud();
      return;
    }

    this.showBanner('ROSTER BERUBAH — MATCH DIMULAI ULANG', '#fdba74', 2.2);
    if (this.currentArenaId) this.startMatch(this.currentArenaId);
    else this.enterArenaSelect();
  }

  private startFromSelection(): void {
    if (this.phase !== 'arena-select') return;
    if (this.players.length < this.minPlayers) {
      this.syncArenaSelectionUi();
      return;
    }
    const arenaId =
      this.arenaChoice === 'random'
        ? ARENA_IDS[Math.floor(Math.random() * ARENA_IDS.length)]
        : this.arenaChoice;
    this.currentArenaId = arenaId;
    this.startMatch(arenaId);
  }

  private startMatch(arenaId: BomberArenaId): void {
    if (this.players.length < this.minPlayers) {
      this.enterArenaSelect();
      return;
    }
    this.currentArenaId = arenaId;
    this.round = 0;
    this.matchChampions = [];
    this.roundWinners = [];
    this.roundReason = 'draw';
    for (const state of this.players) {
      state.points = 0;
      state.eliminations = 0;
    }
    this.bombs = [];
    this.blasts = [];
    this.powerups = [];
    this.particles = [];
    this.shake = 0;
    this.round = 1;
    this.startRound();
  }

  private startRound(): void {
    if (!this.currentArenaId) {
      this.enterArenaSelect();
      return;
    }
    const def = BOMBER_ARENA_BY_ID[this.currentArenaId];
    this.arena = buildArenaRuntime(def);
    this.renderer?.setArena(this.arena);
    this.bombs = [];
    this.blasts = [];
    this.powerups = [];
    this.particles = [];
    this.shake = 0;
    this.roundWinners = [];
    this.roundCardKey = '';
    this.matchCardKey = '';
    this.hazard = this.makeHazard(def);

    const roster = [...this.players].sort((a, b) => a.slot - b.slot);
    roster.forEach((state, index) =>
      this.resetPlayerForRound(state, index, roster.length)
    );

    this.phase = 'countdown';
    this.countdown = BOMBER_COUNTDOWN_SECONDS;
    this.lastCountdownSecond = Math.ceil(this.countdown);
    this.roundTimer = def.roundSeconds;
    this.phaseTimer = 0;
    this.audio.playCountdownTick();
    this.showBanner(`RONDE ${this.round} — ${def.name.toUpperCase()}`, '#fdba74', 1.6);
    this.renderHud();
  }

  private resetPlayerForRound(
    state: BomberPlayerState,
    index: number,
    totalPlayers: number
  ): void {
    if (!this.currentArenaId) return;
    const def = BOMBER_ARENA_BY_ID[this.currentArenaId];
    state.spawnIndex =
      Math.floor((index * SPAWN_POINTS.length) / Math.max(1, totalPlayers)) %
      SPAWN_POINTS.length;
    const spawn = SPAWN_POINTS[state.spawnIndex];
    state.tx = spawn.x;
    state.ty = spawn.y;
    state.fromX = spawn.x;
    state.fromY = spawn.y;
    state.toX = spawn.x;
    state.toY = spawn.y;
    state.moveT = 0;
    state.moving = false;
    state.facing = { x: 0, y: 1 };
    state.lives = BOMBER_START_LIVES;
    state.onMap = true;
    state.eliminated = false;
    state.invuln = 0;
    state.shield = 0;
    state.dashTimer = 0;
    state.dashCooldown = 0;
    state.padTimer = 0;
    state.respawnTimer = 0;
    state.maxBombs = BOMBER_BASE_BOMBS;
    state.range = Math.min(BOMBER_MAX_RANGE, BOMBER_BASE_RANGE + def.rangeBonus);
    state.speed = def.baseSpeed;
    state.botThink = 0;
    state.botDir = null;
    state.botBomb = false;
    state.inputPrev = null;
  }

  private makeHazard(def: BomberArenaDef): HazardRuntime {
    if (!def.hazard) {
      return { active: false, phase: 'idle', timer: 0, eruptionTiles: [] };
    }
    return {
      active: true,
      phase: 'idle',
      timer: def.hazard.interval,
      eruptionTiles: computeHazardTiles(def.lavaTiles, def.hazard.radius),
    };
  }

  private enterArenaSelect(): void {
    this.phase = 'arena-select';
    this.currentArenaId = null;
    this.round = 0;
    this.roundTimer = 0;
    this.phaseTimer = 0;
    this.countdown = 0;
    this.roundWinners = [];
    this.matchChampions = [];
    this.roundCardKey = '';
    this.matchCardKey = '';
    this.bombs = [];
    this.blasts = [];
    this.powerups = [];
    this.particles = [];
    this.shake = 0;
    this.hazard = { active: false, phase: 'idle', timer: 0, eruptionTiles: [] };
    for (const state of this.players) {
      state.onMap = false;
      state.moving = false;
      state.moveT = 0;
      state.botDir = null;
      state.botBomb = false;
      state.inputPrev = null;
    }
    this.syncArenaSelectionUi();
    this.renderHud();
    this.sendAllTelemetry();
  }

  private updateCountdown(dt: number): void {
    this.countdown -= dt;
    const second = Math.max(0, Math.ceil(this.countdown));
    if (second !== this.lastCountdownSecond) {
      this.lastCountdownSecond = second;
      if (second > 0) this.audio.playCountdownTick();
    }
    if (this.countdown <= 0) this.startPlaying();
  }

  private startPlaying(): void {
    if (!this.currentArenaId) {
      this.enterArenaSelect();
      return;
    }
    const def = BOMBER_ARENA_BY_ID[this.currentArenaId];
    this.phase = 'playing';
    this.countdown = 0;
    this.roundTimer = def.roundSeconds;
    for (const state of this.players) {
      if (state.onMap) state.invuln = def.spawnProtect;
      state.inputPrev = null;
      state.botBomb = false;
    }
    this.audio.playGo();
    this.showBanner('GO!', '#4ade80', 0.9);
    this.renderHud();
  }

  private updatePlaying(dt: number): void {
    if (!this.arena || !this.currentArenaId) return;
    this.roundTimer -= dt;
    if (this.roundTimer <= 0) {
      this.roundTimer = 0;
      this.endRound('timeout');
      return;
    }

    this.updateHazard(dt);
    for (const state of this.players) this.updatePlayerTimers(state, dt);
    this.updateRespawns(dt);

    const world: BotWorld = {
      arena: this.arena,
      bombs: this.bombs,
      players: this.players,
      powerups: this.powerups,
      hazard: this.hazard,
      dt,
    };

    for (const state of this.players) {
      if (!state.onMap || state.lives <= 0) continue;
      if (state.player.isBot) updateBotAI(state, world);
      this.updatePlayerControl(state, dt);
    }

    this.updateBombs(dt);
    this.updateBlasts(dt);
    this.applyBlastDamage();
    this.updateParticles(dt);
    this.checkRoundEnd();
  }

  private updatePlayerTimers(state: BomberPlayerState, dt: number): void {
    state.invuln = Math.max(0, state.invuln - dt);
    state.shield = Math.max(0, state.shield - dt);
    state.dashTimer = Math.max(0, state.dashTimer - dt);
    state.dashCooldown = Math.max(0, state.dashCooldown - dt);
    state.padTimer = Math.max(0, state.padTimer - dt);
  }

  private updateHazard(dt: number): void {
    if (!this.arena?.def.hazard || !this.hazard.active) return;
    const def = this.arena.def.hazard;

    if (this.hazard.phase === 'idle') {
      this.hazard.timer -= dt;
      if (this.hazard.timer <= 0) {
        this.hazard.phase = 'telegraph';
        this.hazard.timer = def.telegraph;
        this.showBanner('LAVA AKAN MELETUS!', '#fb923c', 1.2);
      }
      return;
    }

    if (this.hazard.phase === 'telegraph') {
      this.hazard.timer -= dt;
      if (this.hazard.timer <= 0) {
        this.hazard.phase = 'erupt';
        this.hazard.timer = def.active;
        this.audio.playErupt();
        this.shake = Math.min(30, this.shake + 14);
        this.spawnHazardParticles();
        this.damagePlayersInHazard();
      }
      return;
    }

    this.hazard.timer -= dt;
    this.damagePlayersInHazard();
    if (this.hazard.timer <= 0) {
      this.hazard.phase = 'idle';
      this.hazard.timer = def.interval;
    }
  }

  private damagePlayersInHazard(): void {
    if (!this.arena) return;
    const hazardTiles = new Set(
      this.arena.hazardTiles.map((tile) => indexOfTile(tile.x, tile.y))
    );
    for (const state of this.players) {
      if (!state.onMap || state.lives <= 0) continue;
      const tile = this.playerTile(state);
      if (hazardTiles.has(indexOfTile(tile.x, tile.y))) {
        this.damagePlayer(state, 'hazard');
      }
    }
  }

  private updateRespawns(dt: number): void {
    for (const state of this.players) {
      if (state.lives <= 0 || state.onMap) continue;
      state.respawnTimer -= dt;
      if (state.respawnTimer > 0) continue;
      const spawn = this.findSafeSpawn(state);
      if (!spawn) {
        state.respawnTimer = 0.4;
        continue;
      }
      state.tx = spawn.x;
      state.ty = spawn.y;
      state.fromX = spawn.x;
      state.fromY = spawn.y;
      state.toX = spawn.x;
      state.toY = spawn.y;
      state.moveT = 0;
      state.moving = false;
      state.facing = { x: 0, y: 1 };
      state.onMap = true;
      state.invuln = BOMBER_SPAWN_PROTECT_SECONDS;
      state.inputPrev = null;
      state.botDir = null;
      state.botBomb = false;
      state.botThink = 0;
      this.audio.playShield();
      this.spawnParticles(spawn.x, spawn.y, '#93c5fd', 8);
    }
  }

  private findSafeSpawn(state: BomberPlayerState): Vec2 | null {
    if (!this.arena) return null;
    const hazardTiles = this.arena.def.hazard
      ? new Set(this.arena.hazardTiles.map((tile) => indexOfTile(tile.x, tile.y)))
      : null;
    const blastTiles = new Set(this.blasts.map((blast) => indexOfTile(blast.x, blast.y)));
    const bombDanger = computeDangerTiles(this.arena, this.bombs);
    const tries = [state.spawnIndex, ...SPAWN_POINTS.map((_, index) => index)];
    for (const index of tries) {
      const spawn = SPAWN_POINTS[index % SPAWN_POINTS.length];
      const tileIndex = indexOfTile(spawn.x, spawn.y);
      if (bombAtTile(this.bombs, spawn.x, spawn.y)) continue;
      if (blastTiles.has(tileIndex)) continue;
      if (bombDanger.has(tileIndex)) continue;
      if (hazardTiles?.has(tileIndex)) continue;
      const tile = tileAt(this.arena, spawn.x, spawn.y);
      if (tile !== TILE_EMPTY && tile !== TILE_PAD) continue;
      return spawn;
    }
    return null;
  }

  private updatePlayerControl(state: BomberPlayerState, dt: number): void {
    if (state.player.isBot) {
      if (state.botBomb) {
        this.placeBomb(state);
        state.botBomb = false;
      }
      this.movePlayer(state, state.botDir ? [state.botDir] : [], dt);
      return;
    }

    const input = this.sdk?.getInput(state.player.id);
    if (!input) {
      state.inputPrev = null;
      return;
    }
    const prev = state.inputPrev;
    const bombPressed = input.item && !prev?.item;
    const dashPressed = input.boost && !prev?.boost;
    state.inputPrev = { ...input };

    if (dashPressed && state.dashCooldown <= 0) {
      state.dashTimer = BOMBER_DASH_SECONDS;
      state.dashCooldown = BOMBER_DASH_COOLDOWN;
    }
    if (bombPressed) this.placeBomb(state);

    this.movePlayer(state, this.heldDirections(state, input, prev), dt);
  }

  private heldDirections(
    state: BomberPlayerState,
    input: ControllerInputState,
    prev: ControllerInputState | null
  ): Direction[] {
    const up = input.gas;
    const down = input.brake;
    const left = input.steer < -0.3;
    const right = input.steer > 0.3;
    if (!up && !down && !left && !right) return [];

    const ordered: Direction[] = [];
    const add = (dir: Direction) => {
      if (!ordered.includes(dir)) ordered.push(dir);
    };

    if (up && !prev?.gas) add('up');
    if (left && !(prev && prev.steer < -0.3)) add('left');
    if (down && !prev?.brake) add('down');
    if (right && !(prev && prev.steer > 0.3)) add('right');

    const facingDir = directionFromVector(state.facing.x, state.facing.y);
    if (facingDir) {
      const held =
        (facingDir === 'up' && up) ||
        (facingDir === 'down' && down) ||
        (facingDir === 'left' && left) ||
        (facingDir === 'right' && right);
      if (held) add(facingDir);
    }

    if (up) add('up');
    if (left) add('left');
    if (down) add('down');
    if (right) add('right');
    return ordered;
  }

  private movePlayer(state: BomberPlayerState, dirs: Direction[], dt: number): void {
    if (!this.arena) return;
    const speed = Math.min(
      14,
      state.speed *
        (state.dashTimer > 0 ? BOMBER_DASH_MULTIPLIER : 1) *
        (state.padTimer > 0 ? BOMBER_PAD_MULTIPLIER : 1)
    );
    let budget = speed * dt;
    let guard = 0;

    while (budget > 0 && guard++ < 4) {
      if (!state.moving) {
        const dir = this.firstWalkableDir(state, dirs);
        if (!dir) break;
        const vec = DIRECTION_VECTORS[dir];
        state.fromX = state.tx;
        state.fromY = state.ty;
        state.toX = state.tx + vec.x;
        state.toY = state.ty + vec.y;
        state.moveT = 0;
        state.moving = true;
        state.facing = { x: vec.x, y: vec.y };
      }

      const remaining = 1 - state.moveT;
      if (budget < remaining) {
        state.moveT = Math.min(1, state.moveT + budget);
        budget = 0;
      } else {
        budget -= remaining;
        state.moveT = 1;
        state.tx = state.toX;
        state.ty = state.toY;
        state.fromX = state.tx;
        state.fromY = state.ty;
        state.toX = state.tx;
        state.toY = state.ty;
        state.moveT = 0;
        state.moving = false;
        this.onTileEntered(state);
      }
    }
  }

  private firstWalkableDir(state: BomberPlayerState, dirs: Direction[]): Direction | null {
    if (!this.arena) return null;
    for (const dir of dirs) {
      const vec = DIRECTION_VECTORS[dir];
      const nx = state.tx + vec.x;
      const ny = state.ty + vec.y;
      if (!this.arena) return null;
      const tile = tileAt(this.arena, nx, ny);
      if (tile !== TILE_EMPTY && tile !== TILE_PAD) continue;
      if (bombAtTile(this.bombs, nx, ny)) continue;
      return dir;
    }
    return null;
  }

  private onTileEntered(state: BomberPlayerState): void {
    if (!this.arena) return;
    const powerupIndex = this.powerups.findIndex(
      (powerup) => powerup.x === state.tx && powerup.y === state.ty
    );
    if (powerupIndex >= 0) {
      const [powerup] = this.powerups.splice(powerupIndex, 1);
      this.applyPowerup(state, powerup.type);
    }
    if (tileAt(this.arena, state.tx, state.ty) === TILE_PAD) {
      state.padTimer = BOMBER_PAD_SECONDS;
    }
  }

  private applyPowerup(state: BomberPlayerState, type: PowerupType): void {
    if (type === 'bomb') {
      state.maxBombs = Math.min(BOMBER_MAX_BOMBS, state.maxBombs + 1);
      this.audio.playPickup();
    } else if (type === 'fire') {
      state.range = Math.min(BOMBER_MAX_RANGE, state.range + 1);
      this.audio.playPickup();
    } else if (type === 'speed') {
      state.speed = Math.min(BOMBER_MAX_SPEED, state.speed + BOMBER_SPEED_STEP);
      this.audio.playPickup();
    } else {
      state.shield = BOMBER_SHIELD_SECONDS;
      this.audio.playShield();
    }
    this.sdk?.sendVibrate(state.player.id, [32]);
    this.spawnParticles(state.tx, state.ty, POWERUP_INFO[type].color, 10);
  }

  private placeBomb(state: BomberPlayerState): void {
    if (this.phase !== 'playing' || !state.onMap || state.lives <= 0) return;
    if (!this.arena) return;
    const active = this.bombs.filter((bomb) => bomb.ownerId === state.player.id).length;
    if (active >= state.maxBombs) return;
    const tile = this.playerTile(state);
    if (bombAtTile(this.bombs, tile.x, tile.y)) return;
    const fuse = Math.max(1.2, BOMBER_BOMB_FUSE + this.arena.def.fuseBonus);
    this.bombs.push({
      id: this.nextBombId++,
      x: tile.x,
      y: tile.y,
      ownerId: state.player.id,
      ownerSlot: state.slot,
      range: state.range,
      fuse,
      totalFuse: fuse,
    });
    this.audio.playPlace();
    this.sdk?.sendVibrate(state.player.id, [16]);
    this.spawnParticles(tile.x, tile.y, '#fbbf24', 4);
  }

  private updateBombs(dt: number): void {
    if (!this.arena) return;
    for (const bomb of this.bombs) bomb.fuse -= dt;
    const due = this.bombs.filter((bomb) => bomb.fuse <= 0);
    for (const bomb of due) {
      if (this.bombs.some((current) => current.id === bomb.id)) {
        this.detonateBomb(bomb);
      }
    }
  }

  private detonateBomb(startBomb: BomberBomb): void {
    if (!this.arena) return;
    const queue: BomberBomb[] = [startBomb];
    let chain = 0;

    while (queue.length > 0) {
      const bomb = queue.shift()!;
      const index = this.bombs.findIndex((current) => current.id === bomb.id);
      if (index < 0) continue;
      this.bombs.splice(index, 1);

      const blast = computeBombBlast(
        this.arena,
        bomb.x,
        bomb.y,
        bomb.range,
        this.bombs,
        bomb.id
      );
      this.addBlast(bomb.x, bomb.y, bomb.ownerId);
      for (const tile of blast.tiles) {
        this.addBlast(tile.x, tile.y, bomb.ownerId);
        if (tileAt(this.arena, tile.x, tile.y) === TILE_CRATE) {
          this.destroyCrate(tile.x, tile.y);
        }
      }

      for (const chained of blast.chainedBombs) {
        const exists = this.bombs.find((current) => current.id === chained.id);
        if (exists) queue.push(exists);
      }

      this.audio.playExplosion(chain++);
      this.shake = Math.min(30, this.shake + 7);
      this.spawnParticles(bomb.x, bomb.y, '#fb923c', 14);
    }
  }

  private addBlast(x: number, y: number, ownerId: string): void {
    this.blasts.push({
      x,
      y,
      timer: BOMBER_BLAST_SECONDS,
      maxTimer: BOMBER_BLAST_SECONDS,
      ownerId,
    });
  }

  private destroyCrate(x: number, y: number): void {
    if (!this.arena) return;
    const i = indexOfTile(x, y);
    if (this.arena.tiles[i] !== TILE_CRATE) return;
    this.arena.tiles[i] = TILE_EMPTY;
    this.audio.playCrate();
    this.spawnParticles(x, y, this.arena.def.palette.crateEdge, 8);

    if (this.powerups.some((powerup) => powerup.x === x && powerup.y === y)) return;
    if (Math.random() >= this.arena.def.powerupChance) return;
    this.powerups.push({
      id: this.nextPowerupId++,
      x,
      y,
      type: this.rollPowerupType(this.arena.def),
    });
  }

  private rollPowerupType(def: BomberArenaDef): PowerupType {
    const weights = def.powerupWeights;
    const total = POWERUP_ORDER.reduce((sum, type) => sum + weights[type], 0);
    let roll = Math.random() * total;
    for (const type of POWERUP_ORDER) {
      roll -= weights[type];
      if (roll <= 0) return type;
    }
    return 'bomb';
  }

  private updateBlasts(dt: number): void {
    this.blasts = this.blasts.filter((blast) => {
      blast.timer -= dt;
      return blast.timer > 0;
    });
  }

  private applyBlastDamage(): void {
    if (this.phase !== 'playing') return;
    const blastByTile = new Map<number, BomberBlast>();
    for (const blast of this.blasts) {
      blastByTile.set(indexOfTile(blast.x, blast.y), blast);
    }
    for (const state of this.players) {
      if (!state.onMap || state.lives <= 0) continue;
      const tile = this.playerTile(state);
      const blast = blastByTile.get(indexOfTile(tile.x, tile.y));
      if (blast) this.damagePlayer(state, 'blast', blast.ownerId);
    }
  }

  private damagePlayer(
    state: BomberPlayerState,
    source: 'blast' | 'hazard',
    ownerId?: string
  ): void {
    if (this.phase !== 'playing' || !state.onMap || state.lives <= 0) return;
    if (state.invuln > 0) return;

    if (state.shield > 0) {
      state.shield = 0;
      state.invuln = 1;
      this.audio.playShield();
      this.sdk?.sendVibrate(state.player.id, [40]);
      this.spawnParticles(state.tx, state.ty, '#93c5fd', 12);
      return;
    }

    state.lives -= 1;
    state.onMap = false;
    state.moving = false;
    state.moveT = 0;
    state.dashTimer = 0;
    state.padTimer = 0;
    state.invuln = 0;
    state.botDir = null;
    state.botBomb = false;
    this.spawnParticles(state.tx, state.ty, this.safeColor(state.player.color), 14);

    if (state.lives > 0) {
      state.respawnTimer = BOMBER_RESPAWN_SECONDS;
      this.audio.playHurt();
      this.sdk?.sendVibrate(state.player.id, [120, 50, 120]);
    } else {
      state.lives = 0;
      state.eliminated = true;
      state.respawnTimer = 0;
      this.audio.playEliminated();
      this.sdk?.sendVibrate(state.player.id, [280, 80, 280]);
      if (source === 'blast' && ownerId && ownerId !== state.player.id) {
        const killer = this.players.find((candidate) => candidate.player.id === ownerId);
        if (killer) killer.eliminations += 1;
      }
    }
  }

  private checkRoundEnd(): void {
    if (this.phase !== 'playing') return;
    const contenders = this.players.filter((state) => state.lives > 0);
    if (contenders.length <= 1) {
      this.endRound(contenders.length === 1 ? 'last-standing' : 'draw');
    }
  }

  private endRound(reason: BomberRoundReason): void {
    if (this.phase !== 'playing') return;
    const contenders = this.players.filter((state) => state.lives > 0);
    let winners: BomberPlayerState[] = [];
    if (reason === 'last-standing' && contenders.length === 1) winners = [contenders[0]];
    else if (reason === 'timeout') winners = contenders;

    for (const winner of winners) winner.points += 1;
    this.roundWinners = winners.map((winner) => winner.slot);
    this.roundReason = winners.length === 0 ? 'draw' : reason;
    this.phase = 'round-end';
    this.phaseTimer = BOMBER_ROUND_END_SECONDS;

    if (winners.length > 0) {
      this.audio.playRoundWin();
      for (const winner of winners) {
        this.sdk?.sendVibrate(winner.player.id, [60, 40, 60]);
      }
      const names = winners.map((winner) => winner.player.name).join(' & ');
      const bannerText =
        winners.length <= 2
          ? `${names} MENANG RONDE ${this.round}`
          : `${winners.length} PENYINTAS MENANG RONDE ${this.round}`;
      this.showBanner(bannerText, '#fbbf24', 2.2);
    } else {
      this.audio.playEliminated();
      this.showBanner('RONDE SERI', '#94a3b8', 2);
    }
    this.renderHud();
  }

  private updateRoundEnd(dt: number): void {
    this.phaseTimer -= dt;
    this.updateBlasts(dt);
    this.updateParticles(dt);
    if (this.phaseTimer <= 0) this.advanceAfterRound();
  }

  private advanceAfterRound(): void {
    if (this.phase !== 'round-end') return;
    const leaderPoints = this.players.reduce(
      (max, state) => Math.max(max, state.points),
      0
    );
    if (leaderPoints >= BOMBER_ROUND_WIN_TARGET || this.round >= BOMBER_MAX_ROUNDS) {
      this.endMatch();
      return;
    }
    this.round += 1;
    this.startRound();
  }

  private endMatch(): void {
    this.phase = 'match-over';
    this.phaseTimer = 0;
    this.matchChampions = this.computeChampions();
    if (this.matchChampions.length > 0) {
      this.audio.playMatchWin();
      for (const champion of this.matchChampions) {
        this.sdk?.sendVibrate(champion.player.id, [90, 50, 90, 50, 140]);
      }
    } else {
      this.audio.playEliminated();
    }
    this.renderHud();
  }

  private computeChampions(): BomberPlayerState[] {
    if (this.players.length === 0) return [];
    const maxPoints = this.players.reduce((max, state) => Math.max(max, state.points), 0);
    const candidates = this.players.filter((state) => state.points === maxPoints);
    const maxKos = candidates.reduce(
      (max, state) => Math.max(max, state.eliminations),
      0
    );
    return candidates.filter((state) => state.eliminations === maxKos);
  }

  private updateParticles(dt: number): void {
    const alive: BomberParticle[] = [];
    for (const particle of this.particles) {
      particle.life -= dt;
      if (particle.life <= 0) continue;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      alive.push(particle);
    }
    this.particles = alive;
  }

  private addParticle(particle: BomberParticle): void {
    if (this.particles.length >= BOMBER_MAX_PARTICLES) this.particles.shift();
    this.particles.push(particle);
  }

  private spawnParticles(tileX: number, tileY: number, color: string, count: number): void {
    const cx = (tileX + 0.5) * BOMBER_TILE_PX;
    const cy = (tileY + 0.5) * BOMBER_TILE_PX;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 180;
      const life = 0.3 + Math.random() * 0.45;
      this.addParticle({
        x: cx + (Math.random() - 0.5) * 12,
        y: cy + (Math.random() - 0.5) * 12,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + Math.random() * 3.4,
        color,
        gravity: 120,
      });
    }
  }

  private spawnHazardParticles(): void {
    if (!this.arena) return;
    for (const tile of this.arena.hazardTiles) {
      if (Math.random() < 0.6) {
        this.spawnParticles(tile.x, tile.y, this.arena.def.palette.hazard, 2);
      }
    }
  }

  private playerTile(state: BomberPlayerState): Vec2 {
    if (!state.moving) return { x: state.tx, y: state.ty };
    return state.moveT >= 0.5
      ? { x: state.toX, y: state.toY }
      : { x: state.fromX, y: state.fromY };
  }

  private playerFloatTile(state: BomberPlayerState): Vec2 {
    if (!state.moving) return { x: state.tx, y: state.ty };
    return {
      x: state.fromX + (state.toX - state.fromX) * state.moveT,
      y: state.fromY + (state.toY - state.fromY) * state.moveT,
    };
  }

  private renderFrame(time: number): void {
    if (!this.renderer) return;
    this.renderer.draw({
      players: this.players,
      bombs: this.bombs,
      blasts: this.blasts,
      powerups: this.powerups,
      particles: this.particles,
      hazard: this.hazard,
      time,
      shake: this.shake,
    });
  }

  private sendAllTelemetry(): void {
    if (!this.sdk) return;
    const sorted = [...this.players].sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.eliminations !== b.eliminations) return b.eliminations - a.eliminations;
      if (a.lives !== b.lives) return b.lives - a.lives;
      return a.slot - b.slot;
    });
    const rankBySlot = new Map<number, number>();
    sorted.forEach((state, index) => rankBySlot.set(state.slot, index + 1));

    const phase =
      this.phase === 'arena-select'
        ? 'preparing'
        : this.phase === 'round-end'
        ? 'round-end'
        : this.phase === 'match-over'
        ? 'match-over'
        : 'live';
    const countdown = this.phase === 'countdown';
    const timerSeconds = countdown
      ? Math.ceil(this.countdown)
      : this.phase === 'playing'
      ? Math.ceil(this.roundTimer)
      : 0;
    const arenaIndex =
      this.phase === 'arena-select'
        ? this.arenaChoice === 'random'
          ? NO_ARENA_INDEX
          : arenaIndexOf(this.arenaChoice)
        : this.currentArenaId
        ? arenaIndexOf(this.currentArenaId)
        : NO_ARENA_INDEX;

    const blips = this.players
      .filter((state) => state.onMap && state.lives > 0)
      .sort((a, b) => a.slot - b.slot)
      .map((state) => {
        const pos = this.playerFloatTile(state);
        return {
          slot: state.slot,
          x: Math.round((pos.x / (BOMBER_GRID_W - 1)) * 255),
          z: Math.round((pos.y / (BOMBER_GRID_H - 1)) * 255),
        };
      });

    for (const state of this.players) {
      const activeBombs = this.bombs.filter(
        (bomb) => bomb.ownerId === state.player.id
      ).length;
      this.sdk.sendTelemetry(
        state.player.id,
        packBomberTelemetry({
          phase,
          countdown,
          arenaIndex,
          round: this.round,
          maxRounds: BOMBER_MAX_ROUNDS,
          timerSeconds,
          rank: rankBySlot.get(state.slot) ?? 1,
          totalPlayers: Math.max(1, this.players.length),
          lives: state.lives,
          wins: state.points,
          range: state.range,
          maxBombs: state.maxBombs,
          bombsReady: Math.max(0, state.maxBombs - activeBombs),
          dashCooldown: Math.ceil(state.dashCooldown),
          alive:
            this.phase === 'playing' ? state.onMap && state.lives > 0 : state.lives > 0,
          shielded: state.shield > 0 || state.invuln > 0,
          eliminations: state.eliminations,
          blips,
        })
      );
    }
  }

  private renderHud(): void {
    const def = this.currentArenaId ? BOMBER_ARENA_BY_ID[this.currentArenaId] : null;
    const chosenDef =
      this.arenaChoice === 'random' ? null : BOMBER_ARENA_BY_ID[this.arenaChoice];
    const aliveCount = this.players.filter((state) => state.lives > 0).length;

    if (this.arenaPillEl) {
      this.arenaPillEl.textContent = def
        ? def.name.toUpperCase()
        : chosenDef
        ? `${chosenDef.name.toUpperCase()} (DIPILIH)`
        : 'PILIH ARENA';
    }
    if (this.roundPillEl) {
      this.roundPillEl.textContent =
        this.phase === 'arena-select' ? 'RONDE -' : `RONDE ${this.round}/${BOMBER_MAX_ROUNDS}`;
    }
    if (this.timerPillEl) {
      this.timerPillEl.textContent =
        this.phase === 'playing'
          ? `WAKTU ${Math.ceil(this.roundTimer)}s`
          : this.phase === 'countdown'
          ? `SIAP ${Math.max(1, Math.ceil(this.countdown))}`
          : this.phase === 'round-end'
          ? 'RONDE SELESAI'
          : 'WAKTU --';
    }
    if (this.alivePillEl) {
      this.alivePillEl.textContent =
        this.phase === 'arena-select' ? `${this.players.length} PEMAIN` : `${aliveCount} HIDUP`;
    }
    if (this.muteBtnEl) {
      this.muteBtnEl.textContent = this.audio.isMuted() ? 'Suara OFF' : 'Suara ON';
    }
    if (this.sideArenaEl) {
      this.sideArenaEl.textContent = def ? def.name : '—';
    }
    if (this.countdownEl) {
      this.countdownEl.textContent = String(Math.max(0, Math.ceil(this.countdown)));
      this.countdownEl.classList.toggle('show', this.phase === 'countdown');
    }
    if (this.bannerEl) {
      this.bannerEl.textContent = this.banner.text;
      this.bannerEl.style.color = this.banner.color;
      this.bannerEl.classList.toggle('show', this.banner.timer > 0);
    }
    if (this.selectOverlayEl) {
      this.selectOverlayEl.classList.toggle('show', this.phase === 'arena-select');
    }
    if (this.roundOverlayEl) {
      this.roundOverlayEl.classList.toggle('show', this.phase === 'round-end');
    }
    if (this.matchOverlayEl) {
      this.matchOverlayEl.classList.toggle('show', this.phase === 'match-over');
    }

    this.renderScoreboard();
    if (this.phase === 'round-end') {
      const key = `round:${this.round}:${this.roundWinners.join(',')}:${this.roundReason}:${this.players
        .map((state) => state.player.id)
        .join(',')}`;
      if (key !== this.roundCardKey) {
        this.roundCardKey = key;
        this.renderRoundCard();
      }
      this.updateRoundCountdownButton();
    } else {
      this.roundCardKey = '';
    }
    if (this.phase === 'match-over') {
      const key = `match:${this.matchChampions
        .map((champion) => champion.player.id)
        .join(',')}:${this.players.map((state) => state.player.id).join(',')}`;
      if (key !== this.matchCardKey) {
        this.matchCardKey = key;
        this.renderMatchCard();
      }
    } else {
      this.matchCardKey = '';
    }
  }

  private renderScoreboard(): void {
    if (!this.scoreboardEl) return;
    const sorted = [...this.players].sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.eliminations !== b.eliminations) return b.eliminations - a.eliminations;
      if (a.lives !== b.lives) return b.lives - a.lives;
      return a.slot - b.slot;
    });
    this.scoreboardEl.innerHTML = sorted
      .map((state) => {
        const color = this.safeColor(state.player.color);
        const heartCount = Math.max(0, Math.min(BOMBER_START_LIVES, state.lives));
        const hearts = `${'♥'.repeat(heartCount)}${'♡'.repeat(
          BOMBER_START_LIVES - heartCount
        )}`.replace(/♡/g, '<span class="empty">♡</span>');
        return `
          <div class="bmb-score-row ${state.lives <= 0 ? 'out' : ''}" style="--bmb-color:${color};">
            <span class="bmb-score-dot"></span>
            <div class="bmb-score-name">
              ${this.escapeHtml(state.player.name)}
              <small>${state.player.isBot ? `AI ${state.player.botLevel ?? ''}` : `Pemain P${state.slot + 1}`}</small>
            </div>
            <div class="bmb-score-meta">
              <span class="bmb-score-hearts">${hearts}</span>
              <span class="bmb-score-points">${state.points} poin • ${state.eliminations} KO</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  private renderRoundCard(): void {
    if (!this.roundCardEl) return;
    const winners = this.players.filter((state) => this.roundWinners.includes(state.slot));
    const reason =
      this.roundReason === 'timeout'
        ? 'Waktu habis — semua penyintas mendapat poin.'
        : this.roundReason === 'draw'
        ? 'Semua pemain tumbang. Ronde seri.'
        : 'Pemain terakhir yang bertahan memenangkan ronde.';
    const winnerNames = winners
      .map((winner) => this.escapeHtml(winner.player.name))
      .join(' & ');
    const title =
      winners.length === 0
        ? 'RONDE SERI'
        : winners.length <= 2
        ? `${winnerNames} MENANG`
        : `${winners.length} PENYINTAS MENANG`;

    this.roundCardEl.innerHTML = `
      <div class="bmb-kicker">Ronde ${this.round} Selesai</div>
      <h2 class="bmb-result-title">${title}</h2>
      <p class="bmb-result-sub">${reason}</p>
      <div class="bmb-result-hero">
        <div class="bmb-result-avatars">
          ${winners
            .map(
              (winner) => `
              <div class="bmb-result-avatar" style="background:${this.safeColor(
                winner.player.color
              )};">${this.escapeHtml(this.initialOf(winner.player.name))}</div>
            `
            )
            .join('')}
        </div>
      </div>
      ${this.standingsHtml()}
      <div class="bmb-btn-row">
        <button type="button" class="btn btn-primary" id="bmb-skip-round" data-bmb-action="skip-round">
          Lanjut (${Math.max(1, Math.ceil(this.phaseTimer))}s)
        </button>
        <button type="button" class="btn btn-danger" data-bmb-action="exit">Keluar</button>
      </div>
    `;
  }

  private renderMatchCard(): void {
    if (!this.matchCardEl) return;
    const champions = this.matchChampions;
    const def = this.currentArenaId ? BOMBER_ARENA_BY_ID[this.currentArenaId] : null;
    const title =
      champions.length === 0
        ? 'TIDAK ADA JUARA'
        : champions.length === 1
        ? `${this.escapeHtml(champions[0].player.name)} JUARA!`
        : 'JUARA BERSAMA';
    const subtitle =
      champions.length > 2
        ? `${champions.length} pemain berbagi gelar juara.`
        : champions.length > 1
        ? `${champions
            .map((champion) => this.escapeHtml(champion.player.name))
            .join(' & ')} berbagi gelar juara.`
        : 'Pertandingan selesai. Siap untuk pertandingan berikutnya?';

    this.matchCardEl.innerHTML = `
      <div class="bmb-kicker">Pertandingan Selesai</div>
      <h2 class="bmb-result-title">${title}</h2>
      <p class="bmb-result-sub">${subtitle}${def ? ` Arena: ${def.name}.` : ''}</p>
      <div class="bmb-result-hero">
        <div class="bmb-result-avatars">
          ${champions
            .map(
              (champion) => `
              <div class="bmb-result-avatar" style="background:${this.safeColor(
                champion.player.color
              )};">${this.escapeHtml(this.initialOf(champion.player.name))}</div>
            `
            )
            .join('')}
        </div>
      </div>
      ${this.standingsHtml()}
      <div class="bmb-btn-row">
        <button type="button" class="btn btn-primary" data-bmb-action="rematch">Main Lagi</button>
        <button type="button" class="btn btn-secondary" data-bmb-action="change-arena">Ganti Arena</button>
        <button type="button" class="btn btn-danger" data-bmb-action="exit">Keluar</button>
      </div>
    `;
  }

  private updateRoundCountdownButton(): void {
    const button = this.roundCardEl?.querySelector<HTMLButtonElement>('#bmb-skip-round');
    if (button) button.textContent = `Lanjut (${Math.max(1, Math.ceil(this.phaseTimer))}s)`;
  }

  private standingsHtml(): string {
    const sorted = [...this.players].sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.eliminations !== b.eliminations) return b.eliminations - a.eliminations;
      if (a.lives !== b.lives) return b.lives - a.lives;
      return a.slot - b.slot;
    });
    return `
      <div class="bmb-standings">
        ${sorted
          .map(
            (state, index) => `
          <div class="bmb-standing-row ${index === 0 ? 'first' : ''}">
            <span class="bmb-standing-rank">#${index + 1}</span>
            <span class="bmb-standing-name">
              <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${this.safeColor(
                state.player.color
              )};margin-right:7px;"></span>
              ${this.escapeHtml(state.player.name)}
            </span>
            <span class="bmb-standing-stat"><strong>${state.points}</strong> poin</span>
            <span class="bmb-standing-stat">${state.eliminations} KO</span>
            <span class="bmb-standing-stat">${state.lives > 0 ? `${state.lives} nyawa` : 'OUT'}</span>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  private toggleMute(): void {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.isMuted());
    this.renderHud();
  }

  private showBanner(text: string, color: string, duration: number): void {
    this.banner = { text, color, timer: duration };
    if (this.bannerEl) {
      this.bannerEl.textContent = text;
      this.bannerEl.style.color = color;
      this.bannerEl.classList.add('show');
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => {
      if (char === '&') return '&amp;';
      if (char === '<') return '&lt;';
      if (char === '>') return '&gt;';
      if (char === '"') return '&quot;';
      return '&#39;';
    });
  }

  private safeColor(value: string): string {
    return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : '#94a3b8';
  }

  private initialOf(name: string): string {
    return (name.trim()[0] ?? 'P').toUpperCase();
  }
}
