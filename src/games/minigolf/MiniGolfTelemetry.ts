import { KartBlip, TelemetryPacket } from '../../net/BinaryProtocol';
import { GolfBallState, GolfPhase } from './MiniGolfState';

export type GolfViewPhase = 'pre-game' | 'hole-intro' | 'playing' | 'hole-result';

export interface GolfViewState {
  phase: GolfViewPhase;
  matchOver: boolean;
  hole: number;
  totalHoles: number;
  par: number;
  timerSeconds: number;
  rank: number;
  totalPlayers: number;
  totalStrokes: number;
  holeStrokes: number;
  ballState: GolfBallState;
  holedCount: number;
  blips: KartBlip[];
}

const BALL_STATE_CODES: GolfBallState[] = ['aiming', 'charging', 'rolling', 'holed'];

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function golfPhaseCode(phase: GolfPhase): number {
  if (phase === 'pre-game') return 0;
  if (phase === 'hole-intro') return 1;
  if (phase === 'playing') return 2;
  return 3;
}

export function packGolfTelemetry(
  phase: GolfPhase,
  matchOver: boolean,
  hole: number,
  totalHoles: number,
  par: number,
  timerSeconds: number,
  rank: number,
  totalPlayers: number,
  totalStrokes: number,
  holeStrokes: number,
  ballState: GolfBallState,
  holedCount: number,
  blips: KartBlip[]
): TelemetryPacket {
  const phaseCode = golfPhaseCode(phase);
  const stateIndex = Math.max(0, BALL_STATE_CODES.indexOf(ballState));
  return {
    rank: clampInt(rank, 1, 10),
    totalPlayers: clampInt(totalPlayers, 1, 10),
    lap: clampInt(hole, 0, 15),
    maxLaps: (phaseCode << 2) | clampInt(totalHoles - 1, 0, 3),
    speedKmh: clampInt(timerSeconds, 0, 255),
    turboCharge: clampInt(totalStrokes, 0, 100),
    turboZone: stateIndex & 0x03,
    itemId: clampInt(par, 0, 31) | (matchOver ? 0x20 : 0),
    fruits: clampInt(holeStrokes, 0, 15),
    boostCooldownSec: clampInt(holedCount, 0, 15),
    karts: blips,
  };
}

export function decodeGolfTelemetry(packet: TelemetryPacket): GolfViewState {
  const phaseCode = (packet.maxLaps >> 2) & 0x03;
  const phase: GolfViewPhase =
    phaseCode === 0
      ? 'pre-game'
      : phaseCode === 1
      ? 'hole-intro'
      : phaseCode === 2
      ? 'playing'
      : 'hole-result';
  const totalHoles = (packet.maxLaps & 0x03) + 1;
  const matchOver = (packet.itemId & 0x20) !== 0;
  const ballState = BALL_STATE_CODES[packet.turboZone & 0x03] ?? 'aiming';

  return {
    phase,
    matchOver,
    hole: packet.lap,
    totalHoles,
    par: packet.itemId & 0x1f,
    timerSeconds: packet.speedKmh,
    rank: packet.rank || 1,
    totalPlayers: packet.totalPlayers || 1,
    totalStrokes: packet.turboCharge ?? 0,
    holeStrokes: packet.fruits,
    ballState,
    holedCount: packet.boostCooldownSec ?? 0,
    blips: packet.karts,
  };
}
