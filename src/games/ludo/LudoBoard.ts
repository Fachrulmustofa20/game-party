import { TelemetryPacket } from '../../net/BinaryProtocol';

export type LudoTurnPhase = 'roll' | 'choose_pawn' | 'moving' | 'gameover';

export const LUDO_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#22c55e'] as const;
export const LUDO_COLOR_NAMES = ['Merah', 'Biru', 'Kuning', 'Hijau'] as const;

// 52-tile clockwise outer track on a 15x15 grid [row, col]
export const OUTER_TRACK: ReadonlyArray<readonly [number, number]> = [
  // Red start (bottom-left going right -> up)
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  // Blue start (top going down -> right)
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  // Yellow start (right going left -> down)
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  // Green start (bottom going up -> left)
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
];

export const START_OFFSETS = [0, 13, 26, 39] as const;

export const SAFE_TRACK_INDICES = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);

export const HOME_STRETCH: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // Team 0 (Red - left to center)
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  // Team 1 (Blue - top to center)
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  // Team 2 (Yellow - right to center)
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  // Team 3 (Green - bottom to center)
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
];

export const YARD_SPOTS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // Team 0 (Red - top-left quadrant? Wait: row 0..5 is top, row 9..14 is bottom!
  // Let's match OUTER_TRACK:
  // [6,1] is left-middle (row 6, col 1) -> Team 0 yard is top-left [1..4, 1..4]
  [[1.8, 1.8], [1.8, 3.4], [3.4, 1.8], [3.4, 3.4]],
  // Team 1 (Blue - [1,8] top-right) -> top-right [1..4, 10..13]
  [[1.8, 10.6], [1.8, 12.2], [3.4, 10.6], [3.4, 12.2]],
  // Team 2 (Yellow - [8,13] bottom-right) -> bottom-right [10..13, 10..13]
  [[10.6, 10.6], [10.6, 12.2], [12.2, 10.6], [12.2, 12.2]],
  // Team 3 (Green - [13,6] bottom-left) -> bottom-left [10..13, 1..4]
  [[10.6, 1.8], [10.6, 3.4], [12.2, 1.8], [12.2, 3.4]],
];

export function gridToWorld(row: number, col: number, tileSize = 1.6): { x: number; z: number } {
  return {
    x: (col - 7) * tileSize,
    z: (row - 7) * tileSize,
  };
}

export function getPawnGridPos(
  team: number,
  pawnIndex: number,
  progress: number
): readonly [number, number] {
  if (progress < 0) {
    return YARD_SPOTS[team][pawnIndex];
  }
  if (progress <= 50) {
    const idx = (START_OFFSETS[team] + progress) % 52;
    return OUTER_TRACK[idx];
  }
  if (progress <= 55) {
    return HOME_STRETCH[team][progress - 51];
  }
  // Center home (56)
  const offsets: ReadonlyArray<readonly [number, number]> = [
    [7, 6.35],
    [6.35, 7],
    [7, 7.65],
    [7.65, 7],
  ];
  return offsets[team];
}

export function getOuterTrackIndex(team: number, progress: number): number | null {
  if (progress < 0 || progress > 50) return null;
  return (START_OFFSETS[team] + progress) % 52;
}

export const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function diceFace(n: number): string {
  return DICE_FACES[Math.max(0, Math.min(6, Math.round(n)))] ?? '🎲';
}

export interface LudoViewState {
  phase: LudoTurnPhase;
  lastRoll: number;
  isMyTurn: boolean;
  timerPct: number;
  playableMask: number; // bitmask of pawns 0..3
  pawnProgress: number[]; // 4 items: -1..56
  finishedCount: number;
}

const PHASE_LIST: LudoTurnPhase[] = ['roll', 'choose_pawn', 'moving', 'gameover'];

export function packLudoTelemetry(view: LudoViewState): TelemetryPacket {
  return {
    rank: 1,
    totalPlayers: 4,
    lap: Math.max(0, PHASE_LIST.indexOf(view.phase)),
    maxLaps: 4,
    speedKmh: Math.max(0, Math.min(6, view.lastRoll)),
    turboCharge: Math.max(0, Math.min(100, Math.round(view.timerPct))),
    turboZone: view.isMyTurn ? 1 : 0,
    itemId: view.playableMask & 0x0f,
    fruits: 0,
    boostCooldownSec: view.finishedCount,
    karts: view.pawnProgress.slice(0, 4).map((p, idx) => ({
      slot: idx,
      x: Math.max(0, Math.min(57, p + 1)),
      z: 0,
    })),
  };
}

export function decodeLudoTelemetry(t: TelemetryPacket): LudoViewState {
  const pawnProgress = [0, 1, 2, 3].map((idx) => (t.karts[idx]?.x ?? 0) - 1);
  return {
    phase: PHASE_LIST[t.lap] ?? 'roll',
    lastRoll: t.speedKmh ?? 0,
    isMyTurn: t.turboZone === 1,
    timerPct: t.turboCharge ?? 0,
    playableMask: t.itemId ?? 0,
    pawnProgress,
    finishedCount: t.boostCooldownSec ?? 0,
  };
}
