'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, getGuestId } from '@/lib/api';

const WS_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';

export interface IncomingChatMessage {
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

interface UseChatSocketArgs {
  enabled?: boolean;
  onMessage?: (e: IncomingChatMessage) => void;
}

/**
 * Conexiune WebSocket pentru chat user (sau guest).
 * Auth handshake: JWT dacă userul e logat, altfel guestId.
 */
export function useChatSocket({ enabled = true, onMessage }: UseChatSocketArgs = {}) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const token = getAccessToken();
    const guestId = getGuestId();
    if (!token && !guestId) return;

    const socket = io(`${WS_URL}/chat`, {
      auth: token ? { token } : { guestId },
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    if (onMessage) socket.on('chat:message', onMessage);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    connected,
    sendTyping: (conversationId: string, isTyping: boolean) => {
      socketRef.current?.emit('chat:typing', { conversationId, isTyping });
    },
  };
}
