import { AudioFrameContext, GameAudioEngine } from '../../audio/GameAudioEngine';

/**
 * Zero-asset Web Audio synthesizer for Bomber Party.
 * Used both on the host (explosions, round music cues) and on phones
 * (button feedback + low-timer warning via `updateFromController`).
 */
export class BomberAudioEngine implements GameAudioEngine {
  readonly id = 'bomber-party';
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private lastItem = false;
  private lastBoost = false;
  private lastBeepSecond = -1;

  unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.22;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.22, this.ctx.currentTime, 0.04);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  updateFromController(ctx: AudioFrameContext): void {
    const item = ctx.input.item;
    const boost = ctx.input.boost;
    if (item && !this.lastItem) this.playPlace();
    if (boost && !this.lastBoost) this.playDash();
    this.lastItem = item;
    this.lastBoost = boost;

    const timer = Math.round(ctx.speedKmh);
    if (timer > 0 && timer <= 5 && timer !== this.lastBeepSecond) {
      this.lastBeepSecond = timer;
      this.tone(760, 0.07, 'square', 0.06, 0);
    } else if (timer <= 0 || timer > 5) {
      this.lastBeepSecond = -1;
    }
  }

  playCountdownTick(): void {
    this.tone(520, 0.07, 'triangle', 0.08);
  }

  playGo(): void {
    this.tone(660, 0.1, 'triangle', 0.12);
    this.tone(988, 0.16, 'triangle', 0.11, 0.08);
  }

  playPlace(): void {
    this.tone(180, 0.06, 'square', 0.1);
    this.click(0, 900, 0.05);
  }

  playDash(): void {
    this.tone(420, 0.09, 'sawtooth', 0.07, 0, 760);
  }

  playExplosion(chain = 0): void {
    this.noise(0.32, Math.min(0.3, 0.2 + chain * 0.015), 340 + chain * 20);
    this.tone(96, 0.32, 'sine', 0.24, 0, 46);
    if (chain > 0) this.tone(140, 0.16, 'square', 0.05, 0.05, 80);
  }

  playCrate(): void {
    this.noise(0.12, 0.12, 1600);
    this.click(0.02, 600, 0.04);
  }

  playPickup(): void {
    this.tone(660, 0.08, 'triangle', 0.1);
    this.tone(990, 0.12, 'triangle', 0.1, 0.07);
  }

  playShield(): void {
    this.tone(440, 0.14, 'sine', 0.09);
    this.tone(880, 0.18, 'sine', 0.07, 0.06);
    this.tone(1320, 0.2, 'sine', 0.05, 0.12);
  }

  playHurt(): void {
    this.tone(300, 0.14, 'sawtooth', 0.12, 0, 120);
    this.noise(0.08, 0.08, 900);
  }

  playEliminated(): void {
    this.tone(220, 0.26, 'sawtooth', 0.12, 0, 90);
    this.tone(110, 0.42, 'square', 0.1, 0.12, 60);
  }

  playErupt(): void {
    this.noise(0.4, 0.18, 500);
    this.tone(70, 0.5, 'sine', 0.2, 0, 44);
  }

  playRoundWin(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, index) => {
      this.tone(freq, 0.16, 'triangle', 0.11, index * 0.09);
    });
  }

  playMatchWin(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, index) => {
      this.tone(freq, 0.22, 'triangle', 0.12, index * 0.11);
    });
    this.tone(261.63, 0.8, 'sine', 0.07, 0.2);
  }

  destroy(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    delay = 0,
    slideTo?: number
  ): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const start = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freq), start);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  private click(delay: number, freq: number, gainValue: number): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const start = this.ctx.currentTime + delay;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.03);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.3;
    const gain = this.ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(start);
  }

  private noise(duration: number, gainValue: number, filterFreq: number): void {
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const start = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.3), start + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(start);
  }
}
