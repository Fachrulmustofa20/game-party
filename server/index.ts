import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';

const DIST_DIR = path.resolve(process.cwd(), 'dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const PORT = Number(process.env.PORT || 3001);
const MAX_PLAYERS = 10;

interface PlayerSession {
  id: string;
  slot: number; // 0..9
  name: string;
  color: string;
  characterId: string;
  sessionToken: string;
  ws: WebSocket | null;
  connected: boolean;
}

interface Room {
  code: string;
  hostWs: WebSocket | null;
  players: Map<string, PlayerSession>;
  createdAt: number;
}

const rooms = new Map<string, Room>();

interface LanInterfaceInfo {
  name: string;
  address: string;
  score: number;
}

function scoreInterface(name: string, address: string): number {
  const lower = name.toLowerCase();
  let score = 0;

  if (
    /^(utun|tun|tap|ppp|wg|tailscale|docker|veth|br-|bridge|vmnet|vboxnet|awdl|llw|zt|ham)/.test(
      lower
    ) ||
    lower.includes('virtual') ||
    lower.includes('vpn')
  ) {
    score -= 100;
  }

  if (/^(en0|wlan\d*|wlp\w*|wifi|wi-fi)/.test(lower) || lower.includes('wi-fi') || lower.includes('wifi')) {
    score += 50;
  } else if (/^(en\d+|eth\d+|enp\w*)/.test(lower)) {
    score += 25;
  }

  if (address.startsWith('192.168.')) {
    score += 20;
  } else if (address.startsWith('10.')) {
    score += 15;
  } else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) {
    score += 10;
  }

  return score;
}

function getLanIPv4Interfaces(): LanInterfaceInfo[] {
  const nets = os.networkInterfaces();
  const candidates: LanInterfaceInfo[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        candidates.push({
          name,
          address: net.address,
          score: scoreInterface(name, net.address),
        });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/api/network-info') {
    const interfaces = getLanIPv4Interfaces();
    const ips = interfaces.map((i) => i.address);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ips,
        primaryInterface: interfaces[0] ?? null,
        port: PORT,
      })
    );
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  // Serve built Vite frontend from dist/ in production (e.g., Render / Railway / Fly.io)
  if (fs.existsSync(DIST_DIR)) {
    const reqPath = (req.url || '/').split('?')[0];
    const safeRel = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(DIST_DIR, safeRel === '/' ? 'index.html' : safeRel);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });

function sendJson(ws: WebSocket | null | undefined, data: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on('connection', (ws) => {
  let role: 'host' | 'player' | null = null;
  let roomCode: string | null = null;
  let playerId: string | null = null;
  let playerSlot = -1;

  ws.on('message', (raw, isBinary) => {
    // Fast-path binary relay for WebSocket fallback mode
    if (isBinary) {
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);

      if (role === 'player' && playerSlot >= 0) {
        // Prepend 1 byte: playerSlot so Host knows which player sent the 8-byte packet
        const framed = Buffer.allocUnsafe(1 + buf.length);
        framed[0] = playerSlot;
        buf.copy(framed, 1);
        if (room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
          room.hostWs.send(framed, { binary: true });
        }
      } else if (role === 'host' && buf.length >= 2) {
        // Host sends [targetSlot (1 byte), ...payload]
        const targetSlot = buf[0];
        const payload = buf.subarray(1);
        for (const p of room.players.values()) {
          if (p.slot === targetSlot && p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(payload, { binary: true });
            break;
          }
        }
      }
      return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const type = msg.type as string;

    if (type === 'create_room') {
      const requestedCode = typeof msg.roomCode === 'string' ? msg.roomCode.toUpperCase() : '';
      const code = requestedCode && !rooms.has(requestedCode) ? requestedCode : generateRoomCode();
      role = 'host';
      roomCode = code;
      rooms.set(code, {
        code,
        hostWs: ws,
        players: new Map(),
        createdAt: Date.now(),
      });
      sendJson(ws, { type: 'room_created', roomCode: code });
      return;
    }

    if (type === 'join_room') {
      const code = String(msg.roomCode || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || !room.hostWs) {
        sendJson(ws, { type: 'error', message: `Room "${code}" tidak ditemukan.` });
        return;
      }

      const sessionToken = String(msg.sessionToken || '');
      const name = String(msg.name || 'Player').trim().slice(0, 32) || 'Player';
      const color = String(msg.color || '#FF4D4D');
      const characterId = typeof msg.characterId === 'string' && msg.characterId ? msg.characterId.slice(0, 24) : '';

      // Check reconnect via sessionToken
      let existing: PlayerSession | undefined;
      if (sessionToken) {
        for (const p of room.players.values()) {
          if (p.sessionToken === sessionToken) {
            existing = p;
            break;
          }
        }
      }

      if (existing) {
        const connectedSlots = new Set(
          Array.from(room.players.values())
            .filter((p) => p.connected && p.id !== existing.id)
            .map((p) => p.slot)
        );
        if (connectedSlots.has(existing.slot)) {
          let newSlot = 0;
          while (connectedSlots.has(newSlot) && newSlot < MAX_PLAYERS) newSlot++;
          existing.slot = newSlot;
        }
        existing.ws = ws;
        existing.connected = true;
        existing.name = name || existing.name;
        existing.color = color || existing.color;
        if (characterId) existing.characterId = characterId;
        role = 'player';
        roomCode = code;
        playerId = existing.id;
        playerSlot = existing.slot;

        sendJson(ws, {
          type: 'joined_room',
          roomCode: code,
          playerId: existing.id,
          slot: existing.slot,
          reconnected: true,
        });

        sendJson(room.hostWs, {
          type: 'player_joined',
          playerId: existing.id,
          slot: existing.slot,
          name: existing.name,
          color: existing.color,
          characterId: existing.characterId,
          reconnected: true,
        });
        return;
      }

      const activePlayers = Array.from(room.players.values()).filter((p) => p.connected);
      if (activePlayers.length >= MAX_PLAYERS) {
        sendJson(ws, { type: 'error', message: 'Room sudah penuh (maksimal 10 pemain).' });
        return;
      }

      // Find lowest available slot 0..9 among connected players
      const usedSlots = new Set(activePlayers.map((p) => p.slot));
      let slot = 0;
      while (usedSlots.has(slot) && slot < MAX_PLAYERS) slot++;

      const id = `p_${slot}_${Math.random().toString(36).slice(2, 7)}`;
      const newPlayer: PlayerSession = {
        id,
        slot,
        name,
        color,
        characterId,
        sessionToken: sessionToken || `${id}_${Date.now()}`,
        ws,
        connected: true,
      };

      room.players.set(id, newPlayer);
      role = 'player';
      roomCode = code;
      playerId = id;
      playerSlot = slot;

      sendJson(ws, {
        type: 'joined_room',
        roomCode: code,
        playerId: id,
        slot,
        sessionToken: newPlayer.sessionToken,
      });

      sendJson(room.hostWs, {
        type: 'player_joined',
        playerId: id,
        slot,
        name: newPlayer.name,
        color: newPlayer.color,
        characterId: newPlayer.characterId,
      });
      return;
    }

    if (type === 'kick_player' && roomCode && role === 'host') {
      const room = rooms.get(roomCode);
      if (!room) return;
      const targetId = String(msg.targetPlayerId || '');
      const target = room.players.get(targetId);
      if (target) {
        room.players.delete(targetId);
        if (target.ws && target.ws.readyState === WebSocket.OPEN) {
          sendJson(target.ws, { type: 'error', message: 'Anda dihapus dari room oleh Host.' });
          target.ws.close();
        }
      }
      return;
    }

    // WebRTC Signaling Relay (Offer / Answer / ICE)
    if (type === 'signal' && roomCode) {
      const room = rooms.get(roomCode);
      if (!room) return;

      if (role === 'host') {
        const targetId = String(msg.targetPlayerId || '');
        const target = room.players.get(targetId);
        if (target?.ws) {
          sendJson(target.ws, {
            type: 'signal',
            from: 'host',
            signal: msg.signal,
          });
        }
      } else if (role === 'player' && playerId) {
        sendJson(room.hostWs, {
          type: 'signal',
          from: playerId,
          signal: msg.signal,
        });
      }
      return;
    }

    // Reliable JSON Event Fallback (when WebRTC DataChannel is not active)
    if (type === 'relay_event' && roomCode) {
      const room = rooms.get(roomCode);
      if (!room) return;

      if (role === 'player' && playerId) {
        sendJson(room.hostWs, {
          type: 'relay_event',
          playerId,
          payload: msg.payload,
        });
      } else if (role === 'host') {
        const targetId = msg.targetPlayerId as string | undefined;
        if (targetId === '*') {
          for (const p of room.players.values()) {
            sendJson(p.ws, { type: 'relay_event', payload: msg.payload });
          }
        } else if (targetId) {
          const target = room.players.get(targetId);
          sendJson(target?.ws, { type: 'relay_event', payload: msg.payload });
        }
      }
    }
  });

  ws.on('close', () => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    if (role === 'host') {
      for (const p of room.players.values()) {
        sendJson(p.ws, { type: 'host_disconnected' });
      }
      rooms.delete(roomCode);
    } else if (role === 'player' && playerId) {
      if (room.players.delete(playerId)) {
        sendJson(room.hostWs, { type: 'player_disconnected', playerId });
      }
    }
  });
});

// Detect abruptly dropped mobile connections (e.g. Wi-Fi off / tab killed) via WS heartbeat
const aliveSockets = new WeakSet<WebSocket>();
wss.on('connection', (ws) => {
  aliveSockets.add(ws);
  ws.on('pong', () => aliveSockets.add(ws));
});
setInterval(() => {
  for (const client of wss.clients) {
    if (!aliveSockets.has(client)) {
      client.terminate();
      continue;
    }
    aliveSockets.delete(client);
    client.ping();
  }
}, 5000);

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLanIPv4Interfaces().map((i) => `${i.address} (${i.name})`);
  console.log(`[Signaling Server] Listening on port ${PORT}`);
  console.log(`[LAN IPs] ${ips.join(', ') || 'localhost only'}`);
});
