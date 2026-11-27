import {
  GOLF_BALL_RADIUS,
  GOLF_CAPTURE_SPEED,
  GOLF_HOLE_RADIUS,
  GOLF_MAX_SPEED,
  GOLF_SAND_FRICTION,
  GOLF_STOP_SPEED,
  GOLF_WALL_RESTITUTION,
  GolfBall,
  GolfHazardType,
  Vec2,
} from './MiniGolfState';
import { GolfHoleDef, GolfZone } from './GolfCourses';

export interface GolfPhysicsEvent {
  type: 'bounce' | 'stop' | 'holed' | 'hazard';
  x: number;
  z: number;
  hazard?: GolfHazardType;
  speed?: number;
}

export function pointInZone(zone: GolfZone, x: number, z: number): boolean {
  if (zone.shape === 'rect') {
    return (
      x >= zone.x &&
      x <= zone.x + (zone.w ?? 0) &&
      z >= zone.z &&
      z <= zone.z + (zone.h ?? 0)
    );
  }
  const dx = x - zone.x;
  const dz = z - zone.z;
  const r = zone.r ?? 0;
  return dx * dx + dz * dz <= r * r;
}

function hazardAt(hole: GolfHoleDef, x: number, z: number): GolfHazardType | null {
  for (const zone of hole.zones) {
    if (zone.type !== 'water' && zone.type !== 'lava') continue;
    if (pointInZone(zone, x, z)) return zone.type;
  }
  return null;
}

function frictionAt(hole: GolfHoleDef, x: number, z: number): number {
  for (const zone of hole.zones) {
    if (zone.type === 'sand' && pointInZone(zone, x, z)) {
      return GOLF_SAND_FRICTION;
    }
  }
  return hole.friction;
}

function applyWind(hole: GolfHoleDef, ball: GolfBall, dt: number): void {
  for (const zone of hole.zones) {
    if (zone.type !== 'wind') continue;
    if (!pointInZone(zone, ball.x, ball.z)) continue;
    ball.vx += (zone.forceX ?? 0) * dt;
    ball.vz += (zone.forceZ ?? 0) * dt;
  }
}

function closestPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): { x: number; z: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t =
    len2 <= 0.000001
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return { x: ax + dx * t, z: az + dz * t, t };
}

function resolveCircleCollision(
  ball: GolfBall,
  cx: number,
  cz: number,
  minDist: number
): number {
  let dx = ball.x - cx;
  let dz = ball.z - cz;
  let dist = Math.hypot(dx, dz);
  if (dist >= minDist) return 0;
  if (dist < 0.0001) {
    dx = 1;
    dz = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const nz = dz / dist;
  const penetration = minDist - dist;
  ball.x += nx * penetration;
  ball.z += nz * penetration;
  const vn = ball.vx * nx + ball.vz * nz;
  if (vn < 0) {
    const impact = -vn;
    ball.vx -= (1 + GOLF_WALL_RESTITUTION) * vn * nx;
    ball.vz -= (1 + GOLF_WALL_RESTITUTION) * vn * nz;
    ball.vx *= 0.94;
    ball.vz *= 0.94;
    return impact;
  }
  return 0;
}

function resolveBounds(
  ball: GolfBall,
  hole: GolfHoleDef
): number {
  const { minX, minZ, maxX, maxZ } = hole.bounds;
  let impact = 0;
  if (ball.x < minX + GOLF_BALL_RADIUS) {
    ball.x = minX + GOLF_BALL_RADIUS;
    impact = Math.max(impact, Math.abs(ball.vx));
    ball.vx = Math.abs(ball.vx) * GOLF_WALL_RESTITUTION;
  } else if (ball.x > maxX - GOLF_BALL_RADIUS) {
    ball.x = maxX - GOLF_BALL_RADIUS;
    impact = Math.max(impact, Math.abs(ball.vx));
    ball.vx = -Math.abs(ball.vx) * GOLF_WALL_RESTITUTION;
  }
  if (ball.z < minZ + GOLF_BALL_RADIUS) {
    ball.z = minZ + GOLF_BALL_RADIUS;
    impact = Math.max(impact, Math.abs(ball.vz));
    ball.vz = Math.abs(ball.vz) * GOLF_WALL_RESTITUTION;
  } else if (ball.z > maxZ - GOLF_BALL_RADIUS) {
    ball.z = maxZ - GOLF_BALL_RADIUS;
    impact = Math.max(impact, Math.abs(ball.vz));
    ball.vz = -Math.abs(ball.vz) * GOLF_WALL_RESTITUTION;
  }
  return impact;
}

function resolveWalls(ball: GolfBall, hole: GolfHoleDef): number {
  let impact = 0;
  for (const wall of hole.walls) {
    const closest = closestPointOnSegment(
      ball.x,
      ball.z,
      wall.ax,
      wall.az,
      wall.bx,
      wall.bz
    );
    const dx = ball.x - closest.x;
    const dz = ball.z - closest.z;
    const dist = Math.hypot(dx, dz);
    const minDist = GOLF_BALL_RADIUS + wall.thickness / 2;
    if (dist >= minDist) continue;
    let nx: number;
    let nz: number;
    if (dist < 0.0001) {
      const segDx = wall.bx - wall.ax;
      const segDz = wall.bz - wall.az;
      const len = Math.hypot(segDx, segDz) || 1;
      nx = -segDz / len;
      nz = segDx / len;
    } else {
      nx = dx / dist;
      nz = dz / dist;
    }
    const penetration = minDist - dist;
    ball.x += nx * penetration;
    ball.z += nz * penetration;
    const vn = ball.vx * nx + ball.vz * nz;
    if (vn < 0) {
      impact = Math.max(impact, -vn);
      ball.vx -= (1 + GOLF_WALL_RESTITUTION) * vn * nx;
      ball.vz -= (1 + GOLF_WALL_RESTITUTION) * vn * nz;
      ball.vx *= 0.94;
      ball.vz *= 0.94;
    }
  }
  return impact;
}

function resolveRocks(ball: GolfBall, hole: GolfHoleDef): number {
  let impact = 0;
  for (const rock of hole.rocks) {
    impact = Math.max(
      impact,
      resolveCircleCollision(ball, rock.x, rock.z, GOLF_BALL_RADIUS + rock.r)
    );
  }
  return impact;
}

export function stepGolfBall(
  ball: GolfBall,
  hole: GolfHoleDef,
  dt: number
): GolfPhysicsEvent[] {
  const events: GolfPhysicsEvent[] = [];

  const hazard = hazardAt(hole, ball.x, ball.z);
  if (hazard) {
    ball.vx = 0;
    ball.vz = 0;
    events.push({ type: 'hazard', x: ball.x, z: ball.z, hazard });
    return events;
  }

  applyWind(hole, ball, dt);

  const speedBefore = Math.hypot(ball.vx, ball.vz);
  const friction = frictionAt(hole, ball.x, ball.z);
  if (speedBefore > 0) {
    const nextSpeed = Math.max(0, speedBefore - friction * dt);
    const scale = nextSpeed / speedBefore;
    ball.vx *= scale;
    ball.vz *= scale;
  }

  const speedCap = Math.min(GOLF_MAX_SPEED, Math.hypot(ball.vx, ball.vz));
  const rawSpeed = Math.hypot(ball.vx, ball.vz);
  if (rawSpeed > speedCap && rawSpeed > 0) {
    ball.vx = (ball.vx / rawSpeed) * speedCap;
    ball.vz = (ball.vz / rawSpeed) * speedCap;
  }

  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;

  const hazardAfter = hazardAt(hole, ball.x, ball.z);
  if (hazardAfter) {
    ball.vx = 0;
    ball.vz = 0;
    events.push({
      type: 'hazard',
      x: ball.x,
      z: ball.z,
      hazard: hazardAfter,
    });
    return events;
  }

  let impact = resolveBounds(ball, hole);
  impact = Math.max(impact, resolveWalls(ball, hole));
  impact = Math.max(impact, resolveRocks(ball, hole));
  impact = Math.max(impact, resolveBounds(ball, hole));

  if (impact > 1.1) {
    events.push({
      type: 'bounce',
      x: ball.x,
      z: ball.z,
      speed: impact,
    });
  }

  const holeDx = ball.x - hole.hole.x;
  const holeDz = ball.z - hole.hole.z;
  const holeDist = Math.hypot(holeDx, holeDz);
  const speed = Math.hypot(ball.vx, ball.vz);
  if (holeDist <= GOLF_HOLE_RADIUS && speed <= GOLF_CAPTURE_SPEED) {
    ball.vx = 0;
    ball.vz = 0;
    events.push({ type: 'holed', x: hole.hole.x, z: hole.hole.z });
    return events;
  }

  if (speed < GOLF_STOP_SPEED) {
    ball.vx = 0;
    ball.vz = 0;
    events.push({ type: 'stop', x: ball.x, z: ball.z });
  }

  return events;
}

export function segmentIntersects(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number
): boolean {
  const rX = bx - ax;
  const rZ = bz - az;
  const sX = dx - cx;
  const sZ = dz - cz;
  const denom = rX * sZ - rZ * sX;
  if (Math.abs(denom) < 0.000001) return false;
  const qpx = cx - ax;
  const qpz = cz - az;
  const t = (qpx * sZ - qpz * sX) / denom;
  const u = (qpx * rZ - qpz * rX) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function segmentHitsCircle(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  radius: number
): boolean {
  const closest = closestPointOnSegment(cx, cz, ax, az, bx, bz);
  return Math.hypot(cx - closest.x, cz - closest.z) <= radius;
}

export function lineOfSightClear(
  hole: GolfHoleDef,
  from: Vec2,
  to: Vec2,
  padding = 0.18
): boolean {
  for (const wall of hole.walls) {
    const half = wall.thickness / 2 + padding;
    if (
      segmentIntersects(
        from.x,
        from.z,
        to.x,
        to.z,
        wall.ax,
        wall.az,
        wall.bx,
        wall.bz
      )
    ) {
      return false;
    }
    if (
      segmentHitsCircle(
        from.x,
        from.z,
        to.x,
        to.z,
        (wall.ax + wall.bx) / 2,
        (wall.az + wall.bz) / 2,
        half
      )
    ) {
      return false;
    }
  }
  for (const rock of hole.rocks) {
    if (
      segmentHitsCircle(
        from.x,
        from.z,
        to.x,
        to.z,
        rock.x,
        rock.z,
        rock.r + GOLF_BALL_RADIUS + padding
      )
    ) {
      return false;
    }
  }
  return true;
}

export function isInSand(hole: GolfHoleDef, x: number, z: number): boolean {
  for (const zone of hole.zones) {
    if (zone.type === 'sand' && pointInZone(zone, x, z)) return true;
  }
  return false;
}
