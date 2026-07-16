'use client';

import { useEffect, useRef, useState } from 'react';
import { useAsync, useAsyncCallback } from '@/lib/hooks/use-async';
import { AdminApi, type OrderDetail, type AdminVariation, type AdminCollage } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Empty } from '@/components/ui/empty';
import { TabsContent } from '@/components/ui/tabs';
import { ResponsiveTabs, type ResponsiveTab } from '@/components/ui/responsive-tabs';
import { useToast } from '@/components/ui/use-toast';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { format, formatDistanceStrict } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  Film,
  Info,
  Layers,
  Loader2,
  Mail,
  MessageSquare,
  Mic2,
  Music2,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Shuffle,
  Sparkles,
  Trash2,
  Upload,
  User,
  Wand2,
  X,
} from 'lucide-react';

/**
 * Modal full-screen pentru o comandă completă (payment + generation + chat +
 * suno logs + lyrics logs + emails + analytics + ai tool calls + timeline).
 * Înlocuiește drawer-ul vechi. ID = paymentId SAU generationId (server-ul
 * acceptă ambele și completează cealaltă latură automat).
 */

/** Mapează id-ul vocii la eticheta prietenoasă (male/female). Legacy → valoarea brută. */
function voiceLabel(v: string | null | undefined): string {
  if (v === 'male') return 'Bărbătească';
  if (v === 'female') return 'Feminină';
  return v ?? '';
}

/** Mapează pachetul la etichetă prietenoasă cu preț. Legacy/necunoscut → valoarea brută. */
function packageLabel(t: string | null | undefined): string {
  if (t === 'basic') return 'Bază (29,99)';
  if (t === 'plus') return 'Plus (49,99)';
  if (t === 'premium') return 'Premium (69,99)';
  return t ?? '';
}

export function OrderDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, loading, refetch } = useAsync(() => AdminApi.orderDetail(id), [id]);

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-x-4 inset-y-6 z-50 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[hsl(220_22%_9%)] shadow-2xl md:inset-x-12 md:inset-y-8 lg:inset-x-20 lg:inset-y-10"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Detalii comandă</DialogPrimitive.Title>
          <header className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-amber-300" />
              Detalii comandă
              {data?.generation && (
                <span className="text-sm font-normal text-muted-foreground">
                  · {data.generation.recipientName}
                </span>
              )}
            </h2>
            <DialogPrimitive.Close
              className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-white"
              aria-label="Închide"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading || !data ? (
              <Skeleton className="h-96 w-full" />
            ) : (
              <OrderTabs data={data} refetch={refetch} />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function OrderTabs({ data, refetch }: { data: OrderDetail; refetch: () => Promise<void> }) {
  const chatCount = data.chat?.messages.length ?? 0;
  const chatFallback = data.chat?.linkType === 'recent_fallback';
  const sunoCount = data.sunoLogs.length;
  const lyricsCount = data.lyricsLogs.length;
  const emailCount = data.outboundEmails.length;
  const eventCount = data.analytics.events.length;
  const toolCount = data.chat?.aiToolCalls.length ?? 0;
  const [tab, setTab] = useState('overview');

  const tabs: ResponsiveTab[] = [
    { value: 'overview', label: 'Privire generală' },
    { value: 'form', label: 'Comandă (formular)' },
    { value: 'payment', label: 'Plată' },
    { value: 'audio', label: 'Audio + versuri' },
    ...(data.generation ? [{ value: 'studio', label: '🎚 Studio' }] : []),
    { value: 'suno', label: `Suno (${sunoCount})` },
    { value: 'openai', label: `OpenAI (${lyricsCount})` },
    { value: 'emails', label: `Email (${emailCount})` },
    ...(chatCount > 0 ? [{ value: 'chat', label: `Chat (${chatCount})${chatFallback ? '?' : ''}` }] : []),
    ...(toolCount > 0 ? [{ value: 'ai-tools', label: `AI tools (${toolCount})` }] : []),
    { value: 'analytics', label: `Sursă (${eventCount})` },
    { value: 'timeline', label: `Cronologie (${data.timeline.length})` },
  ];

  return (
    <ResponsiveTabs value={tab} onValueChange={setTab} tabs={tabs}>
      <TabsContent value="overview"><OverviewTab data={data} refetch={refetch} /></TabsContent>
      <TabsContent value="form"><FormTab data={data} /></TabsContent>
      <TabsContent value="payment"><PaymentTab data={data} refetch={refetch} /></TabsContent>
      <TabsContent value="audio"><AudioTab data={data} /></TabsContent>
      {data.generation && (
        <TabsContent value="studio"><StudioTab data={data} refetch={refetch} /></TabsContent>
      )}
      <TabsContent value="suno"><SunoTab data={data} /></TabsContent>
      <TabsContent value="openai"><OpenAiTab data={data} /></TabsContent>
      <TabsContent value="emails"><EmailsTab data={data} /></TabsContent>
      {chatCount > 0 && <TabsContent value="chat"><ChatTab data={data} /></TabsContent>}
      {toolCount > 0 && <TabsContent value="ai-tools"><AiToolsTab data={data} /></TabsContent>}
      <TabsContent value="analytics"><AnalyticsTab data={data} /></TabsContent>
      <TabsContent value="timeline"><TimelineTab data={data} /></TabsContent>
    </ResponsiveTabs>
  );
}

// ============== TAB: Overview ==============

/**
 * Editor de „ambalaj" al comenzii — schimbă DIRECT tipul (demo/normal) și
 * nivelul pachetului (Bază/Plus/Premium) fără regenerarea melodiei. Vizibil în
 * Overview atât pe /generations cât și pe /payments (modal partajat). Serverul
 * setează câmpurile și, pentru comenzile normale, generează în fundal doar
 * livrabilele lipsă (imagini social / videoclip); pagina clientului reflectă
 * automat noul tip/pachet. Plata existentă nu e atinsă.
 */
function PackagingEditor({
  generationId,
  currentType,
  currentTier,
  refetch,
}: {
  generationId: string;
  currentType: 'demo' | 'full';
  currentTier: 'basic' | 'plus' | 'premium';
  refetch: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<'demo' | 'full'>(currentType);
  const [tier, setTier] = useState<'basic' | 'plus' | 'premium'>(currentTier);
  const [busy, setBusy] = useState(false);

  const dirty = type !== currentType || tier !== currentTier;
  const tierLabel = tier === 'basic' ? 'Bază' : tier === 'plus' ? 'Plus' : 'Premium';

  async function run() {
    if (!dirty) return;
    // Explicăm efectele concrete în funcție de ce anume se schimbă.
    const notes: string[] = [];
    if (type !== currentType) {
      notes.push(
        type === 'full'
          ? 'Tipul devine NORMAL → pagina publică servește maneaua COMPLETĂ (audio integral, vizibil oricui are linkul), nu demo-ul de 30s.'
          : 'Tipul devine DEMO → pagina publică revine la demo-ul de 30s (maneaua completă se re-blochează).',
      );
    }
    if (tier !== currentTier) {
      notes.push(
        `Pachetul devine ${tierLabel}. Melodia rămâne neschimbată; dacă noul pachet cere livrabile lipsă (imagini social / videoclip) și piesa e gata, se generează în fundal (1-2 min).`,
      );
    }
    notes.push('Plata existentă NU e modificată — diferența se încasează separat (link de plată din chat) dacă e cazul.');
    const ok = await confirmDialog({
      title: 'Aplici modificările comenzii?',
      description: (
        <span className="flex flex-col gap-2">
          {notes.map((n, i) => (
            <span key={i}>{n}</span>
          ))}
        </span>
      ),
      confirmText: 'Aplică',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await AdminApi.generationSetPackaging(generationId, {
        type: type !== currentType ? type : undefined,
        tier: tier !== currentTier ? tier : undefined,
      });
      toast({
        variant: 'success',
        title: 'Comandă actualizată',
        description: res.deliverablesQueued
          ? 'Livrabilele lipsă se generează în fundal (1-2 min).'
          : `Tip: ${res.type === 'full' ? 'normal' : 'demo'} · Pachet: ${res.packageTier}`,
      });
      await refetch();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Modificare eșuată', description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-white/5 pt-2.5">
      <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        Schimbă tip &amp; pachet · fără regenerare (melodia rămâne)
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'demo' | 'full')}
          className={inputCls + ' h-8 flex-1 py-0 text-xs'}
          disabled={busy}
          aria-label="Tip comandă"
        >
          <option value="demo" className="bg-[hsl(220_22%_9%)]">Demo</option>
          <option value="full" className="bg-[hsl(220_22%_9%)]">Normal</option>
        </select>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as 'basic' | 'plus' | 'premium')}
          className={inputCls + ' h-8 flex-1 py-0 text-xs'}
          disabled={busy}
          aria-label="Pachet"
        >
          <option value="basic" className="bg-[hsl(220_22%_9%)]">Bază</option>
          <option value="plus" className="bg-[hsl(220_22%_9%)]">Plus</option>
          <option value="premium" className="bg-[hsl(220_22%_9%)]">Premium</option>
        </select>
        <Button size="xs" variant="warning" onClick={run} loading={busy} disabled={busy || !dirty}>
          <CheckCircle2 />
          Aplică
        </Button>
      </div>
    </div>
  );
}

/**
 * „De la cine" e scris în două câmpuri diferite după originea comenzii:
 * `dedicatorName` la comenzile din chat (Irina) și `dedication` la cele din
 * formularul web (câmpul „Dedicație opțională (de la cine)").
 */
function dedicatorFrom(g: OrderDetail['generation']): string | null {
  return g?.dedicatorName?.trim() || g?.dedication?.trim() || null;
}

function OverviewTab({ data, refetch }: { data: OrderDetail; refetch: () => Promise<void> }) {
  const g = data.generation;
  const p = data.payment;
  const tier = (g?.packageTier ?? 'basic') as 'basic' | 'plus' | 'premium';
  const from = dedicatorFrom(g);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card title="Comandă" icon={<Music2 className="h-4 w-4" />}>
        {g ? (
          <>
            <Kv k="Destinatar" v={<span className="font-medium">{g.recipientName}</span>} />
            <Kv k="De la" v={from ? <span className="font-medium">{from}</span> : '—'} />
            <Kv k="Stil" v={<code>{g.style}</code>} />
            <Kv k="Voce" v={<code>{voiceLabel(g.voiceArtist)}</code>} />
            <Kv k="Ocazie" v={<code>{g.occasion}</code>} />
            <Kv k="Tip" v={<Badge variant={g.type === 'demo' ? 'info' : 'success'}>{g.type}</Badge>} />
            <Kv k="Status" v={<StatusBadge status={g.status} />} />
            <Kv k="Locale" v={g.locale} />
            {g.packageTier && (
              <Kv k="Pachet" v={<Badge variant="warning">{packageLabel(g.packageTier)}</Badge>} />
            )}
            {g.premium && <Kv k="Premium" v={<Badge variant="warning">premium</Badge>} />}
            {g.inferredFromChat && (
              <Kv k="Origine" v={<Badge variant="info">📩 Comandă din chat AI</Badge>} />
            )}
            <PackagingEditor
              generationId={g.id}
              currentType={g.type}
              currentTier={tier}
              refetch={refetch}
            />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Fără generation.</p>
        )}
      </Card>

      <Card title="Plată" icon={<CreditCard className="h-4 w-4" />}>
        {p ? (
          <>
            <Kv
              k="Sumă"
              v={
                <span className="font-mono">
                  {(p.amount / 100).toFixed(2)} {p.currency}
                </span>
              }
            />
            {p.amountRonCents != null && p.currency !== 'RON' && (
              <Kv k="În RON" v={`${(p.amountRonCents / 100).toFixed(2)} RON`} />
            )}
            <Kv k="Status" v={<StatusBadge status={p.status} />} />
            <Kv k="Provider" v={p.provider} />
            {p.failureReason && (
              <Kv k="Eroare" v={<span className="text-rose-300">{p.failureReason}</span>} />
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Demo gratuit — fără plată.</p>
        )}
      </Card>

      <Card title="Client" icon={<User className="h-4 w-4" />}>
        <Kv k="Tip" v={data.owner.kind} />
        <Kv k="Email" v={data.owner.email ?? '—'} />
        {data.owner.name && <Kv k="Nume" v={data.owner.name} />}
        {data.analytics.session?.countryName && (
          <Kv
            k="Loc"
            v={`${data.analytics.session.countryName} · ${data.analytics.session.city ?? '—'}`}
          />
        )}
        {data.analytics.session?.device && (
          <Kv
            k="Device"
            v={`${data.analytics.session.device} · ${data.analytics.session.browserName ?? '-'} ${data.analytics.session.browserVersion ?? ''} · ${data.analytics.session.osName ?? '-'}`}
          />
        )}
        {data.analytics.session?.source && (
          <Kv
            k="Sursă"
            v={`${data.analytics.session.source}${data.analytics.session.medium ? ` / ${data.analytics.session.medium}` : ''}`}
          />
        )}
        {data.analytics.session?.campaign && (
          <Kv k="Campanie" v={data.analytics.session.campaign} />
        )}
      </Card>

      <Card title="Timing" icon={<Clock className="h-4 w-4" />}>
        <Kv k="Creată" v={fmtDateTime(g?.createdAt ?? p?.createdAt)} />
        {data.timings.orderToPaymentMs != null && (
          <Kv k="Comandă → Plată inițiată" v={fmtDuration(data.timings.orderToPaymentMs)} />
        )}
        {data.timings.paymentInitToPaidMs != null && (
          <Kv k="Plată inițiată → Confirmată" v={fmtDuration(data.timings.paymentInitToPaidMs)} />
        )}
        {data.timings.orderToCompletedMs != null && (
          <Kv
            k="Comandă → Audio gata"
            v={<span className="text-emerald-300">{fmtDuration(data.timings.orderToCompletedMs)}</span>}
          />
        )}
        {data.timings.lyricsTotalMs != null && (
          <Kv k="Total OpenAI" v={fmtDuration(data.timings.lyricsTotalMs)} />
        )}
        {g?.completedAt && <Kv k="Finalizată" v={fmtDateTime(g.completedAt)} />}
      </Card>

      <Card title="Pipeline" icon={<RefreshCw className="h-4 w-4" />}>
        <Kv k="Apeluri OpenAI" v={String(data.lyricsLogs.length)} />
        <Kv k="Apeluri Suno" v={String(data.sunoLogs.length)} />
        <Kv k="Încercări totale (retryCount)" v={String(g?.retryCount ?? 0)} />
        {g?.providerJobId === 'manual' && (
          <Kv k="Marker" v={<Badge variant="success">upload manual</Badge>} />
        )}
        {g?.nextRetryAt && (
          <Kv
            k="Auto-retry"
            v={
              <span className="text-amber-300">
                {fmtDateTime(g.nextRetryAt)} (#{(g.retryCount ?? 0) + 1})
              </span>
            }
          />
        )}
        {g?.lastRetryAt && <Kv k="Ultima încercare" v={fmtDateTime(g.lastRetryAt)} />}
      </Card>

      <Card title="Status final" icon={<CheckCircle2 className="h-4 w-4" />}>
        <Kv
          k="Deblocată (paid)"
          v={
            g?.paidUnlocked ? (
              <Badge variant="success">DA</Badge>
            ) : (
              <Badge variant="muted">nu</Badge>
            )
          }
        />
        <Kv
          k="Parolă comandă (PIN)"
          v={
            g?.unlockPin ? (
              <code className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-sm tracking-widest text-amber-200">
                {g.unlockPin}
              </code>
            ) : g?.hasUnlockPassword ? (
              <span className="text-muted-foreground">setată (PIN indisponibil)</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          }
        />
        {g?.audioUrl && (
          <Kv
            k="Audio MP3"
            v={
              <a
                href={g.audioUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                ascultă <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        )}
        {g?.id && (
          <Kv
            k="Pagina publică"
            v={
              <a
                href={`${data.site?.domain ? `https://${data.site.domain}` : ''}/m/${g.id}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                /m/{g.id.slice(0, 8)} <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        )}
        <Kv k="Vizualizări" v={String(g?.viewCount ?? 0)} />
      </Card>
    </div>
  );
}

// ============== TAB: Form ==============

const COLLAGE_ASPECTS: { value: string; label: string }[] = [
  { value: '9x16', label: '9:16 (TikTok/Story)' },
  { value: '1x1', label: '1:1 (pătrat)' },
  { value: '16x9', label: '16:9 (YouTube)' },
];

function collageKindLabel(c: AdminCollage): string {
  return c.kind === 'image_video'
    ? 'Videoclip cu o poză'
    : `Colaj slideshow · ${c.imageCount} poze`;
}

/**
 * Gestionarea colajelor video ale unei comenzi din admin: vezi pozele încărcate
 * de client + colajele generate, încarcă poze proprii și pornește un colaj, sau
 * regenerează un colaj existent (aceleași poze, altă variantă). Fără email
 * automat către client — verifici rezultatul, apoi îl trimiți manual din chat.
 */
function CollageManager({ generationId, hasBonus }: { generationId: string; hasBonus: boolean }) {
  const { toast } = useToast();
  const [collages, setCollages] = useState<AdminCollage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [aspect, setAspect] = useState('9x16');
  const [track, setTrack] = useState<'main' | 'bonus'>('main');
  const [busy, setBusy] = useState<string | null>(null); // 'upload' | <collageId>
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    try {
      const r = await AdminApi.generationCollages(generationId);
      setCollages(r.collages);
    } catch {
      setCollages([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationId]);

  // Polling cât vreun colaj e în lucru.
  const anyWorking = !!collages?.some((c) => c.status === 'pending' || c.status === 'processing');
  useEffect(() => {
    if (!anyWorking) return;
    const id = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyWorking]);

  async function doUpload() {
    if (files.length === 0) {
      toast({ title: 'Alege cel puțin o imagine', variant: 'destructive' });
      return;
    }
    setBusy('upload');
    try {
      await AdminApi.generationCreateCollage(generationId, files, hasBonus ? track : 'main', aspect);
      setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      toast({ title: 'Colaj pornit', description: 'Se montează — apare mai jos în ~1-2 minute.' });
      await load();
    } catch (e) {
      toast({ title: 'Eroare la pornirea colajului', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function doRegen(c: AdminCollage) {
    setBusy(c.id);
    try {
      await AdminApi.generationRegenerateCollage(generationId, c.id);
      toast({ title: 'Regenerare pornită', description: 'Varianta nouă apare mai jos în ~1-2 minute.' });
      await load();
    } catch (e) {
      toast({ title: 'Eroare la regenerare', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Colaj video (pozele clientului)" icon={<Film className="h-3.5 w-3.5" />}>
      {loading && <p className="text-xs text-muted-foreground">Se încarcă…</p>}
      {!loading && collages && collages.length === 0 && (
        <p className="mb-3 text-xs text-muted-foreground">Clientul nu a creat niciun colaj încă.</p>
      )}

      <div className="space-y-3">
        {collages?.map((c) => (
          <div key={c.id} className="rounded-lg border border-amber-400/20 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-amber-300">
                {c.kind === 'image_video' ? '🖼️' : '🎞️'} {collageKindLabel(c)} · {c.aspect} · {c.track}
              </span>
              <StatusBadge status={c.status} />
            </div>

            {c.images.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 text-[11px] text-muted-foreground">{c.images.length} poze încărcate de client</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.images.map((url, i) => (
                    <a key={url + i} href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`poza ${i + 1}`} className="h-16 w-16 rounded object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {c.status === 'succeeded' && c.videoUrl && (
              <video controls src={c.videoUrl} className="mb-2 max-w-xs rounded" />
            )}
            {c.status === 'failed' && (
              <p className="mb-2 text-[11px] text-red-400">Eșuat: {c.error ?? 'eroare necunoscută'}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {c.status === 'succeeded' && c.videoUrl && (
                <a href={c.videoUrl} download>
                  <Button size="sm" variant="outline">
                    <Download className="mr-1 h-3.5 w-3.5" />Descarcă
                  </Button>
                </a>
              )}
              {(c.status === 'succeeded' || c.status === 'failed') && (
                <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => doRegen(c)}>
                  {busy === c.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Shuffle className="mr-1 h-3.5 w-3.5" />}
                  {c.kind === 'image_video' ? 'Refă' : 'Altă variantă'}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-amber-400/30 p-3">
        <p className="mb-2 text-xs font-semibold text-amber-300">Încarcă tu poze și fă un colaj</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 15))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            {files.length > 0 ? `${files.length} poze alese` : 'Alege poze'}
          </Button>
          <select
            value={aspect}
            onChange={(e) => setAspect(e.target.value)}
            className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
          >
            {COLLAGE_ASPECTS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          {hasBonus && (
            <select
              value={track}
              onChange={(e) => setTrack(e.target.value as 'main' | 'bonus')}
              className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
            >
              <option value="main">Melodia 1</option>
              <option value="bonus">Melodia 2</option>
            </select>
          )}
          <Button size="sm" disabled={busy === 'upload' || files.length === 0} onClick={doUpload}>
            {busy === 'upload' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Film className="mr-1 h-3.5 w-3.5" />}
            Generează colaj
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          max 15 imagini · ≤10MB fiecare · nu trimite email automat clientului
        </p>
      </div>
    </Card>
  );
}

function FormTab({ data }: { data: OrderDetail }) {
  const g = data.generation;
  if (!g) return <Empty title="Nicio generation legată" />;
  return (
    <div className="space-y-4">
      <Card title="Date introduse de client">
        <Kv k="Destinatar" v={g.recipientName} />
        {g.recipientGender && <Kv k="Sex destinatar" v={g.recipientGender === 'M' ? 'Bărbat' : 'Femeie'} />}
        <Kv k="De la" v={dedicatorFrom(g) ?? '—'} />
        <Kv k="Ocazie" v={g.occasion} />
        <Kv k="Stil" v={g.style} />
        <Kv k="Voce" v={voiceLabel(g.voiceArtist)} />
        <Kv k="Locale" v={g.locale} />
        <Kv k="Durată" v={`${g.durationSec}s`} />
        {g.packageTier && <Kv k="Pachet" v={packageLabel(g.packageTier)} />}
        <Kv k="Premium" v={g.premium ? 'da' : 'nu'} />
      </Card>

      <CollageManager generationId={g.id} hasBonus={!!g.bonusAudioUrl} />

      <Card title="Mesaj (text liber al clientului)">
        <pre className="whitespace-pre-wrap rounded bg-black/40 p-3 text-xs">{g.message || '(gol)'}</pre>
      </Card>

      {g.dedication && (
        <Card title="Dedicație (text public)">
          <pre className="whitespace-pre-wrap rounded bg-black/40 p-3 text-xs">{g.dedication}</pre>
        </Card>
      )}

      {g.customLyrics && (
        <Card title="Versuri custom (suprascriu AI)">
          <pre className="whitespace-pre-wrap rounded bg-black/40 p-3 text-xs">{g.customLyrics}</pre>
        </Card>
      )}

      {g.inferenceMeta && (
        <Card title="Audit AI inference (Irina virtuală)">
          <p className="mb-2 text-xs text-muted-foreground">
            Sursa fiecărui câmp: user_said / inferred / default
          </p>
          <pre className="overflow-x-auto rounded bg-black/40 p-2 text-[11px]">
            {JSON.stringify(g.inferenceMeta, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}

// ============== TAB: Payment ==============

function PaymentTab({ data, refetch }: { data: OrderDetail; refetch: () => Promise<void> }) {
  const p = data.payment;
  const g = data.generation;
  const { toast } = useToast();
  const [marking, setMarking] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);
  // Lazy: cerem datele de facturare Stripe doar când userul intră pe tab.
  const { data: stripeDetails, loading: stripeLoading } = useAsync(
    () => (p ? AdminApi.paymentStripeDetails(p.id) : Promise.resolve(null)),
    [p?.id],
  );
  if (!p) return <Empty title="Demo gratuit — fără plată" />;

  async function markRefunded() {
    if (!p) return;
    setRefundBusy(true);
    try {
      const res = await AdminApi.paymentMarkRefunded(p.id, {
        reason: refundReason.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error);
      toast({ variant: 'success', title: 'Plată marcată ca refunded' });
      setMarking(false);
      setRefundReason('');
      await refetch();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: errorMessage(e) });
    } finally {
      setRefundBusy(false);
    }
  }

  // URL public spre manea. Preferăm domeniul site-ului (https://<domain>/m/<id>)
  // pentru ca link-ul să meargă direct la brand-ul corect, nu la admin.
  const melodyUrl = g
    ? data.site?.domain
      ? `https://${data.site.domain}/m/${g.id}`
      : `/m/${g.id}`
    : null;

  return (
    <div className="space-y-4">
      <Card title="Plată">
        <Kv k="ID" v={p.id} mono />
        <Kv k="Sumă" v={`${(p.amount / 100).toFixed(2)} ${p.currency}`} />
        {melodyUrl && (
          <Kv
            k="Manea generată"
            v={
              <a
                href={melodyUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-primary hover:underline"
                title={melodyUrl}
              >
                <Music2 className="h-3 w-3" />
                {g!.recipientName} — /m/{g!.id.slice(0, 8)}
                <ExternalLink className="h-3 w-3" />
              </a>
            }
          />
        )}
        {data.analytics.session?.ip && (
          <Kv
            k="IP client"
            v={
              <span className="font-mono text-[11px]">
                {data.analytics.session.ip}
                {data.analytics.session.countryName && (
                  <span className="ml-1 text-muted-foreground">
                    ({data.analytics.session.countryName}
                    {data.analytics.session.city ? ` · ${data.analytics.session.city}` : ''})
                  </span>
                )}
              </span>
            }
          />
        )}
        {p.amountRonCents != null && p.currency !== 'RON' && (
          <Kv k="În RON" v={`${(p.amountRonCents / 100).toFixed(2)} RON`} />
        )}
        {p.exchangeRateToRon && <Kv k="Curs RON" v={p.exchangeRateToRon} />}
        <Kv k="Status" v={<StatusBadge status={p.status} />} />
        <Kv k="Provider" v={p.provider} />
        <Kv k="Stripe Session" v={p.providerSessionId ?? '—'} mono />
        <Kv k="Creată" v={fmtDateTime(p.createdAt)} />
        <Kv k="Update" v={fmtDateTime(p.updatedAt)} />
        {p.failureCode && (
          <Kv
            k={p.status === 'refunded' ? 'Cod refund' : 'Cod eșec'}
            v={
              <code className={p.status === 'refunded' ? 'text-amber-300' : 'text-rose-300'}>
                {p.failureCode}
              </code>
            }
          />
        )}
        {p.failureReason && (
          <Kv
            k={p.status === 'refunded' ? 'Detalii refund' : 'Motiv eșec'}
            v={
              <span className={p.status === 'refunded' ? 'text-amber-200' : 'text-rose-200'}>
                {p.failureReason}
              </span>
            }
          />
        )}
        {p.openReplaySessionId && (
          <Kv
            k="OpenReplay"
            v={
              <a
                href={`https://openreplay.manelecadou.ro/sessions/${p.openReplaySessionId}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                ▶ Watch replay
              </a>
            }
          />
        )}

        <div className="mt-3 border-t border-white/10 pt-3">
          {p.status === 'refunded' ? (
            <p className="text-[11px] text-muted-foreground">
              Marcată ca <span className="text-amber-300">refunded</span> — doar statusul a fost setat
              manual. Nu s-a inițiat refund prin Stripe, iar factura (dacă există) e neatinsă.
            </p>
          ) : p.status === 'paid' ? (
            marking ? (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  Setezi <strong>doar statusul</strong> la{' '}
                  <span className="text-amber-300">refunded</span>. Fără refund prin Stripe, fără
                  storno la factură.
                </p>
                <Input
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Motiv (opțional) — ex: rambursat prin transfer bancar"
                  className="text-xs"
                />
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" loading={refundBusy} onClick={markRefunded}>
                    Confirmă „refunded”
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={refundBusy}
                    onClick={() => {
                      setMarking(false);
                      setRefundReason('');
                    }}
                  >
                    Anulează
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setMarking(true)}>
                Marchează ca refunded
              </Button>
            )
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Marcarea „refunded” e disponibilă doar pentru plăți cu status <code>paid</code>.
            </p>
          )}
        </div>
      </Card>

      <Card title="Date facturare (Stripe)" icon={<CreditCard className="h-4 w-4" />}>
        {stripeLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !stripeDetails ? (
          <p className="text-xs text-muted-foreground">
            Detaliile nu sunt disponibile (plată fără Stripe Session sau eroare API).
          </p>
        ) : (
          <>
            <Kv k="Nume" v={stripeDetails.name ?? '—'} />
            <Kv k="Email" v={stripeDetails.email ?? '—'} />
            <Kv k="Telefon" v={stripeDetails.phone ?? '—'} />
            {stripeDetails.address ? (
              <>
                <Kv k="Adresă" v={stripeDetails.address.line1 ?? '—'} />
                {stripeDetails.address.line2 && (
                  <Kv k="Adresă (2)" v={stripeDetails.address.line2} />
                )}
                <Kv
                  k="Oraș"
                  v={`${stripeDetails.address.city ?? '—'}${
                    stripeDetails.address.state ? `, ${stripeDetails.address.state}` : ''
                  }`}
                />
                <Kv k="Cod poștal" v={stripeDetails.address.postalCode ?? '—'} />
                <Kv k="Țară" v={stripeDetails.address.country ?? '—'} />
              </>
            ) : (
              <Kv k="Adresă" v="—" />
            )}
            {stripeDetails.paymentMethod && stripeDetails.paymentMethod.brand && (
              <Kv
                k="Card"
                v={`${stripeDetails.paymentMethod.brand.toUpperCase()} ••••${stripeDetails.paymentMethod.last4 ?? '????'} (${stripeDetails.paymentMethod.expMonth}/${stripeDetails.paymentMethod.expYear})`}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ============== TAB: Audio ==============

function AudioTab({ data }: { data: OrderDetail }) {
  const g = data.generation;
  if (!g) return <Empty title="Nicio generation" />;
  return (
    <div className="space-y-4">
      {g.audioUrl ? (
        <Card title="Audio principal">
          <audio controls src={g.audioUrl} className="w-full" />
          <p className="mt-2 text-[11px] text-muted-foreground break-all">{g.audioUrl}</p>
        </Card>
      ) : (
        <Empty title="Audio nedisponibil încă" />
      )}
      {g.bonusAudioUrl && (
        <Card title="Audio bonus">
          <audio controls src={g.bonusAudioUrl} className="w-full" />
        </Card>
      )}
      {g.demoAudioUrl && (
        <Card title="Demo 30s (versiunea publică)">
          <audio controls src={g.demoAudioUrl} className="w-full" />
        </Card>
      )}
      {g.coverUrl && (
        <Card title="Cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={g.coverUrl} alt="cover" className="max-w-xs rounded" />
        </Card>
      )}
      <Deliverables g={g} />
      {g.lyricsDraft && (
        <Card title="Versuri — ciornă (OpenAI writer)">
          <pre className="whitespace-pre-wrap rounded bg-black/40 p-3 text-xs">{g.lyricsDraft}</pre>
        </Card>
      )}
      {g.lyrics && (
        <Card title="Versuri — final (OpenAI critic)">
          <pre className="whitespace-pre-wrap rounded bg-black/40 p-3 text-xs">{g.lyrics}</pre>
        </Card>
      )}
    </div>
  );
}

/**
 * Secțiune „Livrabile" pentru pachetele noi: imagini social, videoclip,
 * instrumental. Se randează doar ce există (comenzi legacy → nimic).
 */
function Deliverables({ g }: { g: NonNullable<OrderDetail['generation']> }) {
  const images = g.socialImages ?? [];
  const hasAny =
    images.length > 0 ||
    !!g.socialImageSelected ||
    !!g.socialImageUploaded ||
    !!g.videoUrl ||
    !!g.instrumentalUrl;
  if (!hasAny) return null;
  return (
    <Card title="Livrabile (pachet)">
      <div className="space-y-4">
        {g.socialImageSelected && (
          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Imagine selectată de client</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.socialImageSelected} alt="social selectat" className="max-w-xs rounded border border-amber-400/40" />
          </div>
        )}
        {g.socialImageUploaded && (
          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Imagine încărcată manual</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.socialImageUploaded} alt="social încărcat" className="max-w-xs rounded" />
          </div>
        )}
        {images.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Imagini social generate</p>
            <div className="flex flex-wrap gap-2">
              {images.map((url, i) => (
                <a key={url + i} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`social ${i + 1}`} className="h-24 w-24 rounded object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
        {g.videoUrl && (
          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Videoclip</p>
            <video controls src={g.videoUrl} className="max-w-md rounded" />
            <p className="mt-1 break-all text-[11px] text-muted-foreground">{g.videoUrl}</p>
          </div>
        )}
        {g.instrumentalUrl && (
          <div>
            <p className="mb-1 text-[11px] text-muted-foreground">Instrumental</p>
            <audio controls src={g.instrumentalUrl} className="w-full" />
            <p className="mt-1 break-all text-[11px] text-muted-foreground">{g.instrumentalUrl}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ============== TAB: Studio (regenerare + unelte Suno + variații) ==============

function StudioTab({ data, refetch }: { data: OrderDetail; refetch: () => Promise<void> }) {
  const g = data.generation!;
  const { toast } = useToast();
  const rootId = g.parentGenerationId ?? g.id;
  const variations = useAsync(() => AdminApi.generationVariations(rootId), [rootId], {
    refetchInterval: 5000,
  });

  const [edits, setEdits] = useState({
    recipientName: g.recipientName,
    dedication: g.dedication ?? '',
    message: g.message,
    style: g.style,
    occasion: g.occasion,
    voiceArtist: g.voiceArtist,
    packageTier: (g.packageTier ?? 'basic') as 'basic' | 'plus' | 'premium',
  });
  const [lyricsMode, setLyricsMode] = useState<'rewrite' | 'keep' | 'custom'>('rewrite');
  const [customLyrics, setCustomLyrics] = useState(g.lyrics ?? g.customLyrics ?? '');
  const [target, setTarget] = useState<'new_track' | 'overwrite' | 'new_order'>('new_track');
  const [slot, setSlot] = useState<'main' | 'bonus'>('main');
  const [coverStyle, setCoverStyle] = useState('');
  const [extendAt, setExtendAt] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [rxStyle, setRxStyle] = useState('');
  const [rxMode, setRxMode] = useState<'chorus' | 'manual'>('chorus');
  const [rxStart, setRxStart] = useState('');
  const [rxEnd, setRxEnd] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function act(key: string, run: () => Promise<unknown>, okMsg: string) {
    if (acting) return;
    setActing(key);
    try {
      await run();
      toast({ variant: 'success', title: okMsg });
      await Promise.all([variations.refetch(), refetch()]);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: errorMessage(e) });
    } finally {
      setActing(null);
    }
  }

  async function moveVariation(index: number, dir: -1 | 1) {
    const list = variations.data ?? [];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((v) => v.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await act('reorder', () => AdminApi.generationReorderVariations(rootId, ids), 'Ordine actualizată');
  }

  /** Încarcă unul sau mai multe MP3-uri ca variații noi (secvențial). */
  async function uploadVariations(files: FileList | null) {
    if (!files || files.length === 0 || acting) return;
    const list = Array.from(files);
    setActing('upload');
    let ok = 0;
    try {
      for (const f of list) {
        await AdminApi.generationManualUploadVariation(g.id, f, 'Upload manual');
        ok++;
      }
      toast({
        variant: 'success',
        title: `${ok} ${ok === 1 ? 'variantă încărcată' : 'variante încărcate'}`,
        description: 'Apar mai jos. Ascult-o și promoveaz-o pe cea bună ca principală/bonus.',
      });
      await Promise.all([variations.refetch(), refetch()]);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: ok > 0 ? `Doar ${ok} încărcate` : 'Upload eșuat',
        description: errorMessage(e),
      });
      await variations.refetch();
    } finally {
      setActing(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const canSunoTools = !!g.providerJobId && g.providerJobId !== 'manual';
  const upd = (patch: Partial<typeof edits>) => setEdits((s) => ({ ...s, ...patch }));
  const processing = (variations.data ?? []).filter(
    (v) => v.status !== 'succeeded' && v.status !== 'failed',
  ).length;

  return (
    <div className="space-y-5">
      {/* ===== Hero header ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/15 via-orange-500/5 to-transparent p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-black shadow-lg shadow-amber-500/30">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-white">Studio melodie</h2>
              <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-amber-100/70">
                Regenerează, editează versuri și folosește uneltele Suno ca să schimbi melodia
                clientului — fără să strici comanda originală.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={acting === 'resend' || g.status !== 'succeeded'}
              onClick={() => act('resend', () => AdminApi.generationResendEmail(g.id), 'Email de livrare retrimis')}
              title={
                g.status !== 'succeeded'
                  ? 'Comanda nu e gata (status succeeded)'
                  : 'Retrimite emailul „melodia ta e gata" + mesaj în chat către client'
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {acting === 'resend' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Retrimite mailul
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-200"
            >
              <BookOpen className="h-3.5 w-3.5" /> Ghid
            </button>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <Stat label="Melodia live" value={g.status === 'succeeded' ? 'gata' : g.status} tone={g.status === 'succeeded' ? 'ok' : 'warn'} />
          <Stat label="Variații" value={String(variations.data?.length ?? 0)} />
          {processing > 0 && <Stat label="În lucru" value={String(processing)} tone="warn" spin />}
          <Stat label="Sursă Suno" value={canSunoTools ? 'disponibilă' : 'manual / lipsă'} tone={canSunoTools ? 'ok' : 'muted'} />
        </div>
      </div>

      {/* ===== Editează & Regenerează ===== */}
      <Section
        icon={<Pencil className="h-4 w-4" />}
        title="Editează & Regenerează"
        subtitle="Schimbă datele melodiei și pornește o nouă generare completă."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Destinatar">
            <Inp value={edits.recipientName} onChange={(v) => upd({ recipientName: v })} />
          </Field>
          <Field label="Dedicație (de la)">
            <Inp value={edits.dedication} onChange={(v) => upd({ dedication: v })} placeholder="(opțional)" />
          </Field>
          <Field label="Stil">
            <Inp value={edits.style} onChange={(v) => upd({ style: v })} />
          </Field>
          <Field label="Ocazie">
            <Inp value={edits.occasion} onChange={(v) => upd({ occasion: v })} />
          </Field>
          <Field label="Voce">
            <Sel
              value={edits.voiceArtist}
              onChange={(v) => upd({ voiceArtist: v })}
              options={[
                { value: 'male', label: 'Bărbătească' },
                { value: 'female', label: 'Feminină' },
              ]}
            />
          </Field>
          <Field label="Pachet">
            <Sel
              value={edits.packageTier}
              onChange={(v) => upd({ packageTier: v as typeof edits.packageTier })}
              options={[
                { value: 'basic', label: 'Bază' },
                { value: 'plus', label: 'Plus' },
                { value: 'premium', label: 'Premium' },
              ]}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Mesaj">
            <textarea
              value={edits.message}
              onChange={(e) => upd({ message: e.target.value })}
              rows={2}
              className={inputCls + ' min-h-[44px] resize-y py-2'}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Label>Versuri</Label>
          <SegPills
            value={lyricsMode}
            onChange={(v) => setLyricsMode(v as typeof lyricsMode)}
            options={[
              { value: 'rewrite', label: 'Rescrie cu AI', hint: 'din câmpurile de mai sus' },
              { value: 'keep', label: 'Păstrează', hint: 'aceleași versuri' },
              { value: 'custom', label: 'Custom', hint: 'le scrii tu' },
            ]}
          />
          {lyricsMode === 'custom' && (
            <textarea
              value={customLyrics}
              onChange={(e) => setCustomLyrics(e.target.value)}
              rows={9}
              className={inputCls + ' mt-2 resize-y font-mono text-[11px] leading-relaxed'}
              placeholder="[Verse 1]&#10;Versul tău aici…"
            />
          )}
        </div>

        <div className="mt-4">
          <Label>Unde merge rezultatul</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            <TargetCard
              active={target === 'new_track'}
              onClick={() => setTarget('new_track')}
              icon={<Plus className="h-4 w-4" />}
              tone="emerald"
              title="Piesă nouă"
              desc="Variație în aceeași comandă. Nu atinge melodia live."
            />
            <TargetCard
              active={target === 'overwrite'}
              onClick={() => setTarget('overwrite')}
              icon={<RefreshCw className="h-4 w-4" />}
              tone="rose"
              title="Suprascrie"
              desc="Înlocuiește melodia actuală. Cea veche dispare."
            />
            <TargetCard
              active={target === 'new_order'}
              onClick={() => setTarget('new_order')}
              icon={<Sparkles className="h-4 w-4" />}
              tone="sky"
              title="Comandă nouă"
              desc="Melodie separată, independentă de comanda asta."
            />
          </div>
        </div>

        <button
          type="button"
          disabled={acting === 'regen'}
          onClick={() =>
            act(
              'regen',
              () =>
                AdminApi.generationRegenerate(g.id, {
                  target,
                  lyricsMode,
                  customLyrics: lyricsMode === 'custom' ? customLyrics : undefined,
                  label: 'Regenerare',
                  edits: {
                    recipientName: edits.recipientName,
                    dedication: edits.dedication.trim() || null,
                    message: edits.message,
                    style: edits.style,
                    occasion: edits.occasion,
                    voiceArtist: edits.voiceArtist,
                    packageTier: edits.packageTier,
                  },
                }),
              'Regenerare pornită',
            )
          }
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2.5 text-sm font-semibold text-black shadow-lg shadow-amber-500/25 transition hover:from-amber-300 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {acting === 'regen' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {acting === 'regen' ? 'Se trimite…' : 'Regenerează melodia'}
        </button>
      </Section>

      {/* ===== Unelte rapide ===== */}
      <Section
        icon={<Sparkles className="h-4 w-4" />}
        title="Unelte rapide"
        subtitle="Operații pe melodia existentă, fără să rescrii versurile."
        right={
          <SlotToggle value={slot} onChange={setSlot} />
        }
      >
        {!canSunoTools && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Uneltele Suno (extend, WAV, karaoke, video) cer o melodie generată prin Suno.
              Aceasta a fost încărcată manual sau nu are task Suno. <strong>Re-roll, Swap și
              Cover</strong> funcționează în continuare.
            </span>
          </div>
        )}
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <ToolTile
            icon={<Repeat className="h-4 w-4" />} tone="violet"
            title="Re-roll" desc="Variație nouă, aceleași versuri."
            busy={acting === 'reroll'} disabled={!!acting}
            onAction={() => act('reroll', () => AdminApi.generationReroll(g.id), 'Re-roll pornit')}
          />
          <ToolTile
            icon={<Shuffle className="h-4 w-4" />} tone="violet"
            title="Swap" desc="Schimbă principala cu bonusul."
            busy={acting === 'swap'} disabled={!!acting || !g.bonusAudioUrl}
            disabledHint={!g.bonusAudioUrl ? 'fără piesă bonus' : undefined}
            onAction={() => act('swap', () => AdminApi.generationSwapTracks(g.id), 'Piese interschimbate')}
          />
          <ToolTile
            icon={<ArrowUpToLine className="h-4 w-4" />} tone="amber"
            title="Prelungește" desc="Continuă melodia (Suno extend)."
            busy={acting === 'extend'} disabled={!!acting || !canSunoTools}
            onAction={() => act('extend', () => AdminApi.generationExtend(g.id, { slot, continueAt: extendAt ? Number(extendAt) : undefined }), 'Extend pornit')}
          >
            <input
              value={extendAt}
              onChange={(e) => setExtendAt(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="de la secunda…"
              className={inputCls + ' h-7 text-[11px]'}
            />
          </ToolTile>
          <ToolTile
            icon={<Wand2 className="h-4 w-4" />} tone="amber"
            title="Cover / restyle" desc="Aceeași melodie, alt stil."
            busy={acting === 'cover'} disabled={!!acting}
            onAction={() => act('cover', () => AdminApi.generationCover(g.id, { slot, style: coverStyle.trim() || undefined }), 'Cover pornit')}
          >
            <input
              value={coverStyle}
              onChange={(e) => setCoverStyle(e.target.value)}
              placeholder="stil cover (opțional)"
              className={inputCls + ' h-7 text-[11px]'}
            />
          </ToolTile>
          <ToolTile
            icon={<Download className="h-4 w-4" />} tone="sky"
            title="WAV studio" desc="Calitate înaltă, necomprimată."
            busy={acting === 'wav'} disabled={!!acting || !canSunoTools}
            onAction={() => act('wav', () => AdminApi.generationWav(g.id, slot), 'WAV în lucru')}
          />
          <ToolTile
            icon={<Mic2 className="h-4 w-4" />} tone="sky"
            title="Voce / Instrumental" desc="Separă vocea de instrumental."
            busy={acting === 'karaoke'} disabled={!!acting || !canSunoTools}
            onAction={() => act('karaoke', () => AdminApi.generationSeparateVocals(g.id, slot, 'separate_vocal'), 'Karaoke în lucru')}
          />
          <ToolTile
            icon={<Layers className="h-4 w-4" />} tone="sky"
            title="Stem-uri (12)" desc="Tobe, bas, voce, chitară…"
            busy={acting === 'stems'} disabled={!!acting || !canSunoTools}
            onAction={() => act('stems', () => AdminApi.generationSeparateVocals(g.id, slot, 'split_stem'), 'Stem-uri în lucru')}
          />
          <ToolTile
            icon={<Film className="h-4 w-4" />} tone="sky"
            title="Videoclip MP4" desc="Clip oficial Suno din melodie."
            busy={acting === 'video'} disabled={!!acting || !canSunoTools}
            onAction={() => act('video', () => AdminApi.generationMusicVideo(g.id, slot), 'Videoclip în lucru')}
          />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" /> Rulează în fundal (~1-3 min). Variațiile apar mai jos;
          fișierele derivate în secțiunea „Fișiere derivate".
        </p>
      </Section>

      {/* ===== Remix — schimbă o secțiune (replace-section) ===== */}
      <Section
        icon={<Wand2 className="h-4 w-4" />}
        title="Remix — schimbă o secțiune"
        subtitle="Înlocuiește refrenul (sau un interval) cu alt stil, pe melodia curentă."
        right={<SlotToggle value={slot} onChange={setSlot} />}
      >
        {!canSunoTools && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Funcționează doar pe melodii generate prin Suno (nu pe upload manual).</span>
          </div>
        )}
        <Field label="Cum să sune secțiunea nouă (stil)">
          <textarea
            value={rxStyle}
            onChange={(e) => setRxStyle(e.target.value)}
            rows={2}
            placeholder="ex: refren de jale, pian trist, voce stinsă, tempo lent, fără percuție"
            className={inputCls + ' min-h-[44px] resize-y py-2'}
          />
        </Field>
        <div className="mt-3">
          <Label>Ce secțiune</Label>
          <SegPills
            value={rxMode}
            onChange={(v) => setRxMode(v as typeof rxMode)}
            options={[
              { value: 'chorus', label: 'Refrenul (auto)', hint: 'detectat automat' },
              { value: 'manual', label: 'Interval manual', hint: 'de la–până la sec' },
            ]}
          />
          {rxMode === 'manual' && (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={rxStart}
                onChange={(e) => setRxStart(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="de la sec"
                className={inputCls + ' w-28'}
              />
              <span className="text-muted-foreground">→</span>
              <input
                value={rxEnd}
                onChange={(e) => setRxEnd(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="până la sec"
                className={inputCls + ' w-28'}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={
            acting === 'replace' ||
            !canSunoTools ||
            (rxMode === 'manual' && (!rxStart || !rxEnd || Number(rxEnd) <= Number(rxStart)))
          }
          onClick={() =>
            act(
              'replace',
              () =>
                AdminApi.generationReplaceSection(g.id, {
                  slot,
                  autoChorus: rxMode === 'chorus',
                  infillStartS: rxMode === 'manual' ? Number(rxStart) : undefined,
                  infillEndS: rxMode === 'manual' ? Number(rxEnd) : undefined,
                  style: rxStyle.trim() || undefined,
                }),
              'Remix pornit — apare în Variații',
            )
          }
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:from-violet-400 hover:to-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {acting === 'replace' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {acting === 'replace' ? 'Se trimite…' : 'Schimbă secțiunea'}
        </button>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" /> Rezultatul (melodia cu secțiunea schimbată) apare ca
          variație nouă mai jos. Restul melodiei rămâne la fel.
        </p>
      </Section>

      {/* ===== Toate piesele generate ===== */}
      <Section
        icon={<Music2 className="h-4 w-4" />}
        title="Variantele de pe pagina clientului"
        subtitle="TOT ce e aici apare pe pagina melodiei — clientul ascultă și alege. Adaugă cu butonul Încarcă MP3, șterge variantele sau scoate originalele."
        badge={String((variations.data?.length ?? 0) + 1)}
        right={
          <label
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 ${acting ? 'pointer-events-none opacity-50' : ''}`}
            title="Încarcă unul sau mai multe MP3-uri ca variante (nu atinge piesa live)"
          >
            {acting === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {acting === 'upload' ? 'Se încarcă…' : 'Încarcă MP3'}
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/*"
              multiple
              className="hidden"
              disabled={!!acting}
              onChange={(e) => uploadVariations(e.target.files)}
            />
          </label>
        }
      >
        {/* Originalele (main + bonus) — apar pe pagină; le poți scoate individual */}
        <PrincipalCard
          g={g}
          acting={!!acting}
          onClearSlot={(slot) =>
            act(
              `clear-${slot}`,
              () => AdminApi.generationClearSlot(g.id, slot),
              slot === 'main' ? 'Piesa principală scoasă de pe pagină' : 'Bonusul scos de pe pagină',
            )
          }
        />

        {!variations.data || variations.data.length === 0 ? (
          <div className="mt-2.5 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center">
            <Music2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">
              Nicio variație încă. Folosește <strong>Regenerează → Piesă nouă</strong>, Re-roll,
              Prelungește sau Cover.
            </p>
          </div>
        ) : (
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            {variations.data.map((v, i) => (
              <VariationCard
                key={v.id}
                v={v}
                acting={!!acting}
                canMoveUp={i > 0}
                canMoveDown={i < variations.data!.length - 1}
                onMoveUp={() => moveVariation(i, -1)}
                onMoveDown={() => moveVariation(i, 1)}
                onPromote={(s) => act('promote', () => AdminApi.generationPromote(v.id, { slot: s, notify: false }), `Pusă ca ${s === 'main' ? 'principală' : 'bonus'}`)}
                onDelete={() => act('delvar', () => AdminApi.generationDeleteVariation(v.id), 'Variație ștearsă')}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ===== Fișiere derivate ===== */}
      <MediaExtrasCard g={g} />

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white placeholder:text-muted-foreground/60 transition focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30';

const toneMap = {
  amber: 'from-amber-400/20 text-amber-300 ring-amber-400/30',
  violet: 'from-violet-400/20 text-violet-300 ring-violet-400/30',
  sky: 'from-sky-400/20 text-sky-300 ring-sky-400/30',
  emerald: 'from-emerald-400/20 text-emerald-300 ring-emerald-400/30',
  rose: 'from-rose-400/20 text-rose-300 ring-rose-400/30',
} as const;

function Section({
  icon,
  title,
  subtitle,
  right,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-4 shadow-lg shadow-black/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20">
            {icon}
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              {title}
              {badge && (
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                  {badge}
                </span>
              )}
            </h3>
            {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
  spin,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'ok' | 'warn' | 'muted';
  spin?: boolean;
}) {
  const dot =
    tone === 'ok' ? 'bg-emerald-400' : tone === 'warn' ? 'bg-amber-400' : tone === 'muted' ? 'bg-white/30' : 'bg-sky-400';
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5">
      {spin ? (
        <Loader2 className="h-3 w-3 animate-spin text-amber-300" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      )}
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-white">{value}</span>
    </div>
  );
}

function TargetCard({
  active,
  onClick,
  icon,
  title,
  desc,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tone: keyof typeof toneMap;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition ${
        active
          ? 'border-amber-400/50 bg-amber-500/10 shadow-md shadow-amber-500/10'
          : 'border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/5'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br to-transparent ring-1 ${toneMap[tone]}`}>
          {icon}
        </span>
        <span className="text-xs font-semibold text-white">{title}</span>
        {active && <CheckCircle2 className="ml-auto h-4 w-4 text-amber-300" />}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
    </button>
  );
}

function ToolTile({
  icon,
  title,
  desc,
  tone,
  busy,
  disabled,
  disabledHint,
  onAction,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  tone: keyof typeof toneMap;
  busy?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onAction: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3 transition ${disabled ? 'opacity-60' : 'hover:border-white/20'}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br to-transparent ring-1 ${toneMap[tone]}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-white">{title}</p>
          <p className="truncate text-[10px] text-muted-foreground">{disabledHint ?? desc}</p>
        </div>
      </div>
      {children}
      <button
        type="button"
        disabled={disabled}
        onClick={onAction}
        className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-200 disabled:cursor-not-allowed disabled:hover:border-white/10 disabled:hover:bg-white/5 disabled:hover:text-white"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {busy ? 'Se trimite…' : 'Pornește'}
      </button>
    </div>
  );
}

function SlotToggle({ value, onChange }: { value: 'main' | 'bonus'; onChange: (v: 'main' | 'bonus') => void }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5 text-[11px]">
      {(['main', 'bonus'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`rounded-md px-2.5 py-1 font-medium transition ${
            value === s ? 'bg-amber-500/20 text-amber-200' : 'text-muted-foreground hover:text-white'
          }`}
        >
          {s === 'main' ? 'Principală' : 'Bonus'}
        </button>
      ))}
    </div>
  );
}

function PrincipalCard({
  g,
  acting,
  onClearSlot,
}: {
  g: NonNullable<OrderDetail['generation']>;
  acting: boolean;
  onClearSlot: (slot: 'main' | 'bonus') => void;
}) {
  const mainAudio = g.audioUrl ?? g.demoAudioUrl;
  const bonusAudio = g.bonusAudioUrl ?? g.demoBonusAudioUrl;
  if (!mainAudio && !bonusAudio) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.04] px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Piesa principală nu mai are audio (scoasă de pe pagină). Pe pagina clientului apar doar
        variantele de mai jos. Poți promova una ca principală, dacă vrei.
      </div>
    );
  }
  const SlotRow = ({ slot, label, audio }: { slot: 'main' | 'bonus'; label: string; audio: string }) => (
    <div className="flex items-center gap-2">
      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">{label}</span>
      <audio controls src={audio} className="h-8 min-w-0 flex-1" />
      <button
        type="button"
        disabled={acting}
        onClick={() => onClearSlot(slot)}
        title={`Scoate „${label}" de pe pagina clientului`}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Trash2 className="h-3 w-3" /> Scoate
      </button>
    </div>
  );
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-3">
      <div className="flex items-center gap-2">
        <Badge variant="warning" className="shrink-0">
          <Sparkles className="mr-1 h-3 w-3" /> Originale (live)
        </Badge>
        <StatusBadge status={g.status} />
        <span className="ml-auto text-[10px] text-muted-foreground">apar pe pagina clientului</span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <code className="rounded bg-white/5 px-1.5 py-0.5">{g.style}</code>
        <span>{voiceLabel(g.voiceArtist)}</span>
      </div>
      {mainAudio && <SlotRow slot="main" label="Principală" audio={mainAudio} />}
      {bonusAudio && <SlotRow slot="bonus" label="Bonus" audio={bonusAudio} />}
    </div>
  );
}

function VariationCard({
  v,
  acting,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onPromote,
  onDelete,
}: {
  v: AdminVariation;
  acting: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPromote: (slot: 'main' | 'bonus') => void;
  onDelete: () => void;
}) {
  const ready = v.status === 'succeeded' && !!v.audioUrl;
  const processing = v.status !== 'succeeded' && v.status !== 'failed';
  // Admin ascultă melodia COMPLETĂ (nu demo-ul de 30s).
  const audio = v.audioUrl ?? v.demoAudioUrl;
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 transition ${ready ? 'border-emerald-400/20 bg-emerald-500/[0.04]' : v.status === 'failed' ? 'border-rose-400/20 bg-rose-500/[0.04]' : 'border-white/10 bg-black/20'}`}>
      <div className="flex items-center gap-2">
        <Badge variant="info" className="shrink-0">{v.variationLabel ?? 'Variație'}</Badge>
        {processing ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" /> {v.status}
          </span>
        ) : (
          <StatusBadge status={v.status} />
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button" disabled={acting || !canMoveUp} onClick={onMoveUp} title="Mută mai sus"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button" disabled={acting || !canMoveDown} onClick={onMoveDown} title="Mută mai jos"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
          <span className="text-[10px] text-muted-foreground">{fmtDateTime(v.createdAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <code className="rounded bg-white/5 px-1.5 py-0.5">{v.style}</code>
        <span>{voiceLabel(v.voiceArtist)}</span>
      </div>
      {v.error && <p className="rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">{v.error}</p>}
      {audio && <audio controls src={audio} className="h-8 w-full" />}
      <div className="mt-auto flex flex-wrap gap-1.5">
        <button
          type="button" disabled={acting || !ready} onClick={() => onPromote('main')}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUpToLine className="h-3 w-3" /> Ca principală
        </button>
        <button
          type="button" disabled={acting || !ready} onClick={() => onPromote('bonus')}
          className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUpToLine className="h-3 w-3" /> Ca bonus
        </button>
        <button
          type="button" disabled={acting} onClick={onDelete}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-400/25 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function MediaExtrasCard({ g }: { g: NonNullable<OrderDetail['generation']> }) {
  const m = g.mediaExtras;
  const stems = m?.stems ? Object.entries(m.stems) : [];
  const hasAny =
    !!m &&
    (m.wavUrl || m.wavBonusUrl || m.vocalUrl || m.accompanimentUrl || m.musicVideoUrl || m.musicVideoBonusUrl || stems.length);
  if (!hasAny) return null;
  return (
    <Section
      icon={<Download className="h-4 w-4" />}
      title="Fișiere derivate"
      subtitle="WAV studio, karaoke și videoclipuri generate. (păstrate ~15 zile)"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {m?.wavUrl && <ExtLink icon={<Download className="h-3.5 w-3.5" />} label="WAV principal" url={m.wavUrl} />}
        {m?.wavBonusUrl && <ExtLink icon={<Download className="h-3.5 w-3.5" />} label="WAV bonus" url={m.wavBonusUrl} />}
        {m?.vocalUrl && <ExtLink icon={<Mic2 className="h-3.5 w-3.5" />} label="Voce izolată" url={m.vocalUrl} />}
        {m?.accompanimentUrl && <ExtLink icon={<Music2 className="h-3.5 w-3.5" />} label="Instrumental (karaoke)" url={m.accompanimentUrl} />}
        {stems.map(([k, url]) => (
          <ExtLink key={k} icon={<Layers className="h-3.5 w-3.5" />} label={`Stem: ${k}`} url={url} />
        ))}
        {m?.musicVideoUrl && <ExtLink icon={<Film className="h-3.5 w-3.5" />} label="Videoclip principal" url={m.musicVideoUrl} />}
        {m?.musicVideoBonusUrl && <ExtLink icon={<Film className="h-3.5 w-3.5" />} label="Videoclip bonus" url={m.musicVideoBonusUrl} />}
      </div>
    </Section>
  );
}

function ExtLink({ icon, label, url }: { icon: React.ReactNode; label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white transition hover:border-amber-400/40 hover:bg-amber-500/10"
    >
      <span className="text-amber-300">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <ExternalLink className="h-3 w-3 text-muted-foreground" />
    </a>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Inp({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}

function Sel({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[hsl(220_22%_9%)]">
          {o.label}
        </option>
      ))}
    </select>
  );
}

function SegPills({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-lg border px-3 py-2 text-left transition ${
            value === o.value
              ? 'border-amber-400/50 bg-amber-500/15'
              : 'border-white/10 bg-black/20 hover:bg-white/5'
          }`}
        >
          <span className={`block text-xs font-medium ${value === o.value ? 'text-amber-200' : 'text-white'}`}>
            {o.label}
          </span>
          {o.hint && <span className="text-[10px] text-muted-foreground">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

// ============== Studio: modal de documentație ==============

function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-x-4 inset-y-8 z-[60] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[hsl(220_22%_9%)] shadow-2xl md:inset-x-1/4 md:inset-y-10"
          aria-describedby={undefined}
        >
          <header className="flex items-center justify-between gap-3 border-b border-white/5 bg-gradient-to-r from-amber-500/10 to-transparent px-5 py-3.5">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold text-white">
              <BookOpen className="h-4 w-4 text-amber-300" /> Ghid Studio — cum schimbi melodiile
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-white" aria-label="Închide">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm leading-relaxed">
            <HelpIntro />
            <HelpGroup title="1. Editează & Regenerează" icon={<Pencil className="h-4 w-4" />}>
              <p>Schimbi datele (nume, dedicație, mesaj, stil, ocazie, voce, pachet) și pornești o generare nouă completă (versuri → audio).</p>
              <HelpDef term="Rescrie cu AI" def="AI-ul scrie versuri noi pe baza câmpurilor editate. Folosește când schimbi mesajul / destinatarul / ocazia." />
              <HelpDef term="Păstrează versurile" def="Refolosește exact versurile actuale, regenerând doar partea audio (altă interpretare/voce)." />
              <HelpDef term="Versuri custom" def="Scrii tu versurile în casetă — sunt folosite literal. Poți folosi tag-uri Suno: [Verse 1], [Chorus] etc." />
              <p className="mt-2 font-medium text-white">Unde merge rezultatul:</p>
              <HelpDef term="➕ Piesă nouă" def="Creează o VARIAȚIE atașată comenzii. Melodia pe care o vede clientul rămâne neatinsă. O asculți la „Variații” și o promovezi când e bună. (cel mai sigur)" tone="emerald" />
              <HelpDef term="⚠ Suprascrie" def="Înlocuiește melodia actuală a clientului. Cea veche dispare definitiv. Folosește când ești sigur." tone="rose" />
              <HelpDef term="🆕 Comandă nouă" def="Creează o melodie complet separată (un cadou în plus), fără legătură cu comanda asta." tone="sky" />
            </HelpGroup>

            <HelpGroup title="2. Unelte rapide" icon={<Sparkles className="h-4 w-4" />}>
              <p className="text-muted-foreground">Selectorul „Principală / Bonus" din dreapta alege pe care din cele 2 piese operează unealta.</p>
              <HelpDef term="Re-roll" def="O variație nouă cu aceleași versuri — când vrei pur și simplu altă interpretare." />
              <HelpDef term="Swap principală↔bonus" def="Interschimbă melodia principală cu cea bonus (dacă a doua e mai bună). Instant, fără Suno." />
              <HelpDef term="Prelungește (extend)" def="Continuă melodia ca s-o faci mai lungă. Opțional pui secunda de la care continuă. Rezultatul apare ca variație." />
              <HelpDef term="Cover / restyle" def="Aceeași melodie reinterpretată în alt stil (scrii stilul în căsuță). Rezultatul apare ca variație." />
              <HelpDef term="Remix — schimbă o secțiune" def="Înlocuiește DOAR refrenul (auto) sau un interval ales (de la–până la sec) cu alt stil — ex. „refren de jale cu pian”. Restul melodiei rămâne neschimbat. Rezultatul apare ca variație." tone="sky" />
              <HelpDef term="WAV studio" def="Convertește piesa la WAV necomprimat (calitate maximă). Apare la „Fișiere derivate”." />
              <HelpDef term="Voce / Instrumental" def="Separă vocea de instrumental (karaoke). Primești 2 fișiere: voce izolată + instrumental." />
              <HelpDef term="Stem-uri (12)" def="Desparte melodia în până la 12 piste individuale (tobe, bas, voce, chitară, claviatură…)." />
              <HelpDef term="Videoclip MP4" def="Generează un videoclip oficial Suno pornind de la melodie." />
              <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2 text-[12px] text-amber-200">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Extend, WAV, karaoke, stem-uri și video au nevoie de o melodie generată prin Suno.
                Pentru melodii încărcate manual sunt dezactivate (dar Re-roll, Swap și Cover merg).
              </p>
            </HelpGroup>

            <HelpGroup title="3. Variații" icon={<Music2 className="h-4 w-4" />}>
              <p>Toate versiunile generate (piesă nouă / re-roll / extend / cover) apar aici cu un player.</p>
              <HelpDef term="Ca principală" def="Pune variația ca melodie principală pe care o vede și ascultă clientul." tone="emerald" />
              <HelpDef term="Ca bonus" def="Pune variația ca a doua piesă (bonusul) al comenzii." />
              <HelpDef term="Șterge" def="Elimină variația (nu afectează melodia livrată)." tone="rose" />
              <p className="text-muted-foreground">Lista se reîmprospătează automat la 5 secunde cât timp ceva e „în lucru".</p>
            </HelpGroup>

            <HelpGroup title="Flux recomandat" icon={<CheckCircle2 className="h-4 w-4" />}>
              <ol className="ml-4 list-decimal space-y-1 text-[13px]">
                <li>Clientul cere o schimbare → deschizi comanda → tab <strong>Studio</strong>.</li>
                <li>Editezi ce trebuie și alegi <strong>Piesă nouă</strong> (ca să nu strici live-ul).</li>
                <li>Aștepți să apară variația în „Variații", o asculți.</li>
                <li>Dacă e bună → <strong>Ca principală</strong>. Dacă nu → Re-roll sau ajustezi și regenerezi.</li>
                <li>Opțional: WAV / videoclip / karaoke pentru livrabile extra.</li>
              </ol>
            </HelpGroup>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function HelpIntro() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[13px] text-muted-foreground">
      Acest tab îți permite să modifici melodia unui client după livrare. Regula de aur:
      folosește <strong className="text-emerald-300">Piesă nouă</strong> ca să testezi în
      siguranță, ascultă, și abia apoi promovează versiunea bună. Operațiile cu Suno costă
      credite și rulează în fundal câteva minute.
    </div>
  );
}

function HelpGroup({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">{icon}</span>
        {title}
      </h3>
      <div className="space-y-1.5 text-[13px] text-muted-foreground">{children}</div>
    </div>
  );
}

function HelpDef({ term, def, tone }: { term: string; def: string; tone?: 'emerald' | 'rose' | 'sky' }) {
  const c = tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : tone === 'sky' ? 'text-sky-300' : 'text-white';
  return (
    <p>
      <span className={`font-medium ${c}`}>{term}</span>
      <span className="text-muted-foreground"> — {def}</span>
    </p>
  );
}

function errorMessage(e: unknown): string {
  const anyErr = e as { response?: { data?: { message?: string } }; message?: string };
  return anyErr?.response?.data?.message ?? anyErr?.message ?? 'Eroare necunoscută';
}

// ============== TAB: Suno ==============

function SunoTab({ data }: { data: OrderDetail }) {
  if (data.sunoLogs.length === 0) {
    return <Empty title="Niciun apel Suno încă" />;
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Toate apelurile către Suno API pentru această comandă (submit + status terminal).
        Fiecare retry e o linie nouă.
      </p>
      {data.sunoLogs.map((s, idx) => (
        <Card
          key={s.id}
          title={`#${idx + 1} · ${s.requestType} · ${s.outcome}`}
          icon={
            s.outcome === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-300" />
            )
          }
        >
          <Kv k="Endpoint" v={<code className="text-[11px]">{s.endpoint}</code>} />
          <Kv k="HTTP status" v={s.responseStatus ?? '—'} />
          <Kv k="Provider status" v={s.providerStatus ?? '—'} />
          <Kv k="Task ID" v={s.taskId ?? '—'} mono />
          <Kv k="Credite estimate" v={s.costCredits} />
          <Kv k="Creat" v={fmtDateTime(s.createdAt)} />
          {s.completedAt && (
            <Kv k="Finalizat" v={`${fmtDateTime(s.completedAt)} (${fmtDuration(new Date(s.completedAt).getTime() - new Date(s.createdAt).getTime())})`} />
          )}
          {s.errorMessage && (
            <Kv k="Eroare" v={<span className="text-rose-300">{s.errorMessage}</span>} />
          )}
          <details className="mt-2 text-[11px]">
            <summary className="cursor-pointer text-muted-foreground">Request body</summary>
            <pre className="overflow-x-auto rounded bg-black/40 p-2 mt-1">{JSON.stringify(s.requestBody, null, 2)}</pre>
          </details>
          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted-foreground">Response body</summary>
            <pre className="overflow-x-auto rounded bg-black/40 p-2 mt-1">{JSON.stringify(s.responseBody, null, 2)}</pre>
          </details>
        </Card>
      ))}
    </div>
  );
}

// ============== TAB: OpenAI ==============

function OpenAiTab({ data }: { data: OrderDetail }) {
  if (data.lyricsLogs.length === 0) return <Empty title="Niciun apel OpenAI" />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Apelurile către OpenAI (writer = ciorna inițială, critic = rafinare).
      </p>
      {data.lyricsLogs.map((l, idx) => (
        <Card
          key={l.id}
          title={`#${idx + 1} · ${l.stage} · ${l.outcome}`}
          icon={
            l.outcome === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-300" />
            )
          }
        >
          <Kv k="Model" v={l.model ?? '—'} />
          <Kv k="Locale" v={l.locale ?? '—'} />
          <Kv k="Tokens" v={`prompt=${l.tokensPrompt ?? 0} · completion=${l.tokensCompletion ?? 0} · total=${l.tokensTotal ?? 0}`} />
          <Kv k="Durată" v={l.durationMs ? fmtDuration(l.durationMs) : '—'} />
          <Kv k="HTTP status" v={l.responseStatus ?? '—'} />
          {l.errorMessage && (
            <Kv k="Eroare" v={<span className="text-rose-300">{l.errorMessage}</span>} />
          )}
          {l.responseContent && (
            <details className="mt-2 text-[11px]">
              <summary className="cursor-pointer text-muted-foreground">Răspuns</summary>
              <pre className="whitespace-pre-wrap rounded bg-black/40 p-2 mt-1">{l.responseContent}</pre>
            </details>
          )}
          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted-foreground">System prompt</summary>
            <pre className="whitespace-pre-wrap rounded bg-black/40 p-2 mt-1">{l.systemPrompt}</pre>
          </details>
          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted-foreground">User prompt</summary>
            <pre className="whitespace-pre-wrap rounded bg-black/40 p-2 mt-1">{l.userPrompt}</pre>
          </details>
        </Card>
      ))}
    </div>
  );
}

// ============== TAB: Emails ==============

function EmailsTab({ data }: { data: OrderDetail }) {
  if (data.outboundEmails.length === 0) return <Empty title="Niciun email trimis" />;
  return (
    <div className="space-y-3">
      {data.outboundEmails.map((e) => (
        <Card
          key={e.id}
          title={`${e.subject}`}
          icon={<Mail className="h-4 w-4" />}
        >
          <Kv k="Status" v={<StatusBadge status={e.status} />} />
          <Kv k="Kind" v={e.kind ?? '—'} />
          <Kv k="Către" v={e.to} />
          <Kv k="De la" v={e.fromAddress ?? '—'} />
          <Kv k="Provider" v={`${e.provider ?? '—'} ${e.providerMessageId ? `(${e.providerMessageId.slice(0, 20)}...)` : ''}`} />
          <Kv k="Trimis" v={fmtDateTime(e.createdAt)} />
          {e.finalizedAt && <Kv k="Finalizat" v={fmtDateTime(e.finalizedAt)} />}
          {e.errorMessage && (
            <Kv k="Eroare" v={<span className="text-rose-300">{e.errorMessage}</span>} />
          )}
          {e.text && (
            <details className="mt-2 text-[11px]">
              <summary className="cursor-pointer text-muted-foreground">Plain text</summary>
              <pre className="whitespace-pre-wrap rounded bg-black/40 p-2 mt-1">{e.text}</pre>
            </details>
          )}
          {e.html && (
            <details className="text-[11px]">
              <summary className="cursor-pointer text-muted-foreground">HTML preview</summary>
              <div className="rounded border border-white/5 bg-white p-3 mt-1 text-black" dangerouslySetInnerHTML={{ __html: e.html }} />
            </details>
          )}
        </Card>
      ))}
    </div>
  );
}

// ============== TAB: Chat ==============

function ChatTab({ data }: { data: OrderDetail }) {
  if (!data.chat) return <Empty title="Fără conversație" />;
  const { conversation, messages, linkType } = data.chat;
  const isFallback = linkType === 'recent_fallback';
  return (
    <div className="space-y-4">
      {isFallback && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          ⚠ <strong>Conversație nelegată direct de comandă.</strong> Nu am găsit o
          legătură explicită (wizardState sau payment_link) între această
          comandă și o conversație de chat. Afișăm cea mai recentă conversație
          a clientului — poate fi pe altă temă.
        </div>
      )}
      {linkType && !isFallback && (
        <div className="text-[10px] text-muted-foreground">
          Legătură:{' '}
          <code>
            {linkType === 'wizard_gen'
              ? 'wizard.generationId'
              : linkType === 'wizard_payment'
                ? 'wizard.paymentId'
                : 'message.payload'}
          </code>
        </div>
      )}
      <Card title="Conversație" icon={<MessageSquare className="h-4 w-4" />}>
        <Kv k="ID" v={conversation.id} mono />
        <Kv k="Subject" v={conversation.subject} />
        <Kv k="Status" v={<StatusBadge status={conversation.status} />} />
        <Kv k="AI mode" v={<Badge variant="info">{conversation.aiMode}</Badge>} />
        {conversation.assignedAdminEmail && (
          <Kv k="Claim admin" v={conversation.assignedAdminEmail} />
        )}
        {conversation.greetingSentAt && (
          <Kv k="Greeting AI" v={fmtDateTime(conversation.greetingSentAt)} />
        )}
        <Kv k="Creată" v={fmtDateTime(conversation.createdAt)} />
        {conversation.wizardState && (
          <details className="mt-2 text-[11px]">
            <summary className="cursor-pointer text-muted-foreground">Wizard state (AI sales)</summary>
            <pre className="overflow-x-auto rounded bg-black/40 p-2 mt-1">{JSON.stringify(conversation.wizardState, null, 2)}</pre>
          </details>
        )}
        <a
          href={`/chat?conv=${conversation.id}`}
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Deschide în Chat <ExternalLink className="h-3 w-3" />
        </a>
      </Card>

      <Card title={`Mesaje (${messages.length})`}>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded p-2 text-xs ${
                m.authorRole === 'user'
                  ? 'border border-blue-400/30 bg-blue-500/10'
                  : m.authorRole === 'admin'
                    ? 'border border-amber-400/30 bg-amber-500/10'
                    : 'border border-white/10 bg-white/5'
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="font-medium uppercase">{m.authorRole}</span>
                {m.aiGenerated && <Badge variant="info" className="text-[9px]">AI</Badge>}
                {m.messageType !== 'text' && (
                  <Badge variant="muted" className="text-[9px]">{m.messageType}</Badge>
                )}
                <span>· {fmtDateTime(m.createdAt)}</span>
                {m.readAt && <span>· ✓✓ citit</span>}
                {m.detectedLang && m.detectedLang !== 'ro' && (
                  <span>· lang={m.detectedLang}</span>
                )}
              </div>
              <div className="whitespace-pre-wrap">{m.body}</div>
              {m.bodyRo && (
                <div className="mt-1 border-l-2 border-emerald-400/30 pl-2 text-[11px] text-emerald-200">
                  🇷🇴 {m.bodyRo}
                </div>
              )}
              {m.attachmentUrl && (
                <a
                  href={m.attachmentUrl}
                  target="_blank"
                  rel="noopener"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  📎 {m.attachmentName ?? 'atașament'}
                </a>
              )}
              {m.payload && (
                <details className="mt-1 text-[10px]">
                  <summary className="cursor-pointer text-muted-foreground">payload</summary>
                  <pre className="overflow-x-auto rounded bg-black/30 p-1 mt-1">{JSON.stringify(m.payload, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============== TAB: AI tools ==============

function AiToolsTab({ data }: { data: OrderDetail }) {
  if (!data.chat || data.chat.aiToolCalls.length === 0) {
    return <Empty title="Niciun apel AI tool" />;
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        AI tool calls executate pe conversație (search_memory, send_message, send_payment_link...).
      </p>
      {data.chat.aiToolCalls.map((t) => (
        <Card key={t.id} title={t.toolName} icon={<Sparkles className="h-4 w-4 text-amber-300" />}>
          <Kv k="Mod AI" v={<Badge variant="info">{t.aiMode}</Badge>} />
          <Kv k="Model" v={t.model ?? '—'} />
          <Kv
            k="Tokens"
            v={`prompt=${t.totalPromptTokens ?? 0} · completion=${t.totalCompletionTokens ?? 0}`}
          />
          {t.requiredApproval && <Kv k="Aprobare" v={<Badge variant="warning">required</Badge>} />}
          <Kv k="Creat" v={fmtDateTime(t.createdAt)} />
          {t.error && (
            <Kv k="Eroare" v={<span className="text-rose-300">{t.error}</span>} />
          )}
          <details className="mt-2 text-[11px]">
            <summary className="cursor-pointer text-muted-foreground">Input</summary>
            <pre className="overflow-x-auto rounded bg-black/40 p-2 mt-1">{JSON.stringify(t.input, null, 2)}</pre>
          </details>
          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted-foreground">Output</summary>
            <pre className="overflow-x-auto rounded bg-black/40 p-2 mt-1">{JSON.stringify(t.output, null, 2)}</pre>
          </details>
        </Card>
      ))}
    </div>
  );
}

// ============== TAB: Analytics ==============

function AnalyticsTab({ data }: { data: OrderDetail }) {
  const s = data.analytics.session;
  return (
    <div className="space-y-4">
      {s ? (
        <Card title="Sesiunea originală">
          <Kv k="Session key" v={s.sessionKey} mono />
          <Kv k="Geo" v={`${s.countryName ?? s.country ?? '—'} · ${s.city ?? '—'}`} />
          <Kv k="IP" v={s.ip ?? '—'} mono />
          <Kv k="Device" v={`${s.device ?? '—'} · ${s.browserName ?? '-'} ${s.browserVersion ?? ''} · ${s.osName ?? '-'}`} />
          <Kv
            k="Sursă"
            v={`${s.source ?? 'direct'}${s.medium ? ` / ${s.medium}` : ''}`}
          />
          {s.campaign && <Kv k="Campanie" v={s.campaign} />}
          {s.referrer && <Kv k="Referrer" v={s.referrer} />}
          {s.landingPath && <Kv k="Landing" v={s.landingPath} />}
          <Kv k="Page views" v={String(s.pageViews)} />
          <Kv k="Durată" v={`${s.durationSec}s`} />
          {s.isBot && <Kv k="Bot" v={<Badge variant="destructive">BOT</Badge>} />}
        </Card>
      ) : (
        <Empty title="Nicio sesiune analytics legată" />
      )}

      {data.analytics.events.length > 0 && (
        <Card title={`Evenimente (${data.analytics.events.length})`}>
          <div className="space-y-2">
            {data.analytics.events.map((e) => (
              <div key={e.id} className="rounded border border-white/5 bg-black/20 p-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium">{e.type}</span>
                  <span className="text-muted-foreground">{fmtDateTime(e.createdAt)}</span>
                </div>
                {e.props && (
                  <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 text-[10px]">{JSON.stringify(e.props, null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============== TAB: Timeline ==============

function TimelineTab({ data }: { data: OrderDetail }) {
  if (data.timeline.length === 0) return <Empty title="Cronologie goală" />;
  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-0 bottom-0 w-px bg-white/10" />
      {data.timeline.map((e, idx) => (
        <div key={idx} className="relative mb-3">
          <div
            className={`absolute -left-[18px] top-1.5 h-2 w-2 rounded-full ${timelineDotColor(e.kind)}`}
          />
          <div className="rounded border border-white/5 bg-black/20 p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{e.title}</span>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {fmtDateTime(e.at)}
              </span>
            </div>
            {e.detail && (
              <div className="mt-0.5 text-[11px] text-muted-foreground">{e.detail}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function timelineDotColor(kind: string): string {
  if (kind.includes('paid') || kind.includes('succeeded') || kind === 'order_created') return 'bg-emerald-400';
  if (kind.includes('failed') || kind.includes('refunded')) return 'bg-rose-400';
  if (kind.includes('retry')) return 'bg-amber-400';
  if (kind.startsWith('chat_')) return 'bg-blue-400';
  if (kind.startsWith('email_')) return 'bg-purple-400';
  if (kind.startsWith('suno_')) return 'bg-pink-400';
  if (kind.startsWith('lyrics_')) return 'bg-cyan-400';
  return 'bg-white/30';
}

// ============== Helpers ==============

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Kv({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 py-1 text-xs">
      <span className="text-muted-foreground whitespace-nowrap">{k}</span>
      <span
        className={`text-right ${mono ? 'truncate font-mono text-[11px]' : 'break-all'}`}
        style={mono ? { maxWidth: '60%' } : undefined}
      >
        {v}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'destructive' | 'muted' | 'warning' | 'info'> = {
    paid: 'success',
    succeeded: 'success',
    sent: 'success',
    success: 'success',
    open: 'success',
    failed: 'destructive',
    error: 'destructive',
    http_error: 'destructive',
    pending: 'warning',
    queued: 'warning',
    refunded: 'muted',
    closed: 'muted',
    timeout: 'warning',
    writing_lyrics: 'info',
    checking_lyrics: 'info',
    generating_audio: 'warning',
  };
  return <Badge variant={map[status] ?? 'muted'}>{status}</Badge>;
}

function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return format(new Date(d), "d MMM yyyy 'la' HH:mm:ss", { locale: ro });
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return formatDistanceStrict(0, ms, { locale: ro });
}
