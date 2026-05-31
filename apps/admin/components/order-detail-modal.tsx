'use client';

import { useState } from 'react';
import { useAsync, useAsyncCallback } from '@/lib/hooks/use-async';
import { AdminApi, type OrderDetail, type AdminVariation } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty } from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { format, formatDistanceStrict } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  AlertCircle,
  ArrowUpToLine,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  Film,
  Mail,
  MessageSquare,
  Music2,
  RefreshCw,
  Repeat,
  Scissors,
  Shuffle,
  Sparkles,
  Trash2,
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

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="flex w-full flex-wrap justify-start gap-1">
        <TabsTrigger value="overview">Privire generală</TabsTrigger>
        <TabsTrigger value="form">Comandă (formular)</TabsTrigger>
        <TabsTrigger value="payment">Plată</TabsTrigger>
        <TabsTrigger value="audio">Audio + versuri</TabsTrigger>
        {data.generation && <TabsTrigger value="studio">🎚 Studio</TabsTrigger>}
        <TabsTrigger value="suno">Suno ({sunoCount})</TabsTrigger>
        <TabsTrigger value="openai">OpenAI ({lyricsCount})</TabsTrigger>
        <TabsTrigger value="emails">Email ({emailCount})</TabsTrigger>
        {chatCount > 0 && (
          <TabsTrigger value="chat">
            Chat ({chatCount}){chatFallback ? '?' : ''}
          </TabsTrigger>
        )}
        {toolCount > 0 && <TabsTrigger value="ai-tools">AI tools ({toolCount})</TabsTrigger>}
        <TabsTrigger value="analytics">Sursă ({eventCount})</TabsTrigger>
        <TabsTrigger value="timeline">Cronologie ({data.timeline.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="overview"><OverviewTab data={data} /></TabsContent>
      <TabsContent value="form"><FormTab data={data} /></TabsContent>
      <TabsContent value="payment"><PaymentTab data={data} /></TabsContent>
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
    </Tabs>
  );
}

// ============== TAB: Overview ==============

function OverviewTab({ data }: { data: OrderDetail }) {
  const g = data.generation;
  const p = data.payment;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card title="Comandă" icon={<Music2 className="h-4 w-4" />}>
        {g ? (
          <>
            <Kv k="Destinatar" v={<span className="font-medium">{g.recipientName}</span>} />
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
            {g.tipAmount > 0 && <Kv k="Bacșiș" v={`${g.tipAmount} ${data.site?.currency ?? ''}`} />}
            {g.inferredFromChat && (
              <Kv k="Origine" v={<Badge variant="info">📩 Comandă din chat AI</Badge>} />
            )}
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

function FormTab({ data }: { data: OrderDetail }) {
  const g = data.generation;
  if (!g) return <Empty title="Nicio generation legată" />;
  return (
    <div className="space-y-4">
      <Card title="Date introduse de client">
        <Kv k="Destinatar" v={g.recipientName} />
        {g.recipientGender && <Kv k="Sex destinatar" v={g.recipientGender === 'M' ? 'Bărbat' : 'Femeie'} />}
        {g.dedicatorName && <Kv k="De la (dedică)" v={g.dedicatorName} />}
        <Kv k="Ocazie" v={g.occasion} />
        <Kv k="Stil" v={g.style} />
        <Kv k="Voce" v={voiceLabel(g.voiceArtist)} />
        <Kv k="Locale" v={g.locale} />
        <Kv k="Durată" v={`${g.durationSec}s`} />
        {g.packageTier && <Kv k="Pachet" v={packageLabel(g.packageTier)} />}
        <Kv k="Premium" v={g.premium ? 'da' : 'nu'} />
        <Kv k="Bacșiș (tipAmount)" v={String(g.tipAmount)} />
      </Card>

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

function PaymentTab({ data }: { data: OrderDetail }) {
  const p = data.payment;
  const g = data.generation;
  // Lazy: cerem datele de facturare Stripe doar când userul intră pe tab.
  const { data: stripeDetails, loading: stripeLoading } = useAsync(
    () => (p ? AdminApi.paymentStripeDetails(p.id) : Promise.resolve(null)),
    [p?.id],
  );
  if (!p) return <Empty title="Demo gratuit — fără plată" />;

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
        {p.failureCode && <Kv k="Cod eșec" v={<code className="text-rose-300">{p.failureCode}</code>} />}
        {p.failureReason && (
          <Kv k="Motiv eșec" v={<span className="text-rose-200">{p.failureReason}</span>} />
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

  const canSunoTools = !!g.providerJobId && g.providerJobId !== 'manual';
  const upd = (patch: Partial<typeof edits>) => setEdits((s) => ({ ...s, ...patch }));

  return (
    <div className="space-y-4">
      {/* ===== Editează & Regenerează ===== */}
      <Card title="Editează & Regenerează" icon={<Wand2 className="h-4 w-4 text-amber-300" />}>
        <div className="grid gap-2 sm:grid-cols-2">
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
        <Field label="Mesaj">
          <textarea
            value={edits.message}
            onChange={(e) => upd({ message: e.target.value })}
            rows={2}
            className="w-full rounded border border-white/10 bg-black/40 p-2 text-xs"
          />
        </Field>

        <div className="mt-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Versuri</p>
          <RadioRow
            value={lyricsMode}
            onChange={(v) => setLyricsMode(v as typeof lyricsMode)}
            options={[
              { value: 'rewrite', label: 'Rescrie (AI din câmpuri)' },
              { value: 'keep', label: 'Păstrează actualele' },
              { value: 'custom', label: 'Versuri custom' },
            ]}
          />
          {lyricsMode === 'custom' && (
            <textarea
              value={customLyrics}
              onChange={(e) => setCustomLyrics(e.target.value)}
              rows={8}
              className="mt-1 w-full rounded border border-white/10 bg-black/40 p-2 font-mono text-[11px]"
              placeholder="[Verse 1]&#10;..."
            />
          )}
        </div>

        <div className="mt-3">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Unde merge rezultatul</p>
          <RadioRow
            value={target}
            onChange={(v) => setTarget(v as typeof target)}
            options={[
              { value: 'new_track', label: '➕ Piesă nouă în comandă (variație)' },
              { value: 'overwrite', label: '⚠ Suprascrie melodia actuală' },
              { value: 'new_order', label: '🆕 Comandă nouă separată' },
            ]}
          />
        </div>

        <Button
          className="mt-3"
          variant="default"
          size="sm"
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
        >
          <Wand2 className="h-4 w-4" /> {acting === 'regen' ? 'Se trimite…' : 'Regenerează'}
        </Button>
      </Card>

      {/* ===== Unelte rapide ===== */}
      <Card title="Unelte rapide (Suno)" icon={<Sparkles className="h-4 w-4 text-amber-300" />}>
        <div className="mb-2 flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">Operează pe:</span>
          <Sel
            value={slot}
            onChange={(v) => setSlot(v as 'main' | 'bonus')}
            options={[
              { value: 'main', label: 'Piesa principală' },
              { value: 'bonus', label: 'Piesa bonus' },
            ]}
          />
        </div>
        {!canSunoTools && (
          <p className="mb-2 rounded bg-amber-500/10 p-2 text-[11px] text-amber-200">
            Uneltele Suno (extend, WAV, karaoke, video) nu sunt disponibile — melodia a fost
            încărcată manual sau nu are un task Suno. Cover și regenerarea funcționează.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="xs" variant="secondary" disabled={!!acting}
            onClick={() => act('reroll', () => AdminApi.generationReroll(g.id), 'Re-roll pornit')}>
            <Repeat className="h-3.5 w-3.5" /> Re-roll
          </Button>
          <Button size="xs" variant="secondary" disabled={!!acting || !g.bonusAudioUrl}
            onClick={() => act('swap', () => AdminApi.generationSwapTracks(g.id), 'Piese interschimbate')}>
            <Shuffle className="h-3.5 w-3.5" /> Swap principală↔bonus
          </Button>
          <Button size="xs" variant="secondary" disabled={!!acting || !canSunoTools}
            onClick={() => act('extend', () => AdminApi.generationExtend(g.id, { slot, continueAt: extendAt ? Number(extendAt) : undefined }), 'Extend pornit')}>
            <ArrowUpToLine className="h-3.5 w-3.5" /> Prelungește
          </Button>
          <input
            value={extendAt}
            onChange={(e) => setExtendAt(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="de la sec"
            className="w-20 rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px]"
          />
          <Button size="xs" variant="secondary" disabled={!!acting}
            onClick={() => act('cover', () => AdminApi.generationCover(g.id, { slot, style: coverStyle.trim() || undefined }), 'Cover pornit')}>
            <Wand2 className="h-3.5 w-3.5" /> Cover/restyle
          </Button>
          <input
            value={coverStyle}
            onChange={(e) => setCoverStyle(e.target.value)}
            placeholder="stil cover (opțional)"
            className="w-40 rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px]"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="xs" variant="outline" disabled={!!acting || !canSunoTools}
            onClick={() => act('wav', () => AdminApi.generationWav(g.id, slot), 'WAV în lucru')}>
            <Download className="h-3.5 w-3.5" /> WAV studio
          </Button>
          <Button size="xs" variant="outline" disabled={!!acting || !canSunoTools}
            onClick={() => act('karaoke', () => AdminApi.generationSeparateVocals(g.id, slot, 'separate_vocal'), 'Karaoke în lucru')}>
            <Scissors className="h-3.5 w-3.5" /> Voce/Instrumental
          </Button>
          <Button size="xs" variant="outline" disabled={!!acting || !canSunoTools}
            onClick={() => act('stems', () => AdminApi.generationSeparateVocals(g.id, slot, 'split_stem'), 'Stem-uri în lucru')}>
            <Scissors className="h-3.5 w-3.5" /> Stem-uri (12)
          </Button>
          <Button size="xs" variant="outline" disabled={!!acting || !canSunoTools}
            onClick={() => act('video', () => AdminApi.generationMusicVideo(g.id, slot), 'Videoclip în lucru')}>
            <Film className="h-3.5 w-3.5" /> Videoclip MP4
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Operațiile rulează în fundal (Suno + procesare). Variațiile apar mai jos; fișierele
          derivate (WAV/karaoke/video) apar în secțiunea respectivă după ~1-3 min.
        </p>
      </Card>

      {/* ===== Variații ===== */}
      <Card title={`Variații (${variations.data?.length ?? 0})`} icon={<Music2 className="h-4 w-4" />}>
        {!variations.data || variations.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nicio variație încă. Folosește „Regenerează" (piesă nouă), „Re-roll", „Prelungește" sau „Cover".
          </p>
        ) : (
          <div className="space-y-2">
            {variations.data.map((v) => (
              <VariationRow key={v.id} v={v} acting={!!acting}
                onPromote={(s) => act('promote', () => AdminApi.generationPromote(v.id, { slot: s, notify: false }), `Pusă ca ${s === 'main' ? 'principală' : 'bonus'}`)}
                onDelete={() => act('delvar', () => AdminApi.generationDeleteVariation(v.id), 'Variație ștearsă')}
              />
            ))}
          </div>
        )}
      </Card>

      {/* ===== Fișiere derivate ===== */}
      <MediaExtrasCard g={g} />
    </div>
  );
}

function VariationRow({
  v,
  acting,
  onPromote,
  onDelete,
}: {
  v: AdminVariation;
  acting: boolean;
  onPromote: (slot: 'main' | 'bonus') => void;
  onDelete: () => void;
}) {
  const ready = v.status === 'succeeded' && !!v.audioUrl;
  const audio = v.demoAudioUrl ?? v.audioUrl;
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-2">
      <div className="mb-1 flex items-center gap-2 text-[11px]">
        <Badge variant="info">{v.variationLabel ?? 'Variație'}</Badge>
        <StatusBadge status={v.status} />
        <code className="text-muted-foreground">{v.style}</code>
        <span className="text-muted-foreground">· {voiceLabel(v.voiceArtist)}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{fmtDateTime(v.createdAt)}</span>
      </div>
      {v.error && <p className="mb-1 text-[11px] text-rose-300">{v.error}</p>}
      {audio && <audio controls src={audio} className="mb-1 h-8 w-full" />}
      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" variant="success" disabled={acting || !ready} onClick={() => onPromote('main')}>
          <ArrowUpToLine className="h-3 w-3" /> Pune ca principală
        </Button>
        <Button size="xs" variant="secondary" disabled={acting || !ready} onClick={() => onPromote('bonus')}>
          <ArrowUpToLine className="h-3 w-3" /> Ca bonus
        </Button>
        <Button size="xs" variant="destructive" disabled={acting} onClick={onDelete}>
          <Trash2 className="h-3 w-3" /> Șterge
        </Button>
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
    <Card title="Fișiere derivate (WAV / karaoke / video)" icon={<Download className="h-4 w-4" />}>
      <div className="space-y-1 text-xs">
        {m?.wavUrl && <ExtLink label="WAV principal" url={m.wavUrl} />}
        {m?.wavBonusUrl && <ExtLink label="WAV bonus" url={m.wavBonusUrl} />}
        {m?.vocalUrl && <ExtLink label="Voce izolată" url={m.vocalUrl} />}
        {m?.accompanimentUrl && <ExtLink label="Instrumental (karaoke)" url={m.accompanimentUrl} />}
        {stems.map(([k, url]) => (
          <ExtLink key={k} label={`Stem: ${k}`} url={url} />
        ))}
        {m?.musicVideoUrl && <ExtLink label="Videoclip principal" url={m.musicVideoUrl} />}
        {m?.musicVideoBonusUrl && <ExtLink label="Videoclip bonus" url={m.musicVideoBonusUrl} />}
      </div>
    </Card>
  );
}

function ExtLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/5 py-1">
      <span className="text-muted-foreground">{label}</span>
      <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
        descarcă <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-muted-foreground">{label}</span>
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
      className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-white/10 bg-black/40 px-2 py-1 text-xs"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[hsl(220_22%_9%)]">
          {o.label}
        </option>
      ))}
    </select>
  );
}

function RadioRow({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded border px-2 py-1 text-[11px] ${
            value === o.value
              ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
              : 'border-white/10 bg-black/30 text-muted-foreground hover:bg-white/5'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
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
