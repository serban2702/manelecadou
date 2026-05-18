'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Crown, MessageCircle, Send, User, Wifi, WifiOff } from 'lucide-react';
import { ChatApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks/use-async';
import { useAdminChatSocket, type PresenceEvent } from '@/lib/chat-socket';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import { useSitesMap } from '@/lib/hooks/use-sites-map';
import { SiteBadge } from '@/components/site-badge';
import { AssistantPanel } from '@/components/ai-assistant/AssistantPanel';
import { TranslationToggle } from '@/components/inbox/TranslationToggle';

export default function AdminChatPage() {
  const { isAllSelected } = useSitesMap();
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [livePresence, setLivePresence] = useState<Map<string, boolean>>(new Map());

  const { data: convs, refetch: refetchConvs } = useAsync(
    () => ChatApi.list(),
    [],
    { refetchInterval: 30_000 },
  );

  const { data: thread, refetch: refetchThread } = useAsync(
    () => active ? ChatApi.thread(active) : Promise.resolve(null as never),
    [active],
    { enabled: !!active, refetchInterval: 30_000 },
  );

  const { connected: wsConnected, joinConversation, leaveConversation } = useAdminChatSocket({
    onMessage: () => {
      refetchConvs();
      refetchThread();
    },
    onPresence: (e: PresenceEvent) => {
      setLivePresence((prev) => {
        const next = new Map(prev);
        if (e.userId) next.set(`u:${e.userId}`, e.online);
        if (e.guestId) next.set(`g:${e.guestId}`, e.online);
        return next;
      });
      refetchConvs();
    },
    onSnapshot: (snap) => {
      setLivePresence(() => {
        const m = new Map<string, boolean>();
        snap.users.forEach((u) => m.set(`u:${u}`, true));
        snap.guests.forEach((g) => m.set(`g:${g}`, true));
        return m;
      });
    },
  });

  /** Re-join WS room când schimbi conversația activă. */
  useEffect(() => {
    if (!active) return;
    joinConversation(active);
    return () => leaveConversation(active);
  }, [active, joinConversation, leaveConversation]);

  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [thread?.messages.length]);

  async function send() {
    if (!active || !draft.trim()) return;
    await ChatApi.reply(active, draft.trim());
    setDraft('');
    refetchThread();
    refetchConvs();
  }

  /** Suprapunem presence-ul live (din WS) peste cel din răspunsul HTTP. */
  const list = useMemo(() => {
    const base = convs ?? [];
    return base
      .map((c) => {
        const liveOnline =
          (c.userId && livePresence.get(`u:${c.userId}`)) ||
          (c.guestId && livePresence.get(`g:${c.guestId}`)) ||
          undefined;
        return liveOnline === undefined ? c : { ...c, online: liveOnline as boolean };
      })
      .sort((a, b) => {
        // Re-aplicăm bucket sort în client (ordering live).
        const bucket = (x: typeof a) => {
          const hasMsgs = !!x.lastMessageAt;
          const hasUnread = x.unreadByAdmin > 0;
          if (x.online && hasUnread) return 0;
          if (x.online && hasMsgs) return 1;
          if (x.online && !hasMsgs) return 2;
          if (!x.online && hasUnread) return 3;
          if (!x.online && hasMsgs) return 4;
          return 5;
        };
        const ba = bucket(a);
        const bb = bucket(b);
        if (ba !== bb) return ba - bb;
        if (a.unreadByAdmin !== b.unreadByAdmin) return b.unreadByAdmin - a.unreadByAdmin;
        const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bt - at;
      });
  }, [convs, livePresence]);

  const conversationLabel = (c: { email: string | null; userId: string | null; guestId: string | null }) =>
    c.email ?? (c.userId ? `user:${c.userId.slice(0, 8)}` : `guest:${c.guestId?.slice(0, 8)}`);

  return (
    <div>
      <PageHeader
        title="Chat"
        description={isAllSelected ? 'Conversații cross-tenant · selectează o conversație ca să vezi pe ce site e' : 'Conversații live cu utilizatorii · presence prin WebSocket'}
        actions={
          <Badge variant={wsConnected ? 'success' : 'muted'} className="gap-1.5">
            {wsConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {wsConnected ? 'Live' : 'Offline'}
          </Badge>
        }
      />

      <div className="flex gap-4 h-[calc(100vh-200px)] min-h-[500px]">
        <aside className="w-72 shrink-0 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Conversații
            </span>
            <Badge variant="muted">{list.length}</Badge>
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.length === 0 ? (
              <div className="p-6 text-muted-foreground text-sm text-center">
                Nici o conversație încă.
              </div>
            ) : (
              list.map((c) => {
                const sel = c.id === active;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActive(c.id)}
                    className={cn(
                      'w-full text-left p-3 border-b border-border/50 hover:bg-secondary/50 transition',
                      sel && 'bg-primary/10 hover:bg-primary/15',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                        <PresenceDot online={c.online} />
                        {c.userId ? (
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border border-dashed border-muted-foreground" />
                        )}
                        <span className="truncate">{conversationLabel(c)}</span>
                      </div>
                      {c.unreadByAdmin > 0 && (
                        <Badge variant="destructive" className="h-5 min-w-[20px] justify-center px-1.5">
                          {c.unreadByAdmin}
                        </Badge>
                      )}
                    </div>
                    {/* Site badge — vizibil mereu (păstrăm orientarea cross-tenant chiar și
                        când selectorul e pe un site, ca să nu te confunzi când scimbi). */}
                    <div className="mt-1">
                      <SiteBadge siteId={c.siteId} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center justify-between gap-2">
                      <span className={c.online ? 'text-success font-medium' : ''}>
                        {c.online
                          ? 'Online'
                          : c.lastSeenAt
                            ? `acum ${formatDistanceToNowStrict(new Date(c.lastSeenAt), { locale: ro })}`
                            : c.status}
                      </span>
                      <span>
                        {c.lastMessageAt
                          ? formatDistanceToNowStrict(new Date(c.lastMessageAt), {
                              locale: ro,
                              addSuffix: true,
                            })
                          : 'fără mesaje'}
                      </span>
                    </div>
                    {c.ip && (
                      <div className="mt-1">
                        <code
                          className="text-[10px] font-mono px-1 py-0.5 rounded bg-secondary/40 text-muted-foreground"
                          title="Ultimul IP cunoscut"
                        >
                          {c.ip}
                        </code>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex-1 min-w-0 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          {!active ? (
            <div className="m-auto">
              <Empty
                icon={<MessageCircle className="h-5 w-5" />}
                title="Selectează o conversație"
                description="Alege din stânga pentru a vedea mesajele."
                className="border-0 bg-transparent"
              />
            </div>
          ) : !thread ? (
            <div className="m-auto text-muted-foreground text-sm">Se încarcă...</div>
          ) : (
            <>
              <header className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <PresenceDot online={thread.conversation.online} />
                    {conversationLabel(thread.conversation)}
                    <SiteBadge siteId={thread.conversation.siteId} />
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    {thread.conversation.userId ? (
                      <Badge variant="muted">user logat</Badge>
                    ) : (
                      <Badge variant="muted">guest</Badge>
                    )}
                    {thread.conversation.online ? (
                      <span className="text-success font-medium">● Online acum</span>
                    ) : thread.conversation.lastSeenAt ? (
                      <span>
                        Văzut ultima dată acum{' '}
                        {formatDistanceToNowStrict(new Date(thread.conversation.lastSeenAt), { locale: ro })}
                      </span>
                    ) : (
                      <span>fără activitate</span>
                    )}
                    <span>· {thread.conversation.status}</span>
                    {thread.conversation.ip && (
                      <>
                        <span>·</span>
                        <code
                          className="text-[10px] font-mono px-1 py-0.5 rounded bg-secondary/40"
                          title="Ultimul IP cunoscut (din analytics_sessions)"
                        >
                          {thread.conversation.ip}
                        </code>
                      </>
                    )}
                  </div>
                </div>
              </header>

              <div ref={scroller} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {thread.messages.length === 0 && (
                  <div className="m-auto text-muted-foreground text-sm">Mesaj nul.</div>
                )}
                {thread.messages.map((m) => (
                  <ChatBubble key={m.id} m={m} />
                ))}
              </div>

              <div className="p-3 border-t border-border bg-background/40 flex gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  /* Notă: backend-ul auto-traduce RO → limba clientului la trimitere
                     (vezi ChatService.sendAsAdmin). Adminul scrie mereu în RO. */
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={2}
                  placeholder="Scrie răspuns... (Cmd/Ctrl+Enter pentru a trimite)"
                  className="flex-1 min-h-[60px]"
                />
                <Button onClick={send} disabled={!draft.trim()} className="h-auto">
                  <Send />
                  Trimite
                </Button>
              </div>
            </>
          )}
        </section>

        <AssistantPanel
          contextKind="chat"
          refId={active}
          detectedLang={thread?.messages?.find((m) => m.authorRole === 'user')?.detectedLang}
          onInsertDraft={(text) => setDraft(text)}
        />
      </div>
    </div>
  );
}

function ChatBubble({ m }: { m: import('@/lib/types').AdminChatMessage }) {
  const fromAdmin = m.authorRole === 'admin';
  const [mode, setMode] = useState<'original' | 'ro'>('original');
  // Pentru mesaje user în altă limbă: "ro" arată traducerea în RO (m.bodyRo).
  // Pentru mesaje admin (auto-traduse): "ro" arată originalul scris de admin (stocat în bodyRo).
  const display = mode === 'ro' && m.bodyRo ? m.bodyRo : m.body;
  const hasTranslation = !!m.bodyRo && m.detectedLang && m.detectedLang !== 'ro';
  return (
    <div
      className={cn(
        'max-w-[75%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap',
        fromAdmin
          ? 'self-end bg-primary/15 text-foreground border border-primary/30'
          : 'self-start bg-secondary border border-border',
      )}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1 flex items-center gap-1 flex-wrap">
        {fromAdmin ? <Crown className="h-3 w-3" /> : <User className="h-3 w-3" />}
        {fromAdmin ? 'Admin' : 'User'} · {format(new Date(m.createdAt), 'HH:mm', { locale: ro })}
        {hasTranslation && (
          <TranslationToggle
            detectedLang={m.detectedLang}
            hasRoTranslation={true}
            consensus={m.translationConsensus}
            onChange={setMode}
          />
        )}
      </div>
      {display}
    </div>
  );
}

function PresenceDot({ online }: { online: boolean }) {
  return (
    <span
      title={online ? 'Online' : 'Offline'}
      className={cn(
        'inline-block h-2 w-2 rounded-full shrink-0',
        online
          ? 'bg-success ring-2 ring-success/30 animate-pulse'
          : 'bg-muted-foreground/30',
      )}
    />
  );
}
