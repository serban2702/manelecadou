'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  CreditCard,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
  Monitor,
  Paperclip,
  Pencil,
  Search,
  Send,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  User,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { ChatApi, SitesApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks/use-async';
import {
  useAdminChatSocket,
  type MessageAckEvent,
  type PresenceEvent,
} from '@/lib/chat-socket';
import type { AdminChatMessage, AiChatMode, EnrichedPresence } from '@/lib/types';
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
import { PushNotificationsToggle } from '@/components/PushNotificationsToggle';

const presenceKey = (c: { userId: string | null; guestId: string | null }) =>
  c.userId ? `u:${c.userId}` : c.guestId ? `g:${c.guestId}` : '';

/** Sunet sintetic discret (chime) pentru sugestii AI noi pe admin. */
function playAdminPing() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const playNote = (freq: number, t0: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, ctx.currentTime + t0);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t0);
      o.stop(ctx.currentTime + t0 + dur);
    };
    playNote(880, 0, 0.15);
    playNote(1320, 0.12, 0.2);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {/* autoplay blocked */}
}

export default function AdminChatPage() {
  const { isAllSelected } = useSitesMap();
  const [active, setActive] = useState<string | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);
  const originalTitleRef = useRef<string>('');
  const [draft, setDraft] = useState('');
  const [livePresence, setLivePresence] = useState<Map<string, boolean>>(new Map());
  const [enriched, setEnriched] = useState<Map<string, EnrichedPresence>>(new Map());
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  /** Override local pe deliveredAt/readAt din ACK-uri WS (înainte să vină refetch). */
  const [ackOverride, setAckOverride] = useState<Map<string, { deliveredAt?: string; readAt?: string }>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: convs, refetch: refetchConvs } = useAsync(
    () => ChatApi.list(searchQuery ? { q: searchQuery } : {}),
    [searchQuery],
    { refetchInterval: searchQuery ? undefined : 30_000 },
  );

  const { data: thread, refetch: refetchThread } = useAsync(
    () => active ? ChatApi.thread(active) : Promise.resolve(null as never),
    [active],
    { enabled: !!active, refetchInterval: 30_000 },
  );

  const handleAck = useCallback((e: MessageAckEvent) => {
    setAckOverride((prev) => {
      const next = new Map(prev);
      for (const id of e.messageIds) {
        const cur = next.get(id) ?? {};
        if (e.status === 'delivered' && !cur.deliveredAt) cur.deliveredAt = e.at;
        if (e.status === 'read') {
          if (!cur.deliveredAt) cur.deliveredAt = e.at;
          if (!cur.readAt) cur.readAt = e.at;
        }
        next.set(id, cur);
      }
      return next;
    });
  }, []);

  const { connected: wsConnected, joinConversation, leaveConversation } = useAdminChatSocket({
    onMessage: () => {
      refetchConvs();
      refetchThread();
    },
    onAiSuggestion: (e) => {
      refetchThread();
      refetchConvs();
      // Sunet + badge + tab title flash dacă chat-ul nu e vizibil sau tab e inactiv
      const isInactive = typeof document !== 'undefined' && document.visibilityState !== 'visible';
      const isOtherConv = e.conversationId !== active;
      if (isInactive || isOtherConv) {
        playAdminPing();
        setPendingSuggestions((n) => n + 1);
      }
    },
    onPresence: (e: PresenceEvent) => {
      setLivePresence((prev) => {
        const next = new Map(prev);
        if (e.userId) next.set(`u:${e.userId}`, e.online);
        if (e.guestId) next.set(`g:${e.guestId}`, e.online);
        return next;
      });
      const k = presenceKey({ userId: e.userId, guestId: e.guestId });
      if (k && e.enriched) {
        setEnriched((prev) => {
          const next = new Map(prev);
          next.set(k, e.enriched!);
          return next;
        });
      }
      refetchConvs();
    },
    onSnapshot: (snap) => {
      setLivePresence(() => {
        const m = new Map<string, boolean>();
        snap.users.forEach((u) => m.set(`u:${u}`, true));
        snap.guests.forEach((g) => m.set(`g:${g}`, true));
        return m;
      });
      if (snap.enriched) {
        setEnriched(() => {
          const m = new Map<string, EnrichedPresence>();
          for (const [k, v] of Object.entries(snap.enriched!)) m.set(k, v);
          return m;
        });
      }
    },
    onAck: handleAck,
  });

  useEffect(() => {
    if (!active) return;
    joinConversation(active);
    return () => leaveConversation(active);
  }, [active, joinConversation, leaveConversation]);

  // Tab title flash pentru sugestii AI pending
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!originalTitleRef.current) originalTitleRef.current = document.title;
    if (pendingSuggestions <= 0 || document.visibilityState === 'visible') {
      document.title = originalTitleRef.current;
      return;
    }
    const original = originalTitleRef.current;
    const alt = `(${pendingSuggestions}) 🤖 Sugestie AI — ${original}`;
    let flip = false;
    const id = window.setInterval(() => {
      flip = !flip;
      document.title = flip ? alt : original;
    }, 1300);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setPendingSuggestions(0);
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
  }, [pendingSuggestions]);

  // Reset count când userul deschide o conversație (se presupune că o vede)
  useEffect(() => {
    if (active) setPendingSuggestions(0);
  }, [active]);

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

  async function setAiMode(mode: AiChatMode) {
    if (!active) return;
    await ChatApi.setAiMode(active, mode);
    refetchThread();
    refetchConvs();
  }

  async function forceOpenChat() {
    if (!active) return;
    const r = await ChatApi.forceOpen(active);
    if (!r.online) {
      alert('Utilizatorul nu este online acum. Va vedea chatul deschis la următoarea vizită.');
    }
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  async function onFileChosen(f: File) {
    setPendingFile(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setPendingPreview(typeof reader.result === 'string' ? reader.result : null);
      reader.readAsDataURL(f);
    } else {
      setPendingPreview(null);
    }
  }

  async function sendAttachment() {
    if (!active || !pendingFile) return;
    setUploading(true);
    try {
      await ChatApi.uploadAttachment(active, pendingFile, draft.trim() || undefined);
      setPendingFile(null);
      setPendingPreview(null);
      setDraft('');
      refetchThread();
      refetchConvs();
    } catch (e) {
      alert(`Eroare upload: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  function cancelAttach() {
    setPendingFile(null);
    setPendingPreview(null);
  }

  async function sendPaymentLink(opts: { amount?: number; currency?: string; description?: string; premium?: boolean }) {
    if (!active) return;
    try {
      await ChatApi.sendPaymentLink(active, opts);
      setShowPaymentModal(false);
      refetchThread();
      refetchConvs();
    } catch (e) {
      alert(`Eroare link plată: ${(e as Error).message}`);
    }
  }

  const list = useMemo(() => {
    const base = convs ?? [];
    return base
      .map((c) => {
        const liveOnline =
          (c.userId && livePresence.get(`u:${c.userId}`)) ||
          (c.guestId && livePresence.get(`g:${c.guestId}`)) ||
          undefined;
        const e = enriched.get(presenceKey(c));
        return liveOnline === undefined && !e
          ? c
          : {
              ...c,
              online: liveOnline === undefined ? c.online : (liveOnline as boolean),
              enriched: e ?? c.enriched ?? null,
            };
      })
      .sort((a, b) => {
        const bucket = (x: typeof a) => {
          const role = x.lastMessageRole;
          if (x.online) {
            if (role === 'user') return 0;
            if (role === 'admin') return 1;
            return 2;
          }
          if (role === 'user') return 3;
          if (role === 'admin') return 4;
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
  }, [convs, livePresence, enriched]);

  const conversationLabel = (c: { email: string | null; userId: string | null; guestId: string | null }) =>
    c.email ?? (c.userId ? `user:${c.userId.slice(0, 8)}` : `guest:${c.guestId?.slice(0, 8)}`);

  // Enriched presence pentru thread activ (merge cu thread.conversation.enriched).
  const activeEnriched: EnrichedPresence | null = useMemo(() => {
    if (!thread) return null;
    const k = presenceKey(thread.conversation);
    return enriched.get(k) ?? thread.conversation.enriched ?? null;
  }, [thread, enriched]);

  return (
    <div>
      <PageHeader
        title="Chat"
        description={isAllSelected ? 'Conversații cross-tenant · selectează o conversație ca să vezi pe ce site e' : 'Conversații live cu utilizatorii · presence + AI mode prin WebSocket'}
        actions={
          <div className="flex items-center gap-2">
            <PushNotificationsToggle />
            <Badge variant={wsConnected ? 'success' : 'muted'} className="gap-1.5">
              {wsConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {wsConnected ? 'Live' : 'Offline'}
            </Badge>
          </div>
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
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Caută IP, email, ID..."
                className="w-full h-8 pl-7 pr-7 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 placeholder:text-muted-foreground/60"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded hover:bg-secondary flex items-center justify-center text-muted-foreground"
                  title="Șterge search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {searchQuery && (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5 px-1">
                Mod search · include conversații inactive
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.length === 0 ? (
              <div className="p-6 text-muted-foreground text-sm text-center">
                {searchQuery ? `Nicio conversație pentru „${searchQuery}".` : 'Nici o conversație încă.'}
              </div>
            ) : (
              list.map((c) => {
                const sel = c.id === active;
                const e = c.enriched ?? null;
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
                      <div className="text-sm font-semibold text-foreground truncate flex items-center gap-2 min-w-0">
                        <PresenceDot online={c.online} />
                        {c.userId ? (
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border border-dashed border-muted-foreground shrink-0" />
                        )}
                        <span className="truncate">{conversationLabel(c)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {e?.chatOpen && (
                          <span title="Chat deschis pe client"><MessageCircle className="h-3 w-3 text-success" /></span>
                        )}
                        {c.aiMode && c.aiMode !== 'manual' && (
                          <span title={`AI ${c.aiMode}`}><Bot className="h-3 w-3 text-primary" /></span>
                        )}
                        {c.unreadByAdmin > 0 && (
                          <Badge variant="destructive" className="h-5 min-w-[20px] justify-center px-1.5">
                            {c.unreadByAdmin}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <code
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground"
                        title="Ultimul IP cunoscut"
                      >
                        {c.ip ?? 'IP necunoscut'}
                      </code>
                      <SiteBadge siteId={c.siteId} />
                      {e?.device?.type && <DeviceIcon type={e.device.type} />}
                    </div>
                    {e?.currentPath && c.online && (
                      <div
                        className="text-[10px] text-muted-foreground mt-1 truncate font-mono"
                        title={e.currentPath}
                      >
                        📍 {e.currentPath}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 flex items-center justify-between gap-2">
                      <span className={c.online ? 'text-success font-medium' : ''}>
                        {c.online
                          ? e?.connectedAt
                            ? `online de ${formatDistanceToNowStrict(new Date(e.connectedAt), { locale: ro })}`
                            : 'Online'
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
              <header className="px-4 py-3 border-b border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                      <PresenceDot online={thread.conversation.online} />
                      {conversationLabel(thread.conversation)}
                      <SiteBadge siteId={thread.conversation.siteId} />
                      {thread.conversation.userId ? (
                        <Badge variant="muted">user logat</Badge>
                      ) : (
                        <Badge variant="muted">guest</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <AiModeSwitcher
                      mode={thread.conversation.aiMode ?? 'manual'}
                      onChange={setAiMode}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={forceOpenChat}
                      title="Forțează deschiderea chatului pe client"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Force open
                    </Button>
                  </div>
                </div>
                {/* Enriched presence panel */}
                <PresencePanel enriched={activeEnriched} fallbackOnline={thread.conversation.online} fallbackLastSeen={thread.conversation.lastSeenAt} fallbackIp={thread.conversation.ip} />
              </header>

              <div ref={scroller} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {thread.messages.length === 0 && (
                  <div className="m-auto text-muted-foreground text-sm">Mesaj nul.</div>
                )}
                {thread.messages.map((m) => (
                  <ChatBubble
                    key={m.id}
                    m={m}
                    ackOverride={ackOverride.get(m.id)}
                    onSuggestionAction={() => {
                      refetchThread();
                      refetchConvs();
                    }}
                  />
                ))}
              </div>

              {pendingFile && (
                <div className="px-3 pt-3 pb-0">
                  <div className="flex items-center gap-3 p-2 rounded-lg border border-border bg-secondary/30">
                    {pendingPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pendingPreview} alt="preview" className="h-16 w-16 object-cover rounded" />
                    ) : (
                      <Paperclip className="h-8 w-8 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{pendingFile.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {(pendingFile.size / 1024).toFixed(0)} KB · {pendingFile.type}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={cancelAttach}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="p-3 border-t border-border bg-background/40 flex gap-2 items-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFileChosen(f);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  title="Atașează imagine sau PDF (max 5MB)"
                  className="h-[60px] w-[42px] p-0"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPaymentModal(true)}
                  title="Trimite link de plată"
                  className="h-[60px] w-[42px] p-0"
                >
                  <CreditCard className="h-4 w-4" />
                </Button>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      if (pendingFile) sendAttachment();
                      else send();
                    }
                  }}
                  rows={2}
                  placeholder={pendingFile ? 'Caption (opțional) · Cmd/Ctrl+Enter pentru trimite' : 'Scrie răspuns... (Cmd/Ctrl+Enter pentru a trimite)'}
                  className="flex-1 min-h-[60px]"
                />
                {pendingFile ? (
                  <Button onClick={sendAttachment} disabled={uploading} className="h-auto">
                    {uploading ? <Loader2 className="animate-spin" /> : <Send />}
                    {uploading ? 'Upload...' : 'Trimite'}
                  </Button>
                ) : (
                  <Button onClick={send} disabled={!draft.trim()} className="h-auto">
                    <Send />
                    Trimite
                  </Button>
                )}
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

      {showPaymentModal && thread && (
        <PaymentLinkModal
          siteId={thread.conversation.siteId}
          onClose={() => setShowPaymentModal(false)}
          onSend={sendPaymentLink}
        />
      )}
    </div>
  );
}

/** Valute suportate de Stripe + uzuale pentru multi-tenant (RO/BG/GR/CZ/etc.). */
const CURRENCY_OPTIONS = ['RON', 'EUR', 'USD', 'BGN', 'HUF', 'PLN', 'CZK', 'GBP', 'TRY', 'RSD'];

function PaymentLinkModal({
  siteId,
  onClose,
  onSend,
}: {
  siteId: string | null;
  onClose: () => void;
  onSend: (opts: { amount?: number; currency?: string; description?: string; premium?: boolean }) => void;
}) {
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState('RON');
  const [description, setDescription] = useState('Manea personalizată');
  const [premium, setPremium] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingSite, setLoadingSite] = useState(true);
  const [premiumExtraCents, setPremiumExtraCents] = useState(2000);
  const [basePriceCents, setBasePriceCents] = useState(2999);

  // Preîncarcă prețul + valuta din site la deschidere
  useEffect(() => {
    if (!siteId) {
      setLoadingSite(false);
      return;
    }
    SitesApi.get(siteId)
      .then((site) => {
        const base = site.basePriceCents ?? 2999;
        const curr = (site.currency ?? 'RON').toUpperCase();
        const premiumExtra = (site as { premiumExtraCents?: number }).premiumExtraCents ?? 2000;
        setBasePriceCents(base);
        setPremiumExtraCents(premiumExtra);
        setCurrency(CURRENCY_OPTIONS.includes(curr) ? curr : 'RON');
        setAmountStr((base / 100).toFixed(2));
      })
      .catch(() => {
        // fallback la defaults
      })
      .finally(() => setLoadingSite(false));
  }, [siteId]);

  // Când userul comută premium, actualizează suma propusă
  useEffect(() => {
    if (loadingSite) return;
    const target = basePriceCents + (premium ? premiumExtraCents : 0);
    setAmountStr((target / 100).toFixed(2));
  }, [premium, basePriceCents, premiumExtraCents, loadingSite]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Trimite link de plată</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
              Descriere
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Manea personalizată"
              className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
                Sumă {loadingSite && '(se încarcă...)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                disabled={loadingSite}
                className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
                Valută
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={loadingSite}
                className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono disabled:opacity-50"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} />
            Variantă premium (+{(premiumExtraCents / 100).toFixed(2)} {currency})
          </label>
          <div className="text-[11px] text-muted-foreground bg-secondary/30 rounded p-2">
            Suma și valuta sunt precompletate din configul site-ului. Le poți modifica înainte de trimitere. Linkul îl duce direct la Stripe Checkout.
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Anulează
          </Button>
          <Button
            onClick={async () => {
              setSending(true);
              try {
                const amount = amountStr ? Math.round(parseFloat(amountStr) * 100) : undefined;
                await onSend({
                  amount,
                  currency,
                  description: description.trim() || undefined,
                  premium,
                });
              } finally {
                setSending(false);
              }
            }}
            disabled={sending || loadingSite || !amountStr}
          >
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            Trimite link
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  m,
  ackOverride,
  onSuggestionAction,
}: {
  m: AdminChatMessage;
  ackOverride?: { deliveredAt?: string; readAt?: string };
  onSuggestionAction?: () => void;
}) {
  // Render special pentru AI suggestion
  if (m.messageType === 'ai_suggestion') {
    return <AiSuggestionBubble m={m} onAction={onSuggestionAction} />;
  }
  // Render special pentru system message
  if (m.messageType === 'system' || m.authorRole === 'system') {
    return (
      <div className="self-center max-w-[80%] px-3 py-1.5 rounded-md text-xs italic bg-amber-500/10 text-amber-400 border border-amber-500/20">
        {m.body}
      </div>
    );
  }
  const fromAdmin = m.authorRole === 'admin';
  const [mode, setMode] = useState<'original' | 'ro'>('original');
  const display = mode === 'ro' && m.bodyRo ? m.bodyRo : m.body;
  const hasTranslation = !!m.bodyRo && m.detectedLang && m.detectedLang !== 'ro';
  const deliveredAt = m.deliveredAt ?? ackOverride?.deliveredAt;
  const readAt = m.readAt ?? ackOverride?.readAt;
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
        {m.aiGenerated && <Badge variant="muted" className="h-4 px-1 text-[9px]"><Bot className="h-2.5 w-2.5" /> AI</Badge>}
        {hasTranslation && (
          <TranslationToggle
            detectedLang={m.detectedLang}
            hasRoTranslation={true}
            consensus={m.translationConsensus}
            onChange={setMode}
          />
        )}
      </div>
      {m.attachmentUrl && m.attachmentMime?.startsWith('image/') && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.attachmentUrl} alt={m.attachmentName ?? 'attachment'} className="rounded-md max-w-full mb-1.5 max-h-64 object-contain" />
      )}
      {m.attachmentUrl && m.attachmentMime === 'application/pdf' && (
        <a
          href={m.attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2 mb-1.5 rounded-md bg-black/20 hover:bg-black/30 transition border border-border"
        >
          <span className="text-xl">📎</span>
          <span className="text-xs">{m.attachmentName ?? 'document.pdf'}</span>
          <ExternalLink className="h-3 w-3 ml-auto" />
        </a>
      )}
      {m.messageType === 'payment_link' && m.payload && (
        <PaymentCard payload={m.payload as PaymentPayload} conversationId={m.conversationId} />
      )}
      {display}
      {fromAdmin && (
        <div className="text-[10px] mt-1 flex items-center gap-1 justify-end opacity-70">
          <ReceiptIcon delivered={!!deliveredAt} read={!!readAt} />
          <span className="text-muted-foreground">
            {readAt ? 'citit' : deliveredAt ? 'livrat' : 'trimis'}
          </span>
        </div>
      )}
    </div>
  );
}

function AiSuggestionBubble({ m, onAction }: { m: AdminChatMessage; onAction?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  async function approve() {
    setBusy('approve');
    try {
      await ChatApi.approveSuggestion(m.id, editing && draft.trim() !== m.body ? draft.trim() : undefined);
      onAction?.();
    } catch (e) {
      alert(`Eroare: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }
  async function reject() {
    if (!confirm('Respinge sugestia AI?')) return;
    setBusy('reject');
    try {
      await ChatApi.rejectSuggestion(m.id);
      onAction?.();
    } catch (e) {
      alert(`Eroare: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="self-end max-w-[85%] rounded-xl border border-violet-500/40 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-3">
      <div className="text-[10px] uppercase tracking-wider opacity-80 mb-1.5 flex items-center gap-1.5 text-violet-400 font-bold">
        <Sparkles className="h-3 w-3" />
        Sugestie AI · neasumată
      </div>
      {editing ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="text-sm mb-2 bg-background/40 border-violet-500/30"
        />
      ) : (
        <div className="text-sm whitespace-pre-wrap mb-2 text-foreground">{m.body}</div>
      )}
      <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-violet-500/20">
        <Button variant="ghost" size="sm" onClick={reject} disabled={!!busy}>
          {busy === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Respinge
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (editing) setDraft(m.body);
            setEditing((v) => !v);
          }}
          disabled={!!busy}
        >
          <Pencil className="h-3.5 w-3.5" />
          {editing ? 'Anulează edit' : 'Editează'}
        </Button>
        <Button size="sm" onClick={approve} disabled={!!busy || (editing && !draft.trim())}>
          {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Trimite
        </Button>
      </div>
    </div>
  );
}

function ReceiptIcon({ delivered, read }: { delivered: boolean; read: boolean }) {
  if (read) return <CheckCheck className="h-3.5 w-3.5 text-blue-500" />;
  if (delivered) return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
  return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground/40" />;
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

function DeviceIcon({ type }: { type: 'mobile' | 'tablet' | 'desktop' }) {
  const Icon = type === 'mobile' ? Smartphone : type === 'tablet' ? Tablet : Monitor;
  return <Icon className="h-3 w-3 text-muted-foreground" />;
}

/** Panel detaliat de presence sub header — currentPath, device, chatOpen, timer. */
function PresencePanel({
  enriched,
  fallbackOnline,
  fallbackLastSeen,
  fallbackIp,
}: {
  enriched: EnrichedPresence | null;
  fallbackOnline: boolean;
  fallbackLastSeen: string | null;
  fallbackIp: string | null;
}) {
  const online = enriched?.online ?? fallbackOnline;
  const ip = enriched?.ip ?? fallbackIp;
  const lastSeen = enriched?.lastSeenAt ?? fallbackLastSeen;
  // Timer live "online de X" — re-render la fiecare 5s.
  const [, force] = useState(0);
  useEffect(() => {
    if (!online) return;
    const t = setInterval(() => force((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, [online]);

  return (
    <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
      {online ? (
        <span className="text-success font-medium flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Online
          {enriched?.connectedAt && (
            <span className="text-muted-foreground/80 font-normal">
              · de {formatDistanceToNowStrict(new Date(enriched.connectedAt), { locale: ro })}
            </span>
          )}
        </span>
      ) : lastSeen ? (
        <span>văzut acum {formatDistanceToNowStrict(new Date(lastSeen), { locale: ro })}</span>
      ) : (
        <span>fără activitate</span>
      )}
      {enriched?.chatOpen ? (
        <span className="flex items-center gap-1 text-success" title="Userul are widgetul de chat deschis">
          <Eye className="h-3 w-3" /> chat deschis
        </span>
      ) : online && (
        <span className="flex items-center gap-1" title="Widget de chat închis pe client">
          <EyeOff className="h-3 w-3" /> chat închis
        </span>
      )}
      {enriched?.currentPath && (
        <span className="font-mono flex items-center gap-1 truncate max-w-[280px]" title={enriched.currentPath}>
          📍 {enriched.currentPath}
        </span>
      )}
      {enriched?.device?.type && (
        <span className="flex items-center gap-1">
          <DeviceIcon type={enriched.device.type} />
          {enriched.device.os ?? ''} {enriched.device.browser ?? ''}
          {enriched.device.viewport && ` · ${enriched.device.viewport.w}×${enriched.device.viewport.h}`}
        </span>
      )}
      {ip && (
        <code className="text-[10px] font-mono px-1 py-0.5 rounded bg-secondary/40">{ip}</code>
      )}
    </div>
  );
}

function AiModeSwitcher({ mode, onChange }: { mode: AiChatMode; onChange: (m: AiChatMode) => void }) {
  const [open, setOpen] = useState(false);
  const label: Record<AiChatMode, string> = { manual: 'Manual', suggest: 'AI Suggest', auto: 'AI Auto' };
  const colors: Record<AiChatMode, string> = {
    manual: 'text-muted-foreground',
    suggest: 'text-amber-500',
    auto: 'text-emerald-500',
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-md bg-secondary/40 border border-border hover:bg-secondary"
        title="Schimbă modul AI"
      >
        <Bot className={cn('h-3.5 w-3.5', colors[mode])} />
        <span>{label[mode]}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-md border border-border bg-popover shadow-lg overflow-hidden"
          onMouseLeave={() => setOpen(false)}
        >
          {(['manual', 'suggest', 'auto'] as AiChatMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-secondary/60 text-left',
                m === mode && 'bg-secondary/40 font-semibold',
              )}
            >
              <Bot className={cn('h-3.5 w-3.5', colors[m])} />
              <div className="flex-1">
                <div>{label[m]}</div>
                <div className="text-[10px] text-muted-foreground">
                  {m === 'manual' && 'AI nu intervine'}
                  {m === 'suggest' && 'AI sugerează, tu aprobi'}
                  {m === 'auto' && 'AI răspunde singur'}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface PaymentPayload {
  amount?: number;
  currency?: string;
  description?: string;
  checkoutUrl?: string;
  paymentId?: string;
  generationId?: string;
  premium?: boolean;
  status?: 'paid' | 'failed';
  paidAt?: string;
}

function PaymentCard({ payload, conversationId }: { payload: PaymentPayload; conversationId: string }) {
  const amount = payload.amount ?? 0;
  const currency = payload.currency ?? 'RON';
  const isPaid = payload.status === 'paid';
  const hasGeneration = !!payload.generationId;
  const [showLaunchModal, setShowLaunchModal] = useState(false);

  return (
    <>
      <div
        className={cn(
          'rounded-lg border p-3 mb-2 flex items-center gap-3',
          isPaid ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-primary/40 bg-primary/5',
        )}
      >
        {isPaid ? (
          <Check className="h-8 w-8 text-emerald-500 shrink-0" />
        ) : (
          <CreditCard className="h-8 w-8 text-primary shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              'text-xs uppercase tracking-wider font-semibold flex items-center gap-1.5',
              isPaid ? 'text-emerald-500' : 'text-primary',
            )}
          >
            {isPaid ? '✓ Plătit' : 'Link de plată'}
            {isPaid && payload.paidAt && (
              <span className="text-[10px] font-normal text-muted-foreground">
                {format(new Date(payload.paidAt), 'd MMM HH:mm', { locale: ro })}
              </span>
            )}
          </div>
          <div className="text-sm font-medium truncate">{payload.description ?? 'Plată'}</div>
          <div className="text-lg font-bold">{(amount / 100).toFixed(2)} {currency}</div>
        </div>
        {!isPaid && payload.checkoutUrl && (
          <a
            href={payload.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline whitespace-nowrap flex items-center gap-1"
          >
            Preview <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {isPaid && !hasGeneration && payload.paymentId && (
          <Button size="sm" onClick={() => setShowLaunchModal(true)}>
            <Zap className="h-3.5 w-3.5" />
            Lansează generare
          </Button>
        )}
        {isPaid && hasGeneration && (
          <a
            href={`/m/${payload.generationId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-emerald-500 hover:underline whitespace-nowrap flex items-center gap-1"
          >
            🎵 Vezi melodia <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {showLaunchModal && payload.paymentId && (
        <LaunchGenerationModal
          conversationId={conversationId}
          paymentId={payload.paymentId}
          defaultPremium={!!payload.premium}
          onClose={() => setShowLaunchModal(false)}
          onLaunched={() => setShowLaunchModal(false)}
        />
      )}
    </>
  );
}

const GEN_STYLES = ['Clasică de pahar', 'Modernă', 'Orientală', 'Cu trompetă', 'De jale', 'Comercială', 'De opulență', 'De iubire', 'Tallava', 'Kuchek', 'Trapanele'];
const GEN_OCCASIONS = ['Zi de naștere', 'Nuntă', 'Botez', 'Cumătrie', 'Aniversare cuplu', 'Pentru șef', 'Declarație', 'Roast prieten', 'Naș/fin', 'Înmormântare', 'Motivațională', 'Altă ocazie'];

function LaunchGenerationModal({
  conversationId,
  paymentId,
  defaultPremium,
  onClose,
  onLaunched,
}: {
  conversationId: string;
  paymentId: string;
  defaultPremium: boolean;
  onClose: () => void;
  onLaunched: () => void;
}) {
  const [style, setStyle] = useState(GEN_STYLES[1]);
  const [occasion, setOccasion] = useState(GEN_OCCASIONS[0]);
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [voiceArtist, setVoiceArtist] = useState('masculină');
  const [dedication, setDedication] = useState('');
  const [premium, setPremium] = useState(defaultPremium);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    if (!recipientName.trim() || !message.trim()) {
      setError('Numele beneficiarului și mesajul sunt obligatorii');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ChatApi.launchGeneration(conversationId, {
        paymentId, style, occasion,
        recipientName: recipientName.trim(),
        message: message.trim(),
        voiceArtist: voiceArtist.trim() || 'masculină',
        dedication: dedication.trim() || undefined,
        premium,
      });
      onLaunched();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Lansează generare (plată confirmată)</h3>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Stil</label>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none">
                {GEN_STYLES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Ocazie</label>
              <select value={occasion} onChange={(e) => setOccasion(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none">
                {GEN_OCCASIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Beneficiar (nume)</label>
            <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="ex. Maria" className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Mesaj / dedicație (ce vrea să-i transmită)</label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="ex. La mulți ani Maria, să fii sănătoasă și să-ți meargă bine la facultate!" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Voce</label>
              <input type="text" value={voiceArtist} onChange={(e) => setVoiceArtist(e.target.value)} placeholder="masculină, feminină, grav..." className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Dedicație audio (opțional)</label>
              <input type="text" value={dedication} onChange={(e) => setDedication(e.target.value)} maxLength={120} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} />
            Variantă premium
          </label>
          {error && <div className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</div>}
          <div className="text-[11px] text-muted-foreground bg-secondary/30 rounded p-2">
            Plata e deja confirmată. Generarea pornește imediat după Launch — userul va primi mesaj + email când e gata.
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button>
          <Button onClick={launch} disabled={busy || !recipientName.trim() || !message.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Zap />}
            Lansează
          </Button>
        </div>
      </div>
    </div>
  );
}
