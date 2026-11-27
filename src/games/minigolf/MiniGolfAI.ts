import { BotLevel } from '../../sdk/GameSDK';
import { GolfHoleDef } from './GolfCourses';
import {
  GOLF_MAX_LAUNCH_SPEED,
  GOLF_MIN_LAUNCH_SPEED,
  GolfPlayerState,
  Vec2,
} from './MiniGolfState';
import { isInSand, lineOfSightClear } from './MiniGolfPhysics';

export interface BotShotPlan {
  aim: number;
  power: number;
}

const AIM_ERROR: Record<BotLevel, number> = {
  easy: 0.16,
  medium: 0.075,
  hard: 0.032,
  god: 0.012,
};

const POWER_ERROR: Record<BotLevel, number> = {
  easy: 0.2,
  medium: 0.11,
  hard: 0.055,
  god: 0.02,
};

export function botDelay(level: BotLevel): number {
  if (level === 'easy') return 2.1 + Math.random() * 1.4;
  if (level === 'hard') return 0.85 + Math.random() * 0.55;
  if (level === 'god') return 0.5 + Math.random() * 0.4;
  return 1.35 + Math.random() * 0.9;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function chooseTarget(
  bot: GolfPlayerState,
  hole: GolfHoleDef
): Vec2 {
  const ball: Vec2 = { x: bot.ball.x, z: bot.ball.z };
  if (lineOfSightClear(hole, ball, hole.hole)) return hole.hole;

  const visible = hole.botWaypoints.filter((waypoint) =>
    lineOfSightClear(hole, ball, waypoint)
  );
  if (visible.length > 0) {
    return visible.reduce((best, waypoint) =>
      dist(waypoint, hole.hole) < dist(best, hole.hole) ? waypoint : best
    );
  }

  return hole.botWaypoints.reduce((best, waypoint) =>
    dist(ball, waypoint) < dist(ball, best) ? waypoint : best
  , hole.botWaypoints[0] ?? hole.hole);
}

function windCompensation(
  hole: GolfHoleDef,
  from: Vec2,
  to: Vec2,
  speed: number
): { x: number; z: number } {
  let forceX = 0;
  let forceZ = 0;
  for (const zone of hole.zones) {
    if (zone.type !== 'wind') continue;
    const dx = (zone.x + (zone.w ?? 0) / 2) - from.x;
    const dz = (zone.z + (zone.h ?? 0) / 2) - from.z;
    const targetDx = to.x - from.x;
    const targetDz = to.z - from.z;
    const len = Math.hypot(targetDx, targetDz) || 1;
    const along = (dx * targetDx + dz * targetDz) / len;
    if (along < -2 || along > len + 2) continue;
    forceX += zone.forceX ?? 0;
    forceZ += zone.forceZ ?? 0;
  }
  if (forceX === 0 && forceZ === 0) return { x: 0, z: 0 };
  const flight = Math.max(0.3, dist(from, to) / Math.max(3, speed * 0.7));
  return {
    x: -0.5 * forceX * flight * flight,
    z: -0.5 * forceZ * flight * flight,
  };
}

export function planBotShot(
  bot: GolfPlayerState,
  hole: GolfHoleDef
): BotShotPlan | null {
  if (bot.ballState === 'holed' || bot.holeStrokes >= 10) return null;
  const level = bot.player.botLevel ?? 'medium';
  const ball: Vec2 = { x: bot.ball.x, z: bot.ball.z };
  let target = chooseTarget(bot, hole);

  const friction = isInSand(hole, bot.ball.x, bot.ball.z)
    ? 8
    : hole.friction;
  let distance = Math.max(0.4, dist(ball, target));
  let speed = Math.sqrt(2 * friction * distance) * 1.1;
  speed = Math.max(
    GOLF_MIN_LAUNCH_SPEED,
    Math.min(GOLF_MAX_LAUNCH_SPEED, speed)
  );

  if (level === 'hard' || level === 'god') {
    const compensation = windCompensation(hole, ball, target, speed);
    target = { x: target.x + compensation.x, z: target.z + compensation.z };
  }

  let aim = Math.atan2(target.z - ball.z, target.x - ball.x);
  const aimError = AIM_ERROR[level];
  aim += (Math.random() * 2 - 1) * aimError;

  if (level === 'easy' && Math.random() < 0.22) {
    aim += (Math.random() * 2 - 1) * 0.55;
  } else if (level === 'medium' && Math.random() < 0.07) {
    aim += (Math.random() * 2 - 1) * 0.25;
  }

  const powerError = POWER_ERROR[level];
  const speedWithError =
    speed * (1 + (Math.random() * 2 - 1) * powerError);
  const power = Math.max(
    0,
    Math.min(
      1,
      (speedWithError - GOLF_MIN_LAUNCH_SPEED) /
        (GOLF_MAX_LAUNCH_SPEED - GOLF_MIN_LAUNCH_SPEED)
    )
  );

  return { aim, power };
}
