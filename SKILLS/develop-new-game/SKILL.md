---
name: nitro-party-game-dev
description: Architecture guide and step-by-step workflow for AI agents to understand the Nitro Party Platform codebase and add new multiplayer games, custom smartphone controllers, and per-game audio engines without modifying core networking or platform files.
---

# Nitro Party Platform — Game Development Skill

Use this skill whenever you need to understand the **Nitro Party Platform** architecture or add a new game, custom smartphone controller, or per-game audio synthesizer.

## 1. Core Design Principle: Plug-and-Play Extension

This platform separates **immutable core infrastructure** (WebRTC P2P + WebSocket signaling, 8-byte binary protocol, hub lifecycle, fallback controller/audio) from **per-game modules**.

### Core Files (DO NOT MODIFY for a new game)
- `server/index.ts` — Room signaling, WebSocket relay, `/api/room-characters`
- `src/net/BinaryProtocol.ts` — 8-byte `ControllerInputState` & telemetry packet encoding
- `src/net/HostNetworkManager.ts` & `src/net/ControllerNetworkClient.ts` — WebRTC DataChannel + WS fallback
- `src/sdk/GameSDK.ts` — `PlatformGame`, `HostSDKContext`, `PlatformPlayer`, `BotLevel`
- `src/controller/ControllerApp.ts` — Join flow, room verification, dynamic controller/audio switching
- `src/controller/GameControllerView.ts` — `GameControllerView` interface & shared UI/input helpers
- `src/controller/DefaultController.ts` — Default `A/B/C/D` + `Analog/Arrow` controller
- `src/audio/GameAudioEngine.ts` — `GameAudioEngine` interface & `DefaultAudioEngine` fallback
- `src/games/kart/KartController.ts` — Dedicated CTR controller for `nitro-kart-3d` (leave untouched)

### Extension Points (WHERE YOU WORK)
1. **Game Logic & Renderer:** `src/games/<game-slug>/<Name>Game.ts`
2. **Hub Registration:** `src/platform/PlatformApp.ts` (`games` array)
3. **Custom Controller (Optional):** `src/games/<game-slug>/<Name>Controller.ts` + `src/controller/ControllerRegistry.ts`
4. **Custom Audio Engine (Optional):** `src/games/<game-slug>/<Name>AudioEngine.ts` + `src/audio/AudioRegistry.ts`

---

## 2. Architecture & Data Flow

```text
[Smartphone Controller]                      [PC Host Screen]
  ControllerApp.ts                             PlatformApp.ts
   ├─ ControllerRegistry.ts                     ├─ games: PlatformGame[]
   │   ├─ 'nitro-kart-3d' -> KartController     │   ├─ KartGame
   │   └─ default         -> DefaultController  │   ├─ SpaceDogfightGame
   ├─ AudioRegistry.ts                          │   └─ <YourNewGame>
   │   ├─ 'nitro-kart-3d'     -> KartAudioEngine└─ HostSDKContext
   │   ├─ 'space-dogfight-2p' -> SpaceAudioEngine   ├─ getPlayers()
   │   └─ default             -> DefaultAudioEngine ├─ getInput(playerId)
   └─ 8-byte Binary Input (60Hz) ───────────────►   ├─ sendTelemetry(...)
                                                    ├─ sendVibrate(...)
                                                    ├─ sendReliableEvent(...)
                                                    └─ exitToHub()
```

### 8-Byte Input Contract (`ControllerInputState`)
All controllers (including `DefaultController`) emit the exact same 6 fields so networking never needs changes:

| Field | Type | DefaultController Mapping | Typical Game Usage |
| :--- | :--- | :--- | :--- |
| `steer` | `number` (`-1..1`) | Analog X / Arrow `Kiri`–`Kanan` | Steering, horizontal movement, aiming |
| `gas` | `boolean` | Button `D` or Analog/Arrow `Atas` | Accelerate, thrust, move forward/up |
| `brake` | `boolean` | Analog/Arrow `Bawah` | Brake, reverse, move down |
| `drift` | `boolean` | Button `C` | Drift, hop, dodge, dash |
| `boost` | `boolean` | Button `B` | Turbo, boost, sprint, special |
| `item` | `boolean` | Button `A` | Fire weapon, use item, primary action |

---

## 3. Step-by-Step: Adding a New Game

### Step 1: Create the Game Class
Create `src/games/<game-slug>/<Name>Game.ts` implementing `PlatformGame` from `src/sdk/GameSDK.ts`:

```ts
import { HostSDKContext, PlatformGame } from '../../sdk/GameSDK';

export class MyNewGame implements PlatformGame {
  readonly id = 'my-new-game';
  readonly title = 'My New Game';
  readonly subtitle = 'Short 1-line description for the Hub card';
  readonly badge = '2-4P • Arcade';
  readonly accentColor = '#38bdf8';
  readonly coverImage = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#0f172a"/></svg>')}`;
  readonly minPlayers = 1;
  readonly maxPlayers = 4;
  readonly controllerLayout = 'arena-dpad'; // or 'racing-ctr'

  private container: HTMLElement | null = null;
  private sdk: HostSDKContext | null = null;
  private rafId: number | null = null;

  mount(container: HTMLElement, sdk: HostSDKContext): void {
    this.container = container;
    this.sdk = sdk;
    // Build Three.js / Canvas / DOM scene, HUD, and Exit button calling sdk.exitToHub()
    this.rafId = requestAnimationFrame(this.loop);
  }

  private loop = (): void => {
    const players = this.sdk?.getPlayers() ?? [];
    for (const p of players) {
      const input = p.isBot ? this.computeBotInput() : this.sdk?.getInput(p.id);
      // Update player state using input?.steer, gas, brake, drift, boost, item
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private computeBotInput() {
    return { steer: 0, gas: false, brake: false, drift: false, item: false, boost: false };
  }

  unmount(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // Remove window listeners, dispose WebGLRenderer, destroy audio engine
    if (this.container) this.container.innerHTML = '';
    this.container = null;
    this.sdk = null;
  }
}
```

### Step 2: Register the Game in `PlatformApp.ts`
In `src/platform/PlatformApp.ts`:
1. Import `MyNewGame` from `../games/<game-slug>/<Name>Game`.
2. Add `new MyNewGame()` to `private games: PlatformGame[] = [...]`.

With just Steps 1–2, your game automatically appears in the Hub, supports PC keyboard P1 + AI bots (`easy`/`medium`/`hard`/`god`), and gives every smartphone player `DefaultController` (`A/B/C/D` + `Analog/Arrow`).

### Step 3 (Optional): Add a Custom Smartphone Controller
Skip this step if `DefaultController` fits your game. Otherwise:
1. Create `src/games/<game-slug>/<Name>Controller.ts` implementing `GameControllerView` (`src/controller/GameControllerView.ts`).
2. Reuse shared helpers from `src/controller/GameControllerView.ts` instead of rewriting touch logic:
   - `bindFloatingAnalog(...)`
   - `bindHoldButton(...)`
   - `drawRadarBlips(...)`
   - `updateTransportBadge(...)`
   - `CTRL_SVG_ICONS`
3. Register it in `src/controller/ControllerRegistry.ts`:
   ```ts
   const CONTROLLER_FACTORIES: Record<string, () => GameControllerView> = {
     'nitro-kart-3d': () => new KartController(),
     'my-new-game': () => new MyNewController(),
   };
   ```

### Step 4 (Optional): Add a Per-Game Audio Engine
Skip this step if your game does not need custom Web Audio synthesis (it will use `DefaultAudioEngine`). Otherwise:
1. Create `src/games/<game-slug>/<Name>AudioEngine.ts` implementing `GameAudioEngine` (`src/audio/GameAudioEngine.ts`):
   - `readonly id = 'my-new-game';`
   - `unlock()`, `setMuted(muted)`, `isMuted()`, `updateFromController(ctx)`, `destroy()`
   - Add any game-specific SFX methods (e.g., `playLaser()`, `playScore()`, `playExplosion()`).
2. Register it in `src/audio/AudioRegistry.ts`:
   ```ts
   const AUDIO_FACTORIES: Record<string, () => GameAudioEngine> = {
     'nitro-kart-3d': () => new KartAudioEngine(),
     'space-dogfight-2p': () => new SpaceAudioEngine(),
     'my-new-game': () => new MyNewAudioEngine(),
   };
   ```
3. In `<Name>Game.ts`, instantiate `private audio = new MyNewAudioEngine()`, call `this.audio.unlock()` on `mount()` (plus `pointerdown`/`keydown` once listeners), and call `this.audio.destroy()` in `unmount()`.

---

## 4. Verification Checklist

Before finishing any new game or controller/audio change:
1. Ensure `unmount()` cancels `requestAnimationFrame`, removes all `window` event listeners, disposes Three.js `WebGLRenderer`, and calls `audio.destroy()`.
2. Verify `nitro-kart-3d` (`KartGame` + `KartController` + `KartAudioEngine`) was not broken.
3. Run:
   ```bash
   npm run build && npm run test:protocol
   ```
   Confirm `vite build`, `tsc --noEmit`, and `BinaryProtocol.test.ts` all pass with zero errors.
