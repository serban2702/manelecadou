'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import { api } from '@/lib/api';
import { useSession } from '@/lib/providers';
import { useChatSocket, type MessageAckEvent, type TypingEvent } from '@/lib/chat-socket';
import { useSite } from '@/lib/site-context';
import { track } from '@/lib/tracking';

/** Sunet scurt sintetic via WebAudio — fără dependențe externe sau fișiere. */
function playPing() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.32);
    o.onended = () => ctx.close().catch(() => {});
  } catch {
    /* autoplay blocked — fallback la badge + tab flash */
  }
}

/** Desenează un dot roșu peste favicon-ul curent când unread > 0. */
function useFaviconDot(unread: number) {
  const originalRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const link =
      (document.querySelector("link[rel='icon']") as HTMLLinkElement | null) ||
      (document.querySelector("link[rel='shortcut icon']") as HTMLLinkElement | null);
    if (!link) return;
    if (originalRef.current === null) originalRef.current = link.href;

    if (unread <= 0) {
      if (originalRef.current) link.href = originalRef.current;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      // Dot roșu cu ring
      const r = 18;
      const cx = size - r - 2;
      const cy = r + 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#e11d48';
      ctx.fill();
      try {
        link.href = canvas.toDataURL('image/png');
      } catch {
        /* taint canvas — fallback fără dot */
      }
    };
    img.onerror = () => {
      /* CORS fail — skip silently */
    };
    img.src = originalRef.current ?? link.href;
  }, [unread]);
}

/** Alternează titlul tab-ului între original și „(N) — Mesaj nou" până userul revine pe tab. */
function useTabTitleFlash(unread: number, brand: string) {
  const originalRef = useRef<string>('');
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!originalRef.current) originalRef.current = document.title;

    if (unread <= 0 || document.visibilityState === 'visible') {
      document.title = originalRef.current || document.title;
      return;
    }

    const original = originalRef.current;
    const alt = `(${unread}) 💬 Mesaj nou — ${brand}`;
    let flip = false;
    const id = window.setInterval(() => {
      flip = !flip;
      document.title = flip ? alt : original;
    }, 1100);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearInterval(id);
        document.title = original;
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      document.title = original;
    };
  }, [unread, brand]);
}

export function ChatWidget() {
  const { ready, email } = useSession();
  const site = useSite();
  const t = useTranslations('chat');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [lastMsgId, setLastMsgId] = useState<string | null>(null);
  const [adminTyping, setAdminTyping] = useState(false);
  const adminTypingExpiry = useRef<number>(0);
  const userTypingLastEmit = useRef<number>(0);
  const userTypingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['chat-me'],
    queryFn: () => api.chatMe(),
    enabled: ready,
    refetchInterval: open ? 30_000 : 60_000,
    staleTime: 0,
  });

  const messages = data?.messages ?? [];
  const unread = open ? 0 : (data?.conversation.unreadByUser ?? 0);

  // WebSocket — primar realtime.
  const handleMessage = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['chat-me'] });
  }, [qc]);

  const handleForceOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const handleForceClose = useCallback(() => {
    setOpen(false);
  }, []);

  /** Admin a editat un mesaj — actualizez local cache imediat. */
  const handleMessageUpdated = useCallback((ev: { message: { id: string; body: string; editedAt?: string | null } }) => {
    qc.setQueryData<{ messages: Array<{ id: string; body: string; editedAt?: string | null }>; conversation: unknown } | undefined>(
      ['chat-me'],
      (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === ev.message.id ? { ...m, body: ev.message.body, editedAt: ev.message.editedAt ?? new Date().toISOString() } : m,
          ),
        };
      },
    );
  }, [qc]);

  /** Admin a șters un mesaj — îl scot din listă instant. */
  const handleMessageDeleted = useCallback((ev: { messageId: string }) => {
    qc.setQueryData<{ messages: Array<{ id: string }>; conversation: unknown } | undefined>(
      ['chat-me'],
      (prev) => {
        if (!prev) return prev;
        return { ...prev, messages: prev.messages.filter((m) => m.id !== ev.messageId) };
      },
    );
  }, [qc]);

  const handleAck = useCallback((ev: MessageAckEvent) => {
    // Update local cache pentru a reflecta delivered/read pe mesajele user → admin
    qc.setQueryData<{ messages: Array<{ id: string; deliveredAt?: string | null; readAt?: string | null }>; conversation: unknown } | undefined>(
      ['chat-me'],
      (prev) => {
        if (!prev) return prev;
        const set = new Set(ev.messageIds);
        const messages = prev.messages.map((m) => {
          if (!set.has(m.id)) return m;
          if (ev.status === 'delivered') return { ...m, deliveredAt: m.deliveredAt ?? ev.at };
          return { ...m, deliveredAt: m.deliveredAt ?? ev.at, readAt: m.readAt ?? ev.at };
        });
        return { ...prev, messages };
      },
    );
  }, [qc]);

  const handleTyping = useCallback((e: TypingEvent) => {
    if (e.from !== 'admin') return;
    if (e.isTyping) {
      adminTypingExpiry.current = Date.now() + 4500;
      setAdminTyping(true);
    } else {
      setAdminTyping(false);
    }
  }, []);

  const { setChatOpen, ack, sendTyping } = useChatSocket({
    enabled: ready,
    onMessage: handleMessage,
    onMessageUpdated: handleMessageUpdated,
    onMessageDeleted: handleMessageDeleted,
    onForceOpen: handleForceOpen,
    onForceClose: handleForceClose,
    onAck: handleAck,
    onTyping: handleTyping,
  });

  // Auto-cleanup admin typing după expirare
  useEffect(() => {
    if (!adminTyping) return;
    const t = setInterval(() => {
      if (Date.now() > adminTypingExpiry.current) setAdminTyping(false);
    }, 500);
    return () => clearInterval(t);
  }, [adminTyping]);

  /** Emit typing user (max 1/sec) + stop auto după 2s fără activitate. */
  function emitUserTyping(text: string) {
    const conv = data?.conversation?.id;
    if (!conv || text.length === 0) return;
    const now = Date.now();
    if (now - userTypingLastEmit.current > 1000) {
      sendTyping(conv, true);
      userTypingLastEmit.current = now;
    }
    if (userTypingStopTimer.current) clearTimeout(userTypingStopTimer.current);
    userTypingStopTimer.current = setTimeout(() => {
      if (conv) sendTyping(conv, false);
    }, 2000);
  }

  // Detectează mesaj nou de la admin → sunet + pulse + (titlu flash via hook)
  const lastAdminMsg = useMemo(
    () => [...messages].reverse().find((m) => m.authorRole === 'admin'),
    [messages],
  );

  useEffect(() => {
    if (!lastAdminMsg) return;
    if (lastAdminMsg.id === lastMsgId) return;
    setLastMsgId(lastAdminMsg.id);
    // Skip pe primul render (când încărcăm istoricul) — flag pe lastMsgId care era null
    if (lastMsgId === null) return;
    if (!open) {
      playPing();
      setPulsing(true);
      window.setTimeout(() => setPulsing(false), 3500);
    }
  }, [lastAdminMsg, lastMsgId, open]);

  useTabTitleFlash(unread, site.name);
  useFaviconDot(unread);

  // ACK delivered pentru mesajele admin nou văzute (când le primim — chiar fără să deschidem)
  useEffect(() => {
    const undelivered = messages.filter(
      (m) => m.authorRole === 'admin' && !('deliveredAt' in m ? (m as { deliveredAt?: string | null }).deliveredAt : null),
    );
    if (undelivered.length === 0) return;
    ack(undelivered.map((m) => m.id), 'delivered');
  }, [messages, ack]);

  // ACK read când userul deschide chatul
  useEffect(() => {
    if (!open) return;
    const unreadIds = messages
      .filter((m) => m.authorRole === 'admin' && !('readAt' in m ? (m as { readAt?: string | null }).readAt : null))
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    ack(unreadIds, 'read');
  }, [open, messages, ack]);

  // Anunță serverul de starea chat-ului
  useEffect(() => {
    setChatOpen(open);
  }, [open, setChatOpen]);

  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [messages.length, open]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await api.chatSend(text);
      setDraft('');
      qc.invalidateQueries({ queryKey: ['chat-me'] });
    } catch {
      // noop
    } finally {
      setSending(false);
    }
  }

  if (!ready) return null;

  return (
    <>
      {/* Keyframes pentru pulse-ul butonului */}
      <style jsx global>{`
        @keyframes chat-pulse-ring {
          0% { box-shadow: 0 8px 24px rgba(241,200,77,0.45), 0 0 0 0 rgba(241,200,77,0.55); }
          70% { box-shadow: 0 8px 24px rgba(241,200,77,0.45), 0 0 0 18px rgba(241,200,77,0); }
          100% { box-shadow: 0 8px 24px rgba(241,200,77,0.45), 0 0 0 0 rgba(241,200,77,0); }
        }
        @keyframes chat-pulse-soft {
          0% { box-shadow: 0 8px 24px rgba(241,200,77,0.45), 0 0 0 0 rgba(241,200,77,0.35); }
          70% { box-shadow: 0 8px 24px rgba(241,200,77,0.45), 0 0 0 12px rgba(241,200,77,0); }
          100% { box-shadow: 0 8px 24px rgba(241,200,77,0.45), 0 0 0 0 rgba(241,200,77,0); }
        }
        @keyframes chat-jiggle {
          0%,100% { transform: rotate(0deg); }
          15% { transform: rotate(-12deg) scale(1.08); }
          30% { transform: rotate(12deg) scale(1.08); }
          45% { transform: rotate(-8deg); }
          60% { transform: rotate(8deg); }
          75% { transform: rotate(-4deg); }
        }
        /* Burst — mesaj NOU venit + chat închis (3s puternic) */
        .chat-btn-burst { animation: chat-pulse-ring 1.2s ease-out 3, chat-jiggle 0.9s ease-in-out 3; }
        /* Continuu — atâta timp cât există unread + chat închis (subtil) */
        .chat-btn-unread { animation: chat-pulse-soft 1.8s ease-out infinite; }
      `}</style>

      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={t('openAria')}
          className={[
            pulsing ? 'chat-btn-burst' : '',
            unread > 0 && !pulsing ? 'chat-btn-unread' : '',
          ].filter(Boolean).join(' ')}
          style={{
            position: 'fixed', right: 18, bottom: 18, zIndex: 50,
            width: 58, height: 58, borderRadius: '50%',
            background: 'linear-gradient(180deg,#fff5cc,#ffe28a 30%,#f1c84d 60%,#b07c1e)',
            color: '#2a1a04', border: 'none', cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(241,200,77,0.45)',
            display: 'grid', placeItems: 'center', fontSize: 26,
          }}
          data-hint="true"
          data-hint-label={t('hintLabel')}
        >
          💬
          {unread > 0 && (
            <span
              style={{
                position: 'absolute', top: -4, right: -4,
                background: 'var(--rose)', color: 'white',
                fontSize: 11, fontWeight: 800, padding: '2px 6px',
                borderRadius: 999, minWidth: 18, textAlign: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              }}
            >
              {unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div
          style={{
            position: 'fixed',
            right: 18,
            bottom: 18,
            zIndex: 50,
            width: 'min(92vw, 360px)',
            height: 'min(80vh, 520px)',
            background: 'linear-gradient(180deg, #170a0a, #0c0707)',
            border: '1px solid var(--gold)',
            borderRadius: 14,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 14px',
              background: 'linear-gradient(135deg, rgba(90,13,24,0.5), rgba(40,12,18,0.5))',
              borderBottom: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}
          >
            <div>
              <div className="serif gold-text" style={{ fontSize: 14, fontWeight: 900 }}>
                💬 {t('headerTitle', { brand: site.name })}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)' }}>
                {t('headerSub')}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label={t('closeAria')}
              style={{
                background: 'transparent', border: 'none',
                color: 'rgba(255,245,220,0.5)', cursor: 'pointer', fontSize: 22,
              }}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scroller}
            style={{
              flex: 1, overflowY: 'auto', padding: 12,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  margin: 'auto', textAlign: 'center', padding: 16,
                  color: 'rgba(255,245,220,0.5)', fontSize: 13,
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
                {t('greeting')}
                {!email && (
                  <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,245,220,0.35)' }}>
                    {t('emailHint')}
                  </div>
                )}
              </div>
            )}
            {messages.map((m) => {
              const isMine = m.authorRole === 'user';
              const mm = m as typeof m & {
                deliveredAt?: string | null;
                readAt?: string | null;
                messageType?: string;
                payload?: { amount?: number; currency?: string; description?: string; checkoutUrl?: string; premium?: boolean } | null;
                attachmentUrl?: string | null;
                attachmentMime?: string | null;
                attachmentName?: string | null;
              };
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isMine ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: isMine
                      ? 'linear-gradient(180deg,#ffe28a,#b07c1e)'
                      : m.authorRole === 'admin'
                        ? 'rgba(241,200,77,0.1)'
                        : 'rgba(255,255,255,0.04)',
                    color: isMine ? '#2a1a04' : 'var(--cream)',
                    fontSize: 13,
                    lineHeight: 1.5,
                    border: isMine ? 'none' : '1px solid var(--line)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.authorRole === 'admin' && (
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--gold)', marginBottom: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      👑 {t('adminLabel')}
                    </div>
                  )}
                  {mm.attachmentUrl && mm.attachmentMime?.startsWith('image/') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mm.attachmentUrl}
                      alt={mm.attachmentName ?? 'imagine'}
                      style={{
                        maxWidth: '100%',
                        maxHeight: 220,
                        borderRadius: 8,
                        marginBottom: 6,
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                  )}
                  {mm.attachmentUrl && mm.attachmentMime === 'application/pdf' && (
                    <a
                      href={mm.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        gap: 8,
                        padding: 8,
                        marginBottom: 6,
                        borderRadius: 6,
                        background: 'rgba(0,0,0,0.25)',
                        color: 'inherit',
                        textDecoration: 'none',
                        alignItems: 'center',
                        fontSize: 12,
                      }}
                    >
                      📎 {mm.attachmentName ?? 'document.pdf'}
                    </a>
                  )}
                  {mm.messageType === 'payment_link' && mm.payload && (
                    (() => {
                      const p = mm.payload as {
                        checkoutUrl?: string;
                        description?: string;
                        amount?: number;
                        currency?: string;
                        status?: 'paid' | 'failed';
                        generationId?: string;
                        paymentId?: string;
                      };
                      const paid = p.status === 'paid';
                      const cardBase = {
                        display: 'block',
                        padding: 12,
                        marginBottom: 6,
                        borderRadius: 10,
                        color: '#fff5cc',
                        textDecoration: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      } as const;
                      if (paid) {
                        return (
                          <div
                            style={{
                              ...cardBase,
                              background: 'linear-gradient(135deg, #0f3d2e, #052016)',
                              border: '1px solid #10b981',
                            }}
                          >
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#10b981' }}>
                              ✓ Plătit
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, margin: '2px 0' }}>
                              {p.description ?? 'Manea personalizată'}
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: '#34d399' }}>
                              {((p.amount ?? 0) / 100).toFixed(2)} {p.currency ?? 'RON'}
                            </div>
                            {p.generationId && (
                              <a
                                href={`/m/${p.generationId}`}
                                style={{
                                  display: 'block',
                                  marginTop: 8,
                                  background: '#10b981',
                                  color: '#fff',
                                  padding: '6px 12px',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 800,
                                  textAlign: 'center',
                                  textDecoration: 'none',
                                }}
                              >
                                🎵 Vezi melodia →
                              </a>
                            )}
                          </div>
                        );
                      }
                      return (
                        <a
                          href={p.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            // InitiateCheckout — fire DOAR la CLICK efectiv pe link
                            // (cerere user 2026-05-28). NU pe „AI a trimis linkul" —
                            // semnal de intent real de plată, nu doar pasare prin chat.
                            // event_id = paymentId pentru dedup cu Purchase server-side.
                            try {
                              track('InitiateCheckout', {
                                value: (p.amount ?? 0) / 100,
                                currency: p.currency ?? 'RON',
                                content_id: p.paymentId ?? p.generationId ?? undefined,
                                content_name: p.description ?? 'Manea personalizată',
                                content_type: 'product',
                                event_id: p.paymentId ? `init-${p.paymentId}` : undefined,
                              });
                            } catch {
                              /* tracking nu blochează navigation */
                            }
                          }}
                          style={{
                            ...cardBase,
                            background: 'linear-gradient(135deg, #5b0d18, #2b0710)',
                            border: '1px solid var(--gold)',
                          }}
                        >
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                            💳 Plată sigură
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, margin: '2px 0' }}>
                            {p.description ?? 'Manea personalizată'}
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: '#ffe28a' }}>
                            {((p.amount ?? 0) / 100).toFixed(2)} {p.currency ?? 'RON'}
                          </div>
                          <div
                            style={{
                              marginTop: 8,
                              background: 'linear-gradient(180deg,#ffe28a,#b07c1e)',
                              color: '#2a1a04',
                              padding: '6px 12px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 800,
                              textAlign: 'center',
                            }}
                          >
                            Plătește acum →
                          </div>
                        </a>
                      );
                    })()
                  )}
                  {mm.messageType === 'song_preview' && mm.payload && (
                    (() => {
                      const p = mm.payload as {
                        generationId?: string;
                        audioUrl?: string;
                        recipientName?: string;
                        unlocked?: boolean;
                        pending?: boolean;
                      };
                      const href = p.generationId ? `/m/${p.generationId}` : (p.audioUrl ?? '#');
                      return (
                        <a
                          href={href}
                          style={{
                            display: 'block',
                            padding: 12,
                            marginBottom: 6,
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #2a1a04, #0a0606)',
                            border: '1px solid var(--gold)',
                            color: '#fff5cc',
                            textDecoration: 'none',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                          }}
                        >
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                            {p.pending ? '🎶 Pagina manelei (în lucru)' : p.unlocked ? '✓ Manea deblocată' : '🎵 Maneaua ta'}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, margin: '4px 0 8px' }}>
                            {p.recipientName ? `Pentru ${p.recipientName}` : 'Maneaua personalizată'}
                          </div>
                          <div
                            style={{
                              background: 'linear-gradient(180deg,#ffe28a,#b07c1e)',
                              color: '#2a1a04',
                              padding: '8px 12px',
                              borderRadius: 6,
                              fontSize: 13,
                              fontWeight: 800,
                              textAlign: 'center',
                            }}
                          >
                            {p.pending ? 'Deschide pagina →' : 'Ascultă maneaua →'}
                          </div>
                        </a>
                      );
                    })()
                  )}
                  {/* nu afișa "body" generic pentru payment_link / song_preview / image (ar fi redundant) */}
                  {!(mm.messageType === 'payment_link' || mm.messageType === 'song_preview' || (mm.attachmentUrl && (!m.body || m.body === '📷 Imagine'))) && m.body}
                  <div
                    style={{
                      fontSize: 10,
                      marginTop: 4,
                      opacity: 0.65,
                      color: isMine ? '#2a1a04' : 'rgba(255,245,220,0.4)',
                      textAlign: 'right',
                      display: 'flex',
                      gap: 4,
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                    }}
                  >
                    <span>
                      {new Date(m.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      {(mm as { editedAt?: string | null }).editedAt && (
                        <span style={{ marginLeft: 4, opacity: 0.7, fontStyle: 'italic' }}>(editat)</span>
                      )}
                    </span>
                    {isMine && (
                      <ReceiptIcon delivered={!!mm.deliveredAt} read={!!mm.readAt} dark />
                    )}
                  </div>
                </div>
              );
            })}
            {adminTyping && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 12,
                  background: 'rgba(241,200,77,0.1)',
                  border: '1px solid var(--line)',
                  fontSize: 11,
                  color: 'var(--gold)',
                  fontStyle: 'italic',
                }}
              >
                <span style={{ display: 'inline-flex', gap: 2 }}>
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </span>
                <span>Operatorul scrie...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div
            style={{
              padding: 10,
              borderTop: '1px solid var(--line)',
              background: 'rgba(0,0,0,0.3)',
              display: 'flex', gap: 6,
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                emitUserTyping(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={t('placeholder')}
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                color: 'var(--cream)',
                fontFamily: 'inherit',
                fontSize: 13,
                outline: 'none',
                maxHeight: 120,
              }}
            />
            <button
              onClick={send}
              disabled={!draft.trim() || sending}
              className="btn btn-gold btn-sm"
              style={{ padding: '8px 14px' }}
            >
              {sending ? '...' : '→'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Iconiță delivered/seen — 1 check = sent, 2 checks = delivered, 2 checks gold = read. */
function ReceiptIcon({ delivered, read, dark }: { delivered: boolean; read: boolean; dark?: boolean }) {
  const color = read ? '#0066ff' : dark ? '#2a1a04' : 'rgba(255,245,220,0.55)';
  const opacity = read ? 1 : delivered ? 0.9 : 0.55;
  if (!delivered && !read) {
    // single check
    return (
      <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style={{ opacity, marginLeft: 2 }}>
        <path d="M1 5l3.5 3.5L13 1" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" fill="none" style={{ opacity, marginLeft: 2 }}>
      <path d="M1 5l3.5 3.5L13 1" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 5l3.5 3.5L18 1" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
