'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAdminToken } from '@/lib/api';

const WS_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';

export interface ChatMessageEvent {
  message: {
    id: string;
    conversationId: string;
    authorRole: 'user' | 'admin' | 'system';
    authorId: string | null;
    body: string;
    createdAt: string;
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
}

export interface PresenceSnapshot {
  users: string[];
  guests: string[];
}

interface UseChatSocketArgs {
  onMessage?: (e: ChatMessageEvent) => void;
  onPresence?: (e: PresenceEvent) => void;
  onSnapshot?: (s: PresenceSnapshot) => void;
}

/**
 * Conexiune live la /chat namespace cu rol admin.
 * Emite `chat:message`, `chat:presence`, `chat:presence:snapshot` din server.
 */
export function useAdminChatSocket({ onMessage, onPresence, onSnapshot }: UseChatSocketArgs = {}) {
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
    if (onPresence) socket.on('chat:presence', onPresence);
    if (onSnapshot) socket.on('chat:presence:snapshot', onSnapshot);

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
