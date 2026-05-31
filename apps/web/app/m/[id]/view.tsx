'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError, resolveMediaUrl, type GenerationDto } from '@/lib/api';
import { track } from '@/lib/tracking';
import { ManeaPlayer } from '@/components/ManeaPlayer';
import { VideoPlayer } from '@/components/VideoPlayer';
import { STYLES, VOICES, OCC } from '@/lib/seed-data';
import { useSite } from '@/lib/site-context';
import { useSession } from '@/lib/providers';
import { formatPrice } from '@/lib/site-shared';
import { getPagePath } from '@/lib/page-slugs';
import { prettifyLyrics } from '@/lib/lyrics-display';
import { RotatingStatus } from '@/components/RotatingStatus';

export default function ShareGenerationView() {
  return (
    <Suspense fallback={null}>
      <ShareGenerationViewInner />
    </Suspense>
  );
}

const IN_PROGRESS_STATUSES = new Set([
  'pending', 'queued', 'writing_lyrics', 'checking_lyrics', 'generating_audio', 'running',
]);

function ShareGenerationViewInner() {
  const t = useTranslations('mViewPage');
  const tLive = useTranslations('generator.live');
  const tStatus = useTranslations('generator.live.status');
  const tStyles = useTranslations('styles');
  const tOcc = useTranslations('occasions');
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const site = useSite();
  const [g, setG] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const viewTrackedRef = useRef(false);
  const purchaseTrackedRef = useRef(false);

  async function refresh() {
    try {
      const fresh = await api.getGeneration(params.id);
      setG(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errUnknown'));
    }
  }

  useEffect(() => {
    refresh();
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling cât timp generation e încă în lucru — UX identic cu pasul demo
  // din Generator (progress bar + statusuri vii).
  useEffect(() => {
    if (!g) return;
    // Continuăm polling-ul cât timp generarea e în lucru SAU melodia e gata dar
    // livrabilele extra (imagini/videoclip) încă se generează în fundal.
    const stillEnriching = g.status === 'succeeded' && g.deliverablesReady === false;
    if (!IN_PROGRESS_STATUSES.has(g.status) && !stillEnriching) return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [g?.status, g?.deliverablesReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!g || viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    track('ViewContent', {
      content_id: g.id,
      content_name: `Manea pentru ${g.recipientName}`,
      content_type: 'product',
      value: site.basePriceCents / 100,
      currency: site.currency,
    });
  }, [g, site.basePriceCents, site.currency]);

  useEffect(() => {
    const paymentId = search.get('paymentId');
    const success = search.get('success');
    if (!paymentId || success !== '1' || unlocking) return;
    setUnlocking(true);
    (async () => {
      let paid: { amount: number; currency: string } | null = null;
      for (let i = 0; i < 10; i++) {
        try {
          const p = await api.getPayment(paymentId);
          if (p?.status === 'paid') {
            paid = { amount: p.amount, currency: p.currency };
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1000));
      }
      try {
        await api.unlockGeneration(params.id, paymentId);
        await refresh();
        if (paid && !purchaseTrackedRef.current) {
          purchaseTrackedRef.current = true;
          track('Purchase', {
            content_id: params.id,
            content_name: 'Manea Cadou',
            content_type: 'product',
            value: paid.amount / 100,
            currency: paid.currency,
            // event_id MATCH cu server-side webhook (`pay-${paymentId}`).
            // Dedup OK în Events Manager → un singur Purchase per achiziție.
            event_id: `pay-${paymentId}`,
          });
        }
      } catch (e) {
        setError(`${t('unlockFailed')} ${(e as Error).message}`);
      } finally {
        setUnlocking(false);
        window.history.replaceState({}, '', `/m/${params.id}`);
      }
    })();
  }, [search, params.id, unlocking]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <main style={{ padding: 40, textAlign: 'center' }}><p>{error}</p></main>;
  if (!g) return <main style={{ padding: 40, textAlign: 'center' }}><p className="ld">{t('loading')}</p></main>;

  const isPaid = g.type === 'full' || g.paidUnlocked;
  const inProgress = IN_PROGRESS_STATUSES.has(g.status);
  // Pachetele plus/premium au livrabile extra (imagini sociale; + videoclip la
  // premium) care se generează în fundal după ce melodia e gata. Cât
  // `deliverablesReady` e false, arătăm placeholder-e „se generează".
  const tierHasExtras = g.packageTier === 'plus' || g.packageTier === 'premium';
  const enriching = isPaid && tierHasExtras && g.deliverablesReady === false;
  // Lookup chain: admin-defined config per site (cu i18n localizare) → seed-data
  //               → traduceri next-intl (pentru seed-data ids) → literal id.
  const adminStyle = site.styles?.find((s) => s.id === g.style);
  const adminOcc = site.occasions?.find((o) => o.id === g.occasion);
  const adminVoice = site.voices?.find((v) => v.id === g.voiceArtist);
  const styleNm =
    adminStyle?.i18n?.[site.locale]?.nm ||
    adminStyle?.nm ||
    ((tStyles as any).has?.(`${g.style}.nm`) ? tStyles(`${g.style}.nm` as any) : null) ||
    STYLES.find((s) => s.id === g.style)?.nm ||
    g.style;
  const occNm =
    adminOcc?.i18n?.[site.locale]?.nm ||
    adminOcc?.nm ||
    ((tOcc as any).has?.(g.occasion) ? tOcc(g.occasion as any) : null) ||
    OCC.find((o) => o.id === g.occasion)?.nm ||
    g.occasion;
  const voiceNm =
    adminVoice?.i18n?.[site.locale]?.nm ||
    adminVoice?.nm ||
    VOICES.find((v) => v.id === g.voiceArtist)?.nm ||
    g.voiceArtist;

  return (
    <main style={{ maxWidth: 600, margin: '40px auto', padding: 20 }}>
      <Link href={getPagePath(site.locale, 'manelele-mele')} style={{
        display: 'inline-block', marginBottom: 14, fontSize: 12,
        color: 'var(--gold)', textDecoration: 'none',
      }}>
        {t('backToMine')}
      </Link>

      <h1 className="gold-text serif" style={{ fontSize: 28 }}>{`"${t('forSomeone', { name: g.recipientName })}"`}</h1>
      <p className="ld" style={{ marginTop: 4 }}>
        {styleNm} · {occNm} · {t('voiceLabel')}: {voiceNm}
      </p>
      {g.dedication && (
        <p className="ld" style={{ marginTop: 2, fontSize: 13 }}>{t('fromSomeone', { from: g.dedication })}</p>
      )}
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 999,
          background: isPaid ? 'rgba(62,224,126,0.15)' : 'rgba(241,200,77,0.15)',
          color: isPaid ? '#bff5d2' : '#f1c84d', fontWeight: 600,
        }}>
          {isPaid ? t('unlockedBadge') : t('demoBadge')}
        </span>
        {g.packageTier === 'premium' && (
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 999,
            background: 'linear-gradient(180deg,#ffe28a,#f1c84d,#b07c1e)',
            color: '#2a1a04', fontWeight: 800, letterSpacing: '0.04em',
          }}>
            👑 PREMIUM
          </span>
        )}
        {g.status === 'failed' && (
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 999,
            background: 'rgba(255,90,90,0.15)', color: '#ffb3b3', fontWeight: 600,
          }}>
            ⚠️ {t('statusLabel')} {g.status}
          </span>
        )}
      </div>

      {unlocking && (
        <div style={{
          marginTop: 14, padding: 12, borderRadius: 8,
          background: 'rgba(241,200,77,0.1)', border: '1px solid rgba(241,200,77,0.4)',
        }}>
          {t('confirmingPayment')}
        </div>
      )}

      {inProgress && (
        <GenerationProgress
          generation={g}
          locale={site.locale}
          tLive={tLive}
          tStatus={tStatus}
        />
      )}

      {g.audioUrl && (
        <div style={{ marginTop: 16 }}>
          <ManeaPlayer
            audioUrl={resolveMediaUrl(g.audioUrl)!}
            title={t('version1')}
            subtitle={isPaid ? t('full') : t('demo30')}
          />
        </div>
      )}
      {g.bonusAudioUrl && (
        <div style={{ marginTop: 12 }}>
          <ManeaPlayer
            audioUrl={resolveMediaUrl(g.bonusAudioUrl)!}
            title={t('version2')}
            subtitle={isPaid ? t('full') : t('demo30')}
          />
        </div>
      )}

      {!isPaid && g.status === 'succeeded' && g.audioUrl && (
        <PaywallSection generationId={g.id} />
      )}

      {/* Videoclipurile sunt clipuri SCURTE verticale (refren, stil TikTok).
          Le afișăm UNUL LÂNGĂ ALTUL — 2 coloane, inclusiv pe mobil (verticale
          înguste). Dacă există doar unul, e afișat singur (flex se descurcă). */}
      {(() => {
        const videoPoster = resolveMediaUrl(
          g.socialImageUploaded ?? g.socialImageSelected ?? g.coverUrl,
        );
        const clips = [g.videoUrl, g.videoUrlBonus].filter(Boolean) as string[];
        if (clips.length > 0) {
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
                🎬 Videoclipuri (refren)
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {clips.map((url, i) => (
                  <div key={url + i} style={{ flex: 1, minWidth: 0 }}>
                    <VideoPlayer src={resolveMediaUrl(url)!} poster={videoPoster} />
                  </div>
                ))}
              </div>
            </div>
          );
        }
        // Cât livrabilele premium se montează și încă nu există niciun video.
        if (enriching && g.packageTier === 'premium') {
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
                🎬 Videoclipuri (refren)
              </div>
              <div className="ld" style={{ fontSize: 13, opacity: 0.85 }}>
                ⏳ Se montează videoclipul… (apare automat în câteva minute)
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Colaj video din pozele tale — doar după plată și melodie finalizată. */}
      {isPaid && g.status === 'succeeded' && <CollageSection generation={g} />}

      {g.status === 'succeeded' && !!(g.socialImages && g.socialImages.length) ? (
        <SocialImageSection
          generation={g}
          // BUG FIX: endpoint-urile select/upload întorc un obiect PARȚIAL
          // (ex. `{ ok, socialImageSelected }`). Înlocuirea totală a obiectului
          // golea pagina (titlu fără nume, „Demo — preview"). Facem MERGE ca să
          // păstrăm restul câmpurilor (recipientName, type, audioUrl, videoUrl…).
          onUpdated={(fresh) => setG((prev) => (prev ? { ...prev, ...fresh } : prev))}
        />
      ) : enriching ? (
        <div style={{
          marginTop: 16, padding: 16, borderRadius: 12,
          border: '1px solid rgba(241,200,77,0.25)', background: 'rgba(241,200,77,0.04)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
            📸 Poza ta de share
          </div>
          <div className="ld" style={{ fontSize: 13, opacity: 0.85 }}>
            ⏳ Se generează pozele pentru share… (apar automat în câteva momente)
          </div>
        </div>
      ) : null}

      {g.status === 'succeeded' && (
        <ShareSection
          recipientName={g.recipientName ?? 'cadou'}
          imageUrl={resolveMediaUrl(g.socialImageUploaded ?? g.socialImageSelected ?? g.coverUrl)}
        />
      )}

      {g.lyrics && (
        <details style={{ marginTop: 18 }}>
          <summary style={{ fontSize: 13, color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>
            {t('lyricsToggle')}
          </summary>
          <pre style={{
            whiteSpace: 'pre-wrap', marginTop: 10, color: 'var(--gold-2)',
            background: 'rgba(241,200,77,0.05)', padding: 12, borderRadius: 8,
            fontSize: 13, lineHeight: 1.6,
          }}>{prettifyLyrics(g.lyrics, site.locale)}</pre>
        </details>
      )}
    </main>
  );
}

/** Progress bar time-based — replică din Generator.tsx (`useTimeBasedProgress`).
 *  În primele 180s urcă liniar până la 90%, apoi încet spre 99% până la finalizare. */
function useTimeBasedProgress(generation: GenerationDto): number {
  const startMs = useMemo(() => {
    const t = new Date(generation.createdAt).getTime();
    return Number.isFinite(t) ? t : Date.now();
  }, [generation.createdAt]);

  const computePct = useCallback((): number => {
    if (generation.status === 'succeeded' || generation.status === 'failed') return 100;
    const elapsedSec = Math.max(0, (Date.now() - startMs) / 1000);
    if (elapsedSec <= 180) return (elapsedSec / 180) * 90;
    return Math.min(99, 90 + (elapsedSec - 180) / 60);
  }, [generation.status, startMs]);

  const [pct, setPct] = useState<number>(computePct);

  useEffect(() => {
    setPct(computePct());
    if (generation.status === 'succeeded' || generation.status === 'failed') return;
    const id = setInterval(() => setPct(computePct()), 1000);
    return () => clearInterval(id);
  }, [computePct, generation.status]);

  return Math.min(100, Math.max(0, pct));
}

/** UI „live" pentru generation în curs — identic vizual cu pasul demo din
 *  Generator.tsx (titlu working, status, progress bar, ciornă/versuri verificate). */
function GenerationProgress({
  generation,
  locale,
  tLive,
  tStatus,
}: {
  generation: GenerationDto;
  locale: string;
  tLive: ReturnType<typeof useTranslations>;
  tStatus: ReturnType<typeof useTranslations>;
}) {
  const pct = useTimeBasedProgress(generation);
  // Pe „generating_audio" rotim mai multe fraze cu mică animație, ca la Claude Code.
  // Pe celelalte statusuri afișăm un singur label din `generator.live.status.*`.
  const rotation: string[] | null = (() => {
    if (generation.status !== 'generating_audio') return null;
    try {
      const raw = tLive.raw('statusRotation.generating_audio');
      return Array.isArray(raw) && raw.length > 0 ? (raw as string[]) : null;
    } catch { return null; }
  })();
  const fallbackLabel = (() => {
    try { return tStatus(generation.status as any); } catch { return generation.status; }
  })();

  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ margin: 0, fontSize: 18, color: 'var(--gold-2)' }}>
        {tLive('workingTitle')}
      </h3>
      <p className="ld" style={{ marginTop: 4, minHeight: '1.4em' }}>
        {rotation ? <RotatingStatus phrases={rotation} /> : fallbackLabel}
      </p>

      <div style={{
        marginTop: 14, height: 6, borderRadius: 999,
        background: 'rgba(241,200,77,0.1)', overflow: 'hidden',
      }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'linear-gradient(90deg,#ffe28a,#f1c84d,#b07c1e)',
            transition: 'width 1s linear',
          }}
        />
      </div>

      {generation.lyrics && (
        <div style={{
          marginTop: 18, padding: 14, borderRadius: 10,
          background: 'rgba(241,200,77,0.05)',
          border: '1px solid rgba(241,200,77,0.2)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            {tLive('lyricsVerified')}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--gold-2)', fontSize: 13, lineHeight: 1.6 }}>
            {prettifyLyrics(generation.lyrics, locale)}
          </pre>
        </div>
      )}
      {!generation.lyrics && generation.lyricsDraft && (
        <div style={{
          marginTop: 18, padding: 14, borderRadius: 10,
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(241,200,77,0.2)',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            {tLive('lyricsDraft')}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,245,220,0.7)', fontSize: 12, lineHeight: 1.5 }}>
            {prettifyLyrics(generation.lyricsDraft, locale)}
          </pre>
        </div>
      )}
    </div>
  );
}

function PaywallSection({ generationId }: { generationId: string }) {
  const t = useTranslations('mViewPage');
  const tg = useTranslations('generator');
  const site = useSite();
  const session = useSession();
  const fmt = (cents: number) => formatPrice(site, cents);
  const [submittingPay, setSubmittingPay] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountCents: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  const basePrice = site.basePriceCents;
  const finalTotal = Math.max(0, basePrice - (promoApplied?.discountCents ?? 0));

  function translatePromoReason(reason: string | undefined): string {
    switch (reason) {
      case 'invalid': return tg('promo.errInvalid');
      case 'expired': return tg('promo.errExpired');
      case 'not_yet_valid': return tg('promo.errNotYet');
      case 'used_up': return tg('promo.errUsedUp');
      case 'wrong_email': return tg('promo.errWrongEmail');
      case 'empty': return tg('promo.errEmpty');
      default: return tg('promo.errGeneric');
    }
  }

  async function applyPromo() {
    if (!promoCode.trim()) return;
    setPromoError(null);
    setValidatingPromo(true);
    try {
      const r = await api.validatePromo(promoCode.trim(), session.email ?? undefined, basePrice);
      if (r.ok && r.appliedDiscountCents) {
        setPromoApplied({ code: promoCode.trim(), discountCents: r.appliedDiscountCents });
      } else {
        setPromoError(translatePromoReason(r.reason));
      }
    } catch {
      setPromoError(t('errCheckout'));
    } finally {
      setValidatingPromo(false);
    }
  }

  async function startCheckout() {
    setSubmittingPay(true);
    setPayError(null);
    try {
      track('InitiateCheckout', {
        content_id: generationId,
        content_name: 'Manea Cadou',
        content_type: 'product',
        value: site.basePriceCents / 100,
        currency: site.currency,
        // event_id stabil pe generație — dacă userul apasă de 2x, Meta dedup-uiește
        // și contează un singur intent (nu 2 InitiateCheckout fake).
        event_id: generationId ? `init-${generationId}` : undefined,
      });
      const { url } = await api.createCheckoutSession({
        generationId,
        promoCode: promoApplied?.code,
      });
      window.location.href = url;
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : t('errCheckout'));
      setSubmittingPay(false);
    }
  }

  return (
    <div style={{
      marginTop: 22, padding: 16, borderRadius: 12,
      background: 'linear-gradient(135deg, rgba(90,13,24,0.4), rgba(40,12,18,0.4))',
      border: '1px solid var(--gold)',
    }}>
      <h3 style={{ marginTop: 0, fontSize: 18, color: 'var(--gold-2)' }}>
        {t('paywallTitle')}
      </h3>
      <p className="ld" style={{ fontSize: 13, marginTop: 4 }}>
        {t('paywallSub')}
      </p>

      {promoApplied && (
        <div style={{
          marginTop: 10, padding: 10, borderRadius: 8,
          background: 'rgba(62,224,126,0.08)', border: '1px solid rgba(62,224,126,0.4)',
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('priceLine')}</span>
            <span>{fmt(basePrice)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--green)', marginTop: 4 }}>
            <span>{tg('step5PayFirst.promoLine')} <code>{promoApplied.code}</code></span>
            <span>−{fmt(promoApplied.discountCents)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }}>
            <span>{t('totalLine')}</span>
            <span className="gold-text">{fmt(finalTotal)}</span>
          </div>
        </div>
      )}

      <button
        onClick={startCheckout}
        disabled={submittingPay}
        className="btn"
        style={{
          marginTop: 12, width: '100%', padding: '12px 16px', fontWeight: 700,
          background: 'linear-gradient(180deg,#fff5cc 0%,#ffe28a 30%,#f1c84d 60%,#b07c1e 100%)',
          color: '#2a1a04', cursor: submittingPay ? 'wait' : 'pointer',
          opacity: submittingPay ? 0.7 : 1,
        }}
      >
        {submittingPay
          ? t('checkoutLoading')
          : promoApplied
            ? t('unlockCta', { amount: fmt(finalTotal) })
            : t('unlockCtaNoPrice')}
      </button>

      {payError && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{payError}</div>
      )}

      <div style={{ marginTop: 10 }}>
        {!promoApplied ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder={tg('step5PayFirst.promoPlaceholder')}
              value={promoCode}
              onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); }}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8,
                background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)',
                color: 'var(--gold-2)', fontFamily: 'inherit', fontSize: 13,
                fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}
            />
            <button
              type="button"
              onClick={applyPromo}
              disabled={!promoCode.trim() || validatingPromo}
              className="btn btn-ghost btn-sm"
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              {validatingPromo ? t('applying') : t('applyPromo')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setPromoApplied(null); setPromoCode(''); }}
            style={{
              background: 'transparent', border: 'none',
              color: 'rgba(255,245,220,0.5)', cursor: 'pointer', fontSize: 12,
              textDecoration: 'underline',
            }}
          >
            {t('removePromo')}
          </button>
        )}
        {promoError && <div style={{ marginTop: 6, fontSize: 12, color: '#ff8888' }}>{promoError}</div>}
      </div>
    </div>
  );
}

/**
 * Buton share: Web Share API pe mobile, fallback grid pentru desktop
 * (Facebook, WhatsApp, X/Twitter, Copy link).
 */
function ShareSection({ recipientName, imageUrl }: { recipientName: string; imageUrl?: string | null }) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  function getUrl() {
    if (typeof window === 'undefined') return '';
    return window.location.href;
  }
  function getText() {
    return `🎵 Ascultă maneaua personalizată pentru ${recipientName}`;
  }

  /** Încearcă să atașeze poza de share la Web Share API (share nativ cu fișier).
   *  Dacă browserul nu suportă fișiere, cade pe share doar cu link+text. */
  async function buildShareFile(): Promise<File | null> {
    if (!imageUrl || typeof fetch === 'undefined') return null;
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      return new File([blob], `manea-${recipientName}.${ext}`, { type: blob.type });
    } catch {
      return null;
    }
  }

  async function tryNativeShare() {
    if (typeof navigator === 'undefined' || !('share' in navigator)) return false;
    const payload: ShareData = { title: 'Maneaua mea', text: getText(), url: getUrl() };
    const file = await buildShareFile();
    if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      (payload as ShareData & { files: File[] }).files = [file];
    }
    try {
      await navigator.share(payload);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
      return true;
    } catch {
      return false;
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(getUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {/* ignore */}
  }

  const hasNative = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <div style={{
      marginTop: 20, padding: 16, borderRadius: 12,
      background: 'rgba(241,200,77,0.06)',
      border: '1px solid rgba(241,200,77,0.2)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
        Share
      </div>
      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
        Trimite-i melodia destinatarului sau prietenilor.
      </div>

      {hasNative && (
        <button
          type="button"
          onClick={tryNativeShare}
          className="btn btn-gold"
          style={{ width: '100%', marginBottom: 10 }}
        >
          {shared ? '✓ Trimis' : '📤 Trimite cuiva'}
        </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getUrl())}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 12px', borderRadius: 8,
            background: '#1877f2', color: '#fff',
            textDecoration: 'none', fontSize: 13, fontWeight: 600,
          }}
        >
          📘 Facebook
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(getText() + ' ' + getUrl())}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 12px', borderRadius: 8,
            background: '#25d366', color: '#fff',
            textDecoration: 'none', fontSize: 13, fontWeight: 600,
          }}
        >
          💬 WhatsApp
        </a>
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(getText())}&url=${encodeURIComponent(getUrl())}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 12px', borderRadius: 8,
            background: '#000', color: '#fff',
            textDecoration: 'none', fontSize: 13, fontWeight: 600,
          }}
        >
          𝕏 Twitter
        </a>
        <button
          type="button"
          onClick={copyLink}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(241,200,77,0.15)', color: 'var(--gold)',
            border: '1px solid rgba(241,200,77,0.4)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          {copied ? '✓ Copiat' : '🔗 Copiază link'}
        </button>
      </div>

      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 10, lineHeight: 1.4 }}>
        💡 Pentru Instagram: copiază linkul, deschide app-ul și lipește-l în story sau bio.
      </div>
    </div>
  );
}

/**
 * Galerie de poze de share (plus/premium). Afișează variantele generate ca
 * thumbnails stil Spotify, una preselectată (`socialImageSelected`). Click pe
 * alta → select optimistic + persist. Buton de upload pentru poza proprie.
 */
function SocialImageSection({
  generation,
  onUpdated,
}: {
  generation: GenerationDto;
  // Backend-ul întoarce un obiect PARȚIAL (doar câmpurile schimbate), deci
  // callback-ul primește un Partial<GenerationDto>, iar părintele face merge.
  onUpdated: (fresh: Partial<GenerationDto>) => void;
}) {
  const images = generation.socialImages ?? [];
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selected, setSelected] = useState<string | null>(
    generation.socialImageSelected ?? images[0] ?? null,
  );
  const [uploaded, setUploaded] = useState<string | null>(generation.socialImageUploaded ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(url: string) {
    const prev = selected;
    setSelected(url); // optimistic
    setErr(null);
    try {
      const fresh = await api.selectSocialImage(generation.id, url);
      onUpdated(fresh);
    } catch {
      setSelected(prev); // rollback
      setErr('Nu am putut salva selecția. Încearcă din nou.');
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-upload același fișier
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fresh = await api.uploadSocialImage(generation.id, file);
      onUpdated(fresh);
      // `fresh` poate fi parțial — luăm câmpurile dacă există, altfel păstrăm starea.
      const freshUploaded = fresh.socialImageUploaded ?? null;
      setUploaded(freshUploaded);
      setSelected(fresh.socialImageSelected ?? freshUploaded ?? selected);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Încărcarea a eșuat.');
    } finally {
      setBusy(false);
    }
  }

  const allThumbs = uploaded ? [uploaded, ...images] : images;

  return (
    <div style={{
      marginTop: 20, padding: 16, borderRadius: 12,
      background: 'rgba(241,200,77,0.06)',
      border: '1px solid rgba(241,200,77,0.2)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
        📸 Poza ta de share
      </div>
      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
        Alege poza care apare când distribui melodia pe TikTok, Facebook sau Instagram.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {allThumbs.map((url) => {
          const resolved = resolveMediaUrl(url)!;
          const isSel = selected === url;
          return (
            <button
              key={url}
              type="button"
              onClick={() => pick(url)}
              style={{
                position: 'relative', padding: 0, borderRadius: 10, overflow: 'hidden',
                border: `3px solid ${isSel ? 'var(--gold)' : 'transparent'}`,
                cursor: 'pointer', background: '#000', aspectRatio: '1 / 1',
                boxShadow: isSel ? '0 4px 16px rgba(241,200,77,0.4)' : 'none',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolved}
                alt="Variantă poză de share"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {isSel && (
                <span style={{
                  position: 'absolute', top: 6, right: 6,
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--gold)', color: '#2a1a04',
                  display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 900,
                }}>✓</span>
              )}
              {uploaded === url && (
                <span style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  fontSize: 10, fontWeight: 700, textAlign: 'center',
                  padding: '3px 0', background: 'rgba(0,0,0,0.6)', color: 'var(--gold)',
                }}>A ta</span>
              )}
            </button>
          );
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onUpload}
        style={{ display: 'none' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn btn-ghost"
          style={{ flex: '1 1 140px', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Se încarcă…' : '⬆ Încarcă poza ta'}
        </button>
        {/* Descarcă varianta selectată (PNG) — util pentru postare pe TikTok/Instagram. */}
        {selected && (
          <a
            href={resolveMediaUrl(selected)!}
            download
            className="btn btn-ghost"
            style={{ flex: '1 1 140px', textAlign: 'center', textDecoration: 'none' }}
          >
            ⬇ Descarcă poza
          </a>
        )}
      </div>

      {err && <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{err}</div>}
    </div>
  );
}

const MAX_COLLAGE_IMAGES = 15;
const MAX_COLLAGE_FILE_BYTES = 10 * 1024 * 1024; // 10MB / fișier

/**
 * UI „Fă-ți un colaj video" — userul alege una dintre cele 2 melodii, încarcă
 * până la 15 imagini (≤10MB fiecare) și backend-ul montează un colaj video.
 * După submit facem polling la `getLatestCollage` până la succeeded/failed.
 * Degradare grațioasă: dacă endpoint-urile lipsesc, secțiunea nu crapă pagina.
 */
function CollageSection({ generation }: { generation: GenerationDto }) {
  const g = generation;
  // A 2-a melodie există dacă avem audio/video bonus.
  const hasBonus = !!(g.bonusAudioUrl || g.videoUrlBonus);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [trackChoice, setTrackChoice] = useState<'main' | 'bonus'>('main');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Colajul curent (din mount sau după submit) + flag de polling activ.
  const [collage, setCollage] = useState<
    { id: string; status: 'pending' | 'processing' | 'succeeded' | 'failed'; videoUrl?: string | null } | null
  >(null);
  const [polling, setPolling] = useState(false);

  // La mount: vezi dacă există deja un colaj.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const latest = await api.getLatestCollage(g.id);
      if (!cancelled && latest) {
        setCollage(latest);
        if (latest.status === 'pending' || latest.status === 'processing') setPolling(true);
      }
    })();
    return () => { cancelled = true; };
  }, [g.id]);

  // Polling la ~4s cât colajul e în lucru.
  useEffect(() => {
    if (!polling) return;
    const tick = async () => {
      const latest = await api.getLatestCollage(g.id);
      if (latest) {
        setCollage(latest);
        if (latest.status === 'succeeded' || latest.status === 'failed') setPolling(false);
      }
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [polling, g.id]);

  // Curăță object URL-urile de preview la unmount / re-pick.
  useEffect(() => {
    return () => { previews.forEach((u) => URL.revokeObjectURL(u)); };
  }, [previews]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // permite re-pick aceleași fișiere
    if (picked.length === 0) return;
    setErr(null);
    if (picked.length > MAX_COLLAGE_IMAGES) {
      setErr(`Poți alege maxim ${MAX_COLLAGE_IMAGES} imagini. Ai selectat ${picked.length}.`);
      return;
    }
    const tooBig = picked.find((f) => f.size > MAX_COLLAGE_FILE_BYTES);
    if (tooBig) {
      setErr(`„${tooBig.name}" depășește 10MB. Alege imagini mai mici.`);
      return;
    }
    // Eliberează preview-urile vechi și creează altele noi.
    previews.forEach((u) => URL.revokeObjectURL(u));
    setFiles(picked);
    setPreviews(picked.map((f) => URL.createObjectURL(f)));
  }

  async function submit() {
    if (files.length === 0) { setErr('Alege cel puțin o imagine.'); return; }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await api.createCollage(g.id, trackChoice, files);
      setCollage({ id: r.collageId, status: (r.status as any) ?? 'pending' });
      setPolling(true);
      // Eliberăm fișierele după submit (rămâne starea de polling).
      previews.forEach((u) => URL.revokeObjectURL(u));
      setFiles([]);
      setPreviews([]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Nu am putut porni generarea colajului. Încearcă din nou.');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setCollage(null);
    setPolling(false);
    setErr(null);
  }

  const sectionStyle: React.CSSProperties = {
    marginTop: 20, padding: 16, borderRadius: 12,
    background: 'rgba(241,200,77,0.06)', border: '1px solid rgba(241,200,77,0.2)',
  };
  const headerStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8,
  };

  // Stare: colaj gata.
  if (collage?.status === 'succeeded' && collage.videoUrl) {
    const resolved = resolveMediaUrl(collage.videoUrl)!;
    return (
      <div style={sectionStyle}>
        <div style={headerStyle}>🎞️ Colajul tău video</div>
        <VideoPlayer src={resolved} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <a href={resolved} download className="btn btn-gold" style={{ flex: '1 1 140px', textAlign: 'center', textDecoration: 'none' }}>
            ⬇ Descarcă
          </a>
          <button type="button" onClick={reset} className="btn btn-ghost" style={{ flex: '1 1 140px' }}>
            🔁 Fă altul
          </button>
        </div>
      </div>
    );
  }

  // Stare: în lucru (pending/processing).
  if (collage && (collage.status === 'pending' || collage.status === 'processing')) {
    return (
      <div style={sectionStyle}>
        <div style={headerStyle}>🎞️ Fă-ți un colaj video</div>
        <div className="ld" style={{ fontSize: 13, opacity: 0.85 }}>
          ⏳ Se generează colajul video… (durează câteva minute, primești și pe email)
        </div>
      </div>
    );
  }

  // Stare: eșuat — mesaj prietenos + retry.
  if (collage?.status === 'failed') {
    return (
      <div style={sectionStyle}>
        <div style={headerStyle}>🎞️ Fă-ți un colaj video</div>
        <div style={{ fontSize: 13, color: '#ffb3b3', marginBottom: 10 }}>
          😕 Ne pare rău, colajul nu a putut fi generat. Mai încearcă o dată.
        </div>
        <button type="button" onClick={reset} className="btn btn-gold" style={{ width: '100%' }}>
          🔁 Încearcă din nou
        </button>
      </div>
    );
  }

  // Stare: formular de upload.
  return (
    <div style={sectionStyle}>
      <div style={headerStyle}>🎞️ Fă-ți un colaj video</div>
      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
        Încarcă-ți pozele și le montăm într-un videoclip pe melodia ta.
      </div>

      {/* Alegerea melodiei */}
      {hasBonus && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Pe ce melodie?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { value: 'main', label: 'Melodia 1' },
              { value: 'bonus', label: 'Melodia 2' },
            ] as const).map((opt) => {
              const active = trackChoice === opt.value;
              return (
                <label
                  key={opt.value}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    border: `2px solid ${active ? 'var(--gold)' : 'var(--line)'}`,
                    background: active ? 'rgba(241,200,77,0.12)' : 'rgba(0,0,0,0.25)',
                    color: active ? 'var(--gold)' : 'var(--gold-2)',
                  }}
                >
                  <input
                    type="radio"
                    name="collage-track"
                    value={opt.value}
                    checked={active}
                    onChange={() => setTrackChoice(opt.value)}
                    style={{ accentColor: 'var(--gold)' }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPick}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={submitting}
        className="btn btn-ghost"
        style={{ width: '100%', opacity: submitting ? 0.6 : 1 }}
      >
        {files.length > 0 ? `📷 ${files.length} imagini selectate (schimbă)` : '⬆ Alege imagini (max 15)'}
      </button>

      {previews.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 10 }}>
          {previews.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src + i}
              src={src}
              alt={`Imagine ${i + 1}`}
              style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, display: 'block', background: '#000' }}
            />
          ))}
        </div>
      )}

      {files.length > 0 && (
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="btn btn-gold"
          style={{ width: '100%', marginTop: 12, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? 'Se trimite…' : '🎬 Generează colajul'}
        </button>
      )}

      {err && <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{err}</div>}
    </div>
  );
}
