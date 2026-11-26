import { TelemetryPacket } from '../../net/BinaryProtocol';
import { TransportMode } from '../../net/HostNetworkManager';
import {
  CTRL_SVG_ICONS,
  ControllerOutput,
  ControllerViewContext,
  GameControllerView,
  bindFloatingAnalog,
  bindHoldButton,
  drawRadarBlips,
  updateTransportBadge,
} from '../../controller/GameControllerView';

const ITEM_LABELS: Record<number, { icon: string; name: string }> = {
  0: { icon: '', name: 'KOSONG' },
  1: { icon: '🚀', name: 'ROKET' },
  2: { icon: '💣', name: 'BOM' },
  3: { icon: '🧨', name: 'TNT' },
  4: { icon: '🛡️', name: 'SHIELD' },
  5: { icon: '⚡', name: 'TURBO' },
};

/**
 * Dedicated controller for Nitro Kart 3D (CTR Edition).
 */
export class KartController implements GameControllerView {
  readonly id = 'nitro-kart-3d';
  private root: HTMLElement | null = null;
  private ctx: ControllerViewContext | null = null;
  private cleanupAnalog: (() => void) | null = null;

  private touchSteer = 0;
  private analogBrake = false;
  private dpadMode = false;
  private dpadState = { down: false, left: false, right: false };
  private buttons = {
    gas: false,
    brake: false,
    drift: false,
    item: false,
    boost: false,
  };

  private statusBadgeEl: HTMLElement | null = null;
  private rankEl: HTMLElement | null = null;
  private lapEl: HTMLElement | null = null;
  private speedEl: HTMLElement | null = null;
  private turboFillEl: HTMLElement | null = null;
  private itemIconEl: HTMLElement | null = null;
  private boostBtnEl: HTMLButtonElement | null = null;
  private boostLabelEl: HTMLElement | null = null;
  private radarCanvas: HTMLCanvasElement | null = null;

  mount(container: HTMLElement, ctx: ControllerViewContext): void {
    this.root = container;
    this.ctx = ctx;

    container.innerHTML = `
      <div class="ctrl-gamepad">
        <!-- Left: Analog Stick OR 3-Button Pad (Kiri, Mundur, Kanan) -->
        <div class="steer-zone">
          <div class="analog-base" id="analog-base" style="${this.dpadMode ? 'display:none;' : ''}">
            <div class="analog-knob" id="analog-knob"></div>
          </div>

          <div class="dpad-grid" id="dpad-pad" style="${this.dpadMode ? '' : 'display:none;'}">
            <button type="button" id="dpad-left" class="dpad-btn dpad-left" aria-label="Kiri">
              <span aria-hidden="true">◀</span>
              <span class="dpad-sub">KIRI</span>
            </button>
            <button type="button" id="dpad-down" class="dpad-btn dpad-down" aria-label="Mundur">
              <span aria-hidden="true">▼</span>
              <span class="dpad-sub">MUNDUR</span>
            </button>
            <button type="button" id="dpad-right" class="dpad-btn dpad-right" aria-label="Kanan">
              <span aria-hidden="true">▶</span>
              <span class="dpad-sub">KANAN</span>
            </button>
          </div>

          <div id="analog-hint" style="font-size:11px;color:var(--muted);text-align:center;${
            this.dpadMode ? 'display:none;' : ''
          }">
            Geser Kiri / Kanan untuk Stir &bull; Bawah untuk Mundur
          </div>
        </div>

        <!-- Center: Live HUD & Minimap -->
        <div class="center-hud">
          <div style="display:flex;justify-content:space-between;width:100%;font-size:11px;align-items:center;gap:6px;">
            <span style="font-weight:900;color:${ctx.color};">P${ctx.slot + 1}</span>
            <button id="btn-fs" class="btn btn-secondary ctrl-top-btn" style="padding:3px 8px;font-size:10px;">
              ${CTRL_SVG_ICONS.fullscreen}
              <span>Fullscreen</span>
            </button>
            <span id="status-badge" class="badge-ws">Connecting...</span>
          </div>

          <div style="display:flex;justify-content:space-around;width:100%;align-items:baseline;">
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">POSISI</div>
              <div id="hud-rank" style="font-size:22px;font-weight:900;">1/1</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">LAP</div>
              <div id="hud-lap" style="font-size:18px;font-weight:800;">1/3</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">KM/H</div>
              <div id="hud-speed" style="font-size:18px;font-weight:800;">0</div>
            </div>
          </div>

          <button
            id="btn-analog-mode"
            type="button"
            role="switch"
            aria-checked="${this.dpadMode}"
            class="analog-mode-switch ${this.dpadMode ? 'active' : ''}"
          >
            <span class="analog-switch-dot" aria-hidden="true"></span>
            <span id="analog-mode-label">
              ${this.dpadMode ? 'Mode: Tombol 3 Arah' : 'Mode: Analog Stir'}
            </span>
          </button>

          <canvas id="radar-canvas" width="120" height="72" style="background:#070b14;border-radius:10px;border:1px solid rgba(255,255,255,0.12);"></canvas>

          <div style="width:100%;">
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;">
              <span>CTR TURBO BAR</span>
              <span id="turbo-hint" style="color:var(--warn);">Tap BOOST saat Merah!</span>
            </div>
            <div class="turbo-bar-wrap">
              <div id="turbo-fill" class="turbo-bar-fill"></div>
            </div>
          </div>
        </div>

        <!-- Right: CTR Action Buttons -->
        <div class="action-zone">
          <button id="btn-item" class="pad-btn btn-item">
            <span id="item-icon" class="pad-btn-icon">${CTRL_SVG_ICONS.itemEmpty}</span>
            <span class="pad-btn-label">ITEM</span>
          </button>
          <button id="btn-boost" class="pad-btn btn-boost boost-cooldown">
            <span class="pad-btn-icon">${CTRL_SVG_ICONS.boost}</span>
            <span id="boost-label" class="pad-btn-label">15s</span>
          </button>
          <button id="btn-drift" class="pad-btn btn-drift">
            <span class="pad-btn-icon">${CTRL_SVG_ICONS.drift}</span>
            <span class="pad-btn-label">DRIFT / HOP</span>
          </button>
          <button id="btn-gas" class="pad-btn btn-gas">
            <span class="pad-btn-icon">${CTRL_SVG_ICONS.gas}</span>
            <span class="pad-btn-label">GAS</span>
          </button>
        </div>
      </div>
    `;

    this.statusBadgeEl = container.querySelector('#status-badge');
    this.rankEl = container.querySelector('#hud-rank');
    this.lapEl = container.querySelector('#hud-lap');
    this.speedEl = container.querySelector('#hud-speed');
    this.turboFillEl = container.querySelector('#turbo-fill');
    this.itemIconEl = container.querySelector('#item-icon');
    this.boostBtnEl = container.querySelector('#btn-boost');
    this.boostLabelEl = container.querySelector('#boost-label');
    this.radarCanvas = container.querySelector('#radar-canvas');

    this.updateTransport(ctx.transportMode);

    const zone = container.querySelector('.steer-zone') as HTMLElement;
    const base = container.querySelector('#analog-base') as HTMLElement;
    const knob = container.querySelector('#analog-knob') as HTMLElement;
    this.cleanupAnalog = bindFloatingAnalog(
      zone,
      base,
      knob,
      () => this.dpadMode,
      (nx, ny) => {
        this.touchSteer = nx;
        this.analogBrake = ny > 0.35;
      },
      () => {
        this.touchSteer = 0;
        this.analogBrake = false;
      }
    );

    bindHoldButton(container.querySelector('#dpad-down'), (v) => (this.dpadState.down = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#dpad-left'), (v) => (this.dpadState.left = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#dpad-right'), (v) => (this.dpadState.right = v), ctx.onUnlockAudio);

    bindHoldButton(container.querySelector('#btn-gas'), (v) => (this.buttons.gas = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#btn-drift'), (v) => (this.buttons.drift = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#btn-item'), (v) => (this.buttons.item = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#btn-boost'), (v) => (this.buttons.boost = v), ctx.onUnlockAudio);

    const switchBtn = container.querySelector('#btn-analog-mode') as HTMLButtonElement | null;
    const labelEl = container.querySelector('#analog-mode-label');
    const dpadPad = container.querySelector('#dpad-pad') as HTMLElement | null;
    const hintEl = container.querySelector('#analog-hint') as HTMLElement | null;

    switchBtn?.addEventListener('click', () => {
      this.dpadMode = !this.dpadMode;
      this.touchSteer = 0;
      this.analogBrake = false;
      this.dpadState = { down: false, left: false, right: false };
      this.root?.querySelectorAll('.dpad-btn.pressed').forEach((el) => el.classList.remove('pressed'));

      switchBtn.setAttribute('aria-checked', String(this.dpadMode));
      switchBtn.classList.toggle('active', this.dpadMode);
      base.style.display = this.dpadMode ? 'none' : '';
      if (dpadPad) dpadPad.style.display = this.dpadMode ? '' : 'none';
      if (hintEl) hintEl.style.display = this.dpadMode ? 'none' : '';
      if (labelEl) {
        labelEl.textContent = this.dpadMode ? 'Mode: Tombol 3 Arah' : 'Mode: Analog Stir';
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
    if (this.lapEl) this.lapEl.textContent = `${t.lap}/${t.maxLaps}`;
    if (this.speedEl) this.speedEl.textContent = String(t.speedKmh);
    if (this.turboFillEl) {
      this.turboFillEl.style.width = `${t.turboCharge}%`;
      this.turboFillEl.style.filter = t.turboZone === 2 ? 'brightness(1.35)' : 'none';
    }
    if (this.itemIconEl) {
      const item = ITEM_LABELS[t.itemId] ?? ITEM_LABELS[0];
      if (item.icon) {
        this.itemIconEl.textContent = item.icon;
      } else {
        this.itemIconEl.innerHTML = CTRL_SVG_ICONS.itemEmpty;
      }
    }
    if (this.boostBtnEl && this.boostLabelEl) {
      const cd = t.boostCooldownSec ?? 0;
      const ready = cd <= 0 || t.turboCharge >= 50;
      this.boostBtnEl.classList.toggle('boost-cooldown', !ready);
      this.boostBtnEl.classList.toggle('boost-ready', ready);
      this.boostLabelEl.textContent = ready ? 'BOOST' : `${cd}s`;
    }
    drawRadarBlips(this.radarCanvas, t, this.ctx?.slot ?? 0);
  }

  getOutput(): ControllerOutput {
    const steer = this.dpadMode
      ? (this.dpadState.left ? -1 : 0) + (this.dpadState.right ? 1 : 0)
      : this.touchSteer;
    const brake = this.buttons.brake || (this.dpadMode ? this.dpadState.down : this.analogBrake);
    return {
      steer,
      gas: this.buttons.gas,
      brake,
      drift: this.buttons.drift,
      item: this.buttons.item,
      boost: this.buttons.boost,
    };
  }

  releaseAllInputs(): void {
    this.touchSteer = 0;
    this.analogBrake = false;
    this.dpadState = { down: false, left: false, right: false };
    this.buttons = { gas: false, brake: false, drift: false, item: false, boost: false };
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
