import { KartController } from '../games/kart/KartController';
import { DefaultController } from './DefaultController';
import { GameControllerView } from './GameControllerView';

/**
 * Per-game controller registry.
 * Games with a custom controller return their dedicated controller;
 * all other games (and the hub) fall back to DefaultController (A/B/C/D + Analog/Arrow).
 */
const CONTROLLER_FACTORIES: Record<string, () => GameControllerView> = {
  'nitro-kart-3d': () => new KartController(),
};

export function createControllerForGame(gameId: string | null): GameControllerView {
  if (gameId && CONTROLLER_FACTORIES[gameId]) {
    return CONTROLLER_FACTORIES[gameId]();
  }
  return new DefaultController();
}
