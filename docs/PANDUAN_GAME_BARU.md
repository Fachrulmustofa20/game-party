# Panduan Step-by-Step: Membuat Game Baru & Custom Controller

Dokumen ini menjelaskan cara menambahkan game baru ke **Nitro Party Platform** beserta cara membuat **Custom Controller** khusus untuk game tersebut (atau menggunakan `DefaultController` bawaan).

---

## Arsitektur Singkat

```text
[Layar PC / TV (Host)]                 [HP Pemain (Controller)]
PlatformApp.ts                         ControllerApp.ts
  └─ Game (implements PlatformGame)      └─ ControllerRegistry.ts
       ├─ baca input: sdk.getInput()          ├─ 'nitro-kart-3d' -> KartController
       └─ kirim HUD:  sdk.sendTelemetry()     └─ game lain / default -> DefaultController
```

- **Host (PC/TV)** menjalankan logika game, fisika, AI Bot, dan rendering (Three.js / Canvas 2D / DOM).
- **Controller (HP)** merender UI gamepad sesuai `gameId` yang dikirim Host melalui event `game_started`.
- Komunikasi input berjalan pada **60Hz** dalam paket binary **8 byte** (`ControllerInputState`), sedangkan telemetri HUD dari Host ke HP dikirim sekitar **15Hz** (`TelemetryPacket`).

---

## Bagian A: Membuat Game Baru

### Langkah 1 — Buat Folder & Class Game (`PlatformGame`)

Buat folder baru di `src/games/<nama-game>/`, misalnya `src/games/bomber/BomberGame.ts`, lalu implementasikan interface `PlatformGame` dari `src/sdk/GameSDK.ts`:

```ts
import { HostSDKContext, PlatformGame } from '../../sdk/GameSDK';

export class BomberGame implements PlatformGame {
  id = 'bomber-party'; // ID unik (dipakai juga untuk mapping Custom Controller)
  title = 'Bomber Party';
  subtitle = 'Lempar bom dan bertahan paling akhir di arena!';
  badge = '4-10 PLAYER • ARENA';
  accentColor = '#f97316';
  coverImage = '/images/nitro-kart-cover.png'; // atau data:image/svg+xml
  minPlayers = 2;
  maxPlayers = 10;
  controllerLayout = 'arena-dpad' as const;

  private container: HTMLElement | null = null;
  private sdk: HostSDKContext | null = null;
  private rafId: number | null = null;

  mount(container: HTMLElement, sdk: HostSDKContext): void {
    this.container = container;
    this.sdk = sdk;

    // 1. Siapkan canvas / Three.js renderer + tombol keluar ke Hub
    container.innerHTML = `
      <div class="game-topbar">
        <button id="btn-exit" class="btn btn-danger">Keluar ke Lobby</button>
      </div>
      <canvas id="game-canvas" style="width:100%;height:100%;display:block;"></canvas>
    `;
    container.querySelector('#btn-exit')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });

    // 2. Ambil daftar pemain (termasuk AI Bot jika ada)
    const players = sdk.getPlayers();
    console.log('Pemain di match:', players);

    // 3. Game loop
    const loop = () => {
      this.update();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private update(): void {
    if (!this.sdk) return;

    for (const p of this.sdk.getPlayers()) {
      if (p.isBot) {
        // Jalankan logika AI Bot berdasarkan p.botLevel ('easy' | 'medium' | 'hard' | 'god')
        continue;
      }

      const input = this.sdk.getInput(p.id);
      if (!input) continue;

      // Baca input dari Controller HP / Keyboard PC:
      // input.steer -> -1.0 (kiri) .. +1.0 (kanan)
      // input.gas   -> tombol D / Atas / Gas
      // input.brake -> tombol Bawah / Mundur
      // input.drift -> tombol C / Drift / Lompat
      // input.boost -> tombol B / Boost / Dash
      // input.item  -> tombol A / Item / Tembak
    }
  }

  unmount(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.container) this.container.innerHTML = '';
    this.sdk = null;
  }
}
```

> **Tips Haptic & Telemetri:**
> - Untuk menggetarkan HP pemain saat terkena serangan: `this.sdk.sendVibrate(player.id, [80, 40, 120])`.
> - Untuk memperbarui HUD & radar di layar HP (~15Hz): `this.sdk.sendTelemetry(player.id, { ... })`.

---

### Langkah 2 — Daftarkan Game ke Hub (`src/platform/PlatformApp.ts`)

Buka `src/platform/PlatformApp.ts`, import class game Anda, lalu tambahkan ke array `this.games`:

```ts
import { BomberGame } from '../games/bomber/BomberGame';

// Di dalam class PlatformApp:
private games: PlatformGame[] = [
  new KartGame(),
  new SpaceDogfightGame(),
  new BomberGame(), // <-- tambahkan di sini
];
```

Sampai tahap ini, game Anda **sudah bisa langsung dimainkan** menggunakan **Default Controller** (`DefaultController`: Analog / Tombol 4 Arah di kiri + tombol `A`, `B`, `C`, `D` di kanan)!

---

## Bagian B: Membuat Custom Controller Sendiri (Opsional)

Jika game Anda membutuhkan tombol, label, atau HUD khusus di layar HP (seperti `KartController` pada *Nitro Kart 3D*), ikuti langkah berikut:

### Langkah 3 — Buat Class Controller (`GameControllerView`)

Buat file baru di folder game Anda, misalnya `src/games/bomber/BomberController.ts`, lalu implementasikan interface `GameControllerView` dari `src/controller/GameControllerView.ts`:

```ts
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
import { TelemetryPacket } from '../../net/BinaryProtocol';
import { TransportMode } from '../../net/HostNetworkManager';

export class BomberController implements GameControllerView {
  readonly id = 'bomber-party';
  private root: HTMLElement | null = null;
  private ctx: ControllerViewContext | null = null;
  private cleanupAnalog: (() => void) | null = null;

  private steer = 0;
  private moveUp = false;
  private moveDown = false;
  private btnBomb = false;
  private btnDash = false;

  private statusBadgeEl: HTMLElement | null = null;
  private rankEl: HTMLElement | null = null;
  private radarCanvas: HTMLCanvasElement | null = null;

  mount(container: HTMLElement, ctx: ControllerViewContext): void {
    this.root = container;
    this.ctx = ctx;

    container.innerHTML = `
      <div class="ctrl-gamepad">
        <!-- Kiri: Analog -->
        <div class="steer-zone">
          <div class="analog-base" id="bomber-analog-base">
            <div class="analog-knob" id="bomber-analog-knob"></div>
          </div>
          <div style="font-size:11px;color:var(--muted);">Gerak Karakter</div>
        </div>

        <!-- Tengah: HUD & Radar -->
        <div class="center-hud">
          <div style="display:flex;justify-content:space-between;width:100%;font-size:11px;align-items:center;">
            <span style="font-weight:900;color:${ctx.color};">P${ctx.slot + 1}</span>
            <button id="btn-fs" class="btn btn-secondary ctrl-top-btn" style="padding:3px 8px;font-size:10px;">
              ${CTRL_SVG_ICONS.fullscreen}<span>Fullscreen</span>
            </button>
            <span id="status-badge" class="badge-ws">Connecting...</span>
          </div>
          <div id="hud-rank" style="font-size:22px;font-weight:900;">1/1</div>
          <canvas id="radar-canvas" width="120" height="72" style="background:#070b14;border-radius:10px;"></canvas>
        </div>

        <!-- Kanan: Tombol Aksi Khusus -->
        <div class="action-zone">
          <button id="btn-bomb" class="pad-btn btn-brake" style="grid-column:span 2;">
            <span class="pad-btn-icon">💣</span>
            <span class="pad-btn-label">TARUH BOM</span>
          </button>
          <button id="btn-dash" class="pad-btn btn-boost boost-ready" style="grid-column:span 2;">
            <span class="pad-btn-icon">⚡</span>
            <span class="pad-btn-label">DASH</span>
          </button>
        </div>
      </div>
    `;

    this.statusBadgeEl = container.querySelector('#status-badge');
    this.rankEl = container.querySelector('#hud-rank');
    this.radarCanvas = container.querySelector('#radar-canvas');
    this.updateTransport(ctx.transportMode);

    // Helper Analog bawaan (sudah mendukung touch + mouse + auto-follow)
    const zone = container.querySelector('.steer-zone') as HTMLElement;
    const base = container.querySelector('#bomber-analog-base') as HTMLElement;
    const knob = container.querySelector('#bomber-analog-knob') as HTMLElement;
    this.cleanupAnalog = bindFloatingAnalog(
      zone,
      base,
      knob,
      () => false,
      (nx, ny) => {
        this.steer = nx;
        this.moveUp = ny < -0.25;
        this.moveDown = ny > 0.25;
      },
      () => {
        this.steer = 0;
        this.moveUp = false;
        this.moveDown = false;
      }
    );

    // Helper Tombol Tahan bawaan (touch + mouse + getaran haptic)
    bindHoldButton(container.querySelector('#btn-bomb'), (v) => (this.btnBomb = v), ctx.onUnlockAudio);
    bindHoldButton(container.querySelector('#btn-dash'), (v) => (this.btnDash = v), ctx.onUnlockAudio);

    container.querySelector('#btn-fs')?.addEventListener('click', () => ctx.onToggleFullscreen());
    ctx.onBindLandscapeGuard();
  }

  updateTransport(mode: TransportMode): void {
    updateTransportBadge(this.statusBadgeEl, mode);
  }

  updateTelemetry(t: TelemetryPacket): void {
    if (this.rankEl) this.rankEl.textContent = `${t.rank}/${t.totalPlayers}`;
    drawRadarBlips(this.radarCanvas, t, this.ctx?.slot ?? 0);
  }

  getOutput(): ControllerOutput {
    return {
      steer: this.steer,
      gas: this.moveUp,
      brake: this.moveDown,
      drift: false,
      item: this.btnBomb,
      boost: this.btnDash,
    };
  }

  releaseAllInputs(): void {
    this.steer = 0;
    this.moveUp = false;
    this.moveDown = false;
    this.btnBomb = false;
    this.btnDash = false;
    this.root?.querySelectorAll('.pad-btn.pressed').forEach((el) => el.classList.remove('pressed'));
  }

  unmount(): void {
    this.cleanupAnalog?.();
    this.cleanupAnalog = null;
    this.releaseAllInputs();
    this.root = null;
  }
}
```

---

### Langkah 4 — Daftarkan Custom Controller di `ControllerRegistry.ts`

Buka `src/controller/ControllerRegistry.ts` dan daftarkan factory berdasarkan `game.id`:

```ts
import { BomberController } from '../games/bomber/BomberController';
import { KartController } from '../games/kart/KartController';
import { DefaultController } from './DefaultController';
import { GameControllerView } from './GameControllerView';

const CONTROLLER_FACTORIES: Record<string, () => GameControllerView> = {
  'nitro-kart-3d': () => new KartController(),
  'bomber-party': () => new BomberController(), // <-- daftarkan di sini
};
```

> **Catatan:** Pastikan key di `CONTROLLER_FACTORIES` sama persis dengan properti `id` pada class game Anda (`PlatformGame.id`).

---

## Referensi Mapping Paket Binary (8-Byte Input & Telemetri)

### 1. Input Controller (`ControllerInputState`)

| Field | Tipe | Mapping `DefaultController` | Mapping `KartController` (CTR) |
| :--- | :--- | :--- | :--- |
| `steer` | `-1.0 .. +1.0` | Analog X / Tombol Kiri-Kanan | Analog X / Tombol Kiri-Kanan |
| `gas` | `boolean` | Tombol `D` / Analog Atas / Panah Atas | Tombol `GAS` |
| `brake` | `boolean` | Analog Bawah / Panah Bawah | Analog Bawah / Tombol `MUNDUR` |
| `drift` | `boolean` | Tombol `C` | Tombol `DRIFT / HOP` |
| `boost` | `boolean` | Tombol `B` | Tombol `BOOST` |
| `item` | `boolean` | Tombol `A` | Tombol `ITEM` |

### 2. Telemetri Host → HP (`TelemetryPacket`)

- `rank`, `totalPlayers`: Posisi & total pemain aktif.
- `lap`, `maxLaps`: Ronde/Lap saat ini & total ronde/lap.
- `speedKmh`: Angka indikator kecepatan / skor (`0..255`).
- `turboCharge`, `turboZone`, `itemId`, `boostCooldownSec`: Status bar & cooldown tombol aksi.
- `karts`: Array `{ slot, x, z }` ternormalisasi `0..255` untuk digambar di mini-radar controller (`drawRadarBlips`).

---

## Verifikasi & Menjalankan

Setelah menambahkan game dan/atau controller baru, jalankan:

```bash
# Cek kompilasi TypeScript & bundle Vite
npm run build

# Jalankan test protokol binary 8-byte
npm run test:protocol

# Jalankan server signaling + Vite dev server
npm run dev
```
