import { ControllerOutput } from '../controller/GameControllerView';

export interface AudioFrameContext {
  slot: number;
  input: ControllerOutput;
  speedKmh: number;
}

export interface GameAudioEngine {
  readonly id: string;
  unlock(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  updateFromController(ctx: AudioFrameContext): void;
  destroy(): void;
}

/**
 * Fallback audio engine for games that do not define a custom audio synthesizer.
 */
export class DefaultAudioEngine implements GameAudioEngine {
  readonly id = 'default';
  private muted = false;

  unlock(): void {
    // No-op fallback
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  updateFromController(_ctx: AudioFrameContext): void {
    // No continuous engine hum for generic games
  }

  destroy(): void {
    // Nothing to dispose
  }
}
