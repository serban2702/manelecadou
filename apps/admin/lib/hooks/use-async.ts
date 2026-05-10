'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  /** Alias pentru `loading`, pentru paritate cu API-ul TanStack Query. */
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  setData: (next: T | null | ((prev: T | null) => T | null)) => void;
}

export interface UseAsyncOptions {
  /** Dacă false, nu se rulează la mount; trebuie chemat refetch() manual. */
  enabled?: boolean;
  /** Reîmprospătare automată la fiecare N ms. */
  refetchInterval?: number;
}

/**
 * Înlocuitor pentru `useQuery` din TanStack — fetch async cu state, loading, error.
 *
 * @param fetcher  Funcția care întoarce un Promise<T>. Ar trebui să fie stable
 *                 (declarată în afara componentei, sau memo-izată cu useCallback).
 * @param deps     Re-rulează fetcher-ul când se schimbă (la fel ca un useEffect).
 */
export function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
  opts: UseAsyncOptions = {},
): UseAsyncResult<T> {
  const { enabled = true, refetchInterval } = opts;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (mountedRef.current) setData(result);
    } catch (e) {
      if (mountedRef.current) setError(e as Error);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) void run();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    if (!enabled || !refetchInterval) return;
    const id = setInterval(() => {
      void run();
    }, refetchInterval);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refetchInterval, ...deps]);

  return { data, loading, isLoading: loading, error, refetch: run, setData };
}

export interface UseAsyncCallbackResult<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult>;
  loading: boolean;
  error: Error | null;
}

/**
 * Pentru mutații (POST/PATCH/DELETE) — înlocuiește `useMutation`.
 *
 * @example
 * const { run: archive, loading } = useAsyncCallback((id: string) => MailApi.archive(id));
 * await archive(messageId);
 */
export function useAsyncCallback<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): UseAsyncCallbackResult<TArgs, TResult> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: TArgs): Promise<TResult> => {
    setLoading(true);
    setError(null);
    try {
      return await fnRef.current(...args);
    } catch (e) {
      setError(e as Error);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { run, loading, error };
}
