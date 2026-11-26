import { ControllerInputState, TelemetryPacket } from '../net/BinaryProtocol';
import { TransportMode } from '../net/HostNetworkManager';

export type BotLevel = 'easy' | 'medium' | 'hard' | 'god';

export interface PlatformPlayer {
  id: string;
  slot: number; // 0..9
  name: string;
  color: string;
  characterId?: string;
  isBot: boolean;
  botLevel?: BotLevel;
  connected: boolean;
  transport: TransportMode | 'bot';
  pingMs: number;
}

export interface HostSDKContext {
  getPlayers(): PlatformPlayer[];
  getInput(playerId: string): ControllerInputState | undefined;
  sendTelemetry(playerId: string, packet: TelemetryPacket): void;
  sendVibrate(playerId: string, patternMs: number | number[]): void;
  sendReliableEvent(playerId: string | '*', event: Record<string, unknown>): void;
  exitToHub(): void;
}

export type TrackMapId = 'crash-cove' | 'neon-canyon' | 'ice-peak';

export interface PlatformGame {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  accentColor: string;
  coverImage: string;
  minPlayers: number;
  maxPlayers: number;
  controllerLayout: 'racing-ctr' | 'arena-dpad';
  maxLaps?: number;
  selectedMap?: TrackMapId;
  mount(container: HTMLElement, sdk: HostSDKContext): void;
  unmount(): void;
}
