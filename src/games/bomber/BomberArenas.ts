import {
  BOMBER_GRID_H,
  BOMBER_GRID_W,
  BomberBomb,
  PowerupType,
  SPAWN_POINTS,
  TILE_CRATE,
  TILE_EMPTY,
  TILE_LAVA,
  TILE_PAD,
  TILE_WALL,
  Vec2,
} from './BomberState';

export type BomberArenaId =
  | 'palm-cove'
  | 'neon-grid'
  | 'frostbite-labyrinth'
  | 'molten-vault';

export type BomberArenaChoice = BomberArenaId | 'random';

export interface ArenaPalette {
  bg: string;
  floorA: string;
  floorB: string;
  wall: string;
  wallTop: string;
  crate: string;
  crateEdge: string;
  accent: string;
  hazard: string;
  pad: string;
}

export interface BomberHazardDef {
  interval: number;
  telegraph: number;
  active: number;
  radius: number;
}

export interface BomberArenaDef {
  id: BomberArenaId;
  name: string;
  subtitle: string;
  difficulty: string;
  tags: string[];
  accent: string;
  palette: ArenaPalette;
  roundSeconds: number;
  crateDensity: number;
  powerupChance: number;
  powerupWeights: Record<PowerupType, number>;
  baseSpeed: number;
  fuseBonus: number;
  rangeBonus: number;
  spawnProtect: number;
  pads: Vec2[];
  lavaTiles: Vec2[];
  hazard?: BomberHazardDef;
  walls: Vec2[];
}

export interface ArenaRuntime {
  def: BomberArenaDef;
  tiles: Uint8Array;
  spawns: Vec2[];
  hazardTiles: Vec2[];
}

export function indexOfTile(x: number, y: number): number {
  return y * BOMBER_GRID_W + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < BOMBER_GRID_W && y < BOMBER_GRID_H;
}

export function tileAt(arena: ArenaRuntime, x: number, y: number): number {
  if (!inBounds(x, y)) return TILE_WALL;
  return arena.tiles[indexOfTile(x, y)];
}

export function isWalkableTile(tile: number): boolean {
  return tile === TILE_EMPTY || tile === TILE_PAD;
}

export function bombAtTile(bombs: BomberBomb[], x: number, y: number): BomberBomb | undefined {
  return bombs.find((bomb) => bomb.x === x && bomb.y === y);
}

export function isBlockedForPath(
  arena: ArenaRuntime,
  bombs: BomberBomb[],
  x: number,
  y: number
): boolean {
  if (!inBounds(x, y)) return true;
  if (!isWalkableTile(tileAt(arena, x, y))) return true;
  return Boolean(bombAtTile(bombs, x, y));
}

const SPAWN_CLEAR: Set<number> = (() => {
  const set = new Set<number>();
  for (const spawn of SPAWN_POINTS) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = spawn.x + dx;
        const y = spawn.y + dy;
        if (inBounds(x, y)) set.add(indexOfTile(x, y));
      }
    }
  }
  return set;
})();

const SPAWN_EXITS: Set<number> = (() => {
  const set = new Set<number>();
  const centerX = (BOMBER_GRID_W - 1) / 2;
  const centerY = (BOMBER_GRID_H - 1) / 2;
  for (const spawn of SPAWN_POINTS) {
    const dx = centerX - spawn.x;
    const dy = centerY - spawn.y;
    const step =
      Math.abs(dx) > Math.abs(dy)
        ? { x: Math.sign(dx), y: 0 }
        : { x: 0, y: Math.sign(dy) };
    if (step.x === 0 && step.y === 0) continue;
    const ex = spawn.x + step.x * 2;
    const ey = spawn.y + step.y * 2;
    if (inBounds(ex, ey)) set.add(indexOfTile(ex, ey));
  }
  return set;
})();

interface ArenaSeed extends Omit<BomberArenaDef, 'walls'> {
  wallPattern: (x: number, y: number) => boolean;
  extraWalls?: Vec2[];
}

function makeArena(seed: ArenaSeed): BomberArenaDef {
  const { wallPattern, extraWalls, ...rest } = seed;
  const lavaSet = new Set(rest.lavaTiles.map((t) => indexOfTile(t.x, t.y)));
  const lavaTiles = rest.lavaTiles.filter((t) => {
    const i = indexOfTile(t.x, t.y);
    return (
      inBounds(t.x, t.y) &&
      t.x > 0 &&
      t.y > 0 &&
      t.x < BOMBER_GRID_W - 1 &&
      t.y < BOMBER_GRID_H - 1 &&
      !SPAWN_CLEAR.has(i)
    );
  });
  const pads = rest.pads.filter((t) => {
    const i = indexOfTile(t.x, t.y);
    return (
      inBounds(t.x, t.y) &&
      t.x > 0 &&
      t.y > 0 &&
      t.x < BOMBER_GRID_W - 1 &&
      t.y < BOMBER_GRID_H - 1 &&
      !lavaSet.has(i) &&
      !SPAWN_CLEAR.has(i)
    );
  });
  const padSet = new Set(pads.map((t) => indexOfTile(t.x, t.y)));
  const extraSet = new Set((extraWalls ?? []).map((t) => indexOfTile(t.x, t.y)));
  const wallsMap = new Map<number, Vec2>();

  for (let y = 1; y < BOMBER_GRID_H - 1; y++) {
    for (let x = 1; x < BOMBER_GRID_W - 1; x++) {
      const i = indexOfTile(x, y);
      if (SPAWN_CLEAR.has(i) || SPAWN_EXITS.has(i) || lavaSet.has(i) || padSet.has(i)) continue;
      if (wallPattern(x, y) || extraSet.has(i)) {
        wallsMap.set(i, { x, y });
      }
    }
  }

  return {
    ...rest,
    lavaTiles,
    pads,
    walls: [...wallsMap.values()],
  };
}

const PALM_PALETTE: ArenaPalette = {
  bg: '#0b1622',
  floorA: '#8a6a3f',
  floorB: '#7c5f38',
  wall: '#28303f',
  wallTop: '#465268',
  crate: '#b45309',
  crateEdge: '#fbbf24',
  accent: '#f59e0b',
  hazard: '#f97316',
  pad: '#22d3ee',
};

const NEON_PALETTE: ArenaPalette = {
  bg: '#060a16',
  floorA: '#0b1222',
  floorB: '#101c36',
  wall: '#1e3a8a',
  wallTop: '#3b82f6',
  crate: '#7e22ce',
  crateEdge: '#22d3ee',
  accent: '#22d3ee',
  hazard: '#f472b6',
  pad: '#22d3ee',
};

const FROST_PALETTE: ArenaPalette = {
  bg: '#06121f',
  floorA: '#0f2742',
  floorB: '#12314f',
  wall: '#1e40af',
  wallTop: '#60a5fa',
  crate: '#0e7490',
  crateEdge: '#7dd3fc',
  accent: '#38bdf8',
  hazard: '#a5f3fc',
  pad: '#38bdf8',
};

const MOLTEN_PALETTE: ArenaPalette = {
  bg: '#120a08',
  floorA: '#1c1917',
  floorB: '#292524',
  wall: '#44403c',
  wallTop: '#78716c',
  crate: '#78350f',
  crateEdge: '#f97316',
  accent: '#f97316',
  hazard: '#fb923c',
  pad: '#f97316',
};

export const ARENA_PALM_COVE = makeArena({
  id: 'palm-cove',
  name: 'Palm Cove',
  subtitle: 'Arena pantai klasik dengan pilar simetris dan ruang tengah terbuka.',
  difficulty: 'Pemula',
  tags: ['Seimbang', 'Klasik'],
  accent: '#f59e0b',
  palette: PALM_PALETTE,
  roundSeconds: 90,
  crateDensity: 0.45,
  powerupChance: 0.38,
  powerupWeights: { bomb: 25, fire: 30, speed: 25, shield: 20 },
  baseSpeed: 3.1,
  fuseBonus: 0,
  rangeBonus: 0,
  spawnProtect: 2.2,
  pads: [],
  lavaTiles: [],
  wallPattern: (x, y) => x % 2 === 0 && y % 2 === 0,
});

export const ARENA_NEON_GRID = makeArena({
  id: 'neon-grid',
  name: 'Neon Grid',
  subtitle: 'Lorong panjang, pilar renggang, dan jalur kecepatan neon di setiap sisi.',
  difficulty: 'Sedang',
  tags: ['Cepat', 'Terbuka'],
  accent: '#22d3ee',
  palette: NEON_PALETTE,
  roundSeconds: 80,
  crateDensity: 0.32,
  powerupChance: 0.4,
  powerupWeights: { bomb: 25, fire: 20, speed: 35, shield: 20 },
  baseSpeed: 3.4,
  fuseBonus: -0.2,
  rangeBonus: 0,
  spawnProtect: 2,
  pads: [
    { x: 5, y: 3 },
    { x: 15, y: 3 },
    { x: 9, y: 5 },
    { x: 11, y: 5 },
    { x: 9, y: 11 },
    { x: 11, y: 11 },
    { x: 5, y: 13 },
    { x: 15, y: 13 },
  ],
  lavaTiles: [],
  extraWalls: [
    { x: 9, y: 4 },
    { x: 11, y: 4 },
    { x: 9, y: 12 },
    { x: 11, y: 12 },
  ],
  wallPattern: (x, y) => x % 4 === 2 && y % 4 === 2,
});

export const ARENA_FROSTBITE = makeArena({
  id: 'frostbite-labyrinth',
  name: 'Frostbite Labyrinth',
  subtitle: 'Labirin es dengan koridor sempit; ledakan lebih panjang dan lebih jauh.',
  difficulty: 'Sulit',
  tags: ['Taktis', 'Labirin'],
  accent: '#38bdf8',
  palette: FROST_PALETTE,
  roundSeconds: 105,
  crateDensity: 0.4,
  powerupChance: 0.42,
  powerupWeights: { bomb: 30, fire: 30, speed: 20, shield: 20 },
  baseSpeed: 2.9,
  fuseBonus: 0.6,
  rangeBonus: 1,
  spawnProtect: 2.8,
  pads: [],
  lavaTiles: [],
  wallPattern: () => false,
  extraWalls: [
    ...Array.from({ length: 4 }, (_, i) => ({ x: 4 + i, y: 4 })),
    ...Array.from({ length: 4 }, (_, i) => ({ x: 13 + i, y: 4 })),
    ...Array.from({ length: 4 }, (_, i) => ({ x: 4 + i, y: 12 })),
    ...Array.from({ length: 4 }, (_, i) => ({ x: 13 + i, y: 12 })),
    { x: 9, y: 6 },
    { x: 10, y: 6 },
    { x: 11, y: 6 },
    { x: 9, y: 10 },
    { x: 10, y: 10 },
    { x: 11, y: 10 },
    { x: 6, y: 6 },
    { x: 6, y: 7 },
    { x: 14, y: 6 },
    { x: 14, y: 7 },
    { x: 6, y: 9 },
    { x: 6, y: 10 },
    { x: 14, y: 9 },
    { x: 14, y: 10 },
  ],
});

export const ARENA_MOLTEN_VAULT = makeArena({
  id: 'molten-vault',
  name: 'Molten Vault',
  subtitle: 'Kolam lava di tengah meletus berkala. Perisai jadi kunci bertahan.',
  difficulty: 'Chaos',
  tags: ['Hazard', 'Lava'],
  accent: '#f97316',
  palette: MOLTEN_PALETTE,
  roundSeconds: 90,
  crateDensity: 0.42,
  powerupChance: 0.42,
  powerupWeights: { bomb: 25, fire: 25, speed: 15, shield: 35 },
  baseSpeed: 3,
  fuseBonus: 0,
  rangeBonus: 0,
  spawnProtect: 2.2,
  pads: [],
  lavaTiles: [
    { x: 9, y: 8 },
    { x: 10, y: 8 },
    { x: 11, y: 8 },
    { x: 9, y: 9 },
    { x: 10, y: 9 },
    { x: 11, y: 9 },
  ],
  hazard: {
    interval: 7.5,
    telegraph: 1.2,
    active: 0.5,
    radius: 1,
  },
  extraWalls: [
    { x: 8, y: 7 },
    { x: 12, y: 7 },
    { x: 8, y: 10 },
    { x: 12, y: 10 },
  ],
  wallPattern: (x, y) =>
    x % 2 === 0 && y % 2 === 0 && !(x >= 7 && x <= 13 && y >= 6 && y <= 12),
});

export const BOMBER_ARENAS: BomberArenaDef[] = [
  ARENA_PALM_COVE,
  ARENA_NEON_GRID,
  ARENA_FROSTBITE,
  ARENA_MOLTEN_VAULT,
];

export const ARENA_IDS: BomberArenaId[] = BOMBER_ARENAS.map((arena) => arena.id);

export const BOMBER_ARENA_BY_ID: Record<BomberArenaId, BomberArenaDef> = {
  'palm-cove': ARENA_PALM_COVE,
  'neon-grid': ARENA_NEON_GRID,
  'frostbite-labyrinth': ARENA_FROSTBITE,
  'molten-vault': ARENA_MOLTEN_VAULT,
};

export function isBomberArenaId(value: string): value is BomberArenaId {
  return Object.prototype.hasOwnProperty.call(BOMBER_ARENA_BY_ID, value);
}

export function getArenaName(index: number): string {
  return BOMBER_ARENAS[index]?.name ?? 'Arena';
}

export function arenaIndexOf(id: BomberArenaId | null): number {
  if (!id) return BOMBER_ARENAS.length;
  return Math.max(0, ARENA_IDS.indexOf(id));
}

function floodReachable(tiles: Uint8Array, start: Vec2): Set<number> {
  const reachable = new Set<number>();
  const queue: number[] = [indexOfTile(start.x, start.y)];
  reachable.add(queue[0]);
  while (queue.length > 0) {
    const current = queue.pop()!;
    const cx = current % BOMBER_GRID_W;
    const cy = Math.floor(current / BOMBER_GRID_W);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = indexOfTile(nx, ny);
      if (reachable.has(ni)) continue;
      if (tiles[ni] === TILE_WALL || tiles[ni] === TILE_LAVA) continue;
      reachable.add(ni);
      queue.push(ni);
    }
  }
  return reachable;
}

function carvePathToReachable(tiles: Uint8Array, start: Vec2, reachable: Set<number>): void {
  const startIdx = indexOfTile(start.x, start.y);
  const parent = new Int32Array(BOMBER_GRID_W * BOMBER_GRID_H).fill(-2);
  const queue: number[] = [startIdx];
  parent[startIdx] = -1;
  let goal = -1;

  while (queue.length > 0 && goal < 0) {
    const current = queue.shift()!;
    if (reachable.has(current) && current !== startIdx) {
      goal = current;
      break;
    }
    const cx = current % BOMBER_GRID_W;
    const cy = Math.floor(current / BOMBER_GRID_W);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx <= 0 || ny <= 0 || nx >= BOMBER_GRID_W - 1 || ny >= BOMBER_GRID_H - 1) continue;
      const ni = indexOfTile(nx, ny);
      if (parent[ni] !== -2) continue;
      parent[ni] = current;
      queue.push(ni);
    }
  }

  if (goal < 0) return;
  let cursor = goal;
  while (cursor >= 0 && cursor !== startIdx) {
    if (tiles[cursor] === TILE_WALL) tiles[cursor] = TILE_EMPTY;
    cursor = parent[cursor];
  }
}

function ensureSpawnReachability(tiles: Uint8Array): void {
  let reachable = floodReachable(tiles, SPAWN_POINTS[0]);
  for (let i = 1; i < SPAWN_POINTS.length; i++) {
    const spawn = SPAWN_POINTS[i];
    if (reachable.has(indexOfTile(spawn.x, spawn.y))) continue;
    carvePathToReachable(tiles, spawn, reachable);
    reachable = floodReachable(tiles, SPAWN_POINTS[0]);
  }
}

function hashTile(x: number, y: number): number {
  return (x * 73 + y * 151 + x * y * 7 + x * x * 13 + y * y * 17) % 100;
}

export function computeHazardTiles(lavaTiles: Vec2[], radius: number): Vec2[] {
  const set = new Map<number, Vec2>();
  for (const lava of lavaTiles) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = lava.x + dx;
        const y = lava.y + dy;
        if (!inBounds(x, y)) continue;
        const i = indexOfTile(x, y);
        if (lavaTiles.some((t) => t.x === x && t.y === y)) continue;
        set.set(i, { x, y });
      }
    }
  }
  return [...set.values()];
}

export function buildArenaRuntime(def: BomberArenaDef): ArenaRuntime {
  const tiles = new Uint8Array(BOMBER_GRID_W * BOMBER_GRID_H);
  tiles.fill(TILE_EMPTY);

  for (let x = 0; x < BOMBER_GRID_W; x++) {
    tiles[indexOfTile(x, 0)] = TILE_WALL;
    tiles[indexOfTile(x, BOMBER_GRID_H - 1)] = TILE_WALL;
  }
  for (let y = 0; y < BOMBER_GRID_H; y++) {
    tiles[indexOfTile(0, y)] = TILE_WALL;
    tiles[indexOfTile(BOMBER_GRID_W - 1, y)] = TILE_WALL;
  }

  for (const wall of def.walls) tiles[indexOfTile(wall.x, wall.y)] = TILE_WALL;
  for (const lava of def.lavaTiles) tiles[indexOfTile(lava.x, lava.y)] = TILE_LAVA;
  for (const pad of def.pads) tiles[indexOfTile(pad.x, pad.y)] = TILE_PAD;

  ensureSpawnReachability(tiles);

  for (let y = 1; y < BOMBER_GRID_H - 1; y++) {
    for (let x = 1; x < BOMBER_GRID_W - 1; x++) {
      const i = indexOfTile(x, y);
      if (tiles[i] !== TILE_EMPTY) continue;
      if (SPAWN_CLEAR.has(i) || SPAWN_EXITS.has(i)) continue;
      if (Math.random() < def.crateDensity) tiles[i] = TILE_CRATE;
    }
  }

  return {
    def,
    tiles,
    spawns: SPAWN_POINTS.map((spawn) => ({ ...spawn })),
    hazardTiles: def.hazard ? computeHazardTiles(def.lavaTiles, def.hazard.radius) : [],
  };
}

export interface BlastResult {
  tiles: Vec2[];
  chainedBombs: BomberBomb[];
}

export function computeBombBlast(
  arena: ArenaRuntime,
  x: number,
  y: number,
  range: number,
  bombs: BomberBomb[],
  ignoreBombId = -1
): BlastResult {
  const bombByTile = new Map<number, BomberBomb>();
  for (const bomb of bombs) {
    if (bomb.id === ignoreBombId) continue;
    bombByTile.set(indexOfTile(bomb.x, bomb.y), bomb);
  }

  const tiles: Vec2[] = [];
  const chained: BomberBomb[] = [];
  const directions: Vec2[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (const dir of directions) {
    for (let step = 1; step <= range; step++) {
      const nx = x + dir.x * step;
      const ny = y + dir.y * step;
      if (!inBounds(nx, ny)) break;
      const tile = tilesAt(arena, nx, ny);
      if (tile === TILE_WALL || tile === TILE_LAVA) break;
      tiles.push({ x: nx, y: ny });
      const targetBomb = bombByTile.get(indexOfTile(nx, ny));
      if (targetBomb) {
        chained.push(targetBomb);
        break;
      }
      if (tile === TILE_CRATE) break;
    }
  }

  return { tiles, chainedBombs: chained };
}

function tilesAt(arena: ArenaRuntime, x: number, y: number): number {
  return arena.tiles[indexOfTile(x, y)];
}

export function computeDangerTiles(arena: ArenaRuntime, bombs: BomberBomb[]): Set<number> {
  const danger = new Set<number>();
  const queue = [...bombs];
  const seen = new Set<number>();

  while (queue.length > 0) {
    const bomb = queue.shift()!;
    if (seen.has(bomb.id)) continue;
    seen.add(bomb.id);
    danger.add(indexOfTile(bomb.x, bomb.y));
    const blast = computeBombBlast(arena, bomb.x, bomb.y, bomb.range, bombs, bomb.id);
    for (const tile of blast.tiles) danger.add(indexOfTile(tile.x, tile.y));
    for (const chained of blast.chainedBombs) {
      if (!seen.has(chained.id)) queue.push(chained);
    }
  }

  return danger;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}

export function renderArenaPreviewSvg(def: BomberArenaDef): string {
  const cell = 10;
  const width = BOMBER_GRID_W * cell;
  const height = BOMBER_GRID_H * cell;
  const wallSet = new Set(def.walls.map((t) => indexOfTile(t.x, t.y)));
  const lavaSet = new Set(def.lavaTiles.map((t) => indexOfTile(t.x, t.y)));
  const padSet = new Set(def.pads.map((t) => indexOfTile(t.x, t.y)));
  const layers: string[] = [
    `<rect width="${width}" height="${height}" fill="${def.palette.bg}"/>`,
  ];

  for (let y = 0; y < BOMBER_GRID_H; y++) {
    for (let x = 0; x < BOMBER_GRID_W; x++) {
      const i = indexOfTile(x, y);
      const px = x * cell;
      const py = y * cell;
      const border =
        x === 0 || y === 0 || x === BOMBER_GRID_W - 1 || y === BOMBER_GRID_H - 1;
      if (border) {
        layers.push(
          `<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${def.palette.wall}"/>`
        );
        continue;
      }
      const floor = (x + y) % 2 === 0 ? def.palette.floorA : def.palette.floorB;
      layers.push(
        `<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${floor}"/>`
      );
      if (wallSet.has(i)) {
        layers.push(
          `<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${def.palette.wall}" stroke="${def.palette.wallTop}" stroke-width="1"/>`
        );
      } else if (lavaSet.has(i)) {
        layers.push(
          `<rect x="${px + 1}" y="${py + 1}" width="${cell - 2}" height="${cell - 2}" fill="${def.palette.hazard}"/>`
        );
      } else if (padSet.has(i)) {
        layers.push(
          `<rect x="${px + 1}" y="${py + 1}" width="${cell - 2}" height="${cell - 2}" fill="${def.palette.pad}" opacity="0.75"/>`
        );
      } else if (!SPAWN_CLEAR.has(i) && !SPAWN_EXITS.has(i) && hashTile(x, y) < def.crateDensity * 100) {
        layers.push(
          `<rect x="${px + 1}" y="${py + 1}" width="${cell - 2}" height="${cell - 2}" fill="${def.palette.crate}" stroke="${def.palette.crateEdge}" stroke-width="0.8"/>`
        );
      }
    }
  }

  for (const spawn of SPAWN_POINTS) {
    layers.push(
      `<circle cx="${spawn.x * cell + cell / 2}" cy="${spawn.y * cell + cell / 2}" r="2.3" fill="#f8fafc" opacity="0.9"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(
    def.name
  )} arena preview" style="display:block;width:100%;height:auto;">${layers.join('')}</svg>`;
}
