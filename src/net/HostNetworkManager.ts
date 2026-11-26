import {
  ControllerInputState,
  TelemetryPacket,
  decodeControllerInput,
  decodePing,
  encodePing,
  encodeTelemetry,
  isSequenceNewer,
  PACKET_INPUT,
  PACKET_PING,
  PACKET_PONG,
} from './BinaryProtocol';

export type TransportMode = 'connecting' | 'webrtc' | 'ws-fallback';

export interface ConnectedPlayer {
  id: string;
  slot: number;
  name: string;
  color: string;
  characterId?: string;
  connected: boolean;
  transport: TransportMode;
  pingMs: number;
  lastSeq: number;
  input: ControllerInputState;
}

export interface HostNetworkCallbacks {
  onRoomCreated: (roomCode: string) => void;
  onPlayersChanged: (players: ConnectedPlayer[]) => void;
  onReliableEvent: (playerId: string, event: Record<string, unknown>) => void;
}

interface PeerRecord {
  pc: RTCPeerConnection | null;
  fastChannel: RTCDataChannel | null;
  reliableChannel: RTCDataChannel | null;
  fallbackTimer: number | null;
}

const DEFAULT_INPUT: ControllerInputState = {
  seq: 0,
  steer: 0,
  gas: false,
  brake: false,
  drift: false,
  item: false,
  boost: false,
  timestamp: 0,
};

export class HostNetworkManager {
  private ws: WebSocket | null = null;
  private players = new Map<string, ConnectedPlayer>();
  private slotToId = new Map<number, string>();
  private peers = new Map<string, PeerRecord>();
  private callbacks: HostNetworkCallbacks;
  private pingInterval: number | null = null;

  constructor(callbacks: HostNetworkCallbacks) {
    this.callbacks = callbacks;
  }

  connect(preferredRoomCode?: string): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify(
          preferredRoomCode
            ? { type: 'create_room', roomCode: preferredRoomCode }
            : { type: 'create_room' }
        )
      );
    };

    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        this.handleWsBinary(ev.data);
        return;
      }

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }

      if (msg.type === 'room_created') {
        this.callbacks.onRoomCreated(String(msg.roomCode));
      } else if (msg.type === 'player_joined') {
        this.handlePlayerJoined(msg);
      } else if (msg.type === 'player_disconnected') {
        const pid = String(msg.playerId);
        const p = this.players.get(pid);
        if (p) {
          this.players.delete(pid);
          if (this.slotToId.get(p.slot) === pid) {
            this.slotToId.delete(p.slot);
          }
          this.cleanupPeer(pid);
          this.emitPlayers();
        }
      } else if (msg.type === 'signal') {
        const fromId = String(msg.from);
        this.handleWebRtcSignal(fromId, msg.signal as Record<string, unknown>);
      } else if (msg.type === 'relay_event') {
        this.callbacks.onReliableEvent(
          String(msg.playerId),
          (msg.payload as Record<string, unknown>) || {}
        );
      }
    };

    this.pingInterval = window.setInterval(() => this.sendPings(), 1500);
  }

  regenerateRoom(): void {
    for (const pid of this.peers.keys()) this.cleanupPeer(pid);
    this.players.clear();
    this.slotToId.clear();
    this.emitPlayers();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'create_room' }));
    }
  }

  getPlayers(): ConnectedPlayer[] {
    return Array.from(this.players.values()).sort((a, b) => a.slot - b.slot);
  }

  removePlayer(playerId: string): void {
    const existing = this.players.get(playerId);
    if (existing) {
      this.slotToId.delete(existing.slot);
    }
    this.cleanupPeer(playerId);
    this.players.delete(playerId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'kick_player', targetPlayerId: playerId }));
    }
    this.emitPlayers();
  }

  getInputMap(): Map<string, ControllerInputState> {
    const map = new Map<string, ControllerInputState>();
    for (const p of this.players.values()) {
      if (p.connected) {
        map.set(p.id, p.input);
      }
    }
    return map;
  }

  sendReliableEvent(playerId: string | '*', payload: Record<string, unknown>): void {
    const json = JSON.stringify(payload);
    if (playerId === '*') {
      for (const p of this.players.values()) {
        this.sendReliableToOne(p.id, json, payload);
      }
    } else {
      this.sendReliableToOne(playerId, json, payload);
    }
  }

  syncBotCharacters(characterIds: string[]): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'sync_bots', characterIds }));
    }
  }

  syncSelectedGame(gameId: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'sync_selected_game', gameId }));
    }
  }

  private sendReliableToOne(playerId: string, json: string, payload: Record<string, unknown>): void {
    const peer = this.peers.get(playerId);
    if (peer?.reliableChannel && peer.reliableChannel.readyState === 'open') {
      peer.reliableChannel.send(json);
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'relay_event', targetPlayerId: playerId, payload }));
    }
  }

  sendTelemetry(playerId: string, packet: TelemetryPacket): void {
    const p = this.players.get(playerId);
    if (!p || !p.connected) return;
    const buf = encodeTelemetry(packet);

    const peer = this.peers.get(playerId);
    if (peer?.fastChannel && peer.fastChannel.readyState === 'open') {
      peer.fastChannel.send(buf);
      return;
    }

    // Fallback via WebSocket binary [slot, ...buf]
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const framed = new Uint8Array(1 + buf.byteLength);
      framed[0] = p.slot;
      framed.set(new Uint8Array(buf), 1);
      this.ws.send(framed.buffer);
    }
  }

  private handlePlayerJoined(msg: Record<string, unknown>): void {
    const id = String(msg.playerId);
    const slot = Number(msg.slot);
    const name = String(msg.name || `Player ${slot + 1}`);
    const color = String(msg.color || '#FF4D4D');
    const characterId = typeof msg.characterId === 'string' && msg.characterId ? msg.characterId : undefined;

    const existing = this.players.get(id);
    const player: ConnectedPlayer = existing
      ? { ...existing, name, color, characterId: characterId ?? existing.characterId, connected: true, transport: 'connecting', lastSeq: -1 }
      : {
          id,
          slot,
          name,
          color,
          characterId,
          connected: true,
          transport: 'connecting',
          pingMs: 0,
          lastSeq: -1,
          input: { ...DEFAULT_INPUT },
        };

    this.players.set(id, player);
    this.slotToId.set(slot, id);
    this.setupWebRtcPeer(id);
    this.emitPlayers();
  }

  private setupWebRtcPeer(playerId: string): void {
    this.cleanupPeer(playerId);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // Dual DataChannel:
    // 1. Unordered & Unreliable (0 retransmits) for 60Hz steering/throttle
    const fastChannel = pc.createDataChannel('input-fast', {
      ordered: false,
      maxRetransmits: 0,
    });
    fastChannel.binaryType = 'arraybuffer';

    // 2. Reliable & Ordered for discrete UI/Game events
    const reliableChannel = pc.createDataChannel('events-reliable', {
      ordered: true,
    });

    const record: PeerRecord = {
      pc,
      fastChannel,
      reliableChannel,
      fallbackTimer: window.setTimeout(() => {
        const p = this.players.get(playerId);
        if (p && p.transport === 'connecting') {
          p.transport = 'ws-fallback';
          this.emitPlayers();
        }
      }, 2500),
    };
    this.peers.set(playerId, record);

    fastChannel.onopen = () => {
      if (record.fallbackTimer !== null) clearTimeout(record.fallbackTimer);
      const p = this.players.get(playerId);
      if (p) {
        p.transport = 'webrtc';
        this.emitPlayers();
      }
    };

    fastChannel.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        this.handlePlayerBinary(playerId, ev.data);
      }
    };

    reliableChannel.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as Record<string, unknown>;
        this.callbacks.onReliableEvent(playerId, data);
      } catch {
        // Ignore malformed
      }
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'signal',
            targetPlayerId: playerId,
            signal: { candidate: ev.candidate },
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        const p = this.players.get(playerId);
        if (p && p.connected && p.transport === 'webrtc') {
          p.transport = 'ws-fallback';
          this.emitPlayers();
        }
      }
    };

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        if (this.ws?.readyState === WebSocket.OPEN && pc.localDescription) {
          this.ws.send(
            JSON.stringify({
              type: 'signal',
              targetPlayerId: playerId,
              signal: { sdp: pc.localDescription },
            })
          );
        }
      })
      .catch(() => {
        const p = this.players.get(playerId);
        if (p) {
          p.transport = 'ws-fallback';
          this.emitPlayers();
        }
      });
  }

  private async handleWebRtcSignal(playerId: string, signal: Record<string, unknown>): Promise<void> {
    const peer = this.peers.get(playerId);
    if (!peer?.pc) return;

    try {
      if (signal.sdp) {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp as RTCSessionDescriptionInit));
      } else if (signal.candidate) {
        await peer.pc.addIceCandidate(new RTCIceCandidate(signal.candidate as RTCIceCandidateInit));
      }
    } catch {
      // Ignore late ICE candidates
    }
  }

  private handleWsBinary(buf: ArrayBuffer): void {
    if (buf.byteLength < 2) return;
    const bytes = new Uint8Array(buf);
    const slot = bytes[0];
    const playerId = this.slotToId.get(slot);
    if (!playerId) return;

    const payload = buf.slice(1);
    this.handlePlayerBinary(playerId, payload);
  }

  private handlePlayerBinary(playerId: string, buf: ArrayBuffer): void {
    if (buf.byteLength < 1) return;
    const type = new DataView(buf).getUint8(0);
    const player = this.players.get(playerId);
    if (!player) return;

    if (type === PACKET_INPUT) {
      const parsed = decodeControllerInput(buf);
      if (!parsed) return;
      if (isSequenceNewer(parsed.seq, player.lastSeq)) {
        player.lastSeq = parsed.seq;
        player.input = parsed;
      }
    } else if (type === PACKET_PONG) {
      const pong = decodePing(buf);
      if (pong) {
        const now16 = Math.round(performance.now()) & 0xffff;
        const rtt = (now16 - pong.ts16 + 65536) % 65536;
        if (rtt < 5000) {
          player.pingMs = rtt;
          this.emitPlayers();
        }
      }
    } else if (type === PACKET_PING) {
      const ping = decodePing(buf);
      if (ping) {
        const pongBuf = encodePing(ping.seq, ping.ts16, PACKET_PONG);
        const peer = this.peers.get(playerId);
        if (peer?.fastChannel?.readyState === 'open') {
          peer.fastChannel.send(pongBuf);
        }
      }
    }
  }

  private sendPings(): void {
    const now16 = Math.round(performance.now()) & 0xffff;
    const pingBuf = encodePing(0, now16, PACKET_PING);
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      const peer = this.peers.get(p.id);
      if (peer?.fastChannel?.readyState === 'open') {
        peer.fastChannel.send(pingBuf);
      } else if (this.ws?.readyState === WebSocket.OPEN) {
        const framed = new Uint8Array(1 + pingBuf.byteLength);
        framed[0] = p.slot;
        framed.set(new Uint8Array(pingBuf), 1);
        this.ws.send(framed.buffer);
      }
    }
  }

  private cleanupPeer(playerId: string): void {
    const peer = this.peers.get(playerId);
    if (!peer) return;
    if (peer.fallbackTimer !== null) clearTimeout(peer.fallbackTimer);
    peer.fastChannel?.close();
    peer.reliableChannel?.close();
    peer.pc?.close();
    this.peers.delete(playerId);
  }

  private emitPlayers(): void {
    this.callbacks.onPlayersChanged(this.getPlayers());
  }

  destroy(): void {
    if (this.pingInterval !== null) clearInterval(this.pingInterval);
    for (const pid of this.peers.keys()) this.cleanupPeer(pid);
    this.ws?.close();
  }
}
