import { AudioFrameContext, GameAudioEngine } from '../../audio/GameAudioEngine';

/**
 * Zero-asset Web Audio synthesizer for Mini Golf 3D.
 * Host: putts, bounces, splashes, hole celebrations.
 * Phone: charge feedback, putt feedback, and low-timer beeps.
 */
export class MiniGolfAudioEngine implements GameAudioEngine {
  readonly id = 'minigolf-3d';
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private lastItem = false;
  private lastBeepSecond = -1;

  unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.2;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.2, this.ctx.currentTime, 0.04);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  updateFromController(ctx: AudioFrameContext): void {
    const item = ctx.input.item;
    if (item && !this.lastItem) {
      this.tone(180, 0.06, 'triangle', 0.05);
    } else if (!item && this.lastItem) {
      if (!ctx.input.drift) this.playPutt();
    }
    this.lastItem = item;

    const timer = Math.round(ctx.speedKmh);
    if (timer > 0 && timer <= 5 && timer !== this.lastBeepSecond) {
      this.lastBeepSecond = timer;
      this.tone(760, 0.07, 'square', 0.05);
    } else if (timer <= 0 || timer > 5) {
      this.lastBeepSecond = -1;
    }
  }

  playCountdown(): void {
    this.tone(520, 0.07, 'triangle', 0.08);
  }

  playGo(): void {
    this.tone(660, 0.1, 'triangle', 0.11);
    this.tone(990, 0.16, 'triangle', 0.1, 0.08);
  }

  playPutt(): void {
    this.tone(140, 0.07, 'square', 0.08, 0, 80);
    this.click(0, 700, 0.06);
  }

  playBounce(): void {
    this.tone(260 + Math.random() * 80, 0.045, 'triangle', 0.035);
  }

  playSplash(): void {
    this.noise(0.28, 0.12, 900);
    this.tone(180, 0.16, 'sine', 0.06, 0, 80);
  }

  playLava(): void {
    this.noise(0.32, 0.14, 420);
    this.tone(80, 0.35, 'sine', 0.13, 0, 44);
  }

  playHole(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, index) => {
      this.tone(freq, 0.16, 'triangle', 0.1, index * 0.09);
    });
  }

  playHoleWin(): void {
    const notes = [392, 523.25, 659.25, 783.99];
    notes.forEach((freq, index) => {
      this.tone(freq, 0.18, 'triangle', 0.1, index * 0.1);
    });
  }

  playMatchWin(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, index) => {
      this.tone(freq, 0.22, 'triangle', 0.11, index * 0.11);
    });
    this.tone(261.63, 0.85, 'sine', 0.06, 0.2);
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
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(30, slideTo),
        start + duration
      );
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, gainValue),
      start + 0.012
    );
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
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(80, filterFreq * 0.3),
      start + duration
    );
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(start);
  }
}
