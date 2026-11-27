import { DefaultCharacterView } from '../controller/DefaultCharacterView';
import { CharacterOption, GameCharacterView } from '../controller/GameCharacterView';
import { SpaceCharacterView } from '../games/dogfight/SpaceCharacterView';
import { KartCharacterView } from '../games/kart/KartCharacterView';
import { PacCharacterView } from '../games/pacman/PacCharacterView';
import { SerpentCharacterView } from '../games/snake/SerpentCharacterView';
import { LudoCharacterView } from '../games/ludo/LudoCharacterView';

export type { CharacterOption, GameCharacterView };

/**
 * Per-game character view registry (mirrors ControllerRegistry).
 * Games with custom characters register their GameCharacterView here;
 * all other games fall back to DefaultCharacterView (colored characters).
 */
const CHARACTER_VIEW_FACTORIES: Record<string, () => GameCharacterView> = {
  'nitro-kart-3d': () => new KartCharacterView(),
  'space-dogfight-2p': () => new SpaceCharacterView(),
  'neon-serpent': () => new SerpentCharacterView(),
  'pacman-ghost-hunt': () => new PacCharacterView(),
  'ludo-3d': () => new LudoCharacterView(),
};

export function createCharacterViewForGame(gameId: string | null | undefined): GameCharacterView {
  if (gameId && CHARACTER_VIEW_FACTORIES[gameId]) {
    return CHARACTER_VIEW_FACTORIES[gameId]();
  }
  return new DefaultCharacterView();
}

export function getCharacterRosterForGame(gameId: string | null | undefined): {
  characters: ReadonlyArray<CharacterOption>;
} {
  return { characters: createCharacterViewForGame(gameId).getRoster() };
}

export function getCharacterOptionForGame(
  gameId: string | null | undefined,
  characterId: string | undefined,
  slot = 0
): CharacterOption {
  const roster = createCharacterViewForGame(gameId).getRoster();
  if (characterId) {
    const found = roster.find((c) => c.id === characterId);
    if (found) return found;
  }
  return roster[Math.abs(slot) % roster.length];
}
