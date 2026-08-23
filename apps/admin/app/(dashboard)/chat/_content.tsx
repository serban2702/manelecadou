'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  Archive,
  ArchiveRestore,
  Ban,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  CreditCard,
  Crosshair,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MessageCircle,
  Monitor,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Send,
  Smartphone,
  Sparkles,
  Star,
  Tablet,
  Trash2,
  TriangleAlert,
  User,
  Wand2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { ChatApi, SitesApi, AuthApi, AiChatApi } from '@/lib/api';
import type { QuickReply, ChatBlacklistEntry, PackageTier } from '@/lib/api/chat.api';
import type { ConversationReview, ReviewRating, ReviewCategory } from '@/lib/api/ai-chat.api';
import { useAsync } from '@/lib/hooks/use-async';
import {
  useAdminChatSocket,
  type MessageAckEvent,
  type PresenceEvent,
  type TypingEvent,
} from '@/lib/chat-socket';
import type { AdminChatConversation, AdminChatMessage, AiChatMode, EnrichedPresence, GeneratorFormState } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
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

const PACKAGE_OPTIONS: { tier: PackageTier; label: string; defaultCents: number; features: string }[] = [
  { tier: 'basic', label: 'Standard', defaultCents: 2999, features: 'Manea + versuri + livrare email' },
  { tier: 'plus', label: 'Plus', defaultCents: 4999, features: '+ colaj 4 poze (refren)' },
  { tier: 'premium', label: 'Premium', defaultCents: 6999, features: '+ colaj 15 poze + felicitare + pagină premium' },
];

const PACKAGE_DEFAULT_CENTS: Record<PackageTier, number> = { basic: 2999, plus: 4999, premium: 6999 };
const PACKAGE_LABELS: Record<PackageTier, string> = { basic: 'Standard', plus: 'Plus', premium: 'Premium' };

function packagePriceCents(site: unknown, tier: PackageTier): number {
  const overrides = (site as { packagePricesCents?: Partial<Record<PackageTier, number>> } | null | undefined)
    ?.packagePricesCents;
  return overrides?.[tier] ?? PACKAGE_DEFAULT_CENTS[tier];
}

/** Sunet sintetic discret (chime) pentru sugestii AI noi pe admin. */
/**
 * Format compact pentru data ultimului mesaj în sidebar conv:
 *  - Azi (ultimele 24h, dar tot azi calendaristic) → „azi 14:32"
 *  - Ieri → „ieri 09:15"
 *  - Săptămâna asta → „lun 14:32" (zi RO scurt)
 *  - Anul curent → „24 mai 14:32"
 *  - Altfel → „24 mai 2025"
 * Hover-ul (title) afișează data completă pentru cei care vor secunde exact.
 */
function formatLastMessageDate(d: Date): string {
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `azi ${format(d, 'HH:mm')}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return `ieri ${format(d, 'HH:mm')}`;

  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return format(d, 'EEE HH:mm', { locale: ro });

  if (d.getFullYear() === now.getFullYear()) {
    return format(d, 'd MMM HH:mm', { locale: ro });
  }
  return format(d, 'd MMM yyyy', { locale: ro });
}

/**
 * Timestamp-ul din bula de mesaj. Doar ora pentru mesajele de azi; pentru
 * restul prefixăm data, altfel un „19:22" pe o conversație veche de câteva
 * zile pare de azi și derutează la citirea firului.
 */
function formatMessageTimestamp(d: Date): string {
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return format(d, 'HH:mm');

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return `ieri ${format(d, 'HH:mm')}`;

  if (d.getFullYear() === now.getFullYear()) {
    return format(d, 'd MMM, HH:mm', { locale: ro });
  }
  return format(d, 'd MMM yyyy, HH:mm', { locale: ro });
}

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

interface ContextMenuState {
  conv: { id: string; subject: string };
  x: number;
  y: number;
}

export default function AdminChatPage() {
  const { isAllSelected, byId: sitesById } = useSitesMap();
  const [active, setActive] = useState<string | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);
  const originalTitleRef = useRef<string>('');
  const [showArchived, setShowArchived] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; current: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  // Typing indicator state — map<conversationId, expiresAt timestamp>
  const [userTyping, setUserTyping] = useState<Map<string, number>>(new Map());
  // Long-press support pentru mobil
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Throttle admin typing emit
  const lastTypingEmitRef = useRef<number>(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState('');
  const [livePresence, setLivePresence] = useState<Map<string, boolean>>(new Map());
  const [enriched, setEnriched] = useState<Map<string, EnrichedPresence>>(new Map());
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  /** Override local pe deliveredAt/readAt din ACK-uri WS (înainte să vină refetch). */
  const [ackOverride, setAckOverride] = useState<Map<string, { deliveredAt?: string; readAt?: string }>>(new Map());
  /** Admin-ul curent logat (pentru a ști dacă conversația e asignată „mie"). */
  const [me, setMe] = useState<{ id: string; email: string } | null>(null);
  useEffect(() => {
    AuthApi.me()
      .then((u) => setMe({ id: u.id, email: u.email }))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Listă PAGINATĂ (2026-06-10): la 2700+ conversații, fetch-ul „totul deodată"
  // bloca UI-ul. Prima pagină (cu online-ii injectați de server) se reîmprospătează
  // la 30s; paginile vechi se acumulează la scroll (infinite scroll) și se resetează
  // când se schimbă filtrele.
  const CONV_PAGE_SIZE = 40;
  const { data: convPage, refetch: refetchConvs } = useAsync(
    () => ChatApi.list({
      q: searchQuery || undefined,
      archived: showArchived || undefined,
      limit: CONV_PAGE_SIZE,
      offset: 0,
    }),
    [searchQuery, showArchived],
    { refetchInterval: searchQuery ? undefined : 30_000 },
  );
  const [olderConvs, setOlderConvs] = useState<AdminChatConversation[]>([]);
  const olderOffsetRef = useRef(CONV_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    // Reset acumulatorul când se schimbă filtrele (search / arhivate).
    setOlderConvs([]);
    olderOffsetRef.current = CONV_PAGE_SIZE;
  }, [searchQuery, showArchived]);

  const convs = useMemo(() => {
    const first = convPage?.items ?? [];
    const seen = new Set(first.map((c) => c.id));
    return [...first, ...olderConvs.filter((c) => !seen.has(c.id))];
  }, [convPage, olderConvs]);
  const convTotal = convPage?.total ?? 0;
  const hasMoreConvs = !searchQuery && !!convPage && convs.length < convTotal;

  const loadMoreConvs = useCallback(async () => {
    if (loadingMore || searchQuery || !convPage) return;
    setLoadingMore(true);
    try {
      const page = await ChatApi.list({
        archived: showArchived || undefined,
        limit: CONV_PAGE_SIZE,
        offset: olderOffsetRef.current,
      });
      olderOffsetRef.current += CONV_PAGE_SIZE;
      setOlderConvs((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.items.filter((c) => !seen.has(c.id))];
      });
    } catch {
      /* silent — următorul intersect reîncearcă */
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, searchQuery, showArchived, convPage]);

  // Sentinel de infinite scroll — când intră în viewport, încarcă pagina următoare.
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el || !hasMoreConvs) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMoreConvs();
      },
      { rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMoreConvs, loadMoreConvs]);

  // Acțiuni context menu
  async function archiveConv(id: string, archived: boolean) {
    try {
      await ChatApi.archive(id, archived);
      if (active === id) setActive(null);
      setOlderConvs((prev) => prev.filter((c) => c.id !== id));
      refetchConvs();
    } catch (e) {
      alert(`Eroare: ${(e as Error).message}`);
    }
  }
  async function renameConv(id: string, subject: string) {
    try {
      await ChatApi.rename(id, subject);
      setRenameTarget(null);
      refetchConvs();
      if (active === id) refetchThread();
    } catch (e) {
      alert(`Eroare: ${(e as Error).message}`);
    }
  }
  async function deleteConv(id: string) {
    try {
      await ChatApi.deleteConversation(id);
      if (active === id) setActive(null);
      setDeleteTarget(null);
      setOlderConvs((prev) => prev.filter((c) => c.id !== id));
      refetchConvs();
    } catch (e) {
      alert(`Eroare: ${(e as Error).message}`);
    }
  }
  /** „Du clientul la mesaj": widget-ul lui se deschide + scroll cu highlight la mesaj.
   *  Feedback doar când clientul NU e online (altfel acțiunea e silențioasă, a mers). */
  async function spotlightMsg(m: AdminChatMessage) {
    try {
      const r = await ChatApi.spotlightMessage(m.id);
      if (!r.online) {
        alert('Clientul nu e online acum — nu are chat-ul deschis, deci nu vede derularea live.');
      }
    } catch (e) {
      alert(`Eroare: ${(e as Error).message}`);
    }
  }

  function openContextMenuFor(conv: { id: string; subject: string }, e: { clientX: number; clientY: number }) {
    // Clamp poziția să nu iasă din ecran
    const menuWidth = 200;
    const menuHeight = 160;
    const x = Math.min(e.clientX, (typeof window !== 'undefined' ? window.innerWidth : 1200) - menuWidth - 8);
    const y = Math.min(e.clientY, (typeof window !== 'undefined' ? window.innerHeight : 800) - menuHeight - 8);
    setContextMenu({ conv, x, y });
  }
  function handleConvLongPressStart(conv: { id: string; subject: string }, e: React.TouchEvent) {
    const touch = e.touches[0];
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      openContextMenuFor(conv, { clientX: touch.clientX, clientY: touch.clientY });
      // Haptic feedback pe device-uri suportate
      try { (navigator as { vibrate?: (n: number) => void }).vibrate?.(40); } catch {/*ignore*/}
    }, 550);
  }
  function handleConvLongPressEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

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

  const { connected: wsConnected, joinConversation, leaveConversation, sendTyping } = useAdminChatSocket({
    onTyping: (e: TypingEvent) => {
      // Doar dacă vine de la user (nu eco-uri admin) și e activ
      if (e.from !== 'user') return;
      setUserTyping((prev) => {
        const next = new Map(prev);
        if (e.isTyping) {
          next.set(e.conversationId, Date.now() + 4000); // expires în 4s
        } else {
          next.delete(e.conversationId);
        }
        return next;
      });
    },
    onMessage: () => {
      refetchConvs();
      refetchThread();
    },
    onMessageUpdated: () => {
      refetchThread();
    },
    onMessageDeleted: () => {
      refetchThread();
      refetchConvs();
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

  async function forceCloseChat() {
    if (!active) return;
    const r = await ChatApi.forceClose(active);
    if (!r.online) {
      alert('Utilizatorul nu este online acum.');
    }
  }

  /** Claim/release conversația curentă pentru admin-ul logat. */
  async function toggleAssignment(release: boolean) {
    if (!active) return;
    await ChatApi.assignAdmin(active, release ? 'release' : undefined);
    refetchThread();
    refetchConvs();
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDemoPaymentModal, setShowDemoPaymentModal] = useState(false);
  /** Sidebar dreapta vizibil/ascuns (Răspunsuri + AI Assistant). */
  const [sidebarOpen, setSidebarOpen] = useState(true);
  /** Mesaj în curs de editare (null = niciunul). */
  const [editingMessage, setEditingMessage] = useState<AdminChatMessage | null>(null);
  /** Mesaj în curs de ștergere (null = niciunul). */
  const [deletingMessage, setDeletingMessage] = useState<AdminChatMessage | null>(null);
  /** Modal setare email sesiune. */
  const [showEmailModal, setShowEmailModal] = useState(false);
  /** Modal editare notă privată admin. */
  const [showNoteModal, setShowNoteModal] = useState(false);
  /** Modal blocare (blacklist) persoană din conversație. */
  const [showBlockModal, setShowBlockModal] = useState(false);
  /** Modal review conversație AI (rating + categorie + comentariu). */
  const [showReviewModal, setShowReviewModal] = useState(false);
  /** Filtru sidebar: arată doar favoritele. */
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

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

  /** Emit typing event throttled (max 1/sec) + auto-stop după 2s fără activitate. */
  function emitAdminTyping() {
    if (!active) return;
    const now = Date.now();
    if (now - lastTypingEmitRef.current > 1000) {
      sendTyping(active, true);
      lastTypingEmitRef.current = now;
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      if (active) sendTyping(active, false);
    }, 2000);
  }

  // Cleanup typing expirat (4s sliding window)
  useEffect(() => {
    const tick = setInterval(() => {
      setUserTyping((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [convId, expiresAt] of next) {
          if (expiresAt <= now) {
            next.delete(convId);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  async function sendPaymentLink(opts: { amount?: number; currency?: string; description?: string; packageTier?: PackageTier }) {
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
    const filtered = showOnlyFavorites ? base.filter((c) => c.isFavorite) : base;
    return filtered
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
        // Sortare simplă (cerere user 2026-05-27):
        //  1. Online — DESC by lastMessageAt
        //  2. Offline — DESC by lastMessageAt
        // Favorit/rolul ultim mesaj NU mai influențează ordinea (există filtru
        // dedicat „doar favoritele" și badge-uri vizuale).
        if (a.online !== b.online) return a.online ? -1 : 1;
        const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bt - at;
      });
  }, [convs, livePresence, enriched, showOnlyFavorites]);

  /** Etichetă afișată în sidebar + header thread.
   *  Prioritate: subject redenumit > email > prefix user/guest. */
  const conversationLabel = (c: {
    subject?: string;
    email: string | null;
    userId: string | null;
    guestId: string | null;
  }) => {
    const subj = (c.subject ?? '').trim();
    // Subiectele default-uri NU sunt considerate „redenumire"
    const isDefaultSubj = !subj || subj === 'Conversație' || subj === 'Conversație guest';
    if (!isDefaultSubj) return subj;
    return c.email ?? (c.userId ? `user:${c.userId.slice(0, 8)}` : `guest:${c.guestId?.slice(0, 8)}`);
  };

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

      <div className="flex gap-3 md:gap-4 h-[calc(100vh-180px)] md:h-[calc(100vh-200px)] min-h-[460px]">
        <aside
          className={cn(
            'w-full md:w-72 md:shrink-0 bg-card border border-border rounded-xl overflow-hidden flex-col',
            // Pe mobil: lista plină când nu e activă o conversație, ascunsă altfel.
            active ? 'hidden md:flex' : 'flex',
          )}
        >
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              {showOnlyFavorites ? 'Favorite' : showArchived ? 'Arhivate' : 'Conversații'}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setShowOnlyFavorites((v) => !v);
                  setActive(null);
                }}
                title={showOnlyFavorites ? 'Vezi toate' : 'Vezi doar favoritele'}
                className={cn(
                  'h-6 w-6 rounded flex items-center justify-center transition',
                  showOnlyFavorites
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                <Star className={cn('h-3.5 w-3.5', showOnlyFavorites && 'fill-current')} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowArchived((v) => !v);
                  setActive(null);
                }}
                title={showArchived ? 'Vezi conversațiile active' : 'Vezi arhivate'}
                className={cn(
                  'h-6 w-6 rounded flex items-center justify-center transition',
                  showArchived
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                {showArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              </button>
              <Badge variant="muted">{searchQuery ? list.length : `${list.length}/${convTotal || list.length}`}</Badge>
            </div>
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
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      openContextMenuFor({ id: c.id, subject: c.subject }, { clientX: ev.clientX, clientY: ev.clientY });
                    }}
                    onTouchStart={(ev) => handleConvLongPressStart({ id: c.id, subject: c.subject }, ev)}
                    onTouchEnd={handleConvLongPressEnd}
                    onTouchMove={handleConvLongPressEnd}
                    onTouchCancel={handleConvLongPressEnd}
                    className={cn(
                      'w-full text-left p-3 border-b border-border/50 hover:bg-secondary/50 transition relative group',
                      sel && 'bg-primary/10 hover:bg-primary/15',
                    )}
                  >
                    {/* Buton ⋮ (vertical dots) — vizibil pe hover desktop, mereu pe mobil */}
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                        openContextMenuFor({ id: c.id, subject: c.subject }, { clientX: rect.right, clientY: rect.top });
                      }}
                      className="absolute top-2 right-2 h-6 w-6 rounded flex items-center justify-center bg-secondary/60 hover:bg-secondary border border-border opacity-0 group-hover:opacity-100 transition z-10 md:flex"
                      title="Opțiuni (right-click sau long-press)"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
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
                        {c.isFavorite && (
                          <span title="Favorit"><Star className="h-3 w-3 text-yellow-400 fill-current" /></span>
                        )}
                        {c.adminNote && (
                          <span title={`Notă: ${c.adminNote.slice(0, 60)}${c.adminNote.length > 60 ? '…' : ''}`}>
                            <Pencil className="h-3 w-3 text-blue-400" />
                          </span>
                        )}
                        {c.aiMode && c.aiMode !== 'manual' && (
                          <span title={`AI ${c.aiMode}`}><Bot className="h-3 w-3 text-primary" /></span>
                        )}
                        {c.assignedAdminId && (
                          <span
                            title={
                              c.assignedAdminId === me?.id
                                ? 'Tu te ocupi'
                                : `Asignat: ${c.assignedAdminEmail ?? 'admin'}`
                            }
                            className={cn(
                              'inline-flex items-center justify-center h-3.5 w-3.5 rounded-full text-[8px] font-bold',
                              c.assignedAdminId === me?.id
                                ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/40'
                                : 'bg-amber-500/20 text-amber-500 border border-amber-500/40',
                            )}
                          >
                            {(c.assignedAdminEmail ?? '?').charAt(0).toUpperCase()}
                          </span>
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
                    {userTyping.has(c.id) && (
                      <div className="mt-1 text-[11px] text-success flex items-center gap-1">
                        <TypingDots />
                        <span>scrie...</span>
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
                      <span title={c.lastMessageAt ? format(new Date(c.lastMessageAt), 'd MMM yyyy, HH:mm:ss', { locale: ro }) : ''}>
                        {c.lastMessageAt
                          ? formatLastMessageDate(new Date(c.lastMessageAt))
                          : 'fără mesaje'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
            {/* Sentinel infinite scroll — încarcă următoarea pagină când devine vizibil. */}
            {hasMoreConvs && (
              <div ref={loadMoreSentinelRef} className="p-3 text-center">
                <button
                  type="button"
                  onClick={() => void loadMoreConvs()}
                  disabled={loadingMore}
                  className="text-xs text-muted-foreground hover:text-foreground transition"
                >
                  {loadingMore ? 'Se încarcă…' : `Încarcă mai multe (${convTotal - list.length} rămase)`}
                </button>
              </div>
            )}
          </div>
        </aside>

        <section
          className={cn(
            'flex-1 min-w-0 bg-card border border-border rounded-xl flex-col overflow-hidden',
            // Pe mobil: thread-ul plin doar când e o conversație activă.
            active ? 'flex' : 'hidden md:flex',
          )}
        >
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
              <header className="px-3 md:px-4 py-3 border-b border-border">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setActive(null)}
                        className="md:hidden -ml-1 mr-0.5 h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label="Înapoi la conversații"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
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
                  <div className="flex items-center gap-1.5 md:gap-2 shrink-0 flex-wrap justify-start md:justify-end">
                    <button
                      type="button"
                      onClick={() => setShowEmailModal(true)}
                      title={
                        thread.conversation.email
                          ? `Email setat: ${thread.conversation.email}. Click pentru a schimba.`
                          : 'Setează email pe sesiune (ca și cum userul l-ar fi completat)'
                      }
                      className={cn(
                        'inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors',
                        thread.conversation.email
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
                          : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary',
                      )}
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await ChatApi.setFavorite(thread.conversation.id, !thread.conversation.isFavorite);
                        refetchThread();
                        refetchConvs();
                      }}
                      title={thread.conversation.isFavorite ? 'Scoate din favorite' : 'Marchează ca favorit'}
                      className={cn(
                        'inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors',
                        thread.conversation.isFavorite
                          ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-500 hover:bg-yellow-500/25'
                          : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary',
                      )}
                    >
                      <Star className={cn('h-3.5 w-3.5', thread.conversation.isFavorite && 'fill-current')} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNoteModal(true)}
                      title={
                        thread.conversation.adminNote
                          ? `Notă: ${thread.conversation.adminNote.slice(0, 80)}${thread.conversation.adminNote.length > 80 ? '…' : ''}`
                          : 'Adaugă notă privată (pentru când revii la conversație)'
                      }
                      className={cn(
                        'inline-flex items-center justify-center h-8 w-8 rounded-md border transition-colors',
                        thread.conversation.adminNote
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                          : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary',
                      )}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBlockModal(true)}
                      title="Blochează această persoană (după IP sau email)"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md border bg-secondary/40 border-border text-muted-foreground transition-colors hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400"
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReviewModal(true)}
                      title="Review conversație AI (pentru îmbunătățirea Irinei)"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md border bg-secondary/40 border-border text-muted-foreground transition-colors hover:bg-violet-500/15 hover:border-violet-500/30 hover:text-violet-400"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" />
                    </button>
                    <AssignmentPill
                      assignedAdminId={thread.conversation.assignedAdminId ?? null}
                      assignedAdminEmail={thread.conversation.assignedAdminEmail ?? null}
                      meId={me?.id ?? null}
                      onClaim={() => toggleAssignment(false)}
                      onRelease={() => toggleAssignment(true)}
                    />
                    <AiModeSwitcher
                      mode={thread.conversation.aiMode ?? 'manual'}
                      onChange={setAiMode}
                    />
                    {(() => {
                      const clientChatOpen =
                        activeEnriched?.chatOpen ?? thread.conversation.chatOpenOnClient ?? false;
                      return clientChatOpen ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={forceCloseChat}
                          title="Închide forțat widget-ul de chat pe client"
                        >
                          <X className="h-3.5 w-3.5" />
                          Force close
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={forceOpenChat}
                          title="Forțează deschiderea chatului pe client"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Force open
                        </Button>
                      );
                    })()}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSidebarOpen((v) => !v)}
                      title={sidebarOpen ? 'Ascunde panou Răspunsuri + AI' : 'Arată panou Răspunsuri + AI'}
                      className="px-2"
                    >
                      {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                {/* Enriched presence panel */}
                <PresencePanel enriched={activeEnriched} fallbackOnline={thread.conversation.online} fallbackLastSeen={thread.conversation.lastSeenAt} fallbackIp={thread.conversation.ip} />
                {/* Notă privată admin (vizibilă doar aici) */}
                {thread.conversation.adminNote && (
                  <button
                    type="button"
                    onClick={() => setShowNoteModal(true)}
                    className="mt-2 w-full text-left text-xs bg-blue-500/10 border border-blue-500/30 text-blue-300 rounded-md p-2 hover:bg-blue-500/15 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <Pencil className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="whitespace-pre-wrap break-words">{thread.conversation.adminNote}</span>
                    </div>
                  </button>
                )}
              </header>

              {userTyping.has(active) && (
                <div className="px-4 pt-2 pb-0">
                  <TypingPill label="Clientul scrie" />
                </div>
              )}
              <div ref={scroller} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {thread.messages.length === 0 && (
                  <div className="m-auto text-muted-foreground text-sm">Mesaj nul.</div>
                )}
                {thread.messages.map((m) => (
                  <ChatBubble
                    key={m.id}
                    m={m}
                    ackOverride={ackOverride.get(m.id)}
                    conversationEmail={thread.conversation.email ?? null}
                    siteDomain={
                      thread.conversation.siteId
                        ? sitesById.get(thread.conversation.siteId)?.domain ?? null
                        : null
                    }
                    onSuggestionAction={() => {
                      refetchThread();
                      refetchConvs();
                    }}
                    onEdit={(msg) => setEditingMessage(msg)}
                    onDelete={(msg) => setDeletingMessage(msg)}
                    onSpotlight={(msg) => void spotlightMsg(msg)}
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
                <ActionsMenu
                  onAttach={() => fileInputRef.current?.click()}
                  onPayment={() => setShowPaymentModal(true)}
                  onLyrics={() => setShowLyricsModal(true)}
                  onDemo={() => setShowDemoPaymentModal(true)}
                />
                <AutoGrowTextarea
                  value={draft}
                  onChange={(v) => {
                    setDraft(v);
                    if (v.length > 0) emitAdminTyping();
                  }}
                  onSubmit={() => {
                    if (pendingFile) sendAttachment();
                    else send();
                  }}
                  placeholder={pendingFile ? 'Caption (opțional) · Cmd/Ctrl+Enter pentru trimite' : 'Scrie răspuns... (Cmd/Ctrl+Enter pentru a trimite)'}
                />
                <button
                  type="button"
                  onClick={pendingFile ? sendAttachment : send}
                  disabled={pendingFile ? uploading : !draft.trim()}
                  title="Trimite (Cmd/Ctrl+Enter)"
                  className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {(pendingFile ? uploading : false) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </section>

        {sidebarOpen && (
          <ChatRightSidebar
            conversationId={active}
            detectedLang={thread?.messages?.find((m) => m.authorRole === 'user')?.detectedLang}
            onInsertDraft={(text) => setDraft((d) => (d ? `${d} ${text}` : text))}
            formState={activeEnriched?.formState ?? null}
            online={activeEnriched?.online ?? thread?.conversation.online ?? false}
          />
        )}
      </div>

      {showPaymentModal && thread && (
        <PaymentLinkModal
          siteId={thread.conversation.siteId}
          onClose={() => setShowPaymentModal(false)}
          onSend={sendPaymentLink}
        />
      )}

      {/* Context menu (right-click / long-press) pentru conversație */}
      {contextMenu && (
        <>
          {/* Backdrop click-to-close */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="fixed z-50 w-[200px] rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              onClick={() => { setRenameTarget({ id: contextMenu.conv.id, current: contextMenu.conv.subject }); setContextMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/60 flex items-center gap-2"
            >
              <Pencil className="h-3.5 w-3.5" /> Redenumește
            </button>
            <button
              type="button"
              onClick={() => { archiveConv(contextMenu.conv.id, !showArchived); setContextMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/60 flex items-center gap-2"
            >
              {showArchived
                ? <><ArchiveRestore className="h-3.5 w-3.5" /> Dezarhivează</>
                : <><Archive className="h-3.5 w-3.5" /> Arhivează</>}
            </button>
            <div className="border-t border-border" />
            <button
              type="button"
              onClick={() => { setDeleteTarget({ id: contextMenu.conv.id, label: contextMenu.conv.subject }); setContextMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-destructive/15 text-destructive flex items-center gap-2"
            >
              <Trash2 className="h-3.5 w-3.5" /> Șterge definitiv
            </button>
          </div>
        </>
      )}

      {/* Modal redenumire */}
      {renameTarget && (
        <RenameModal
          current={renameTarget.current}
          onClose={() => setRenameTarget(null)}
          onSave={(subject) => renameConv(renameTarget.id, subject)}
        />
      )}

      {/* Confirm ștergere */}
      {deleteTarget && (
        <ConfirmDeleteModal
          label={deleteTarget.label}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteConv(deleteTarget.id)}
        />
      )}

      {/* Modal combo demo + plată */}
      {showDemoPaymentModal && thread && (
        <DemoPaymentModal
          conversationId={thread.conversation.id}
          defaultEmail={thread.conversation.email ?? null}
          defaultCurrency="RON"
          defaultAmount={2999}
          needsEmail={!thread.conversation.email}
          onClose={() => setShowDemoPaymentModal(false)}
          onSent={() => {
            setShowDemoPaymentModal(false);
            refetchThread();
            refetchConvs();
          }}
        />
      )}

      {/* Modal setare email sesiune */}
      {showEmailModal && thread && (
        <SetEmailModal
          current={thread.conversation.email ?? ''}
          onClose={() => setShowEmailModal(false)}
          onSave={async (email) => {
            await ChatApi.setEmail(thread.conversation.id, email);
            setShowEmailModal(false);
            refetchThread();
            refetchConvs();
          }}
        />
      )}

      {/* Modal notă admin */}
      {showNoteModal && thread && (
        <AdminNoteModal
          current={thread.conversation.adminNote ?? ''}
          onClose={() => setShowNoteModal(false)}
          onSave={async (note) => {
            await ChatApi.setNote(thread.conversation.id, note);
            setShowNoteModal(false);
            refetchThread();
            refetchConvs();
          }}
        />
      )}

      {/* Modal review conversație AI */}
      {showReviewModal && thread && (
        <ConversationReviewModal
          conversationId={thread.conversation.id}
          onClose={() => setShowReviewModal(false)}
        />
      )}

      {/* Modal blocare (blacklist) persoană */}
      {showBlockModal && thread && (
        <BlockPersonModal
          conversationId={thread.conversation.id}
          ip={thread.conversation.ip ?? activeEnriched?.ip ?? null}
          email={thread.conversation.email ?? null}
          onClose={() => setShowBlockModal(false)}
          onBlocked={() => {
            setShowBlockModal(false);
            refetchThread();
            refetchConvs();
          }}
        />
      )}

      {/* Modal editare mesaj admin */}
      {editingMessage && (
        <EditMessageModal
          initial={editingMessage}
          onClose={() => setEditingMessage(null)}
          onSaved={() => {
            setEditingMessage(null);
            refetchThread();
          }}
        />
      )}

      {/* Confirm ștergere mesaj */}
      {deletingMessage && (
        <ConfirmDeleteMessageModal
          message={deletingMessage}
          onClose={() => setDeletingMessage(null)}
          onConfirm={async () => {
            try {
              await ChatApi.deleteMessage(deletingMessage.id);
            } finally {
              setDeletingMessage(null);
              refetchThread();
              refetchConvs();
            }
          }}
        />
      )}

      {/* Modal preview versuri AI */}
      {showLyricsModal && (
        <LyricsPreviewModal
          conversationId={active}
          onClose={() => setShowLyricsModal(false)}
          onInsertInDraft={(text) => {
            setDraft((d) => (d ? `${d}\n\n${text}` : text));
            setShowLyricsModal(false);
          }}
        />
      )}
    </div>
  );
}

/** Valute suportate de Stripe + uzuale pentru multi-tenant (RO/BG/GR/CZ/etc.). */
const CURRENCY_OPTIONS = ['RON', 'EUR', 'USD', 'BGN', 'HUF', 'PLN', 'CZK', 'GBP', 'TRY', 'RSD'];

/** Aplică rezultatul AI summarize peste setterii unei forme (DemoPaymentModal/LyricsPreviewModal). */
function applyOrderToForm(
  r: {
    style: string | null;
    occasion: string | null;
    recipientName: string | null;
    message: string | null;
    voiceArtist: string | null;
    dedication: string | null;
    packageTier: PackageTier | null;
    email: string | null;
  },
  setters: {
    setStyleId?: (v: string) => void;
    setOccasionId?: (v: string) => void;
    setRecipientName?: (v: string) => void;
    setMessage?: (v: string) => void;
    setVoiceId?: (v: string) => void;
    setDedication?: (v: string) => void;
    setPackageTier?: (v: PackageTier) => void;
    setEmail?: (v: string) => void;
  },
) {
  const styleMatch = r.style && GEN_STYLES.find((s) => s.name.toLowerCase() === r.style!.toLowerCase());
  if (styleMatch && setters.setStyleId) setters.setStyleId(styleMatch.id);
  const occMatch = r.occasion && GEN_OCCASIONS.find((o) => o.name.toLowerCase() === r.occasion!.toLowerCase());
  if (occMatch && setters.setOccasionId) setters.setOccasionId(occMatch.id);
  if (r.recipientName && setters.setRecipientName) setters.setRecipientName(r.recipientName);
  if (r.message && setters.setMessage) setters.setMessage(r.message);
  if (r.voiceArtist && setters.setVoiceId) {
    // Doar 2 voci globale: male / female. Mapez fuzzy preferința AI.
    const lower = r.voiceArtist.toLowerCase();
    const isFemale = /f|femei|feminin/.test(lower);
    setters.setVoiceId(isFemale ? 'female' : 'male');
  }
  if (r.dedication && setters.setDedication) setters.setDedication(r.dedication);
  if (r.packageTier && setters.setPackageTier) setters.setPackageTier(r.packageTier);
  if (r.email && setters.setEmail) setters.setEmail(r.email);
}

function PaymentLinkModal({
  siteId,
  onClose,
  onSend,
}: {
  siteId: string | null;
  onClose: () => void;
  onSend: (opts: { amount?: number; currency?: string; description?: string; packageTier?: PackageTier }) => void;
}) {
  const [amountStr, setAmountStr] = useState('');
  const [currency, setCurrency] = useState('RON');
  const [description, setDescription] = useState('Manea personalizată');
  const [packageTier, setPackageTier] = useState<PackageTier>('basic');
  const [sending, setSending] = useState(false);
  const [loadingSite, setLoadingSite] = useState(true);
  const [site, setSite] = useState<unknown>(null);

  // Preîncarcă valuta + prețurile pachetelor din site la deschidere
  useEffect(() => {
    if (!siteId) {
      setLoadingSite(false);
      setAmountStr((packagePriceCents(null, 'basic') / 100).toFixed(2));
      return;
    }
    SitesApi.get(siteId)
      .then((s) => {
        setSite(s);
        const curr = (s.currency ?? 'RON').toUpperCase();
        setCurrency(CURRENCY_OPTIONS.includes(curr) ? curr : 'RON');
        setAmountStr((packagePriceCents(s, 'basic') / 100).toFixed(2));
      })
      .catch(() => {
        setAmountStr((packagePriceCents(null, 'basic') / 100).toFixed(2));
      })
      .finally(() => setLoadingSite(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // Când userul schimbă pachetul, actualizează suma propusă (rămâne editabilă)
  useEffect(() => {
    if (loadingSite) return;
    setAmountStr((packagePriceCents(site, packageTier) / 100).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageTier]);

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
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
              Pachet
            </label>
            <select
              value={packageTier}
              onChange={(e) => setPackageTier(e.target.value as PackageTier)}
              disabled={loadingSite}
              className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none disabled:opacity-50"
            >
              {PACKAGE_OPTIONS.map((p) => (
                <option key={p.tier} value={p.tier}>
                  {p.label} — {(packagePriceCents(site, p.tier) / 100).toFixed(2)} {currency} ({p.features})
                </option>
              ))}
            </select>
          </div>
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
                  packageTier,
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

/**
 * Linkify text content: detectează URL-uri absolute (http/https) și paths relative
 * `/m/<uuid>` din mesaje, le randerează ca <a> deschise în tab nou. Pentru `/m/...`
 * resolve la domeniul site-ului conversației (sites map).
 */
function LinkifiedText({ text, siteDomain }: { text: string; siteDomain: string | null }) {
  // Regex care prinde:
  //  1. URL absolut: https?://[^\s]+
  //  2. Path relativ /m/<uuid> (UUID v4 format)
  const re = /(https?:\/\/[^\s)\]]+)|(\/m\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  const parts: Array<string | { href: string; label: string }> = [];
  let lastIdx = 0;
  for (const match of text.matchAll(re)) {
    const idx = match.index ?? 0;
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    const raw = match[0];
    let href = raw;
    if (raw.startsWith('/m/')) {
      // Domeniul site-ului — fallback la window.location.origin dacă map gol
      const base = siteDomain ? `https://${siteDomain}` : '';
      href = `${base}${raw}`;
    }
    parts.push({ href, label: raw });
    lastIdx = idx + raw.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));

  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {p.label}
          </a>
        ),
      )}
    </>
  );
}

function ChatBubble({
  m,
  ackOverride,
  conversationEmail,
  siteDomain,
  onSuggestionAction,
  onEdit,
  onDelete,
  onSpotlight,
}: {
  m: AdminChatMessage;
  ackOverride?: { deliveredAt?: string; readAt?: string };
  conversationEmail?: string | null;
  siteDomain?: string | null;
  onSuggestionAction?: () => void;
  onEdit?: (m: AdminChatMessage) => void;
  onDelete?: (m: AdminChatMessage) => void;
  /** „Du clientul la mesajul ăsta" — scroll + highlight în widget-ul clientului. */
  onSpotlight?: (m: AdminChatMessage) => void;
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
  // Auto-translate dezactivat (2026-05-26) — afișăm mereu textul original.
  const display = m.body;
  const hasTranslation = false;
  const deliveredAt = m.deliveredAt ?? ackOverride?.deliveredAt;
  const readAt = m.readAt ?? ackOverride?.readAt;
  // Edit/Delete: doar pe mesaje admin de tip text/payment_link/song_preview (nu ai_suggestion/system).
  const canEditDelete =
    fromAdmin &&
    (!m.messageType || m.messageType === 'text' || m.messageType === 'payment_link' || m.messageType === 'song_preview');
  // Spotlight: orice mesaj VIZIBIL clientului (system/ai_suggestion sunt deja filtrate
  // mai sus prin return-urile speciale) — îl putem derula în widget-ul lui.
  const canSpotlight = !!onSpotlight;
  return (
    <div
      className={cn(
        'group relative max-w-[75%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap',
        fromAdmin
          ? 'self-end bg-primary/15 text-foreground border border-primary/30'
          : 'self-start bg-secondary border border-border',
      )}
    >
      {(canEditDelete || canSpotlight) && (
        <div className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
          {canSpotlight && (
            <button
              type="button"
              onClick={() => onSpotlight(m)}
              title="Du clientul la mesajul ăsta (deschide chat-ul lui + scroll cu evidențiere)"
              className="h-6 w-6 rounded-full bg-card border border-border hover:bg-amber-500/20 hover:border-amber-500/40 flex items-center justify-center shadow-sm"
            >
              <Crosshair className="h-3 w-3" />
            </button>
          )}
          {/* Edit doar pe text simplu (payment_link/song_preview au payload structurat) */}
          {canEditDelete && (!m.messageType || m.messageType === 'text') && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(m)}
              title="Editează"
              className="h-6 w-6 rounded-full bg-card border border-border hover:bg-secondary flex items-center justify-center shadow-sm"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {canEditDelete && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(m)}
              title="Șterge mesajul"
              className="h-6 w-6 rounded-full bg-card border border-border hover:bg-destructive/20 hover:border-destructive/40 flex items-center justify-center shadow-sm"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1 flex items-center gap-1 flex-wrap">
        {fromAdmin ? <Crown className="h-3 w-3" /> : <User className="h-3 w-3" />}
        {fromAdmin ? 'Admin' : 'User'} ·{' '}
        <span title={format(new Date(m.createdAt), 'd MMMM yyyy, HH:mm:ss', { locale: ro })}>
          {formatMessageTimestamp(new Date(m.createdAt))}
        </span>
        {m.editedAt && (
          <span className="italic opacity-70 normal-case tracking-normal">(editat)</span>
        )}
        {m.aiGenerated && <Badge variant="muted" className="h-4 px-1 text-[9px]"><Bot className="h-2.5 w-2.5" /> AI</Badge>}
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
        <PaymentCard
          payload={m.payload as PaymentPayload}
          conversationId={m.conversationId}
          conversationEmail={conversationEmail ?? null}
        />
      )}
      <LinkifiedText text={display} siteDomain={siteDomain ?? null} />
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

/** Mapează valoarea brută a unui câmp de selecție la label-ul lizibil (best-effort). */
function fmtGenValue(field: string, raw: string): string {
  if (!raw) return '';
  if (field === 'style') return GEN_STYLES.find((s) => s.id === raw)?.name ?? raw;
  if (field === 'occ') return GEN_OCCASIONS.find((o) => o.id === raw)?.name ?? raw;
  if (field === 'voice') return GEN_VOICES.find((v) => v.id === raw)?.name ?? raw;
  if (field === 'packageTier') {
    return { basic: 'Standard', plus: 'Plus', premium: 'Premium' }[raw] ?? raw;
  }
  return raw;
}

/** Un câmp text editabil din formular — draft local + salvare către client. */
function WizardEditableField({
  label,
  field,
  value,
  multiline,
  conversationId,
  online,
}: {
  label: string;
  field: string;
  value: string;
  multiline?: boolean;
  conversationId: string;
  online: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const dirty = draft !== value;

  // Sincronizează cu starea live a clientului DOAR când câmpul nu e editat activ
  // (altfel un heartbeat ar suprascrie ce tastează adminul).
  useEffect(() => {
    if (!focused) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await ChatApi.patchFormField(conversationId, field, draft);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      alert(`Nu am putut salva: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-0.5 h-3.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</span>
        {justSaved ? (
          <span className="text-[10px] text-success flex items-center gap-0.5">
            <Check className="h-3 w-3" /> aplicat
          </span>
        ) : dirty ? (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="text-[10px] text-primary hover:underline flex items-center gap-0.5 disabled:opacity-50"
            title={online ? 'Trimite corectura pe formularul clientului' : 'Userul e offline — se salvează pentru când revine'}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {online ? 'Trimite' : 'Salvează'}
          </button>
        ) : null}
      </div>
      {multiline ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
          }}
          rows={2}
          className="text-xs min-h-0 py-1 resize-y"
        />
      ) : (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          className="h-7 text-xs"
        />
      )}
    </div>
  );
}

/**
 * Formularul Generator de pe site, live — pasul curent + ce a completat clientul.
 * Câmpurile de text (nume, dedicație, mesaj, versuri) sunt editabile: corectura se
 * aplică instant pe inputul clientului dacă e online. Selecțiile (stil/voce/pachet)
 * sunt read-only — clientul le alege din liste, nu le scrie.
 */
/** Opțiunile valide pentru un select (per-site din formState; fallback la GEN_* hardcodate). */
function genFieldOptions(
  field: 'style' | 'occ' | 'voice',
  options: GeneratorFormState['options'],
): Array<{ id: string; label: string; emoji?: string }> {
  if (field === 'style') {
    const src = options?.styles;
    if (src?.length) return src.map((s) => ({ id: s.id, label: s.nm, emoji: s.em }));
    return GEN_STYLES.map((s) => ({ id: s.id, label: s.name, emoji: s.emoji }));
  }
  if (field === 'occ') {
    const src = options?.occasions;
    if (src?.length) return src.map((o) => ({ id: o.id, label: o.nm, emoji: o.em }));
    return GEN_OCCASIONS.map((o) => ({ id: o.id, label: o.name, emoji: o.emoji }));
  }
  const src = options?.voices;
  if (src?.length) return src.map((v) => ({ id: v.id, label: v.nm }));
  return GEN_VOICES.map((v) => ({ id: v.id, label: v.name }));
}

/** Un câmp de selecție editabil (stil/ocazie/voce) — schimbarea se aplică instant la client. */
function WizardSelectField({
  label,
  field,
  value,
  options,
  conversationId,
}: {
  label: string;
  field: string;
  value: string;
  options: Array<{ id: string; label: string; emoji?: string }>;
  conversationId: string;
}) {
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Include valoarea curentă chiar dacă nu e în listă (site cu opțiuni diferite).
  const opts =
    value && !options.some((o) => o.id === value) ? [{ id: value, label: value }, ...options] : options;

  async function onChange(v: string) {
    if (!v || v === value) return;
    setSaving(true);
    try {
      await ChatApi.patchFormField(conversationId, field, v);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      alert(`Nu am putut salva: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-0.5 h-3.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</span>
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : justSaved ? (
          <span className="text-[10px] text-success flex items-center gap-0.5">
            <Check className="h-3 w-3" /> aplicat
          </span>
        ) : null}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-7 text-xs rounded-md border border-input bg-background px-1.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {!value && <option value="">—</option>}
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.emoji ? `${o.emoji} ` : ''}
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function WizardLivePanel({
  formState,
  online,
  conversationId,
}: {
  formState: GeneratorFormState;
  online: boolean;
  conversationId: string;
}) {
  const data = formState.data ?? {};
  const get = (k: string) => (data[k] == null ? '' : String(data[k]));
  const total = formState.totalSteps ?? 0;
  const stepNum = (formState.step ?? 0) + 1;
  const pct = total ? Math.min(100, Math.round((stepNum / total) * 100)) : 0;
  const pkg = get('packageTier');

  return (
    <div className="mt-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-2.5">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-xs font-semibold flex items-center gap-1.5 text-primary">
          <Wand2 className="h-3.5 w-3.5" /> Formular live pe site
        </span>
        <span className="text-[11px] text-muted-foreground text-right truncate">
          {total ? `pasul ${stepNum}/${total}` : `pasul ${stepNum}`}
          {formState.stepName ? ` · ${formState.stepName}` : ''}
        </span>
      </div>
      {total > 0 && (
        <div className="w-full h-1 bg-secondary rounded-full mb-2 overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {!online && (
        <div className="mb-2 text-[11px] text-amber-400/90 flex items-start gap-1">
          <TriangleAlert className="h-3 w-3 mt-0.5 shrink-0" />
          <span>Userul nu e activ acum — corectura se salvează și se aplică doar dacă revine pe formular.</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mb-1.5">
        <WizardSelectField label="Stil" field="style" value={get('style')} options={genFieldOptions('style', formState.options)} conversationId={conversationId} />
        <WizardSelectField label="Ocazie" field="occ" value={get('occ')} options={genFieldOptions('occ', formState.options)} conversationId={conversationId} />
        <WizardSelectField label="Voce" field="voice" value={get('voice')} options={genFieldOptions('voice', formState.options)} conversationId={conversationId} />
        {pkg && (
          <div>
            <div className="mb-0.5 h-3.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Pachet</span>
            </div>
            <div className="h-7 flex items-center text-xs px-2 rounded-md bg-secondary/40 text-muted-foreground" title="Pachetul nu se modifică din chat">
              {fmtGenValue('packageTier', pkg)}
            </div>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <WizardEditableField label="Nume destinatar" field="name" value={get('name')} conversationId={conversationId} online={online} />
        <WizardEditableField label="De la (dedicație)" field="dedic" value={get('dedic')} conversationId={conversationId} online={online} />
        <WizardEditableField label="Mesaj personalizat" field="msg" value={get('msg')} multiline conversationId={conversationId} online={online} />
        {get('customLyrics') && (
          <WizardEditableField label="Versuri" field="customLyrics" value={get('customLyrics')} multiline conversationId={conversationId} online={online} />
        )}
      </div>
    </div>
  );
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

/**
 * Pill care arată cine se ocupă activ de conversație + buton claim/release.
 *  - Niciun asignat:        „Neasignat"  → click = preiau eu
 *  - Asignat = adminul meu: „Eu mă ocup" → click = eliberez
 *  - Asignat alt admin:     „Robert"     → click = preiau (force-claim)
 */
function AssignmentPill({
  assignedAdminId,
  assignedAdminEmail,
  meId,
  onClaim,
  onRelease,
}: {
  assignedAdminId: string | null;
  assignedAdminEmail: string | null;
  meId: string | null;
  onClaim: () => void;
  onRelease: () => void;
}) {
  const isMine = assignedAdminId && meId && assignedAdminId === meId;
  const isOther = assignedAdminId && !isMine;
  const isFree = !assignedAdminId;

  const shortName = (email: string | null) => {
    if (!email) return 'admin';
    const local = email.split('@')[0];
    return local.length > 12 ? local.slice(0, 12) + '…' : local;
  };

  return (
    <button
      type="button"
      onClick={isMine ? onRelease : onClaim}
      title={
        isMine
          ? 'Tu te ocupi — click pentru a elibera'
          : isOther
            ? `Asignat la ${assignedAdminEmail}. Click pentru a prelua.`
            : 'Neasignat — click pentru a prelua'
      }
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-md border transition-colors',
        isMine && 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20',
        isOther && 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20',
        isFree && 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary',
      )}
    >
      <User className="h-3.5 w-3.5" />
      {isMine ? <span>Eu mă ocup</span> : null}
      {isOther ? <span>{shortName(assignedAdminEmail)}</span> : null}
      {isFree ? <span>Preia</span> : null}
    </button>
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
  packageTier?: PackageTier;
  packageLabel?: string;
  status?: 'paid' | 'failed';
  paidAt?: string;
  /** Click tracking „Plătește acum" (LIVE prin WS — vezi markPaymentLinkClicked). */
  clickCount?: number;
  firstClickedAt?: string;
  lastClickedAt?: string;
}

function PaymentCard({
  payload,
  conversationId,
  conversationEmail,
}: {
  payload: PaymentPayload;
  conversationId: string;
  conversationEmail?: string | null;
}) {
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
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold">{(amount / 100).toFixed(2)} {currency}</div>
            {(payload.packageLabel || payload.packageTier) && (
              <span className="text-[10px] uppercase tracking-wider font-semibold rounded px-1.5 py-0.5 bg-primary/15 text-primary">
                Pachet: {payload.packageLabel ?? PACKAGE_LABELS[payload.packageTier as PackageTier]}
              </span>
            )}
          </div>
          {/* Click tracking „Plătește acum" — LIVE (mesajul e re-emis pe WS la fiecare click).
              Răspunde la întrebarea „a apăsat sau nu pe link?" fără ghicit. */}
          {!isPaid && (
            payload.clickCount ? (
              <div
                className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-md px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30"
                title={
                  payload.firstClickedAt
                    ? `Primul click: ${format(new Date(payload.firstClickedAt), 'd MMM HH:mm:ss', { locale: ro })}`
                    : undefined
                }
              >
                👆 A apăsat pe Plătește
                {payload.clickCount > 1 ? ` · ${payload.clickCount}×` : ''}
                {payload.lastClickedAt && (
                  <span className="font-normal text-amber-400/80">
                    · {format(new Date(payload.lastClickedAt), 'HH:mm:ss', { locale: ro })}
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-1 inline-flex items-center gap-1 text-[11px] rounded-md px-2 py-0.5 bg-secondary/40 text-muted-foreground border border-border/50">
                Nu a apăsat încă pe link
              </div>
            )
          )}
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
          defaultPackageTier={payload.packageTier ?? 'basic'}
          defaultEmail={conversationEmail}
          onClose={() => setShowLaunchModal(false)}
          onLaunched={() => setShowLaunchModal(false)}
        />
      )}
    </>
  );
}

/** Cele 3 puncte animate care apar lângă „scrie...". */
function TypingDots() {
  return (
    <>
      <style jsx>{`
        @keyframes tdots {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.7); }
          40% { opacity: 1; transform: scale(1); }
        }
        .td { width: 4px; height: 4px; border-radius: 50%; background: currentColor; display: inline-block; }
        .td:nth-child(1) { animation: tdots 1.2s infinite ease-in-out 0s; }
        .td:nth-child(2) { animation: tdots 1.2s infinite ease-in-out 0.18s; }
        .td:nth-child(3) { animation: tdots 1.2s infinite ease-in-out 0.36s; }
      `}</style>
      <span className="inline-flex items-center gap-0.5 mr-0.5">
        <span className="td" />
        <span className="td" />
        <span className="td" />
      </span>
    </>
  );
}

/**
 * Modal combo: lansează generation demo (Suno produce 30s preview) + creează
 * payment link cu metadata unlock-generation. La plată confirmată, backend-ul
 * deblochează automat versiunea full și trimite mesaj nou în chat.
 *
 * Pre-completează datele cu wizardState (dacă există) sau cu valori default.
 */
function DemoPaymentModal({
  conversationId,
  defaultEmail,
  defaultCurrency,
  defaultAmount,
  needsEmail,
  onClose,
  onSent,
}: {
  conversationId: string;
  defaultEmail: string | null;
  defaultCurrency: string;
  defaultAmount: number; // cents
  needsEmail: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [styleId, setStyleId] = useState(GEN_STYLES[1].id);
  const [occasionId, setOccasionId] = useState(GEN_OCCASIONS[0].id);
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [voiceId, setVoiceId] = useState(GEN_VOICES[0].id);
  const [dedication, setDedication] = useState('');
  const [packageTier, setPackageTier] = useState<PackageTier>('basic');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [amount, setAmount] = useState(defaultAmount); // cents
  const [currency, setCurrency] = useState(defaultCurrency);
  const [productName, setProductName] = useState('');
  // Versuri custom — opțional. Dacă sunt completate, AI-ul writer/Suno le folosește
  // EXACT, fără a mai genera versuri proprii. Util când adminul a discutat versurile
  // cu userul în chat și le-a stabilit împreună.
  const [customLyrics, setCustomLyrics] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiPrefilling, setAiPrefilling] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  async function aiPrefill() {
    setAiPrefilling(true);
    setError(null);
    try {
      const r = await ChatApi.summarizeOrder(conversationId);
      applyOrderToForm(r, {
        setStyleId, setOccasionId, setRecipientName, setMessage,
        setVoiceId, setDedication, setPackageTier, setEmail,
      });
      setAiSummary(r.summary);
    } catch (e) {
      setError(`Eșec AI pre-fill: ${(e as Error).message}`);
    } finally {
      setAiPrefilling(false);
    }
  }

  async function submit() {
    if (!recipientName.trim() || !message.trim()) {
      setError('Beneficiarul și mesajul sunt obligatorii');
      return;
    }
    if (needsEmail && !email.trim()) {
      setError('Userul e guest fără email — trebuie introdus aici');
      return;
    }
    // amount=0 → gratis (skip plată). Altfel min 50 cents = limita Stripe.
    if (amount > 0 && amount < 50) {
      setError('Suma trebuie să fie 0 (gratis) sau minim 0.50 (limita Stripe)');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const styleName = GEN_STYLES.find((s) => s.id === styleId)?.name ?? styleId;
      const occasionName = GEN_OCCASIONS.find((o) => o.id === occasionId)?.name ?? occasionId;
      await ChatApi.demoWithPayment(conversationId, {
        style: styleName,
        occasion: occasionName,
        recipientName: recipientName.trim(),
        message: message.trim(),
        voiceArtist: voiceId,
        dedication: dedication.trim() || undefined,
        packageTier,
        email: needsEmail ? email.trim() : undefined,
        amount,
        currency,
        productName: productName.trim() || undefined,
        // Versuri custom — backend le forwardează la generation.customLyrics
        // și writer-ul OpenAI/Suno le folosește exact, fără generare proprie.
        customLyrics: customLyrics.trim() || undefined,
      });
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Generează demo + trimite link plată</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Suno generează acum melodia. Userul primește 30 secunde demo în chat. La plata link-ului,
          versiunea completă se deblochează automat și i se trimite linkul.
        </p>

        <button
          type="button"
          onClick={aiPrefill}
          disabled={aiPrefilling}
          className="w-full mb-3 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-60"
        >
          {aiPrefilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {aiPrefilling ? 'AI extrage datele...' : '✨ Pre-completează din conversație'}
        </button>
        {aiSummary && (
          <div className="mb-3 text-[11px] text-muted-foreground bg-secondary/30 border border-border rounded p-2 italic">
            {aiSummary}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Stil</label>
              <select value={styleId} onChange={(e) => setStyleId(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none">
                {GEN_STYLES.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Ocazie</label>
              <select value={occasionId} onChange={(e) => setOccasionId(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none">
                {GEN_OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.emoji} {o.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Beneficiar (pentru cine)</label>
            <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="ex. Larisa, Costel..." maxLength={120} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Mesaj / dedicație ({message.length}/600)</label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={600} placeholder="ex. La mulți ani, iubire! Tu ești totul pentru mine..." />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Versuri custom (opțional) {customLyrics.length > 0 ? `(${customLyrics.length}/3000)` : ''}
              </label>
              {customLyrics.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCustomLyrics('')}
                  className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                >
                  șterge
                </button>
              )}
            </div>
            <Textarea
              value={customLyrics}
              onChange={(e) => setCustomLyrics(e.target.value)}
              rows={6}
              maxLength={3000}
              placeholder="Dacă ai stabilit versurile cu userul în chat, lipește-le aici. Suno va folosi versurile astea EXACT, fără să mai genereze altele. Lasă gol pentru generare automată din mesaj/dedicație."
              className="font-mono text-[12px] leading-relaxed"
            />
            {customLyrics.trim().length > 0 && (
              <div className="mt-1.5 text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 flex items-start gap-1.5">
                <span>⚠️</span>
                <span>
                  Versurile vor fi folosite <strong>EXACT cum le-ai scris</strong>. AI-ul writer e bypass-uit complet.
                  Verifică ortografia, refrenul, structura (couplet/refren) și că nu apar substituții ca „[nume]".
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Voce / artist</label>
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none">
                {GEN_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.tag}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">De la (opțional)</label>
              <input type="text" value={dedication} onChange={(e) => setDedication(e.target.value)} maxLength={120} placeholder="ex. de la Andrei" className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Pachet</label>
            <select
              value={packageTier}
              onChange={(e) => {
                const tier = e.target.value as PackageTier;
                setPackageTier(tier);
                if (amount > 0) setAmount(packagePriceCents(null, tier));
              }}
              className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none"
            >
              {PACKAGE_OPTIONS.map((p) => (
                <option key={p.tier} value={p.tier}>
                  {p.label} — {(p.defaultCents / 100).toFixed(2)} ({p.features})
                </option>
              ))}
            </select>
          </div>
          {needsEmail && (
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Email (guest)</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none" />
            </div>
          )}
          <div className="pt-2 border-t border-border">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              {amount === 0 ? 'Plată — GRATIS (skip Stripe)' : 'Link plată (pentru deblocare full)'}
            </div>
            {amount === 0 && (
              <div className="text-[11px] text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded p-2 mb-2">
                💡 Sumă = 0 → melodia se generează gratis. Nu se trimite link de plată. Varianta completă se deblochează automat.
              </div>
            )}
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Sumă</label>
                <div className="flex items-center">
                  <input type="number" min={0.5} step={0.01} value={(amount / 100).toFixed(2)} onChange={(e) => setAmount(Math.round(parseFloat(e.target.value || '0') * 100))} className="w-full h-9 px-3 text-sm rounded-l-md bg-secondary/40 border border-border focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Valută</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none">
                  <option value="RON">RON</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="BGN">BGN</option>
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs text-muted-foreground block mb-1">Descriere produs (opțional)</label>
              <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={`Manea personalizată pentru ${recipientName || '...'}`} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none" />
            </div>
          </div>
          {error && <div className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy
              ? 'Lansez...'
              : amount === 0
                ? 'Generează GRATIS'
                : 'Lansează demo + trimite plată'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Buton „+" care deschide dropdown cu 4 acțiuni (attach / payment / lyrics / demo). */
function ActionsMenu({
  onAttach,
  onPayment,
  onLyrics,
  onDemo,
}: {
  onAttach: () => void;
  onPayment: () => void;
  onLyrics: () => void;
  onDemo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const item = (
    icon: React.ReactNode,
    label: string,
    sublabel: string,
    onClick: () => void,
    highlight = false,
  ) => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className={cn(
        'flex items-start gap-3 w-full px-3 py-2 text-left hover:bg-secondary/60 transition-colors first:rounded-t-md last:rounded-b-md',
        highlight && 'bg-primary/10',
      )}
    >
      <div className={cn('h-8 w-8 rounded-md flex items-center justify-center shrink-0', highlight ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground')}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground leading-snug">{sublabel}</div>
      </div>
    </button>
  );

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Acțiuni"
        className={cn(
          'inline-flex items-center justify-center h-10 w-10 rounded-full border border-border bg-secondary/40 hover:bg-secondary transition-colors',
          open && 'bg-secondary',
        )}
      >
        <Plus className={cn('h-4 w-4 transition-transform', open && 'rotate-45')} />
      </button>
      {open && (
        <div className="absolute bottom-12 left-0 z-40 w-72 rounded-md border border-border bg-card shadow-lg overflow-hidden">
          {item(<Sparkles className="h-4 w-4" />, 'Demo + Plată', 'Generează demo 30s + link plată cu unlock automat', onDemo, true)}
          <div className="h-px bg-border" />
          {item(<Paperclip className="h-4 w-4" />, 'Atașament', 'Imagine / PDF (max 5MB)', onAttach)}
          {item(<CreditCard className="h-4 w-4" />, 'Link plată', 'Stripe Checkout cu preț custom', onPayment)}
          {item(<Sparkles className="h-4 w-4" />, 'Generează versuri', 'Preview AI fără să lansezi Suno', onLyrics)}
        </div>
      )}
    </div>
  );
}

/** Textarea care crește singur de la 1 la max 6 rânduri (40-160px). */
function AutoGrowTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = 160; // ~6 rânduri
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSubmit();
        }
      }}
      rows={1}
      placeholder={placeholder}
      className="flex-1 resize-none px-3 py-2.5 text-sm rounded-lg bg-secondary/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60 leading-snug min-h-[40px] max-h-[160px] overflow-y-auto"
    />
  );
}

/**
 * Sidebar dreapta cu 2 taburi:
 *  - Răspunsuri: quick replies predefinite cu CRUD inline (text + culoare)
 *  - AI Assistant: wrapper peste vechiul AssistantPanel
 */
function ChatRightSidebar({
  conversationId,
  detectedLang,
  onInsertDraft,
  formState,
  online,
}: {
  conversationId: string | null;
  detectedLang: string | null | undefined;
  onInsertDraft: (text: string) => void;
  formState: GeneratorFormState | null;
  online: boolean;
}) {
  const [tab, setTab] = useState<'replies' | 'ai'>('replies');

  return (
    <aside className="hidden lg:flex w-80 shrink-0 border border-border rounded-xl bg-card/40 flex-col overflow-hidden">
      <div className="grid grid-cols-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('replies')}
          className={cn(
            'px-3 py-2.5 text-xs uppercase tracking-wider font-semibold border-b-2 transition-colors',
            tab === 'replies' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          Răspunsuri
        </button>
        <button
          type="button"
          onClick={() => setTab('ai')}
          className={cn(
            'px-3 py-2.5 text-xs uppercase tracking-wider font-semibold border-b-2 transition-colors',
            tab === 'ai' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          AI Assistant
        </button>
      </div>

      {tab === 'replies' ? (
        <QuickRepliesTab
          onInsert={onInsertDraft}
          footer={
            formState && conversationId ? (
              <WizardLivePanel formState={formState} online={online} conversationId={conversationId} />
            ) : null
          }
        />
      ) : (
        <AssistantPanel
          contextKind="chat"
          refId={conversationId}
          detectedLang={detectedLang}
          onInsertDraft={onInsertDraft}
        />
      )}
    </aside>
  );
}

/** Listă quick replies + CRUD inline (add/edit/delete). `footer` = panou opțional sub listă. */
function QuickRepliesTab({ onInsert, footer }: { onInsert: (text: string) => void; footer?: React.ReactNode }) {
  const { data: replies, refetch } = useAsync(() => ChatApi.listQuickReplies(), [], { refetchInterval: undefined });
  const [editing, setEditing] = useState<QuickReply | 'new' | null>(null);

  async function deleteReply(id: string) {
    if (!confirm('Ștergi răspunsul predefinit?')) return;
    await ChatApi.deleteQuickReply(id);
    refetch();
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
      <div className="text-[11px] text-muted-foreground leading-snug">
        Click pe un răspuns ca să-l bag în input. Folosește butonul „+" pentru a defini unul nou.
      </div>
      {replies && replies.length === 0 && (
        <div className="text-xs text-muted-foreground italic py-2">
          Nici un răspuns încă. Apasă „+ Adaugă" mai jos.
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {replies?.map((r) => (
          <div key={r.id} className="group flex items-stretch gap-1">
            <button
              type="button"
              onClick={() => onInsert(r.text)}
              title={r.text}
              className="flex-1 min-w-0 text-left text-xs px-3 py-2 rounded-md border transition-colors hover:brightness-110"
              style={{
                background: `${r.color}22`,
                borderColor: `${r.color}55`,
                color: r.color,
              }}
            >
              <div className="font-semibold break-words">{r.label}</div>
              <div
                className="text-[10px] opacity-70 font-normal leading-snug"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                }}
              >
                {r.text}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setEditing(r)}
              title="Editează"
              className="opacity-0 group-hover:opacity-100 transition-opacity h-auto px-1.5 rounded-md border border-border bg-secondary/40 hover:bg-secondary"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => deleteReply(r.id)}
              title="Șterge"
              className="opacity-0 group-hover:opacity-100 transition-opacity h-auto px-1.5 rounded-md border border-border bg-secondary/40 hover:bg-destructive/20 hover:border-destructive/40"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={() => setEditing('new')} className="mt-2">
        <Plus className="h-3.5 w-3.5" />
        Adaugă răspuns
      </Button>
      {footer}
      {editing && (
        <QuickReplyEditModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function QuickReplyEditModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: QuickReply | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [color, setColor] = useState(initial?.color ?? '#d4af37');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!label.trim() || !text.trim()) {
      setError('Eticheta și textul sunt obligatorii');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (initial) {
        await ChatApi.updateQuickReply(initial.id, { label, text, color });
      } else {
        await ChatApi.createQuickReply({ label, text, color });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const PRESETS = ['#d4af37', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#f59e0b', '#ec4899', '#6b7280'];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-4">
          {initial ? 'Editează răspuns' : 'Răspuns nou predefinit'}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Etichetă (buton)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
              autoFocus
              placeholder="ex. Bun venit, Preț, Mulțumesc"
              className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Text ({text.length}/2000)</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Textul care va fi inserat în input"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Culoare</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 rounded-md border border-border bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                maxLength={16}
                className="flex-1 h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none font-mono"
              />
            </div>
            <div className="flex gap-1.5 mt-2">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn('h-6 w-6 rounded border-2', color === c ? 'border-foreground' : 'border-border')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          {error && <div className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Salvează
          </Button>
        </div>
      </div>
    </div>
  );
}

function TypingPill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 border border-success/30 text-success text-xs">
      <TypingDots />
      <span>{label}...</span>
    </div>
  );
}

function LyricsPreviewModal({
  conversationId,
  onClose,
  onInsertInDraft,
}: {
  conversationId: string | null;
  onClose: () => void;
  onInsertInDraft: (text: string) => void;
}) {
  const [styleId, setStyleId] = useState(GEN_STYLES[1].id);
  const [occasionId, setOccasionId] = useState(GEN_OCCASIONS[0].id);
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [voiceId, setVoiceId] = useState(GEN_VOICES[0].id);
  const [dedication, setDedication] = useState('');
  const [refine, setRefine] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ draft: string; refined?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [aiPrefilling, setAiPrefilling] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  async function aiPrefill() {
    if (!conversationId) return;
    setAiPrefilling(true);
    setError(null);
    try {
      const r = await ChatApi.summarizeOrder(conversationId);
      applyOrderToForm(r, {
        setStyleId, setOccasionId, setRecipientName, setMessage,
        setVoiceId, setDedication,
      });
      setAiSummary(r.summary);
    } catch (e) {
      setError(`Eșec AI pre-fill: ${(e as Error).message}`);
    } finally {
      setAiPrefilling(false);
    }
  }

  async function generate() {
    if (!recipientName.trim() || !message.trim()) {
      setError('Numele beneficiarului și mesajul sunt obligatorii');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const styleName = GEN_STYLES.find((s) => s.id === styleId)?.name ?? styleId;
      const occasionName = GEN_OCCASIONS.find((o) => o.id === occasionId)?.name ?? occasionId;
      const r = await ChatApi.previewLyrics({
        style: styleName,
        occasion: occasionName,
        recipientName: recipientName.trim(),
        message: message.trim(),
        voiceArtist: voiceId,
        dedication: dedication.trim() || undefined,
        refine,
      });
      setResult({ draft: r.draft, refined: r.refined });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const finalLyrics = result?.refined ?? result?.draft ?? '';

  async function copyToClipboard() {
    if (!finalLyrics) return;
    try {
      await navigator.clipboard.writeText(finalLyrics);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {/* ignore */}
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Generează versuri pentru manea</h3>
        </div>

        {!result && conversationId && (
          <>
            <button
              type="button"
              onClick={aiPrefill}
              disabled={aiPrefilling}
              className="w-full mb-3 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-60"
            >
              {aiPrefilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {aiPrefilling ? 'AI extrage datele...' : '✨ Pre-completează din conversație'}
            </button>
            {aiSummary && (
              <div className="mb-3 text-[11px] text-muted-foreground bg-secondary/30 border border-border rounded p-2 italic">
                {aiSummary}
              </div>
            )}
          </>
        )}

        {!result && (
          <>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Stil</label>
                  <select value={styleId} onChange={(e) => setStyleId(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none">
                    {GEN_STYLES.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Ocazie</label>
                  <select value={occasionId} onChange={(e) => setOccasionId(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none">
                    {GEN_OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.emoji} {o.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Beneficiar — pentru cine</label>
                <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="ex. Costel, Mariana, șefu' Florin..." maxLength={120} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Mesaj / dedicație ({message.length}/600)</label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={600} placeholder="ex. La mulți ani, șefule! Să dea Domnu' să luăm bonus..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Voce / artist</label>
                  <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none">
                    {GEN_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.tag}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">De la (opțional)</label>
                  <input type="text" value={dedication} onChange={(e) => setDedication(e.target.value)} maxLength={120} placeholder="ex. de la Andrei și echipa" className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={refine} onChange={(e) => setRefine(e.target.checked)} />
                <span>Rafinează cu pass-ul de critic (rezultate mai bune, +5s)</span>
              </label>
              {error && <div className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</div>}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button>
              <Button onClick={generate} disabled={busy || !recipientName.trim() || !message.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {busy ? 'Generez...' : 'Generează versuri'}
              </Button>
            </div>
          </>
        )}

        {result && (
          <>
            <div className="rounded-lg border border-border bg-secondary/20 p-3 mb-3 max-h-[50vh] overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">{finalLyrics}</pre>
            </div>
            <div className="flex flex-wrap justify-between items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setResult(null)}>← Înapoi la formular</Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyToClipboard}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : null}
                  {copied ? 'Copiat!' : 'Copy text'}
                </Button>
                <Button size="sm" onClick={() => onInsertInDraft(finalLyrics)}>
                  <Send className="h-3.5 w-3.5" />
                  Inserează în răspuns
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Editează body-ul unui mesaj admin existent (text simplu). */
function EditMessageModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminChatMessage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = body.trim();
    if (!trimmed) {
      setError('Textul nu poate fi gol');
      return;
    }
    if (trimmed === initial.body) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ChatApi.editMessage(initial.id, trimmed);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-3">Editează mesaj</h3>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Textul mesajului"
        />
        <p className="text-[11px] text-muted-foreground mt-2">
          Userul va vedea instant noua versiune cu badge „(editat)". Cmd/Ctrl+Enter pentru a salva, Esc pentru a anula.
        </p>
        {error && <div className="text-xs text-destructive bg-destructive/10 rounded p-2 mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button>
          <Button onClick={save} disabled={busy || !body.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Salvează
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Confirm ștergere mesaj — Enter confirmă, Esc anulează. */
function ConfirmDeleteMessageModal({
  message,
  onClose,
  onConfirm,
}: {
  message: AdminChatMessage;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-2">Șterge mesajul?</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Userul îl va vedea dispărând imediat. Acțiunea e ireversibilă în UI (rândul rămâne în DB pentru audit).
        </p>
        <div className="text-xs italic bg-secondary/40 border border-border rounded p-2 mb-4 max-h-20 overflow-y-auto">
          {message.body.slice(0, 200)}{message.body.length > 200 ? '…' : ''}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Anulează (Esc)</Button>
          <Button variant="destructive" onClick={onConfirm}>
            <Trash2 className="h-3.5 w-3.5" />
            Șterge (Enter)
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Setează emailul pe sesiunea curentă (ca și cum userul l-ar fi completat). */
function SetEmailModal({
  current,
  onClose,
  onSave,
}: {
  current: string;
  onClose: () => void;
  onSave: (email: string) => void | Promise<void>;
}) {
  const [email, setEmail] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function save() {
    if (!validEmail) {
      setError('Email invalid');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(email.trim().toLowerCase());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-1">Setează email pe sesiune</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Atribui un email direct pe sesiunea curentă. Util când ai obținut adresa
          prin chat și vrei să o salvezi fără să ceri userului să o introducă în formular.
        </p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && validEmail) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="client@example.com"
          autoFocus
          className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none"
        />
        {error && <div className="text-xs text-destructive bg-destructive/10 rounded p-2 mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button>
          <Button onClick={save} disabled={busy || !validEmail}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Salvează
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Editează nota privată admin (vizibilă doar în admin UI). */
const REVIEW_RATINGS: { value: ReviewRating; label: string; cls: string }[] = [
  { value: 'good', label: '👍 Bună', cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' },
  { value: 'needs_work', label: '🛠️ De îmbunătățit', cls: 'bg-amber-500/15 border-amber-500/40 text-amber-400' },
  { value: 'bad', label: '👎 Proastă', cls: 'bg-red-500/15 border-red-500/40 text-red-400' },
];

const REVIEW_CATEGORIES: { value: ReviewCategory; label: string }[] = [
  { value: 'price', label: 'Preț / cotare' },
  { value: 'package', label: 'Pachete' },
  { value: 'tone', label: 'Ton' },
  { value: 'flow', label: 'Flux / ordine pași' },
  { value: 'accuracy', label: 'Acuratețe (a inventat)' },
  { value: 'escalation', label: 'Escaladare' },
  { value: 'other', label: 'Altele' },
];

function ConversationReviewModal({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const [existing, setExisting] = useState<ConversationReview[]>([]);
  const [rating, setRating] = useState<ReviewRating>('needs_work');
  const [category, setCategory] = useState<ReviewCategory>('other');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setExisting(await AiChatApi.reviewList({ conversationId }));
    } catch {
      /* ignore */
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      await AiChatApi.reviewCreate({ conversationId, rating, category, comment: comment.trim() || undefined });
      setComment('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await AiChatApi.reviewDelete(id);
    await load();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-1">Review conversație AI</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Verdictul tău intră în coada skill-ului <code>/improve-ai-chat</code>, care analizează
          review-urile și îmbunătățește comportamentul Irinei.
        </p>

        <label className="block text-xs font-medium text-muted-foreground mb-1">Verdict</label>
        <div className="flex gap-2 mb-3">
          {REVIEW_RATINGS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRating(r.value)}
              className={cn(
                'flex-1 h-9 rounded-md border text-xs font-medium transition-colors',
                rating === r.value ? r.cls : 'bg-secondary/40 border-border text-muted-foreground hover:bg-secondary',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-muted-foreground mb-1">Categorie</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ReviewCategory)}
          className="w-full h-9 mb-3 rounded-md border border-border bg-secondary/40 px-2 text-sm"
        >
          {REVIEW_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <label className="block text-xs font-medium text-muted-foreground mb-1">Comentariu</label>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="ex. A sărit upsell-ul de pachet și a finalizat direct pe basic. Ar fi trebuit să ofere și premium."
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void save();
            }
          }}
        />
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Închide</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Salvează review (Cmd+Enter)
          </Button>
        </div>

        {existing.length > 0 && (
          <div className="mt-5 border-t border-border pt-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Review-uri pe această conversație ({existing.length})
            </div>
            <div className="flex flex-col gap-2">
              {existing.map((r) => {
                const meta = REVIEW_RATINGS.find((x) => x.value === r.rating);
                const cat = REVIEW_CATEGORIES.find((x) => x.value === r.category);
                return (
                  <div key={r.id} className="rounded-md border border-border bg-secondary/30 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="flex items-center gap-2">
                        <span className={cn('px-1.5 py-0.5 rounded border', meta?.cls)}>{meta?.label ?? r.rating}</span>
                        <span className="text-muted-foreground">{cat?.label ?? r.category}</span>
                        {r.resolved && <span className="text-emerald-500">✓ rezolvat</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        className="text-muted-foreground hover:text-red-400"
                        title="Șterge review"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {r.comment && <p className="whitespace-pre-wrap break-words text-foreground/90">{r.comment}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {r.createdByEmail ?? 'admin'} · {format(new Date(r.createdAt), 'd MMM HH:mm', { locale: ro })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminNoteModal({
  current,
  onClose,
  onSave,
}: {
  current: string;
  onClose: () => void;
  onSave: (note: string | null) => void | Promise<void>;
}) {
  const [note, setNote] = useState(current);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await onSave(note.trim() || null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-1">Notă privată admin</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Vizibilă doar în admin UI. Folosește pentru status, context sau TODO pentru când revii la conversație.
        </p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="ex. Aștept să primesc emailul, sau: comandă suspendată până vineri..."
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button>
          {current && (
            <Button variant="destructive" onClick={() => onSave(null)} disabled={busy}>
              Șterge nota
            </Button>
          )}
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Salvează (Cmd+Enter)
          </Button>
        </div>
      </div>
    </div>
  );
}

function BlockPersonModal({
  conversationId,
  ip,
  email,
  onClose,
  onBlocked,
}: {
  conversationId: string;
  ip: string | null;
  email: string | null;
  onClose: () => void;
  onBlocked: () => void;
}) {
  const [blockIp, setBlockIp] = useState(!!ip);
  const [blockEmail, setBlockEmail] = useState(!!email && !ip);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<ChatBlacklistEntry[]>([]);

  const loadEntries = useCallback(async () => {
    try {
      setEntries(await ChatApi.listBlacklist());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function block() {
    if (!blockIp && !blockEmail) return;
    setBusy(true);
    try {
      await ChatApi.blockConversation(conversationId, {
        blockIp,
        blockEmail,
        reason: reason.trim() || undefined,
      });
      onBlocked();
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(id: string) {
    await ChatApi.removeBlacklist(id);
    void loadEntries();
  }

  const nothingToBlock = !ip && !email;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <Ban className="h-5 w-5 text-red-400" />
          <h3 className="text-base font-semibold">Blochează persoana</h3>
        </div>

        {nothingToBlock ? (
          <p className="text-sm text-muted-foreground">
            Nu există IP sau email cunoscut pentru această conversație. Persoana poate fi blocată
            după ce trimite un mesaj sau își setează email-ul.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-3">
              Persoana blocată nu va mai putea trimite mesaje pe acest site, iar conexiunea
              activă va fi întreruptă imediat.
            </p>
            <div className="space-y-2">
              <label
                className={cn(
                  'flex items-center gap-2 rounded-md border p-2.5 text-sm',
                  ip ? 'border-border cursor-pointer' : 'border-border/50 opacity-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={blockIp}
                  disabled={!ip}
                  onChange={(e) => setBlockIp(e.target.checked)}
                />
                <span>Blochează IP:</span>
                <span className="font-mono text-xs">{ip ?? 'necunoscut'}</span>
              </label>
              <label
                className={cn(
                  'flex items-center gap-2 rounded-md border p-2.5 text-sm',
                  email ? 'border-border cursor-pointer' : 'border-border/50 opacity-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={blockEmail}
                  disabled={!email}
                  onChange={(e) => setBlockEmail(e.target.checked)}
                />
                <span>Blochează email:</span>
                <span className="font-mono text-xs truncate">{email ?? 'necunoscut'}</span>
              </label>
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Motiv (opțional) — ex. spam, abuz..."
              className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button>
              <Button variant="destructive" onClick={block} disabled={busy || (!blockIp && !blockEmail)}>
                {busy ? <Loader2 className="animate-spin" /> : <Ban className="h-4 w-4" />}
                Blochează
              </Button>
            </div>
          </>
        )}

        {entries.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Blocate pe acest site ({entries.length})
            </h4>
            <ul className="space-y-1.5 max-h-52 overflow-y-auto">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <Badge variant="muted">{e.type === 'ip' ? 'IP' : 'email'}</Badge>
                  <span className="font-mono text-xs truncate flex-1" title={e.reason ?? undefined}>
                    {e.value}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeEntry(e.id)}
                    title="Deblochează"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border text-muted-foreground hover:bg-secondary"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function RenameModal({
  current,
  onClose,
  onSave,
}: {
  current: string;
  onClose: () => void;
  onSave: (subject: string) => void;
}) {
  const [subject, setSubject] = useState(current);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <Pencil className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Redenumește conversația</h3>
        </div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
          Subiect (max 200 caractere)
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && subject.trim()) { setBusy(true); onSave(subject.trim()); }
            if (e.key === 'Escape') onClose();
          }}
          className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button>
          <Button
            onClick={() => { setBusy(true); onSave(subject.trim()); }}
            disabled={busy || !subject.trim() || subject.trim() === current}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Check />}
            Salvează
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  label,
  onClose,
  onConfirm,
}: {
  label: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // Focus pe butonul Șterge la deschidere + Enter/Escape shortcuts global
  useEffect(() => {
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!busy) {
          setBusy(true);
          onConfirm();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-destructive/40 rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <Trash2 className="h-5 w-5 text-destructive" />
          <h3 className="text-base font-semibold">Șterge conversația definitiv</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Vei pierde TOATE mesajele din <b className="text-foreground">{label}</b>, inclusiv plățile asociate (din chat) și audit-ul AI. Această acțiune <b className="text-destructive">nu poate fi anulată</b>.
        </p>
        <div className="text-[11px] text-muted-foreground mb-3">
          <kbd className="px-1.5 py-0.5 rounded bg-secondary/40 border border-border">Enter</kbd> confirmă · <kbd className="px-1.5 py-0.5 rounded bg-secondary/40 border border-border">Esc</kbd> anulează
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button>
          <Button
            ref={confirmBtnRef}
            variant="destructive"
            onClick={() => { setBusy(true); onConfirm(); }}
            disabled={busy}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Șterge definitiv
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Stilurile, ocaziile și vocile — replicate exact din wizard-ul user
 *  (apps/web/lib/seed-data.ts). ID-ul intern coincide cu ce trimite formularul. */
const GEN_STYLES = [
  { id: 'clasic', emoji: '🎻', name: 'Clasică de pahar' },
  { id: 'modern', emoji: '🎹', name: 'Modernă' },
  { id: 'oriental', emoji: '🪘', name: 'Orientală' },
  { id: 'trompeta', emoji: '🎺', name: 'Cu trompetă' },
  { id: 'romantica', emoji: '💔', name: 'De jale' },
  { id: 'comerciala', emoji: '💃', name: 'Comercială' },
  { id: 'opulenta', emoji: '👑', name: 'De opulență' },
  { id: 'iubire', emoji: '❤️', name: 'De iubire' },
  { id: 'tallava', emoji: '🎷', name: 'Tallava' },
  { id: 'kuchek', emoji: '🥁', name: 'Kuchek' },
  { id: 'trapanele', emoji: '🎧', name: 'Trapanele' },
  { id: 'pahar', emoji: '🍷', name: 'De pahar' },
];

const GEN_OCCASIONS = [
  { id: 'zi', emoji: '🎂', name: 'Zi naștere' },
  { id: 'nunta', emoji: '💒', name: 'Nuntă' },
  { id: 'botez', emoji: '👶', name: 'Botez' },
  { id: 'cumatrie', emoji: '🍷', name: 'Cumătrie' },
  { id: 'cuplu', emoji: '❤️', name: 'Aniv. cuplu' },
  { id: 'sef', emoji: '💼', name: 'Pentru șef' },
  { id: 'dragoste', emoji: '😍', name: 'Declarație' },
  { id: 'roast', emoji: '🤡', name: 'Roast prieten' },
  { id: 'nas', emoji: '🤝', name: 'Naș / fin' },
  { id: 'inmorm', emoji: '🕯️', name: 'Înmormântare' },
  { id: 'motiv', emoji: '💪', name: 'Motivațională' },
  { id: 'altul', emoji: '✨', name: 'Altă ocazie' },
];

const GEN_VOICES = [
  { id: 'male', name: 'Bărbătească', tag: 'voce de bărbat' },
  { id: 'female', name: 'Feminină', tag: 'voce de femeie' },
];

function LaunchGenerationModal({
  conversationId,
  paymentId,
  defaultPackageTier,
  defaultEmail,
  onClose,
  onLaunched,
}: {
  conversationId: string;
  paymentId: string;
  defaultPackageTier?: PackageTier;
  defaultEmail?: string | null;
  onClose: () => void;
  onLaunched: () => void;
}) {
  const [styleId, setStyleId] = useState(GEN_STYLES[1].id); // Modernă default
  const [occasionId, setOccasionId] = useState(GEN_OCCASIONS[0].id); // Zi naștere
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [voiceId, setVoiceId] = useState(GEN_VOICES[0].id); // male
  const [dedication, setDedication] = useState('');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [customLyricsOpen, setCustomLyricsOpen] = useState(false);
  const [customLyrics, setCustomLyrics] = useState('');
  const [packageTier, setPackageTier] = useState<PackageTier>(defaultPackageTier ?? 'basic');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!recipientName.trim()) return 'Numele beneficiarului e obligatoriu';
    if (!message.trim()) return 'Mesajul / dedicația e obligatorie';
    if (recipientName.trim().length > 120) return 'Numele beneficiarului prea lung (max 120)';
    if (message.trim().length > 600) return 'Mesajul prea lung (max 600)';
    if (dedication && dedication.length > 120) return 'Dedicația „de la" prea lungă (max 120)';
    if (customLyrics && customLyrics.length > 4000) return 'Versurile prea lungi (max 4000)';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Email invalid';
    return null;
  }

  async function launch() {
    const err = validate();
    if (err) { setError(err); return; }
    setBusy(true);
    setError(null);
    try {
      const styleName = GEN_STYLES.find((s) => s.id === styleId)?.name ?? styleId;
      const occasionName = GEN_OCCASIONS.find((o) => o.id === occasionId)?.name ?? occasionId;
      await ChatApi.launchGeneration(conversationId, {
        paymentId,
        style: styleName,
        occasion: occasionName,
        recipientName: recipientName.trim(),
        message: message.trim(),
        voiceArtist: voiceId,
        dedication: dedication.trim() || undefined,
        customLyrics: customLyrics.trim() || undefined,
        packageTier,
        email: email.trim() || undefined,
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
      <div
        className="bg-card border border-border rounded-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Lansează generare (plată confirmată)</h3>
        </div>
        <div className="space-y-3">
          {/* Stil + Ocazie */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Stil</label>
              <select
                value={styleId}
                onChange={(e) => setStyleId(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none"
              >
                {GEN_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Ocazie</label>
              <select
                value={occasionId}
                onChange={(e) => setOccasionId(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none"
              >
                {GEN_OCCASIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.emoji} {o.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Beneficiar */}
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
              Beneficiar — pentru cine e maneaua
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="ex. Costel, Mariana, șefu' Florin..."
              maxLength={120}
              className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none"
            />
          </div>

          {/* Mesaj */}
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
              Mesaj / ce vrea să-i transmită <span className="text-muted-foreground/60">({message.length}/600)</span>
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="ex. La mulți ani, șefule! Să dea Domnu' să luăm bonus de Crăciun..."
            />
          </div>

          {/* Voce + Dedicație "de la" */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">Voce / artist</label>
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none"
              >
                {GEN_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} — {v.tag}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
                Dedicație „de la" (opțional)
              </label>
              <input
                type="text"
                value={dedication}
                onChange={(e) => setDedication(e.target.value)}
                maxLength={120}
                placeholder="ex. de la Andrei și echipa"
                className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
              Email pentru livrare {defaultEmail ? <span className="text-emerald-500 font-normal normal-case">(deja setat: {defaultEmail})</span> : <span className="text-destructive">*</span>}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={defaultEmail || 'client@email.ro'}
              className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none"
            />
          </div>

          {/* Custom lyrics expandable */}
          <div>
            <button
              type="button"
              onClick={() => setCustomLyricsOpen((v) => !v)}
              className="text-xs uppercase tracking-wider text-muted-foreground font-semibold hover:text-foreground flex items-center gap-1.5"
            >
              📝 Versuri custom (opțional) <span className="text-[10px] normal-case">{customLyricsOpen ? '— ascunde' : '— activează'}</span>
            </button>
            {customLyricsOpen && (
              <Textarea
                value={customLyrics}
                onChange={(e) => setCustomLyrics(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder={`Scrie aici versurile dacă vrei. Lasă gol = AI scrie pe baza mesajului.\n\nRefren:\n...\nCuplet:\n...`}
                className="mt-1.5 font-mono text-xs"
              />
            )}
            {customLyricsOpen && (
              <div className="text-[10px] text-muted-foreground mt-1">{customLyrics.length}/4000</div>
            )}
          </div>

          {/* Pachet */}
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
              Pachet
            </label>
            <select
              value={packageTier}
              onChange={(e) => setPackageTier(e.target.value as PackageTier)}
              className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none"
            >
              {PACKAGE_OPTIONS.map((p) => (
                <option key={p.tier} value={p.tier}>
                  {p.label} — {(p.defaultCents / 100).toFixed(2)} ({p.features})
                </option>
              ))}
            </select>
          </div>

          {error && <div className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</div>}
          <div className="text-[11px] text-muted-foreground bg-secondary/30 rounded p-2">
            Plata e deja confirmată. Generarea pornește imediat după Launch — userul va primi mesaj automat în chat + email când e gata (~90s).
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Anulează</Button>
          <Button onClick={launch} disabled={busy || !recipientName.trim() || !message.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Zap />}
            Lansează generare
          </Button>
        </div>
      </div>
    </div>
  );
}
