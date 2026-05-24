'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError, resolveMediaUrl, type GenerationDto } from '@/lib/api';
import { track } from '@/lib/tracking';
import { ManeaPlayer } from '@/components/ManeaPlayer';
import { STYLES, VOICES, OCC } from '@/lib/seed-data';
import { useSite } from '@/lib/site-context';
import { useSession } from '@/lib/providers';
import { formatPrice } from '@/lib/site-shared';
import { getPagePath } from '@/lib/page-slugs';

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
    if (!IN_PROGRESS_STATUSES.has(g.status)) return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [g?.status]); // eslint-disable-line react-hooks/exhaustive-deps

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
            event_id: paymentId,
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
        {!inProgress && (
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 999,
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,245,220,0.6)',
          }}>
            {t('statusLabel')} {g.status}
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

      {g.lyrics && (
        <details style={{ marginTop: 18 }}>
          <summary style={{ fontSize: 13, color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>
            {t('lyricsToggle')}
          </summary>
          <pre style={{
            whiteSpace: 'pre-wrap', marginTop: 10, color: 'var(--gold-2)',
            background: 'rgba(241,200,77,0.05)', padding: 12, borderRadius: 8,
            fontSize: 13, lineHeight: 1.6,
          }}>{g.lyrics}</pre>
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
  tLive,
  tStatus,
}: {
  generation: GenerationDto;
  tLive: ReturnType<typeof useTranslations>;
  tStatus: ReturnType<typeof useTranslations>;
}) {
  const pct = useTimeBasedProgress(generation);
  const statusLabel = (() => {
    try { return tStatus(generation.status as any); } catch { return generation.status; }
  })();

  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ margin: 0, fontSize: 18, color: 'var(--gold-2)' }}>
        {tLive('workingTitle')}
      </h3>
      <p className="ld" style={{ marginTop: 4 }}>{statusLabel}</p>

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
            {generation.lyrics}
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
            {generation.lyricsDraft}
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
