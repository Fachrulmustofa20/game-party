import { TelemetryPacket } from '../net/BinaryProtocol';
import { TransportMode } from '../net/HostNetworkManager';
import {
  ControllerOutput,
  ControllerViewContext,
  GameControllerView,
  bindFloatingAnalog,
  bindHoldButton,
  drawRadarBlips,
  updateTransportBadge,
} from './GameControllerView';

/**
 * Default modular controller for general / non-CTR games:
 * - Left: Switchable between Analog Stick and 4-Way Arrow Buttons (Atas, Bawah, Kiri, Kanan)
 * - Center: Player HUD, Mode Switch above Minimap/Radar
 * - Right: Classic A, B, C, D Action Buttons
 */
export class DefaultController implements GameControllerView {
  readonly id = 'default-abcd';
  private root: HTMLElement | null = null;
  private ctx: ControllerViewContext | null = null;
  private cleanupAnalog: (() => void) | null = null;

  private touchSteer = 0;
  private analogUp = false;
  private analogDown = false;
  private arrowMode = localStorage.getItem('default_steer_mode') === 'arrow';
  private arrowState = { up: false, down: false, left: false, right: false };
  private buttons = {
    a: false, // item
    b: false, // boost
    c: false, // drift
    d: false, // gas
  };

  private statusBadgeEl: HTMLElement | null = null;
  private rankEl: HTMLElement | null = null;
  private roundEl: HTMLElement | null = null;
  private scoreEl: HTMLElement | null = null;
  private radarCanvas: HTMLCanvasElement | null = null;

  mount(container: HTMLElement, ctx: ControllerViewContext): void {
    this.root = container;
    this.ctx = ctx;

    container.innerHTML = `
      <div class="ctrl-gamepad">
        <!-- Left: Analog Stick OR 4-Way Arrow Pad (Atas, Bawah, Kanan, Kiri) -->
        <div class="steer-zone">
          <div class="analog-base" id="def-analog-base" style="${this.arrowMode ? 'display:none;' : ''}">
            <div class="analog-knob" id="def-analog-knob"></div>
          </div>

          <div class="dpad-4way-grid" id="def-arrow-pad" style="${this.arrowMode ? '' : 'display:none;'}">
            <button type="button" id="arr-up" class="dpad-btn arr-up" aria-label="Atas">
              <span aria-hidden="true">▲</span>
              <span class="dpad-sub">ATAS</span>
            </button>
            <button type="button" id="arr-left" class="dpad-btn arr-left" aria-label="Kiri">
              <span aria-hidden="true">◀</span>
              <span class="dpad-sub">KIRI</span>
            </button>
            <button type="button" id="arr-right" class="dpad-btn arr-right" aria-label="Kanan">
              <span aria-hidden="true">▶</span>
              <span class="dpad-sub">KANAN</span>
            </button>
            <button type="button" id="arr-down" class="dpad-btn arr-down" aria-label="Bawah">
              <span aria-hidden="true">▼</span>
              <span class="dpad-sub">BAWAH</span>
            </button>
          </div>

          <div id="def-analog-hint" style="font-size:11px;color:var(--muted);text-align:center;${
            this.arrowMode ? 'display:none;' : ''
          }">
            Geser Analog 360°
          </div>
        </div>

        <!-- Center: Live HUD, Switch & Radar -->
        <div class="center-hud">
          <div style="display:flex;justify-content:space-between;width:100%;font-size:11px;align-items:center;gap:6px;">
            <span style="font-weight:900;color:${ctx.color};">P${ctx.slot + 1}</span>
            <span id="status-badge" class="badge-ws">Connecting...</span>
          </div>

          <div style="display:flex;justify-content:space-around;width:100%;align-items:baseline;">
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">POSISI</div>
              <div id="hud-rank" style="font-size:20px;font-weight:900;">1/1</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">RONDE</div>
              <div id="hud-lap" style="font-size:18px;font-weight:800;">1/3</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">SKOR</div>
              <div id="hud-speed" style="font-size:18px;font-weight:800;">0</div>
            </div>
          </div>

          <button
            id="btn-def-mode"
            type="button"
            role="switch"
            aria-checked="${this.arrowMode}"
            class="analog-mode-switch ${this.arrowMode ? 'active' : ''}"
          >
            <span class="analog-switch-dot" aria-hidden="true"></span>
            <span id="def-mode-label">
              ${this.arrowMode ? 'Mode: Tombol Arah' : 'Mode: Analog'}
            </span>
          </button>

          <canvas id="radar-canvas" width="120" height="72" style="background:#070b14;border-radius:10px;border:1px solid rgba(255,255,255,0.12);"></canvas>
        </div>

        <!-- Right: Default A, B, C, D Buttons -->
        <div class="action-zone">
          <button id="btn-a" class="pad-btn btn-item">
            <span class="abcd-letter">A</span>
          </button>
          <button id="btn-b" class="pad-btn btn-boost boost-ready">
            <span class="abcd-letter">B</span>
          </button>
          <button id="btn-c" class="pad-btn btn-drift">
            <span class="abcd-letter">C</span>
          </button>
          <button id="btn-d" class="pad-btn btn-gas">
            <span class="abcd-letter">D</span>
          </button>
        </div>
      </div>
    `;

    this.statusBadgeEl = container.querySelector('#status-badge');
    this.rankEl = container.querySelector('#hud-rank');
    this.roundEl = container.querySelector('#hud-lap');
    this.scoreEl = container.querySelector('#hud-speed');
    this.radarCanvas = container.querySelector('#radar-canvas');

    this.updateTransport(ctx.transportMode);

    const zone = container.querySelector('.steer-zone') as HTMLElement;
    const base = container.querySelector('#def-analog-base') as HTMLElement;
    const knob = container.querySelector('#def-analog-knob') as HTMLElement;
    this.cleanupAnalog = bindFloatingAnalog(
      zone,
      base,
      knob,
      () => this.arrowMode,
      (nx, ny) => {
        this.touchSteer = nx;
        this.analogUp = ny < -0.25;
        this.analogDown = ny > 0.25;
      },
      () => {
        this.touchSteer = 0;
        this.analogUp = false;
        this.analogDown = false;
      }
    );

    bindHoldButton(container.querySelector('#arr-up'), (v) => (this.arrowState.up = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#arr-down'), (v) => (this.arrowState.down = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#arr-left'), (v) => (this.arrowState.left = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#arr-right'), (v) => (this.arrowState.right = v), ctx.onUnlockAudio);

    bindHoldButton(container.querySelector('#btn-a'), (v) => (this.buttons.a = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#btn-b'), (v) => (this.buttons.b = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#btn-c'), (v) => (this.buttons.c = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#btn-d'), (v) => (this.buttons.d = v), ctx.onUnlockAudio);

    const switchBtn = container.querySelector('#btn-def-mode') as HTMLButtonElement | null;
    const modeLabel = container.querySelector('#def-mode-label');
    const arrowPad = container.querySelector('#def-arrow-pad') as HTMLElement | null;
    const hintEl = container.querySelector('#def-analog-hint') as HTMLElement | null;

    switchBtn?.addEventListener('click', () => {
      this.arrowMode = !this.arrowMode;
      localStorage.setItem('default_steer_mode', this.arrowMode ? 'arrow' : 'analog');
      this.releaseAllInputs();
      switchBtn.setAttribute('aria-checked', String(this.arrowMode));
      switchBtn.classList.toggle('active', this.arrowMode);
      base.style.display = this.arrowMode ? 'none' : '';
      if (arrowPad) arrowPad.style.display = this.arrowMode ? '' : 'none';
      if (hintEl) hintEl.style.display = this.arrowMode ? 'none' : '';
      if (modeLabel) {
        modeLabel.textContent = this.arrowMode ? 'Mode: Tombol Arah' : 'Mode: Analog';
      }
      navigator.vibrate?.(16);
    });

    container.querySelector('#btn-fs')?.addEventListener('click', () => {
      ctx.onToggleFullscreen();
    });

    ctx.onBindLandscapeGuard();
  }

  updateTransport(mode: TransportMode): void {
    updateTransportBadge(this.statusBadgeEl, mode);
  }

  updateTelemetry(t: TelemetryPacket): void {
    if (this.rankEl) this.rankEl.textContent = `${t.rank}/${t.totalPlayers}`;
    if (this.roundEl) this.roundEl.textContent = `${t.lap}/${t.maxLaps}`;
    if (this.scoreEl) this.scoreEl.textContent = String(t.speedKmh);
    drawRadarBlips(this.radarCanvas, t, this.ctx?.slot ?? 0);
  }

  getOutput(): ControllerOutput {
    const steer = this.arrowMode
      ? (this.arrowState.left ? -1 : 0) + (this.arrowState.right ? 1 : 0)
      : this.touchSteer;
    const gas = this.buttons.d || (this.arrowMode ? this.arrowState.up : this.analogUp);
    const brake = this.arrowMode ? this.arrowState.down : this.analogDown;
    return {
      steer,
      gas,
      brake,
      drift: this.buttons.c,
      item: this.buttons.a,
      boost: this.buttons.b,
    };
  }

  releaseAllInputs(): void {
    this.touchSteer = 0;
    this.analogUp = false;
    this.analogDown = false;
    this.arrowState = { up: false, down: false, left: false, right: false };
    this.buttons = { a: false, b: false, c: false, d: false };
    this.root?.querySelectorAll('.pad-btn.pressed, .dpad-btn.pressed').forEach((el) =>
      el.classList.remove('pressed')
    );
  }

  unmount(): void {
    this.cleanupAnalog?.();
    this.cleanupAnalog = null;
    this.releaseAllInputs();
    this.root = null;
  }
}
