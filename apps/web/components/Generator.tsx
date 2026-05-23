'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Ic } from './icons';
import { SiteIcon } from './SiteIcon';
import { Wave } from './sections';
import { ManeaPlayer } from './ManeaPlayer';
import { OCC, STYLES, VOICES, type StyleOption } from '@/lib/seed-data';
import type { SiteOccasionEntry, SiteStyleEntry, SiteVoiceEntry } from '@/lib/site-shared';
import { suggestMessage } from '@/lib/message-suggest';
import {
  api,
  ApiError,
  type GenerationDto,
  type GenStatus,
  type RecentDto,
  type PriceQuote,
} from '@/lib/api';
import { useGenerationPolling, useSession } from '@/lib/providers';
import { useSite } from '@/lib/site-context';
import { track } from '@/lib/tracking';
import { formatPrice } from '@/lib/site-shared';
import { claimPlayback, releasePlayback } from '@/lib/audio-registry';

type Data = {
  style: string;
  occ: string;
  name: string;
  msg: string;
  voice: string;
  customLyrics: string;
  dedic: string;
  tipAmount: number;
  premium: boolean;
};

const EMPTY: Data = {
  style: '',
  occ: '',
  name: '',
  msg: '',
  voice: '',
  customLyrics: '',
  dedic: '',
  tipAmount: 0,
  premium: false,
};

const STEP_NAMES_FALLBACK = ['Stil', 'Ocazie', 'Detalii', 'Cadou', 'Demo', 'Deblochează'];
const STEP_NAMES_PAYFIRST_FALLBACK = ['Stil', 'Ocazie', 'Detalii', 'Cadou', 'Plătește'];

// Cache global pentru mostrele audio (voice/style) — evită refetch-urile.
// `null` înseamnă "am cerut, nu există mostră publică pentru această voce/stil".
const SAMPLE_CACHE = new Map<string, string | null>();

/**
 * Player partajat pentru mostrele de voce/stil din carduri.
 * Când `playing` are forma `voice-XYZ` sau `style-XYZ`, fetchează cea mai recentă
 * piesă publică ce folosește acea voce / acel stil și o redă (max 30s preview).
 * La schimbarea selecției sau la unmount, audio-ul curent e oprit.
 */
function useSamplePreview(
  playing: string | null,
  onAutoStop: (id: string) => void,
) {
  const site = useSite();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Oprește orice mostră anterioară de fiecare dată când `playing` se schimbă.
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
      audioRef.current = null;
    }
    activeKeyRef.current = null;

    if (!playing) return;
    const isVoice = playing.startsWith('voice-');
    const isStyle = playing.startsWith('style-');
    if (!isVoice && !isStyle) return; // nu e treaba noastră (ex: demouri din QuickListen)

    const id = playing.slice(isVoice ? 'voice-'.length : 'style-'.length);
    const key = playing;
    activeKeyRef.current = key;
    let cancelled = false;

    // Sursa preferată: mostrele pre-generate per site (admin → /sites/:id/samples).
    // Fallback: cea mai recentă piesă publică care folosește acel stil/voce.
    const presetUrl = isStyle
      ? site.styleSamples?.[id]?.audioUrl
      : site.voiceSamples?.[id]?.audioUrl;

    async function startPlayback(url: string) {
      if (cancelled || activeKeyRef.current !== key) return;
      const a = new Audio(url);
      a.preload = 'auto';
      audioRef.current = a;
      const stopAt = 30;
      const stopFn = () => {
        try {
          a.pause();
        } catch {
          /* noop */
        }
      };
      a.addEventListener('play', () => claimPlayback(stopFn));
      a.addEventListener('pause', () => releasePlayback(stopFn));
      a.addEventListener('timeupdate', () => {
        if (a.currentTime >= stopAt) {
          a.pause();
          a.currentTime = 0;
          if (activeKeyRef.current === key) onAutoStop(key);
        }
      });
      a.addEventListener('ended', () => {
        releasePlayback(stopFn);
        if (activeKeyRef.current === key) onAutoStop(key);
      });
      try {
        await a.play();
      } catch {
        // browser a blocat (rare după click) — oprim starea vizuală
        if (activeKeyRef.current === key) onAutoStop(key);
      }
    }

    (async () => {
      // 1. Mostrele admin (preset per site) au prioritate — sună exact pe limba/genul site-ului.
      if (presetUrl) {
        await startPlayback(presetUrl);
        return;
      }
      const cached = SAMPLE_CACHE.get(key);
      if (cached === null) {
        // știm deja că nu există mostră
        if (activeKeyRef.current === key) onAutoStop(key);
        return;
      }
      if (cached) {
        await startPlayback(cached);
        return;
      }
      try {
        const params = isVoice ? { voice: id, limit: 1 } : { style: id, limit: 1 };
        const res = await api.publicGenerations({ ...params, sort: 'recent' });
        const url = res.items.find((it) => !!it.audioUrl)?.audioUrl ?? null;
        SAMPLE_CACHE.set(key, url);
        if (cancelled || activeKeyRef.current !== key) return;
        if (!url) {
          onAutoStop(key);
          return;
        }
        await startPlayback(url);
      } catch {
        SAMPLE_CACHE.set(key, null);
        if (activeKeyRef.current === key) onAutoStop(key);
      }
    })();

    return () => {
      cancelled = true;
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {}
      }
    };
  }, [playing, onAutoStop, site.styleSamples, site.voiceSamples]);
}

export function Generator(props: { playing: string | null; onPlay: (id: string) => void }) {
  return (
    <Suspense fallback={null}>
      <GeneratorInner {...props} />
    </Suspense>
  );
}

function GeneratorInner({ playing, onPlay }: { playing: string | null; onPlay: (id: string) => void }) {
  const session = useSession();
  const search = useSearchParams();
  const tCommon = useTranslations('common');
  const tGen = useTranslations('generator');
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Data>(EMPTY);

  // Când se termină mostra de voce/stil sau nu există, comută înapoi starea vizuală.
  const handleSampleAutoStop = useCallback(
    (key: string) => {
      if (playing === key) onPlay(key);
    },
    [playing, onPlay],
  );
  useSamplePreview(playing, handleSampleAutoStop);

  const site = useSite();
  const demoEnabled = site.demoEnabled !== false;
  const totalSteps = demoEnabled ? 6 : 5;
  const effectiveStyles = useMemo<StyleOption[]>(
    () => (site.styles?.length ? siteStylesToOptions(site.styles, site.locale) : STYLES),
    [site.styles, site.locale],
  );
  const effectiveOccasions = useMemo(
    () => (site.occasions?.length ? siteOccasionsToOptions(site.occasions, site.locale) : OCC),
    [site.occasions, site.locale],
  );
  const effectiveVoices = useMemo(
    () => (site.voices?.length ? siteVoicesToOptions(site.voices, site.locale) : VOICES),
    [site.voices, site.locale],
  );

  // Pre-fill din query params (ex: din șmecher calculator)
  useEffect(() => {
    const qStyle = search.get('style');
    const qOcc = search.get('occ');
    if (qStyle && effectiveStyles.find((s) => s.id === qStyle)) {
      setData((d) => ({ ...d, style: qStyle }));
    }
    if (qOcc && effectiveOccasions.find((o) => o.id === qOcc)) {
      setData((d) => ({ ...d, occ: qOcc }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [autoFilled, setAutoFilled] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountCents: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const { data: poll } = useGenerationPolling(generationId);

  const upd = <K extends keyof Data>(k: K, v: Data[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  // Auto-fill mesaj la prima trecere prin step 2 dacă msg e gol
  useEffect(() => {
    if (step === 2 && !autoFilled && !data.msg && (data.style || data.occ)) {
      // Pentru RO folosim SAMPLES variate cu hint de stil (mai colorat).
      // Pentru alte locale, folosim template-ul localizat din messages.
      const sug = site.locale === 'ro'
        ? suggestMessage(data.style, data.occ, data.name)
        : tGen('step3.defaultDraft', { name: (data.name || tGen('step3.defaultDraftYou')).trim() });
      setData((d) => ({ ...d, msg: sug }));
      setAutoFilled(true);
    }
  }, [step, autoFilled, data.msg, data.style, data.occ, data.name, site.locale, tGen]);

  const [maxVisited, setMaxVisited] = useState(0);
  useEffect(() => {
    setMaxVisited((m) => Math.max(m, step));
  }, [step]);

  // Oprește orice mostră voce/stil care încă rulează când schimbi pasul.
  // useSamplePreview pauzează audio-ul când `playing` se schimbă, iar
  // onPlay(playing) cu același id îl resetează la null.
  const stoppedForStepRef = useRef<number>(step);
  useEffect(() => {
    if (stoppedForStepRef.current !== step) {
      stoppedForStepRef.current = step;
      if (playing && (playing.startsWith('style-') || playing.startsWith('voice-'))) {
        onPlay(playing);
      }
    }
  }, [step, playing, onPlay]);

  const stepDone = (i: number): boolean => {
    if (i === 0) return !!data.style;
    if (i === 1) return !!data.occ;
    if (i === 2) return !!data.name && !!data.msg && !!data.voice;
    if (i === 3) return maxVisited > 3; // optional, considerat făcut doar după ce-l treci
    if (demoEnabled) {
      if (i === 4) return !!generationId;
      if (i === 5) return !!poll?.paidUnlocked;
    } else {
      // Pay-first: ultimul pas e step 4 (Plătește). „Done" = userul a inițiat
      // checkout-ul Stripe (redirect-ul s-a întâmplat deja, deci nu mai vedem
      // efectiv UI după). Marcăm done când există generationId (creat la pay).
      if (i === 4) return !!generationId;
    }
    return false;
  };

  const canJumpTo = (target: number): boolean => {
    if (target <= step) return true;
    // Allow jump only if all steps before are done
    for (let i = 0; i < target; i++) if (!stepDone(i)) return false;
    return true;
  };

  const goto = (target: number) => {
    if (canJumpTo(target)) setStep(target);
  };

  const lastStep = totalSteps - 1;
  const next = () => setStep((s) => Math.min(lastStep, s + 1));
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const reset = () => {
    setStep(0);
    setData(EMPTY);
    setSubmitting(false);
    setGenerationId(null);
    setError(null);
    setEmailDraft('');
    setAutoFilled(false);
  };

  const canNext =
    (step === 0 && !!data.style) ||
    (step === 1 && !!data.occ) ||
    (step === 2 && !!data.name && !!data.msg && !!data.voice) ||
    step === 3 ||
    (demoEnabled && step === 4 && !!poll?.paidUnlocked) ||
    (demoEnabled && step === 5) ||
    (!demoEnabled && step === 4);

  async function submitDemo() {
    if (!session.email) {
      const candidate = emailDraft.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
        setError(tGen('humanError.emailInvalid'));
        return;
      }
      try {
        await api.setGuestEmail(candidate);
        await session.refresh();
      } catch {
        setError(tGen('humanError.emailSaveFailed'));
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createGeneration({
        type: 'demo',
        style: data.style,
        occasion: data.occ,
        recipientName: data.name,
        message: data.msg,
        dedication: data.dedic || undefined,
        voiceArtist: data.voice,
        customLyrics: data.customLyrics || undefined,
        tipAmount: data.tipAmount || 0,
        premium: data.premium,
      });
      setGenerationId(created.id);
      await session.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? humanError(e, tGen) : tGen('humanError.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  async function startCheckout() {
    if (!generationId) return;
    setSubmitting(true);
    setError(null);
    try {
      const total = site.basePriceCents / 100;
      track('InitiateCheckout', {
        content_id: generationId,
        content_name: 'Manea Cadou',
        content_type: 'product',
        value: total,
        currency: site.currency,
      });
      const { url } = await api.createCheckoutSession({
        generationId,
        tipAmount: data.tipAmount || 0,
        premium: data.premium,
        promoCode: promoApplied?.code,
      });
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? tGen('humanError.stripeNotConfigured')
          : tGen('humanError.checkoutFailed'),
      );
      setSubmitting(false);
    }
  }

  /** Pay-first checkout: site.demoEnabled=false. Trimite tot formularul la
   *  API, care creează generation pending + payment + Stripe Checkout într-o
   *  singură cerere. Redirect direct la Stripe.  */
  async function startDirectCheckout() {
    if (!session.email) {
      const candidate = emailDraft.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
        setError(tGen('humanError.emailInvalid'));
        return;
      }
      try {
        await api.setGuestEmail(candidate);
        await session.refresh();
      } catch {
        setError(tGen('humanError.emailSaveFailed'));
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const total = site.basePriceCents / 100;
      track('InitiateCheckout', {
        content_id: 'pay-first',
        content_name: 'Manea Cadou',
        content_type: 'product',
        value: total,
        currency: site.currency,
      });
      const { url, generationId: gid } = await api.createDirectCheckoutSession({
        generation: {
          style: data.style,
          occasion: data.occ,
          recipientName: data.name,
          message: data.msg,
          dedication: data.dedic || undefined,
          voiceArtist: data.voice,
          customLyrics: data.customLyrics || undefined,
          tipAmount: data.tipAmount || 0,
          premium: data.premium,
        },
        tipAmount: data.tipAmount || 0,
        premium: data.premium,
        promoCode: promoApplied?.code,
      });
      setGenerationId(gid);
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? tGen('humanError.stripeShort')
          : tGen('humanError.checkoutFailed'),
      );
      setSubmitting(false);
    }
  }

  // Auto-advance step 4 → 5 când demo e creat (doar în flow demo)
  useEffect(() => {
    if (!demoEnabled) return;
    if (generationId && step !== 4 && step !== 5) setStep(4);
  }, [generationId, demoEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance to step 5 after success and not yet paid (doar în flow demo)
  useEffect(() => {
    if (!demoEnabled) return;
    if (poll?.status === 'succeeded' && !poll.paidUnlocked && step === 4) {
      const t = setTimeout(() => setStep(5), 800);
      return () => clearTimeout(t);
    }
  }, [poll?.status, poll?.paidUnlocked, step, demoEnabled]);

  return (
    <div className="gen" id="generator">
      <Stepper
        step={step}
        stepDone={stepDone}
        canJumpTo={canJumpTo}
        onJump={goto}
        totalSteps={totalSteps}
      />
      <div className="gen-body">
        {step === 0 && (
          <StyleStep data={data} upd={upd} playing={playing} onPlay={onPlay} styles={effectiveStyles} />
        )}
        {step === 1 && <OccStep data={data} upd={upd} occasions={effectiveOccasions} />}
        {step === 2 && (
          <DetailsStep
            data={data}
            upd={upd}
            playing={playing}
            onPlay={onPlay}
            voices={effectiveVoices}
          />
        )}
        {step === 3 && <DedicStep data={data} upd={upd} />}
        {step === 4 && demoEnabled && (
          <DemoStep
            data={data}
            email={session.email}
            emailDraft={emailDraft}
            onEmailChange={setEmailDraft}
            freeDemoUsed={session.freeDemoUsed}
            generation={poll ?? null}
            onSubmit={submitDemo}
            submitting={submitting}
            error={error}
          />
        )}
        {step === 4 && !demoEnabled && (
          <PayFirstStep
            data={data}
            email={session.email}
            emailDraft={emailDraft}
            onEmailChange={setEmailDraft}
            updTip={(v) => upd('tipAmount', v)}
            updPremium={(v) => upd('premium', v)}
            onPay={startDirectCheckout}
            submitting={submitting}
            error={error}
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            promoApplied={promoApplied}
            setPromoApplied={setPromoApplied}
            promoError={promoError}
            setPromoError={setPromoError}
          />
        )}
        {step === 5 && demoEnabled && (
          <UnlockStep
            generation={poll ?? null}
            data={data}
            updTip={(v) => upd('tipAmount', v)}
            updPremium={(v) => upd('premium', v)}
            onPay={startCheckout}
            onAgain={reset}
            submitting={submitting}
            error={error}
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            promoApplied={promoApplied}
            setPromoApplied={setPromoApplied}
            promoError={promoError}
            setPromoError={setPromoError}
            email={session.email}
          />
        )}
      </div>
      <div className="gen-foot">
        {step > 0 && step < lastStep && !generationId && (
          <button className="btn btn-ghost btn-sm" onClick={prev}>← {tCommon('back')}</button>
        )}
        <div className="progress">{tGen('stepPattern', { current: step + 1, total: totalSteps })}</div>
        {step < 4 && (
          <button
            className="btn btn-gold btn-sm"
            disabled={!canNext}
            onClick={next}
            style={{ opacity: canNext ? 1 : 0.4 }}
            data-hint={canNext ? 'true' : undefined}
            data-hint-label={tCommon('next')}
          >
            {tCommon('next')} →
          </button>
        )}
      </div>
    </div>
  );
}

function Stepper({
  step,
  stepDone,
  canJumpTo,
  onJump,
  totalSteps,
}: {
  step: number;
  stepDone: (i: number) => boolean;
  canJumpTo: (i: number) => boolean;
  onJump: (i: number) => void;
  totalSteps: number;
}) {
  const tg = useTranslations('generator');
  const key = totalSteps === 5 ? 'stepsPayFirst' : 'steps';
  const stepNamesRaw = tg.raw(key) as string[] | undefined;
  const fallback = totalSteps === 5 ? STEP_NAMES_PAYFIRST_FALLBACK : STEP_NAMES_FALLBACK;
  const stepNames = Array.isArray(stepNamesRaw) && stepNamesRaw.length === totalSteps
    ? stepNamesRaw
    : fallback;
  return (
    <div
      style={{
        position: 'relative',
        padding: '20px 14px 16px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.15))',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {/* progress line under circles */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 32,
          left: 'calc(100% / 12 + 14px)',
          right: 'calc(100% / 12 + 14px)',
          height: 2,
          background: 'rgba(241,200,77,0.12)',
          borderRadius: 999,
          zIndex: 0,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 32,
          left: 'calc(100% / 12 + 14px)',
          width: `calc((${(step / (stepNames.length - 1)) * 100}%) - (100% / 6))`,
          height: 2,
          background: 'linear-gradient(90deg, #ffe28a, #f1c84d, #b07c1e)',
          borderRadius: 999,
          transition: 'width 0.4s ease',
          zIndex: 1,
          maxWidth: 'calc(100% - 200% / 12 - 28px)',
        }}
      />

      <div style={{ display: 'flex', position: 'relative', zIndex: 2 }}>
        {stepNames.map((nm, i) => {
          const active = step === i;
          const done = stepDone(i) && !active;
          const clickable = canJumpTo(i);
          const circleBg = active
            ? 'linear-gradient(180deg,#fff5cc,#ffe28a 30%,#f1c84d 60%,#b07c1e)'
            : done
            ? 'linear-gradient(180deg, #2d4a2a, #1a3a1f)'
            : 'rgba(255,255,255,0.04)';
          const circleColor = active ? '#2a1a04' : done ? '#7be09b' : 'rgba(255,245,220,0.45)';
          const circleBorder = active
            ? '2px solid var(--gold)'
            : done
            ? '2px solid #4ea860'
            : '1px solid rgba(241,200,77,0.18)';
          return (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              disabled={!clickable}
              aria-current={active ? 'step' : undefined}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '0 4px',
                background: 'transparent',
                border: 'none',
                cursor: clickable ? 'pointer' : 'not-allowed',
                opacity: clickable || active ? 1 : 0.45,
                fontFamily: 'inherit',
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: circleBg,
                  color: circleColor,
                  border: circleBorder,
                  fontSize: 13,
                  fontWeight: 900,
                  fontFamily: 'Cinzel, serif',
                  boxShadow: active
                    ? '0 4px 14px rgba(241,200,77,0.45), inset 0 1px 0 rgba(255,255,255,0.5)'
                    : 'none',
                  transition: 'all 0.25s ease',
                }}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: active ? 'var(--gold)' : done ? '#7be09b' : 'rgba(255,245,220,0.4)',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                {nm}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type TFn = (key: string, values?: Record<string, string | number>) => string;

function humanError(e: ApiError, t: TFn): string {
  if (e.status === 409) return t('humanError.duplicate');
  if (e.status === 403) {
    const code = (e.body as { message?: string })?.message;
    if (code === 'email_required') return t('humanError.emailRequired');
    return t('humanError.paymentRequired');
  }
  return e.message ?? t('humanError.unknown');
}

function RetryGenerationButton({ generationId }: { generationId: string }) {
  const qc = useQueryClient();
  const tg = useTranslations('generator');
  const [retrying, setRetrying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setRetrying(true);
    setErr(null);
    try {
      await api.retryGeneration(generationId);
      await qc.invalidateQueries({ queryKey: ['generation', generationId] });
    } catch (e) {
      if (e instanceof ApiError) {
        const reason = (e.body as { message?: string })?.message;
        if (reason === 'retry_limit_reached') {
          setErr(tg('retry.limitReached'));
        } else if (reason === 'already_running') {
          setErr(tg('retry.alreadyRunning'));
        } else {
          setErr(e.message);
        }
      } else {
        setErr(tg('retry.generic'));
      }
      setRetrying(false);
    }
  }

  return (
    <>
      <button
        onClick={go}
        disabled={retrying}
        className="btn"
        style={{
          marginTop: 12,
          background: 'linear-gradient(180deg,#fff5cc 0%,#ffe28a 30%,#f1c84d 60%,#b07c1e 100%)',
          color: '#2a1a04',
          fontWeight: 700,
          opacity: retrying ? 0.7 : 1,
          cursor: retrying ? 'wait' : 'pointer',
        }}
      >
        {retrying ? tg('retry.retrying') : tg('retry.cta')}
      </button>
      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{err}</div>
      )}
    </>
  );
}

function humanizeGenError(err: string | null | undefined, t: TFn): string {
  if (!err) return t('live.humanizeFail.noMessage');
  const e = err.toLowerCase();
  if (e.includes('sensitive_word') || e.includes('sensitive word')) return t('live.humanizeFail.sensitive');
  if (e.includes('timeout')) return t('live.humanizeFail.timeout');
  if (e.includes('not configured') || e.includes('suno_api_key')) return t('live.humanizeFail.notConfigured');
  if (e.includes('credit') || e.includes('insufficient') || e.includes('quota')) return t('live.humanizeFail.credit');
  if (e.includes('429') || e.includes('rate')) return t('live.humanizeFail.rate');
  if (e.includes('network') || e.includes('econnreset') || e.includes('etimedout')) return t('live.humanizeFail.network');
  if (e.startsWith('suno failed:')) return t('live.humanizeFail.sunoFailed');
  return t('live.humanizeFail.default');
}

// ============ STEP 1 ============
function StyleStep({ data, upd, playing, onPlay, styles }: any & { styles: StyleOption[] }) {
  const tg = useTranslations('generator');
  const tStyles = useTranslations('styles');
  return (
    <>
      <h3>{tg('step1Title')}</h3>
      <p className="ld">{tg('step1Sub')}</p>
      <div className="style-list">
        {(styles as StyleOption[]).map((s, idx) => {
          const isP = playing === `style-${s.id}`;
          let nm = s.nm;
          let ds = s.ds;
          // Folosim i18n din next-intl DOAR dacă cheia există efectiv (seed-data).
          // Pentru stiluri custom per-site, traducerile sunt deja rezolvate în
          // siteStylesToOptions și ajung în s.nm / s.ds — nu vrem să suprascriem
          // cu literalul "styles.<id>.nm" returnat de next-intl pe miss.
          if ((tStyles as any).has?.(`${s.id}.nm`)) nm = tStyles(`${s.id}.nm` as any);
          if ((tStyles as any).has?.(`${s.id}.ds`)) ds = tStyles(`${s.id}.ds` as any);
          return (
            <div key={s.id} role="button" tabIndex={0} className={`style-pick ${data.style === s.id ? 'on' : ''}`} onClick={() => upd('style', s.id)}>
              <span className="em">{s.ic ? <SiteIcon ic={s.ic} em={s.em} size={24} /> : s.em}</span>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 30 }}>
                <div className="nm">{nm}</div>
                <div className="ds">{ds}</div>
              </div>
              <button
                className={`play-it ${isP ? 'playing' : ''}`}
                onClick={(e) => { e.stopPropagation(); onPlay(`style-${s.id}`); }}
                {...(idx === 0 ? { 'data-hint': 'true', 'data-hint-label': tg('styleHint') } : {})}
              >
                {isP ? <Ic.Pause s={11} /> : <Ic.Play s={11} />}
              </button>
              {s.heat && <span className="heat-tag">{s.heat}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============ STEP 2 ============
function OccStep({ data, upd, occasions }: any & { occasions: Array<{ id: string; em: string; nm: string }> }) {
  const tOcc = useTranslations('occasions');
  const tg = useTranslations('generator');
  return (
    <>
      <h3>{tg('step2Title')}</h3>
      <p className="ld">{tg('step2Sub')}</p>
      <div className="occ-list">
        {occasions.map((o: { id: string; em: string; nm: string; ic?: any }) => {
          let nm = o.nm;
          if ((tOcc as any).has?.(o.id)) nm = tOcc(o.id as any);
          return (
          <button key={o.id} className={`occ-pick ${data.occ === o.id ? 'on' : ''}`} onClick={() => upd('occ', o.id)}>
            <span className="em">{o.ic ? <SiteIcon ic={o.ic} em={o.em} size={22} /> : o.em}</span>
            <span className="nm">{nm}</span>
          </button>
          );
        })}
      </div>
    </>
  );
}

// ── Helpers: site config → seed-data shape ────────────────────────────────
function siteStylesToOptions(
  list: SiteStyleEntry[],
  locale: string,
): StyleOption[] {
  return list.map((s) => ({
    id: s.id,
    em: s.em || '🎵',
    ic: s.ic,
    nm: s.i18n?.[locale]?.nm || s.nm,
    ds: s.i18n?.[locale]?.ds || s.ds,
    heat: s.i18n?.[locale]?.heat || s.heat,
  }));
}

function siteOccasionsToOptions(
  list: SiteOccasionEntry[],
  locale: string,
): Array<{ id: string; em: string; nm: string; ic?: SiteOccasionEntry['ic'] }> {
  return list.map((o) => ({
    id: o.id,
    em: o.em || '✨',
    ic: o.ic,
    nm: o.i18n?.[locale]?.nm || o.nm,
  }));
}

function siteVoicesToOptions(
  list: SiteVoiceEntry[],
  locale: string,
): Array<{ id: string; nm: string; tg: string; av: string; ic?: SiteVoiceEntry['ic'] }> {
  return list.map((v) => ({
    id: v.id,
    nm: v.i18n?.[locale]?.nm || v.nm,
    tg: v.i18n?.[locale]?.tg || v.tg,
    av: v.av,
    ic: v.ic,
  }));
}

// ============ STEP 3 — Detalii + Voce + Versuri ============
function DetailsStep({ data, upd, playing, onPlay, voices }: any & { voices: Array<{ id: string; nm: string; tg: string; av: string }> }) {
  const tg = useTranslations('generator');
  const site = useSite();
  const [showLyricsEditor, setShowLyricsEditor] = useState(!!data.customLyrics);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  async function regenSuggestion() {
    if (suggesting) return;
    if (!data.style || !data.occ || !data.name) {
      setSuggestError(tg('step3.errCompleteFirst'));
      return;
    }
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await api.suggestMessage({
        style: String(data.style),
        occasion: String(data.occ),
        recipientName: String(data.name),
        dedication: data.dedic ? String(data.dedic) : undefined,
        voiceArtist: data.voice ? String(data.voice) : undefined,
        currentDraft: data.msg && String(data.msg).trim() ? String(data.msg) : undefined,
        // Forțăm locale-ul site-ului — cookie-ul NEXT_LOCALE poate lipsi pe site-uri
        // unde un domeniu = o limbă (caz în care nu există switcher).
        locale: site.locale,
      });
      upd('msg', res.message);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setSuggestError(tg('step3.errTooManySuggestions'));
      } else {
        const fallback = site.locale === 'ro'
          ? suggestMessage(data.style, data.occ, data.name)
          : tg('step3.defaultDraft', { name: (data.name || tg('step3.defaultDraftYou')).trim() });
        upd('msg', fallback);
        setSuggestError(tg('step3.errAiFallback'));
      }
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <>
      <h3>{tg('step3.title')}</h3>
      <p className="ld">{tg('step3.sub')}</p>

      <div className="field">
        <label>{tg('step3.nameLabel')}</label>
        <input type="text" placeholder={tg('step3.namePlaceholder')}
          value={data.name} onChange={(e) => upd('name', e.target.value)} maxLength={40} />
      </div>

      <div className="field">
        <label>
          {tg('step3.messageLabel')}
          <button
            type="button"
            onClick={regenSuggestion}
            disabled={suggesting}
            style={{
              marginLeft: 10, fontSize: 11, padding: '3px 8px',
              background: 'rgba(241,200,77,0.1)', border: '1px solid rgba(241,200,77,0.3)',
              borderRadius: 999, color: 'var(--gold)',
              cursor: suggesting ? 'wait' : 'pointer',
              opacity: suggesting ? 0.6 : 1,
            }}
          >
            {suggesting ? tg('step3.messageSuggesting') : tg('step3.messageNewSuggestion')}
          </button>
        </label>
        <textarea
          placeholder={tg('step3.messagePlaceholder')}
          value={data.msg} onChange={(e) => upd('msg', e.target.value)} maxLength={600} />
        <div className="cc">{data.msg.length}/600</div>
        {suggestError && (
          <div style={{ marginTop: 4, fontSize: 11, color: '#ff8888' }}>{suggestError}</div>
        )}
      </div>

      <div className="field">
        <label>{tg('step3.dedicLabel')}</label>
        <input type="text" placeholder={tg('step3.dedicPlaceholder')}
          value={data.dedic} onChange={(e) => upd('dedic', e.target.value)} maxLength={40} />
      </div>

      <div className="field" style={{ marginTop: 6 }}>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{tg('step3.lyricsLabel')}</span>
          <button
            type="button"
            onClick={() => {
              if (showLyricsEditor) {
                setShowLyricsEditor(false);
                upd('customLyrics', '');
              } else {
                setShowLyricsEditor(true);
              }
            }}
            style={{
              fontSize: 11, padding: '3px 10px',
              background: showLyricsEditor ? 'var(--gold)' : 'rgba(241,200,77,0.1)',
              color: showLyricsEditor ? '#2a1a04' : 'var(--gold)',
              border: '1px solid rgba(241,200,77,0.4)', borderRadius: 999, cursor: 'pointer',
            }}
          >
            {showLyricsEditor ? tg('step3.lyricsActive') : tg('step3.lyricsActivate')}
          </button>
        </label>
        {showLyricsEditor && (
          <>
            <textarea
              placeholder={tg('step3.lyricsPlaceholder')}
              value={data.customLyrics}
              onChange={(e) => upd('customLyrics', e.target.value)}
              maxLength={4000}
              style={{ minHeight: 120 }}
            />
            <div className="cc">{data.customLyrics.length}/4000</div>
          </>
        )}
      </div>

      <h3 style={{ marginTop: 22 }}>{tg('step3.voicesTitle')}</h3>
      <div className="voice-list">
        {(voices as Array<{ id: string; nm: string; tg: string; av: string; ic?: any }>).map((v, idx) => {
          const isP = playing === `voice-${v.id}`;
          return (
            <div key={v.id} role="button" tabIndex={0} className={`voice-pick ${data.voice === v.id ? 'on' : ''}`} onClick={() => upd('voice', v.id)}>
              <div className="av">{v.ic ? <SiteIcon ic={v.ic} em={v.av} size={22} /> : v.av}</div>
              <div className="info">
                <div className="nm">{v.nm}</div>
                <div className="tg">{v.tg}</div>
              </div>
              <button
                className={`play-it ${isP ? 'playing' : ''}`}
                onClick={(e) => { e.stopPropagation(); onPlay(`voice-${v.id}`); }}
                {...(idx === 0 ? { 'data-hint': 'true', 'data-hint-label': tg('step3.voiceHint') } : {})}
              >
                {isP ? <Ic.Pause s={11} /> : <Ic.Play s={11} />}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============ STEP 4 — Dedicație + Premium ============
const TIP_PRESETS = [0, 100, 250, 500, 1000, 2500];

function DedicStep({ data, upd }: any) {
  const site = useSite();
  const tg = useTranslations('generator');
  const { data: quote } = useQuery({
    queryKey: ['quote', data.tipAmount, data.premium],
    queryFn: () => api.priceQuote(data.tipAmount || 0, !!data.premium),
  });
  const fmt = (cents: number) => formatPrice(site, cents);
  const [customMode, setCustomMode] = useState(!TIP_PRESETS.includes(data.tipAmount));

  return (
    <>
      <h3>{tg('step4.title')}</h3>
      <p className="ld">{tg('step4.sub')}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
        {TIP_PRESETS.map((amt) => (
          <button
            key={amt}
            onClick={() => { setCustomMode(false); upd('tipAmount', amt); }}
            className={`occ-pick ${data.tipAmount === amt && !customMode ? 'on' : ''}`}
            style={{ padding: '12px 6px', textAlign: 'center' }}
          >
            <span className="nm" style={{ fontSize: 14, fontWeight: 800 }}>
              {amt === 0 ? tg('step4.tipNone') : tg('step4.tipUnit', { amount: amt })}
            </span>
          </button>
        ))}
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>
          {tg('step4.customLabel')}
          <button
            type="button"
            onClick={() => { setCustomMode(true); upd('tipAmount', 0); }}
            style={{
              marginLeft: 10, fontSize: 11, padding: '3px 8px',
              background: customMode ? 'var(--gold)' : 'rgba(241,200,77,0.1)',
              color: customMode ? '#2a1a04' : 'var(--gold)',
              border: '1px solid rgba(241,200,77,0.3)', borderRadius: 999,
            }}
          >
            {customMode ? tg('step4.customActive') : tg('step4.customBtn')}
          </button>
        </label>
        {customMode && (
          <input
            type="number"
            min={0}
            max={1_000_000_000}
            step={100}
            placeholder={tg('step4.customPlaceholder')}
            value={data.tipAmount || ''}
            onChange={(e) => upd('tipAmount', Math.max(0, Math.min(1_000_000_000, Number(e.target.value) || 0)))}
          />
        )}
        {customMode && data.tipAmount > 0 && (
          <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)', marginTop: 4 }}>
            {tg('step4.customSurcharge', { amount: Math.min(50, Math.round(data.tipAmount * 0.05)) })}
          </div>
        )}
      </div>

      <div
        onClick={() => upd('premium', !data.premium)}
        style={{
          marginTop: 18, padding: 14, borderRadius: 10, cursor: 'pointer',
          border: `2px solid ${data.premium ? 'var(--gold)' : 'rgba(241,200,77,0.25)'}`,
          background: data.premium ? 'rgba(241,200,77,0.08)' : 'rgba(241,200,77,0.03)',
          display: 'flex', gap: 12, alignItems: 'flex-start',
        }}
      >
        <div style={{ fontSize: 28 }}>👑</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, color: 'var(--gold-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {tg('step4.premiumTitle')}
            <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--rose)', color: 'white', borderRadius: 999 }}>
              {tg('step4.premiumRecommended')}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.65)', marginTop: 4 }}>
            {tg('step4.premiumDesc')}
          </div>
        </div>
        <input type="checkbox" checked={data.premium} readOnly />
      </div>

      <div style={{
        marginTop: 18, padding: 14, borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(90,13,24,0.3), rgba(40,12,18,0.3))',
        border: '1px solid var(--line)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,245,220,0.7)' }}>
          <span>{tg('step4.baseLine')}</span>
          <span>{fmt(quote?.base ?? site.basePriceCents)}</span>
        </div>
        {(quote?.premiumExtra ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,245,220,0.7)', marginTop: 4 }}>
            <span>{tg('step4.premiumLine')}</span>
            <span>+{fmt(quote?.premiumExtra ?? 0)}</span>
          </div>
        )}
        {(quote?.tipSurcharge ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,245,220,0.7)', marginTop: 4 }}>
            <span>{tg('step4.tipSurchargeLine', { amount: data.tipAmount })}</span>
            <span>+{fmt(quote?.tipSurcharge ?? 0)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 800 }}>{tg('step4.totalUnlock')}</span>
          <span className="gold-text" style={{ fontWeight: 900, fontSize: 18 }}>
            {fmt(quote?.total ?? site.basePriceCents)}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.4)', marginTop: 8 }}>
          {tg('step4.demoFooter')}
        </div>
      </div>
    </>
  );
}

// ============ STEP 5 — DEMO ============
function DemoStep({
  data,
  email,
  emailDraft,
  onEmailChange,
  freeDemoUsed,
  generation,
  onSubmit,
  submitting,
  error,
}: {
  data: Data;
  email: string | null;
  emailDraft: string;
  onEmailChange: (v: string) => void;
  freeDemoUsed: boolean;
  generation: GenerationDto | null;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const { data: recent } = useQuery({
    queryKey: ['recent'],
    queryFn: () => api.recentGenerations(8),
    staleTime: 60_000,
  });

  const tg = useTranslations('generator');
  if (!generation) {
    return (
      <>
        <h3>{tg('step5Demo.title')}</h3>
        <p className="ld">{tg('step5Demo.sub')}</p>

        {!email && (
          <div className="field" style={{ marginTop: 14 }}>
            <label>{tg('step5Demo.emailLabel')}</label>
            <input
              type="email"
              placeholder={tg('step5Demo.emailPlaceholder')}
              value={emailDraft}
              onChange={(e) => onEmailChange(e.target.value)}
              required
            />
            <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)', marginTop: 4 }}>
              {tg('step5Demo.emailHint')}
            </div>
          </div>
        )}
        {email && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--gold-2)' }}>
            {tg('step5Demo.emailSentTo')} <b>{email}</b>
          </div>
        )}

        {error && <ErrorBox text={error} />}

        <button
          className="btn btn-gold btn-lg btn-block"
          onClick={onSubmit}
          disabled={submitting}
          style={{ marginTop: 16, opacity: submitting ? 0.4 : 1 }}
          data-hint={!submitting ? 'true' : undefined}
          data-hint-label={tg('step5Demo.submitHint')}
        >
          {submitting ? tg('step5Demo.submitting') : tg('step5Demo.submitCta')}
        </button>
      </>
    );
  }

  return <GenerationLive generation={generation} recent={recent ?? []} />;
}

// ============ STEP 5 ALT — PAY-FIRST (site.demoEnabled=false) ============
function PayFirstStep({
  data,
  email,
  emailDraft,
  onEmailChange,
  updTip,
  updPremium,
  onPay,
  submitting,
  error,
  promoCode,
  setPromoCode,
  promoApplied,
  setPromoApplied,
  promoError,
  setPromoError,
}: {
  data: Data;
  email: string | null;
  emailDraft: string;
  onEmailChange: (v: string) => void;
  updTip: (v: number) => void;
  updPremium: (v: boolean) => void;
  onPay: () => void;
  submitting: boolean;
  error: string | null;
  promoCode: string;
  setPromoCode: (v: string) => void;
  promoApplied: { code: string; discountCents: number } | null;
  setPromoApplied: (v: { code: string; discountCents: number } | null) => void;
  promoError: string | null;
  setPromoError: (v: string | null) => void;
}) {
  const site = useSite();
  const tg = useTranslations('generator');
  const { data: quote } = useQuery({
    queryKey: ['quote', data.tipAmount, data.premium],
    queryFn: () => api.priceQuote(data.tipAmount || 0, !!data.premium),
  });
  const fmt = (cents: number) => formatPrice(site, cents);
  const finalTotal = Math.max(0, (quote?.total ?? site.basePriceCents) - (promoApplied?.discountCents ?? 0));

  return (
    <>
      <h3>{tg('step5PayFirst.title')}</h3>
      <p className="ld">{tg('step5PayFirst.sub')}</p>

      {!email && (
        <div className="field" style={{ marginTop: 14 }}>
          <label>{tg('step5PayFirst.emailLabel')}</label>
          <input
            type="email"
            placeholder={tg('step5Demo.emailPlaceholder')}
            value={emailDraft}
            onChange={(e) => onEmailChange(e.target.value)}
            required
          />
        </div>
      )}
      {email && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--gold-2)' }}>
          {tg('step5PayFirst.emailSentTo')} <b>{email}</b>
        </div>
      )}

      <div style={{
        marginTop: 14, padding: 14, borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(90,13,24,0.4), rgba(40,12,18,0.4))',
        border: '1px solid var(--gold)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span>{tg('step5PayFirst.completeLine')}</span>
          <span>{fmt(quote?.base ?? site.basePriceCents)}</span>
        </div>
        {(quote?.premiumExtra ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
            <span>{tg('step4.premiumLine')}</span>
            <span>+{fmt(quote?.premiumExtra ?? 0)}</span>
          </div>
        )}
        {(quote?.tipSurcharge ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
            <span>{tg('step5PayFirst.tipLine', { amount: data.tipAmount, currency: site.currency })}</span>
            <span>+{fmt(quote?.tipSurcharge ?? 0)}</span>
          </div>
        )}
        {promoApplied && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4, color: 'var(--green)' }}>
            <span>{tg('step5PayFirst.promoLine')} <code>{promoApplied.code}</code></span>
            <span>−{fmt(promoApplied.discountCents)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 800 }}>{tg('step5PayFirst.totalLabel')}</span>
          <span className="gold-text" style={{ fontWeight: 900, fontSize: 22 }}>{fmt(finalTotal)}</span>
        </div>
      </div>

      {/* Promo */}
      <div style={{ marginTop: 12 }}>
        {!promoApplied ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder={tg('step5PayFirst.promoPlaceholder')}
              value={promoCode}
              onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); }}
              style={{
                flex: 1, padding: '10px 12px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', borderRadius: 8,
                color: 'var(--cream)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!promoCode.trim()}
              onClick={async () => {
                setPromoError(null);
                try {
                  const r = await api.validatePromo(promoCode.trim(), email ?? undefined, quote?.total ?? site.basePriceCents);
                  if (r.ok && r.appliedDiscountCents) {
                    setPromoApplied({ code: promoCode.trim(), discountCents: r.appliedDiscountCents });
                  } else {
                    setPromoError(translatePromoError(r.reason, tg));
                  }
                } catch {
                  setPromoError(tg('step5PayFirst.promoValidationError'));
                }
              }}
            >
              {tg('step5PayFirst.promoApply')}
            </button>
          </div>
        ) : (
          <div style={{
            padding: 10, borderRadius: 8,
            background: 'rgba(62,224,126,0.08)', border: '1px solid rgba(62,224,126,0.4)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: 'var(--green)' }}>
              {tg('step5PayFirst.promoActive')} <code>{promoApplied.code}</code> — {tg('step5PayFirst.promoDiscount')} {fmt(promoApplied.discountCents)}
            </span>
            <button
              onClick={() => { setPromoApplied(null); setPromoCode(''); }}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,245,220,0.5)', cursor: 'pointer', fontSize: 14 }}
            >✕</button>
          </div>
        )}
        {promoError && <div style={{ fontSize: 12, color: 'var(--rose)', marginTop: 6 }}>{promoError}</div>}
      </div>

      {error && <ErrorBox text={error} />}

      <button
        className="btn btn-gold btn-lg btn-block"
        onClick={onPay}
        disabled={submitting}
        style={{ marginTop: 14 }}
        data-hint="true"
        data-hint-label={tg('step5PayFirst.payHint')}
      >
        {submitting ? tg('step5PayFirst.payingCta') : tg('step5PayFirst.payCta', { amount: fmt(finalTotal) })}
      </button>
    </>
  );
}

const STATUS_PCT: Record<GenStatus, number> = {
  pending: 5,
  queued: 12,
  writing_lyrics: 30,
  checking_lyrics: 55,
  generating_audio: 78,
  running: 92,
  succeeded: 100,
  failed: 100,
};

function GenerationLive({ generation, recent }: { generation: GenerationDto; recent: RecentDto[] }) {
  const tg = useTranslations('generator');
  const pct = STATUS_PCT[generation.status];
  const statusLabel = tg(`live.status.${generation.status}`);
  const isPlaying = generation.status !== 'succeeded' && generation.status !== 'failed';

  const isFailed = generation.status === 'failed';

  return (
    <>
      <h3>
        {generation.status === 'succeeded'
          ? tg('live.succeededTitle')
          : isFailed
            ? tg('live.failedTitle')
            : tg('live.workingTitle')}
      </h3>
      <p className="ld">{isFailed ? humanizeGenError(generation.error, tg) : statusLabel}</p>
      {isFailed && (
        <>
          {generation.error && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 11, color: 'rgba(255,245,220,0.4)', cursor: 'pointer' }}>
                {tg('live.techDetails')}
              </summary>
              <pre style={{
                marginTop: 6, fontSize: 11, padding: 10, borderRadius: 6,
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'rgba(255,245,220,0.7)',
              }}>{generation.error}</pre>
              <div style={{ fontSize: 10, color: 'rgba(255,245,220,0.4)', marginTop: 4 }}>
                ID: {generation.id}
              </div>
            </details>
          )}
          <RetryGenerationButton generationId={generation.id} />
        </>
      )}

      <div style={{
        marginTop: 14, height: 6, borderRadius: 999,
        background: 'rgba(241,200,77,0.1)', overflow: 'hidden',
      }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: generation.status === 'failed'
              ? 'var(--rose)'
              : 'linear-gradient(90deg,#ffe28a,#f1c84d,#b07c1e)',
            transition: 'width 0.6s ease',
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
            {tg('live.lyricsVerified')}
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
            {tg('live.lyricsDraft')}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,245,220,0.7)', fontSize: 12, lineHeight: 1.5 }}>
            {generation.lyricsDraft}
          </pre>
        </div>
      )}

      {generation.status === 'succeeded' && (generation.audioUrl || generation.bonusAudioUrl) && (() => {
        const previewSec = generation.type === 'demo' && !generation.paidUnlocked ? 30 : undefined;
        return (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-2)', marginBottom: 8 }}>
              {tg('live.twoVersionsTitle')}
            </div>
            {generation.audioUrl && (
              <div style={{ marginBottom: 10 }}>
                <ManeaPlayer audioUrl={generation.audioUrl} title={tg('live.version1')} maxDurationSec={previewSec} />
              </div>
            )}
            {generation.bonusAudioUrl && (
              <ManeaPlayer audioUrl={generation.bonusAudioUrl} title={tg('live.version2Gift')} maxDurationSec={previewSec} />
            )}
          </div>
        );
      })()}

      {isPlaying && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,245,220,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            {tg('live.listenWhileWaiting')}
          </div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
            {recent.length === 0 && (
              <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.4)' }}>{tg('live.noPublicYet')}</div>
            )}
            {recent.map((r) => (
              <div key={r.id} style={{
                display: 'flex', gap: 10, padding: 10,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--line)', borderRadius: 8,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#ffe28a,#b07c1e)',
                  display: 'grid', placeItems: 'center', color: '#2a1a04', fontSize: 14,
                  flexShrink: 0,
                }}>♫</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--gold-2)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tg('live.forSomeone', { name: r.recipientName })}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)' }}>
                    {r.style} · {r.voiceArtist}
                  </div>
                </div>
                {r.audioUrl && (
                  <div style={{ width: 200, flexShrink: 0 }}>
                    <ManeaPlayer audioUrl={r.audioUrl} compact />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ============ STEP 6 — UNLOCK ============
function UnlockStep({
  generation,
  data,
  updTip,
  updPremium,
  onPay,
  onAgain,
  submitting,
  error,
  promoCode,
  setPromoCode,
  promoApplied,
  setPromoApplied,
  promoError,
  setPromoError,
  email,
}: {
  generation: GenerationDto | null;
  data: Data;
  updTip: (v: number) => void;
  updPremium: (v: boolean) => void;
  onPay: () => void;
  onAgain: () => void;
  submitting: boolean;
  error: string | null;
  promoCode: string;
  setPromoCode: (v: string) => void;
  promoApplied: { code: string; discountCents: number } | null;
  setPromoApplied: (v: { code: string; discountCents: number } | null) => void;
  promoError: string | null;
  setPromoError: (v: string | null) => void;
  email: string | null;
}) {
  const site = useSite();
  const tg = useTranslations('generator');
  const { data: quote } = useQuery({
    queryKey: ['quote', data.tipAmount, data.premium],
    queryFn: () => api.priceQuote(data.tipAmount || 0, !!data.premium),
  });
  const fmt = (cents: number) => formatPrice(site, cents);

  if (!generation) return <p className="ld">{tg('step6.waiting')}</p>;
  if (generation.status === 'failed') {
    return (
      <>
        <h3 style={{ color: 'var(--rose)' }}>{tg('step6.failedTitle')}</h3>
        <p className="ld">{humanizeGenError(generation.error, tg)}</p>
        {generation.error && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 11, color: 'rgba(255,245,220,0.4)', cursor: 'pointer' }}>
              {tg('step6.techDetails')}
            </summary>
            <pre style={{
              marginTop: 6, fontSize: 11, padding: 10, borderRadius: 6,
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'rgba(255,245,220,0.7)',
            }}>{generation.error}</pre>
            <div style={{ fontSize: 10, color: 'rgba(255,245,220,0.4)', marginTop: 4 }}>
              ID: {generation.id}
            </div>
          </details>
        )}
        <RetryGenerationButton generationId={generation.id} />
        <button onClick={onAgain} className="btn btn-ghost" style={{ marginTop: 8 }}>{tg('step6.againBtnGhost')}</button>
      </>
    );
  }

  if (generation.paidUnlocked) {
    return (
      <>
        <h3 className="gold-text">{tg('step6.unlockedTitle')}</h3>
        <p className="ld">{tg('step6.unlockedSub')}</p>
        {generation.audioUrl && (
          <div style={{ marginTop: 14 }}>
            <ManeaPlayer audioUrl={generation.audioUrl} title={tg('step6.version1Full')} />
          </div>
        )}
        {generation.bonusAudioUrl && (
          <div style={{ marginTop: 10 }}>
            <ManeaPlayer audioUrl={generation.bonusAudioUrl} title={tg('step6.version2Full')} />
          </div>
        )}
        <button onClick={onAgain} className="btn btn-ghost" style={{ marginTop: 16 }}>{tg('step6.againCta')}</button>
      </>
    );
  }

  return (
    <>
      <h3>{tg('step6.title')}</h3>
      <p className="ld">{tg('step6.sub')}</p>

      {(generation.audioUrl || generation.bonusAudioUrl) && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 10,
          background: 'rgba(241,200,77,0.04)', border: '1px solid rgba(241,200,77,0.2)' }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            {tg('step6.replayTitle')}
          </div>
          {generation.audioUrl && (
            <div style={{ marginBottom: 8 }}>
              <ManeaPlayer audioUrl={generation.audioUrl} title={tg('live.version1')} maxDurationSec={30} />
            </div>
          )}
          {generation.bonusAudioUrl && (
            <ManeaPlayer audioUrl={generation.bonusAudioUrl} title={tg('live.version2Gift')} maxDurationSec={30} />
          )}
        </div>
      )}

      <div style={{
        marginTop: 14, padding: 14, borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(90,13,24,0.4), rgba(40,12,18,0.4))',
        border: '1px solid var(--gold)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span>{tg('step5PayFirst.completeLine')}</span>
          <span>{fmt(quote?.base ?? site.basePriceCents)}</span>
        </div>
        {(quote?.premiumExtra ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
            <span>{tg('step4.premiumLine')}</span>
            <span>+{fmt(quote?.premiumExtra ?? 0)}</span>
          </div>
        )}
        {(quote?.tipSurcharge ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
            <span>{tg('step6.tipLine', { amount: data.tipAmount })}</span>
            <span>+{fmt(quote?.tipSurcharge ?? 0)}</span>
          </div>
        )}
        {promoApplied && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4, color: 'var(--green)' }}>
            <span>{tg('step5PayFirst.promoLine')} <code>{promoApplied.code}</code></span>
            <span>−{fmt(promoApplied.discountCents)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 800 }}>{tg('step5PayFirst.totalLabel')}</span>
          <span className="gold-text" style={{ fontWeight: 900, fontSize: 22 }}>
            {fmt(Math.max(0, (quote?.total ?? site.basePriceCents) - (promoApplied?.discountCents ?? 0)))}
          </span>
        </div>
      </div>

      {/* Promo code input */}
      <div style={{ marginTop: 12 }}>
        {!promoApplied ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder={tg('step5PayFirst.promoPlaceholder')}
              value={promoCode}
              onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); }}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                color: 'var(--cream)',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={!promoCode.trim()}
              onClick={async () => {
                setPromoError(null);
                try {
                  const r = await api.validatePromo(promoCode.trim(), email ?? undefined, quote?.total ?? site.basePriceCents);
                  if (r.ok && r.appliedDiscountCents) {
                    setPromoApplied({ code: promoCode.trim(), discountCents: r.appliedDiscountCents });
                  } else {
                    setPromoError(translatePromoError(r.reason, tg));
                  }
                } catch {
                  setPromoError(tg('step5PayFirst.promoValidationError'));
                }
              }}
            >
              {tg('step5PayFirst.promoApply')}
            </button>
          </div>
        ) : (
          <div style={{
            padding: 10, borderRadius: 8,
            background: 'rgba(62,224,126,0.08)', border: '1px solid rgba(62,224,126,0.4)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: 'var(--green)' }}>
              {tg('step5PayFirst.promoActive')} <code>{promoApplied.code}</code> — {tg('step5PayFirst.promoDiscount')} {fmt(promoApplied.discountCents)}
            </span>
            <button
              onClick={() => { setPromoApplied(null); setPromoCode(''); }}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,245,220,0.5)', cursor: 'pointer', fontSize: 14 }}
            >
              ✕
            </button>
          </div>
        )}
        {promoError && <div style={{ fontSize: 12, color: 'var(--rose)', marginTop: 6 }}>{promoError}</div>}
      </div>

      {error && <ErrorBox text={error} />}

      <button
        className="btn btn-gold btn-lg btn-block"
        onClick={onPay}
        disabled={submitting}
        style={{ marginTop: 14 }}
        data-hint="true"
        data-hint-label={tg('step6.payHint')}
      >
        {submitting
          ? tg('step6.payingCta')
          : tg('step6.unlockCta', { amount: fmt(Math.max(0, (quote?.total ?? site.basePriceCents) - (promoApplied?.discountCents ?? 0))) })}
      </button>

      <button onClick={onAgain} style={{
        background: 'transparent', border: 'none', color: 'rgba(255,245,220,0.5)',
        textDecoration: 'underline', fontSize: 12, marginTop: 14, cursor: 'pointer', display: 'block', textAlign: 'center', width: '100%',
      }}>
        {tg('step6.laterCta')}
      </button>
    </>
  );
}

function translatePromoError(reason: string | undefined, t: TFn): string {
  switch (reason) {
    case 'invalid': return t('promo.errInvalid');
    case 'expired': return t('promo.errExpired');
    case 'not_yet_valid': return t('promo.errNotYet');
    case 'used_up': return t('promo.errUsedUp');
    case 'wrong_email': return t('promo.errWrongEmail');
    case 'empty': return t('promo.errEmpty');
    default: return t('promo.errGeneric');
  }
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{
      marginTop: 12, padding: '10px 12px', borderRadius: 8,
      background: 'rgba(255,45,126,0.12)', border: '1px solid rgba(255,45,126,0.4)',
      color: '#ffd6e6', fontSize: 13,
    }}>{text}</div>
  );
}
