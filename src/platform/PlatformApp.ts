import QRCode from 'qrcode';
import { Plus, RefreshCw, createElement } from 'lucide';
import { ControllerInputState } from '../net/BinaryProtocol';
import { ConnectedPlayer, HostNetworkManager } from '../net/HostNetworkManager';
import { BotLevel, HostSDKContext, PlatformGame, PlatformPlayer } from '../sdk/GameSDK';
import { KART_CHARACTERS, getKartCharacter } from '../sdk/KartCharacters';
import { SPACE_CHARACTERS, getSpaceCharacter } from '../sdk/SpaceCharacters';
import { SNAKE_CHARACTERS, getSnakeCharacter } from '../sdk/SnakeColors';
import { KartGame } from '../games/kart/KartGame';
import { SpaceDogfightGame } from '../games/dogfight/SpaceDogfightGame';
import { PacGame } from '../games/pacman/PacGame';
import { NeonSerpentGame } from '../games/snake/NeonSerpentGame';
import { LiarsDiceGame } from '../games/liars-dice/LiarsDiceGame';
import { PokerGame } from '../games/poker/PokerGame';
import { LudoGame } from '../games/ludo/LudoGame';
import { BomberGame } from '../games/bomber/BomberGame';

const ROOM_STORAGE_KEY = 'nitro_host_room_code';
const DONATION_URL = 'https://saweria.co/fachrulmustofa';
const DEVELOPER_URL = 'https://fachrulmustofa.site/';

const BOT_COLORS = [
  '#ff4d4d',
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

export class PlatformApp {
  private root: HTMLElement;
  private net: HostNetworkManager;
  private roomCode = '----';
  private lanIp = window.location.hostname;
  private lanInterfaceName = '';
  private remotePlayers: ConnectedPlayer[] = [];
  private bots: PlatformPlayer[] = [];
  private botLevel: BotLevel = 'medium';
  private customMaxPlayers: number | null = null;
  private activeGame: PlatformGame | null = null;
  private games: PlatformGame[] = [
    new KartGame(),
    new SpaceDogfightGame(),
    new PacGame(),
    new NeonSerpentGame(),
    new LiarsDiceGame(),
    new PokerGame(),
    new LudoGame(),
    new BomberGame(),
    new LudoGame(),
    new BomberGame(),
  ];
  private selectedGame: PlatformGame = this.games[0];

  private qrCanvas: HTMLCanvasElement | null = null;
  private roomCodeEl: HTMLElement | null = null;
  private joinUrlEl: HTMLElement | null = null;
  private networkLabelEl: HTMLElement | null = null;
  private playersGridEl: HTMLElement | null = null;
  private playerCountEl: HTMLElement | null = null;
  private playerMaxCountEl: HTMLElement | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  // Optional keyboard fallback for Player 1 testing on PC
  private keyState = {
    left: false,
    right: false,
    up: false,
    down: false,
    drift: false,
    item: false,
    boost: false,
  };

  constructor(root: HTMLElement) {
    this.root = root;
    this.net = new HostNetworkManager({
      onRoomCreated: (code) => {
        this.roomCode = code;
        localStorage.setItem(ROOM_STORAGE_KEY, code);
        this.updateQrAndRoom();
        this.net.syncSelectedGame(this.selectedGame.id);
        this.syncBotsToServer();
      },
      onPlayersChanged: (players) => {
        this.remotePlayers = players;
        if (players.some((p) => p.connected)) {
          this.bots = this.bots.filter((b) => b.id !== 'local_p1');
        }
        if (this.activeGame) {
          this.net.sendReliableEvent('*', {
            type: 'game_started',
            gameId: this.activeGame.id,
            layout: this.activeGame.controllerLayout,
          });
        }
        this.renderPlayersGrid();
      },
      onReliableEvent: (playerId, event) => {
        if (event.type === 'launch_game' && typeof event.gameId === 'string') {
          const g = this.games.find((x) => x.id === event.gameId);
          if (g) this.launchGame(g);
        } else if (event.type === 'exit_game' && this.activeGame) {
          this.exitToHub();
        } else if (event.type === 'ping_vibrate') {
          this.net.sendReliableEvent(playerId, { type: 'vibrate', pattern: [40] });
        }
      },
    });
  }

  mount(): void {
    this.renderHub();
    void this.fetchLanInfo();
    this.bindKeyboardFallback();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.activeGame !== null) {
        void this.requestWakeLock();
      }
    });
  }

  private async fetchLanInfo(): Promise<void> {
    try {
      const res = await fetch('/api/network-info', { cache: 'no-store' });
      const data = (await res.json()) as {
        ips?: string[];
        primaryInterface?: { name: string; address: string } | null;
      };
      const nextIp = data.primaryInterface?.address || data.ips?.[0];
      const nextName = data.primaryInterface?.name || '';
      if (nextIp && (nextIp !== this.lanIp || nextName !== this.lanInterfaceName)) {
        this.lanIp = nextIp;
        this.lanInterfaceName = nextName;
        this.updateQrAndRoom();
      }
    } catch {
      // keep current hostname/IP
    }
  }

  private getJoinUrl(): string {
    const portPart = window.location.port ? `:${window.location.port}` : '';
    const host =
      this.lanIp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? this.lanIp
        : window.location.hostname;
    return `${window.location.protocol}//${host}${portPart}/?mode=controller&room=${this.roomCode}`;
  }

  private updateQrAndRoom(): void {
    if (this.roomCodeEl) this.roomCodeEl.textContent = this.roomCode;
    const url = this.getJoinUrl();
    if (this.joinUrlEl) this.joinUrlEl.textContent = url;
    if (this.networkLabelEl) {
      this.networkLabelEl.textContent = this.lanInterfaceName
        ? `Wi-Fi / LAN Aktif: ${this.lanIp} (${this.lanInterfaceName})`
        : `Wi-Fi / LAN Aktif: ${this.lanIp}`;
    }
    if (this.qrCanvas && this.roomCode !== '----') {
      QRCode.toCanvas(this.qrCanvas, url, {
        width: 180,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      }).catch(() => { });
    }
  }

  private getSlotLimit(): number {
    const gameMax = (this.activeGame ?? this.selectedGame).maxPlayers;
    return this.customMaxPlayers ? Math.min(gameMax, Math.max(1, this.customMaxPlayers)) : gameMax;
  }

  private getMergedPlayers(maxSlots = this.getSlotLimit()): PlatformPlayer[] {
    const list: PlatformPlayer[] = this.remotePlayers
      .filter((p) => p.connected)
      .slice(0, maxSlots)
      .map((p, idx) => ({
        id: p.id,
        slot: p.slot < maxSlots ? p.slot : idx,
        name: p.name,
        color: p.color,
        characterId: p.characterId,
        isBot: false,
        connected: p.connected,
        transport: p.transport,
        pingMs: p.pingMs,
      }));

    const usedSlots = new Set(list.map((p) => p.slot));
    for (const bot of this.bots) {
      if (list.length >= maxSlots) break;
      let slot = 0;
      while (usedSlots.has(slot) && slot < maxSlots) slot++;
      if (slot < maxSlots) {
        usedSlots.add(slot);
        list.push({ ...bot, slot });
      }
    }
    return list.sort((a, b) => a.slot - b.slot);
  }

  private addBotsToFill(targetCount: number): void {
    const maxSlots = this.getSlotLimit();
    const cappedTarget = Math.min(maxSlots, targetCount);
    const activeHumans = this.remotePlayers.filter((p) => p.connected).slice(0, maxSlots);
    const usedSlots = new Set(activeHumans.map((p, idx) => (p.slot < maxSlots ? p.slot : idx)));
    this.bots = [];

    const roster = this.getActiveRoster();

    // If no phone controllers are connected, assign Slot 0 to PC Keyboard (P1) so user can play vs AI
    if (activeHumans.length === 0 && cappedTarget >= 1) {
      usedSlots.add(0);
      this.bots.push({
        id: 'local_p1',
        slot: 0,
        name: 'PC Driver',
        color: BOT_COLORS[0],
        characterId: roster[0].id,
        isBot: false,
        connected: true,
        transport: 'bot',
        pingMs: 0,
      });
    }

    const usedChars = new Set(
      activeHumans.map((p) => p.characterId).filter((c): c is string => Boolean(c))
    );
    const needed = Math.max(0, cappedTarget - usedSlots.size);
    for (let i = 0; i < needed; i++) {
      let slot = 0;
      while (usedSlots.has(slot) && slot < maxSlots) slot++;
      if (slot >= maxSlots) break;
      usedSlots.add(slot);
      const freeChar =
        roster.find((c) => !usedChars.has(c.id)) ??
        roster[slot % roster.length];
      usedChars.add(freeChar.id);
      this.bots.push({
        id: `bot_${i + 1}`,
        slot,
        name: `Bot ${i + 1}`,
        color: BOT_COLORS[slot % BOT_COLORS.length],
        characterId: freeChar.id,
        isBot: true,
        botLevel: this.botLevel,
        connected: true,
        transport: 'bot',
        pingMs: 0,
      });
    }
    this.renderPlayersGrid();
  }

  private getActiveRoster(): ReadonlyArray<{ id: string; name: string }> {
    const gameId = (this.activeGame ?? this.selectedGame).id;
    if (gameId === 'space-dogfight-2p') return SPACE_CHARACTERS;
    if (gameId === 'neon-serpent') return SNAKE_CHARACTERS;
    return KART_CHARACTERS;
  }

  private getCharacterDisplayName(characterId: string | undefined, slot: number): string {
    const gameId = (this.activeGame ?? this.selectedGame).id;
    if (gameId === 'space-dogfight-2p') return getSpaceCharacter(characterId, slot).name;
    if (gameId === 'neon-serpent') return getSnakeCharacter(characterId, slot).name;
    return getKartCharacter(characterId, slot).name;
  }

  private remapBotsToActiveRoster(): void {
    const roster = this.getActiveRoster();
    const used = new Set(
      this.remotePlayers
        .filter((p) => p.connected)
        .map((p) => p.characterId)
        .filter((c): c is string => Boolean(c))
    );
    for (const bot of this.bots) {
      const valid = bot.characterId && roster.some((c) => c.id === bot.characterId);
      if (!valid || used.has(bot.characterId!)) {
        const free = roster.find((c) => !used.has(c.id)) ?? roster[bot.slot % roster.length];
        bot.characterId = free.id;
      }
      if (bot.characterId) used.add(bot.characterId);
    }
  }

  private renderHub(): void {
    this.root.innerHTML = `
      <div class="hub-landing">
        <header class="hub-topbar">
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            <div class="brand-title">
              <img src="/gaming-party-icon.svg" alt="Gaming Party" style="width:34px;height:34px;border-radius:9px;display:block;" />
              <span>GAMING PARTY</span>
              <span class="brand-badge">Multiplayer 10P</span>
            </div>
            <span style="font-size:13px;color:var(--muted);">
              Pilih game favoritmu untuk bikin room dan sambungkan HP sebagai kontroler.
            </span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <button
              class="btn"
              id="btn-donate"
              style="background:linear-gradient(135deg,#f59e0b,#ec4899);color:#fff;font-weight:800;border:none;"
            >
              ♥ Donasi / Dukung Developer
            </button>
            <button class="btn btn-secondary" id="btn-help">
              ? Bantuan &amp; Panduan
            </button>
          </div>
        </header>

        <main class="hub-main" style="max-width:1360px;width:100%;margin:0 auto;">
          <div>
            <div class="section-header" style="margin-bottom:14px;">
              <h2 class="section-title">Pilih Game</h2>
              <span style="font-size:12px;color:var(--muted);">Klik tombol Buat Room &amp; Main di game yang ingin dimainkan</span>
            </div>
            <div class="games-grid" id="games-grid"></div>
          </div>
        </main>
      </div>
    `;

    this.qrCanvas = null;
    this.roomCodeEl = null;
    this.joinUrlEl = null;
    this.networkLabelEl = null;
    this.playersGridEl = null;
    this.playerCountEl = null;
    this.playerMaxCountEl = null;

    this.root.querySelector('#btn-donate')?.addEventListener('click', () => {
      window.open(DONATION_URL, '_blank', 'noopener,noreferrer');
    });
    this.root.querySelector('#btn-help')?.addEventListener('click', () => {
      this.showHelpModal();
    });

    const gamesGrid = this.root.querySelector('#games-grid')!;
    for (const game of this.games) {
      const card = document.createElement('div');
      card.className = 'game-card';
      const lapSelectorHtml =
        game.id === 'nitro-kart-3d'
          ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;" class="lap-selector">
          <span style="font-size:12px;color:var(--muted);font-weight:700;">Jumlah Lap:</span>
          ${[1, 3, 5]
            .map(
              (laps) => `
            <button type="button" data-laps="${laps}" class="btn ${(game.maxLaps ?? 3) === laps ? 'btn-primary' : 'btn-secondary'
                }" style="padding:4px 10px;font-size:12px;">${laps} Lap</button>
          `
            )
            .join('')}
        </div>
        <div style="margin-top:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:12px;color:var(--muted);font-weight:700;">Pilih Map:</span>
            <div style="display:flex;gap:4px;">
              <button type="button" class="btn btn-secondary map-slide-left" style="padding:2px 8px;font-size:12px;">&lsaquo;</button>
              <button type="button" class="btn btn-secondary map-slide-right" style="padding:2px 8px;font-size:12px;">&rsaquo;</button>
            </div>
          </div>
          <div style="display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px;scrollbar-width:thin;" class="map-selector">
            ${[
            { id: 'crash-cove', label: 'Pantai Tropis', diff: 'Mudah', diffColor: '#22c55e', img: '/images/map-crash-cove.png' },
            { id: 'neon-canyon', label: 'Neon Canyon', diff: 'Sedang', diffColor: '#facc15', img: '/images/map-neon-canyon.png' },
            { id: 'ice-peak', label: 'Polar Peak', diff: 'Sulit', diffColor: '#ef4444', img: '/images/map-ice-peak.png' },
          ]
            .map((m) => {
              const active = (game.selectedMap ?? 'crash-cove') === m.id;
              return `
              <button type="button" data-map="${m.id}" style="flex:0 0 146px;scroll-snap-align:start;padding:0;border-radius:10px;overflow:hidden;border:2px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.12)'
                };background:#0b1222;color:var(--text);cursor:pointer;text-align:left;transition:transform 0.12s ease,border-color 0.12s ease;">
                <img src="${m.img}" alt="${m.label}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;" />
                <div style="padding:6px 8px;display:flex;flex-direction:column;gap:2px;">
                  <span style="font-size:11px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.label}</span>
                  <span style="font-size:10px;font-weight:800;color:${m.diffColor};">${m.diff}</span>
                </div>
              </button>`;
            })
            .join('')}
          </div>
        </div>`
          : '';

      card.innerHTML = `
        <div style="border-radius:12px;overflow:hidden;aspect-ratio:16/9;background:#070b14;border:1px solid rgba(255,255,255,0.08);">
          <img src="${game.coverImage}" alt="${game.title}" style="width:100%;height:100%;object-fit:cover;display:block;" />
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="brand-badge" style="background:${game.accentColor};">${game.badge}</span>
          <span style="font-size:12px;color:var(--muted);">${game.minPlayers}–${game.maxPlayers} Pemain</span>
        </div>
        <h3>${game.title}</h3>
        <p>${game.subtitle}</p>
        <button class="btn btn-primary btn-play" style="margin-top:auto;">Buat Room</button>
      `;

      card.querySelector('.btn-play')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openRoomModal(game, true);
      });

      if (game.mountCardOverlay) {
        const sheet = document.createElement('div');
        sheet.className = 'game-card-hover-sheet';
        card.appendChild(sheet);
        game.mountCardOverlay(sheet, () => this.openRoomModal(game, true));
      }
      gamesGrid.appendChild(card);
    }
  }

  private openRoomModal(game: PlatformGame, createNewConnection: boolean): void {
    this.selectedGame = game;
    this.root.querySelector('#room-lobby-modal')?.remove();

    if (createNewConnection) {
      this.roomCode = '----';
      this.remotePlayers = [];
      this.bots = [];
      this.customMaxPlayers = game.maxPlayers;
    } else {
      this.customMaxPlayers = Math.min(
        game.maxPlayers,
        Math.max(1, this.customMaxPlayers ?? game.maxPlayers)
      );
      this.remapBotsToActiveRoster();
    }

    const modal = document.createElement('div');
    modal.id = 'room-lobby-modal';
    modal.className = 'room-modal-backdrop';
    modal.innerHTML = `
      <div class="room-modal-card">
        <div class="room-modal-header">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span class="brand-badge" style="background:${game.accentColor};">${game.badge}</span>
            <h2 style="margin:0;font-size:20px;font-weight:900;">${game.title} — Room Lobby</h2>
          </div>
          <button type="button" id="btn-close-room" class="btn btn-secondary" style="padding:6px 12px;font-size:13px;">✕ Tutup Room</button>
        </div>

        <div class="room-modal-body">
          <div class="room-modal-left">
            <div style="font-size:12px;color:var(--muted);line-height:1.45;">
              Scan QR Code pakai kamera HP (pastikan satu Wi-Fi), lalu isi nama dan klik <strong>Gabung</strong>.
            </div>
            <div class="qr-card">
              <button
                id="btn-refresh-qr"
                type="button"
                title="Perbarui QR Code & Room"
                aria-label="Perbarui QR Code & Room"
                style="position:absolute;top:10px;right:10px;border:none;background:#e2e8f0;color:#0f172a;width:32px;height:32px;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;"
              ></button>
              <canvas id="qr-canvas"></canvas>
              <div class="room-code-pill" id="room-code">${this.roomCode}</div>
              <div class="join-url-text" id="join-url">Menghubungkan...</div>
              <div id="network-label" style="font-size:11px;color:#0284c7;font-weight:700;">Mendeteksi Wi-Fi...</div>
            </div>

            <div style="display:flex;flex-direction:column;gap:8px;">
              <div class="max-players-card">
                <div class="max-players-header">
                  <span class="max-players-label">Maks Pemain</span>
                  <span id="max-players-badge" class="max-players-badge">${this.getSlotLimit()} Pemain</span>
                </div>
                <div class="max-players-stepper">
                  <button type="button" id="btn-max-dec" class="max-players-step-btn" aria-label="Kurangi Maks Pemain">−</button>
                  <input id="inp-max-players" class="max-players-slider" type="range" min="1" max="${game.maxPlayers}" value="${this.getSlotLimit()}" />
                  <button type="button" id="btn-max-inc" class="max-players-step-btn" aria-label="Tambah Maks Pemain">+</button>
                </div>
                <div class="max-players-presets">
                  ${[2, 4, 6, 8, 10]
        .filter((n) => n <= game.maxPlayers)
        .map(
          (n) => `
                    <button type="button" data-max-preset="${n}" class="max-players-chip ${this.getSlotLimit() === n ? 'active' : ''
            }">${n}P</button>
                  `
        )
        .join('')}
                </div>
              </div>
              <button class="btn btn-secondary" id="btn-open-ctrl">
                + Buka Controller Simulasi (Tab Baru)
              </button>
              <div id="bot-fill-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <button class="btn btn-secondary" id="btn-fill-4">Isi 4P (Bots)</button>
                <button class="btn btn-secondary" id="btn-fill-10">Isi 10P (Bots)</button>
              </div>
              <button class="btn btn-danger" id="btn-clear-bots">Hapus Semua Bot</button>
            </div>
          </div>

          <div class="room-modal-right">
            <div class="section-header" style="flex-wrap:wrap;gap:10px;">
              <h3 class="section-title">Pemain di Room (<span id="player-count">0</span> / <span id="player-max-count">${game.maxPlayers}</span>)</h3>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span id="ready-summary" class="ready-summary-pill">Menunggu pemain...</span>
                <div id="ai-level-bar" class="ai-level-bar" style="display:none;">
                  <span style="font-size:12px;color:var(--muted);font-weight:700;">Level Bot:</span>
                  ${(
        [
          ['easy', 'Mudah'],
          ['medium', 'Sedang'],
          ['hard', 'Sulit'],
          ['god', 'Dewa'],
        ] as const
      )
        .map(
          ([lvl, label]) => `
                    <button type="button" data-ai-level="${lvl}" class="btn ai-level-btn ${this.botLevel === lvl ? 'btn-primary' : 'btn-secondary'
            }">${label}</button>
                  `
        )
        .join('')}
                </div>
              </div>
            </div>

            <div class="players-grid" id="players-grid"></div>

            <div class="room-modal-footer">
              <div id="start-status-text" style="font-size:13px;color:var(--muted);font-weight:600;"></div>
              <button type="button" id="btn-start-game" class="btn btn-primary" style="padding:12px 24px;font-size:15px;">
                Mulai Game
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.root.appendChild(modal);

    this.qrCanvas = modal.querySelector('#qr-canvas');
    this.roomCodeEl = modal.querySelector('#room-code');
    this.joinUrlEl = modal.querySelector('#join-url');
    this.networkLabelEl = modal.querySelector('#network-label');
    this.playersGridEl = modal.querySelector('#players-grid');
    this.playerCountEl = modal.querySelector('#player-count');
    this.playerMaxCountEl = modal.querySelector('#player-max-count');

    const refreshBtn = modal.querySelector('#btn-refresh-qr');
    if (refreshBtn) {
      const iconEl = createElement(RefreshCw, { width: 18, height: 18, 'stroke-width': 2.5 });
      refreshBtn.appendChild(iconEl);
      refreshBtn.addEventListener('click', () => {
        localStorage.removeItem(ROOM_STORAGE_KEY);
        this.net.regenerateRoom();
        void this.fetchLanInfo();
      });
    }

    modal.querySelector('#btn-close-room')?.addEventListener('click', () => {
      this.closeRoomModal();
    });

    const maxInput = modal.querySelector('#inp-max-players') as HTMLInputElement | null;
    modal.querySelector('#btn-max-dec')?.addEventListener('click', () => {
      this.setCustomMaxPlayers(this.getSlotLimit() - 1);
    });
    modal.querySelector('#btn-max-inc')?.addEventListener('click', () => {
      this.setCustomMaxPlayers(this.getSlotLimit() + 1);
    });
    maxInput?.addEventListener('input', () => {
      this.setCustomMaxPlayers(Number(maxInput.value || game.maxPlayers));
    });
    modal.querySelectorAll<HTMLButtonElement>('[data-max-preset]').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.setCustomMaxPlayers(Number(chip.dataset.maxPreset || game.maxPlayers));
      });
    });

    modal.querySelector('#btn-open-ctrl')?.addEventListener('click', () => {
      window.open(`/?mode=controller&room=${this.roomCode}`, '_blank');
    });
    modal.querySelector('#btn-fill-4')?.addEventListener('click', () => this.addBotsToFill(4));
    modal.querySelector('#btn-fill-10')?.addEventListener('click', () => this.addBotsToFill(this.getSlotLimit()));
    modal.querySelector('#btn-clear-bots')?.addEventListener('click', () => {
      this.bots = [];
      this.renderPlayersGrid();
    });
    modal.querySelectorAll<HTMLButtonElement>('[data-ai-level]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextLevel = (btn.dataset.aiLevel || 'medium') as BotLevel;
        this.botLevel = nextLevel;
        this.bots = this.bots.map((b) => (b.isBot ? { ...b, botLevel: nextLevel } : b));
        modal.querySelectorAll<HTMLButtonElement>('[data-ai-level]').forEach((b) => {
          b.className = `btn ai-level-btn ${b.dataset.aiLevel === nextLevel ? 'btn-primary' : 'btn-secondary'}`;
        });
        this.renderPlayersGrid();
      });
    });
    modal.querySelector('#btn-start-game')?.addEventListener('click', () => {
      if (!this.canStartGame()) return;
      this.launchGame(this.selectedGame);
    });

    if (createNewConnection) {
      localStorage.removeItem(ROOM_STORAGE_KEY);
      this.net.connect();
      void this.fetchLanInfo();
    } else {
      this.net.syncSelectedGame(game.id);
      this.updateQrAndRoom();
    }

    this.syncSlotLimitUi();
    this.renderPlayersGrid();
  }

  private closeRoomModal(): void {
    localStorage.removeItem(ROOM_STORAGE_KEY);
    this.net.closeRoom();
    this.remotePlayers = [];
    this.bots = [];
    this.roomCode = '----';
    this.root.querySelector('#room-lobby-modal')?.remove();
    this.qrCanvas = null;
    this.roomCodeEl = null;
    this.joinUrlEl = null;
    this.networkLabelEl = null;
    this.playersGridEl = null;
    this.playerCountEl = null;
    this.playerMaxCountEl = null;
  }

  private canStartGame(): boolean {
    const merged = this.getMergedPlayers();
    if (merged.length === 0) return false;
    const connectedHumans = this.remotePlayers.filter((p) => p.connected);
    if (connectedHumans.length === 0) return true;
    return connectedHumans.every((p) => p.ready);
  }

  private updateStartButtonState(): void {
    const startBtn = this.root.querySelector('#btn-start-game') as HTMLButtonElement | null;
    const statusText = this.root.querySelector('#start-status-text') as HTMLElement | null;
    const summaryEl = this.root.querySelector('#ready-summary') as HTMLElement | null;
    if (!startBtn || !statusText) return;

    const merged = this.getMergedPlayers();
    const connectedHumans = this.remotePlayers.filter((p) => p.connected);
    const readyCount = connectedHumans.filter((p) => p.ready).length;

    if (merged.length === 0) {
      startBtn.disabled = true;
      statusText.textContent = 'Belum ada pemain yang masuk. Scan QR Code dari HP atau tambah Bot dulu.';
      if (summaryEl) {
        summaryEl.textContent = 'Belum ada pemain';
        summaryEl.className = 'ready-summary-pill waiting';
      }
      return;
    }

    if (connectedHumans.length === 0) {
      startBtn.disabled = false;
      statusText.textContent = 'Siap main solo dengan Keyboard PC & Bot!';
      if (summaryEl) {
        summaryEl.textContent = 'Mode Solo & Bot';
        summaryEl.className = 'ready-summary-pill ready';
      }
      return;
    }

    const allReady = readyCount === connectedHumans.length;
    startBtn.disabled = !allReady;
    if (allReady) {
      statusText.textContent = `Semua pemain siap (${readyCount}/${connectedHumans.length})! Yuk, mulai gamenya.`;
      if (summaryEl) {
        summaryEl.textContent = `${readyCount}/${connectedHumans.length} Siap`;
        summaryEl.className = 'ready-summary-pill ready';
      }
    } else {
      statusText.textContent = `Menunggu semua pemain menekan Siap (${readyCount}/${connectedHumans.length} sudah siap).`;
      if (summaryEl) {
        summaryEl.textContent = `${readyCount}/${connectedHumans.length} Siap`;
        summaryEl.className = 'ready-summary-pill waiting';
      }
    }
  }

  private setCustomMaxPlayers(nextVal: number): void {
    const game = this.selectedGame;
    const clamped = Math.min(game.maxPlayers, Math.max(1, Math.round(nextVal)));
    this.customMaxPlayers = clamped;

    const modal = this.root.querySelector('#room-lobby-modal');
    if (modal) {
      const maxInput = modal.querySelector('#inp-max-players') as HTMLInputElement | null;
      const maxBadge = modal.querySelector('#max-players-badge') as HTMLElement | null;
      if (maxInput) maxInput.value = String(clamped);
      if (maxBadge) maxBadge.textContent = `${clamped} Pemain`;
      modal.querySelectorAll<HTMLButtonElement>('[data-max-preset]').forEach((chip) => {
        chip.classList.toggle('active', Number(chip.dataset.maxPreset) === clamped);
      });
    }

    const humansCount = this.remotePlayers.filter((p) => p.connected).length;
    const maxBotsAllowed = Math.max(0, clamped - humansCount);
    if (this.bots.length > maxBotsAllowed) {
      this.bots = this.bots.slice(0, maxBotsAllowed);
    }
    this.syncSlotLimitUi();
    this.renderPlayersGrid();
  }

  private syncSlotLimitUi(): void {
    const maxSlots = this.getSlotLimit();
    if (this.playerMaxCountEl) this.playerMaxCountEl.textContent = String(maxSlots);

    const botFillGrid = this.root.querySelector('#bot-fill-grid') as HTMLElement | null;
    const btnFill4 = this.root.querySelector('#btn-fill-4') as HTMLButtonElement | null;
    const btnFill10 = this.root.querySelector('#btn-fill-10') as HTMLButtonElement | null;
    if (botFillGrid) {
      botFillGrid.style.gridTemplateColumns = maxSlots > 4 ? '1fr 1fr' : '1fr';
    }
    if (btnFill4) {
      btnFill4.textContent = `Isi ${Math.min(4, maxSlots)}P (Bots)`;
    }
    if (btnFill10) {
      btnFill10.textContent = `Isi ${maxSlots}P (Bots)`;
      btnFill10.style.display = maxSlots > 4 ? '' : 'none';
    }
  }

  private syncBotsToServer(): void {
    const botChars = this.bots
      .map((b) => b.characterId)
      .filter((c): c is string => Boolean(c));
    this.net.syncBotCharacters(botChars);
  }

  private renderPlayersGrid(): void {
    this.syncBotsToServer();
    if (!this.playersGridEl) return;
    const maxSlots = this.getSlotLimit();
    const merged = this.getMergedPlayers(maxSlots);
    if (this.playerCountEl) this.playerCountEl.textContent = String(merged.length);
    if (this.playerMaxCountEl) this.playerMaxCountEl.textContent = String(maxSlots);

    this.playersGridEl.style.gridTemplateColumns =
      maxSlots <= 2 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(175px, 1fr))';

    const bySlot = new Map(merged.map((p) => [p.slot, p]));
    const hasAi = merged.some((p) => p.isBot);
    const aiLevelBar = this.root.querySelector('#ai-level-bar') as HTMLElement | null;
    if (aiLevelBar) {
      aiLevelBar.style.display = hasAi ? 'flex' : 'none';
    }
    const aiLevelLabel =
      this.botLevel === 'god'
        ? 'Dewa'
        : this.botLevel === 'hard'
          ? 'Sulit'
          : this.botLevel === 'easy'
            ? 'Mudah'
            : 'Sedang';

    this.playersGridEl.innerHTML = '';

    for (let slot = 0; slot < maxSlots; slot++) {
      const p = bySlot.get(slot);
      const cell = document.createElement('div');
      if (!p) {
        cell.className = 'player-slot empty';
        cell.textContent = `Slot P${slot + 1}`;
      } else {
        cell.className = 'player-slot active';
        const badgeClass =
          p.transport === 'webrtc' ? 'badge-rtc' : p.transport === 'bot' ? 'badge-bot' : 'badge-ws';
        const badgeLabel =
          p.id === 'local_p1'
            ? 'Keyboard PC'
            : p.transport === 'webrtc'
              ? 'WebRTC P2P'
              : p.transport === 'bot'
                ? `AI Bot • ${aiLevelLabel}`
                : p.transport === 'ws-fallback'
                  ? 'WS Relay'
                  : 'Connecting...';
        const pingLabel = p.isBot ? '0 ms' : `${p.pingMs} ms`;
        const charName = p.characterId
          ? this.getCharacterDisplayName(p.characterId, slot)
          : 'Lagi pilih karakter...';
        const remoteMatch = !p.isBot && p.id !== 'local_p1'
          ? this.remotePlayers.find((rp) => rp.id === p.id)
          : undefined;
        const isReady = p.isBot || p.id === 'local_p1' ? true : Boolean(remoteMatch?.ready);
        const readyBadge = isReady
          ? '<span class="slot-ready-badge ready">Siap</span>'
          : '<span class="slot-ready-badge waiting">Belum Siap</span>';

        cell.innerHTML = `
          <div class="slot-top">
            <span class="color-dot" style="background:${p.color};"></span>
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">P${slot + 1} ${p.name}</span>
            <button type="button" class="slot-delete-btn" title="Hapus ${p.name}" aria-label="Hapus ${p.name}">✕</button>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0;">
            <span style="font-size:11px;color:var(--muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${charName}</span>
            ${readyBadge}
          </div>
          <div class="slot-meta">
            <span class="${badgeClass}">${badgeLabel}</span>
            <span>${pingLabel}</span>
          </div>
        `;
        cell.querySelector('.slot-delete-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removePlayer(p);
        });
      }
      this.playersGridEl.appendChild(cell);
    }

    if (maxSlots < this.selectedGame.maxPlayers) {
      const addCell = document.createElement('button');
      addCell.type = 'button';
      addCell.className = 'player-slot add-slot';
      addCell.title = `Tambah Maks Slot ke ${maxSlots + 1}`;
      addCell.setAttribute('aria-label', `Tambah Maks Slot ke ${maxSlots + 1}`);
      const plusWrap = document.createElement('span');
      plusWrap.className = 'slot-plus-icon';
      plusWrap.appendChild(createElement(Plus, { width: 16, height: 16, 'stroke-width': 2.5 }));
      const label = document.createElement('span');
      label.textContent = `Tambah Slot (P${maxSlots + 1})`;
      addCell.appendChild(plusWrap);
      addCell.appendChild(label);
      addCell.addEventListener('click', () => {
        this.setCustomMaxPlayers(maxSlots + 1);
      });
      this.playersGridEl.appendChild(addCell);
    }

    this.updateStartButtonState();
  }

  private removePlayer(player: PlatformPlayer): void {
    if (player.isBot || player.id === 'local_p1') {
      this.bots = this.bots.filter((b) => b.id !== player.id);
      this.renderPlayersGrid();
      return;
    }
    this.net.removePlayer(player.id);
  }

  private launchGame(game: PlatformGame): void {
    this.selectedGame = game;
    this.net.syncSelectedGame(game.id);
    const maxSlots = game.maxPlayers;
    const current = this.getMergedPlayers(maxSlots);
    const roster = this.getActiveRoster();

    // Ensure at least 1 local player + bots up to game capacity (max 4 default for 10P, 2 for 2P)
    if (current.length === 0) {
      const botCount = Math.min(maxSlots - 1, 3);
      this.bots = [
        {
          id: 'local_p1',
          slot: 0,
          name: 'PC Driver',
          color: BOT_COLORS[0],
          characterId: roster[0].id,
          isBot: false,
          connected: true,
          transport: 'bot',
          pingMs: 0,
        },
        ...Array.from({ length: botCount }, (_, i) => ({
          id: `bot_${i + 1}`,
          slot: i + 1,
          name: `Bot ${i + 1}`,
          color: BOT_COLORS[i + 1],
          characterId: roster[(i + 1) % roster.length].id,
          isBot: true,
          botLevel: this.botLevel,
          connected: true,
          transport: 'bot' as const,
          pingMs: 0,
        })),
      ];
      this.syncBotsToServer();
    } else if (current.length < game.minPlayers) {
      this.addBotsToFill(game.minPlayers);
    }

    this.activeGame = game;
    void this.requestWakeLock();
    this.root.innerHTML = '';
    const stage = document.createElement('div');
    stage.className = 'game-stage';
    this.root.appendChild(stage);

    this.net.sendReliableEvent('*', {
      type: 'game_started',
      gameId: game.id,
      layout: game.controllerLayout,
    });

    const sdk: HostSDKContext = {
      getPlayers: () => this.getMergedPlayers(),
      getInput: (playerId: string) => {
        if (playerId === 'local_p1') {
          return this.getKeyboardInput();
        }
        const remote = this.net.getInputMap().get(playerId);
        if (remote) return remote;
        return undefined;
      },
      sendTelemetry: (playerId, packet) => {
        if (playerId !== 'local_p1' && !playerId.startsWith('bot_')) {
          this.net.sendTelemetry(playerId, packet);
        }
      },
      sendVibrate: (playerId, pattern) => {
        if (playerId !== 'local_p1' && !playerId.startsWith('bot_')) {
          this.net.sendReliableEvent(playerId, { type: 'vibrate', pattern });
        }
      },
      sendReliableEvent: (playerId, event) => {
        this.net.sendReliableEvent(playerId, event);
      },
      exitToHub: () => this.exitToHub(),
    };

    game.mount(stage, sdk);
  }

  private exitToHub(): void {
    if (this.activeGame) {
      this.activeGame.unmount();
      this.activeGame = null;
    }
    void this.releaseWakeLock();
    this.net.sendReliableEvent('*', { type: 'returned_to_hub' });
    this.net.resetPlayersReady();
    const hasConnectedHumans = this.remotePlayers.some((p) => p.connected);
    this.renderHub();
    if (hasConnectedHumans) {
      this.openRoomModal(this.selectedGame, false);
    } else {
      this.net.closeRoom();
      this.remotePlayers = [];
      this.bots = [];
      this.roomCode = '----';
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

  private async releaseWakeLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      // Ignore
    } finally {
      this.wakeLock = null;
    }
  }

  private showHelpModal(): void {
    this.root.querySelector('#hub-help-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'hub-help-modal';
    modal.style.cssText =
      'position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,0.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="width:min(680px,100%);max-height:90vh;overflow-y:auto;background:#0f172a;border:1px solid rgba(148,163,184,0.28);border-radius:18px;padding:24px;color:#f8fafc;box-shadow:0 24px 60px rgba(0,0,0,0.55);display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid rgba(148,163,184,0.2);padding-bottom:12px;">
          <h2 style="margin:0;font-size:20px;font-weight:900;">Bantuan &amp; Panduan Bermain</h2>
          <button type="button" id="btn-close-help" class="btn btn-secondary" style="padding:6px 12px;font-size:13px;">✕ Tutup</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;font-size:14px;line-height:1.55;color:#cbd5e1;">
          <div>
            <h3 style="margin:0 0 6px;font-size:15px;color:#38bdf8;">1. Cara Menghubungkan Controller HP</h3>
            <ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:4px;">
              <li>Pastikan PC dan HP berada di <strong>jaringan Wi-Fi yang sama</strong>.</li>
              <li>Scan <strong>QR Code</strong> di sidebar kiri menggunakan kamera HP, atau buka URL yang tertera lalu masukkan <strong>Kode Room</strong>.</li>
              <li>Pilih karakter/pesawat yang tersedia (karakter yang sudah dipakai pemain lain atau AI otomatis terkunci).</li>
              <li>Putar HP ke posisi <strong>Landscape</strong> untuk mulai bermain.</li>
            </ul>
          </div>

          <div>
            <h3 style="margin:0 0 6px;font-size:15px;color:#38bdf8;">2. Bermain Solo atau Tambah AI Bot</h3>
            <ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:4px;">
              <li>Anda tetap bisa bermain sendiri di PC menggunakan <strong>Keyboard (W/A/S/D atau Panah, Space, Shift, E)</strong>.</li>
              <li>Gunakan tombol <strong>Isi 4P / 10P (Bots)</strong> dan pilih <strong>Level Bot</strong> (Mudah, Sedang, Sulit, Dewa) untuk balapan atau bertarung melawan bot.</li>
            </ul>
          </div>

          <div>
            <h3 style="margin:0 0 6px;font-size:15px;color:#38bdf8;">3. Kontrol Game</h3>
            <ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:4px;">
              <li><strong>Nitro Kart 3D (CTR Edition):</strong> Analog / Panah untuk stir, <strong>GAS</strong> untuk melaju, <strong>DRIFT</strong> untuk hop/drift, <strong>BOOST</strong> saat bar turbo penuh, dan <strong>ITEM</strong> untuk memakai senjata.</li>
              <li><strong>Game Lain (Space Dogfight, dll.):</strong> Gunakan <strong>Analog / Tombol Arah</strong> dan tombol aksi <strong>A, B, C, D</strong> pada Default Controller.</li>
            </ul>
          </div>
        </div>

        <div style="background:rgba(30,41,59,0.75);border:1px solid rgba(148,163,184,0.2);border-radius:14px;padding:16px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            <div style="font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Tentang Developer</div>
            <div style="font-size:16px;font-weight:900;color:#f8fafc;margin-top:2px;">Fachrul Mustofa</div>
            <div style="font-size:13px;color:#cbd5e1;margin-top:2px;">Kreator Gaming Party Platform — Multiplayer WebRTC &amp; 3D Web Game.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="${DEVELOPER_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="text-decoration:none;">Kunjungi Website</a>
            <a href="${DONATION_URL}" target="_blank" rel="noopener noreferrer" class="btn" style="text-decoration:none;background:linear-gradient(135deg,#f59e0b,#ec4899);color:#fff;font-weight:800;">♥ Saweria</a>
          </div>
        </div>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    modal.querySelector('#btn-close-help')?.addEventListener('click', () => modal.remove());
    this.root.appendChild(modal);
  }

  private bindKeyboardFallback(): void {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      switch (e.code) {
        case 'KeyA':
        case 'ArrowLeft':
          this.keyState.left = down;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keyState.right = down;
          break;
        case 'KeyW':
        case 'ArrowUp':
          this.keyState.up = down;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keyState.down = down;
          break;
        case 'Space':
          this.keyState.drift = down;
          break;
        case 'KeyE':
          this.keyState.item = down;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keyState.boost = down;
          break;
      }
    };
    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));
    window.addEventListener('blur', () => {
      this.keyState.left = false;
      this.keyState.right = false;
      this.keyState.up = false;
      this.keyState.down = false;
      this.keyState.drift = false;
      this.keyState.item = false;
      this.keyState.boost = false;
    });
  }

  private getKeyboardInput(): ControllerInputState {
    const steer = (this.keyState.left ? -1 : 0) + (this.keyState.right ? 1 : 0);
    return {
      seq: 0,
      steer,
      gas: this.keyState.up,
      brake: this.keyState.down,
      drift: this.keyState.drift,
      item: this.keyState.item,
      boost: this.keyState.boost,
      timestamp: 0,
    };
  }
}
