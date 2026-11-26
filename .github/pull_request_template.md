## Summary

<!-- Briefly describe what this PR changes and why. -->

## Type of Change

- [ ] New game module (`src/games/<slug>/`)
- [ ] Custom controller / audio engine
- [ ] Bug fix
- [ ] UI / UX improvement
- [ ] Documentation / Skills
- [ ] Core infrastructure (requires explicit justification)

## Changes Made

- 
- 

## Architecture & Scope Check

- [ ] Changes follow the modular extension pattern (`PlatformApp.ts`, `ControllerRegistry.ts`, `AudioRegistry.ts`)
- [ ] No unintended edits to protected core files (`server/index.ts`, `BinaryProtocol.ts`, `HostNetworkManager.ts`, `ControllerNetworkClient.ts`, `GameSDK.ts`, `ControllerApp.ts`, `DefaultController.ts`)
- [ ] Existing games (`nitro-kart-3d`, `space-dogfight-2p`) were not broken

## Verification

- [ ] `npm run build` (`vite build && tsc --noEmit`) passes
- [ ] `npm run test:protocol` passes
- [ ] Tested manually in browser (Host PC + Smartphone/Simulated Controller)

## Screenshots / Notes (Optional)

<!-- Add screenshots, recordings, or reviewer notes if applicable. -->
