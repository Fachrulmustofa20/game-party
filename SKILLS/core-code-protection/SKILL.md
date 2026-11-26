---
name: core-code-protection
description: Strict boundary rules preventing AI agents from modifying, refactoring, or touching unused core platform, networking, protocol, or unrelated game files during feature development.
---

# Core Code Protection Skill

Follow these strict boundary rules on every task in **Gaming Party Platform** so existing networking, signaling, and games remain stable and untouched.

## 1. Golden Rule: Minimal Scope Only

- **DO NOT** edit, refactor, rename, reformat, or "clean up" any file outside the exact extension points required by the user's request.
- **DO NOT** add `if (gameId === ...)` branches inside core orchestrators (`ControllerApp.ts`, `DefaultController.ts`, `HostNetworkManager.ts`, `server/index.ts`). Use the registry pattern instead (`ControllerRegistry.ts`, `AudioRegistry.ts`).
- **DO NOT** touch unrelated games (`src/games/kart/*`, `src/games/dogfight/*`) when creating or updating another game.

---

## 2. Protected Core Files (Do Not Touch Unless Explicitly Requested)

| Layer | Protected Files | Why Protected |
| :--- | :--- | :--- |
| **Signaling & Rooms** | `server/index.ts` | Shared room lifecycle, WebSocket relay, character locking API |
| **Binary Protocol** | `src/net/BinaryProtocol.ts`, `src/net/BinaryProtocol.test.ts` | Fixed 8-byte input & telemetry wire format |
| **Transport** | `src/net/HostNetworkManager.ts`, `src/net/ControllerNetworkClient.ts` | WebRTC DataChannel + WebSocket fallback transport |
| **SDK Contracts** | `src/sdk/GameSDK.ts` | Shared `PlatformGame` & `HostSDKContext` interfaces |
| **Controller Core** | `src/controller/ControllerApp.ts`, `src/controller/GameControllerView.ts`, `src/controller/DefaultController.ts` | Shared join flow, fallback `A/B/C/D` controller, touch helpers |
| **Audio Core** | `src/audio/GameAudioEngine.ts` | Shared `GameAudioEngine` interface & `DefaultAudioEngine` |
| **Main Entry & CSS** | `src/main.ts`, `index.html`, `src/style.css` | Global shell, routing, and shared controller/hub styles |

---

## 3. Allowed Extension Touchpoints

When adding or updating a game, restrict your edits strictly to:

1. **Game folder:** `src/games/<your-game-slug>/*` (create new files here).
2. **Hub registration:** Only the import + `games` array entry in `src/platform/PlatformApp.ts`.
3. **Controller registration (optional):** Only `CONTROLLER_FACTORIES` in `src/controller/ControllerRegistry.ts`.
4. **Audio registration (optional):** Only `AUDIO_FACTORIES` in `src/audio/AudioRegistry.ts`.

---

## 4. Mandatory Pre-Completion Check

Before finishing your task:
1. Run `git status --short` or `git diff --name-only` to verify **no protected core files** were modified accidentally.
2. If any core file was touched unintentionally, revert it immediately (`git checkout -- <file>`) before running final checks.
3. Verify the build and protocol tests pass without modifying `BinaryProtocol.test.ts`:
   ```bash
   npm run build && npm run test:protocol
   ```
