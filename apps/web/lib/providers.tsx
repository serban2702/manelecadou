'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  api,
  ensureGuestSession,
  getAccessToken,
  setAccessToken,
  type MeGuest,
  type MeUser,
} from './api';

interface SessionState {
  ready: boolean;
  guest: MeGuest | null;
  user: MeUser | null;
  freeDemoUsed: boolean;
  email: string | null;
  refresh: () => Promise<void>;
  logout: () => void;
  setToken: (token: string) => Promise<void>;
}

const SessionCtx = createContext<SessionState | null>(null);

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession outside Providers');
  return ctx;
}

function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState<MeGuest | null>(null);
  const [user, setUser] = useState<MeUser | null>(null);

  const refresh = async () => {
    try {
      await ensureGuestSession();
      if (getAccessToken()) {
        try {
          const me = await api.authMe();
          setUser(me);
        } catch {
          setAccessToken(null);
          setUser(null);
        }
      }
      const g = await api.guestMe();
      setGuest(g);
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      ready,
      guest,
      user,
      freeDemoUsed: user ? user.freeDemoUsed : (guest?.freeDemoUsed ?? false),
      email: user?.email ?? guest?.email ?? null,
      refresh,
      logout: () => {
        setAccessToken(null);
        setUser(null);
        refresh();
      },
      setToken: async (token: string) => {
        setAccessToken(token);
        await refresh();
      },
    }),
    [ready, guest, user],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}

export function useGenerationPolling(id: string | null) {
  return useQuery({
    queryKey: ['generation', id],
    queryFn: () => api.getGeneration(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 2000;
      if (data.status === 'succeeded' || data.status === 'failed') return false;
      return 2000;
    },
  });
}
