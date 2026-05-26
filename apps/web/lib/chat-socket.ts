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
    messageType?: string;
    payload?: Record<string, unknown> | null;
    attachmentUrl?: string | null;
    attachmentMime?: string | null;
    attachmentName?: string | null;
    deliveredAt?: string | null;
    readAt?: string | null;
  };
  conversation: {
    id: string;
    userId: string | null;
    guestId: string | null;
    unreadByAdmin: number;
    unreadByUser: number;
  };
}

export interface MessageAckEvent {
  conversationId: string;
  messageIds: string[];
  status: 'delivered' | 'read';
  by: 'admin' | 'user';
  at: string;
}

export interface DeviceInfo {
  type?: 'mobile' | 'tablet' | 'desktop';
  os?: string;
  browser?: string;
  viewport?: { w: number; h: number };
}

export interface TypingEvent {
  conversationId: string;
  isTyping: boolean;
  from: 'admin' | 'user';
}

interface UseChatSocketArgs {
  enabled?: boolean;
  onMessage?: (e: IncomingChatMessage) => void;
  onForceOpen?: () => void;
  onForceClose?: () => void;
  onAck?: (e: MessageAckEvent) => void;
  onTyping?: (e: TypingEvent) => void;
}

/** Detectează device-ul din window (fallback peste user-agent server-side). */
function detectDevice(): DeviceInfo {
  if (typeof window === 'undefined') return {};
  const ua = navigator.userAgent;
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
  return {
    type,
    os,
    browser,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}

/**
 * Conexiune WebSocket pentru chat user (sau guest).
 * Trimite presence heartbeat (10s) + reacționează la page changes.
 */
export function useChatSocket({ enabled = true, onMessage, onForceOpen, onForceClose, onAck, onTyping }: UseChatSocketArgs = {}) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const lastPathRef = useRef<string | null>(null);
  const chatOpenRef = useRef<boolean>(false);

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

    const sendHeartbeat = () => {
      if (typeof window === 'undefined') return;
      socket.emit('presence:heartbeat', {
        path: window.location.pathname + window.location.search,
        title: document.title,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        chatOpen: chatOpenRef.current,
        device: detectDevice(),
      });
    };

    socket.on('connect', () => {
      setConnected(true);
      sendHeartbeat();
    });
    socket.on('disconnect', () => setConnected(false));
    if (onMessage) socket.on('chat:message', onMessage);
    if (onForceOpen) socket.on('chat:force_open', onForceOpen);
    if (onForceClose) socket.on('chat:force_close', onForceClose);
    if (onAck) socket.on('chat:message:ack', onAck);
    if (onTyping) socket.on('chat:typing', onTyping);

    // Heartbeat la 15s (suficient pentru presence; idle aging < 30s la admin)
    const hbInterval = window.setInterval(sendHeartbeat, 15_000);

    // Detect page change via popstate + interval polling (Next.js app router nu emite event)
    const checkPath = () => {
      if (typeof window === 'undefined') return;
      const path = window.location.pathname + window.location.search;
      if (lastPathRef.current && lastPathRef.current !== path) {
        socket.emit('presence:page_change', {
          from: lastPathRef.current,
          to: path,
          title: document.title,
        });
      }
      lastPathRef.current = path;
    };
    checkPath();
    const pathInterval = window.setInterval(checkPath, 1_000);
    window.addEventListener('popstate', checkPath);

    // Resend heartbeat când userul revine pe tab (asigură online imediat)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(hbInterval);
      window.clearInterval(pathInterval);
      window.removeEventListener('popstate', checkPath);
      document.removeEventListener('visibilitychange', onVisibility);
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    connected,
    /** Anunță serverul că widgetul s-a deschis/închis. */
    setChatOpen: (open: boolean) => {
      chatOpenRef.current = open;
      socketRef.current?.emit('presence:chat_toggle', { open });
    },
    /** Confirmă receipt sau citire pentru o listă de mesaje admin. */
    ack: (messageIds: string[], status: 'delivered' | 'read') => {
      if (!messageIds.length) return;
      socketRef.current?.emit('message:ack', { messageIds, status });
    },
    /** Trimite eveniment typing (admin sau client). conversationId îl știe gateway-ul din identity. */
    sendTyping: (conversationId: string, isTyping: boolean) => {
      socketRef.current?.emit('chat:typing', { conversationId, isTyping });
    },
  };
}
