import { HostSDKContext, PlatformGame } from '../../sdk/GameSDK';
import { botDelay, planBotShot } from './MiniGolfAI';
import { GOLF_HOLES, GolfHoleDef, renderHolePreviewSvg } from './GolfCourses';
import { GOLF_HOLE_COUNT } from './MiniGolfState';
import { GolfPhysicsEvent, stepGolfBall } from './MiniGolfPhysics';
import { MiniGolfRenderer } from './MiniGolfRenderer';
import { MiniGolfAudioEngine } from './MiniGolfAudioEngine';
import { MINIGOLF_CSS } from './MiniGolfStyles';
import {
  GOLF_HOLE_RESULT_SECONDS,
  GOLF_INTRO_SECONDS,
  GOLF_MAX_LAUNCH_SPEED,
  GOLF_MAX_STROKES,
  GOLF_MIN_LAUNCH_SPEED,
  GOLF_SIM_STEP,
  GolfHazardType,
  GolfPhase,
  GolfPlayerState,
  Vec2,
  aimTowards,
  chargePercent,
  makeGolfPlayerState,
  normalizeAngle,
  scoreForFinishedHole,
} from './MiniGolfState';
import { packGolfTelemetry } from './MiniGolfTelemetry';

const SPAWN_OFFSETS: Vec2[] = [
  { x: 0, z: 0 },
  { x: 0.9, z: 0 },
  { x: -0.9, z: 0 },
  { x: 0, z: 0.9 },
  { x: 0, z: -0.9 },
  { x: 0.9, z: 0.9 },
  { x: -0.9, z: 0.9 },
  { x: 0.9, z: -0.9 },
  { x: -0.9, z: -0.9 },
  { x: 0, z: 1.7 },
];

const COVER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="mgSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#071b2c"/>
      <stop offset="0.55" stop-color="#0d3b35"/>
      <stop offset="1" stop-color="#05070d"/>
    </linearGradient>
    <linearGradient id="mgGreen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22c55e"/>
      <stop offset="1" stop-color="#0e7490"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#mgSky)"/>
  <circle cx="505" cy="82" r="55" fill="#facc15" opacity="0.18"/>
  <circle cx="505" cy="82" r="32" fill="#fbbf24"/>
  <path d="M40 300 C 150 250, 210 260, 300 200 S 430 120, 600 145 L 600 360 L 40 360 Z" fill="#123f2e"/>
  <path d="M40 318 C 160 270, 220 280, 310 220 S 440 145, 600 168" fill="none" stroke="url(#mgGreen)" stroke-width="18" stroke-linecap="round" opacity="0.7"/>
  <path d="M40 318 C 160 270, 220 280, 310 220 S 440 145, 600 168" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="5" stroke-linecap="round"/>
  <g transform="translate(392 182)">
    <line x1="0" y1="0" x2="0" y2="-112" stroke="#f8fafc" stroke-width="5" stroke-linecap="round"/>
    <path d="M0 -112 L 74 -92 L 0 -72 Z" fill="#ef4444"/>
    <circle cx="0" cy="18" r="17" fill="#0b1120" opacity="0.6"/>
  </g>
  <g transform="translate(206 250)">
    <ellipse cx="0" cy="22" rx="32" ry="10" fill="rgba(0,0,0,0.35)"/>
    <circle cx="0" cy="0" r="25" fill="#f8fafc"/>
    <circle cx="-8" cy="-8" r="7" fill="#e2e8f0"/>
    <circle cx="7" cy="4" r="3" fill="#cbd5e1"/>
    <circle cx="0" cy="0" r="25" fill="none" stroke="rgba(15,23,42,0.35)" stroke-width="3"/>
  </g>
  <text x="320" y="320" text-anchor="middle" fill="#f8fafc" font-family="system-ui,sans-serif" font-weight="900" font-size="34" letter-spacing="4">MINI GOLF 3D</text>
  <text x="320" y="344" text-anchor="middle" fill="#86efac" font-family="system-ui,sans-serif" font-size="13" font-weight="800" letter-spacing="5">4 HOLES • PARTY PUTT</text>
</svg>
`)}`;

interface BannerState {
  text: string;
  color: string;
  timer: number;
}

function displayTotal(state: GolfPlayerState, phase: GolfPhase): number {
  if (phase === 'pre-game') return 0;
  const liveHole =
    phase === 'hole-intro' || phase === 'playing' ? state.holeStrokes : 0;
  return state.totalStrokes + liveHole;
}

export class MiniGolfGame implements PlatformGame {
  readonly id = 'minigolf-3d';
  readonly title = 'Mini Golf 3D';
  readonly subtitle =
    'Party putt bareng teman di empat lubang bertema! Arahkan bola di HP, atur power, dan selesaikan setiap hole dengan pukulan paling sedikit.';
  readonly badge = '2-10 PLAYER • 3D GOLF';
  readonly accentColor = '#22c55e';
  readonly coverImage = COVER_SVG;
  readonly minPlayers = 2;
  readonly maxPlayers = 10;
  readonly controllerLayout: 'arena-dpad' = 'arena-dpad';

  private container: HTMLElement | null = null;
  private sdk: HostSDKContext | null = null;
  private audio = new MiniGolfAudioEngine();
  private renderer: MiniGolfRenderer | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private players: GolfPlayerState[] = [];
  private phase: GolfPhase = 'pre-game';
  private holeIndex = 0;
  private def: GolfHoleDef = GOLF_HOLES[0];
  private holeTimer = 0;
  private introTimer = 0;
  private resultTimer = 0;
  private gameTime = 0;
  private lastTime = 0;
  private hudTimer = 0;
  private telemetryTimer = 0;
  private physicsAccumulator = 0;
  private lastBounceTime = 0;
  private lastRosterKey = '';
  private matchChampions: GolfPlayerState[] = [];
  private holeResultKey = '';
  private matchResultKey = '';
  private banner: BannerState = { text: '', color: '#f8fafc', timer: 0 };

  private rafId: number | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private arenaWrapEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private pregameOverlayEl: HTMLElement | null = null;
  private holeGridEl: HTMLElement | null = null;
  private rosterEl: HTMLElement | null = null;
  private teeBtnEl: HTMLButtonElement | null = null;
  private noteEl: HTMLElement | null = null;
  private introOverlayEl: HTMLElement | null = null;
  private introHoleEl: HTMLElement | null = null;
  private introNameEl: HTMLElement | null = null;
  private introMetaEl: HTMLElement | null = null;
  private introCountEl: HTMLElement | null = null;
  private resultOverlayEl: HTMLElement | null = null;
  private resultCardEl: HTMLElement | null = null;
  private matchOverlayEl: HTMLElement | null = null;
  private matchCardEl: HTMLElement | null = null;
  private coursePillEl: HTMLElement | null = null;
  private holePillEl: HTMLElement | null = null;
  private parPillEl: HTMLElement | null = null;
  private timerPillEl: HTMLElement | null = null;
  private holedPillEl: HTMLElement | null = null;
  private muteBtnEl: HTMLButtonElement | null = null;
  private sideCourseEl: HTMLElement | null = null;
  private scoreboardEl: HTMLElement | null = null;

  private unlockAudioOnce = (): void => {
    this.audio.unlock();
  };

  mount(container: HTMLElement, sdk: HostSDKContext): void {
    this.container = container;
    this.sdk = sdk;
    this.players = [];
    this.phase = 'pre-game';
    this.holeIndex = 0;
    this.def = GOLF_HOLES[0];
    this.holeTimer = 0;
    this.introTimer = 0;
    this.resultTimer = 0;
    this.gameTime = 0;
    this.lastTime = 0;
    this.hudTimer = 0;
    this.telemetryTimer = 0;
    this.physicsAccumulator = 0;
    this.lastBounceTime = 0;
    this.lastRosterKey = '';
    this.matchChampions = [];
    this.holeResultKey = '';
    this.matchResultKey = '';
    this.banner = { text: '', color: '#f8fafc', timer: 0 };

    container.innerHTML = `
      <style>${MINIGOLF_CSS}</style>
      <div class="mg-stage">
        <div class="game-topbar">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button type="button" class="btn btn-danger" data-mg-action="exit" style="padding:8px 14px;font-weight:900;">Keluar</button>
            <div class="hud-pill" id="mg-course-pill">GAMING PARTY LINKS</div>
            <div class="hud-pill" id="mg-hole-pill">PILIH TEE</div>
            <div class="hud-pill" id="mg-par-pill">PAR -</div>
            <div class="hud-pill" id="mg-timer-pill">WAKTU --</div>
            <div class="hud-pill" id="mg-holed-pill">0 PEMAIN</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button type="button" class="btn btn-secondary" id="mg-mute" data-mg-action="mute" style="padding:8px 12px;font-size:12px;font-weight:800;">Suara ON</button>
          </div>
        </div>

        <div class="mg-layout">
          <div class="mg-arena-wrap" id="mg-arena-wrap">
            <canvas id="mg-canvas"></canvas>
            <div class="mg-banner" id="mg-banner"></div>
          </div>
          <aside class="mg-side">
            <div class="mg-side-head"><span>Papan Skor</span><span id="mg-side-course">-</span></div>
            <div id="mg-scoreboard" style="display:flex;flex-direction:column;gap:6px;"></div>
            <div style="margin-top:auto;font-size:10px;line-height:1.45;color:#64748b;">
              P1 keyboard: A/D arah, E tahan &amp; lepas untuk putt, Space batal.
            </div>
          </aside>
        </div>

        <div class="mg-overlay" id="mg-pregame-overlay">
          <div class="mg-panel">
            <div class="mg-pregame-head">
              <div>
                <div class="mg-kicker">Gaming Party Links</div>
                <h2 class="mg-title">Mini Golf 3D</h2>
                <p class="mg-subtitle">
                  Satu cup, empat lubang, semua pemain putting bersamaan. Arahkan bola dengan dial di HP,
                  tahan PUTT untuk mengisi power, lalu lepas. Pukulan paling sedikit setelah empat lubang menang.
                </p>
              </div>
              <button type="button" class="btn btn-danger" data-mg-action="exit" style="padding:8px 14px;">Keluar</button>
            </div>
            <div class="mg-hole-grid" id="mg-hole-grid"></div>
            <div class="mg-pregame-footer">
              <div>
                <div style="font-size:11px;font-weight:900;letter-spacing:.12em;color:#94a3b8;text-transform:uppercase;margin-bottom:6px;">Pemain di Room</div>
                <div class="mg-roster" id="mg-roster"></div>
              </div>
              <div class="mg-tee-wrap">
                <button type="button" class="mg-tee-btn" id="mg-tee-btn" data-mg-action="start">Tee Off</button>
                <div class="mg-note" id="mg-note">Minimal 2 pemain.</div>
              </div>
            </div>
          </div>
        </div>

        <div class="mg-overlay" id="mg-intro-overlay" style="background:rgba(2,6,23,0.38);backdrop-filter:blur(3px);">
          <div class="mg-intro-card">
            <div class="mg-intro-hole" id="mg-intro-hole">LUBANG 1</div>
            <div class="mg-intro-name" id="mg-intro-name">Sunset Shores</div>
            <div class="mg-intro-meta" id="mg-intro-meta">PAR 2 • 60 DETIK</div>
            <div class="mg-intro-count" id="mg-intro-count">3</div>
          </div>
        </div>

        <div class="mg-overlay" id="mg-result-overlay">
          <div class="mg-panel mg-result-card" id="mg-result-card"></div>
        </div>
        <div class="mg-overlay" id="mg-match-overlay">
          <div class="mg-panel mg-result-card" id="mg-match-card"></div>
        </div>
      </div>
    `;

    this.canvasEl = container.querySelector('#mg-canvas');
    this.arenaWrapEl = container.querySelector('#mg-arena-wrap');
    this.bannerEl = container.querySelector('#mg-banner');
    this.pregameOverlayEl = container.querySelector('#mg-pregame-overlay');
    this.holeGridEl = container.querySelector('#mg-hole-grid');
    this.rosterEl = container.querySelector('#mg-roster');
    this.teeBtnEl = container.querySelector('#mg-tee-btn');
    this.noteEl = container.querySelector('#mg-note');
    this.introOverlayEl = container.querySelector('#mg-intro-overlay');
    this.introHoleEl = container.querySelector('#mg-intro-hole');
    this.introNameEl = container.querySelector('#mg-intro-name');
    this.introMetaEl = container.querySelector('#mg-intro-meta');
    this.introCountEl = container.querySelector('#mg-intro-count');
    this.resultOverlayEl = container.querySelector('#mg-result-overlay');
    this.resultCardEl = container.querySelector('#mg-result-card');
    this.matchOverlayEl = container.querySelector('#mg-match-overlay');
    this.matchCardEl = container.querySelector('#mg-match-card');
    this.coursePillEl = container.querySelector('#mg-course-pill');
    this.holePillEl = container.querySelector('#mg-hole-pill');
    this.parPillEl = container.querySelector('#mg-par-pill');
    this.timerPillEl = container.querySelector('#mg-timer-pill');
    this.holedPillEl = container.querySelector('#mg-holed-pill');
    this.muteBtnEl = container.querySelector('#mg-mute');
    this.sideCourseEl = container.querySelector('#mg-side-course');
    this.scoreboardEl = container.querySelector('#mg-scoreboard');

    this.buildPregameCards();
    if (this.canvasEl) {
      this.renderer = new MiniGolfRenderer(this.canvasEl);
      this.renderer.setHole(GOLF_HOLES[0]);
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
    this.syncPregameUi();
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
    this.renderer?.dispose();
    this.renderer = null;
    this.players = [];
    if (this.container) this.container.innerHTML = '';
    this.container = null;
    this.sdk = null;
  }

  private handleResize = (): void => {
    this.renderer?.resize();
  };

  private handleClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-mg-action]'
    );
    if (!target) return;
    target.blur();
    const action = target.dataset.mgAction;
    if (!action) return;

    if (action === 'exit') {
      this.sdk?.exitToHub();
    } else if (action === 'mute') {
      this.audio.unlock();
      this.audio.setMuted(!this.audio.isMuted());
      this.renderHud();
    } else if (action === 'start') {
      if (this.phase === 'pre-game' && this.players.length >= this.minPlayers) {
        this.startMatch();
      }
    } else if (action === 'skip') {
      if (this.phase === 'hole-result') this.advanceAfterHole();
    } else if (action === 'rematch') {
      if (this.phase === 'match-over') this.startMatch();
    }
  };

  private loop = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.gameTime += dt;

    this.syncPlayers(false);

    if (this.phase === 'hole-intro') {
      this.updateHoleIntro(dt);
    } else if (this.phase === 'playing') {
      this.updatePlaying(dt);
    } else if (this.phase === 'hole-result') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) this.advanceAfterHole();
    }

    this.banner.timer = Math.max(0, this.banner.timer - dt);

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

  private buildPregameCards(): void {
    if (!this.holeGridEl) return;
    const tags = ['Sand', 'Chicane', 'Wind + Ice', 'Lava + Bridge'];
    this.holeGridEl.innerHTML = GOLF_HOLES.map(
      (hole, index) => `
      <div class="mg-hole-card">
        <div class="mg-hole-preview">${renderHolePreviewSvg(hole)}</div>
        <div class="mg-hole-name">
          <span>Hole ${index + 1} • ${hole.name}</span>
          <span class="mg-par-badge">PAR ${hole.par}</span>
        </div>
        <div class="mg-hole-tags">
          <span class="mg-tag">${hole.theme.toUpperCase()}</span>
          <span class="mg-tag">${tags[index] ?? ''}</span>
        </div>
      </div>
    `
    ).join('');
  }

  private syncPregameUi(): void {
    if (this.teeBtnEl) {
      const enough = this.players.length >= this.minPlayers;
      this.teeBtnEl.disabled = !enough;
      this.teeBtnEl.textContent = enough ? 'Tee Off' : 'Butuh Minimal 2 Pemain';
    }
    if (this.noteEl) {
      this.noteEl.textContent =
        this.players.length >= this.minPlayers
          ? 'Semua pemain putting bersamaan di lubang yang sama.'
          : 'Tambah pemain atau bot untuk memulai.';
    }
    if (this.rosterEl) {
      if (this.players.length === 0) {
        this.rosterEl.innerHTML =
          '<span style="font-size:12px;color:#94a3b8;">Belum ada pemain di room.</span>';
      } else {
        this.rosterEl.innerHTML = [...this.players]
          .sort((a, b) => a.slot - b.slot)
          .map(
            (state) => `
            <span class="mg-roster-chip">
              <span class="mg-roster-dot" style="background:${this.safeColor(state.player.color)};"></span>
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
    const live = this.sdk.getPlayers().slice(0, this.maxPlayers);
    const key = live.map((player) => player.id).sort().join('|');
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
        const spawn = this.phase === 'pre-game' ? GOLF_HOLES[0].tee : this.def.tee;
        this.players.push(
          makeGolfPlayerState(
            player,
            spawn,
            aimTowards(spawn, this.phase === 'pre-game' ? GOLF_HOLES[0].hole : this.def.hole)
          )
        );
      }
    }
    this.players.sort((a, b) => a.slot - b.slot);

    if (!changed) return;
    this.lastRosterKey = key;

    if (this.phase === 'pre-game') {
      this.syncPregameUi();
      this.renderHud();
      return;
    }
    if (this.players.length < this.minPlayers) {
      this.enterPregame();
      return;
    }
    if (this.phase === 'match-over') {
      this.matchChampions = this.computeChampions();
      this.matchResultKey = '';
      this.renderHud();
      return;
    }

    this.showBanner('ROSTER BERUBAH — MATCH DIMULAI ULANG', '#fdba74', 2.2);
    this.startMatch();
  }

  private startMatch(): void {
    if (this.players.length < this.minPlayers) {
      this.enterPregame();
      return;
    }
    for (const state of this.players) {
      state.holeScores = [-1, -1, -1, -1];
      state.totalStrokes = 0;
      state.maxedOut = false;
    }
    this.matchChampions = [];
    this.matchResultKey = '';
    this.holeResultKey = '';
    this.startHole(0);
  }

  private startHole(index: number): void {
    this.holeIndex = Math.max(0, Math.min(GOLF_HOLE_COUNT - 1, index));
    this.def = GOLF_HOLES[this.holeIndex];
    this.holeTimer = this.def.timeLimit;
    this.introTimer = GOLF_INTRO_SECONDS;
    this.resultTimer = 0;
    this.physicsAccumulator = 0;
    this.phase = 'hole-intro';
    this.holeResultKey = '';
    this.matchResultKey = '';

    const roster = [...this.players].sort((a, b) => a.slot - b.slot);
    roster.forEach((state, index) => {
      const offset = SPAWN_OFFSETS[index % SPAWN_OFFSETS.length];
      const bounds = this.def.bounds;
      const spawn: Vec2 = {
        x: Math.max(
          bounds.minX + 0.6,
          Math.min(bounds.maxX - 0.6, this.def.tee.x + offset.x)
        ),
        z: Math.max(
          bounds.minZ + 0.6,
          Math.min(bounds.maxZ - 0.6, this.def.tee.z + offset.z)
        ),
      };
      state.ball.x = spawn.x;
      state.ball.z = spawn.z;
      state.ball.vx = 0;
      state.ball.vz = 0;
      state.ballState = 'aiming';
      state.aim = aimTowards(spawn, this.def.hole);
      state.holeStrokes = 0;
      state.shotOrigin = { x: spawn.x, z: spawn.z };
      state.chargeStart = -1;
      state.chargePower = 0;
      state.maxedOut = false;
      state.inputPrev = null;
      state.botNextShotAt = 0;
      state.botChargeUntil = 0;
      state.botPower = 0;
      state.botAim = 0;
      state.botHitReady = false;
    });

    this.renderer?.setHole(this.def);
    this.audio.playCountdown();
    this.renderHud();
  }

  private updateHoleIntro(dt: number): void {
    const before = Math.ceil(this.introTimer);
    this.introTimer -= dt;
    const after = Math.ceil(this.introTimer);
    if (after !== before && after > 0) this.audio.playCountdown();
    if (this.introTimer <= 0) this.startPlaying();
  }

  private startPlaying(): void {
    this.phase = 'playing';
    this.holeTimer = this.def.timeLimit;
    this.introTimer = 0;
    for (const state of this.players) {
      state.inputPrev = null;
      if (state.player.isBot) {
        state.botNextShotAt = this.gameTime + botDelay(state.player.botLevel ?? 'medium');
      }
    }
    this.audio.playGo();
    this.showBanner('GO!', '#86efac', 0.8);
    this.renderHud();
  }

  private updatePlaying(dt: number): void {
    this.holeTimer -= dt;
    if (this.holeTimer <= 0) {
      this.holeTimer = 0;
      this.endHole();
      return;
    }

    for (const state of this.players) {
      if (state.ballState === 'holed') continue;
      if (state.player.isBot) {
        this.updateBot(state);
      } else {
        this.updateHuman(state, dt);
      }
      if (state.ballState === 'charging') {
        if (state.player.isBot) {
          const duration = state.botChargeUntil - state.chargeStart;
          const progress =
            duration > 0
              ? Math.max(0, Math.min(1, (this.gameTime - state.chargeStart) / duration))
              : 1;
          state.chargePower = progress * state.botPower;
        } else {
          state.chargePower = chargePercent(state, this.gameTime);
        }
      } else {
        state.chargePower = 0;
      }
    }

    this.physicsAccumulator += dt;
    let steps = 0;
    while (this.physicsAccumulator >= GOLF_SIM_STEP && steps < 8) {
      this.physicsAccumulator -= GOLF_SIM_STEP;
      steps += 1;
      for (const state of this.players) {
        if (state.ballState !== 'rolling') continue;
        const events = stepGolfBall(state.ball, this.def, GOLF_SIM_STEP);
        for (const event of events) {
          if (event.type === 'bounce') {
            if (
              (event.speed ?? 0) > 2.4 &&
              performance.now() - this.lastBounceTime > 80
            ) {
              this.lastBounceTime = performance.now();
              this.audio.playBounce();
            }
          } else if (event.type === 'hazard') {
            this.handleHazard(state, event);
            break;
          } else if (event.type === 'holed') {
            this.handleHoled(state);
            break;
          } else if (event.type === 'stop') {
            this.handleStopped(state);
            break;
          }
        }
        if (this.phase !== 'playing') break;
      }
      if (this.phase !== 'playing') break;
    }

    this.checkHoleEnd();
  }

  private updateHuman(state: GolfPlayerState, dt: number): void {
    if (!this.sdk) return;
    const input = this.sdk.getInput(state.player.id);
    if (!input) {
      state.inputPrev = null;
      return;
    }
    const prev = state.inputPrev;
    const isLocal = state.player.id === 'local_p1';

    if (state.ballState === 'aiming') {
      if (isLocal) {
        const steer = Math.max(-1, Math.min(1, input.steer));
        if (Math.abs(steer) > 0.1) {
          state.aim = normalizeAngle(state.aim + steer * 2.6 * dt);
        }
      } else {
        state.aim = normalizeAngle(input.steer * Math.PI);
      }
      if (input.item && !prev?.item) {
        this.startCharge(state);
      }
    } else if (state.ballState === 'charging') {
      if (input.drift) {
        this.cancelCharge(state);
      } else if (!input.item) {
        this.fireShot(state, chargePercent(state, this.gameTime));
      }
    }

    state.inputPrev = { ...input };
  }

  private updateBot(state: GolfPlayerState): void {
    if (state.ballState === 'aiming') {
      if (state.botNextShotAt <= 0) {
        state.botNextShotAt =
          this.gameTime + botDelay(state.player.botLevel ?? 'medium');
        return;
      }
      if (this.gameTime < state.botNextShotAt) return;
      if (state.holeStrokes >= GOLF_MAX_STROKES) {
        this.finishMaxed(state);
        return;
      }
      const plan = planBotShot(state, this.def);
      if (!plan) {
        state.botNextShotAt = this.gameTime + 1;
        return;
      }
      state.aim = normalizeAngle(plan.aim);
      state.chargeStart = this.gameTime;
      state.chargePower = 0;
      state.botPower = Math.max(0, Math.min(1, plan.power));
      state.botAim = state.aim;
      state.botChargeUntil = this.gameTime + 0.4 + Math.random() * 0.3;
      state.ballState = 'charging';
      state.botNextShotAt = 0;
      return;
    }

    if (state.ballState === 'charging' && this.gameTime >= state.botChargeUntil) {
      this.fireShot(state, state.botPower);
    }
  }

  private startCharge(state: GolfPlayerState): void {
    if (state.ballState !== 'aiming') return;
    if (state.holeStrokes >= GOLF_MAX_STROKES) return;
    state.ballState = 'charging';
    state.chargeStart = this.gameTime;
    state.chargePower = 0;
  }

  private cancelCharge(state: GolfPlayerState): void {
    if (state.ballState !== 'charging') return;
    state.ballState = 'aiming';
    state.chargeStart = -1;
    state.chargePower = 0;
  }

  private fireShot(state: GolfPlayerState, power: number): void {
    if (state.ballState !== 'charging') return;
    if (state.holeStrokes >= GOLF_MAX_STROKES) return;
    state.ballState = 'rolling';
    state.holeStrokes += 1;
    state.shotOrigin = { x: state.ball.x, z: state.ball.z };
    state.chargeStart = -1;
    const clamped = Math.max(0, Math.min(1, power));
    const speed =
      GOLF_MIN_LAUNCH_SPEED +
      clamped * (GOLF_MAX_LAUNCH_SPEED - GOLF_MIN_LAUNCH_SPEED);
    state.ball.vx = Math.cos(state.aim) * speed;
    state.ball.vz = Math.sin(state.aim) * speed;
    if (state.holeStrokes >= GOLF_MAX_STROKES) state.maxedOut = true;
    state.chargePower = 0;
    state.botNextShotAt = 0;
    state.botHitReady = false;
    this.audio.playPutt();
    this.renderer?.emitPutt(
      state.ball.x,
      state.ball.z,
      this.safeColor(state.player.color)
    );
    this.sdk?.sendVibrate(state.player.id, [16]);
  }

  private handleHazard(
    state: GolfPlayerState,
    event: GolfPhysicsEvent
  ): void {
    state.ballState = 'aiming';
    state.ball.x = state.shotOrigin.x;
    state.ball.z = state.shotOrigin.z;
    state.ball.vx = 0;
    state.ball.vz = 0;
    state.holeStrokes += 1;
    state.chargeStart = -1;
    state.chargePower = 0;
    state.inputPrev = null;
    const hazard: GolfHazardType = event.hazard ?? 'water';
    if (hazard === 'lava') {
      this.audio.playLava();
    } else {
      this.audio.playSplash();
    }
    this.renderer?.emitHazard(
      event.x,
      event.z,
      hazard,
      this.safeColor(state.player.color)
    );
    this.sdk?.sendVibrate(state.player.id, [120, 40, 120]);

    if (state.holeStrokes >= GOLF_MAX_STROKES) {
      this.finishMaxed(state);
    } else if (state.player.isBot) {
      state.botNextShotAt =
        this.gameTime + botDelay(state.player.botLevel ?? 'medium');
    }
    this.checkHoleEnd();
  }

  private handleHoled(state: GolfPlayerState): void {
    state.ballState = 'holed';
    state.ball.vx = 0;
    state.ball.vz = 0;
    state.chargeStart = -1;
    state.chargePower = 0;
    this.audio.playHole();
    this.renderer?.emitHole(
      this.def.hole.x,
      this.def.hole.z,
      this.safeColor(state.player.color)
    );
    this.sdk?.sendVibrate(state.player.id, [50, 30, 90]);
    if (state.holeStrokes === 1) {
      this.showBanner(`HOLE IN ONE! ${state.player.name}`, '#fbbf24', 2.2);
    }
    this.checkHoleEnd();
  }

  private handleStopped(state: GolfPlayerState): void {
    state.ball.vx = 0;
    state.ball.vz = 0;
    if (state.holeStrokes >= GOLF_MAX_STROKES) {
      this.finishMaxed(state);
    } else {
      state.ballState = 'aiming';
      state.chargeStart = -1;
      state.chargePower = 0;
      if (state.player.isBot) {
        state.botNextShotAt =
          this.gameTime + botDelay(state.player.botLevel ?? 'medium');
      }
    }
    this.checkHoleEnd();
  }

  private finishMaxed(state: GolfPlayerState): void {
    state.maxedOut = true;
    state.ballState = 'holed';
    state.ball.vx = 0;
    state.ball.vz = 0;
    state.chargeStart = -1;
    state.chargePower = 0;
    state.botNextShotAt = 0;
    this.checkHoleEnd();
  }

  private checkHoleEnd(): void {
    if (this.phase !== 'playing') return;
    if (this.holeTimer <= 0) {
      this.endHole();
      return;
    }
    if (this.players.every((state) => state.ballState === 'holed')) {
      this.endHole();
    }
  }

  private endHole(): void {
    if (this.phase !== 'playing') return;
    const par = this.def.par;
    for (const state of this.players) {
      const score = scoreForFinishedHole(state, par);
      state.holeScores[this.holeIndex] = score;
      state.totalStrokes += score;
      state.ballState = 'holed';
      state.ball.vx = 0;
      state.ball.vz = 0;
      state.chargeStart = -1;
      state.chargePower = 0;
      state.inputPrev = null;
    }
    this.phase = 'hole-result';
    this.resultTimer = GOLF_HOLE_RESULT_SECONDS;
    this.holeResultKey = '';
    this.audio.playHoleWin();
    const best = Math.min(
      ...this.players.map((state) => state.holeScores[this.holeIndex])
    );
    for (const state of this.players) {
      if (state.holeScores[this.holeIndex] === best) {
        this.sdk?.sendVibrate(state.player.id, [60, 40, 60]);
      }
    }
    this.renderHud();
  }

  private advanceAfterHole(): void {
    if (this.phase !== 'hole-result') return;
    if (this.holeIndex + 1 < GOLF_HOLE_COUNT) {
      this.startHole(this.holeIndex + 1);
    } else {
      this.endMatch();
    }
  }

  private endMatch(): void {
    this.phase = 'match-over';
    this.matchChampions = this.computeChampions();
    this.matchResultKey = '';
    this.audio.playMatchWin();
    for (const champion of this.matchChampions) {
      this.sdk?.sendVibrate(champion.player.id, [90, 50, 90, 50, 140]);
    }
    this.renderHud();
  }

  private enterPregame(): void {
    this.phase = 'pre-game';
    this.holeIndex = 0;
    this.def = GOLF_HOLES[0];
    this.holeTimer = 0;
    this.introTimer = 0;
    this.resultTimer = 0;
    this.physicsAccumulator = 0;
    this.matchChampions = [];
    this.holeResultKey = '';
    this.matchResultKey = '';
    for (const state of this.players) {
      state.ballState = 'aiming';
      state.ball.vx = 0;
      state.ball.vz = 0;
      state.chargeStart = -1;
      state.chargePower = 0;
      state.inputPrev = null;
    }
    this.renderer?.setHole(GOLF_HOLES[0]);
    this.syncPregameUi();
    this.renderHud();
    this.sendAllTelemetry();
  }

  private computeHoleWins(state: GolfPlayerState): number {
    let wins = 0;
    for (let hole = 0; hole < GOLF_HOLE_COUNT; hole++) {
      const scores = this.players
        .map((player) => player.holeScores[hole])
        .filter((score) => score > 0);
      if (scores.length < this.players.length) continue;
      const best = Math.min(...scores);
      const winners = this.players.filter(
        (player) => player.holeScores[hole] === best
      );
      if (winners.length === 1 && winners[0] === state) wins += 1;
    }
    return wins;
  }

  private computeChampions(): GolfPlayerState[] {
    if (this.players.length === 0) return [];
    const bestTotal = Math.min(...this.players.map((state) => state.totalStrokes));
    let candidates = this.players.filter(
      (state) => state.totalStrokes === bestTotal
    );
    if (candidates.length <= 1) return candidates;

    let bestWins = -1;
    for (const candidate of candidates) {
      bestWins = Math.max(bestWins, this.computeHoleWins(candidate));
    }
    candidates = candidates.filter(
      (state) => this.computeHoleWins(state) === bestWins
    );
    if (candidates.length <= 1) return candidates;

    const bestLast = Math.min(
      ...candidates.map((state) => state.holeScores[GOLF_HOLE_COUNT - 1])
    );
    candidates = candidates.filter(
      (state) => state.holeScores[GOLF_HOLE_COUNT - 1] === bestLast
    );
    return candidates;
  }

  private sendAllTelemetry(): void {
    if (!this.sdk) return;
    const totals = this.players.map((state) => ({
      state,
      total: displayTotal(state, this.phase),
    }));
    totals.sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total;
      return a.state.slot - b.state.slot;
    });
    const rankBySlot = new Map<number, number>();
    totals.forEach((entry, index) =>
      rankBySlot.set(entry.state.slot, index + 1)
    );

    const hole = this.phase === 'pre-game' ? 0 : this.holeIndex + 1;
    const par = this.phase === 'pre-game' ? 0 : this.def.par;
    const timerSeconds =
      this.phase === 'hole-intro'
        ? Math.ceil(this.introTimer)
        : this.phase === 'playing'
        ? Math.ceil(this.holeTimer)
        : 0;
    const holedCount =
      this.phase === 'pre-game'
        ? 0
        : this.players.filter((state) => state.ballState === 'holed').length;
    const matchOver = this.phase === 'match-over';

    const blips =
      this.phase === 'pre-game'
        ? []
        : this.players
            .filter((state) => state.ballState !== 'holed')
            .sort((a, b) => a.slot - b.slot)
            .map((state) => {
              const w = this.def.bounds.maxX - this.def.bounds.minX;
              const d = this.def.bounds.maxZ - this.def.bounds.minZ;
              return {
                slot: state.slot,
                x: Math.max(
                  0,
                  Math.min(
                    255,
                    Math.round(
                      ((state.ball.x - this.def.bounds.minX) / w) * 255
                    )
                  )
                ),
                z: Math.max(
                  0,
                  Math.min(
                    255,
                    Math.round(
                      ((state.ball.z - this.def.bounds.minZ) / d) * 255
                    )
                  )
                ),
              };
            });

    for (const state of this.players) {
      const total = displayTotal(state, this.phase);
      this.sdk.sendTelemetry(
        state.player.id,
        packGolfTelemetry(
          this.phase,
          matchOver,
          hole,
          GOLF_HOLE_COUNT,
          par,
          timerSeconds,
          rankBySlot.get(state.slot) ?? 1,
          Math.max(1, this.players.length),
          total,
          state.holeStrokes,
          state.ballState,
          holedCount,
          blips
        )
      );
    }
  }

  private renderFrame(time: number): void {
    if (!this.renderer) return;
    const players =
      this.phase === 'pre-game'
        ? []
        : this.players.map((state) => ({
            slot: state.slot,
            color: this.safeColor(state.player.color),
            x: state.ball.x,
            z: state.ball.z,
            aim: state.aim,
            state: state.ballState,
            chargePower: state.chargePower,
          }));
    this.renderer.update({ players, time });
  }

  private renderHud(): void {
    const def = this.def;
    const isPre = this.phase === 'pre-game';
    const holedCount = this.players.filter(
      (state) => state.ballState === 'holed'
    ).length;

    if (this.coursePillEl) {
      this.coursePillEl.textContent = isPre
        ? 'GAMING PARTY LINKS'
        : def.name.toUpperCase();
    }
    if (this.holePillEl) {
      this.holePillEl.textContent = isPre
        ? 'PILIH TEE'
        : `LUBANG ${this.holeIndex + 1}/${GOLF_HOLE_COUNT}`;
    }
    if (this.parPillEl) {
      this.parPillEl.textContent = isPre ? 'PAR -' : `PAR ${def.par}`;
    }
    if (this.timerPillEl) {
      this.timerPillEl.textContent = isPre
        ? 'WAKTU --'
        : this.phase === 'hole-intro'
        ? `SIAP ${Math.max(1, Math.ceil(this.introTimer))}`
        : this.phase === 'playing'
        ? `WAKTU ${Math.ceil(this.holeTimer)}s`
        : this.phase === 'hole-result'
        ? 'LUBANG SELESAI'
        : 'HASIL';
    }
    if (this.holedPillEl) {
      this.holedPillEl.textContent = isPre
        ? `${this.players.length} PEMAIN`
        : `${holedCount} MASUK`;
    }
    if (this.muteBtnEl) {
      this.muteBtnEl.textContent = this.audio.isMuted() ? 'Suara OFF' : 'Suara ON';
    }
    if (this.sideCourseEl) {
      this.sideCourseEl.textContent = isPre ? 'GPL' : def.name;
    }

    if (this.bannerEl) {
      this.bannerEl.textContent = this.banner.text;
      this.bannerEl.style.color = this.banner.color;
      this.bannerEl.classList.toggle('show', this.banner.timer > 0);
    }
    if (this.pregameOverlayEl) {
      this.pregameOverlayEl.classList.toggle('show', this.phase === 'pre-game');
    }
    if (this.introOverlayEl) {
      this.introOverlayEl.classList.toggle('show', this.phase === 'hole-intro');
    }
    if (this.resultOverlayEl) {
      this.resultOverlayEl.classList.toggle('show', this.phase === 'hole-result');
    }
    if (this.matchOverlayEl) {
      this.matchOverlayEl.classList.toggle('show', this.phase === 'match-over');
    }

    if (this.phase === 'hole-intro') {
      if (this.introHoleEl) {
        this.introHoleEl.textContent = `LUBANG ${this.holeIndex + 1} / ${GOLF_HOLE_COUNT}`;
      }
      if (this.introNameEl) this.introNameEl.textContent = def.name;
      if (this.introMetaEl) {
        this.introMetaEl.textContent = `PAR ${def.par} • ${def.timeLimit} DETIK`;
      }
      if (this.introCountEl) {
        this.introCountEl.textContent = String(
          Math.max(1, Math.ceil(this.introTimer))
        );
      }
    }

    this.renderScoreboard();
    if (this.phase === 'hole-result') {
      const key = `${this.holeIndex}:${this.players
        .map((state) => `${state.player.id}:${state.holeScores[this.holeIndex]}`)
        .join(',')}`;
      if (key !== this.holeResultKey) {
        this.holeResultKey = key;
        this.renderHoleResultCard();
      }
      this.updateSkipButton();
    } else {
      this.holeResultKey = '';
    }
    if (this.phase === 'match-over') {
      const key = `${this.matchChampions
        .map((state) => state.player.id)
        .join(',')}:${this.players.map((state) => state.player.id).join(',')}`;
      if (key !== this.matchResultKey) {
        this.matchResultKey = key;
        this.renderMatchCard();
      }
    } else {
      this.matchResultKey = '';
    }
  }

  private renderScoreboard(): void {
    if (!this.scoreboardEl) return;
    const sorted = [...this.players].sort((a, b) => {
      const totalA = displayTotal(a, this.phase);
      const totalB = displayTotal(b, this.phase);
      if (totalA !== totalB) return totalA - totalB;
      return a.slot - b.slot;
    });
    this.scoreboardEl.innerHTML = sorted
      .map((state) => {
        const color = this.safeColor(state.player.color);
        const status =
          state.ballState === 'holed'
            ? 'MASUK'
            : state.ballState === 'charging'
            ? 'POWER'
            : state.ballState === 'rolling'
            ? 'JALAN'
            : 'SIAP';
        const statusClass =
          state.ballState === 'holed'
            ? 'holed'
            : state.ballState === 'charging'
            ? 'charging'
            : '';
        return `
          <div class="mg-score-row" style="--mg-color:${color};">
            <span class="mg-score-dot"></span>
            <div class="mg-score-name">
              ${this.escapeHtml(state.player.name)}
              <small>${state.player.isBot ? `AI ${state.player.botLevel ?? ''}` : `P${state.slot + 1}`} • <span class="mg-status-pill ${statusClass}">${status}</span></small>
            </div>
            <div class="mg-score-meta">
              <span class="mg-score-total">${displayTotal(state, this.phase)} total</span>
              <span class="mg-score-hole">${state.holeStrokes} lubang</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  private renderHoleResultCard(): void {
    if (!this.resultCardEl) return;
    const def = this.def;
    const scores = this.players.map((state) => ({
      state,
      score: state.holeScores[this.holeIndex] ?? 0,
    }));
    const best = Math.min(...scores.map((entry) => entry.score));
    const winners = scores.filter((entry) => entry.score === best);
    const title =
      winners.length === 1
        ? `${this.escapeHtml(winners[0].state.player.name)} TERBAIK`
        : winners.length > 1
        ? 'LUBANG SERI'
        : 'LUBANG SELESAI';
    const sorted = [...scores].sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.state.slot - b.state.slot;
    });
    this.resultCardEl.innerHTML = `
      <div class="mg-kicker">Lubang ${this.holeIndex + 1} Selesai</div>
      <h2 class="mg-result-title">${title}</h2>
      <p class="mg-result-sub">${def.name} • PAR ${def.par} • ${winners
        .map((entry) => `${this.escapeHtml(entry.state.player.name)}: ${entry.score}`)
        .join(' & ')}</p>
      <div class="mg-scorecard">
        ${sorted
          .map(
            (entry, index) => `
          <div class="mg-scorecard-row ${index === 0 ? 'first' : ''}">
            <span class="mg-scorecard-rank">#${index + 1}</span>
            <span class="mg-scorecard-name">
              <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${this.safeColor(
                entry.state.player.color
              )};margin-right:7px;"></span>
              ${this.escapeHtml(entry.state.player.name)}
            </span>
            <span class="mg-scorecard-stat"><strong>${entry.score}</strong> pukulan</span>
            <span class="mg-scorecard-stat">${displayTotal(entry.state, this.phase)} total</span>
            <span class="mg-scorecard-stat">PAR ${def.par}</span>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="mg-btn-row">
        <button type="button" class="btn btn-primary" id="mg-skip-btn" data-mg-action="skip">
          Lanjut (${Math.max(1, Math.ceil(this.resultTimer))}s)
        </button>
        <button type="button" class="btn btn-danger" data-mg-action="exit">Keluar</button>
      </div>
    `;
  }

  private updateSkipButton(): void {
    const button = this.resultCardEl?.querySelector<HTMLButtonElement>('#mg-skip-btn');
    if (button) {
      button.textContent = `Lanjut (${Math.max(1, Math.ceil(this.resultTimer))}s)`;
    }
  }

  private renderMatchCard(): void {
    if (!this.matchCardEl) return;
    const champions = this.matchChampions;
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
            .map((state) => this.escapeHtml(state.player.name))
            .join(' & ')} berbagi gelar juara.`
        : 'Pertandingan selesai. Siap untuk pertandingan berikutnya?';
    const totalPar = GOLF_HOLES.reduce((sum, hole) => sum + hole.par, 0);
    const sorted = [...this.players].sort((a, b) => {
      if (a.totalStrokes !== b.totalStrokes) {
        return a.totalStrokes - b.totalStrokes;
      }
      return a.slot - b.slot;
    });
    this.matchCardEl.innerHTML = `
      <div class="mg-kicker">Pertandingan Selesai</div>
      <h2 class="mg-result-title">${title}</h2>
      <p class="mg-result-sub">${subtitle} Total par ${totalPar}.</p>
      <div class="mg-scorecard">
        ${sorted
          .map(
            (state, index) => `
          <div class="mg-scorecard-row ${index === 0 ? 'first' : ''}">
            <span class="mg-scorecard-rank">#${index + 1}</span>
            <span class="mg-scorecard-name">
              <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${this.safeColor(
                state.player.color
              )};margin-right:7px;"></span>
              ${this.escapeHtml(state.player.name)}
            </span>
            <span class="mg-scorecard-stat">${state.holeScores
              .map((score) => (score > 0 ? score : '-'))
              .join(' • ')}</span>
            <span class="mg-scorecard-stat"><strong>${state.totalStrokes}</strong> total</span>
            <span class="mg-scorecard-stat">${
              state.totalStrokes - totalPar > 0
                ? `+${state.totalStrokes - totalPar}`
                : state.totalStrokes - totalPar === 0
                ? 'PAR'
                : state.totalStrokes - totalPar
            }</span>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="mg-btn-row">
        <button type="button" class="btn btn-primary" data-mg-action="rematch">Main Lagi</button>
        <button type="button" class="btn btn-danger" data-mg-action="exit">Keluar</button>
      </div>
    `;
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
}
