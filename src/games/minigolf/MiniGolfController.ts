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
import { GOLF_HOLES, GolfHoleDef } from './GolfCourses';
import {
  aimTowards,
  GOLF_MAX_CHARGE_SECONDS,
  normalizeAngle,
} from './MiniGolfState';
import { decodeGolfTelemetry, GolfViewState } from './MiniGolfTelemetry';
import { MINIGOLF_CSS } from './MiniGolfStyles';

const SLOT_COLORS = [
  '#ef4444',
  '#38bdf8',
  '#4ade80',
  '#facc15',
  '#c084fc',
  '#fb923c',
  '#f472b6',
  '#2dd4bf',
  '#a3e635',
  '#e2e8f0',
];

export class MiniGolfController implements GameControllerView {
  readonly id = 'minigolf-3d';

  private root: HTMLElement | null = null;
  private ctx: ControllerViewContext | null = null;
  private view: GolfViewState | null = null;
  private holeDef: GolfHoleDef = GOLF_HOLES[0];
  private holeIndex = -1;
  private holeAimSynced = false;

  private aim = 0;
  private charging = false;
  private chargeStart = 0;
  private shotLockUntil = 0;
  private cancelPulseUntil = 0;
  private cancelHeld = false;

  private statusBadgeEl: HTMLElement | null = null;
  private courseEl: HTMLElement | null = null;
  private holeLineEl: HTMLElement | null = null;
  private timerEl: HTMLElement | null = null;
  private timerFillEl: HTMLElement | null = null;
  private totalEl: HTMLElement | null = null;
  private holeStrokesEl: HTMLElement | null = null;
  private rankEl: HTMLElement | null = null;
  private holedEl: HTMLElement | null = null;
  private phaseEl: HTMLElement | null = null;
  private powerFillEl: HTMLElement | null = null;
  private powerValueEl: HTMLElement | null = null;
  private aimValueEl: HTMLElement | null = null;
  private needleEl: HTMLElement | null = null;
  private dialEl: HTMLElement | null = null;
  private mapCanvas: HTMLCanvasElement | null = null;
  private puttBtnEl: HTMLButtonElement | null = null;
  private cancelBtnEl: HTMLButtonElement | null = null;

  private dialPointerId: number | null = null;
  private rafId: number | null = null;

  private handleDialDown = (event: PointerEvent): void => {
    if (!this.canAim()) return;
    event.preventDefault();
    this.dialPointerId = event.pointerId;
    this.dialEl?.setPointerCapture(event.pointerId);
    this.updateAimFromPointer(event.clientX, event.clientY);
  };

  private handleDialMove = (event: PointerEvent): void => {
    if (this.dialPointerId !== event.pointerId) return;
    event.preventDefault();
    this.updateAimFromPointer(event.clientX, event.clientY);
  };

  private handleDialUp = (event: PointerEvent): void => {
    if (this.dialPointerId !== event.pointerId) return;
    this.dialPointerId = null;
    this.dialEl?.releasePointerCapture(event.pointerId);
  };

  private loop = (): void => {
    if (!this.root) return;
    const now = performance.now();
    if (this.charging) {
      const pct = Math.min(
        1,
        (now - this.chargeStart) / (GOLF_MAX_CHARGE_SECONDS * 1000)
      );
      if (this.powerFillEl) this.powerFillEl.style.width = `${pct * 100}%`;
      if (this.powerValueEl) this.powerValueEl.textContent = `${Math.round(pct * 100)}%`;
    } else if (this.powerFillEl) {
      this.powerFillEl.style.width = '0%';
      if (this.powerValueEl) this.powerValueEl.textContent = '0%';
    }
    const needleAngle = this.aim + Math.PI / 2;
    if (this.needleEl) {
      this.needleEl.style.transform = `translate(-50%, -100%) rotate(${needleAngle}rad)`;
    }
    if (this.aimValueEl) {
      const deg = Math.round((this.aim * 180) / Math.PI);
      this.aimValueEl.textContent = `${deg}°`;
    }
    this.drawMiniMap();
    this.rafId = requestAnimationFrame(this.loop);
  };

  mount(container: HTMLElement, ctx: ControllerViewContext): void {
    this.root = container;
    this.ctx = ctx;
    this.view = null;
    this.holeIndex = -1;
    this.holeAimSynced = false;
    this.holeDef = GOLF_HOLES[0];
    this.aim = aimTowards(this.holeDef.tee, this.holeDef.hole);
    this.charging = false;
    this.shotLockUntil = 0;
    this.cancelPulseUntil = 0;
    this.cancelHeld = false;
    this.dialPointerId = null;

    container.innerHTML = `
      <style>${MINIGOLF_CSS}</style>
      <div class="ctrl-gamepad mgc-gamepad">
        <div class="mgc-left">
          <div class="mgc-dial-wrap">
            <div class="mgc-dial" id="mgc-dial">
              <div class="mgc-dial-needle" id="mgc-needle"></div>
              <div class="mgc-dial-center"></div>
              <div class="mgc-dial-label">AIM</div>
            </div>
          </div>
          <div class="mgc-aim-value" id="mgc-aim-value">0°</div>
          <div style="font-size:9px;font-weight:800;letter-spacing:.1em;color:#64748b;text-transform:uppercase;">Geser dial untuk arah</div>
        </div>

        <div class="mgc-center">
          <div class="mgc-top">
            <span style="color:${ctx.color};font-weight:900;">P${ctx.slot + 1}</span>
            <button id="mgc-fs" type="button" class="btn btn-secondary ctrl-top-btn" style="padding:3px 7px;font-size:9px;">
              ${CTRL_SVG_ICONS.fullscreen}<span>Fullscreen</span>
            </button>
            <span id="mgc-status" class="badge-ws">Connecting...</span>
          </div>
          <div class="mgc-course" id="mgc-course">Gaming Party Links</div>
          <div class="mgc-hole-line">
            <span id="mgc-hole-line">LUBANG 1/4</span>
            <span id="mgc-par" style="color:#fbbf24;">PAR 2</span>
          </div>
          <div class="mgc-timer" id="mgc-timer">--<small>s</small></div>
          <div class="mgc-timerbar"><div id="mgc-timer-fill"></div></div>
          <div class="mgc-stats">
            <div class="mgc-stat"><span>TOTAL</span><strong id="mgc-total">0</strong></div>
            <div class="mgc-stat"><span>LUBANG</span><strong id="mgc-hole-strokes">0</strong></div>
            <div class="mgc-stat"><span>RANK</span><strong id="mgc-rank">#1</strong></div>
            <div class="mgc-stat"><span>MASUK</span><strong id="mgc-holed">0/1</strong></div>
          </div>
          <div class="mgc-power-wrap">
            <div class="mgc-power-label"><span>POWER</span><span id="mgc-power-value">0%</span></div>
            <div class="mgc-power-bar"><div id="mgc-power-fill"></div></div>
          </div>
          <canvas id="mgc-map" class="mgc-map" width="260" height="150"></canvas>
          <div class="mgc-phase" id="mgc-phase">Menunggu Tee Off...</div>
        </div>

        <div class="mgc-right">
          <button type="button" id="mgc-putt" class="mgc-putt-btn">
            <span class="mgc-putt-icon">PUTT</span>
            <span class="mgc-putt-label">Tahan &amp; lepas</span>
          </button>
          <button type="button" id="mgc-cancel" class="mgc-cancel-btn">BATAL</button>
          <div class="mgc-hint">Tahan PUTT untuk mengisi power.<br>Lepas untuk memukul bola.</div>
        </div>
      </div>
    `;

    this.statusBadgeEl = container.querySelector('#mgc-status');
    this.courseEl = container.querySelector('#mgc-course');
    this.holeLineEl = container.querySelector('#mgc-hole-line');
    this.timerEl = container.querySelector('#mgc-timer');
    this.timerFillEl = container.querySelector('#mgc-timer-fill');
    this.totalEl = container.querySelector('#mgc-total');
    this.holeStrokesEl = container.querySelector('#mgc-hole-strokes');
    this.rankEl = container.querySelector('#mgc-rank');
    this.holedEl = container.querySelector('#mgc-holed');
    this.phaseEl = container.querySelector('#mgc-phase');
    this.powerFillEl = container.querySelector('#mgc-power-fill');
    this.powerValueEl = container.querySelector('#mgc-power-value');
    this.aimValueEl = container.querySelector('#mgc-aim-value');
    this.needleEl = container.querySelector('#mgc-needle');
    this.dialEl = container.querySelector('#mgc-dial');
    this.mapCanvas = container.querySelector('#mgc-map');
    this.puttBtnEl = container.querySelector('#mgc-putt');
    this.cancelBtnEl = container.querySelector('#mgc-cancel');

    this.dialEl?.addEventListener('pointerdown', this.handleDialDown);
    this.dialEl?.addEventListener('pointermove', this.handleDialMove);
    this.dialEl?.addEventListener('pointerup', this.handleDialUp);
    this.dialEl?.addEventListener('pointercancel', this.handleDialUp);

    bindHoldButton(
      this.puttBtnEl,
      (pressed) => {
        if (pressed) this.startCharge();
        else this.finishCharge();
      },
      ctx.onUnlockAudio
    );
    bindHoldButton(
      this.cancelBtnEl,
      (pressed) => {
        this.cancelHeld = pressed;
        if (pressed) this.cancelCharge();
      },
      ctx.onUnlockAudio
    );

    container.querySelector('#mgc-fs')?.addEventListener('click', () => ctx.onToggleFullscreen());
    ctx.onBindLandscapeGuard();
    this.updateTransport(ctx.transportMode);
    this.render();
    this.rafId = requestAnimationFrame(this.loop);
  }

  updateTransport(mode: TransportMode): void {
    updateTransportBadge(this.statusBadgeEl, mode);
  }

  updateTelemetry(t: TelemetryPacket): void {
    this.view = decodeGolfTelemetry(t);
    this.syncHole();
    if (!this.holeAimSynced && this.view.hole > 0) {
      const own = this.view.blips.find(
        (blip) => blip.slot === (this.ctx?.slot ?? 0)
      );
      if (own) {
        const bounds = this.holeDef.bounds;
        const w = bounds.maxX - bounds.minX;
        const d = bounds.maxZ - bounds.minZ;
        const ballX = bounds.minX + (own.x / 255) * w;
        const ballZ = bounds.minZ + (own.z / 255) * d;
        this.aim = aimTowards(
          { x: ballX, z: ballZ },
          this.holeDef.hole
        );
        this.holeAimSynced = true;
      }
    }
    if (
      this.view.phase !== 'playing' ||
      this.view.ballState === 'rolling' ||
      this.view.ballState === 'holed' ||
      this.view.matchOver
    ) {
      if (this.charging) this.cancelPulseUntil = performance.now() + 200;
      this.charging = false;
    }
    this.render();
    this.drawMiniMap();
  }

  getOutput(): ControllerOutput {
    const now = performance.now();
    return {
      steer: Math.max(-1, Math.min(1, this.aim / Math.PI)),
      gas: false,
      brake: false,
      drift: this.cancelHeld || now < this.cancelPulseUntil,
      item: this.charging,
      boost: false,
    };
  }

  releaseAllInputs(): void {
    const now = performance.now();
    if (this.charging) this.cancelPulseUntil = now + 300;
    this.charging = false;
    this.cancelHeld = false;
    this.dialPointerId = null;
    this.root
      ?.querySelectorAll('.mgc-putt-btn.pressed, .mgc-cancel-btn.pressed')
      .forEach((el) => el.classList.remove('pressed'));
  }

  unmount(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.dialEl?.removeEventListener('pointerdown', this.handleDialDown);
    this.dialEl?.removeEventListener('pointermove', this.handleDialMove);
    this.dialEl?.removeEventListener('pointerup', this.handleDialUp);
    this.dialEl?.removeEventListener('pointercancel', this.handleDialUp);
    this.releaseAllInputs();
    this.view = null;
    this.root = null;
    this.ctx = null;
  }

  private syncHole(): void {
    if (!this.view) return;
    const nextIndex = this.view.hole > 0 ? this.view.hole - 1 : 0;
    if (nextIndex === this.holeIndex) return;
    this.holeIndex = nextIndex;
    this.holeDef = GOLF_HOLES[Math.max(0, Math.min(GOLF_HOLES.length - 1, nextIndex))];
    this.aim = aimTowards(this.holeDef.tee, this.holeDef.hole);
    this.charging = false;
    this.holeAimSynced = false;
  }

  private canAct(): boolean {
    return (
      this.view !== null &&
      this.view.phase === 'playing' &&
      this.view.ballState === 'aiming' &&
      !this.view.matchOver &&
      performance.now() > this.shotLockUntil
    );
  }

  private canAim(): boolean {
    return this.canAct() && !this.charging;
  }

  private startCharge(): void {
    if (!this.canAct()) return;
    this.charging = true;
    this.chargeStart = performance.now();
    this.shotLockUntil = 0;
    if (this.puttBtnEl) this.puttBtnEl.classList.remove('busy');
    this.render();
  }

  private finishCharge(): void {
    if (!this.charging) return;
    this.charging = false;
    this.shotLockUntil = performance.now() + 420;
    if (this.powerFillEl) this.powerFillEl.style.width = '0%';
    if (this.powerValueEl) this.powerValueEl.textContent = '0%';
    this.render();
  }

  private cancelCharge(): void {
    if (!this.charging) return;
    this.charging = false;
    this.cancelPulseUntil = performance.now() + 240;
    this.shotLockUntil = performance.now() + 260;
    if (this.powerFillEl) this.powerFillEl.style.width = '0%';
    if (this.powerValueEl) this.powerValueEl.textContent = '0%';
    this.render();
  }

  private updateAimFromPointer(clientX: number, clientY: number): void {
    if (!this.dialEl) return;
    const rect = this.dialEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - cy, clientX - cx);
    this.aim = normalizeAngle(angle);
    this.render();
    this.drawMiniMap();
  }

  private render(): void {
    if (!this.view) return;
    const view = this.view;
    const def = this.holeDef;
    const isPre = view.phase === 'pre-game';
    const canAct = this.canAct();

    if (this.courseEl) {
      this.courseEl.textContent = isPre ? 'Gaming Party Links' : def.name;
    }
    if (this.holeLineEl) {
      this.holeLineEl.textContent = isPre
        ? `${view.totalHoles} HOLES`
        : `LUBANG ${view.hole}/${view.totalHoles}`;
    }
    const parEl = this.root?.querySelector('#mgc-par');
    if (parEl) {
      parEl.textContent = `PAR ${isPre ? def.par : view.par}`;
    }
    if (this.timerEl) {
      if (isPre || view.matchOver || view.phase === 'hole-result') {
        this.timerEl.innerHTML = '--<small>s</small>';
      } else {
        this.timerEl.innerHTML = `${view.timerSeconds}<small>s</small>`;
      }
    }
    if (this.timerFillEl) {
      let pct = 0;
      if (view.phase === 'hole-intro') {
        pct = (view.timerSeconds / 3) * 100;
      } else if (view.phase === 'playing') {
        pct = (view.timerSeconds / def.timeLimit) * 100;
      }
      this.timerFillEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    }
    if (this.totalEl) this.totalEl.textContent = String(view.totalStrokes);
    if (this.holeStrokesEl) this.holeStrokesEl.textContent = String(view.holeStrokes);
    if (this.rankEl) this.rankEl.textContent = `#${view.rank}/${view.totalPlayers}`;
    if (this.holedEl) this.holedEl.textContent = `${view.holedCount}/${view.totalPlayers}`;

    if (this.phaseEl) {
      if (isPre) {
        this.phaseEl.textContent = 'Menunggu host tee off...';
      } else if (view.matchOver) {
        this.phaseEl.textContent = 'Pertandingan selesai';
      } else if (view.phase === 'hole-intro') {
        this.phaseEl.textContent = `Lubang ${view.hole} — siap`;
      } else if (view.phase === 'hole-result') {
        this.phaseEl.textContent = `Lubang selesai — ${view.holeStrokes} pukulan`;
      } else if (view.ballState === 'charging') {
        this.phaseEl.textContent = 'Isi power, lepas untuk memukul';
      } else if (view.ballState === 'rolling') {
        this.phaseEl.textContent = 'Bola berjalan...';
      } else if (view.ballState === 'holed') {
        this.phaseEl.textContent = 'Masuk lubang!';
      } else {
        this.phaseEl.textContent = canAct ? 'Arahkan & tahan PUTT' : 'Tunggu...';
      }
    }

    if (this.puttBtnEl) {
      this.puttBtnEl.classList.toggle('busy', !canAct && !this.charging);
    }
    if (this.cancelBtnEl) {
      this.cancelBtnEl.classList.toggle('busy', !this.charging && !this.cancelHeld);
    }
    if (this.dialEl) {
      this.dialEl.style.opacity = canAct || this.charging ? '1' : '0.42';
    }
    if (this.needleEl) {
      this.needleEl.style.transform = `translate(-50%, -100%) rotate(${this.aim + Math.PI / 2}rad)`;
    }
    if (this.aimValueEl) {
      this.aimValueEl.textContent = `${Math.round((this.aim * 180) / Math.PI)}°`;
    }
  }

  private drawMiniMap(): void {
    const canvas = this.mapCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const def = this.holeDef;
    const { minX, minZ, maxX, maxZ } = def.bounds;
    const bw = maxX - minX;
    const bd = maxZ - minZ;
    const pad = 8;
    const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bd);
    const ox = (w - bw * scale) / 2;
    const oz = (h - bd * scale) / 2;
    const px = (x: number) => ox + (x - minX) * scale;
    const pz = (z: number) => oz + (z - minZ) * scale;
    const palette = def.palette;

    ctx.fillStyle = '#050a12';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = palette.ground;
    ctx.fillRect(px(minX) - 4, pz(minZ) - 4, bw * scale + 8, bd * scale + 8);
    ctx.fillStyle = palette.floor;
    ctx.fillRect(px(minX), pz(minZ), bw * scale, bd * scale);

    for (const zone of def.zones) {
      const color =
        zone.type === 'sand'
          ? palette.sand
          : zone.type === 'water'
          ? palette.water
          : zone.type === 'lava'
          ? palette.hazard
          : palette.accent;
      ctx.globalAlpha = zone.type === 'wind' ? 0.22 : 0.9;
      ctx.fillStyle = color;
      if (zone.shape === 'rect') {
        ctx.fillRect(
          px(zone.x),
          pz(zone.z),
          (zone.w ?? 0) * scale,
          (zone.h ?? 0) * scale
        );
      } else {
        ctx.beginPath();
        ctx.arc(px(zone.x), pz(zone.z), (zone.r ?? 0) * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    for (const rock of def.rocks) {
      ctx.beginPath();
      ctx.arc(px(rock.x), pz(rock.z), Math.max(2, rock.r * scale), 0, Math.PI * 2);
      ctx.fillStyle = palette.wall;
      ctx.fill();
    }

    ctx.lineCap = 'round';
    for (const wall of def.walls) {
      ctx.beginPath();
      ctx.moveTo(px(wall.ax), pz(wall.az));
      ctx.lineTo(px(wall.bx), pz(wall.bz));
      ctx.strokeStyle = palette.wall;
      ctx.lineWidth = Math.max(2, wall.thickness * scale);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(px(def.hole.x), pz(def.hole.z), 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px(def.hole.x), pz(def.hole.z), 3, 0, Math.PI * 2);
    ctx.fillStyle = palette.hole;
    ctx.fill();
    ctx.strokeStyle = palette.flag;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px(def.hole.x), pz(def.hole.z));
    ctx.lineTo(px(def.hole.x), pz(def.hole.z) - 12);
    ctx.stroke();

    const view = this.view;
    if (view && view.blips.length > 0) {
      for (const blip of view.blips) {
        const bx = minX + (blip.x / 255) * bw;
        const bz = minZ + (blip.z / 255) * bd;
        const own = blip.slot === (this.ctx?.slot ?? 0);
        ctx.beginPath();
        ctx.arc(
          px(bx),
          pz(bz),
          own ? 5 : 3,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = own
          ? this.ctx?.color ?? '#22c55e'
          : SLOT_COLORS[blip.slot % SLOT_COLORS.length];
        ctx.fill();
        if (own) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          if (
            (view.ballState === 'aiming' || view.ballState === 'charging') &&
            view.phase === 'playing'
          ) {
            const len = 32;
            ctx.strokeStyle = this.ctx?.color ?? '#22c55e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px(bx), pz(bz));
            ctx.lineTo(
              px(bx) + Math.cos(this.aim) * len,
              pz(bz) + Math.sin(this.aim) * len
            );
            ctx.stroke();
          }
        }
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px(minX) + 0.5, pz(minZ) + 0.5, bw * scale - 1, bd * scale - 1);
  }
}
