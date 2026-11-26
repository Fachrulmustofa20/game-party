/**
 * Zero-asset Web Audio API synthesizer for arcade kart engine revving,
 * turbo boost whoosh, and countdown beeps.
 */
interface EngineVoice {
  osc: OscillatorNode;
  subOsc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

export class KartAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private voices = new Map<string, EngineVoice>();
  private muted = false;

  unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.35;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.35, this.ctx.currentTime, 0.04);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  updatePlayerEngine(
    id: string,
    slot: number,
    isGas: boolean,
    speedRatio: number,
    isBoosting: boolean
  ): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;

    let voice = this.voices.get(id);
    if (!voice) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';

      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'triangle';

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 340;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;

      osc.connect(filter);
      subOsc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      subOsc.start();

      voice = { osc, subOsc, gain, filter };
      this.voices.set(id, voice);
    }

    const now = this.ctx.currentTime;
    const clampedSpeed = Math.max(0, Math.min(1.4, speedRatio));
    // Slight harmonic pitch offset per player slot so multiple karts sound distinct
    const slotPitchOffset = 1 + (slot % 5) * 0.03;
    const baseFreq = (54 + clampedSpeed * 115 + (isGas ? 24 : 0) + (isBoosting ? 42 : 0)) * slotPitchOffset;

    voice.osc.frequency.setTargetAtTime(baseFreq, now, 0.06);
    voice.subOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.06);
    voice.filter.frequency.setTargetAtTime(isGas || isBoosting ? 850 : 280, now, 0.08);

    const targetVol = isGas || isBoosting ? 0.14 : clampedSpeed > 0.05 ? 0.045 : 0.015;
    voice.gain.gain.setTargetAtTime(targetVol, now, 0.07);
  }

  playTone(freq: number, durationSec: number, type: OscillatorType = 'square', vol = 0.12): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + durationSec);
  }

  destroy(): void {
    for (const v of this.voices.values()) {
      try {
        v.osc.stop();
        v.subOsc.stop();
        v.osc.disconnect();
        v.subOsc.disconnect();
        v.gain.disconnect();
      } catch {
        // ignore
      }
    }
    this.voices.clear();
    void this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
  }
}
