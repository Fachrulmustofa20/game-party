import { createAudioForGame } from '../audio/AudioRegistry';
import { GameAudioEngine } from '../audio/GameAudioEngine';
import { ControllerNetworkClient } from '../net/ControllerNetworkClient';
import { TransportMode } from '../net/HostNetworkManager';
import {
  KART_CHARACTERS,
  getKartCharacter,
  renderCarPreviewSvg,
  renderHeroPreviewSvg,
} from '../sdk/KartCharacters';
import {
  SPACE_CHARACTERS,
  getSpaceCharacter,
  renderShipPreviewSvg,
} from '../sdk/SpaceCharacters';
import { createControllerForGame } from './ControllerRegistry';
import { GameControllerView } from './GameControllerView';

export class ControllerApp {
  private root: HTMLElement;
  private initialRoom: string;
  private client: ControllerNetworkClient;
  private selectedCharacter = KART_CHARACTERS[Math.floor(Math.random() * KART_CHARACTERS.length)].id;
  private selectedColor =
    getKartCharacter(this.selectedCharacter, 0).outfit === '#0f172a'
      ? '#334155'
      : getKartCharacter(this.selectedCharacter, 0).outfit;
  private takenCharacters = new Set<string>();
  private takenPollTimer: number | null = null;
  private rerenderCarsFn: (() => void) | null = null;
  private verifiedRoomCode: string | null = null;
  private selectedGameId = 'nitro-kart-3d';
  private playerNameDraft = 'Player';
  private mySlot = 0;
  private joined = false;
  private activeGameId: string | null = null;
  private activeController: GameControllerView = createControllerForGame(null);
  private transportMode: TransportMode = 'connecting';
  private wakeLock: WakeLockSentinel | null = null;
  private activeAudio: GameAudioEngine = createAudioForGame(null);
  private lastSpeedKmh = 0;
  private sendLoopId: number | null = null;

  constructor(root: HTMLElement, initialRoom: string) {
    this.root = root;
    this.initialRoom = initialRoom;
    this.client = new ControllerNetworkClient({
      onJoined: (info) => {
        this.mySlot = info.slot;
        this.joined = true;
        if (this.takenPollTimer !== null) {
          clearInterval(this.takenPollTimer);
          this.takenPollTimer = null;
        }
        this.renderGamepad();
        this.startInputLoop();
        this.requestWakeLock();
      },
      onTransportChanged: (mode) => {
        this.transportMode = mode;
        this.bindLandscapeGuard();
        this.activeController.updateTransport(mode);
      },
      onReliableEvent: (ev) => {
        if (ev.type === 'vibrate' && Array.isArray(ev.pattern)) {
          navigator.vibrate?.(ev.pattern as number[]);
        } else if (ev.type === 'game_started' && typeof ev.gameId === 'string') {
          this.switchGameController(ev.gameId);
        } else if (ev.type === 'returned_to_hub') {
          this.handleReturnedToHub();
        }
      },
      onTelemetry: (t) => {
        this.lastSpeedKmh = t.speedKmh;
        this.activeController.updateTelemetry(t);
      },
      onError: (msg, taken) => {
        if (taken) {
          this.applyTakenCharacters(taken);
        }
        alert(msg);
      },
    });
  }

  mount(): void {
    this.setupOrientationListener();
    if (this.initialRoom.trim().length >= 4) {
      void this.verifyAndEnterRoom(this.initialRoom.trim().toUpperCase(), true);
    } else {
      this.renderJoinScreen();
    }
    void this.tryLockOrientationOnly();
  }

  private setupOrientationListener(): void {
    const portraitQuery = window.matchMedia('(orientation: portrait)');
    const handleOrientationChange = () => {
      if (portraitQuery.matches) {
        this.activeController.releaseAllInputs();
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
    if (this.takenPollTimer !== null) {
      clearInterval(this.takenPollTimer);
      this.takenPollTimer = null;
    }

    if (!this.verifiedRoomCode) {
      this.root.innerHTML = `
        <div class="ctrl-root">
          ${this.renderLandscapeGuardMarkup()}
          <div class="ctrl-join">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <h2 style="margin:0;font-size:22px;font-weight:900;">NitroController</h2>
              <span class="brand-badge">Langkah 1 / 2</span>
            </div>
            <p style="margin:0;font-size:12px;color:var(--muted);line-height:1.45;">
              Masukkan <strong>Kode Room</strong> dari layar PC terlebih dahulu agar karakter yang dipilih sesuai dan tidak bentrok dengan room lain.
            </p>
            <label style="font-size:12px;color:var(--muted);">Kode Room</label>
            <input id="inp-room" class="ctrl-input" maxlength="6" placeholder="ABCD" value="${this.initialRoom.toUpperCase()}" style="text-transform:uppercase;letter-spacing:0.15em;" />
            <div id="room-check-msg" style="font-size:12px;color:#fca5a5;font-weight:700;display:none;"></div>
            <button id="btn-check-room" class="btn btn-primary" style="padding:14px;font-size:16px;">Lanjut Pilih Karakter</button>
          </div>
        </div>
      `;

      this.bindLandscapeGuard();
      const roomInput = this.root.querySelector('#inp-room') as HTMLInputElement;
      const msgEl = this.root.querySelector('#room-check-msg') as HTMLElement;
      const checkBtn = this.root.querySelector('#btn-check-room') as HTMLButtonElement;

      const submitRoom = async () => {
        const code = roomInput.value.trim().toUpperCase();
        if (code.length < 4) {
          msgEl.textContent = 'Masukkan minimal 4 karakter Kode Room.';
          msgEl.style.display = 'block';
          return;
        }
        checkBtn.disabled = true;
        checkBtn.textContent = 'Memeriksa Room...';
        msgEl.style.display = 'none';
        const ok = await this.verifyAndEnterRoom(code, false);
        if (!ok) {
          checkBtn.disabled = false;
          checkBtn.textContent = 'Lanjut Pilih Karakter';
          msgEl.textContent = `Room "${code}" tidak ditemukan atau belum aktif.`;
          msgEl.style.display = 'block';
        }
      };

      checkBtn?.addEventListener('click', () => void submitRoom());
      roomInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void submitRoom();
      });
      return;
    }

    const activeRoom = this.verifiedRoomCode;
    const isDogfight = this.selectedGameId === 'space-dogfight-2p';
    this.ensureValidCharacterSelection();
    this.root.innerHTML = `
      <div class="ctrl-root">
        ${this.renderLandscapeGuardMarkup()}
        <div class="ctrl-join">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <h2 style="margin:0;font-size:20px;font-weight:900;">Room ${activeRoom}</h2>
              <span class="brand-badge">Langkah 2 / 2</span>
            </div>
            <button id="btn-change-room" type="button" class="btn btn-secondary" style="padding:6px 10px;font-size:11px;">Ganti Room</button>
          </div>
          <label style="font-size:12px;color:var(--muted);">Nama Pemain</label>
          <input id="inp-name" class="ctrl-input" maxlength="32" placeholder="${isDogfight ? 'Pilot' : 'Pembalap'}" value="${this.playerNameDraft}" />
          <label style="font-size:12px;color:var(--muted);">${isDogfight ? 'Pesawat Space Fighter Terpilih' : 'Karakter &amp; Mobil Terpilih'}</label>
          <div class="selected-char-preview" id="selected-char-preview"></div>
          <label style="font-size:12px;color:var(--muted);">${isDogfight ? 'Pilih Pesawat Space Fighter' : 'Pilih Karakter Superhero'}</label>
          <div class="character-picker-grid" id="character-row"></div>
          <button id="btn-join" class="btn btn-primary" style="padding:14px;font-size:16px;">Gabung ke Layar PC</button>
        </div>
      </div>
    `;

    this.bindLandscapeGuard();

    const nameInput = this.root.querySelector('#inp-name') as HTMLInputElement;
    nameInput?.addEventListener('input', () => {
      this.playerNameDraft = nameInput.value;
    });

    this.root.querySelector('#btn-change-room')?.addEventListener('click', () => {
      this.verifiedRoomCode = null;
      this.takenCharacters.clear();
      this.renderJoinScreen();
    });

    const charRow = this.root.querySelector('#character-row')!;
    const previewBox = this.root.querySelector('#selected-char-preview') as HTMLElement | null;

    const renderSelectedPreview = () => {
      if (!previewBox) return;
      if (this.takenCharacters.has(this.selectedCharacter)) {
        previewBox.style.borderColor = '#ef4444';
        previewBox.innerHTML = `
          <div style="width:100%;text-align:center;font-size:12px;font-weight:800;color:#fca5a5;">
            Semua ${isDogfight ? 'pesawat' : 'karakter'} sedang dipakai oleh Pemain / AI di room ${activeRoom}!
          </div>
        `;
        return;
      }
      if (isDogfight) {
        const sh = getSpaceCharacter(this.selectedCharacter, 0);
        previewBox.style.borderColor = this.selectedColor;
        previewBox.innerHTML = `
          <div class="selected-char-visuals">
            ${renderShipPreviewSvg(sh.shipStyle, sh.color, sh.accent)}
          </div>
          <div class="selected-char-info">
            <div class="selected-char-name">${sh.name}</div>
            <div class="selected-char-car">${sh.shipLabel}</div>
          </div>
        `;
        return;
      }
      const ch = getKartCharacter(this.selectedCharacter, 0);
      previewBox.style.borderColor = this.selectedColor;
      previewBox.innerHTML = `
        <div class="selected-char-visuals">
          ${renderHeroPreviewSvg(ch.driverTheme)}
          ${renderCarPreviewSvg(ch.carStyle, this.selectedColor, ch.accent)}
        </div>
        <div class="selected-char-info">
          <div class="selected-char-name">${ch.name}</div>
          <div class="selected-char-car">${ch.carLabel}</div>
        </div>
      `;
    };

    const joinBtn = this.root.querySelector('#btn-join') as HTMLButtonElement | null;

    const renderCars = () => {
      charRow.innerHTML = '';
      if (isDogfight) {
        SPACE_CHARACTERS.forEach((sh) => {
          const isTaken = this.takenCharacters.has(sh.id);
          const card = document.createElement('button');
          card.type = 'button';
          card.disabled = isTaken;
          card.setAttribute('aria-disabled', String(isTaken));
          card.className = `character-card ${sh.id === this.selectedCharacter && !isTaken ? 'selected' : ''} ${
            isTaken ? 'taken' : ''
          }`;
          card.innerHTML = `
            ${renderShipPreviewSvg(sh.shipStyle, sh.color, sh.accent)}
            <span class="character-name">${sh.name}</span>
            <span class="character-car">${isTaken ? 'SUDAH DIPAKAI' : sh.shipLabel}</span>
            ${isTaken ? '<span class="character-taken-badge">DIPAKAI</span>' : ''}
          `;
          card.addEventListener('click', () => {
            if (this.takenCharacters.has(sh.id)) return;
            this.selectedCharacter = sh.id;
            this.selectedColor = sh.color;
            charRow.querySelectorAll('.character-card').forEach((el) => el.classList.remove('selected'));
            card.classList.add('selected');
            renderSelectedPreview();
          });
          charRow.appendChild(card);
        });
      } else {
        KART_CHARACTERS.forEach((ch) => {
          const isTaken = this.takenCharacters.has(ch.id);
          const card = document.createElement('button');
          card.type = 'button';
          card.disabled = isTaken;
          card.setAttribute('aria-disabled', String(isTaken));
          card.className = `character-card ${ch.id === this.selectedCharacter && !isTaken ? 'selected' : ''} ${
            isTaken ? 'taken' : ''
          }`;
          card.innerHTML = `
            ${renderHeroPreviewSvg(ch.driverTheme)}
            <span class="character-name">${ch.name}</span>
            <span class="character-car">${isTaken ? 'SUDAH DIPAKAI' : ch.carLabel}</span>
            ${isTaken ? '<span class="character-taken-badge">DIPAKAI</span>' : ''}
          `;
          card.addEventListener('click', () => {
            if (this.takenCharacters.has(ch.id)) return;
            this.selectedCharacter = ch.id;
            this.selectedColor = ch.outfit === '#0f172a' ? '#334155' : ch.outfit;
            charRow.querySelectorAll('.character-card').forEach((el) => el.classList.remove('selected'));
            card.classList.add('selected');
            renderSelectedPreview();
          });
          charRow.appendChild(card);
        });
      }
      if (joinBtn) {
        const roster = isDogfight ? SPACE_CHARACTERS : KART_CHARACTERS;
        const allTaken = roster.every((c) => this.takenCharacters.has(c.id));
        joinBtn.disabled = allTaken;
        joinBtn.textContent = allTaken
          ? isDogfight
            ? 'Semua Pesawat Terpakai'
            : 'Semua Karakter Terpakai'
          : 'Gabung ke Layar PC';
      }
      renderSelectedPreview();
    };
    this.rerenderCarsFn = renderCars;
    renderCars();

    this.takenPollTimer = window.setInterval(() => {
      if (this.verifiedRoomCode) {
        void this.fetchTakenCharacters(this.verifiedRoomCode);
      }
    }, 1000);

    joinBtn?.addEventListener('click', () => {
      if (!this.verifiedRoomCode) return;
      if (this.takenCharacters.has(this.selectedCharacter)) {
        return alert('Karakter tersebut sudah dipakai pemain lain! Pilih karakter yang tersedia.');
      }
      const name = nameInput.value.trim() || 'Player';
      void this.enforceLandscape();
      this.client.join(this.verifiedRoomCode, name, this.selectedColor, this.selectedCharacter);
    });
  }

  private async verifyAndEnterRoom(roomCode: string, fallbackToStep1: boolean): Promise<boolean> {
    try {
      const res = await fetch(`/api/room-characters?room=${encodeURIComponent(roomCode)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        if (fallbackToStep1) this.renderJoinScreen();
        return false;
      }
      const data = (await res.json()) as {
        exists?: boolean;
        takenCharacters?: string[];
        selectedGameId?: string;
      };
      if (!data.exists) {
        if (fallbackToStep1) this.renderJoinScreen();
        return false;
      }
      this.verifiedRoomCode = roomCode;
      this.initialRoom = roomCode;
      if (typeof data.selectedGameId === 'string' && data.selectedGameId.length > 0) {
        this.selectedGameId = data.selectedGameId;
      }
      this.applyTakenCharacters(Array.isArray(data.takenCharacters) ? data.takenCharacters : []);
      this.renderJoinScreen();
      return true;
    } catch {
      if (fallbackToStep1) this.renderJoinScreen();
      return false;
    }
  }

  private async fetchTakenCharacters(roomCode: string): Promise<void> {
    try {
      const res = await fetch(`/api/room-characters?room=${encodeURIComponent(roomCode)}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        exists?: boolean;
        takenCharacters?: string[];
        selectedGameId?: string;
      };
      if (data.exists === false) {
        this.verifiedRoomCode = null;
        this.takenCharacters.clear();
        this.renderJoinScreen();
        return;
      }
      const gameChanged =
        typeof data.selectedGameId === 'string' &&
        data.selectedGameId.length > 0 &&
        data.selectedGameId !== this.selectedGameId;
      if (gameChanged && data.selectedGameId) {
        this.selectedGameId = data.selectedGameId;
      }
      if (Array.isArray(data.takenCharacters)) {
        this.applyTakenCharacters(data.takenCharacters, !gameChanged);
      }
      if (gameChanged && !this.joined) {
        this.renderJoinScreen();
      }
    } catch {
      // Ignore network hiccup during polling
    }
  }

  private ensureValidCharacterSelection(): void {
    if (this.selectedGameId === 'space-dogfight-2p') {
      const valid = SPACE_CHARACTERS.some((c) => c.id === this.selectedCharacter);
      if (!valid || this.takenCharacters.has(this.selectedCharacter)) {
        const free = SPACE_CHARACTERS.find((c) => !this.takenCharacters.has(c.id)) ?? SPACE_CHARACTERS[0];
        this.selectedCharacter = free.id;
        this.selectedColor = free.color;
      }
      return;
    }
    const valid = KART_CHARACTERS.some((c) => c.id === this.selectedCharacter);
    if (!valid || this.takenCharacters.has(this.selectedCharacter)) {
      const free = KART_CHARACTERS.find((c) => !this.takenCharacters.has(c.id)) ?? KART_CHARACTERS[0];
      this.selectedCharacter = free.id;
      this.selectedColor = free.outfit === '#0f172a' ? '#334155' : free.outfit;
    }
  }

  private applyTakenCharacters(takenList: string[], rerender = true): void {
    this.takenCharacters = new Set(takenList);
    this.ensureValidCharacterSelection();
    if (rerender) {
      this.rerenderCarsFn?.();
    }
  }

  private handleReturnedToHub(): void {
    if (this.sendLoopId !== null) {
      cancelAnimationFrame(this.sendLoopId);
      this.sendLoopId = null;
    }
    this.activeController.releaseAllInputs();
    this.switchGameController(null);
    this.joined = false;
    this.client.destroy();

    const roomCode = (this.verifiedRoomCode || this.initialRoom || '').trim().toUpperCase();
    if (roomCode.length >= 4) {
      void this.verifyAndEnterRoom(roomCode, true);
    } else {
      this.verifiedRoomCode = null;
      this.renderJoinScreen();
    }
  }

  private switchGameController(gameId: string | null): void {
    if (this.activeGameId === gameId) return;
    this.activeGameId = gameId;
    const wasMuted = this.activeAudio.isMuted();
    this.activeAudio.destroy();
    this.activeAudio = createAudioForGame(gameId);
    this.activeAudio.setMuted(wasMuted);
    this.activeController.unmount();
    this.activeController = createControllerForGame(gameId);
    if (this.joined) {
      this.renderGamepad();
    }
  }

  private renderGamepad(): void {
    this.activeController.unmount();
    this.root.innerHTML = `
      <div class="ctrl-root">
        ${this.renderLandscapeGuardMarkup()}
        <div id="ctrl-game-mount" style="width:100%;height:100%;"></div>
      </div>
    `;
    const mountEl = this.root.querySelector('#ctrl-game-mount') as HTMLElement;
    this.activeController.mount(mountEl, {
      slot: this.mySlot,
      color: this.selectedColor,
      transportMode: this.transportMode,
      onUnlockAudio: () => this.activeAudio.unlock(),
      onToggleFullscreen: () => {
        if (!document.fullscreenElement) {
          void this.enforceLandscape();
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      },
      onBindLandscapeGuard: () => this.bindLandscapeGuard(),
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
      const out = this.activeController.getOutput();
      this.client.sendInput(out);
      this.activeAudio.updateFromController({
        slot: this.mySlot,
        input: out,
        speedKmh: this.lastSpeedKmh,
      });
      this.sendLoopId = requestAnimationFrame(loop);
    };
    this.sendLoopId = requestAnimationFrame(loop);
  }
}
