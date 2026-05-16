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
      a.addEventListener('timeupdate', () => {
        if (a.currentTime >= stopAt) {
          a.pause();
          a.currentTime = 0;
          if (activeKeyRef.current === key) onAutoStop(key);
        }
      });
      a.addEventListener('ended', () => {
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
      const sug = suggestMessage(data.style, data.occ, data.name);
      setData((d) => ({ ...d, msg: sug }));
      setAutoFilled(true);
    }
  }, [step, autoFilled, data.msg, data.style, data.occ, data.name]);

  const [maxVisited, setMaxVisited] = useState(0);
  useEffect(() => {
    setMaxVisited((m) => Math.max(m, step));
  }, [step]);

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
        setError('Introdu un email valid ca să-ți trimitem maneaua.');
        return;
      }
      try {
        await api.setGuestEmail(candidate);
        await session.refresh();
      } catch {
        setError('Nu am putut salva email-ul. Încearcă din nou.');
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
      setError(e instanceof ApiError ? humanError(e) : 'Eroare la generare. Încearcă din nou.');
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
          ? 'Plățile nu sunt încă activate. Setează STRIPE_SECRET_KEY în .env.'
          : 'Nu s-a putut deschide plata. Încearcă din nou.',
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
        setError('Introdu un email valid ca să-ți trimitem maneaua.');
        return;
      }
      try {
        await api.setGuestEmail(candidate);
        await session.refresh();
      } catch {
        setError('Nu am putut salva email-ul. Încearcă din nou.');
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
          ? 'Plățile nu sunt încă activate.'
          : 'Nu s-a putut deschide plata. Încearcă din nou.',
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
  const stepNamesRaw = tg.raw('steps') as string[] | undefined;
  // Acceptăm doar dacă i18n returnează exact numărul corect de etichete.
  // Altfel folosim fallback hardcoded — diferit pentru flow demo vs pay-first.
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

function humanError(e: ApiError): string {
  if (e.status === 409) return 'Cerere duplicat — încearcă din nou peste câteva secunde.';
  if (e.status === 403) {
    const code = (e.body as { message?: string })?.message;
    if (code === 'email_required') return 'Introdu email-ul ca să-ți trimitem maneaua.';
    return 'Pentru manea completă (90s) e nevoie de plată.';
  }
  return e.message ?? 'Eroare necunoscută.';
}

function RetryGenerationButton({ generationId }: { generationId: string }) {
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setRetrying(true);
    setErr(null);
    try {
      await api.retryGeneration(generationId);
      // forțează polling-ul să reia (status -> 'queued', refetchInterval activ).
      await qc.invalidateQueries({ queryKey: ['generation', generationId] });
    } catch (e) {
      if (e instanceof ApiError) {
        const reason = (e.body as { message?: string })?.message;
        if (reason === 'retry_limit_reached') {
          setErr('Ai atins limita de 3 reîncercări pentru acest demo. Pornește unul nou.');
        } else if (reason === 'already_running') {
          setErr('Generarea e deja în curs — așteaptă câteva secunde.');
        } else {
          setErr(e.message);
        }
      } else {
        setErr('Eroare necunoscută. Încearcă din nou.');
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
        {retrying ? '🔄 Reîncerc generarea...' : '🔄 Încearcă din nou'}
      </button>
      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{err}</div>
      )}
    </>
  );
}

function humanizeGenError(err: string | null | undefined): string {
  if (!err) return 'Generarea a eșuat fără un mesaj de eroare. Încearcă din nou peste câteva minute.';
  const e = err.toLowerCase();
  if (e.includes('sensitive_word') || e.includes('sensitive word')) {
    return 'Mesajul tău conține cuvinte pe care providerul de muzică le respinge. Reformulează-l fără cuvinte sensibile și încearcă din nou.';
  }
  if (e.includes('timeout')) {
    return 'Generarea a depășit timpul maxim. Studio-ul de muzică e foarte aglomerat acum — mai încearcă peste câteva minute.';
  }
  if (e.includes('not configured') || e.includes('suno_api_key')) {
    return 'Serviciul de generare audio nu este configurat. Echipa a fost notificată.';
  }
  if (e.includes('credit') || e.includes('insufficient') || e.includes('quota')) {
    return 'Studio-ul de muzică a rămas fără credite. Echipa a fost notificată — ne ocupăm imediat.';
  }
  if (e.includes('429') || e.includes('rate')) {
    return 'Prea multe cereri spre studio-ul de muzică acum. Mai încearcă peste un minut.';
  }
  if (e.includes('network') || e.includes('econnreset') || e.includes('etimedout')) {
    return 'Conexiunea cu studio-ul de muzică a căzut. Mai încearcă peste un minut.';
  }
  if (e.startsWith('suno failed:')) {
    return 'Studio-ul de muzică a respins generarea. Reformulează mesajul (mai scurt, fără nume reale celebre) și încearcă din nou.';
  }
  return 'Generarea a eșuat. Încearcă din nou — dacă persistă, scrie-ne pe chat.';
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
          // Folosim i18n din next-intl doar pentru cheile din seed-data; pentru
          // stiluri custom (per-site) traducerile sunt deja inline în obiect.
          try { nm = tStyles(`${s.id}.nm`); } catch { /* fallback */ }
          try { ds = tStyles(`${s.id}.ds`); } catch { /* fallback */ }
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
                {...(idx === 0 ? { 'data-hint': 'true', 'data-hint-label': 'Style' } : {})}
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
  return (
    <>
      <h3>2. Pentru ce ocazie?</h3>
      <p className="ld">Alege una. Adaptăm versurile.</p>
      <div className="occ-list">
        {occasions.map((o: { id: string; em: string; nm: string; ic?: any }) => {
          let nm = o.nm;
          try { nm = tOcc(o.id); } catch { /* fallback */ }
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
  const [showLyricsEditor, setShowLyricsEditor] = useState(!!data.customLyrics);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  async function regenSuggestion() {
    if (suggesting) return;
    if (!data.style || !data.occ || !data.name) {
      setSuggestError('Completează stilul, ocazia și numele întâi.');
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
      });
      upd('msg', res.message);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setSuggestError('Prea multe sugestii. Încearcă peste un minut.');
      } else {
        upd('msg', suggestMessage(data.style, data.occ, data.name));
        setSuggestError('Nu am putut genera cu AI, am pus o sugestie de rezervă.');
      }
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <>
      <h3>3. Detalii, voce și (opțional) versurile tale</h3>
      <p className="ld">Cu cât mai concret, cu atât mai tare iese.</p>

      <div className="field">
        <label>Numele persoanei</label>
        <input type="text" placeholder="ex. Costel, Mariana, șefu' Florin..."
          value={data.name} onChange={(e) => upd('name', e.target.value)} maxLength={40} />
      </div>

      <div className="field">
        <label>
          Mesajul tău (max 600)
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
            {suggesting ? '✨ Sugerez…' : '✨ Sugestie nouă'}
          </button>
        </label>
        <textarea
          placeholder="ex. La mulți ani, șefule! Să dea Domnu' să luăm bonus de Crăciun..."
          value={data.msg} onChange={(e) => upd('msg', e.target.value)} maxLength={600} />
        <div className="cc">{data.msg.length}/600</div>
        {suggestError && (
          <div style={{ marginTop: 4, fontSize: 11, color: '#ff8888' }}>{suggestError}</div>
        )}
      </div>

      <div className="field">
        <label>Dedicație opțională (de la cine)</label>
        <input type="text" placeholder="de la Andrei și echipa"
          value={data.dedic} onChange={(e) => upd('dedic', e.target.value)} maxLength={40} />
      </div>

      <div className="field" style={{ marginTop: 6 }}>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📝 Vrei să scrii tu versurile?</span>
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
            {showLyricsEditor ? '✓ activ' : 'Activează'}
          </button>
        </label>
        {showLyricsEditor && (
          <>
            <textarea
              placeholder={'Scrie aici versurile tale dacă vrei. Lasă gol = AI scrie versurile pe baza mesajului.\n\nRefren:\n...\nCuplet:\n...'}
              value={data.customLyrics}
              onChange={(e) => upd('customLyrics', e.target.value)}
              maxLength={4000}
              style={{ minHeight: 120 }}
            />
            <div className="cc">{data.customLyrics.length}/4000</div>
          </>
        )}
      </div>

      <h3 style={{ marginTop: 22 }}>🎤 Care artist îți cântă?</h3>
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
                {...(idx === 0 ? { 'data-hint': 'true', 'data-hint-label': 'Ascultă vocea' } : {})}
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
  const { data: quote } = useQuery({
    queryKey: ['quote', data.tipAmount, data.premium],
    queryFn: () => api.priceQuote(data.tipAmount || 0, !!data.premium),
  });
  const fmt = (cents: number) => formatPrice(site, cents);
  const [customMode, setCustomMode] = useState(!TIP_PRESETS.includes(data.tipAmount));

  return (
    <>
      <h3>4. Cadou & Premium</h3>
      <p className="ld">Cât îi pui în versuri, ca să-l dai pe spate? (Suprataxă 5%, plafon 50 lei.)</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
        {TIP_PRESETS.map((amt) => (
          <button
            key={amt}
            onClick={() => { setCustomMode(false); upd('tipAmount', amt); }}
            className={`occ-pick ${data.tipAmount === amt && !customMode ? 'on' : ''}`}
            style={{ padding: '12px 6px', textAlign: 'center' }}
          >
            <span className="nm" style={{ fontSize: 14, fontWeight: 800 }}>
              {amt === 0 ? 'Fără' : `${amt} lei`}
            </span>
          </button>
        ))}
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label>
          Sau pune cât vrei tu (până la 1.000.000.000 lei 😅)
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
            {customMode ? '✓ activ' : 'Custom'}
          </button>
        </label>
        {customMode && (
          <input
            type="number"
            min={0}
            max={1_000_000_000}
            step={100}
            placeholder="ex. 1500"
            value={data.tipAmount || ''}
            onChange={(e) => upd('tipAmount', Math.max(0, Math.min(1_000_000_000, Number(e.target.value) || 0)))}
          />
        )}
        {customMode && data.tipAmount > 0 && (
          <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)', marginTop: 4 }}>
            Suprataxă: +{Math.min(50, Math.round(data.tipAmount * 0.05))} lei (5% capped la 50 lei).
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
            Manea Premium
            <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--rose)', color: 'white', borderRadius: 999 }}>
              RECOMANDAT
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.65)', marginTop: 4 }}>
            🎤 Calitate audio 4x superioară · 🔥 Voce procesată cu AI master · ⚡ Mix profi
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
          <span>Manea de bază (90s × 2)</span>
          <span>{fmt(quote?.base ?? site.basePriceCents)}</span>
        </div>
        {(quote?.premiumExtra ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,245,220,0.7)', marginTop: 4 }}>
            <span>👑 Upgrade Premium</span>
            <span>+{fmt(quote?.premiumExtra ?? 0)}</span>
          </div>
        )}
        {(quote?.tipSurcharge ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,245,220,0.7)', marginTop: 4 }}>
            <span>Suprataxă dedicație ({data.tipAmount} lei × 5%, plafon 50)</span>
            <span>+{fmt(quote?.tipSurcharge ?? 0)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 800 }}>Total la deblocare</span>
          <span className="gold-text" style={{ fontWeight: 900, fontSize: 18 }}>
            {fmt(quote?.total ?? site.basePriceCents)}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.4)', marginTop: 8 }}>
          🎁 Demo-ul gratuit primesti acum la pasul următor. Plata se face DUPĂ ce-l asculți.
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

  if (!generation) {
    return (
      <>
        <h3>5. Demo gratuit (30s)</h3>
        <p className="ld">Generăm întâi un demo de 30s gratis. Dacă-ți place, deblochezi maneaua completă (90s × 2).</p>

        {!email && (
          <div className="field" style={{ marginTop: 14 }}>
            <label>📧 Email-ul tău (obligatoriu — îți trimitem maneaua aici)</label>
            <input
              type="email"
              placeholder="tu@email.ro"
              value={emailDraft}
              onChange={(e) => onEmailChange(e.target.value)}
              required
            />
            <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)', marginTop: 4 }}>
              Folosit doar pentru livrare. Fără spam.
            </div>
          </div>
        )}
        {email && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--gold-2)' }}>
            ✓ Trimitem maneaua la <b>{email}</b>
          </div>
        )}

        {error && <ErrorBox text={error} />}

        <button
          className="btn btn-gold btn-lg btn-block"
          onClick={onSubmit}
          disabled={submitting}
          style={{ marginTop: 16, opacity: submitting ? 0.4 : 1 }}
          data-hint={!submitting ? 'true' : undefined}
          data-hint-label="Generează demo gratis"
        >
          {submitting ? 'Se trimite...' : '🎁 Generează demo gratis 30s'}
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
  const { data: quote } = useQuery({
    queryKey: ['quote', data.tipAmount, data.premium],
    queryFn: () => api.priceQuote(data.tipAmount || 0, !!data.premium),
  });
  const fmt = (cents: number) => formatPrice(site, cents);
  const finalTotal = Math.max(0, (quote?.total ?? site.basePriceCents) - (promoApplied?.discountCents ?? 0));

  return (
    <>
      <h3>5. Plătește pentru a genera maneaua</h3>
      <p className="ld">
        Maneaua ta (90s × 2 versiuni) se generează ÎN MOMENTUL în care plata e confirmată.
        Trimitem rezultatul pe email și-l vezi și aici după ~3 minute.
      </p>

      {!email && (
        <div className="field" style={{ marginTop: 14 }}>
          <label>📧 Email-ul tău (obligatoriu)</label>
          <input
            type="email"
            placeholder="tu@email.ro"
            value={emailDraft}
            onChange={(e) => onEmailChange(e.target.value)}
            required
          />
        </div>
      )}
      {email && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--gold-2)' }}>
          ✓ Trimitem maneaua la <b>{email}</b>
        </div>
      )}

      <div style={{
        marginTop: 14, padding: 14, borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(90,13,24,0.4), rgba(40,12,18,0.4))',
        border: '1px solid var(--gold)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span>Manea completă (90s × 2)</span>
          <span>{fmt(quote?.base ?? site.basePriceCents)}</span>
        </div>
        {(quote?.premiumExtra ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
            <span>👑 Upgrade Premium</span>
            <span>+{fmt(quote?.premiumExtra ?? 0)}</span>
          </div>
        )}
        {(quote?.tipSurcharge ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
            <span>Suprataxă dedicație {data.tipAmount} {site.currency}</span>
            <span>+{fmt(quote?.tipSurcharge ?? 0)}</span>
          </div>
        )}
        {promoApplied && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4, color: 'var(--green)' }}>
            <span>Promo: <code>{promoApplied.code}</code></span>
            <span>−{fmt(promoApplied.discountCents)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 800 }}>Total</span>
          <span className="gold-text" style={{ fontWeight: 900, fontSize: 22 }}>{fmt(finalTotal)}</span>
        </div>
      </div>

      {/* Promo */}
      <div style={{ marginTop: 12 }}>
        {!promoApplied ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="Cod promo?"
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
                    setPromoError(translatePromoError(r.reason));
                  }
                } catch {
                  setPromoError('Eroare validare. Încearcă din nou.');
                }
              }}
            >
              Aplică
            </button>
          </div>
        ) : (
          <div style={{
            padding: 10, borderRadius: 8,
            background: 'rgba(62,224,126,0.08)', border: '1px solid rgba(62,224,126,0.4)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: 'var(--green)' }}>
              ✓ Promo <code>{promoApplied.code}</code> — discount {fmt(promoApplied.discountCents)}
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
        data-hint-label="Plătește acum"
      >
        {submitting ? 'Se deschide plata...' : `💳 Plătește ${fmt(finalTotal)} și generează`}
      </button>
    </>
  );
}

const STATUS_LABEL: Record<GenStatus, { label: string; pct: number }> = {
  pending:           { label: 'Pregătim totul...', pct: 5 },
  queued:            { label: 'Pus la coadă, în curând începem',  pct: 12 },
  writing_lyrics:    { label: 'Textierul AI scrie versurile... 🎤', pct: 30 },
  checking_lyrics:   { label: 'Editorul AI verifică rima... ✍️', pct: 55 },
  generating_audio:  { label: 'Studio-ul acordează acordeonul... 🎻', pct: 78 },
  running:           { label: 'Se finalizează...', pct: 92 },
  succeeded:         { label: '✓ Manea gata!', pct: 100 },
  failed:            { label: 'Ceva n-a mers', pct: 100 },
};

function GenerationLive({ generation, recent }: { generation: GenerationDto; recent: RecentDto[] }) {
  const meta = STATUS_LABEL[generation.status];
  const isPlaying = generation.status !== 'succeeded' && generation.status !== 'failed';

  const isFailed = generation.status === 'failed';

  return (
    <>
      <h3>
        {generation.status === 'succeeded'
          ? '🎉 Demo gata!'
          : isFailed
            ? 'Ceva n-a mers...'
            : 'Se gătește maneaua...'}
      </h3>
      <p className="ld">{isFailed ? humanizeGenError(generation.error) : meta.label}</p>
      {isFailed && (
        <>
          {generation.error && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 11, color: 'rgba(255,245,220,0.4)', cursor: 'pointer' }}>
                Detalii tehnice (pentru suport)
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
            width: `${meta.pct}%`,
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
            ✓ Versuri verificate de AI
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
            ✏️ Ciornă (se verifică...)
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
              🎤 Ți-am făcut 2 versiuni — ambele cadou pentru tine:
            </div>
            {generation.audioUrl && (
              <div style={{ marginBottom: 10 }}>
                <ManeaPlayer audioUrl={generation.audioUrl} title="Versiunea 1" maxDurationSec={previewSec} />
              </div>
            )}
            {generation.bonusAudioUrl && (
              <ManeaPlayer audioUrl={generation.bonusAudioUrl} title="Versiunea 2 🎁" maxDurationSec={previewSec} />
            )}
          </div>
        );
      })()}

      {isPlaying && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,245,220,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            🎧 Ascultă manele generate de alții cât timp aștepți
          </div>
          <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
            {recent.length === 0 && (
              <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.4)' }}>Nu s-au generat încă manele publice.</div>
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
                    Pentru {r.recipientName}
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
  const { data: quote } = useQuery({
    queryKey: ['quote', data.tipAmount, data.premium],
    queryFn: () => api.priceQuote(data.tipAmount || 0, !!data.premium),
  });
  const fmt = (cents: number) => formatPrice(site, cents);

  if (!generation) return <p className="ld">Se așteaptă demo-ul...</p>;
  if (generation.status === 'failed') {
    return (
      <>
        <h3 style={{ color: 'var(--rose)' }}>Ceva n-a mers...</h3>
        <p className="ld">{humanizeGenError(generation.error)}</p>
        {generation.error && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 11, color: 'rgba(255,245,220,0.4)', cursor: 'pointer' }}>
              Detalii tehnice (pentru suport)
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
        <button onClick={onAgain} className="btn btn-ghost" style={{ marginTop: 8 }}>← Pornește unul nou</button>
      </>
    );
  }

  if (generation.paidUnlocked) {
    return (
      <>
        <h3 className="gold-text">✓ Manea completă deblocată!</h3>
        <p className="ld">Versiunile complete (90s) îți sosesc pe email.</p>
        {generation.audioUrl && (
          <div style={{ marginTop: 14 }}>
            <ManeaPlayer audioUrl={generation.audioUrl} title="Versiunea 1 (completă)" />
          </div>
        )}
        {generation.bonusAudioUrl && (
          <div style={{ marginTop: 10 }}>
            <ManeaPlayer audioUrl={generation.bonusAudioUrl} title="Versiunea 2 (completă)" />
          </div>
        )}
        <button onClick={onAgain} className="btn btn-ghost" style={{ marginTop: 16 }}>+ Fă încă o manea</button>
      </>
    );
  }

  return (
    <>
      <h3>6. Deblochează maneaua completă</h3>
      <p className="ld">Demo-ul l-ai ascultat. Acum primești 2 versiuni complete (90s fiecare) trimise pe email.</p>

      {/* Reascultă demo-ul (preview 30s) chiar la pasul de unlock — userul nu trebuie
          să se întoarcă la pasul 5 ca să-și amintească ce cumpără. */}
      {(generation.audioUrl || generation.bonusAudioUrl) && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 10,
          background: 'rgba(241,200,77,0.04)', border: '1px solid rgba(241,200,77,0.2)' }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            🔊 Reascultă demo-ul (30s)
          </div>
          {generation.audioUrl && (
            <div style={{ marginBottom: 8 }}>
              <ManeaPlayer audioUrl={generation.audioUrl} title="Versiunea 1" maxDurationSec={30} />
            </div>
          )}
          {generation.bonusAudioUrl && (
            <ManeaPlayer audioUrl={generation.bonusAudioUrl} title="Versiunea 2 🎁" maxDurationSec={30} />
          )}
        </div>
      )}

      <div style={{
        marginTop: 14, padding: 14, borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(90,13,24,0.4), rgba(40,12,18,0.4))',
        border: '1px solid var(--gold)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span>Manea completă (90s × 2)</span>
          <span>{fmt(quote?.base ?? site.basePriceCents)}</span>
        </div>
        {(quote?.premiumExtra ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
            <span>👑 Upgrade Premium</span>
            <span>+{fmt(quote?.premiumExtra ?? 0)}</span>
          </div>
        )}
        {(quote?.tipSurcharge ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
            <span>Suprataxă dedicație {data.tipAmount} lei</span>
            <span>+{fmt(quote?.tipSurcharge ?? 0)}</span>
          </div>
        )}
        {promoApplied && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4, color: 'var(--green)' }}>
            <span>Promo: <code>{promoApplied.code}</code></span>
            <span>−{fmt(promoApplied.discountCents)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <span style={{ fontWeight: 800 }}>Total</span>
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
              placeholder="Cod promo?"
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
                    setPromoError(translatePromoError(r.reason));
                  }
                } catch {
                  setPromoError('Eroare validare. Încearcă din nou.');
                }
              }}
            >
              Aplică
            </button>
          </div>
        ) : (
          <div style={{
            padding: 10, borderRadius: 8,
            background: 'rgba(62,224,126,0.08)', border: '1px solid rgba(62,224,126,0.4)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: 'var(--green)' }}>
              ✓ Promo <code>{promoApplied.code}</code> — discount {fmt(promoApplied.discountCents)}
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
        data-hint-label="Plătește acum"
      >
        {submitting
          ? 'Se deschide plata...'
          : `🔓 Deblochează — ${fmt(Math.max(0, (quote?.total ?? site.basePriceCents) - (promoApplied?.discountCents ?? 0)))}`}
      </button>

      <GiftCodeUnlock generationId={generation.id} onUnlocked={onAgain /* refetch via parent */} />

      <button onClick={onAgain} style={{
        background: 'transparent', border: 'none', color: 'rgba(255,245,220,0.5)',
        textDecoration: 'underline', fontSize: 12, marginTop: 14, cursor: 'pointer', display: 'block', textAlign: 'center', width: '100%',
      }}>
        Mai târziu — fac încă un demo
      </button>
    </>
  );
}

function GiftCodeUnlock({ generationId, onUnlocked }: { generationId: string; onUnlocked: () => void }) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function apply() {
    if (!code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.unlockGenerationWithGift(generationId, code.trim());
      // Trigger reload via window — cea mai sigură cale
      window.location.reload();
    } catch (e) {
      const msg = e instanceof ApiError ? (e.body as { message?: string })?.message : (e as Error).message;
      const reason = msg || 'unknown';
      setError(
        reason === 'invalid' ? 'Cod invalid sau dezactivat.' :
        reason === 'expired' ? 'Cod expirat.' :
        reason === 'used_up' ? 'Cod folosit complet.' :
        'Cod nevalid.',
      );
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          marginTop: 12, padding: '10px 14px', width: '100%',
          background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(241,200,77,0.4)',
          borderRadius: 10, color: 'var(--gold-2)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        🎟️ Ai cod cadou? Apasă să-l folosești
      </button>
    );
  }

  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          placeholder="GIFT-XXXXXXXX"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
          style={{
            flex: 1, padding: '10px 12px', background: 'rgba(0,0,0,0.3)',
            border: '1px solid var(--line)', borderRadius: 8, color: 'var(--cream)',
            fontFamily: 'ui-monospace, monospace', fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}
        />
        <button className="btn btn-gold btn-sm" disabled={!code.trim() || submitting} onClick={apply}>
          {submitting ? '...' : 'Folosește'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--rose)', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function translatePromoError(reason: string | undefined): string {
  switch (reason) {
    case 'invalid': return 'Cod invalid sau dezactivat.';
    case 'expired': return 'Cod expirat.';
    case 'not_yet_valid': return 'Cod neactivat încă.';
    case 'used_up': return 'Cod folosit complet.';
    case 'wrong_email': return 'Cod restricționat la alt email.';
    case 'empty': return 'Introdu un cod.';
    default: return 'Cod nevalid.';
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
