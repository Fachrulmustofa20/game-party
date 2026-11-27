import { SpaceAudioEngine } from '../games/dogfight/SpaceAudioEngine';
import { LiarsDiceAudioEngine } from '../games/liars-dice/LiarsDiceAudioEngine';
import { PokerAudioEngine } from '../games/poker/PokerAudioEngine';
import { LudoAudioEngine } from '../games/ludo/LudoAudioEngine';
import { BomberAudioEngine } from '../games/bomber/BomberAudioEngine';
import { LudoAudioEngine } from '../games/ludo/LudoAudioEngine';
import { DefaultAudioEngine, GameAudioEngine } from './GameAudioEngine';
import { KartAudioEngine } from './KartAudioEngine';

/**
 * Per-game audio registry.
 * Games with custom audio return their dedicated audio engine;
 * all other games (and the hub) fall back to DefaultAudioEngine.
 */
const AUDIO_FACTORIES: Record<string, () => GameAudioEngine> = {
  'nitro-kart-3d': () => new KartAudioEngine(),
  'space-dogfight-2p': () => new SpaceAudioEngine(),
  'liars-dice': () => new LiarsDiceAudioEngine(),
  'texas-poker': () => new PokerAudioEngine(),
  'ludo-3d': () => new LudoAudioEngine(),
  'bomber-party': () => new BomberAudioEngine(),
  'ludo-3d': () => new LudoAudioEngine(),
};

export function createAudioForGame(gameId: string | null): GameAudioEngine {
  if (gameId && AUDIO_FACTORIES[gameId]) {
    return AUDIO_FACTORIES[gameId]();
  }
  return new DefaultAudioEngine();
}
