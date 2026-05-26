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
import { ModuleRef } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './message.entity';
import { Conversation } from './conversation.entity';

interface SocketIdentity {
  userId: string | null;
  guestId: string | null;
  isAdmin: boolean;
  conversationId?: string | null;
}

export interface DeviceInfo {
  type?: 'mobile' | 'tablet' | 'desktop';
  os?: string;
  browser?: string;
  viewport?: { w: number; h: number };
  userAgent?: string;
}

/** Snapshot enriched de presence — folosit de admin sidebar. */
export interface EnrichedPresence {
  online: boolean;
  connectedAt: string | null; // ISO
  lastSeenAt: string | null;
  currentPath: string | null;
  currentTitle: string | null;
  chatOpen: boolean;
  device: DeviceInfo | null;
  ip: string | null;
}

const ADMIN_ROOM = 'admin:chat';
const userRoom = (id: string) => `user:${id}`;
const guestRoom = (id: string) => `guest:${id}`;
const conversationRoom = (id: string) => `conv:${id}`;

const presenceKey = (target: { userId: string | null; guestId: string | null }) =>
  target.userId ? `u:${target.userId}` : target.guestId ? `g:${target.guestId}` : null;

/**
 * Gateway WebSocket pentru chat live + presence enriched.
 *
 * Faza 1 events:
 *  Client → Server:
 *    - chat:join / chat:leave / chat:typing / chat:ping  (existing)
 *    - presence:heartbeat ({ path, title, viewport, chatOpen, device }) — la 10s
 *    - presence:page_change ({ from, to, title })
 *    - presence:chat_toggle ({ open })
 *    - message:ack ({ messageIds: string[], status: 'delivered'|'read' })
 *
 *  Server → Client:
 *    - chat:message (existing)
 *    - chat:presence (online/offline diff, existing) + enriched payload
 *    - chat:presence:snapshot (sent on admin connect — now enriched)
 *    - chat:presence:enriched (diff cu currentPath/device/chatOpen)
 *    - chat:force_open  (server tells user widget să se deschidă)
 *    - chat:message:ack (server informează celălalt capăt despre delivered/read)
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
  private pendingDisconnect = new Map<string, ReturnType<typeof setTimeout>>();
  private lastIpByUser = new Map<string, string>();
  private lastIpByGuest = new Map<string, string>();

  /** Enriched presence keyed by `u:<userId>` / `g:<guestId>`. */
  private enriched = new Map<string, EnrichedPresence>();

  /** Callback (injected by ChatService) când vine ACK pe mesaj. */
  private onMessageAck?: (messageIds: string[], status: 'delivered' | 'read', actor: SocketIdentity) => Promise<void>;

  constructor(
    @Inject(forwardRef(() => JwtService)) private readonly jwt: JwtService,
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Timer-uri per-key (u:<id> | g:<id>) pentru greeting cu delay 5s.
   *  Dacă userul se deconectează rapid sau face navigate la /m/[id], anulăm. */
  private greetingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** ChatService apelează la initializare ca să primească ACK-uri. */
  registerAckHandler(handler: (ids: string[], status: 'delivered' | 'read', actor: SocketIdentity) => Promise<void>) {
    this.onMessageAck = handler;
  }

  /**
   * Verifică condițiile pentru greeting proactiv și-l declanșează dacă toate sunt
   * îndeplinite. Apelat la 5s după connection (vezi greetingTimers).
   *
   * Eligible dacă:
   *  - ident încă online (user/guest n-a deconectat în timpul delay-ului)
   *  - există Conversation pentru userId/guestId
   *  - Site.aiGreetingEnabled === true
   *  - Conversation.greetingSentAt IS NULL (sesiune n-a primit deja greeting)
   *  - Conversation.lastClientPath nu începe cu /m/ (skip ascultători)
   */
  private async triggerGreetingIfEligible(ident: SocketIdentity): Promise<void> {
    try {
      const key = presenceKey(ident);
      if (!key) return;
      // Verifică online
      const stillOnline = ident.userId
        ? this.presenceUsers.has(ident.userId)
        : ident.guestId ? this.presenceGuests.has(ident.guestId) : false;
      if (!stillOnline) return;

      // Caută conv (cea mai recentă pentru user/guest)
      const whereClause = ident.userId
        ? { userId: ident.userId }
        : ident.guestId ? { guestId: ident.guestId } : null;
      if (!whereClause) return;
      const conv = await this.convRepo.findOne({
        where: whereClause,
        order: { createdAt: 'DESC' },
      });
      if (!conv) return; // încă nu s-a creat conv → o creează AI agent intern

      if (conv.greetingSentAt) return; // deja salutat
      // Verifică ambele surse pentru path-ul curent: enriched (memory, vine prin heartbeat
      // imediat la connect) și DB lastClientPath (mai stale, dar fallback).
      const currentPath = this.enriched.get(key)?.currentPath ?? conv.lastClientPath ?? '';
      if (currentPath.startsWith('/m/')) return; // ascultător de manea, nu prospect

      // Apel către AI agent — lazy resolve via ModuleRef (cross-module fără circular dep static)
      const agentMod = await import('../ai-chat/ai-chat-agent.service');
      const agent = this.moduleRef.get(agentMod.AIChatAgentService, { strict: false });
      await agent.maybeGreetUser(conv.id, ident);
    } catch (e) {
      this.logger.warn(`triggerGreetingIfEligible failed: ${(e as Error).message}`);
    }
  }

  // ============== CONNECTION LIFECYCLE ==============

  async handleConnection(client: Socket) {
    const ident = this.identifySocket(client);
    (client.data as SocketIdentity) = ident;

    const ip = this.extractIp(client);
    if (ip) {
      if (ident.userId) this.lastIpByUser.set(ident.userId, ip);
      else if (ident.guestId) this.lastIpByGuest.set(ident.guestId, ip);
      // Persistă pe toate conv-urile user/guest-ului. UPDATE direct (NU save full entity)
      // ca să nu rupem wizardState concurrency.
      if (ident.userId || ident.guestId) {
        void this.convRepo
          .createQueryBuilder()
          .update(Conversation)
          .set({ lastIp: ip })
          .where(ident.userId ? '"userId" = :id' : '"guestId" = :id', {
            id: ident.userId ?? ident.guestId,
          })
          .execute()
          .catch(() => undefined);
      }
    }

    if (ident.isAdmin) {
      this.adminSockets.add(client.id);
      await client.join(ADMIN_ROOM);
      this.logger.log(`admin connected ${client.id}`);
      client.emit('chat:presence:snapshot', this.snapshot());
      return;
    }

    if (ident.userId || ident.guestId) {
      const key = presenceKey(ident)!;
      if (ident.userId) {
        this.addPresence(this.presenceUsers, ident.userId, client.id);
        await client.join(userRoom(ident.userId));
      } else {
        this.addPresence(this.presenceGuests, ident.guestId!, client.id);
        await client.join(guestRoom(ident.guestId!));
      }

      // Inițializează enriched presence (vine update prin heartbeat în 10s)
      const existing = this.enriched.get(key);
      const ua = (client.handshake.headers['user-agent'] as string | undefined) ?? null;
      this.enriched.set(key, {
        online: true,
        connectedAt: existing?.connectedAt ?? new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        currentPath: existing?.currentPath ?? null,
        currentTitle: existing?.currentTitle ?? null,
        chatOpen: existing?.chatOpen ?? false,
        device: existing?.device ?? (ua ? { userAgent: ua, ...this.parseUA(ua) } : null),
        ip: ip ?? existing?.ip ?? null,
      });

      this.broadcastPresence({
        userId: ident.userId,
        guestId: ident.guestId,
        online: true,
        enriched: this.enriched.get(key) ?? null,
      });
      this.logger.log(
        `${ident.userId ? 'user' : 'guest'} connected ${(ident.userId ?? ident.guestId)!.slice(0, 8)} (${client.id})`,
      );

      // ============== Proactive greeting (Faza 6 — Irina virtuală) ==============
      // După 5 secunde, dacă:
      //   - userul încă-i online,
      //   - site-ul are aiGreetingEnabled,
      //   - conv n-are deja greetingSentAt (one-shot per sesiune permanent),
      //   - lastClientPath nu e pe /m/[id] (ascultători nu-s prospects).
      // → trigger greeting via AIChatAgentService.maybeGreetUser.
      // Dacă există deja un timer pentru același key, NU re-arm — userul a doar deschis
      // un al doilea tab (același guestId). Greeting o singură dată per sesiune.
      if (!this.greetingTimers.has(key)) {
        const timer = setTimeout(() => {
          this.greetingTimers.delete(key);
          void this.triggerGreetingIfEligible(ident);
        }, 5000);
        this.greetingTimers.set(key, timer);
      }
      return;
    }

    this.logger.warn(`anonymous socket ${client.id} — disconnecting`);
    client.disconnect();
  }

  handleDisconnect(client: Socket) {
    const ident = (client.data as SocketIdentity) ?? { userId: null, guestId: null, isAdmin: false };

    if (ident.isAdmin) {
      this.adminSockets.delete(client.id);
      return;
    }

    const onOffline = () => {
      const key = presenceKey(ident);
      if (key) {
        const e = this.enriched.get(key);
        if (e) {
          e.online = false;
          e.lastSeenAt = new Date().toISOString();
          e.chatOpen = false;
        }
      }
      this.broadcastPresence({
        userId: ident.userId,
        guestId: ident.guestId,
        online: false,
        lastSeenAt: new Date().toISOString(),
        enriched: key ? this.enriched.get(key) ?? null : null,
      });
    };

    if (ident.userId) {
      this.removePresenceWithDelay(this.presenceUsers, ident.userId, client.id, onOffline);
    } else if (ident.guestId) {
      this.removePresenceWithDelay(this.presenceGuests, ident.guestId, client.id, onOffline);
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
        // token invalid — ignorat
      }
    }
    const guestId = !userId ? (auth.guestId ?? (client.handshake.query.guestId as string | undefined) ?? null) : null;

    return { userId, guestId: guestId || null, isAdmin };
  }

  // ============== PRESENCE HELPERS ==============

  private addPresence(map: Map<string, Set<string>>, key: string, socketId: string) {
    const tag = map === this.presenceUsers ? 'u' : 'g';
    const pending = this.pendingDisconnect.get(`${tag}:${key}`);
    if (pending) {
      clearTimeout(pending);
      this.pendingDisconnect.delete(`${tag}:${key}`);
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
    if (set.size > 0) return;
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
    enriched?: EnrichedPresence | null;
  }) {
    this.server.to(ADMIN_ROOM).emit('chat:presence', payload);
  }

  /** Util pentru consum în service / controllers. */
  isOnline(target: { userId: string | null; guestId: string | null }): boolean {
    if (target.userId && (this.presenceUsers.get(target.userId)?.size ?? 0) > 0) return true;
    if (target.guestId && (this.presenceGuests.get(target.guestId)?.size ?? 0) > 0) return true;
    return false;
  }

  /** Enriched presence pentru o conversație (admin sidebar). */
  getEnriched(target: { userId: string | null; guestId: string | null }): EnrichedPresence | null {
    const key = presenceKey(target);
    return key ? this.enriched.get(key) ?? null : null;
  }

  /** Force open/close chat pe client (admin sau AI). */
  forceToggleChat(target: { userId: string | null; guestId: string | null }, open: boolean) {
    const event = open ? 'chat:force_open' : 'chat:force_close';
    if (target.userId) {
      this.server.to(userRoom(target.userId)).emit(event, { at: Date.now() });
    }
    if (target.guestId) {
      this.server.to(guestRoom(target.guestId)).emit(event, { at: Date.now() });
    }
  }

  /** @deprecated păstrat pentru backward-compat — folosește forceToggleChat. */
  forceOpenChat(target: { userId: string | null; guestId: string | null }) {
    this.forceToggleChat(target, true);
  }

  getKnownIp(target: { userId: string | null; guestId: string | null }): string | null {
    if (target.userId && this.lastIpByUser.has(target.userId)) return this.lastIpByUser.get(target.userId)!;
    if (target.guestId && this.lastIpByGuest.has(target.guestId)) return this.lastIpByGuest.get(target.guestId)!;
    return null;
  }

  findIdsByIp(needle: string): { userIds: string[]; guestIds: string[] } {
    const n = needle.toLowerCase();
    const userIds: string[] = [];
    const guestIds: string[] = [];
    for (const [id, ip] of this.lastIpByUser) {
      if (ip.toLowerCase().includes(n)) userIds.push(id);
    }
    for (const [id, ip] of this.lastIpByGuest) {
      if (ip.toLowerCase().includes(n)) guestIds.push(id);
    }
    return { userIds, guestIds };
  }

  private extractIp(client: Socket): string | null {
    const xff = client.handshake.headers['x-forwarded-for'];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    if (typeof raw === 'string' && raw.length > 0) return raw.split(',')[0].trim();
    return client.handshake.address || null;
  }

  /** Parser foarte simplu de User-Agent. Fallback rapid; pentru detalii folosim datele trimise de client în heartbeat. */
  private parseUA(ua: string): Partial<DeviceInfo> {
    const isMobile = /Mobi|Android|iPhone/.test(ua);
    const isTablet = /iPad|Tablet/.test(ua);
    const type: DeviceInfo['type'] = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';
    let os: string | undefined;
    if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iOS/.test(ua)) os = 'iOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    let browser: string | undefined;
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Safari\//.test(ua)) browser = 'Safari';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    return { type, os, browser };
  }

  snapshot(): {
    users: string[];
    guests: string[];
    enriched: Record<string, EnrichedPresence>;
  } {
    const enriched: Record<string, EnrichedPresence> = {};
    for (const [k, v] of this.enriched) enriched[k] = v;
    return {
      users: Array.from(this.presenceUsers.keys()),
      guests: Array.from(this.presenceGuests.keys()),
      enriched,
    };
  }

  // ============== EMISSION HELPERS (apelate din ChatService) ==============

  emitMessage(args: {
    message: ChatMessage;
    conversation: {
      id: string;
      userId: string | null;
      guestId: string | null;
      unreadByAdmin: number;
      unreadByUser: number;
    };
  }) {
    const payload = { message: args.message, conversation: args.conversation };
    this.server.to(ADMIN_ROOM).emit('chat:message', payload);
    if (args.conversation.userId) {
      this.server.to(userRoom(args.conversation.userId)).emit('chat:message', payload);
    }
    if (args.conversation.guestId) {
      this.server.to(guestRoom(args.conversation.guestId)).emit('chat:message', payload);
    }
    this.server.to(conversationRoom(args.conversation.id)).emit('chat:message', payload);
  }

  /** Emite un update general pe conversație (claim, rename, ai-mode etc.) către admin room. */
  emitConversationUpdated(conv: Conversation) {
    this.server.to(ADMIN_ROOM).emit('chat:conversation_updated', { conversation: conv });
  }

  /** Emite update pe un mesaj existent (admin a editat body-ul). */
  emitMessageUpdated(message: ChatMessage, conversation: { id: string; userId: string | null; guestId: string | null }) {
    const payload = { message, conversation };
    this.server.to(ADMIN_ROOM).emit('chat:message_updated', payload);
    if (conversation.userId) this.server.to(userRoom(conversation.userId)).emit('chat:message_updated', payload);
    if (conversation.guestId) this.server.to(guestRoom(conversation.guestId)).emit('chat:message_updated', payload);
    this.server.to(conversationRoom(conversation.id)).emit('chat:message_updated', payload);
  }

  /** Emite ștergere mesaj — clientul/adminul scot din listă instant. */
  emitMessageDeleted(messageId: string, conversation: { id: string; userId: string | null; guestId: string | null }) {
    const payload = { messageId, conversationId: conversation.id };
    this.server.to(ADMIN_ROOM).emit('chat:message_deleted', payload);
    if (conversation.userId) this.server.to(userRoom(conversation.userId)).emit('chat:message_deleted', payload);
    if (conversation.guestId) this.server.to(guestRoom(conversation.guestId)).emit('chat:message_deleted', payload);
    this.server.to(conversationRoom(conversation.id)).emit('chat:message_deleted', payload);
  }

  /** Emite o sugestie AI doar către admin room (NU către client). */
  emitAiSuggestion(args: { conversation: { id: string; siteId: string | null }; message: ChatMessage }) {
    this.server.to(ADMIN_ROOM).emit('chat:ai_suggestion', {
      conversationId: args.conversation.id,
      message: args.message,
    });
    this.server.to(conversationRoom(args.conversation.id)).emit('chat:ai_suggestion', {
      conversationId: args.conversation.id,
      message: args.message,
    });
  }

  /** Notifică ambele părți că un mesaj a fost delivered/read. */
  emitMessageAck(args: {
    conversation: { id: string; userId: string | null; guestId: string | null };
    messageIds: string[];
    status: 'delivered' | 'read';
    by: 'admin' | 'user';
  }) {
    const payload = {
      conversationId: args.conversation.id,
      messageIds: args.messageIds,
      status: args.status,
      by: args.by,
      at: new Date().toISOString(),
    };
    this.server.to(ADMIN_ROOM).emit('chat:message:ack', payload);
    if (args.conversation.userId) {
      this.server.to(userRoom(args.conversation.userId)).emit('chat:message:ack', payload);
    }
    if (args.conversation.guestId) {
      this.server.to(guestRoom(args.conversation.guestId)).emit('chat:message:ack', payload);
    }
    this.server.to(conversationRoom(args.conversation.id)).emit('chat:message:ack', payload);
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
  async handleTyping(
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
    this.server.to(conversationRoom(data.conversationId)).emit('chat:typing', payload);
    if (ident.isAdmin) {
      this.server.to(ADMIN_ROOM).emit('chat:typing', payload);
      // Trimite event-ul și către userul/guest-ul conversației ca să vadă „operatorul scrie..."
      try {
        const conv = await this.convRepo.findOne({
          where: { id: data.conversationId },
          select: ['id', 'userId', 'guestId'],
        });
        if (conv?.userId) this.server.to(userRoom(conv.userId)).emit('chat:typing', payload);
        if (conv?.guestId) this.server.to(guestRoom(conv.guestId)).emit('chat:typing', payload);
      } catch {
        /* best-effort */
      }
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

  // ============== PRESENCE EVENTS (Faza 1) ==============

  @SubscribeMessage('presence:heartbeat')
  handleHeartbeat(
    @MessageBody()
    data: {
      path?: string;
      title?: string;
      viewport?: { w: number; h: number };
      chatOpen?: boolean;
      device?: DeviceInfo;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const ident = client.data as SocketIdentity;
    if (ident.isAdmin) return;
    const key = presenceKey(ident);
    if (!key) return;

    const prev = this.enriched.get(key);
    const next: EnrichedPresence = {
      online: true,
      connectedAt: prev?.connectedAt ?? new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      currentPath: data?.path ?? prev?.currentPath ?? null,
      currentTitle: data?.title ?? prev?.currentTitle ?? null,
      chatOpen: typeof data?.chatOpen === 'boolean' ? data.chatOpen : prev?.chatOpen ?? false,
      device: data?.device ? { ...(prev?.device ?? {}), ...data.device } : prev?.device ?? null,
      ip: prev?.ip ?? null,
    };
    this.enriched.set(key, next);

    // Diff-uri semnificative → broadcast admin. Heartbeat-ul (timestamp only) NU spamează.
    const changed =
      !prev ||
      prev.currentPath !== next.currentPath ||
      prev.chatOpen !== next.chatOpen ||
      JSON.stringify(prev.device) !== JSON.stringify(next.device);
    if (changed) {
      this.broadcastPresence({
        userId: ident.userId,
        guestId: ident.guestId,
        online: true,
        enriched: next,
      });
    }
  }

  @SubscribeMessage('presence:page_change')
  handlePageChange(
    @MessageBody() data: { from?: string; to?: string; title?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const ident = client.data as SocketIdentity;
    if (ident.isAdmin || !data?.to) return;
    const key = presenceKey(ident);
    if (!key) return;

    // Anti-spam greeting: dacă userul navighează pe /m/[id] (pagină ascultare manea)
    // ÎN INTERVALUL de 5s dintre connect și greeting, anulăm timer-ul. Ascultătorii
    // nu-s prospects.
    if (data.to.startsWith('/m/')) {
      const t = this.greetingTimers.get(key);
      if (t) {
        clearTimeout(t);
        this.greetingTimers.delete(key);
      }
    }

    const prev = this.enriched.get(key);
    const next: EnrichedPresence = {
      online: true,
      connectedAt: prev?.connectedAt ?? new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      currentPath: data.to,
      currentTitle: data.title ?? prev?.currentTitle ?? null,
      chatOpen: prev?.chatOpen ?? false,
      device: prev?.device ?? null,
      ip: prev?.ip ?? null,
    };
    this.enriched.set(key, next);
    this.broadcastPresence({
      userId: ident.userId,
      guestId: ident.guestId,
      online: true,
      enriched: next,
    });
  }

  @SubscribeMessage('presence:chat_toggle')
  handleChatToggle(
    @MessageBody() data: { open: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const ident = client.data as SocketIdentity;
    if (ident.isAdmin) return;
    const key = presenceKey(ident);
    if (!key) return;
    const prev = this.enriched.get(key);
    const next: EnrichedPresence = {
      online: true,
      connectedAt: prev?.connectedAt ?? new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      currentPath: prev?.currentPath ?? null,
      currentTitle: prev?.currentTitle ?? null,
      chatOpen: !!data?.open,
      device: prev?.device ?? null,
      ip: prev?.ip ?? null,
    };
    this.enriched.set(key, next);
    this.broadcastPresence({
      userId: ident.userId,
      guestId: ident.guestId,
      online: true,
      enriched: next,
    });
  }

  @SubscribeMessage('message:ack')
  async handleMessageAck(
    @MessageBody() data: { messageIds: string[]; status: 'delivered' | 'read' },
    @ConnectedSocket() client: Socket,
  ) {
    const ident = client.data as SocketIdentity;
    if (!Array.isArray(data?.messageIds) || data.messageIds.length === 0) return;
    if (data.status !== 'delivered' && data.status !== 'read') return;
    if (!this.onMessageAck) return;
    try {
      await this.onMessageAck(data.messageIds, data.status, ident);
    } catch (e) {
      this.logger.warn(`message:ack handler failed: ${(e as Error).message}`);
    }
  }
}
