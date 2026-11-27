# Gaming Party Platform — Developer Guide

A local-multiplayer (1–10 players) 3D party game platform where a **PC / TV acts as the shared Host screen** and **smartphones act as low-latency controllers** over WebRTC DataChannels (with automatic WebSocket relay fallback) using an 8-byte binary input protocol.

---

## Quick Start

```bash
npm install
npm run dev           # Starts signaling server (:3001) + Vite dev server (:5173)
npm run build         # Production Vite bundle + TypeScript typecheck
npm run test:protocol # Verifies 8-byte binary input & telemetry serialization
```

---

## Architecture Overview

```text
[PC / TV Host Screen]                    [Smartphone Controller]
src/platform/PlatformApp.ts              src/controller/ControllerApp.ts
  └─ Game (implements PlatformGame)        └─ ControllerRegistry.ts
       ├─ read input: sdk.getInput()            ├─ 'nitro-kart-3d' -> KartController
       └─ send HUD:   sdk.sendTelemetry()       └─ any other game -> DefaultController
```

- **Host (`PlatformApp`)**: Manages rooms, QR code join URLs, AI bots (with `easy`, `medium`, `hard`, `god` difficulty levels), and mounts the selected `PlatformGame`.
- **Controller (`ControllerApp`)**: Handles 2-step room verification, unique Superhero character selection, and dynamically mounts the matching `GameControllerView` when `game_started` is received.
- **Default Controller (`DefaultController`)**: Any game without a custom controller automatically receives the built-in `DefaultController` featuring **A, B, C, D** action buttons on the right and a switchable **360° Analog Stick / 4-Way Arrow Pad (Up, Down, Left, Right)** on the left.

---

## How to Create a New Game (Step-by-Step)

### Step 1: Create Your Game Class (`PlatformGame`)

Create a new folder under `src/games/<your-game>/`, for example `src/games/bomber/BomberGame.ts`, and implement `PlatformGame` from `src/sdk/GameSDK.ts`:

```ts
import { HostSDKContext, PlatformGame } from '../../sdk/GameSDK';

export class BomberGame implements PlatformGame {
  id = 'bomber-party'; // Unique ID (also used to match a custom controller)
  title = 'Bomber Party';
  subtitle = 'Drop bombs and be the last player standing!';
  badge = '2-10 PLAYERS • ARENA';
  accentColor = '#f97316';
  coverImage = '/images/nitro-kart-cover.png'; // Or an inline SVG data URI
  minPlayers = 2;
  maxPlayers = 10;
  controllerLayout = 'arena-dpad' as const;

  private container: HTMLElement | null = null;
  private sdk: HostSDKContext | null = null;
  private rafId: number | null = null;

  mount(container: HTMLElement, sdk: HostSDKContext): void {
    this.container = container;
    this.sdk = sdk;

    container.innerHTML = `
      <div class="game-topbar">
        <button id="btn-exit" class="btn btn-danger">Exit to Lobby</button>
      </div>
      <canvas id="game-canvas" style="width:100%;height:100%;display:block;"></canvas>
    `;

    container.querySelector('#btn-exit')?.addEventListener('click', () => {
      this.sdk?.exitToHub();
    });

    const loop = () => {
      this.update();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private update(): void {
    if (!this.sdk) return;

    for (const player of this.sdk.getPlayers()) {
      if (player.isBot) {
        // Run AI behavior scaled by player.botLevel ('easy' | 'medium' | 'hard' | 'god')
        continue;
      }

      const input = this.sdk.getInput(player.id);
      if (!input) continue;

      // Read 60Hz controller inputs:
      // input.steer -> -1.0 (left) .. +1.0 (right)
      // input.gas   -> Button D / Analog Up / Arrow Up
      // input.brake -> Analog Down / Arrow Down
      // input.drift -> Button C
      // input.boost -> Button B
      // input.item  -> Button A
    }
  }

  unmount(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.container) this.container.innerHTML = '';
    this.sdk = null;
  }
}
```

#### Useful `HostSDKContext` APIs
- `sdk.getPlayers()` — Returns all connected human players and AI bots (`slot`, `name`, `color`, `characterId`, `isBot`, `botLevel`).
- `sdk.getInput(playerId)` — Returns the latest `ControllerInputState` (from smartphone WebRTC/WS or PC keyboard P1).
- `sdk.sendVibrate(playerId, pattern)` — Triggers haptic vibration on the player's phone (e.g., `[80, 40, 120]`).
- `sdk.sendTelemetry(playerId, packet)` — Sends HUD & minimap updates (~15Hz) to the player's phone.
- `sdk.exitToHub()` — Cleanly unmounts the game and returns both Host and all Controllers to the lobby.

---

### Step 2: Register the Game in `PlatformApp.ts`

Open `src/platform/PlatformApp.ts`, import your game class, and add an instance to the `games` array:

```ts
import { BomberGame } from '../games/bomber/BomberGame';

// Inside PlatformApp:
private games: PlatformGame[] = [
  new KartGame(),
  new SpaceDogfightGame(),
  new BomberGame(), // <-- Add your game here
];
```

At this point, your game is playable in the Hub using `DefaultController` (**A, B, C, D** + **Analog / 4-Way Arrow Pad**).

---

## How to Build a Custom Controller (Optional)

If your game needs custom buttons, labels, or HUD widgets on the smartphone screen (similar to `KartController` for Nitro Kart 3D), create a dedicated controller module.

### Step 3: Implement `GameControllerView`

Create `src/games/bomber/BomberController.ts` implementing `GameControllerView` from `src/controller/GameControllerView.ts`:

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
        <div class="steer-zone">
          <div class="analog-base" id="bomber-analog-base">
            <div class="analog-knob" id="bomber-analog-knob"></div>
          </div>
          <div style="font-size:11px;color:var(--muted);">Move</div>
        </div>

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

        <div class="action-zone">
          <button id="btn-bomb" class="pad-btn btn-brake" style="grid-column:span 2;">
            <span class="pad-btn-icon">💣</span>
            <span class="pad-btn-label">DROP BOMB</span>
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

### Step 4: Register in `ControllerRegistry.ts`

Open `src/controller/ControllerRegistry.ts` and map your `game.id` to your custom controller:

```ts
import { BomberController } from '../games/bomber/BomberController';
import { KartController } from '../games/kart/KartController';
import { DefaultController } from './DefaultController';
import { GameControllerView } from './GameControllerView';

const CONTROLLER_FACTORIES: Record<string, () => GameControllerView> = {
  'nitro-kart-3d': () => new KartController(),
  'bomber-party': () => new BomberController(), // <-- Add mapping here
};
```

> **Important:** The key in `CONTROLLER_FACTORIES` must match `PlatformGame.id` exactly.

### Step 5 (Optional): Custom Character Selection (`GameCharacterView`)

If your game does not register a custom character view, the controller automatically falls back to `DefaultCharacterView` (`src/controller/DefaultCharacterView.ts`), which lets players pick from 10 colored character avatars (`src/sdk/DefaultCharacters.ts`).

To give your game custom characters (e.g. `KartCharacterView`, `PacCharacterView`, `SpaceCharacterView`, `SerpentCharacterView`):

1. Create `src/games/<game-slug>/<Name>CharacterView.ts` implementing `GameCharacterView` (`src/controller/GameCharacterView.ts`) — you can use the `mountStandardCharacterPicker(...)` helper or render custom HTML.
2. Register your `game.id` in `src/sdk/CharacterRegistry.ts`:

```ts
const CHARACTER_VIEW_FACTORIES: Record<string, () => GameCharacterView> = {
  'nitro-kart-3d': () => new KartCharacterView(),
  'bomber-party': () => new BomberCharacterView(), // <-- Optional custom character view
};
```

---

## How to Add a Game Card Hover Options Sheet (Optional)

If your game has pre-room settings (such as map, lap count, or difficulty) that should slide up from the bottom of the Hub card on hover without cluttering the card at rest:

1. Create a dedicated overlay module under `src/games/<your-game>/` (see `src/games/kart/KartCardOverlay.ts` for Nitro Kart 3D's lap & map selector).
2. Implement the optional `mountCardOverlay(container: HTMLElement, onCreateRoom: () => void): void` method from `PlatformGame` (`src/sdk/GameSDK.ts`) on your game class:

```ts
mountCardOverlay(container: HTMLElement, onCreateRoom: () => void): void {
  mountBomberCardOverlay(container, this, onCreateRoom);
}
```

3. `PlatformApp` automatically mounts your overlay inside `.game-card-hover-sheet` (`src/style.css`), which slides up smoothly from the bottom to match its content height on hover and hides again when the pointer leaves the card. Trigger `onCreateRoom()` from the overlay's **Buat Room** button.

---

## Binary Protocol Reference

### Controller Input (`ControllerInputState` — 8 bytes @ 60Hz)

| Field | Range / Type | `DefaultController` | `KartController` (CTR) |
| :--- | :--- | :--- | :--- |
| `steer` | `-1.0 .. +1.0` | Analog X / Left & Right Arrows | Analog X / Left & Right Buttons |
| `gas` | `boolean` | Button `D` / Analog Up / Up Arrow | `GAS` Button |
| `brake` | `boolean` | Analog Down / Down Arrow | Analog Down / `MUNDUR` Button |
| `drift` | `boolean` | Button `C` | `DRIFT / HOP` Button |
| `boost` | `boolean` | Button `B` | `BOOST` Button |
| `item` | `boolean` | Button `A` | `ITEM` Button |

### Host Telemetry (`TelemetryPacket` — ~15Hz)

- `rank`, `totalPlayers`: Player rank & active player count.
- `lap`, `maxLaps`: Current lap/round & total laps/rounds.
- `speedKmh`: Numeric speed or score display (`0..255`).
- `turboCharge`, `turboZone`, `itemId`, `boostCooldownSec`: Charge bar & action cooldown indicators.
- `karts`: Array of `{ slot, x, z }` normalized to `0..255` for `drawRadarBlips()`.
