import { ControllerInputState } from '../../net/BinaryProtocol';
import { PlatformPlayer } from '../../sdk/GameSDK';

export const GOLF_HOLE_COUNT = 4;
export const GOLF_BALL_RADIUS = 0.24;
export const GOLF_HOLE_RADIUS = 0.42;
export const GOLF_CUP_RADIUS = 0.52;
export const GOLF_MAX_STROKES = 10;
export const GOLF_MAX_CHARGE_SECONDS = 1.2;
export const GOLF_MIN_LAUNCH_SPEED = 3;
export const GOLF_MAX_LAUNCH_SPEED = 16;
export const GOLF_MAX_SPEED = 18;
export const GOLF_STOP_SPEED = 0.12;
export const GOLF_CAPTURE_SPEED = 1.6;
export const GOLF_WALL_RESTITUTION = 0.72;
export const GOLF_DEFAULT_FRICTION = 2.2;
export const GOLF_SAND_FRICTION = 8;
export const GOLF_AIM_RATE = 2.6;
export const GOLF_SIM_STEP = 1 / 120;
export const GOLF_INTRO_SECONDS = 3;
export const GOLF_HOLE_RESULT_SECONDS = 4.5;
export const GOLF_TIMEOUT_PENALTY = 4;
export const GOLF_MAX_PARTICLES = 180;

export type GolfPhase = 'pre-game' | 'hole-intro' | 'playing' | 'hole-result' | 'match-over';
export type GolfBallState = 'aiming' | 'charging' | 'rolling' | 'holed';
export type GolfHazardType = 'water' | 'lava';

export interface Vec2 {
  x: number;
  z: number;
}

export interface GolfBall {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

export interface GolfPlayerState {
  player: PlatformPlayer;
  slot: number;
  aim: number;
  ball: GolfBall;
  ballState: GolfBallState;
  holeStrokes: number;
  holeScores: number[];
  totalStrokes: number;
  shotOrigin: Vec2;
  chargeStart: number;
  chargePower: number;
  maxedOut: boolean;
  inputPrev: ControllerInputState | null;
  botNextShotAt: number;
  botChargeUntil: number;
  botPower: number;
  botAim: number;
  botHitReady: boolean;
}

export function makeGolfPlayerState(
  player: PlatformPlayer,
  spawn: Vec2,
  initialAim: number
): GolfPlayerState {
  return {
    player,
    slot: player.slot,
    aim: initialAim,
    ball: { x: spawn.x, z: spawn.z, vx: 0, vz: 0 },
    ballState: 'aiming',
    holeStrokes: 0,
    holeScores: [-1, -1, -1, -1],
    totalStrokes: 0,
    shotOrigin: { x: spawn.x, z: spawn.z },
    chargeStart: -1,
    chargePower: 0,
    maxedOut: false,
    inputPrev: null,
    botNextShotAt: 0,
    botChargeUntil: 0,
    botPower: 0,
    botAim: 0,
    botHitReady: false,
  };
}

export function normalizeAngle(angle: number): number {
  let value = angle % (Math.PI * 2);
  if (value > Math.PI) value -= Math.PI * 2;
  if (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export function aimTowards(from: Vec2, to: Vec2): number {
  return Math.atan2(to.z - from.z, to.x - from.x);
}

export function chargePercent(
  state: GolfPlayerState,
  gameTime: number
): number {
  if (state.ballState !== 'charging' || state.chargeStart < 0) return 0;
  if (state.player.isBot) return Math.max(0, Math.min(1, state.chargePower));
  return Math.max(
    0,
    Math.min(1, (gameTime - state.chargeStart) / GOLF_MAX_CHARGE_SECONDS)
  );
}

export function provisionalTotal(state: GolfPlayerState): number {
  return state.totalStrokes + (state.ballState === 'holed' ? 0 : state.holeStrokes);
}

export function scoreForFinishedHole(
  state: GolfPlayerState,
  par: number
): number {
  if (state.maxedOut) return GOLF_MAX_STROKES;
  if (state.ballState === 'holed') return Math.max(1, state.holeStrokes);
  return Math.min(
    GOLF_MAX_STROKES,
    Math.max(state.holeStrokes, par + GOLF_TIMEOUT_PENALTY)
  );
}
