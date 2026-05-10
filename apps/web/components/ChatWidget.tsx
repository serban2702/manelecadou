'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSession } from '@/lib/providers';
import { useChatSocket } from '@/lib/chat-socket';
import { useSite } from '@/lib/site-context';

export function ChatWidget() {
  const { ready, email } = useSession();
  const site = useSite();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['chat-me'],
    queryFn: () => api.chatMe(),
    enabled: ready,
    // Backup polling în caz că WS pică sau e blocat (firewall/proxy).
    refetchInterval: open ? 30_000 : 60_000,
    staleTime: 0,
  });

  // WebSocket — canal primar realtime (presence + push messages).
  useChatSocket({
    enabled: ready,
    onMessage: () => {
      qc.invalidateQueries({ queryKey: ['chat-me'] });
    },
  });

  const messages = data?.messages ?? [];
  const unread = open ? 0 : (data?.conversation.unreadByUser ?? 0);
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
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Deschide chat"
          style={{
            position: 'fixed', right: 18, bottom: 18, zIndex: 50,
            width: 58, height: 58, borderRadius: '50%',
            background: 'linear-gradient(180deg,#fff5cc,#ffe28a 30%,#f1c84d 60%,#b07c1e)',
            color: '#2a1a04', border: 'none', cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(241,200,77,0.45)',
            display: 'grid', placeItems: 'center', fontSize: 26,
          }}
          data-hint="true"
          data-hint-label="Chat cu noi"
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
                💬 Suport {site.name}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)' }}>
                Răspundem în câteva minute
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Închide chat"
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
                Salut! Scrie-ne orice — întrebare, problemă, idee.
                {!email && (
                  <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,245,220,0.35)' }}>
                    Tip: lasă-ți email-ul pe pagina de generator ca să-ți răspundem și pe email.
                  </div>
                )}
              </div>
            )}
            {messages.map((m) => {
              const isMine = m.authorRole === 'user';
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
                      👑 Admin
                    </div>
                  )}
                  {m.body}
                  <div
                    style={{
                      fontSize: 10,
                      marginTop: 4,
                      opacity: 0.6,
                      color: isMine ? '#2a1a04' : 'rgba(255,245,220,0.4)',
                      textAlign: 'right',
                    }}
                  >
                    {new Date(m.createdAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })}
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
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Scrie un mesaj..."
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
