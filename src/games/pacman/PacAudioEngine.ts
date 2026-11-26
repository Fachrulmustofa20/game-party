import { AudioFrameContext, GameAudioEngine } from '../../audio/GameAudioEngine';

const STEP_SECONDS = 0.15;
const BASE_VOLUME = 0.55;

// Original 16-step chiptune loop (square lead + triangle bass).
const MELODY = [
  659.25, 783.99, 987.77, 783.99,
  659.25, 587.33, 523.25, 587.33,
  659.25, 783.99, 1046.5, 987.77,
  783.99, 659.25, 587.33, 523.25,
];

const BASS = [130.81, 130.81, 164.81, 164.81, 174.61, 174.61, 196.0, 196.0];

/**
 * Zero-asset 8-bit audio for Pac-Man: Ghost Hunt.
 * Host-only music loop plus simple chomp/power/death/win SFX.
 */
export class PacAudioEngine implements GameAudioEngine {
  readonly id = 'pacman-ghost-hunt';
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

  private lastChompTime = -1;
  private chompFlip = false;

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
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.75;
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
    // The host owns the music; controllers stay silent for this game.
  }

  startMusic(): void {
    this.musicWanted = true;
    this.beginMusicIfNeeded();
  }

  stopMusic(): void {
    this.musicWanted = false;
    this.musicActive = false;
  }

  playChomp(): void {
    const ctx = this.ctx;
    const out = this.sfxGain;
    if (!ctx || !out || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - this.lastChompTime < 0.055) return;
    this.lastChompTime = now;
    this.chompFlip = !this.chompFlip;
    this.note(this.chompFlip ? 540 : 680, now, 0.045, 'square', 0.16, out);
  }

  playPower(): void {
    this.playSequence([523.25, 659.25, 783.99, 1046.5], 0.06, 0.1, 0.22, 'square');
  }

  playGhostEaten(): void {
    this.playSequence([392.0, 523.25, 659.25, 783.99], 0.055, 0.09, 0.24, 'square');
  }

  playDeath(): void {
    this.playSequence([523.25, 392.0, 329.63, 261.63, 196.0], 0.12, 0.16, 0.26, 'sawtooth');
  }

  playWin(): void {
    this.playSequence(
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98],
      0.1,
      0.2,
      0.24,
      'square'
    );
  }

  playGhostWin(): void {
    this.playSequence([392.0, 349.23, 293.66, 196.0], 0.16, 0.24, 0.24, 'sawtooth');
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

      this.note(lead, time, STEP_SECONDS * 0.82, 'square', 0.2, out);
      if (this.step % 2 === 0) {
        this.note(bass, time, STEP_SECONDS * 1.7, 'triangle', 0.26, out);
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
