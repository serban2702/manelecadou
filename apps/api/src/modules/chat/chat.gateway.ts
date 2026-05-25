import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatMessage } from './message.entity';

interface SocketIdentity {
  userId: string | null;
  guestId: string | null;
  isAdmin: boolean;
  conversationId?: string | null;
}

const ADMIN_ROOM = 'admin:chat';
const userRoom = (id: string) => `user:${id}`;
const guestRoom = (id: string) => `guest:${id}`;
const conversationRoom = (id: string) => `conv:${id}`;

/**
 * Gateway WebSocket pentru chat live + presence.
 *
 * Conexiunea = sursa primă de adevăr pentru online/offline:
 *  - `connected` = adăugat în `presenceMap` și emis `presence:update` către admin room
 *  - `disconnect` = scos din map (după un mic delay ca să acoperim refresh-uri)
 *
 * Eveni-mente client → server:
 *  - `chat:join` (conversationId) — admin se subscribe la o conversație
 *  - `chat:typing` ({ conversationId, isTyping }) — propagat la receiver
 *
 * Server → client:
 *  - `chat:message` ({ message, conversationId, conversation })
 *  - `chat:presence` ({ userId|guestId, online, lastSeenAt })
 *  - `chat:typing` ({ conversationId, from, isTyping })
 */
@Injectable()
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/chat',
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('ChatGateway');

  @WebSocketServer()
  server!: Server;

  /** Map user/guest id → set de socket-uri active. */
  private presenceUsers = new Map<string, Set<string>>();
  private presenceGuests = new Map<string, Set<string>>();
  private adminSockets = new Set<string>();
  /** Pending disconnect timers — ștergerea din presence se face cu un delay scurt. */
  private pendingDisconnect = new Map<string, ReturnType<typeof setTimeout>>();
  /** Ultimul IP cunoscut per user/guest (capturat la handshake WS). Persistă peste
   *  disconnect ca să-l putem afișa și după ce userul iese din pagină. Sursă de
   *  rezervă față de `analytics_sessions.ip` (care poate lipsi dacă guestul a deschis
   *  chat-ul înainte de primul event /track). */
  private lastIpByUser = new Map<string, string>();
  private lastIpByGuest = new Map<string, string>();

  constructor(@Inject(forwardRef(() => JwtService)) private readonly jwt: JwtService) {}

  // ============== CONNECTION LIFECYCLE ==============

  async handleConnection(client: Socket) {
    const ident = this.identifySocket(client);
    (client.data as SocketIdentity) = ident;

    // Capturăm IP-ul din handshake (Caddy/NPM setează X-Forwarded-For). Persistă
    // în memorie chiar și după disconnect — util pentru triage când userul iese.
    const ip = this.extractIp(client);
    if (ip) {
      if (ident.userId) this.lastIpByUser.set(ident.userId, ip);
      else if (ident.guestId) this.lastIpByGuest.set(ident.guestId, ip);
    }

    if (ident.isAdmin) {
      this.adminSockets.add(client.id);
      await client.join(ADMIN_ROOM);
      this.logger.log(`admin connected ${client.id}`);
      // La conectare, trimite snapshot-ul cu presence-ul curent.
      client.emit('chat:presence:snapshot', this.snapshot());
      return;
    }

    if (ident.userId) {
      this.addPresence(this.presenceUsers, ident.userId, client.id);
      await client.join(userRoom(ident.userId));
      this.broadcastPresence({ userId: ident.userId, guestId: null, online: true });
      this.logger.log(`user connected ${ident.userId.slice(0, 8)} (${client.id})`);
    } else if (ident.guestId) {
      this.addPresence(this.presenceGuests, ident.guestId, client.id);
      await client.join(guestRoom(ident.guestId));
      this.broadcastPresence({ userId: null, guestId: ident.guestId, online: true });
      this.logger.log(`guest connected ${ident.guestId.slice(0, 8)} (${client.id})`);
    } else {
      this.logger.warn(`anonymous socket ${client.id} — disconnecting`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const ident = (client.data as SocketIdentity) ?? { userId: null, guestId: null, isAdmin: false };

    if (ident.isAdmin) {
      this.adminSockets.delete(client.id);
      return;
    }

    if (ident.userId) {
      this.removePresenceWithDelay(this.presenceUsers, ident.userId, client.id, () => {
        this.broadcastPresence({
          userId: ident.userId,
          guestId: null,
          online: false,
          lastSeenAt: new Date().toISOString(),
        });
      });
    } else if (ident.guestId) {
      this.removePresenceWithDelay(this.presenceGuests, ident.guestId, client.id, () => {
        this.broadcastPresence({
          userId: null,
          guestId: ident.guestId,
          online: false,
          lastSeenAt: new Date().toISOString(),
        });
      });
    }
  }

  private identifySocket(client: Socket): SocketIdentity {
    const auth = (client.handshake.auth ?? {}) as {
      token?: string;
      guestId?: string;
      role?: string;
    };
    const headerToken = (client.handshake.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');
    const token = auth.token || headerToken;

    let userId: string | null = null;
    let isAdmin = false;
    if (token) {
      try {
        const payload = this.jwt.verify<{ sub: string; role?: string }>(token);
        userId = payload.sub;
        isAdmin = payload.role === 'admin';
      } catch {
        // token invalid — îl ignorăm, dăm fallback la guest
      }
    }
    const guestId = !userId ? (auth.guestId ?? (client.handshake.query.guestId as string | undefined) ?? null) : null;

    return { userId, guestId: guestId || null, isAdmin };
  }

  // ============== PRESENCE HELPERS ==============

  private addPresence(map: Map<string, Set<string>>, key: string, socketId: string) {
    const pending = this.pendingDisconnect.get(`${map === this.presenceUsers ? 'u' : 'g'}:${key}`);
    if (pending) {
      clearTimeout(pending);
      this.pendingDisconnect.delete(`${map === this.presenceUsers ? 'u' : 'g'}:${key}`);
    }
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(socketId);
  }

  private removePresenceWithDelay(
    map: Map<string, Set<string>>,
    key: string,
    socketId: string,
    onActuallyOffline: () => void,
  ) {
    const set = map.get(key);
    if (!set) return;
    set.delete(socketId);
    if (set.size > 0) return; // alte tab-uri încă active
    // Așteptăm 5s — dacă userul nu se reconectează (refresh), îl marcăm offline.
    const pendingKey = `${map === this.presenceUsers ? 'u' : 'g'}:${key}`;
    const t = setTimeout(() => {
      this.pendingDisconnect.delete(pendingKey);
      const stillEmpty = (map.get(key)?.size ?? 0) === 0;
      if (stillEmpty) {
        map.delete(key);
        onActuallyOffline();
      }
    }, 5000);
    this.pendingDisconnect.set(pendingKey, t);
  }

  private broadcastPresence(payload: {
    userId: string | null;
    guestId: string | null;
    online: boolean;
    lastSeenAt?: string;
  }) {
    this.server.to(ADMIN_ROOM).emit('chat:presence', payload);
  }

  /** Util pentru consum în service / controllers. */
  isOnline(target: { userId: string | null; guestId: string | null }): boolean {
    if (target.userId && (this.presenceUsers.get(target.userId)?.size ?? 0) > 0) return true;
    if (target.guestId && (this.presenceGuests.get(target.guestId)?.size ?? 0) > 0) return true;
    return false;
  }

  /** IP-ul capturat din handshake WS (rezervă pentru când `analytics_sessions.ip`
   *  nu există încă — guest care a deschis chat-ul înainte de primul page_view). */
  getKnownIp(target: { userId: string | null; guestId: string | null }): string | null {
    if (target.userId && this.lastIpByUser.has(target.userId)) return this.lastIpByUser.get(target.userId)!;
    if (target.guestId && this.lastIpByGuest.has(target.guestId)) return this.lastIpByGuest.get(target.guestId)!;
    return null;
  }

  private extractIp(client: Socket): string | null {
    const xff = client.handshake.headers['x-forwarded-for'];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    if (typeof raw === 'string' && raw.length > 0) return raw.split(',')[0].trim();
    return client.handshake.address || null;
  }

  snapshot(): { users: string[]; guests: string[] } {
    return {
      users: Array.from(this.presenceUsers.keys()),
      guests: Array.from(this.presenceGuests.keys()),
    };
  }

  // ============== EMISSION HELPERS (apelate din ChatService) ==============

  /** Notifică ambele părți despre un mesaj nou într-o conversație. */
  emitMessage(args: {
    message: ChatMessage;
    conversation: { id: string; userId: string | null; guestId: string | null; unreadByAdmin: number; unreadByUser: number };
  }) {
    const payload = {
      message: args.message,
      conversation: args.conversation,
    };
    // Admin room întotdeauna primește.
    this.server.to(ADMIN_ROOM).emit('chat:message', payload);
    // Owner-ul (user sau guest)
    if (args.conversation.userId) {
      this.server.to(userRoom(args.conversation.userId)).emit('chat:message', payload);
    }
    if (args.conversation.guestId) {
      this.server.to(guestRoom(args.conversation.guestId)).emit('chat:message', payload);
    }
    // Camera per conversație (pt admin care are conversația deschisă)
    this.server.to(conversationRoom(args.conversation.id)).emit('chat:message', payload);
  }

  // ============== CLIENT EVENTS ==============

  @SubscribeMessage('chat:join')
  async handleJoin(@MessageBody() data: { conversationId: string }, @ConnectedSocket() client: Socket) {
    const ident = client.data as SocketIdentity;
    if (!data?.conversationId) return;
    if (ident.isAdmin) {
      await client.join(conversationRoom(data.conversationId));
      ident.conversationId = data.conversationId;
    }
  }

  @SubscribeMessage('chat:leave')
  async handleLeave(@MessageBody() data: { conversationId: string }, @ConnectedSocket() client: Socket) {
    const ident = client.data as SocketIdentity;
    if (!data?.conversationId) return;
    if (ident.isAdmin) {
      await client.leave(conversationRoom(data.conversationId));
      if (ident.conversationId === data.conversationId) ident.conversationId = null;
    }
  }

  @SubscribeMessage('chat:typing')
  handleTyping(
    @MessageBody() data: { conversationId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const ident = client.data as SocketIdentity;
    if (!data?.conversationId) return;
    const payload = {
      conversationId: data.conversationId,
      isTyping: !!data.isTyping,
      from: ident.isAdmin ? 'admin' : 'user',
    };
    // Tot ce e legat de conversație primește (admin care o are deschisă + owner)
    this.server.to(conversationRoom(data.conversationId)).emit('chat:typing', payload);
    if (ident.isAdmin) {
      // adminul tastează → notifică owner-ul
      // Nu știm direct user/guestId aici fără lookup în DB; lăsăm controllerul să lookup-eze dacă e nevoie.
      this.server.to(ADMIN_ROOM).emit('chat:typing', payload);
    } else if (ident.userId) {
      this.server.to(ADMIN_ROOM).emit('chat:typing', { ...payload, userId: ident.userId });
    } else if (ident.guestId) {
      this.server.to(ADMIN_ROOM).emit('chat:typing', { ...payload, guestId: ident.guestId });
    }
  }

  @SubscribeMessage('chat:ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('chat:pong', { at: Date.now() });
  }
}
