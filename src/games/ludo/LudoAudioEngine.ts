import { GameAudioEngine } from '../../audio/GameAudioEngine';

export class LudoAudioEngine implements GameAudioEngine {
  readonly id = 'ludo-3d';
  private ctx: AudioContext | null = null;
  private muted = false;

  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  updateFromController(): void {
    // Event-driven board audio
  }

  private playTone(freq: number, dur: number, type: OscillatorType = 'triangle', vol = 0.08): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  }

  playRoll(): void {
    [400, 520, 640].forEach((f, i) => setTimeout(() => this.playTone(f, 0.05, 'triangle', 0.07), i * 45));
  }

  playStep(): void {
    this.playTone(680, 0.045, 'sine', 0.06);
  }

  playCapture(): void {
    [320, 220, 150].forEach((f, i) => setTimeout(() => this.playTone(f, 0.12, 'sawtooth', 0.06), i * 65));
  }

  playHome(): void {
    [523, 659, 784].forEach((f, i) => setTimeout(() => this.playTone(f, 0.12, 'triangle', 0.08), i * 70));
  }

  playWin(): void {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.playTone(f, 0.2, 'triangle', 0.09), i * 90));
  }

  destroy(): void {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
