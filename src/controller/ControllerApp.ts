import { KartAudioEngine } from '../audio/KartAudioEngine';
import { TelemetryPacket } from '../net/BinaryProtocol';
import { ControllerNetworkClient } from '../net/ControllerNetworkClient';
import { TransportMode } from '../net/HostNetworkManager';
import { KART_CHARACTERS, renderCarPreviewSvg } from '../sdk/KartCharacters';

const COLORS = [
  '#ff4d4d',
  '#38bdf8',
  '#4ade80',
  '#facc15',
  '#c084fc',
  '#fb923c',
  '#f472b6',
  '#2dd4bf',
];

const ITEM_LABELS: Record<number, { icon: string; name: string }> = {
  0: { icon: '', name: 'KOSONG' },
  1: { icon: '🚀', name: 'ROKET' },
  2: { icon: '💣', name: 'BOM' },
  3: { icon: '🧨', name: 'TNT' },
  4: { icon: '🛡️', name: 'SHIELD' },
  5: { icon: '⚡', name: 'TURBO' },
};

const CTRL_ICONS = {
  gyro: `<svg class="ctrl-svg-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M9 17h6"/><path d="M2 12a10 10 0 0 1 2-6"/><path d="M22 12a10 10 0 0 0-2-6"/></svg>`,
  fullscreen: `<svg class="ctrl-svg-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`,
  itemEmpty: `<svg class="ctrl-svg-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
  boost: `<svg class="ctrl-svg-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" fill-opacity="0.25"/></svg>`,
  drift: `<svg class="ctrl-svg-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18c3-7 8-10 15-10"/><path d="m15 4 4 4-4 4"/><path d="M4 21c2.5-4.5 6-6.5 11-7" opacity="0.55"/></svg>`,
  gas: `<svg class="ctrl-svg-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/><path d="M7 19h10"/></svg>`,
};

export class ControllerApp {
  private root: HTMLElement;
  private initialRoom: string;
  private client: ControllerNetworkClient;
  private selectedColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  private selectedCharacter = KART_CHARACTERS[Math.floor(Math.random() * KART_CHARACTERS.length)].id;
  private mySlot = 0;
  private transportMode: TransportMode = 'connecting';
  private wakeLock: WakeLockSentinel | null = null;
  private audio = new KartAudioEngine();
  private lastSpeedKmh = 0;

  // Input state sampled at 60Hz
  private touchSteer = 0;
  private buttons = {
    gas: false,
    brake: false,
    drift: false,
    item: false,
    boost: false,
  };
  private sendLoopId: number | null = null;

  // HUD elements
  private statusBadgeEl: HTMLElement | null = null;
  private rankEl: HTMLElement | null = null;
  private lapEl: HTMLElement | null = null;
  private speedEl: HTMLElement | null = null;
  private turboFillEl: HTMLElement | null = null;
  private itemIconEl: HTMLElement | null = null;
  private boostBtnEl: HTMLButtonElement | null = null;
  private boostLabelEl: HTMLElement | null = null;
  private radarCanvas: HTMLCanvasElement | null = null;

  constructor(root: HTMLElement, initialRoom: string) {
    this.root = root;
    this.initialRoom = initialRoom;
    this.client = new ControllerNetworkClient({
      onJoined: (info) => {
        this.mySlot = info.slot;
        this.renderGamepad();
        this.startInputLoop();
        this.requestWakeLock();
      },
      onTransportChanged: (mode) => {
        this.transportMode = mode;
        this.bindLandscapeGuard();
    this.updateStatusBadge();
      },
      onReliableEvent: (ev) => {
        if (ev.type === 'vibrate' && Array.isArray(ev.pattern)) {
          navigator.vibrate?.(ev.pattern as number[]);
        }
      },
      onTelemetry: (t) => this.updateTelemetryHud(t),
      onError: (msg) => {
        alert(msg);
      },
    });
  }

  mount(): void {
    this.setupOrientationListener();
    this.renderJoinScreen();
    void this.tryLockOrientationOnly();
  }

  private setupOrientationListener(): void {
    const portraitQuery = window.matchMedia('(orientation: portrait)');
    const handleOrientationChange = () => {
      if (portraitQuery.matches) {
        // Release held inputs if phone rotates to portrait
        this.touchSteer = 0;
        this.buttons.gas = false;
        this.buttons.brake = false;
        this.buttons.drift = false;
        this.buttons.item = false;
        this.buttons.boost = false;
        this.root.querySelectorAll('.pad-btn.pressed').forEach((el) => el.classList.remove('pressed'));
      }
    };
    portraitQuery.addEventListener('change', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);
  }

  private async tryLockOrientationOnly(): Promise<void> {
    try {
      const orientation = screen.orientation as unknown as { lock?: (m: string) => Promise<void> };
      await orientation?.lock?.('landscape');
    } catch {
      // Browsers usually require fullscreen + user gesture before locking orientation
    }
  }

  private async enforceLandscape(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      }
    } catch {
      // Ignore if fullscreen is unsupported or blocked (e.g. iOS Safari)
    }
    await this.tryLockOrientationOnly();
  }

  private renderLandscapeGuardMarkup(): string {
    return `
      <div class="ctrl-landscape-guard" id="landscape-guard" role="dialog" aria-modal="true" aria-labelledby="landscape-guard-title">
        <div class="landscape-guard-card">
          <div class="rotate-phone-icon" aria-hidden="true">📱</div>
          <h2 id="landscape-guard-title" style="margin:0;font-size:20px;font-weight:900;">Wajib Mode Landscape</h2>
          <p style="margin:0;font-size:13px;color:var(--muted);line-height:1.5;">
            Controller hanya bisa digunakan dalam posisi layar mendatar (landscape). Putar HP Anda sekarang.
          </p>
          <button id="btn-force-landscape" class="btn btn-primary" style="width:100%;">
            Putar ke Landscape (Fullscreen)
          </button>
        </div>
      </div>
    `;
  }

  private bindLandscapeGuard(): void {
    this.root.querySelector('#btn-force-landscape')?.addEventListener('click', () => {
      void this.enforceLandscape();
    });
  }

  private renderJoinScreen(): void {
    this.root.innerHTML = `
      <div class="ctrl-root">
        ${this.renderLandscapeGuardMarkup()}
        <div class="ctrl-join">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h2 style="margin:0;font-size:22px;font-weight:900;">NitroController</h2>
            <span class="brand-badge">P2P WebRTC</span>
          </div>
          <label style="font-size:12px;color:var(--muted);">Kode Room</label>
          <input id="inp-room" class="ctrl-input" maxlength="6" placeholder="ABCD" value="${this.initialRoom.toUpperCase()}" style="text-transform:uppercase;letter-spacing:0.15em;" />
          <label style="font-size:12px;color:var(--muted);">Nama Pemain</label>
          <input id="inp-name" class="ctrl-input" maxlength="12" placeholder="Pembalap" value="Player" />
          <label style="font-size:12px;color:var(--muted);">Pilih Mobil</label>
          <div class="character-picker-grid" id="character-row"></div>
          <label style="font-size:12px;color:var(--muted);">Pilih Warna Kart</label>
          <div class="color-picker-row" id="color-row"></div>
          <button id="btn-join" class="btn btn-primary" style="padding:14px;font-size:16px;">Gabung ke Layar PC</button>
        </div>
      </div>
    `;

    this.bindLandscapeGuard();

    const charRow = this.root.querySelector('#character-row')!;
    const renderCars = () => {
      charRow.innerHTML = '';
      KART_CHARACTERS.forEach((ch) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `character-card ${ch.id === this.selectedCharacter ? 'selected' : ''}`;
        card.innerHTML = `
          ${renderCarPreviewSvg(ch.carStyle, this.selectedColor, ch.accent)}
          <span class="character-name">${ch.name}</span>
          <span class="character-car">${ch.carLabel}</span>
        `;
        card.addEventListener('click', () => {
          this.selectedCharacter = ch.id;
          charRow.querySelectorAll('.character-card').forEach((el) => el.classList.remove('selected'));
          card.classList.add('selected');
        });
        charRow.appendChild(card);
      });
    };
    renderCars();

    const colorRow = this.root.querySelector('#color-row')!;
    COLORS.forEach((c) => {
      const sw = document.createElement('div');
      sw.className = `color-swatch ${c === this.selectedColor ? 'selected' : ''}`;
      sw.style.background = c;
      sw.addEventListener('click', () => {
        this.selectedColor = c;
        colorRow.querySelectorAll('.color-swatch').forEach((el) => el.classList.remove('selected'));
        sw.classList.add('selected');
        renderCars();
      });
      colorRow.appendChild(sw);
    });

    const roomInput = this.root.querySelector('#inp-room') as HTMLInputElement;
    const nameInput = this.root.querySelector('#inp-name') as HTMLInputElement;

    this.root.querySelector('#btn-join')?.addEventListener('click', () => {
      const code = roomInput.value.trim().toUpperCase();
      if (!code) return alert('Masukkan kode room!');
      const name = nameInput.value.trim() || 'Player';
      void this.enforceLandscape();
      this.client.join(code, name, this.selectedColor, this.selectedCharacter);
    });
  }

  private renderGamepad(): void {
    this.root.innerHTML = `
      <div class="ctrl-root">
        ${this.renderLandscapeGuardMarkup()}
        <div class="ctrl-gamepad">
          <!-- Left: Analog Stick -->
          <div class="steer-zone">
            <div class="analog-base" id="analog-base">
              <div class="analog-knob" id="analog-knob"></div>
            </div>
            <div style="font-size:11px;color:var(--muted);">Geser Kiri / Kanan untuk Stir</div>
          </div>

          <!-- Center: Live HUD & Minimap -->
          <div class="center-hud">
            <div style="display:flex;justify-content:space-between;width:100%;font-size:11px;align-items:center;gap:6px;">
              <span style="font-weight:900;color:${this.selectedColor};">P${this.mySlot + 1}</span>
              <button id="btn-fs" class="btn btn-secondary ctrl-top-btn" style="padding:3px 8px;font-size:10px;">
                ${CTRL_ICONS.fullscreen}
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

            <canvas id="radar-canvas" width="120" height="84" style="background:#070b14;border-radius:10px;border:1px solid rgba(255,255,255,0.12);"></canvas>

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
              <span id="item-icon" class="pad-btn-icon">${CTRL_ICONS.itemEmpty}</span>
              <span class="pad-btn-label">ITEM</span>
            </button>
            <button id="btn-boost" class="pad-btn btn-boost boost-cooldown">
              <span class="pad-btn-icon">${CTRL_ICONS.boost}</span>
              <span id="boost-label" class="pad-btn-label">15s</span>
            </button>
            <button id="btn-drift" class="pad-btn btn-drift">
              <span class="pad-btn-icon">${CTRL_ICONS.drift}</span>
              <span class="pad-btn-label">DRIFT / HOP</span>
            </button>
            <button id="btn-gas" class="pad-btn btn-gas">
              <span class="pad-btn-icon">${CTRL_ICONS.gas}</span>
              <span class="pad-btn-label">GAS</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.statusBadgeEl = this.root.querySelector('#status-badge');
    this.rankEl = this.root.querySelector('#hud-rank');
    this.lapEl = this.root.querySelector('#hud-lap');
    this.speedEl = this.root.querySelector('#hud-speed');
    this.turboFillEl = this.root.querySelector('#turbo-fill');
    this.itemIconEl = this.root.querySelector('#item-icon');
    this.boostBtnEl = this.root.querySelector('#btn-boost');
    this.boostLabelEl = this.root.querySelector('#boost-label');
    this.radarCanvas = this.root.querySelector('#radar-canvas');

    this.bindLandscapeGuard();
    this.updateStatusBadge();
    this.bindAnalogStick();
    this.bindActionButtons();
    this.bindFullscreen();
  }

  private updateStatusBadge(): void {
    if (!this.statusBadgeEl) return;
    if (this.transportMode === 'webrtc') {
      this.statusBadgeEl.textContent = 'WebRTC UDP';
      this.statusBadgeEl.className = 'badge-rtc';
    } else if (this.transportMode === 'ws-fallback') {
      this.statusBadgeEl.textContent = 'WS Relay';
      this.statusBadgeEl.className = 'badge-ws';
    } else {
      this.statusBadgeEl.textContent = 'Connecting...';
      this.statusBadgeEl.className = 'badge-ws';
    }
  }

  private bindAnalogStick(): void {
    const zone = this.root.querySelector('.steer-zone') as HTMLElement;
    const base = this.root.querySelector('#analog-base') as HTMLElement;
    const knob = this.root.querySelector('#analog-knob') as HTMLElement;
    let activeTouchId: number | null = null;
    const maxRadius = 52;
    let originX = 0;
    let originY = 0;

    const placeBaseAt = (clientX: number, clientY: number) => {
      const zRect = zone.getBoundingClientRect();
      const pad = 42;
      const localX = Math.max(pad, Math.min(zRect.width - pad, clientX - zRect.left));
      const localY = Math.max(pad + 28, Math.min(zRect.height - pad, clientY - zRect.top));
      originX = zRect.left + localX;
      originY = zRect.top + localY;

      base.style.position = 'absolute';
      base.style.left = `${localX}px`;
      base.style.top = `${localY}px`;
      base.style.transform = 'translate(-50%, -50%)';
    };

    const updateFromClient = (clientX: number, clientY: number) => {
      let dx = clientX - originX;
      let dy = clientY - originY;
      const dist = Math.hypot(dx, dy);

      if (dist > maxRadius) {
        // Gently slide the analog base to follow the player's finger
        const excess = dist - maxRadius;
        const nx = dx / dist;
        const ny = dy / dist;
        placeBaseAt(originX + nx * excess, originY + ny * excess);
        dx = nx * maxRadius;
        dy = ny * maxRadius;
      }

      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.touchSteer = Math.max(-1, Math.min(1, dx / maxRadius));
    };

    const reset = () => {
      activeTouchId = null;
      this.touchSteer = 0;
      base.style.position = 'relative';
      base.style.left = '';
      base.style.top = '';
      base.style.transform = '';
      knob.style.transform = 'translate(-50%, -50%)';
    };

    zone.addEventListener('touchstart', (e) => {
      if ((e.target as HTMLElement)?.closest('button')) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      activeTouchId = t.identifier;
      placeBaseAt(t.clientX, t.clientY);
      updateFromClient(t.clientX, t.clientY);
    });

    zone.addEventListener('touchmove', (e) => {
      if (activeTouchId === null) return;
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === activeTouchId) {
          updateFromClient(t.clientX, t.clientY);
        }
      }
    });

    zone.addEventListener('touchend', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === activeTouchId) reset();
      }
    });
    zone.addEventListener('touchcancel', reset);

    // Mouse support for desktop tab simulation
    let mouseDown = false;
    zone.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement)?.closest('button')) return;
      mouseDown = true;
      placeBaseAt(e.clientX, e.clientY);
      updateFromClient(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (mouseDown) updateFromClient(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
      if (mouseDown) {
        mouseDown = false;
        reset();
      }
    });
  }

  private bindActionButtons(): void {
    const bindHold = (id: string, key: keyof typeof this.buttons) => {
      const el = this.root.querySelector(id) as HTMLElement;
      if (!el) return;
      const set = (val: boolean) => {
        this.buttons[key] = val;
        el.classList.toggle('pressed', val);
        if (val) {
          this.audio.unlock();
          navigator.vibrate?.(12);
        }
      };
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        set(true);
      });
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        set(false);
      });
      el.addEventListener('touchcancel', () => set(false));
      el.addEventListener('mousedown', () => set(true));
      el.addEventListener('mouseup', () => set(false));
      el.addEventListener('mouseleave', () => set(false));
    };

    bindHold('#btn-gas', 'gas');
    bindHold('#btn-drift', 'drift');
    bindHold('#btn-item', 'item');
    bindHold('#btn-boost', 'boost');
  }

  private bindFullscreen(): void {
    const btnFs = this.root.querySelector('#btn-fs');
    btnFs?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        void this.enforceLandscape();
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });
  }

  private async requestWakeLock(): Promise<void> {
    try {
      this.wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      // Ignore if unsupported
    }
    void this.wakeLock;
  }

  private startInputLoop(): void {
    if (this.sendLoopId !== null) cancelAnimationFrame(this.sendLoopId);
    const loop = () => {
      this.client.sendInput({
        steer: this.touchSteer,
        gas: this.buttons.gas,
        brake: this.buttons.brake,
        drift: this.buttons.drift,
        item: this.buttons.item,
        boost: this.buttons.boost,
      });
      this.audio.updatePlayerEngine(
        'self',
        this.mySlot,
        this.buttons.gas,
        this.lastSpeedKmh / 120,
        this.buttons.boost
      );
      this.sendLoopId = requestAnimationFrame(loop);
    };
    this.sendLoopId = requestAnimationFrame(loop);
  }

  private updateTelemetryHud(t: TelemetryPacket): void {
    this.lastSpeedKmh = t.speedKmh;
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
        this.itemIconEl.innerHTML = CTRL_ICONS.itemEmpty;
      }
    }

    if (this.boostBtnEl && this.boostLabelEl) {
      const cd = t.boostCooldownSec ?? 0;
      const ready = cd <= 0 || t.turboCharge >= 50;
      this.boostBtnEl.classList.toggle('boost-cooldown', !ready);
      this.boostBtnEl.classList.toggle('boost-ready', ready);
      this.boostLabelEl.textContent = ready ? 'BOOST' : `${cd}s`;
    }

    if (this.radarCanvas) {
      const ctx = this.radarCanvas.getContext('2d');
      if (ctx) {
        const w = this.radarCanvas.width;
        const h = this.radarCanvas.height;
        ctx.clearRect(0, 0, w, h);
        for (const k of t.karts) {
          const px = (k.x / 255) * (w - 12) + 6;
          const pz = (k.z / 255) * (h - 12) + 6;
          ctx.beginPath();
          ctx.arc(px, pz, k.slot === this.mySlot ? 4.5 : 3, 0, Math.PI * 2);
          ctx.fillStyle = k.slot === this.mySlot ? '#22c55e' : '#94a3b8';
          ctx.fill();
          if (k.slot === this.mySlot) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }
    }
  }
}
