import { TelemetryPacket } from '../../net/BinaryProtocol';
import { TransportMode } from '../../net/HostNetworkManager';
import {
  CTRL_SVG_ICONS,
  ControllerOutput,
  ControllerViewContext,
  GameControllerView,
  bindHoldButton,
  updateTransportBadge,
} from '../../controller/GameControllerView';

type DirectionKey = 'up' | 'down' | 'left' | 'right';

/**
 * Dedicated Pac-Man: Ghost Hunt controller.
 * Both teams use the same 4-way D-pad + DASH layout.
 * The center HUD shows the player's role, power-pellet progress, lives, and team status.
 */
export class PacController implements GameControllerView {
  readonly id = 'pacman-ghost-hunt';
  private root: HTMLElement | null = null;
  private mySlot = 0;
  private statusBadgeEl: HTMLElement | null = null;
  private roleEl: HTMLElement | null = null;
  private powerEl: HTMLElement | null = null;
  private livesEl: HTMLElement | null = null;
  private teamsEl: HTMLElement | null = null;
  private powerFillEl: HTMLElement | null = null;
  private powerLabelEl: HTMLElement | null = null;
  private dashBtnEl: HTMLButtonElement | null = null;
  private dashLabelEl: HTMLElement | null = null;
  private radarCanvas: HTMLCanvasElement | null = null;

  private direction = { up: false, down: false, left: false, right: false };
  private dash = false;

  mount(container: HTMLElement, ctx: ControllerViewContext): void {
    this.root = container;
    this.mySlot = ctx.slot;

    container.innerHTML = `
      <div class="ctrl-gamepad" style="grid-template-columns:1.15fr 0.85fr 0.8fr;">
        <div class="steer-zone">
          <div class="dpad-4way-grid" style="width:min(100%,280px);height:min(100%,280px);max-height:280px;flex:0 1 auto;">
            <button type="button" id="pac-dir-up" class="dpad-btn arr-up" aria-label="Atas">
              <span aria-hidden="true">▲</span>
              <span class="dpad-sub">ATAS</span>
            </button>
            <button type="button" id="pac-dir-left" class="dpad-btn arr-left" aria-label="Kiri">
              <span aria-hidden="true">◀</span>
              <span class="dpad-sub">KIRI</span>
            </button>
            <button type="button" id="pac-dir-right" class="dpad-btn arr-right" aria-label="Kanan">
              <span aria-hidden="true">▶</span>
              <span class="dpad-sub">KANAN</span>
            </button>
            <button type="button" id="pac-dir-down" class="dpad-btn arr-down" aria-label="Bawah">
              <span aria-hidden="true">▼</span>
              <span class="dpad-sub">BAWAH</span>
            </button>
          </div>
          <div style="font-size:11px;color:var(--muted);text-align:center;">Tekan arah untuk bergerak</div>
        </div>

        <div class="center-hud">
          <div style="display:flex;justify-content:space-between;width:100%;font-size:11px;align-items:center;gap:6px;">
            <span style="font-weight:900;color:${ctx.color};">P${ctx.slot + 1}</span>
            <button id="pac-ctrl-fs" class="btn btn-secondary ctrl-top-btn" style="padding:3px 8px;font-size:10px;">
              ${CTRL_SVG_ICONS.fullscreen}
              <span>Fullscreen</span>
            </button>
            <span id="pac-ctrl-status" class="badge-ws">Connecting...</span>
          </div>

          <div id="pac-ctrl-role" style="font-size:22px;font-weight:900;letter-spacing:0.08em;color:#94a3b8;text-align:center;">MENUNGGU...</div>

          <div style="display:flex;justify-content:space-around;width:100%;align-items:baseline;">
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">POWER PELLET</div>
              <div id="pac-ctrl-power" style="font-size:19px;font-weight:900;">0/4</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">NYAWA</div>
              <div id="pac-ctrl-lives" style="font-size:19px;font-weight:900;">3</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--muted);">TIM</div>
              <div id="pac-ctrl-teams" style="font-size:14px;font-weight:900;">PAC 0 • GHOST 0</div>
            </div>
          </div>

          <div style="width:100%;display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);">
              <span>POWER MODE</span>
              <span id="pac-ctrl-power-label">0%</span>
            </div>
            <div class="turbo-bar-wrap">
              <div id="pac-ctrl-power-fill" class="turbo-bar-fill" style="width:0%;background:linear-gradient(90deg,#f472b6,#fde047);"></div>
            </div>
          </div>

          <canvas id="pac-ctrl-radar" width="120" height="72" style="background:#070b14;border-radius:10px;border:1px solid rgba(255,255,255,0.12);"></canvas>
        </div>

        <div class="action-zone" style="grid-template-columns:1fr;grid-template-rows:1fr;">
          <button id="pac-ctrl-dash" class="pad-btn btn-boost boost-ready" style="height:100%;min-height:120px;">
            <span class="pad-btn-icon">⚡</span>
            <span class="pad-btn-label">DASH</span>
            <span id="pac-ctrl-dash-label" style="font-size:11px;font-weight:800;color:#fef9c3;">SIAP</span>
          </button>
        </div>
      </div>
    `;

    this.statusBadgeEl = container.querySelector('#pac-ctrl-status');
    this.roleEl = container.querySelector('#pac-ctrl-role');
    this.powerEl = container.querySelector('#pac-ctrl-power');
    this.livesEl = container.querySelector('#pac-ctrl-lives');
    this.teamsEl = container.querySelector('#pac-ctrl-teams');
    this.powerFillEl = container.querySelector('#pac-ctrl-power-fill');
    this.powerLabelEl = container.querySelector('#pac-ctrl-power-label');
    this.dashBtnEl = container.querySelector('#pac-ctrl-dash');
    this.dashLabelEl = container.querySelector('#pac-ctrl-dash-label');
    this.radarCanvas = container.querySelector('#pac-ctrl-radar');

    this.updateTransport(ctx.transportMode);
    this.updateDashState(0);

    this.bindDirection(container, 'up', ctx.onUnlockAudio);
    this.bindDirection(container, 'down', ctx.onUnlockAudio);
    this.bindDirection(container, 'left', ctx.onUnlockAudio);
    this.bindDirection(container, 'right', ctx.onUnlockAudio);

    bindHoldButton(
      container.querySelector('#pac-ctrl-dash'),
      (pressed) => {
        this.dash = pressed;
      },
      ctx.onUnlockAudio
    );

    container.querySelector('#pac-ctrl-fs')?.addEventListener('click', () => ctx.onToggleFullscreen());
    ctx.onBindLandscapeGuard();
  }

  updateTransport(mode: TransportMode): void {
    updateTransportBadge(this.statusBadgeEl, mode);
  }

  updateTelemetry(t: TelemetryPacket): void {
    const isGhost = t.itemId === 2;
    const hasRole = t.itemId === 1 || t.itemId === 2;

    if (this.roleEl) {
      this.roleEl.textContent = hasRole ? (isGhost ? 'GHOST' : 'PAC-MAN') : 'MENUNGGU...';
      this.roleEl.style.color = hasRole ? (isGhost ? '#f87171' : '#fde047') : '#94a3b8';
    }
    if (this.powerEl) this.powerEl.textContent = `${t.lap}/${t.maxLaps}`;
    if (this.livesEl) this.livesEl.textContent = isGhost ? '∞' : String(t.fruits);
    if (this.teamsEl) this.teamsEl.textContent = `PAC ${t.rank} • GHOST ${t.totalPlayers}`;
    if (this.powerFillEl) this.powerFillEl.style.width = `${Math.max(0, Math.min(100, t.turboCharge))}%`;
    if (this.powerLabelEl) this.powerLabelEl.textContent = `${Math.round(t.turboCharge)}%`;
    this.updateDashState(t.boostCooldownSec ?? 0);
    this.drawRadar(t);
  }

  getOutput(): ControllerOutput {
    const steer = (this.direction.left ? -1 : 0) + (this.direction.right ? 1 : 0);
    return {
      steer,
      gas: this.direction.up,
      brake: this.direction.down,
      drift: false,
      item: false,
      boost: this.dash,
    };
  }

  releaseAllInputs(): void {
    this.direction = { up: false, down: false, left: false, right: false };
    this.dash = false;
    this.root
      ?.querySelectorAll('.pad-btn.pressed, .dpad-btn.pressed')
      .forEach((el) => el.classList.remove('pressed'));
  }

  unmount(): void {
    this.releaseAllInputs();
    this.root = null;
  }

  private bindDirection(
    container: HTMLElement,
    key: DirectionKey,
    onUnlockAudio: () => void
  ): void {
    bindHoldButton(
      container.querySelector(`#pac-dir-${key}`),
      (pressed) => {
        if (pressed) {
          for (const other of ['up', 'down', 'left', 'right'] as DirectionKey[]) {
            if (other === key) continue;
            this.direction[other] = false;
            container.querySelector(`#pac-dir-${other}`)?.classList.remove('pressed');
          }
        }
        this.direction[key] = pressed;
      },
      onUnlockAudio
    );
  }

  private updateDashState(cooldownSec: number): void {
    const ready = cooldownSec <= 0;
    if (this.dashBtnEl) {
      this.dashBtnEl.classList.toggle('boost-ready', ready);
      this.dashBtnEl.classList.toggle('boost-cooldown', !ready);
    }
    if (this.dashLabelEl) {
      this.dashLabelEl.textContent = ready ? 'SIAP' : `${Math.ceil(cooldownSec)}s`;
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
      const isGhost = blip.slot >= 100;
      const slot = blip.slot % 100;
      const px = (blip.x / 255) * (w - 12) + 6;
      const py = (blip.z / 255) * (h - 12) + 6;

      ctx.beginPath();
      ctx.arc(px, py, slot === this.mySlot ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isGhost ? '#f87171' : '#fde047';
      ctx.fill();

      if (slot === this.mySlot) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }
}
