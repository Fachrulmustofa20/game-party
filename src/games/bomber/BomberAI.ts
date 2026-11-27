import { BotLevel } from '../../sdk/GameSDK';
import {
  ALL_DIRECTIONS,
  BomberBomb,
  BomberPlayerState,
  BomberPowerup,
  BOMBER_GRID_H,
  BOMBER_GRID_W,
  BOMBER_BOMB_FUSE,
  DIRECTION_VECTORS,
  Direction,
  HazardRuntime,
  TILE_CRATE,
  Vec2,
  directionFromVector,
} from './BomberState';
import {
  ArenaRuntime,
  computeDangerTiles,
  indexOfTile,
  isBlockedForPath,
  tileAt,
} from './BomberArenas';

export interface BotWorld {
  arena: ArenaRuntime;
  bombs: BomberBomb[];
  players: BomberPlayerState[];
  powerups: BomberPowerup[];
  hazard: HazardRuntime;
  dt: number;
}

function botInterval(level: BotLevel): number {
  if (level === 'easy') return 0.55;
  if (level === 'hard') return 0.2;
  if (level === 'god') return 0.14;
  return 0.34;
}

function botTile(bot: BomberPlayerState): Vec2 {
  if (!bot.moving) return { x: bot.tx, y: bot.ty };
  return bot.moveT >= 0.5
    ? { x: bot.toX, y: bot.toY }
    : { x: bot.fromX, y: bot.fromY };
}

function activeBombsFor(bot: BomberPlayerState, bombs: BomberBomb[]): number {
  return bombs.filter((bomb) => bomb.ownerId === bot.player.id).length;
}

function dangerSet(world: BotWorld): Set<number> {
  const danger = computeDangerTiles(world.arena, world.bombs);
  if (world.arena.def.hazard) {
    const hazard = world.hazard;
    const soon =
      hazard.phase === 'telegraph' ||
      hazard.phase === 'erupt' ||
      (hazard.phase === 'idle' && hazard.timer < 2);
    if (soon) {
      for (const tile of world.arena.hazardTiles) {
        danger.add(indexOfTile(tile.x, tile.y));
      }
    }
  }
  return danger;
}

function bfsStep(
  arena: ArenaRuntime,
  bombs: BomberBomb[],
  start: Vec2,
  isGoal: (x: number, y: number) => boolean,
  maxDepth: number,
  avoid: Set<number> | null
): Direction | null {
  if (isGoal(start.x, start.y)) return null;
  const startIdx = indexOfTile(start.x, start.y);
  const prev = new Int32Array(BOMBER_GRID_W * BOMBER_GRID_H).fill(-2);
  const depth = new Int16Array(BOMBER_GRID_W * BOMBER_GRID_H);
  const queue: number[] = [startIdx];
  prev[startIdx] = -1;
  let head = 0;
  let goal = -1;

  while (head < queue.length && goal < 0) {
    const current = queue[head++];
    if (depth[current] >= maxDepth) continue;
    const cx = current % BOMBER_GRID_W;
    const cy = Math.floor(current / BOMBER_GRID_W);
    for (const dir of ALL_DIRECTIONS) {
      const vec = DIRECTION_VECTORS[dir];
      const nx = cx + vec.x;
      const ny = cy + vec.y;
      if (nx < 0 || ny < 0 || nx >= BOMBER_GRID_W || ny >= BOMBER_GRID_H) continue;
      const ni = indexOfTile(nx, ny);
      if (prev[ni] !== -2) continue;
      if (avoid && avoid.has(ni)) continue;
      if (isBlockedForPath(arena, bombs, nx, ny)) continue;
      prev[ni] = current;
      depth[ni] = depth[current] + 1;
      if (isGoal(nx, ny)) {
        goal = ni;
        break;
      }
      queue.push(ni);
    }
  }

  if (goal < 0) return null;
  let cursor = goal;
  let guard = 0;
  while (prev[cursor] !== startIdx && guard++ < BOMBER_GRID_W * BOMBER_GRID_H) {
    cursor = prev[cursor];
    if (cursor < 0) return null;
  }
  const dx = (cursor % BOMBER_GRID_W) - start.x;
  const dy = Math.floor(cursor / BOMBER_GRID_W) - start.y;
  return directionFromVector(dx, dy);
}

function safeStepForBot(
  world: BotWorld,
  start: Vec2,
  danger: Set<number>,
  maxDepth: number
): Direction | null {
  return bfsStep(
    world.arena,
    world.bombs,
    start,
    (x, y) => !danger.has(indexOfTile(x, y)),
    maxDepth,
    null
  );
}

function randomWalkableDir(
  world: BotWorld,
  start: Vec2,
  danger: Set<number>,
  avoidDanger: boolean
): Direction | null {
  const options: Direction[] = [];
  for (const dir of ALL_DIRECTIONS) {
    const vec = DIRECTION_VECTORS[dir];
    const nx = start.x + vec.x;
    const ny = start.y + vec.y;
    if (isBlockedForPath(world.arena, world.bombs, nx, ny)) continue;
    if (avoidDanger && danger.has(indexOfTile(nx, ny))) continue;
    options.push(dir);
  }
  if (options.length === 0) return null;
  return options[Math.floor(Math.random() * options.length)];
}

function hasAdjacentTarget(bot: BomberPlayerState, world: BotWorld): boolean {
  const tile = botTile(bot);
  for (const dir of ALL_DIRECTIONS) {
    const vec = DIRECTION_VECTORS[dir];
    const nx = tile.x + vec.x;
    const ny = tile.y + vec.y;
    if (tileAt(world.arena, nx, ny) === TILE_CRATE) return true;
    const enemy = world.players.find(
      (other) =>
        other !== bot &&
        other.lives > 0 &&
        other.onMap &&
        (() => {
          const otherTile = botTile(other);
          return otherTile.x === nx && otherTile.y === ny;
        })()
    );
    if (enemy) return true;
  }
  return false;
}

function findPowerupStep(
  world: BotWorld,
  start: Vec2,
  danger: Set<number>
): Direction | null {
  if (world.powerups.length === 0) return null;
  const powerupTiles = new Set(world.powerups.map((powerup) => indexOfTile(powerup.x, powerup.y)));
  return bfsStep(
    world.arena,
    world.bombs,
    start,
    (x, y) => powerupTiles.has(indexOfTile(x, y)) && !danger.has(indexOfTile(x, y)),
    30,
    danger
  );
}

function findCrateStep(world: BotWorld, start: Vec2, danger: Set<number>): Direction | null {
  return bfsStep(
    world.arena,
    world.bombs,
    start,
    (x, y) => {
      if (danger.has(indexOfTile(x, y))) return false;
      return ALL_DIRECTIONS.some((dir) => {
        const vec = DIRECTION_VECTORS[dir];
        return tileAt(world.arena, x + vec.x, y + vec.y) === TILE_CRATE;
      });
    },
    30,
    danger
  );
}

function findEnemyStep(
  bot: BomberPlayerState,
  world: BotWorld,
  start: Vec2,
  danger: Set<number>
): Direction | null {
  const enemyTiles = new Set<number>();
  for (const other of world.players) {
    if (other === bot) continue;
    if (other.lives <= 0 || !other.onMap) continue;
    const tile = botTile(other);
    enemyTiles.add(indexOfTile(tile.x, tile.y));
  }
  if (enemyTiles.size === 0) return null;
  return bfsStep(
    world.arena,
    world.bombs,
    start,
    (x, y) => enemyTiles.has(indexOfTile(x, y)) && !danger.has(indexOfTile(x, y)),
    30,
    danger
  );
}

interface BombPlan {
  place: boolean;
  escapeDir: Direction | null;
}

function planBomb(
  bot: BomberPlayerState,
  world: BotWorld,
  start: Vec2,
  danger: Set<number>,
  level: BotLevel
): BombPlan {
  if (activeBombsFor(bot, world.bombs) >= bot.maxBombs) {
    return { place: false, escapeDir: null };
  }
  if (world.bombs.some((bomb) => bomb.x === start.x && bomb.y === start.y)) {
    return { place: false, escapeDir: null };
  }

  const fakeBomb: BomberBomb = {
    id: -1,
    x: start.x,
    y: start.y,
    ownerId: bot.player.id,
    ownerSlot: bot.slot,
    range: bot.range,
    fuse: BOMBER_BOMB_FUSE,
    totalFuse: BOMBER_BOMB_FUSE,
  };
  const withBomb = [...world.bombs, fakeBomb];
  const bombDanger = computeDangerTiles(world.arena, withBomb);
  const combined = new Set<number>(danger);
  for (const tile of bombDanger) combined.add(tile);

  const escapeDir = bfsStep(
    world.arena,
    withBomb,
    start,
    (x, y) => !combined.has(indexOfTile(x, y)),
    46,
    null
  );

  if (escapeDir) return { place: true, escapeDir };
  if (level === 'easy' && Math.random() < 0.35) {
    return {
      place: true,
      escapeDir: randomWalkableDir(world, start, combined, false),
    };
  }
  return { place: false, escapeDir: null };
}

export function updateBotAI(bot: BomberPlayerState, world: BotWorld): void {
  if (!bot.onMap || bot.lives <= 0) {
    bot.botDir = null;
    bot.botBomb = false;
    return;
  }

  const level = bot.player.botLevel ?? 'medium';
  bot.botThink -= world.dt;
  if (bot.botThink > 0) return;
  bot.botThink = botInterval(level) + Math.random() * 0.08;
  bot.botBomb = false;

  const start = botTile(bot);
  const danger = dangerSet(world);
  const mistakeChance = level === 'easy' ? 0.22 : level === 'medium' ? 0.06 : 0;
  if (Math.random() < mistakeChance) {
    bot.botDir = randomWalkableDir(world, start, danger, false);
    return;
  }

  if (danger.has(indexOfTile(start.x, start.y))) {
    bot.botDir =
      safeStepForBot(world, start, danger, 46) ??
      randomWalkableDir(world, start, danger, false);
    return;
  }

  if (hasAdjacentTarget(bot, world)) {
    const plan = planBomb(bot, world, start, danger, level);
    if (plan.place) {
      bot.botBomb = true;
      bot.botDir = plan.escapeDir ?? randomWalkableDir(world, start, danger, true);
      return;
    }
  }

  const powerupStep = findPowerupStep(world, start, danger);
  if (powerupStep) {
    bot.botDir = powerupStep;
    return;
  }

  const crateStep = findCrateStep(world, start, danger);
  if (crateStep) {
    bot.botDir = crateStep;
    return;
  }

  const enemyStep = findEnemyStep(bot, world, start, danger);
  if (enemyStep) {
    bot.botDir = enemyStep;
    return;
  }

  bot.botDir = randomWalkableDir(world, start, danger, true);
}
