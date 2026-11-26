import assert from 'node:assert/strict';
import {
  encodeControllerInput,
  decodeControllerInput,
  encodeTelemetry,
  decodeTelemetry,
  isSequenceNewer,
} from './BinaryProtocol.ts';

// 1. Test 8-byte Controller Input roundtrip
const sampleInput = {
  seq: 142,
  steer: -0.735,
  gas: true,
  brake: false,
  drift: true,
  item: true,
  boost: false,
  timestamp: 41234,
};

const encoded = encodeControllerInput(sampleInput);
assert.equal(encoded.byteLength, 8, 'Controller input packet must be exactly 8 bytes');

const decoded = decodeControllerInput(encoded);
assert.ok(decoded, 'Decoded input must not be null');
assert.equal(decoded.seq, 142);
assert.ok(Math.abs(decoded.steer - -0.735) < 0.0001, `Steer precision check: ${decoded.steer}`);
assert.equal(decoded.gas, true);
assert.equal(decoded.brake, false);
assert.equal(decoded.drift, true);
assert.equal(decoded.item, true);
assert.equal(decoded.boost, false);
assert.equal(decoded.timestamp, 41234);

// 2. Test uint8 sequence wrap-around
assert.equal(isSequenceNewer(1, 0), true);
assert.equal(isSequenceNewer(0, 255), true);
assert.equal(isSequenceNewer(2, 255), true);
assert.equal(isSequenceNewer(254, 255), false);
assert.equal(isSequenceNewer(5, 5), false);

// 3. Test Telemetry roundtrip for 10 karts
const telemetry = {
  rank: 3,
  totalPlayers: 10,
  lap: 2,
  maxLaps: 3,
  speedKmh: 118,
  turboCharge: 88,
  turboZone: 2,
  itemId: 1,
  fruits: 9,
  karts: Array.from({ length: 10 }, (_, i) => ({ slot: i, x: i * 25, z: 255 - i * 20 })),
};

const tBuf = encodeTelemetry(telemetry);
assert.equal(tBuf.byteLength, 8 + 10 * 3);
const tDec = decodeTelemetry(tBuf);
assert.ok(tDec);
assert.equal(tDec.rank, 3);
assert.equal(tDec.totalPlayers, 10);
assert.equal(tDec.lap, 2);
assert.equal(tDec.maxLaps, 3);
assert.equal(tDec.speedKmh, 118);
assert.equal(tDec.turboCharge, 88);
assert.equal(tDec.turboZone, 2);
assert.equal(tDec.itemId, 1);
assert.equal(tDec.fruits, 9);
assert.equal(tDec.karts.length, 10);
assert.equal(tDec.karts[4].slot, 4);
assert.equal(tDec.karts[4].x, 100);

console.log('✅ All BinaryProtocol tests passed (8-byte input, seq wrap, 10-kart telemetry).');
