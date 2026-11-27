import { TelemetryPacket } from '../../net/BinaryProtocol';
import { TransportMode } from '../../net/HostNetworkManager';
import {
  CTRL_SVG_ICONS,
  ControllerOutput,
  ControllerViewContext,
  GameControllerView,
  bindHoldButton,
  drawRadarBlips,
  updateTransportBadge,
} from '../../controller/GameControllerView';
import { BOMBER_ARENAS, getArenaName } from './BomberArenas';
import { decodeBomberTelemetry, BomberTelemetryView } from './BomberTelemetry';
import { BOMBER_CSS } from './BomberStyles';

type DirKey = 'up' | 'down' | 'left' | 'right';

export class BomberController implements GameControllerView {
  readonly id = 'bomber-party';

  private root: HTMLElement | null = null;
  private ctx: ControllerViewContext | null = null;
  private view: BomberTelemetryView | null = null;

  private statusBadgeEl: HTMLElement | null = null;
  private arenaEl: HTMLElement | null = null;
  private timerEl: HTMLElement | null = null;
  private timerFillEl: HTMLElement | null = null;
  private heartsEl: HTMLElement | null = null;
  private winsEl: HTMLElement | null = null;
  private bombsEl: HTMLElement | null = null;
  private rangeEl: HTMLElement | null = null;
  private rankEl: HTMLElement | null = null;
  private dashEl: HTMLElement | null = null;
  private phaseEl: HTMLElement | null = null;
  private bombBtnEl: HTMLButtonElement | null = null;
  private dashBtnEl: HTMLButtonElement | null = null;
  private radarCanvas: HTMLCanvasElement | null = null;

  private dirs: Record<DirKey, boolean> = {
    up: false,
    down: false,
    left: false,
    right: false,
  };
  private bombPressed = false;
  private dashPressed = false;
  private bombPulseUntil = 0;
  private dashPulseUntil = 0;

  mount(container: HTMLElement, ctx: ControllerViewContext): void {
    this.root = container;
    this.ctx = ctx;
    this.view = null;
    this.resetInputs();

    container.innerHTML = `
      <style>${BOMBER_CSS}</style>
      <div class="ctrl-gamepad bmb-ctrl">
        <div class="bmb-ctrl-left">
          <div class="bmb-dpad">
            <button type="button" class="bmb-dpad-btn bmb-dpad-up" data-bmb-dir="up" aria-label="Atas">▲</button>
            <button type="button" class="bmb-dpad-btn bmb-dpad-left" data-bmb-dir="left" aria-label="Kiri">◀</button>
            <div class="bmb-dpad-center"><strong>BOMBER</strong></div>
            <button type="button" class="bmb-dpad-btn bmb-dpad-right" data-bmb-dir="right" aria-label="Kanan">▶</button>
            <button type="button" class="bmb-dpad-btn bmb-dpad-down" data-bmb-dir="down" aria-label="Bawah">▼</button>
          </div>
          <div class="bmb-ctrl-label">Gerak</div>
        </div>

        <div class="center-hud bmb-ctrl-center">
          <div class="bmb-ctrl-top">
            <span style="color:${ctx.color};font-weight:900;">P${ctx.slot + 1}</span>
            <button id="bmb-ctrl-fs" type="button" class="btn btn-secondary ctrl-top-btn" style="padding:3px 7px;font-size:9px;">
              ${CTRL_SVG_ICONS.fullscreen}<span>Fullscreen</span>
            </button>
            <span id="bmb-ctrl-status" class="badge-ws">Connecting...</span>
          </div>
          <div class="bmb-ctrl-arena" id="bmb-ctrl-arena">Menunggu arena</div>
          <div class="bmb-ctrl-timer" id="bmb-ctrl-timer">--<small>s</small></div>
          <div class="bmb-ctrl-timerbar"><div id="bmb-ctrl-timer-fill"></div></div>
          <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
            <div class="bmb-ctrl-hearts" id="bmb-ctrl-hearts"></div>
            <span id="bmb-ctrl-wins" style="font-size:9px;font-weight:900;color:#fbbf24;white-space:nowrap;">0 MENANG</span>
          </div>
          <div class="bmb-ctrl-stats">
            <div class="bmb-stat"><span>BOM</span><strong id="bmb-ctrl-bombs">1/1</strong></div>
            <div class="bmb-stat"><span>FIRE</span><strong id="bmb-ctrl-range">1</strong></div>
            <div class="bmb-stat"><span>RANK</span><strong id="bmb-ctrl-rank">#1</strong></div>
            <div class="bmb-stat"><span>DASH</span><strong id="bmb-ctrl-dash">SIAP</strong></div>
          </div>
          <div class="bmb-ctrl-phase" id="bmb-ctrl-phase">Menunggu host memilih arena...</div>
          <canvas id="bmb-ctrl-radar" class="bmb-ctrl-radar" width="150" height="96"></canvas>
        </div>

        <div class="bmb-ctrl-actions">
          <button type="button" id="bmb-bomb-btn" class="pad-btn bmb-bomb-btn">
            <span class="pad-btn-icon" style="font-size:26px;font-weight:900;">BOM</span>
            <span class="pad-btn-label">JATUHKAN BOM</span>
          </button>
          <button type="button" id="bmb-dash-btn" class="pad-btn bmb-dash-btn">
            <span class="pad-btn-icon" style="font-size:23px;font-weight:900;">DASH</span>
            <span class="pad-btn-label">MENGHINDAR</span>
          </button>
          <div class="bmb-ctrl-hint">D-Pad untuk bergerak.<br>Bom untuk menyerang, dash untuk kabur.</div>
        </div>
      </div>
    `;

    this.statusBadgeEl = container.querySelector('#bmb-ctrl-status');
    this.arenaEl = container.querySelector('#bmb-ctrl-arena');
    this.timerEl = container.querySelector('#bmb-ctrl-timer');
    this.timerFillEl = container.querySelector('#bmb-ctrl-timer-fill');
    this.heartsEl = container.querySelector('#bmb-ctrl-hearts');
    this.winsEl = container.querySelector('#bmb-ctrl-wins');
    this.bombsEl = container.querySelector('#bmb-ctrl-bombs');
    this.rangeEl = container.querySelector('#bmb-ctrl-range');
    this.rankEl = container.querySelector('#bmb-ctrl-rank');
    this.dashEl = container.querySelector('#bmb-ctrl-dash');
    this.phaseEl = container.querySelector('#bmb-ctrl-phase');
    this.bombBtnEl = container.querySelector('#bmb-bomb-btn');
    this.dashBtnEl = container.querySelector('#bmb-dash-btn');
    this.radarCanvas = container.querySelector('#bmb-ctrl-radar');

    for (const btn of Array.from(container.querySelectorAll<HTMLElement>('[data-bmb-dir]'))) {
      const dir = btn.dataset.bmbDir as DirKey | undefined;
      if (!dir) continue;
      bindHoldButton(
        btn,
        (pressed) => {
          this.dirs[dir] = pressed;
        },
        ctx.onUnlockAudio
      );
    }

    bindHoldButton(
      this.bombBtnEl,
      (pressed) => {
        this.bombPressed = pressed;
        if (pressed) this.bombPulseUntil = performance.now() + 160;
      },
      ctx.onUnlockAudio
    );
    bindHoldButton(
      this.dashBtnEl,
      (pressed) => {
        this.dashPressed = pressed;
        if (pressed) this.dashPulseUntil = performance.now() + 160;
      },
      ctx.onUnlockAudio
    );

    container.querySelector('#bmb-ctrl-fs')?.addEventListener('click', () => ctx.onToggleFullscreen());
    ctx.onBindLandscapeGuard();
    this.updateTransport(ctx.transportMode);
    this.render();
  }

  updateTransport(mode: TransportMode): void {
    updateTransportBadge(this.statusBadgeEl, mode);
  }

  updateTelemetry(t: TelemetryPacket): void {
    this.view = decodeBomberTelemetry(t);
    if (this.radarCanvas) {
      drawRadarBlips(this.radarCanvas, t, this.ctx?.slot ?? 0);
    }
    this.render();
  }

  getOutput(): ControllerOutput {
    const left = this.dirs.left && !this.dirs.right;
    const right = this.dirs.right && !this.dirs.left;
    const now = performance.now();
    return {
      steer: left ? -1 : right ? 1 : 0,
      gas: this.dirs.up,
      brake: this.dirs.down,
      drift: false,
      item: this.bombPressed || now < this.bombPulseUntil,
      boost: this.dashPressed || now < this.dashPulseUntil,
    };
  }

  releaseAllInputs(): void {
    this.resetInputs();
    this.root
      ?.querySelectorAll('.bmb-dpad-btn.pressed, .bmb-bomb-btn.pressed, .bmb-dash-btn.pressed')
      .forEach((el) => el.classList.remove('pressed'));
  }

  unmount(): void {
    this.releaseAllInputs();
    this.view = null;
    this.root = null;
    this.ctx = null;
  }

  private resetInputs(): void {
    this.dirs = { up: false, down: false, left: false, right: false };
    this.bombPressed = false;
    this.dashPressed = false;
    this.bombPulseUntil = 0;
    this.dashPulseUntil = 0;
  }

  private render(): void {
    const view = this.view;
    if (!view) return;

    const live = view.phase === 'live' && !view.countdown;
    const canBomb = live && view.alive && view.bombsReady > 0;
    const canDash = live && view.alive && view.dashCooldown <= 0;

    if (this.arenaEl) {
      const arenaLabel =
        view.arenaIndex >= 0 ? getArenaName(view.arenaIndex) : 'Host memilih arena...';
      const roundLabel = view.round > 0 && view.maxRounds > 0
        ? ` • R${view.round}/${view.maxRounds}`
        : '';
      this.arenaEl.textContent = `${arenaLabel}${roundLabel}`;
    }

    if (this.timerEl) {
      this.timerEl.innerHTML =
        view.phase === 'preparing' || view.phase === 'round-end' || view.phase === 'match-over'
          ? '--<small>s</small>'
          : `${view.timerSeconds}<small>s</small>`;
    }

    if (this.timerFillEl) {
      const arenaSeconds =
        view.arenaIndex >= 0
          ? BOMBER_ARENAS[view.arenaIndex]?.roundSeconds ?? 90
          : 90;
      let pct = 0;
      if (view.countdown) {
        pct = (view.timerSeconds / 3) * 100;
      } else if (view.phase === 'live') {
        pct = (view.timerSeconds / arenaSeconds) * 100;
      }
      this.timerFillEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    }

    if (this.heartsEl) {
      const hearts: string[] = [];
      for (let i = 0; i < 3; i++) {
        hearts.push(
          `<span class="${i < view.lives ? '' : 'empty'}">${i < view.lives ? '♥' : '♡'}</span>`
        );
      }
      this.heartsEl.innerHTML = hearts.join('');
    }

    if (this.winsEl) {
      this.winsEl.textContent = `${view.wins} MENANG`;
    }
    if (this.bombsEl) {
      this.bombsEl.textContent = `${view.bombsReady}/${view.maxBombs}`;
    }
    if (this.rangeEl) {
      this.rangeEl.textContent = String(view.range);
    }
    if (this.rankEl) {
      this.rankEl.textContent = `#${view.rank}/${view.totalPlayers}`;
    }
    if (this.dashEl) {
      this.dashEl.textContent = view.dashCooldown > 0 ? `${view.dashCooldown}s` : 'SIAP';
    }

    if (this.phaseEl) {
      if (view.phase === 'preparing') {
        this.phaseEl.textContent = 'Menunggu host memilih arena...';
      } else if (view.countdown) {
        this.phaseEl.textContent = `SIAP! ${view.timerSeconds}`;
      } else if (view.phase === 'round-end') {
        this.phaseEl.textContent = 'Ronde selesai';
      } else if (view.phase === 'match-over') {
        this.phaseEl.textContent = 'Pertandingan selesai';
      } else if (!view.alive) {
        this.phaseEl.textContent =
          view.lives > 0 ? 'Menunggu respawn...' : 'Tereliminasi';
      } else {
        this.phaseEl.textContent = view.shielded ? 'Perisai aktif!' : 'Bergerak!';
      }
    }

    if (this.bombBtnEl) {
      this.bombBtnEl.classList.toggle('bmb-ready', canBomb);
      this.bombBtnEl.classList.toggle('bmb-dim', !canBomb);
    }
    if (this.dashBtnEl) {
      this.dashBtnEl.classList.toggle('bmb-ready', canDash);
      this.dashBtnEl.classList.toggle('bmb-dim', !canDash);
    }
  }
}
