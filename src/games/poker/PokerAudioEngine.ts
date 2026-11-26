import { GameAudioEngine } from '../../audio/GameAudioEngine';

export class PokerAudioEngine implements GameAudioEngine {
  readonly id = 'texas-poker';
  private ctx: AudioContext | null = null;
  private muted = false;

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
    // Event-driven table sounds
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

  playDeal(): void {
    this.playTone(540, 0.06, 'sine', 0.06);
  }

  playChip(): void {
    this.playTone(980, 0.05, 'triangle', 0.07);
    setTimeout(() => this.playTone(1320, 0.06, 'triangle', 0.06), 45);
  }

  playCheck(): void {
    this.playTone(220, 0.07, 'sine', 0.09);
  }

  playFold(): void {
    this.playTone(180, 0.14, 'sawtooth', 0.05);
  }

  playWin(): void {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 0.18, 'triangle', 0.09), i * 85);
    });
  }

  destroy(): void {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
