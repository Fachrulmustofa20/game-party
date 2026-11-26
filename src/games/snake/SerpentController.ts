import { TelemetryPacket } from '../../net/BinaryProtocol';
import { TransportMode } from '../../net/HostNetworkManager';
import {
  CTRL_SVG_ICONS,
  ControllerOutput,
  ControllerViewContext,
  GameControllerView,
  bindFloatingAnalog,
  bindHoldButton,
  updateTransportBadge,
} from '../../controller/GameControllerView';

const SNAKE_COLORS = [
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

/**
 * Neon Serpent controller: 360-degree analog aiming + boost.
 * steer is encoded as an absolute heading in -1..1 (multiply by PI on host).
 */
export class SerpentController implements GameControllerView {
  readonly id = 'neon-serpent';
  private root: HTMLElement | null = null;
  private mySlot = 0;
  private aim = 0;
  private dash = false;
  private cleanupAnalog: (() => void) | null = null;

  private statusBadgeEl: HTMLElement | null = null;
  private stateEl: HTMLElement | null = null;
  private rankEl: HTMLElement | null = null;
  private lengthEl: HTMLElement | null = null;
  private timeEl: HTMLElement | null = null;
  private fuelFillEl: HTMLElement | null = null;
  private fuelLabelEl: HTMLElement | null = null;
  private dashBtnEl: HTMLButtonElement | null = null;
  private dashLabelEl: HTMLElement | null = null;
  private radarCanvas: HTMLCanvasElement | null = null;

  mount(container: HTMLElement, ctx: ControllerViewContext): void {
    this.root = container;
    this.mySlot = ctx.slot;
    this.aim = 0;

    container.innerHTML = `
      <div class="ctrl-gamepad" style="grid-template-columns:1.1fr 0.9fr 0.8fr;">
        <div class="steer-zone">
          <div id="serp-analog-base" class="analog-base" style="width:min(62vw,220px);height:min(62vw,220px);max-width:220px;max-height:220px;">
            <div id="serp-analog-knob" class="analog-knob"></div>
          </div>
          <div style="font-size:11px;color:var(--muted);text-align:center;">Geser analog untuk arah 360°</div>
        </div>

        <div class="center-hud">
          <div style="display:flex;justify-content:space-between;width:100%;font-size:11px;align-items:center;gap:6px;">
            <span style="font-weight:900;color:${ctx.color};">P${ctx.slot + 1}</span>
            <button id="serp-ctrl-fs" class="btn btn-secondary ctrl-top-btn" style="padding:3px 8px;font-size:10px;">
              ${CTRL_SVG_ICONS.fullscreen}
              <span>Fullscreen</span>
            </button>
            <span id="serp-ctrl-status" class="badge-ws">Connecting...</span>
          </div>

          <div style="font-size:20px;font-weight:900;letter-spacing:0.08em;color:#22d3ee;text-align:center;">NEON SERPENT</div>

          <div style="display:flex;justify-content:space-around;width:100%;align-items:baseline;">
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">PANJANG</div>
              <div id="serp-ctrl-length" style="font-size:19px;font-weight:900;">8</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">POSISI</div>
              <div id="serp-ctrl-rank" style="font-size:18px;font-weight:800;">1/1</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">WAKTU</div>
              <div id="serp-ctrl-time" style="font-size:18px;font-weight:800;">120s</div>
            </div>
          </div>

          <div id="serp-ctrl-state" style="font-size:12px;font-weight:900;color:#4ade80;text-align:center;">ALIVE</div>

          <div style="width:100%;display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);">
              <span>BOOST FUEL</span>
              <span id="serp-ctrl-fuel-label">0%</span>
            </div>
            <div class="turbo-bar-wrap">
              <div id="serp-ctrl-fuel-fill" class="turbo-bar-fill" style="width:0%;background:linear-gradient(90deg,#22d3ee,#a3e635);"></div>
            </div>
          </div>

          <canvas id="serp-ctrl-radar" width="120" height="72" style="background:#070b14;border-radius:10px;border:1px solid rgba(255,255,255,0.12);"></canvas>
        </div>

        <div class="action-zone" style="grid-template-columns:1fr;grid-template-rows:1fr;">
          <button id="serp-ctrl-boost" class="pad-btn btn-boost boost-ready" style="height:100%;min-height:120px;">
            <span class="pad-btn-icon">⚡</span>
            <span class="pad-btn-label">BOOST</span>
            <span id="serp-ctrl-boost-label" style="font-size:11px;font-weight:800;color:#fef9c3;">SIAP</span>
          </button>
        </div>
      </div>
    `;

    this.statusBadgeEl = container.querySelector('#serp-ctrl-status');
    this.stateEl = container.querySelector('#serp-ctrl-state');
    this.rankEl = container.querySelector('#serp-ctrl-rank');
    this.lengthEl = container.querySelector('#serp-ctrl-length');
    this.timeEl = container.querySelector('#serp-ctrl-time');
    this.fuelFillEl = container.querySelector('#serp-ctrl-fuel-fill');
    this.fuelLabelEl = container.querySelector('#serp-ctrl-fuel-label');
    this.dashBtnEl = container.querySelector('#serp-ctrl-boost');
    this.dashLabelEl = container.querySelector('#serp-ctrl-boost-label');
    this.radarCanvas = container.querySelector('#serp-ctrl-radar');

    this.updateTransport(ctx.transportMode);
    this.updateBoostState(0, true);

    const zone = container.querySelector('.steer-zone') as HTMLElement | null;
    const base = container.querySelector('#serp-analog-base') as HTMLElement | null;
    const knob = container.querySelector('#serp-analog-knob') as HTMLElement | null;
    if (zone && base && knob) {
      this.cleanupAnalog = bindFloatingAnalog(
        zone,
        base,
        knob,
        () => false,
        (nx, ny) => {
          if (Math.hypot(nx, ny) < 0.16) return;
          this.aim = Math.atan2(ny, nx) / Math.PI;
        },
        () => {
          // Keep the last heading when the finger lifts.
        }
      );
    }

    bindHoldButton(
      container.querySelector('#serp-ctrl-boost'),
      (pressed) => {
        this.dash = pressed;
      },
      ctx.onUnlockAudio
    );

    container.querySelector('#serp-ctrl-fs')?.addEventListener('click', () => ctx.onToggleFullscreen());
    ctx.onBindLandscapeGuard();
  }

  updateTransport(mode: TransportMode): void {
    updateTransportBadge(this.statusBadgeEl, mode);
  }

  updateTelemetry(t: TelemetryPacket): void {
    const dead = t.itemId === 0;
    if (this.lengthEl) this.lengthEl.textContent = String(t.speedKmh);
    if (this.rankEl) this.rankEl.textContent = `${t.rank}/${t.totalPlayers}`;
    if (this.timeEl) this.timeEl.textContent = `${t.lap}s`;
    if (this.stateEl) {
      this.stateEl.textContent = dead ? `RESPAWN ${Math.ceil(t.boostCooldownSec ?? 0)}s` : 'ALIVE';
      this.stateEl.style.color = dead ? '#f87171' : '#4ade80';
    }
    if (this.fuelFillEl) this.fuelFillEl.style.width = `${Math.max(0, Math.min(100, t.turboCharge))}%`;
    if (this.fuelLabelEl) this.fuelLabelEl.textContent = `${Math.round(t.turboCharge)}%`;
    this.updateBoostState(t.boostCooldownSec ?? 0, !dead && t.turboCharge > 0);
    this.drawRadar(t);
  }

  getOutput(): ControllerOutput {
    return {
      steer: this.aim,
      gas: false,
      brake: false,
      drift: false,
      item: false,
      boost: this.dash,
    };
  }

  releaseAllInputs(): void {
    this.aim = 0;
    this.dash = false;
    this.root?.querySelectorAll('.pad-btn.pressed').forEach((el) => el.classList.remove('pressed'));
  }

  unmount(): void {
    this.cleanupAnalog?.();
    this.cleanupAnalog = null;
    this.releaseAllInputs();
    this.root = null;
  }

  private updateBoostState(respawnSec: number, ready: boolean): void {
    const dead = respawnSec > 0;
    if (this.dashBtnEl) {
      this.dashBtnEl.classList.toggle('boost-ready', ready);
      this.dashBtnEl.classList.toggle('boost-cooldown', !ready);
    }
    if (this.dashLabelEl) {
      if (dead) this.dashLabelEl.textContent = `${Math.ceil(respawnSec)}s`;
      else this.dashLabelEl.textContent = ready ? 'SIAP' : 'MINIM';
    }
  }

  private drawRadar(t: TelemetryPacket): void {
    const canvas = this.radarCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    for (const blip of t.karts) {
      const slot = blip.slot % 100;
      const px = (blip.x / 255) * (w - 12) + 6;
      const py = (blip.z / 255) * (h - 12) + 6;
      ctx.beginPath();
      ctx.arc(px, py, slot === this.mySlot ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = SNAKE_COLORS[slot % SNAKE_COLORS.length];
      ctx.fill();
      if (slot === this.mySlot) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }
}
