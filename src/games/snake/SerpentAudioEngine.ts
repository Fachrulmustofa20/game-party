import { AudioFrameContext, GameAudioEngine } from '../../audio/GameAudioEngine';

const STEP_SECONDS = 0.16;
const BASE_VOLUME = 0.5;

// Original 16-step synth loop: square lead, triangle bass, sparse high ping.
const MELODY = [
  440.0, 523.25, 659.25, 523.25,
  493.88, 587.33, 739.99, 587.33,
  440.0, 523.25, 659.25, 880.0,
  783.99, 659.25, 587.33, 493.88,
];

const BASS = [110.0, 110.0, 146.83, 146.83, 164.81, 164.81, 130.81, 98.0];

/**
 * Zero-asset 8-bit synth for Neon Serpent.
 * Host-only ambient loop plus pickup, boost, death, and win SFX.
 */
export class SerpentAudioEngine implements GameAudioEngine {
  readonly id = 'neon-serpent';
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private schedulerId: number | null = null;
  private muted = false;

  private musicWanted = false;
  private musicActive = false;
  private step = 0;
  private nextNoteTime = 0;

  private lastPickupTime = -1;
  private lastBoostTime = -1;

  unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : BASE_VOLUME;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.42;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.8;
      this.sfxGain.connect(this.masterGain);

      this.schedulerId = window.setInterval(() => this.schedulerTick(), 80);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().then(() => this.beginMusicIfNeeded());
    } else {
      this.beginMusicIfNeeded();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : BASE_VOLUME,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  updateFromController(_ctx: AudioFrameContext): void {
    // Host owns the soundtrack; phone controllers stay silent.
  }

  startMusic(): void {
    this.musicWanted = true;
    this.beginMusicIfNeeded();
  }

  stopMusic(): void {
    this.musicWanted = false;
    this.musicActive = false;
  }

  playPickup(): void {
    const ctx = this.ctx;
    const out = this.sfxGain;
    if (!ctx || !out || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - this.lastPickupTime < 0.045) return;
    this.lastPickupTime = now;
    this.note(760 + Math.random() * 180, now, 0.04, 'square', 0.1, out);
  }

  playBoost(): void {
    const ctx = this.ctx;
    const out = this.sfxGain;
    if (!ctx || !out || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - this.lastBoostTime < 0.2) return;
    this.lastBoostTime = now;
    this.note(220, now, 0.12, 'sawtooth', 0.14, out);
    this.note(330, now + 0.05, 0.1, 'square', 0.1, out);
  }

  playSpawn(): void {
    this.playSequence([329.63, 440.0, 554.37], 0.05, 0.1, 0.16, 'triangle');
  }

  playDeath(): void {
    this.playSequence([440.0, 349.23, 261.63, 196.0], 0.11, 0.18, 0.2, 'sawtooth');
  }

  playWin(): void {
    this.playSequence(
      [523.25, 659.25, 783.99, 1046.5, 1318.51],
      0.1,
      0.22,
      0.22,
      'square'
    );
  }

  destroy(): void {
    this.stopMusic();
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
  }

  private beginMusicIfNeeded(): void {
    if (!this.musicWanted || this.musicActive || !this.ctx || !this.musicGain) return;
    if (this.ctx.state !== 'running') return;
    this.musicActive = true;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.06;
  }

  private schedulerTick(): void {
    const ctx = this.ctx;
    const out = this.musicGain;
    if (!ctx || !out || !this.musicActive || ctx.state !== 'running') return;

    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      const time = this.nextNoteTime;
      const lead = MELODY[this.step];
      const bass = BASS[Math.floor(this.step / 2) % BASS.length];

      this.note(lead, time, STEP_SECONDS * 0.78, 'square', 0.18, out);
      if (this.step % 2 === 0) {
        this.note(bass, time, STEP_SECONDS * 1.65, 'triangle', 0.24, out);
      }
      if (this.step % 8 === 4) {
        this.note(lead * 2, time + 0.04, 0.05, 'square', 0.06, out);
      }

      this.nextNoteTime += STEP_SECONDS;
      this.step = (this.step + 1) % MELODY.length;
    }
  }

  private playSequence(
    frequencies: number[],
    stepSeconds: number,
    duration: number,
    peak: number,
    type: OscillatorType
  ): void {
    const ctx = this.ctx;
    const out = this.sfxGain;
    if (!ctx || !out || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    frequencies.forEach((frequency, index) => {
      this.note(frequency, now + index * stepSeconds, duration, type, peak, out);
    });
  }

  private note(
    frequency: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    destination: AudioNode
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peak, startTime + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(env);
    env.connect(destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}
