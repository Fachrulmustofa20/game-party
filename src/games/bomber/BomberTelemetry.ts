import { KartBlip, TelemetryPacket } from '../../net/BinaryProtocol';

export type BomberViewPhase = 'preparing' | 'live' | 'round-end' | 'match-over';

export const NO_ARENA_INDEX = 4;

export interface BomberTelemetryView {
  phase: BomberViewPhase;
  countdown: boolean;
  arenaIndex: number;
  round: number;
  maxRounds: number;
  timerSeconds: number;
  rank: number;
  totalPlayers: number;
  lives: number;
  wins: number;
  range: number;
  maxBombs: number;
  bombsReady: number;
  dashCooldown: number;
  alive: boolean;
  shielded: boolean;
  eliminations: number;
  blips: KartBlip[];
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function packBomberTelemetry(view: BomberTelemetryView): TelemetryPacket {
  const phaseCode =
    view.phase === 'preparing'
      ? 0
      : view.phase === 'live'
      ? 1
      : view.phase === 'round-end'
      ? 2
      : 3;
  const turboZone = view.countdown ? 3 : view.alive ? (view.shielded ? 2 : 1) : 0;
  const lives = clampInt(view.lives, 0, 3);
  const wins = clampInt(view.wins, 0, 3);
  const arenaIndex = clampInt(view.arenaIndex, 0, NO_ARENA_INDEX);
  const turboCharge = lives | (wins << 2) | (arenaIndex << 4);
  const range = clampInt(view.range, 1, 8);
  const maxBombs = clampInt(view.maxBombs, 1, 8);

  return {
    rank: clampInt(view.rank, 1, 10),
    totalPlayers: clampInt(view.totalPlayers, 1, 10),
    lap: clampInt(view.round, 0, 15),
    maxLaps: (phaseCode << 2) | clampInt(view.maxRounds, 0, 3),
    speedKmh: clampInt(view.timerSeconds, 0, 255),
    turboCharge,
    turboZone,
    itemId: (range - 1) | ((maxBombs - 1) << 3),
    fruits: clampInt(view.bombsReady, 0, 15),
    boostCooldownSec: clampInt(view.dashCooldown, 0, 15),
    karts: view.blips,
  };
}

export function decodeBomberTelemetry(packet: TelemetryPacket): BomberTelemetryView {
  const phaseCode = (packet.maxLaps >> 2) & 0x03;
  const phase: BomberViewPhase =
    phaseCode === 0
      ? 'preparing'
      : phaseCode === 1
      ? 'live'
      : phaseCode === 2
      ? 'round-end'
      : 'match-over';

  const turboCharge = packet.turboCharge ?? 0;
  const lives = turboCharge & 0x03;
  const wins = (turboCharge >> 2) & 0x03;
  const arenaIndex = (turboCharge >> 4) & 0x07;
  const range = (packet.itemId & 0x07) + 1;
  const maxBombs = ((packet.itemId >> 3) & 0x07) + 1;

  return {
    phase,
    countdown: phase === 'live' && packet.turboZone === 3,
    arenaIndex: arenaIndex >= NO_ARENA_INDEX ? -1 : arenaIndex,
    round: packet.lap || 0,
    maxRounds: packet.maxLaps & 0x03,
    timerSeconds: packet.speedKmh,
    rank: packet.rank || 1,
    totalPlayers: packet.totalPlayers || 1,
    lives,
    wins,
    range,
    maxBombs,
    bombsReady: packet.fruits,
    dashCooldown: packet.boostCooldownSec ?? 0,
    alive: packet.turboZone === 1 || packet.turboZone === 2,
    shielded: packet.turboZone === 2,
    eliminations: 0,
    blips: packet.karts,
  };
}
