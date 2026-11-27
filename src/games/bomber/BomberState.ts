import { ControllerInputState } from '../../net/BinaryProtocol';
import { PlatformPlayer } from '../../sdk/GameSDK';

export const BOMBER_GRID_W = 21;
export const BOMBER_GRID_H = 17;
export const BOMBER_MAX_PLAYERS = 10;
export const BOMBER_MAX_ROUNDS = 3;
export const BOMBER_ROUND_WIN_TARGET = 2;
export const BOMBER_START_LIVES = 3;

export const BOMBER_BASE_BOMBS = 1;
export const BOMBER_MAX_BOMBS = 5;
export const BOMBER_BASE_RANGE = 1;
export const BOMBER_MAX_RANGE = 6;
export const BOMBER_BASE_SPEED = 3.1;
export const BOMBER_MAX_SPEED = 5.2;
export const BOMBER_SPEED_STEP = 0.28;

export const BOMBER_BOMB_FUSE = 2.4;
export const BOMBER_BLAST_SECONDS = 0.45;
export const BOMBER_SHIELD_SECONDS = 8;
export const BOMBER_SPAWN_PROTECT_SECONDS = 2.2;
export const BOMBER_RESPAWN_SECONDS = 1.8;
export const BOMBER_DASH_SECONDS = 0.16;
export const BOMBER_DASH_COOLDOWN = 3;
export const BOMBER_DASH_MULTIPLIER = 2.6;
export const BOMBER_PAD_SECONDS = 1.5;
export const BOMBER_PAD_MULTIPLIER = 1.3;
export const BOMBER_COUNTDOWN_SECONDS = 3;
export const BOMBER_ROUND_END_SECONDS = 4.5;
export const BOMBER_MAX_PARTICLES = 420;

export const TILE_EMPTY = 0;
export const TILE_WALL = 1;
export const TILE_CRATE = 2;
export const TILE_LAVA = 3;
export const TILE_PAD = 4;

export type BomberTile = 0 | 1 | 2 | 3 | 4;
export type BomberPhase = 'arena-select' | 'countdown' | 'playing' | 'round-end' | 'match-over';
export type BomberRoundReason = 'last-standing' | 'timeout' | 'draw';
export type PowerupType = 'bomb' | 'fire' | 'speed' | 'shield';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Vec2 {
  x: number;
  y: number;
}

export interface BomberBomb {
  id: number;
  x: number;
  y: number;
  ownerId: string;
  ownerSlot: number;
  range: number;
  fuse: number;
  totalFuse: number;
}

export interface BomberBlast {
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
  ownerId: string;
}

export interface BomberPowerup {
  id: number;
  x: number;
  y: number;
  type: PowerupType;
}

export interface BomberParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}

export interface HazardRuntime {
  active: boolean;
  phase: 'idle' | 'telegraph' | 'erupt';
  timer: number;
  eruptionTiles: Vec2[];
}

export interface BomberPlayerState {
  player: PlatformPlayer;
  slot: number;
  spawnIndex: number;
  tx: number;
  ty: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveT: number;
  moving: boolean;
  facing: Vec2;
  lives: number;
  onMap: boolean;
  eliminated: boolean;
  invuln: number;
  shield: number;
  dashTimer: number;
  dashCooldown: number;
  padTimer: number;
  respawnTimer: number;
  maxBombs: number;
  range: number;
  speed: number;
  points: number;
  eliminations: number;
  botThink: number;
  botDir: Direction | null;
  botBomb: boolean;
  inputPrev: ControllerInputState | null;
}

export const SPAWN_POINTS: Vec2[] = [
  { x: 3, y: 1 },
  { x: 10, y: 1 },
  { x: 17, y: 1 },
  { x: 19, y: 5 },
  { x: 19, y: 11 },
  { x: 17, y: 15 },
  { x: 10, y: 15 },
  { x: 3, y: 15 },
  { x: 1, y: 11 },
  { x: 1, y: 5 },
];

export const DIRECTION_VECTORS: Record<Direction, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const ALL_DIRECTIONS: Direction[] = ['up', 'left', 'down', 'right'];

export const POWERUP_INFO: Record<
  PowerupType,
  { short: string; label: string; color: string }
> = {
  bomb: { short: 'BOM', label: 'Bom Ekstra', color: '#f97316' },
  fire: { short: 'FIR', label: 'Jangkauan +1', color: '#ef4444' },
  speed: { short: 'SPD', label: 'Kecepatan +', color: '#22d3ee' },
  shield: { short: 'SHD', label: 'Perisai', color: '#60a5fa' },
};

export function directionFromVector(x: number, y: number): Direction | null {
  if (Math.abs(x) < 0.1 && Math.abs(y) < 0.1) return null;
  if (Math.abs(x) >= Math.abs(y)) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

export function makePlayerState(player: PlatformPlayer, spawnIndex: number): BomberPlayerState {
  const spawn = SPAWN_POINTS[spawnIndex % SPAWN_POINTS.length];
  return {
    player,
    slot: player.slot,
    spawnIndex,
    tx: spawn.x,
    ty: spawn.y,
    fromX: spawn.x,
    fromY: spawn.y,
    toX: spawn.x,
    toY: spawn.y,
    moveT: 0,
    moving: false,
    facing: { x: 0, y: 1 },
    lives: BOMBER_START_LIVES,
    onMap: false,
    eliminated: false,
    invuln: 0,
    shield: 0,
    dashTimer: 0,
    dashCooldown: 0,
    padTimer: 0,
    respawnTimer: 0,
    maxBombs: BOMBER_BASE_BOMBS,
    range: BOMBER_BASE_RANGE,
    speed: BOMBER_BASE_SPEED,
    points: 0,
    eliminations: 0,
    botThink: 0,
    botDir: null,
    botBomb: false,
    inputPrev: null,
  };
}
