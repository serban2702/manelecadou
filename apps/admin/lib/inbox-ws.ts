'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAdminToken } from './api';

const URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:1501';

interface NewMail { accountId: string; messageId: string }
interface SuggestionReady { messageId: string; suggestionId: string }
interface AccountStatus { accountId: string; lastError: string | null }

interface Opts {
  onNewMessage?: (e: NewMail) => void;
  onSuggestion?: (e: SuggestionReady) => void;
  onAccountStatus?: (e: AccountStatus) => void;
}

export function useMailSocket(opts: Opts) {
  const [connected, setConnected] = useState(false);
  const cb = useRef(opts);
  cb.current = opts;

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    const socket: Socket = io(`${URL}/mail`, {
      auth: { token, role: 'admin' },
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('mail:new', (e: NewMail) => cb.current.onNewMessage?.(e));
    socket.on('mail:suggestion', (e: SuggestionReady) => cb.current.onSuggestion?.(e));
    socket.on('mail:account', (e: AccountStatus) => cb.current.onAccountStatus?.(e));
    return () => {
      socket.disconnect();
    };
  }, []);

  return { connected };
}
