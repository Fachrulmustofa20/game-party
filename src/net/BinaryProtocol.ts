export const PACKET_INPUT = 0x01;
export const PACKET_PING = 0x02;
export const PACKET_PONG = 0x03;
export const PACKET_TELEMETRY = 0x04;

export const BTN_GAS = 1 << 0;
export const BTN_BRAKE = 1 << 1;
export const BTN_DRIFT = 1 << 2;
export const BTN_ITEM = 1 << 3;
export const BTN_BOOST = 1 << 4;

export interface ControllerInputState {
  seq: number;
  steer: number; // -1.0 .. +1.0
  gas: boolean;
  brake: boolean;
  drift: boolean;
  item: boolean;
  boost: boolean;
  timestamp: number; // uint16 ms mod 65536
}

export interface KartBlip {
  slot: number;
  x: number; // normalized 0..255
  z: number; // normalized 0..255
}

export interface TelemetryPacket {
  rank: number; // 1..10
  totalPlayers: number;
  lap: number; // 1..3
  maxLaps: number;
  speedKmh: number;
  turboCharge: number; // 0..100
  turboZone: number; // 0=none, 1=good, 2=perfect
  itemId: number; // 0=none, 1=missile, 2=bomb, 3=tnt, 4=shield, 5=turbo
  fruits: number; // 0..10
  boostCooldownSec?: number; // 0..15
  karts: KartBlip[];
}

export function encodeControllerInput(state: ControllerInputState): ArrayBuffer {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);

  view.setUint8(0, PACKET_INPUT);
  view.setUint8(1, state.seq & 0xff);

  const clampedSteer = Math.max(-1, Math.min(1, state.steer));
  view.setInt16(2, Math.round(clampedSteer * 32767), true);

  let mask = 0;
  if (state.gas) mask |= BTN_GAS;
  if (state.brake) mask |= BTN_BRAKE;
  if (state.drift) mask |= BTN_DRIFT;
  if (state.item) mask |= BTN_ITEM;
  if (state.boost) mask |= BTN_BOOST;
  view.setUint8(4, mask);

  view.setUint8(5, 0);
  view.setUint16(6, state.timestamp & 0xffff, true);

  return buf;
}

export function decodeControllerInput(buf: ArrayBuffer): ControllerInputState | null {
  if (buf.byteLength < 8) return null;
  const view = new DataView(buf);
  if (view.getUint8(0) !== PACKET_INPUT) return null;

  const seq = view.getUint8(1);
  const steer = view.getInt16(2, true) / 32767;
  const mask = view.getUint8(4);
  const timestamp = view.getUint16(6, true);

  return {
    seq,
    steer,
    gas: (mask & BTN_GAS) !== 0,
    brake: (mask & BTN_BRAKE) !== 0,
    drift: (mask & BTN_DRIFT) !== 0,
    item: (mask & BTN_ITEM) !== 0,
    boost: (mask & BTN_BOOST) !== 0,
    timestamp,
  };
}

/**
 * Checks if incoming sequence number is newer than lastSeq (with uint8 wrap-around).
 */
export function isSequenceNewer(incoming: number, last: number): boolean {
  if (last < 0) return true;
  const diff = (incoming - last + 256) % 256;
  return diff > 0 && diff < 128;
}

export function encodePing(seq: number, ts16: number, type = PACKET_PING): ArrayBuffer {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint8(0, type);
  view.setUint8(1, seq & 0xff);
  view.setUint16(2, ts16 & 0xffff, true);
  return buf;
}

export function decodePing(buf: ArrayBuffer): { type: number; seq: number; ts16: number } | null {
  if (buf.byteLength < 4) return null;
  const view = new DataView(buf);
  const type = view.getUint8(0);
  if (type !== PACKET_PING && type !== PACKET_PONG) return null;
  return {
    type,
    seq: view.getUint8(1),
    ts16: view.getUint16(2, true),
  };
}

/**
 * Compact binary telemetry sent at ~15Hz from Host PC to each Smartphone HUD.
 * Header: 8 bytes + 3 bytes per kart (up to 10 karts = 38 bytes max).
 */
export function encodeTelemetry(t: TelemetryPacket): ArrayBuffer {
  const count = Math.min(10, t.karts.length);
  const buf = new ArrayBuffer(8 + count * 3);
  const view = new DataView(buf);

  view.setUint8(0, PACKET_TELEMETRY);
  view.setUint8(1, ((t.rank & 0x0f) << 4) | (t.totalPlayers & 0x0f));
  view.setUint8(2, ((t.lap & 0x0f) << 4) | (t.maxLaps & 0x0f));
  view.setUint8(3, Math.min(255, Math.max(0, Math.round(t.speedKmh))));
  view.setUint8(4, Math.min(100, Math.max(0, Math.round(t.turboCharge))));
  view.setUint8(5, ((t.turboZone & 0x03) << 6) | (t.itemId & 0x3f));
  const boostCd = Math.min(15, Math.max(0, Math.round(t.boostCooldownSec ?? 0)));
  view.setUint8(6, ((boostCd & 0x0f) << 4) | (Math.min(10, Math.max(0, t.fruits)) & 0x0f));
  view.setUint8(7, count);

  for (let i = 0; i < count; i++) {
    const offset = 8 + i * 3;
    view.setUint8(offset, t.karts[i].slot & 0xff);
    view.setUint8(offset + 1, Math.min(255, Math.max(0, Math.round(t.karts[i].x))));
    view.setUint8(offset + 2, Math.min(255, Math.max(0, Math.round(t.karts[i].z))));
  }

  return buf;
}

export function decodeTelemetry(buf: ArrayBuffer): TelemetryPacket | null {
  if (buf.byteLength < 8) return null;
  const view = new DataView(buf);
  if (view.getUint8(0) !== PACKET_TELEMETRY) return null;

  const b1 = view.getUint8(1);
  const b2 = view.getUint8(2);
  const speedKmh = view.getUint8(3);
  const turboCharge = view.getUint8(4);
  const b5 = view.getUint8(5);
  const b6 = view.getUint8(6);
  const fruits = b6 & 0x0f;
  const boostCooldownSec = (b6 >> 4) & 0x0f;
  const count = view.getUint8(7);

  const karts: KartBlip[] = [];
  for (let i = 0; i < count; i++) {
    const offset = 8 + i * 3;
    if (offset + 3 > buf.byteLength) break;
    karts.push({
      slot: view.getUint8(offset),
      x: view.getUint8(offset + 1),
      z: view.getUint8(offset + 2),
    });
  }

  return {
    rank: (b1 >> 4) & 0x0f,
    totalPlayers: b1 & 0x0f,
    lap: (b2 >> 4) & 0x0f,
    maxLaps: b2 & 0x0f,
    speedKmh,
    turboCharge,
    turboZone: (b5 >> 6) & 0x03,
    itemId: b5 & 0x3f,
    fruits,
    boostCooldownSec,
    karts,
  };
}
