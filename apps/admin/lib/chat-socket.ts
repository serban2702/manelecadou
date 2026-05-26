'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAdminToken } from '@/lib/api';
import type { EnrichedPresence } from './types';

const WS_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';

export interface ChatMessageEvent {
  message: {
    id: string;
    conversationId: string;
    authorRole: 'user' | 'admin' | 'system';
    authorId: string | null;
    body: string;
    createdAt: string;
    messageType?: string;
    payload?: Record<string, unknown> | null;
    deliveredAt?: string | null;
    readAt?: string | null;
    attachmentUrl?: string | null;
    attachmentMime?: string | null;
    attachmentName?: string | null;
  };
  conversation: {
    id: string;
    userId: string | null;
    guestId: string | null;
    unreadByAdmin: number;
    unreadByUser: number;
  };
}

export interface PresenceEvent {
  userId: string | null;
  guestId: string | null;
  online: boolean;
  lastSeenAt?: string;
  enriched?: EnrichedPresence | null;
}

export interface PresenceSnapshot {
  users: string[];
  guests: string[];
  enriched?: Record<string, EnrichedPresence>;
}

export interface MessageAckEvent {
  conversationId: string;
  messageIds: string[];
  status: 'delivered' | 'read';
  by: 'admin' | 'user';
  at: string;
}

export interface AiSuggestionEvent {
  conversationId: string;
  message: ChatMessageEvent['message'];
}

export interface TypingEvent {
  conversationId: string;
  isTyping: boolean;
  from: 'admin' | 'user';
  userId?: string;
  guestId?: string;
}

interface UseChatSocketArgs {
  onMessage?: (e: ChatMessageEvent) => void;
  onMessageUpdated?: (e: ChatMessageEvent) => void;
  onMessageDeleted?: (e: { messageId: string; conversationId: string }) => void;
  onPresence?: (e: PresenceEvent) => void;
  onSnapshot?: (s: PresenceSnapshot) => void;
  onAck?: (e: MessageAckEvent) => void;
  onAiSuggestion?: (e: AiSuggestionEvent) => void;
  onTyping?: (e: TypingEvent) => void;
}

export function useAdminChatSocket({ onMessage, onMessageUpdated, onMessageDeleted, onPresence, onSnapshot, onAck, onAiSuggestion, onTyping }: UseChatSocketArgs = {}) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    const socket = io(`${WS_URL}/chat`, {
      auth: { token, role: 'admin' },
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    if (onMessage) socket.on('chat:message', onMessage);
    if (onMessageUpdated) socket.on('chat:message_updated', onMessageUpdated);
    if (onMessageDeleted) socket.on('chat:message_deleted', onMessageDeleted);
    if (onPresence) socket.on('chat:presence', onPresence);
    if (onSnapshot) socket.on('chat:presence:snapshot', onSnapshot);
    if (onAck) socket.on('chat:message:ack', onAck);
    if (onAiSuggestion) socket.on('chat:ai_suggestion', onAiSuggestion);
    if (onTyping) socket.on('chat:typing', onTyping);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    connected,
    joinConversation: (conversationId: string) => {
      socketRef.current?.emit('chat:join', { conversationId });
    },
    leaveConversation: (conversationId: string) => {
      socketRef.current?.emit('chat:leave', { conversationId });
    },
    sendTyping: (conversationId: string, isTyping: boolean) => {
      socketRef.current?.emit('chat:typing', { conversationId, isTyping });
    },
  };
}
