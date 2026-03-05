import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { parse } from 'node:url';
import { env } from '../config/env.js';

export type Channel = 'admin' | 'player' | 'deliberation';

type RoomInfo = {
  channel: Channel;
  gameId: string;
  roomKey: string;
  token?: string;
};

function parseCookie(header: string | undefined, key: string) {
  if (!header) return undefined;

  const segments = header.split(';').map((part) => part.trim());
  for (const segment of segments) {
    const [cookieKey, ...rest] = segment.split('=');
    if (cookieKey === key) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return undefined;
}

export class WebSocketHub {
  private wss: WebSocketServer;
  private rooms: Map<string, Set<WebSocket>>;

  constructor(
    private authorize?: (params: {
      channel: Channel;
      gameId: string;
      token?: string | null;
    }) => Promise<boolean> | boolean
  ) {
    this.wss = new WebSocketServer({ noServer: true });
    this.rooms = new Map();

    this.wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
      const roomInfo = this.getRoomInfo(req);
      if (!roomInfo) {
        socket.close();
        return;
      }

      Promise.resolve(
        this.authorize?.({
          channel: roomInfo.channel,
          gameId: roomInfo.gameId,
          token: roomInfo.token
        }) ?? true
      )
        .then((allowed) => {
          if (!allowed) {
            socket.close();
            return;
          }

          const room = this.rooms.get(roomInfo.roomKey) ?? new Set<WebSocket>();
          room.add(socket);
          this.rooms.set(roomInfo.roomKey, room);

          socket.on('close', () => {
            room.delete(socket);
            if (room.size === 0) {
              this.rooms.delete(roomInfo.roomKey);
            }
          });

          socket.send(
            JSON.stringify({
              type: 'connected',
              room: roomInfo.roomKey
            })
          );
        })
        .catch(() => {
          socket.close();
        });
    });
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    this.wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      this.wss.emit('connection', ws, req);
    });
  }

  broadcast(channel: Channel, gameId: string, payload: unknown) {
    const roomKey = `${channel}:${gameId}`;
    const room = this.rooms.get(roomKey);
    if (!room) return;

    const message = JSON.stringify(payload);
    for (const client of room) {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    }
  }

  private getRoomInfo(req: IncomingMessage): RoomInfo | null {
    const url = parse(req.url ?? '', true);
    const path = url.pathname ?? '';
    const parts = path.split('/').filter(Boolean);

    if (parts.length !== 4 || parts[0] !== 'ws' || parts[1] !== 'v2') {
      return null;
    }

    const channel = parts[2] as Channel;
    const gameId = parts[3];

    if (!['admin', 'player', 'deliberation'].includes(channel)) {
      return null;
    }

    const queryToken = typeof url.query.token === 'string' ? url.query.token : undefined;
    const cookieToken = parseCookie(req.headers.cookie, env.ADMIN_SESSION_COOKIE);

    return {
      channel,
      gameId,
      roomKey: `${channel}:${gameId}`,
      token: queryToken || cookieToken
    };
  }
}
