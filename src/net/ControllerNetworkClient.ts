import {
  ControllerInputState,
  TelemetryPacket,
  decodePing,
  decodeTelemetry,
  encodeControllerInput,
  encodePing,
  PACKET_PING,
  PACKET_PONG,
  PACKET_TELEMETRY,
} from './BinaryProtocol';
import { TransportMode } from './HostNetworkManager';

export interface ControllerNetworkCallbacks {
  onJoined: (info: { playerId: string; slot: number; roomCode: string }) => void;
  onTransportChanged: (mode: TransportMode) => void;
  onReliableEvent: (event: Record<string, unknown>) => void;
  onTelemetry: (telemetry: TelemetryPacket) => void;
  onError: (message: string, takenCharacters?: string[]) => void;
}

export class ControllerNetworkClient {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private fastChannel: RTCDataChannel | null = null;
  private reliableChannel: RTCDataChannel | null = null;
  private transport: TransportMode = 'connecting';
  private callbacks: ControllerNetworkCallbacks;
  private seq = 0;
  private fallbackTimer: number | null = null;

  constructor(callbacks: ControllerNetworkCallbacks) {
    this.callbacks = callbacks;
  }

  join(roomCode: string, name: string, color: string, characterId?: string): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    const sessionKey = `nitro_session_${roomCode.toUpperCase()}`;
    const sessionToken = sessionStorage.getItem(sessionKey) || '';

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'join_room',
          roomCode: roomCode.toUpperCase(),
          name,
          color,
          characterId,
          sessionToken,
        })
      );
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        this.handleBinaryMessage(ev.data);
        return;
      }

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }

      if (msg.type === 'error') {
        const taken = Array.isArray(msg.takenCharacters)
          ? (msg.takenCharacters as string[])
          : undefined;
        this.callbacks.onError(String(msg.message), taken);
      } else if (msg.type === 'joined_room') {
        if (msg.sessionToken) {
          sessionStorage.setItem(sessionKey, String(msg.sessionToken));
        }
        this.callbacks.onJoined({
          playerId: String(msg.playerId),
          slot: Number(msg.slot),
          roomCode: String(msg.roomCode),
        });
        this.startFallbackTimer();
      } else if (msg.type === 'signal') {
        this.handleSignal(msg.signal as Record<string, unknown>);
      } else if (msg.type === 'relay_event') {
        this.callbacks.onReliableEvent((msg.payload as Record<string, unknown>) || {});
      } else if (msg.type === 'host_disconnected') {
        this.callbacks.onError('Host PC terputus. Silakan refresh atau scan ulang QR Code.');
      }
    };

    ws.onerror = () => {
      this.callbacks.onError('Gagal terhubung ke server.');
    };
  }

  private startFallbackTimer(): void {
    if (this.fallbackTimer !== null) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = window.setTimeout(() => {
      if (this.transport === 'connecting') {
        this.setTransport('ws-fallback');
      }
    }, 2500);
  }

  private setTransport(mode: TransportMode): void {
    if (this.transport === mode) return;
    this.transport = mode;
    this.callbacks.onTransportChanged(mode);
  }

  private ensurePeerConnection(): RTCPeerConnection {
    if (this.pc) return this.pc;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.pc = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'signal',
            signal: { candidate: ev.candidate },
          })
        );
      }
    };

    pc.ondatachannel = (ev) => {
      const ch = ev.channel;
      if (ch.label === 'input-fast') {
        this.fastChannel = ch;
        ch.binaryType = 'arraybuffer';
        ch.onopen = () => {
          if (this.fallbackTimer !== null) clearTimeout(this.fallbackTimer);
          this.setTransport('webrtc');
        };
        ch.onmessage = (m) => {
          if (m.data instanceof ArrayBuffer) {
            this.handleBinaryMessage(m.data);
          }
        };
      } else if (ch.label === 'events-reliable') {
        this.reliableChannel = ch;
        ch.onmessage = (m) => {
          try {
            const payload = JSON.parse(String(m.data)) as Record<string, unknown>;
            this.callbacks.onReliableEvent(payload);
          } catch {
            // ignore
          }
        };
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.setTransport('ws-fallback');
      }
    };

    return pc;
  }

  private async handleSignal(signal: Record<string, unknown>): Promise<void> {
    const pc = this.ensurePeerConnection();
    try {
      if (signal.sdp) {
        const desc = new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit);
        await pc.setRemoteDescription(desc);
        if (desc.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (this.ws?.readyState === WebSocket.OPEN && pc.localDescription) {
            this.ws.send(
              JSON.stringify({
                type: 'signal',
                signal: { sdp: pc.localDescription },
              })
            );
          }
        }
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate as RTCIceCandidateInit));
      }
    } catch {
      this.setTransport('ws-fallback');
    }
  }

  private handleBinaryMessage(buf: ArrayBuffer): void {
    if (buf.byteLength < 1) return;
    const type = new DataView(buf).getUint8(0);

    if (type === PACKET_PING) {
      const ping = decodePing(buf);
      if (ping) {
        const pong = encodePing(ping.seq, ping.ts16, PACKET_PONG);
        this.sendFastBinary(pong);
      }
    } else if (type === PACKET_TELEMETRY) {
      const telemetry = decodeTelemetry(buf);
      if (telemetry) {
        this.callbacks.onTelemetry(telemetry);
      }
    }
  }

  sendInput(input: Omit<ControllerInputState, 'seq' | 'timestamp'>): void {
    this.seq = (this.seq + 1) & 0xff;
    const buf = encodeControllerInput({
      ...input,
      seq: this.seq,
      timestamp: Math.round(performance.now()) & 0xffff,
    });
    this.sendFastBinary(buf);
  }

  private sendFastBinary(buf: ArrayBuffer): void {
    if (this.fastChannel && this.fastChannel.readyState === 'open') {
      this.fastChannel.send(buf);
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buf);
    }
  }

  sendReliableEvent(payload: Record<string, unknown>): void {
    if (this.reliableChannel && this.reliableChannel.readyState === 'open') {
      this.reliableChannel.send(JSON.stringify(payload));
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'relay_event', payload }));
    }
  }

  destroy(): void {
    if (this.fallbackTimer !== null) clearTimeout(this.fallbackTimer);
    this.fastChannel?.close();
    this.reliableChannel?.close();
    this.pc?.close();
    this.ws?.close();
  }
}
