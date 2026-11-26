import { AudioFrameContext, GameAudioEngine } from '../../audio/GameAudioEngine';

interface ThrusterVoice {
  osc: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

/**
 * Zero-asset Web Audio API synthesizer for Space Dogfight:
 * sci-fi thruster hum, laser/missile fire, shield dodge, power-ups, hits, and explosions.
 */
export class SpaceAudioEngine implements GameAudioEngine {
  readonly id = 'space-dogfight-2p';
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private thrusters = new Map<string, ThrusterVoice>();
  private muted = false;

  unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.3;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.3, this.ctx.currentTime, 0.04);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  updateFromController(ctx: AudioFrameContext): void {
    this.updateThruster('self', ctx.slot, ctx.input.gas, ctx.input.boost);
  }

  updateShipThruster(id: string, slot: number, isThrusting: boolean, isBoosting: boolean): void {
    this.updateThruster(id, slot, isThrusting, isBoosting);
  }

  private updateThruster(id: string, slot: number, isThrusting: boolean, isBoosting: boolean): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;

    let voice = this.thrusters.get(id);
    if (!voice) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start();

      voice = { osc, gain, filter };
      this.thrusters.set(id, voice);
    }

    const now = this.ctx.currentTime;
    const slotOffset = 1 + (slot % 4) * 0.05;
    const freq = (isBoosting ? 140 : isThrusting ? 96 : 58) * slotOffset;
    voice.osc.frequency.setTargetAtTime(freq, now, 0.06);
    voice.filter.frequency.setTargetAtTime(isBoosting ? 620 : isThrusting ? 380 : 180, now, 0.08);
    voice.gain.gain.setTargetAtTime(isBoosting ? 0.11 : isThrusting ? 0.06 : 0.01, now, 0.07);
  }

  playLaser(): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.11);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playMissile(): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.16);
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playDodge(): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  playPowerUp(): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t0 = now + idx * 0.055;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.12, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.12);
    });
  }

  playHit(): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.12);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playExplosion(): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.36);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  destroy(): void {
    for (const v of this.thrusters.values()) {
      try {
        v.osc.stop();
        v.osc.disconnect();
        v.gain.disconnect();
      } catch {
        // ignore
      }
    }
    this.thrusters.clear();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
  }
}
