import { createAudioForGame } from '../audio/AudioRegistry';
import { GameAudioEngine } from '../audio/GameAudioEngine';
import { ControllerNetworkClient } from '../net/ControllerNetworkClient';
import { TransportMode } from '../net/HostNetworkManager';
import {
  createCharacterViewForGame,
  getCharacterRosterForGame,
} from '../sdk/CharacterRegistry';
import { createControllerForGame } from './ControllerRegistry';
import { GameCharacterView } from './GameCharacterView';
import { GameControllerView } from './GameControllerView';

export class ControllerApp {
  private root: HTMLElement;
  private initialRoom: string;
  private client: ControllerNetworkClient;
  private selectedCharacter = getCharacterRosterForGame('nitro-kart-3d').characters[0].id;
  private selectedColor = getCharacterRosterForGame('nitro-kart-3d').characters[0].color;
  private takenCharacters = new Set<string>();
  private takenPollTimer: number | null = null;
  private rerenderCarsFn: (() => void) | null = null;
  private verifiedRoomCode: string | null = null;
  private selectedGameId = 'nitro-kart-3d';
  private playerNameDraft = 'Player';
  private mySlot = 0;
  private joined = false;
  private isReady = false;
  private activeGameId: string | null = null;
  private activeCharView: GameCharacterView = createCharacterViewForGame(null);
  private activeController: GameControllerView = createControllerForGame(null);
  private transportMode: TransportMode = 'connecting';
  private wakeLock: WakeLockSentinel | null = null;
  private wakeVideo: HTMLVideoElement | null = null;
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
        this.isReady = false;
        if (info.selectedGameId) {
          this.selectedGameId = info.selectedGameId;
        }
        if (info.characterId) {
          this.selectedCharacter = info.characterId;
        }
        this.renderLobbyScreen();
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
          this.startInputLoop();
          void this.requestWakeLock();
          void this.enforceLandscape();
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
      onRoomClosed: () => {
        if (this.sendLoopId !== null) {
          cancelAnimationFrame(this.sendLoopId);
          this.sendLoopId = null;
        }
        if (this.takenPollTimer !== null) {
          clearInterval(this.takenPollTimer);
          this.takenPollTimer = null;
        }
        this.activeController.releaseAllInputs();
        this.activeController.unmount();
        this.activeGameId = null;
        this.joined = false;
        this.isReady = false;
        this.verifiedRoomCode = null;
        this.takenCharacters.clear();
        alert('Room telah ditutup oleh Host.');
        this.renderJoinScreen();
      },
    });
  }

  mount(): void {
    this.preventZoomGestures();
    this.setupOrientationListener();
    void this.requestWakeLock();
    const keepAwake = () => {
      void this.requestWakeLock();
      this.ensureWakeLockVideoFallback();
    };
    window.addEventListener('pointerdown', keepAwake, { passive: true });
    window.addEventListener('touchstart', keepAwake, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        keepAwake();
      }
    });
    if (this.initialRoom.trim().length >= 4) {
      void this.verifyAndEnterRoom(this.initialRoom.trim().toUpperCase(), true);
    } else {
      this.renderJoinScreen();
    }
    void this.tryLockOrientationOnly();
  }

  private preventZoomGestures(): void {
    const prevent = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('gesturestart', prevent, { passive: false });
    document.addEventListener('gesturechange', prevent, { passive: false });
    document.addEventListener('gestureend', prevent, { passive: false });
    document.addEventListener('dblclick', prevent, { passive: false });
    document.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey && e.cancelable) e.preventDefault();
      },
      { passive: false }
    );
    let lastTouchEnd = 0;
    document.addEventListener(
      'touchend',
      (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300 && e.touches.length === 0) {
          const target = e.target as HTMLElement | null;
          if (target && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && e.cancelable) {
            e.preventDefault();
          }
        }
        lastTouchEnd = now;
      },
      { passive: false }
    );
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
          <h2 id="landscape-guard-title" style="margin:0;font-size:20px;font-weight:900;">Putar Layar ke Landscape</h2>
          <p style="margin:0;font-size:13px;color:var(--muted);line-height:1.5;">
            Biar kontroler nyaman dipakai, putar HP ke posisi mendatar ya.
          </p>
          <button id="btn-force-landscape" class="btn btn-primary" style="width:100%;">
            Aktifkan Layar Penuh
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

    const prefillRoom = (this.verifiedRoomCode || this.initialRoom || '').trim().toUpperCase();
    const isDogfight = this.selectedGameId === 'space-dogfight-2p';

    this.root.innerHTML = `
      <div class="ctrl-root">
        ${this.renderLandscapeGuardMarkup()}
        <form class="ctrl-join" id="join-form">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <img src="/gaming-party-icon.svg" alt="Gaming Party" style="width:28px;height:28px;border-radius:8px;display:block;" />
              <h2 style="margin:0;font-size:20px;font-weight:900;">GamingController</h2>
            </div>
            <span class="brand-badge">Gabung Room</span>
          </div>
          <p style="margin:0;font-size:12px;color:var(--muted);line-height:1.45;">
            Masukkan <strong>Kode Room</strong> dari layar PC dan namamu, lalu tekan <strong>Gabung</strong>.
          </p>
          <label for="inp-room" style="font-size:12px;color:var(--muted);">Kode Room</label>
          <input id="inp-room" class="ctrl-input" maxlength="6" placeholder="ABCD" value="${prefillRoom}" style="text-transform:uppercase;letter-spacing:0.15em;" />
          <label for="inp-name" style="font-size:12px;color:var(--muted);">Nama Pemain</label>
          <input id="inp-name" class="ctrl-input" maxlength="32" placeholder="${isDogfight ? 'Pilot' : 'Pembalap'}" value="${this.playerNameDraft}" />
          <div id="room-check-msg" style="font-size:12px;color:#fca5a5;font-weight:700;display:none;"></div>
          <button id="btn-join" type="submit" class="btn btn-primary" style="padding:14px;font-size:16px;margin-top:10px;">Gabung</button>
        </form>
      </div>
    `;

    this.bindLandscapeGuard();

    const form = this.root.querySelector('#join-form') as HTMLFormElement | null;
    const roomInput = this.root.querySelector('#inp-room') as HTMLInputElement;
    const nameInput = this.root.querySelector('#inp-name') as HTMLInputElement;
    const msgEl = this.root.querySelector('#room-check-msg') as HTMLElement;
    const joinBtn = this.root.querySelector('#btn-join') as HTMLButtonElement;

    roomInput?.addEventListener('input', () => {
      this.initialRoom = roomInput.value.trim().toUpperCase();
      if (this.verifiedRoomCode && this.verifiedRoomCode !== this.initialRoom) {
        this.verifiedRoomCode = null;
      }
      msgEl.style.display = 'none';
    });

    nameInput?.addEventListener('input', () => {
      this.playerNameDraft = nameInput.value;
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = roomInput.value.trim().toUpperCase();
      const name = nameInput.value.trim() || 'Player';
      this.playerNameDraft = name;

      if (code.length < 4) {
        msgEl.textContent = 'Masukkan minimal 4 karakter Kode Room.';
        msgEl.style.display = 'block';
        return;
      }

      joinBtn.disabled = true;
      joinBtn.textContent = 'Menghubungkan...';
      msgEl.style.display = 'none';

      if (this.verifiedRoomCode !== code) {
        const ok = await this.verifyRoomCodeOnly(code);
        if (!ok) {
          joinBtn.disabled = false;
          joinBtn.textContent = 'Gabung';
          msgEl.textContent = `Room "${code}" tidak ditemukan atau belum aktif.`;
          msgEl.style.display = 'block';
          return;
        }
      }

      this.client.join(code, name, this.selectedColor);
    });
  }

  private async verifyRoomCodeOnly(roomCode: string): Promise<boolean> {
    try {
      const sessionToken = this.getSessionToken(roomCode);
      const res = await fetch(
        `/api/room-characters?room=${encodeURIComponent(roomCode)}&sessionToken=${encodeURIComponent(sessionToken)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) return false;
      const data = (await res.json()) as {
        exists?: boolean;
        takenCharacters?: string[];
        selectedGameId?: string;
      };
      if (!data.exists) return false;
      this.verifiedRoomCode = roomCode;
      this.initialRoom = roomCode;
      if (typeof data.selectedGameId === 'string' && data.selectedGameId.length > 0) {
        this.selectedGameId = data.selectedGameId;
      }
      this.applyTakenCharacters(Array.isArray(data.takenCharacters) ? data.takenCharacters : [], false);
      return true;
    } catch {
      return false;
    }
  }

  private renderLobbyScreen(): void {
    if (this.takenPollTimer !== null) {
      clearInterval(this.takenPollTimer);
      this.takenPollTimer = null;
    }

    const activeRoom = this.verifiedRoomCode || this.initialRoom.toUpperCase();
    this.activeCharView.unmount();
    this.activeCharView = createCharacterViewForGame(this.selectedGameId);
    this.ensureValidCharacterSelection();
    this.client.selectCharacter(this.selectedCharacter, this.selectedColor);

    this.root.innerHTML = `
      <div class="ctrl-root">
        ${this.renderLandscapeGuardMarkup()}
        <div class="ctrl-join" style="width:min(94%, 560px);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:8px;">
              <h2 style="margin:0;font-size:20px;font-weight:900;">Lobby Room</h2>
              <span class="brand-badge">${
                this.activeCharView.id === 'default' ? 'Pilih Warna' : 'Pilih Karakter'
              }</span>
            </div>
            <span id="lobby-ready-pill" class="ready-summary-pill ${this.isReady ? 'ready' : 'waiting'}">
              ${this.isReady ? 'Sudah Siap' : 'Belum Siap'}
            </span>
          </div>

          <div class="lobby-identity-bar">
            <div class="lobby-identity-info">
              <span class="lobby-slot-tag">P${this.mySlot + 1}</span>
              <div style="min-width:0;">
                <div class="lobby-player-name">${this.playerNameDraft || 'Player'}</div>
                <div class="lobby-room-sub">Room <strong>${activeRoom}</strong></div>
              </div>
            </div>
            <button id="btn-edit-join" type="button" class="btn-edit-pill" title="Ganti Kode Room atau Nama Pemain">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
              <span>Ganti Room / Nama</span>
            </button>
          </div>

          <div id="char-view-mount"></div>

          <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
            <button id="btn-ready" type="button" class="btn ${this.isReady ? 'btn-ready-active' : 'btn-primary'}" style="padding:14px;font-size:16px;">
              ${this.isReady ? 'Batal Siap' : 'Saya Siap!'}
            </button>
            <div id="ready-hint" style="font-size:12px;color:var(--muted);text-align:center;">
              ${
                this.isReady
                  ? 'Sip! Tunggu pemain lain siap dan host memulai gamenya ya...'
                  : 'Pilih karaktermu dulu, lalu tekan Saya Siap!'
              }
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindLandscapeGuard();

    this.root.querySelector('#btn-edit-join')?.addEventListener('click', () => {
      if (this.takenPollTimer !== null) {
        clearInterval(this.takenPollTimer);
        this.takenPollTimer = null;
      }
      this.client.destroy();
      this.joined = false;
      this.isReady = false;
      this.initialRoom = activeRoom;
      this.renderJoinScreen();
    });

    const charMount = this.root.querySelector('#char-view-mount') as HTMLElement;
    const readyBtn = this.root.querySelector('#btn-ready') as HTMLButtonElement | null;
    const readyPill = this.root.querySelector('#lobby-ready-pill') as HTMLElement | null;
    const readyHint = this.root.querySelector('#ready-hint') as HTMLElement | null;

    const buildPickerCtx = () => ({
      roomCode: activeRoom,
      selectedCharacterId: this.selectedCharacter,
      takenCharacters: this.takenCharacters,
      isLocked: this.isReady,
      onSelect: (charId: string, color: string) => {
        this.selectedCharacter = charId;
        this.selectedColor = color;
        this.client.selectCharacter(charId, color);
        this.activeCharView.update(buildPickerCtx());
      },
    });

    this.activeCharView.mount(charMount, buildPickerCtx());
    const renderCars = () => {
      this.activeCharView.update(buildPickerCtx());
    };
    this.rerenderCarsFn = renderCars;

    this.takenPollTimer = window.setInterval(() => {
      if (this.verifiedRoomCode) {
        void this.fetchTakenCharacters(this.verifiedRoomCode);
      }
    }, 1000);

    readyBtn?.addEventListener('click', () => {
      this.isReady = !this.isReady;
      this.client.setReady(this.isReady);
      if (readyBtn) {
        readyBtn.className = `btn ${this.isReady ? 'btn-ready-active' : 'btn-primary'}`;
        readyBtn.textContent = this.isReady ? 'Batal Siap' : 'Saya Siap!';
      }
      if (readyPill) {
        readyPill.className = `ready-summary-pill ${this.isReady ? 'ready' : 'waiting'}`;
        readyPill.textContent = this.isReady ? 'Sudah Siap' : 'Belum Siap';
      }
      if (readyHint) {
        readyHint.textContent = this.isReady
          ? 'Sip! Tunggu pemain lain siap dan host memulai gamenya ya...'
          : 'Pilih karaktermu dulu, lalu tekan Saya Siap!';
      }
      renderCars();
    });
  }

  private getSessionToken(roomCode: string): string {
    return sessionStorage.getItem(`nitro_session_${roomCode.toUpperCase()}`) || '';
  }

  private async verifyAndEnterRoom(roomCode: string, fallbackToStep1: boolean): Promise<boolean> {
    try {
      const sessionToken = this.getSessionToken(roomCode);
      const res = await fetch(
        `/api/room-characters?room=${encodeURIComponent(roomCode)}&sessionToken=${encodeURIComponent(sessionToken)}`,
        {
          cache: 'no-store',
        }
      );
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
      const sessionToken = this.getSessionToken(roomCode);
      const res = await fetch(
        `/api/room-characters?room=${encodeURIComponent(roomCode)}&sessionToken=${encodeURIComponent(sessionToken)}`,
        {
          cache: 'no-store',
        }
      );
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
      if (gameChanged && this.joined && !this.activeGameId) {
        this.renderLobbyScreen();
      } else if (gameChanged && !this.joined) {
        this.renderJoinScreen();
      }
    } catch {
      // Ignore network hiccup during polling
    }
  }

  private ensureValidCharacterSelection(): void {
    const roster = getCharacterRosterForGame(this.selectedGameId).characters;
    const valid = roster.some((c) => c.id === this.selectedCharacter);
    if (!valid || this.takenCharacters.has(this.selectedCharacter)) {
      const free = roster.find((c) => !this.takenCharacters.has(c.id)) ?? roster[0];
      this.selectedCharacter = free.id;
      this.selectedColor = free.color;
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
    this.isReady = false;

    if (this.joined) {
      this.renderLobbyScreen();
      return;
    }

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

  private ensureWakeLockVideoFallback(): void {
    if (this.wakeVideo) {
      if (this.wakeVideo.paused) {
        void this.wakeVideo.play().catch(() => {});
      }
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const ctx = canvas.getContext('2d');
      ctx?.fillRect(0, 0, 2, 2);
      const stream = (
        canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }
      ).captureStream?.(1);
      if (!stream) return;

      const video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.muted = true;
      video.loop = true;
      video.srcObject = stream;
      video.style.cssText =
        'position:fixed;width:1px;height:1px;opacity:0.001;pointer-events:none;left:-10px;top:-10px;';
      document.body.appendChild(video);
      this.wakeVideo = video;
      void video.play().catch(() => {});
    } catch {
      // Ignore if unsupported
    }
  }

  private async requestWakeLock(): Promise<void> {
    if (this.wakeLock && !this.wakeLock.released) return;
    try {
      const sentinel = await navigator.wakeLock?.request('screen');
      if (sentinel) {
        this.wakeLock = sentinel;
        sentinel.addEventListener('release', () => {
          if (this.wakeLock === sentinel) this.wakeLock = null;
        });
      }
    } catch {
      // Ignore if unsupported
    }
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
