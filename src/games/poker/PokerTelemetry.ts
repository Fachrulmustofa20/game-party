import { TelemetryPacket } from '../../net/BinaryProtocol';
import { HAND_CATEGORY_NAMES } from './PokerEngine';

export type PokerPhase =
  | 'waiting'
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown'
  | 'gameover';

export interface PokerViewState {
  phase: PokerPhase;
  round: number;
  rank: number;
  totalPlayers: number;
  hole: number[];
  community: number[];
  handCategory: number;
  handName: string;
  chips: number;
  pot: number;
  toCall: number;
  minRaise: number;
  isMyTurn: boolean;
  folded: boolean;
  allIn: boolean;
  timerPct: number;
}

const PHASE_LIST: PokerPhase[] = [
  'waiting',
  'preflop',
  'flop',
  'turn',
  'river',
  'showdown',
  'gameover',
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function packU16(val: number): [number, number] {
  const n = clamp(val / 10, 0, 65535);
  return [(n >> 8) & 0xff, n & 0xff];
}

function unpackU16(hi: number, lo: number): number {
  return (((hi & 0xff) << 8) | (lo & 0xff)) * 10;
}

export function packPokerTelemetry(view: PokerViewState): TelemetryPacket {
  const [cHi, cLo] = packU16(view.chips);
  const [pHi, pLo] = packU16(view.pot);
  const [tHi, tLo] = packU16(view.toCall);
  const [rHi, rLo] = packU16(view.minRaise);

  const comm = view.community;
  const karts = [
    {
      slot: view.hole[0] ?? 255,
      x: view.hole[1] ?? 255,
      z: clamp(view.handCategory, 0, 9),
    },
    {
      slot: cHi,
      x: cLo,
      z: view.folded ? 1 : view.allIn ? 2 : 0,
    },
    {
      slot: pHi,
      x: pLo,
      z: view.isMyTurn ? 1 : 0,
    },
    { slot: tHi, x: tLo, z: 0 },
    { slot: rHi, x: rLo, z: 0 },
    { slot: comm[0] ?? 255, x: 0, z: 0 },
    { slot: comm[1] ?? 255, x: 0, z: 0 },
    { slot: comm[2] ?? 255, x: 0, z: 0 },
    { slot: comm[3] ?? 255, x: 0, z: 0 },
    { slot: comm[4] ?? 255, x: 0, z: 0 },
  ];

  return {
    rank: clamp(view.rank, 1, 10),
    totalPlayers: clamp(view.totalPlayers, 1, 10),
    lap: clamp(view.round, 1, 255),
    maxLaps: 1,
    speedKmh: 0,
    turboCharge: clamp(view.timerPct, 0, 100),
    turboZone: view.isMyTurn ? 1 : 0,
    itemId: Math.max(0, PHASE_LIST.indexOf(view.phase)),
    fruits: 0,
    boostCooldownSec: 0,
    karts,
  };
}

export function decodePokerTelemetry(t: TelemetryPacket): PokerViewState {
  const b = (i: number) => t.karts[i] ?? { slot: 255, x: 255, z: 0 };
  const hole = [b(0).slot, b(0).x].filter((c) => c >= 0 && c < 52);
  const community = [b(5).slot, b(6).slot, b(7).slot, b(8).slot, b(9).slot].filter(
    (c) => c >= 0 && c < 52
  );
  const handCategory = clamp(b(0).z, 0, 9);
  const statusFlag = b(1).z;

  return {
    phase: PHASE_LIST[t.itemId] ?? 'waiting',
    round: t.lap || 1,
    rank: t.rank || 1,
    totalPlayers: t.totalPlayers || 1,
    hole,
    community,
    handCategory,
    handName: HAND_CATEGORY_NAMES[handCategory] ?? 'Kartu Tinggi',
    chips: unpackU16(b(1).slot, b(1).x),
    pot: unpackU16(b(2).slot, b(2).x),
    toCall: unpackU16(b(3).slot, b(3).x),
    minRaise: Math.max(20, unpackU16(b(4).slot, b(4).x)),
    isMyTurn: b(2).z === 1 || t.turboZone === 1,
    folded: statusFlag === 1,
    allIn: statusFlag === 2,
    timerPct: t.turboCharge ?? 0,
  };
}
