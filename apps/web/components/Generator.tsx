'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Ic } from './icons';
import { SiteIcon } from './SiteIcon';
import { OCC, STYLES, VOICES, type StyleOption } from '@/lib/seed-data';
import type { SiteOccasionEntry, SiteStyleEntry, SiteVoiceEntry } from '@/lib/site-shared';
import { suggestMessage } from '@/lib/message-suggest';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/providers';
import { useSite } from '@/lib/site-context';
import { RotatingStatus } from './RotatingStatus';
import { track } from '@/lib/tracking';
import { formatPrice } from '@/lib/site-shared';
import { claimPlayback, releasePlayback } from '@/lib/audio-registry';
import { PACKAGES, DEFAULT_PACKAGE_TIER, type PackageTier } from '@/lib/packages';
import OfferCountdown from './OfferCountdown';

type Data = {
  style: string;
  occ: string;
  name: string;
  msg: string;
  voice: string;
  customLyrics: string;
  dedic: string;
  packageTier: PackageTier;
  /** true după ce userul a acceptat versurile în pasul de review (validate OK). */
  lyricsAccepted: boolean;
  /** Câte regenerări AI a folosit în pasul de versuri (max 5). */
  lyricsRegenCount: number;
  // Câmpuri legacy păstrate pentru compatibilitate cu referințe vechi —
  // nu mai sunt folosite în pasul de pachete.
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
  packageTier: DEFAULT_PACKAGE_TIER,
  lyricsAccepted: false,
  lyricsRegenCount: 0,
  tipAmount: 0,
  premium: false,
};

// Pasul de versuri (review înainte de plată) e per-site (Site.lyricsReviewEnabled,
// default ON). Activ → wizardul are 6 pași; altfel 5 (pay-first direct).
const STEP_NAMES_FALLBACK = ['Stil', 'Ocazie', 'Detalii', 'Versuri', 'Pachet', 'Plată'];
const STEP_NAMES_PAYFIRST_FALLBACK = ['Stil', 'Ocazie', 'Detalii', 'Pachet', 'Plată'];

type StepKey = 'style' | 'occ' | 'details' | 'lyrics' | 'package' | 'pay';

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
    const presetEntry = isStyle ? site.styleSamples?.[id] : site.voiceSamples?.[id];
    const presetUrl = presetEntry?.audioUrl;
    // startSec setat din admin → skip intro la playback. Doar pentru presets;
    // fallback-ul publicGenerations (piese ale altor useri) începe mereu de la 0.
    const presetStartSec = presetEntry?.startSec ?? 0;

    async function startPlayback(url: string, startSec = 0) {
      if (cancelled || activeKeyRef.current !== key) return;
      const a = new Audio(url);
      a.preload = 'auto';
      audioRef.current = a;
      const stopAt = startSec + 30;
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
      // Sări la startSec înainte de play (când e setat). Trebuie să așteptăm
      // metadata ca să putem face seek; `loadedmetadata` se firește o singură dată.
      if (startSec > 0) {
        const seek = () => {
          try {
            a.currentTime = startSec;
          } catch {
            /* noop */
          }
        };
        if (a.readyState >= 1) seek();
        else a.addEventListener('loadedmetadata', seek, { once: true });
      }
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
        await startPlayback(presetUrl, presetStartSec);
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

  // Pe orice schimbare de pas, derulează la începutul wizard-ului (în special
  // pe mobile: la pasul 3 user-ul ajunge jos pe pagină și la trecerea la pasul
  // 4 ar vedea doar butonul „Continuă" — fără context).
  const stepScrollMountedRef = useRef(false);
  useEffect(() => {
    if (!stepScrollMountedRef.current) {
      stepScrollMountedRef.current = true;
      return; // skip pe primul render
    }
    if (typeof window === 'undefined') return;
    const el = document.getElementById('generator');
    if (!el) return;
    // Offset 70px pentru header-ul sticky.
    const y = el.getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }, [step]);

  // Când se termină mostra de voce/stil sau nu există, comută înapoi starea vizuală.
  const handleSampleAutoStop = useCallback(
    (key: string) => {
      if (playing === key) onPlay(key);
    },
    [playing, onPlay],
  );
  useSamplePreview(playing, handleSampleAutoStop);

  const site = useSite();
  // Pasul de review al versurilor (înainte de plată) e per-site, default ON.
  // Fără el: flux pay-first direct (Stil → Ocazie → Detalii → Pachet → Plată).
  const lyricsReviewEnabled = site.lyricsReviewEnabled !== false;
  const STEP_KEYS: StepKey[] = lyricsReviewEnabled
    ? ['style', 'occ', 'details', 'lyrics', 'package', 'pay']
    : ['style', 'occ', 'details', 'package', 'pay'];
  const totalSteps = STEP_KEYS.length;
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
  // Semnal incremental pentru highlight-ul câmpului de email când validarea
  // pică în step-ul de plată. Step-urile copil ascultă valoarea: orice schimbare
  // declanșează scroll-into-view + focus + shake animation pe input. Folosim
  // un counter (nu boolean) ca să prindem și apăsările repetate de „Plătește"
  // cu același email greșit.
  const [emailErrorTick, setEmailErrorTick] = useState(0);
  const flagEmailError = useCallback(() => setEmailErrorTick((t) => t + 1), []);

  // Restore după cancel din Stripe (pay-first flow). Backend redirectează la
  // `/?paymentCanceled=1&genId=<id>` când userul anulează plata în Stripe
  // Checkout — vezi `payments.service.ts` cancelPath. Fetch generation-ul
  // pending, restore form data și ducem wizard-ul la step 5 (index 4) cu un
  // banner de eroare. Reluarea plății refolosește același generationId
  // (fără să creeze unul nou).
  const restoreAttemptedRef = useRef(false);
  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    const canceled = search.get('paymentCanceled');
    const genId = search.get('genId');
    if (canceled !== '1' || !genId) return;
    restoreAttemptedRef.current = true;
    (async () => {
      try {
        const gen = await api.getGeneration(genId);
        if (gen && !gen.paidUnlocked) {
          setData({
            style: gen.style ?? '',
            occ: gen.occasion ?? '',
            name: gen.recipientName ?? '',
            msg: gen.message ?? '',
            voice: gen.voiceArtist ?? '',
            customLyrics: gen.customLyrics ?? '',
            dedic: gen.dedication ?? '',
            packageTier: gen.packageTier ?? DEFAULT_PACKAGE_TIER,
            lyricsAccepted: true,
            lyricsRegenCount: 0,
            tipAmount: gen.tipAmount ?? 0,
            premium: !!gen.premium,
          });
          setGenerationId(gen.id);
          setStep(STEP_KEYS.indexOf('pay'));
          setError(tGen('humanError.paymentCanceled'));
        }
      } catch {
        // Generation nu mai există / eroare — lăsăm userul să reia de la 0.
      } finally {
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/#generator');
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailDraftTouched, setEmailDraftTouched] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  // Prefill draft-ul cu email-ul de pe sesiune (user logat / guest deja salvat),
  // dar fără să suprascriem ce a tastat userul (când e editabil).
  useEffect(() => {
    if (!emailDraftTouched && session.email && emailDraft !== session.email) {
      setEmailDraft(session.email);
    }
  }, [session.email, emailDraftTouched, emailDraft]);

  const onEmailDraftChange = useCallback((v: string) => {
    setEmailDraftTouched(true);
    setEmailDraft(v);
  }, []);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountCents: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  // „Nudge" pe încercare de continuare cu câmpuri incomplete. Setat când userul
  // dă „Continuă →" pe un step invalid; afișează banner + outline roșu pe
  // câmpurile lipsă + scroll la primul lipsă. Se șterge la schimbare de step
  // sau când câmpurile lipsă devin completate.
  const [nudgeStep, setNudgeStep] = useState<number | null>(null);

  const upd = <K extends keyof Data>(k: K, v: Data[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  // Auto-fill mesaj la prima trecere prin step 2 dacă msg e gol.
  // DEZACTIVAT (2026-05-25) — userii voiau câmpul gol ca să scrie ei. Pentru
  // a reactiva, treci AUTOFILL_MSG_ENABLED pe true.
  const AUTOFILL_MSG_ENABLED = false;
  useEffect(() => {
    if (AUTOFILL_MSG_ENABLED && step === 2 && !autoFilled && !data.msg && (data.style || data.occ)) {
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

  // Publică starea formularului către socketul de chat (eveniment global ascultat
  // în useChatSocket → WS `presence:form_state`). Irina vede pasul curent + ce a
  // completat userul și îl ghidează să termine comanda PE SITE, nu prin chat.
  // Emitem doar după prima interacțiune reală — altfel orice vizitator de homepage
  // (Generator montat la step 0, gol) ar apărea ca „activ în formular" și AI-ul
  // n-ar mai prelua comenzi în chat.
  const formStartedRef = useRef(false);
  useEffect(() => {
    const started =
      step > 0 || !!(data.style || data.occ || data.name || data.msg || data.voice || data.customLyrics);
    if (!started && !formStartedRef.current) return;
    formStartedRef.current = true;
    const t = setTimeout(() => {
      const key = totalSteps === 5 ? 'stepsPayFirst' : 'steps';
      const stepNamesRaw = tGen.raw(key) as string[] | undefined;
      const fallback = totalSteps === 5 ? STEP_NAMES_PAYFIRST_FALLBACK : STEP_NAMES_FALLBACK;
      const stepNames =
        Array.isArray(stepNamesRaw) && stepNamesRaw.length === totalSteps ? stepNamesRaw : fallback;
      window.dispatchEvent(
        new CustomEvent('mc:generator_state', {
          detail: {
            step,
            stepName: stepNames[step],
            totalSteps,
            data: {
              style: data.style || undefined,
              occ: data.occ || undefined,
              name: data.name || undefined,
              // Valori complete — adminul le vede în chat și poate corecta ce-a
              // scris greșit clientul (nume / mesaj / versuri). Irina le trunchiază
              // oricum la 80 char în system prompt, deci nu umflă tokenii.
              msg: data.msg || undefined,
              voice: data.voice || undefined,
              dedic: data.dedic || undefined,
              packageTier: data.packageTier,
              customLyrics: data.customLyrics || undefined,
            },
            generationId,
            at: Date.now(),
          },
        }),
      );
    }, 800); // debounce: colapsează tastarea; schimbarea de pas ajunge în <1s
    return () => clearTimeout(t);
  }, [step, data, generationId, totalSteps, tGen]);

  // Adminul poate corecta din chat câmpurile completate de client (ex. un nume scris
  // greșit). Widget-ul de chat dispatch-uiește `mc:form_patch` la primirea pe WS;
  // aplicăm patch-ul în `data` (doar câmpuri de text liber, cheile coincid cu Data).
  useEffect(() => {
    const EDITABLE = new Set<keyof Data>(['name', 'msg', 'dedic', 'customLyrics']);
    const onPatch = (e: Event) => {
      const detail = (e as CustomEvent).detail as { patch?: Record<string, unknown> } | undefined;
      const patch = detail?.patch;
      if (!patch || typeof patch !== 'object') return;
      setData((d) => {
        let changed = false;
        const next = { ...d };
        for (const [k, v] of Object.entries(patch)) {
          if (!EDITABLE.has(k as keyof Data)) continue;
          if (typeof v === 'string') {
            (next as Record<string, unknown>)[k] = v;
            changed = true;
          }
        }
        return changed ? next : d;
      });
    };
    window.addEventListener('mc:form_patch', onPatch);
    return () => window.removeEventListener('mc:form_patch', onPatch);
  }, []);

  const stepDone = (i: number): boolean => {
    const key = STEP_KEYS[i];
    if (key === 'style') return !!data.style;
    if (key === 'occ') return !!data.occ;
    if (key === 'details') return !!data.name && !!data.msg && !!data.voice;
    if (key === 'lyrics') return !!data.lyricsAccepted;
    if (key === 'package') return maxVisited > i; // opțional, „făcut" după ce-l treci
    // 'pay' — ultimul pas. „Done" = checkout-ul Stripe a fost inițiat (există
    // generationId, creat la pay sau restaurat după cancel).
    if (key === 'pay') return !!generationId;
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
  const stepKey = STEP_KEYS[step];

  // Câmpurile lipsă pentru un step dat (folosite în nudge + canNext).
  const missingFieldsFor = (i: number): string[] => {
    const key = STEP_KEYS[i];
    if (key === 'style') return data.style ? [] : ['style'];
    if (key === 'occ') return data.occ ? [] : ['occ'];
    if (key === 'details') {
      const m: string[] = [];
      if (!data.name?.trim()) m.push('name');
      if (!data.msg?.trim()) m.push('msg');
      if (!data.voice) m.push('voice');
      return m;
    }
    return [];
  };

  const currentMissing = missingFieldsFor(step);

  // Auto-clear nudge când userul a completat câmpurile lipsă.
  useEffect(() => {
    if (nudgeStep !== null && missingFieldsFor(nudgeStep).length === 0) {
      setNudgeStep(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.style, data.occ, data.name, data.msg, data.voice, nudgeStep]);

  // Reset nudge la schimbare de step (nu vrem să-l ducem cu noi).
  useEffect(() => { setNudgeStep(null); }, [step]);

  const next = () => {
    const missing = missingFieldsFor(step);
    if (missing.length > 0) {
      setNudgeStep(step);
      // scroll + focus pe primul câmp lipsă (cu un mic delay ca să apuce React să rendere-ze clasa nudge)
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-nudge-target="${missing[0]}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const input = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
            ? (el as HTMLInputElement | HTMLTextAreaElement)
            : el.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
          input?.focus({ preventScroll: true });
        }
      }, 50);
      return;
    }
    setStep((s) => Math.min(lastStep, s + 1));
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  // (canNext eliminat — validarea pe „Continuă →" se face acum în handler-ul
  //  `next()` prin missingFieldsFor() + nudge, ca să dăm feedback util
  //  utilizatorului în loc să dezactivăm tăcut butonul.)

  /** Pay-first checkout (singurul flux acum): trimite tot formularul la API,
   *  care creează generation pending + payment + Stripe Checkout într-o singură
   *  cerere. Redirect direct la Stripe.  */
  async function startDirectCheckout() {
    const candidate = emailDraft.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
      setError(tGen('humanError.emailInvalid'));
      flagEmailError();
      return;
    }
    // Pentru guests fără email salvat: persistăm acum. Pentru users / guests
    // cu email deja prezent dar care l-au modificat aici: trimitem email-ul
    // ca override la checkout, fără să atingem contul.
    if (!session.email) {
      try {
        await api.setGuestEmail(candidate);
        await session.refresh();
        try {
          track('CompleteRegistration', {
            email: candidate,
            content_name: 'guest_email_provided',
            custom_data: { source: 'generator_payfirst' },
          });
        } catch { /* silent */ }
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
        content_id: generationId ?? 'pay-first',
        content_name: 'Manea Cadou',
        content_type: 'product',
        value: total,
        currency: site.currency,
        // event_id stabil dacă există deja generationId (restore după cancel).
        event_id: generationId ? `init-${generationId}` : undefined,
      });
      // Dacă deja avem un generationId (restore după cancel din Stripe),
      // refolosim acelaș generation pending. Altfel creăm unul nou.
      let url: string;
      if (generationId) {
        const r = await api.createCheckoutSession({
          generationId,
          promoCode: promoApplied?.code,
          email: candidate,
        });
        url = r.url;
      } else {
        const r = await api.createDirectCheckoutSession({
          generation: {
            style: data.style,
            occasion: data.occ,
            recipientName: data.name,
            message: data.msg,
            dedication: data.dedic || undefined,
            voiceArtist: data.voice,
            customLyrics: data.customLyrics || undefined,
            packageTier: data.packageTier,
          },
          promoCode: promoApplied?.code,
          email: candidate,
        });
        setGenerationId(r.generationId);
        url = r.url;
      }
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
        {stepKey === 'style' && (
          <StyleStep data={data} upd={upd} playing={playing} onPlay={onPlay} styles={effectiveStyles} nudgeActive={nudgeStep === step} />
        )}
        {stepKey === 'occ' && <OccStep data={data} upd={upd} occasions={effectiveOccasions} nudgeActive={nudgeStep === step} />}
        {stepKey === 'details' && (
          <DetailsStep
            data={data}
            upd={upd}
            voices={effectiveVoices}
            nudgeFields={nudgeStep === step ? currentMissing : []}
          />
        )}
        {stepKey === 'lyrics' && (
          <LyricsStep
            data={data}
            upd={upd}
            goNext={() => setStep((s) => Math.min(lastStep, s + 1))}
          />
        )}
        {stepKey === 'package' && <PackageStep data={data} upd={upd} />}
        {stepKey === 'pay' && (
          <PayFirstStep
            data={data}
            email={session.email}
            emailDraft={emailDraft}
            onEmailChange={onEmailDraftChange}
            emailErrorTick={emailErrorTick}
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
      </div>
      {nudgeStep === step && currentMissing.length > 0 && (
        <NudgeBanner missing={currentMissing} />
      )}
      <div className="gen-foot">
        {step > 0 && step < lastStep && !generationId && (
          <button className="btn btn-ghost btn-sm" onClick={prev}>← {tCommon('back')}</button>
        )}
        <div className="progress">{tGen('stepPattern', { current: step + 1, total: totalSteps })}</div>
        {/* 'lyrics' și 'pay' au butoanele lor primare (Acceptă / Plătește). */}
        {(stepKey === 'style' || stepKey === 'occ' || stepKey === 'details' || stepKey === 'package') && (
          <button
            className="btn btn-gold btn-sm"
            onClick={next}
            data-hint="true"
            data-hint-label={tCommon('next')}
          >
            {tCommon('next')} →
          </button>
        )}
      </div>
    </div>
  );
}

/** Banner roșu afișat sub conținutul step-ului când userul a încercat să
 *  treacă mai departe fără să completeze tot. Listează în text uman câmpurile
 *  lipsă. Câmpurile lipsă au în paralel highlight individual. */
function NudgeBanner({ missing }: { missing: string[] }) {
  const tg = useTranslations('generator');
  const labelFor = (f: string) => {
    switch (f) {
      case 'style': return tg('nudge.fieldStyle');
      case 'occ': return tg('nudge.fieldOcc');
      case 'name': return tg('nudge.fieldName');
      case 'msg': return tg('nudge.fieldMsg');
      case 'voice': return tg('nudge.fieldVoice');
      default: return f;
    }
  };
  const labels = missing.map(labelFor);
  const text = labels.length === 1
    ? tg('nudge.bannerOne', { label: labels[0] })
    : tg('nudge.bannerMany', { labels: labels.join(', ') });
  return (
    <div
      role="alert"
      style={{
        margin: '0 14px 12px',
        padding: '10px 12px',
        borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(220,38,38,0.18), rgba(220,38,38,0.08))',
        border: '1px solid rgba(255,120,120,0.45)',
        color: '#ffd4d4',
        fontSize: 13,
        fontWeight: 600,
        animation: 'nudgeShake 0.4s ease',
      }}
    >
      ⚠️ {text}
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

// ============ STEP 1 ============
function StyleStep({ data, upd, playing, onPlay, styles, nudgeActive }: any & { styles: StyleOption[]; nudgeActive?: boolean }) {
  const tg = useTranslations('generator');
  const tStyles = useTranslations('styles');
  const isNudged = !!nudgeActive && !data.style;
  return (
    <>
      <h3>{tg('step1Title')}</h3>
      <p className="ld">{tg('step1Sub')}</p>
      {isNudged && (
        <div style={{ marginTop: 4, marginBottom: 10, fontSize: 13, color: '#ffb3b3', fontWeight: 700 }}>
          {tg('nudge.hintStyle')}
        </div>
      )}
      <div
        className={`style-list ${isNudged ? 'nudge-outline' : ''}`}
        data-nudge-target={isNudged ? 'style' : undefined}
      >
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
                onClick={(e) => { e.stopPropagation(); upd('style', s.id); onPlay(`style-${s.id}`); }}
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
function OccStep({ data, upd, occasions, nudgeActive }: any & { occasions: Array<{ id: string; em: string; nm: string }>; nudgeActive?: boolean }) {
  const tOcc = useTranslations('occasions');
  const tg = useTranslations('generator');
  const isNudged = !!nudgeActive && !data.occ;
  return (
    <>
      <h3>{tg('step2Title')}</h3>
      <p className="ld">{tg('step2Sub')}</p>
      {isNudged && (
        <div style={{ marginTop: 4, marginBottom: 10, fontSize: 13, color: '#ffb3b3', fontWeight: 700 }}>
          {tg('nudge.hintOcc')}
        </div>
      )}
      <div
        className={`occ-list ${isNudged ? 'nudge-outline' : ''}`}
        data-nudge-target={isNudged ? 'occ' : undefined}
      >
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
function DetailsStep({ data, upd, voices, nudgeFields = [] }: any & { voices: Array<{ id: string; nm: string; tg: string; av: string }>; nudgeFields?: string[] }) {
  const tg = useTranslations('generator');
  const nudgeName = nudgeFields.includes('name');
  const nudgeMsg = nudgeFields.includes('msg');
  const nudgeVoice = nudgeFields.includes('voice');
  const site = useSite();
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

      <div className={`field ${nudgeName ? 'nudge-field' : ''}`}>
        <label>{tg('step3.nameLabel')}</label>
        <input
          type="text" placeholder={tg('step3.namePlaceholder')}
          value={data.name} onChange={(e) => upd('name', e.target.value)} maxLength={40}
          data-nudge-target={nudgeName ? 'name' : undefined}
        />
        {nudgeName && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#ffb3b3', fontWeight: 700 }}>
            {tg('nudge.hintName')}
          </div>
        )}
      </div>

      <div className={`field ${nudgeMsg ? 'nudge-field' : ''}`}>
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
          value={data.msg} onChange={(e) => upd('msg', e.target.value)} maxLength={600}
          data-nudge-target={nudgeMsg ? 'msg' : undefined}
        />
        <div className="cc">{data.msg.length}/600</div>
        {nudgeMsg && (
          <div style={{ marginTop: 4, fontSize: 12, color: '#ffb3b3', fontWeight: 700 }}>
            {tg('nudge.hintMsg')}
          </div>
        )}
        {suggestError && (
          <div style={{ marginTop: 4, fontSize: 11, color: '#ff8888' }}>{suggestError}</div>
        )}
      </div>

      <div className="field">
        <label>{tg('step3.dedicLabel')}</label>
        <input type="text" placeholder={tg('step3.dedicPlaceholder')}
          value={data.dedic} onChange={(e) => upd('dedic', e.target.value)} maxLength={40} />
      </div>

      <h3 style={{ marginTop: 22 }}>{tg('step3.voicesTitle')}</h3>
      {nudgeVoice && (
        <div style={{ marginTop: 4, marginBottom: 8, fontSize: 13, color: '#ffb3b3', fontWeight: 700 }}>
          {tg('nudge.hintVoice')}
        </div>
      )}
      <div
        className={`voice-list ${nudgeVoice ? 'nudge-outline' : ''}`}
        data-nudge-target={nudgeVoice ? 'voice' : undefined}
      >
        {(voices as Array<{ id: string; nm: string; tg: string; av: string; ic?: any }>).map((v) => (
          <div key={v.id} role="button" tabIndex={0} className={`voice-pick ${data.voice === v.id ? 'on' : ''}`} onClick={() => upd('voice', v.id)}>
            <div className="av">{v.ic ? <SiteIcon ic={v.ic} em={v.av} size={22} /> : v.av}</div>
            <div className="info">
              <div className="nm">{v.nm}</div>
              <div className="tg">{v.tg}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============ STEP 4 — PACHETE ============
/** Card individual de pachet — își ia prețul real din quote API, cu fallback
 *  la priceCents din contractul local. */
function PackageCard({
  tier,
  selected,
  onSelect,
}: {
  tier: PackageTier;
  selected: boolean;
  onSelect: () => void;
}) {
  const site = useSite();
  const pkg = PACKAGES.find((p) => p.tier === tier)!;
  const { data: quote } = useQuery({
    queryKey: ['package-quote', tier],
    queryFn: () => api.priceQuote(tier),
    staleTime: 5 * 60_000,
  });
  const priceCents = quote?.total ?? pkg.priceCents;
  const fmt = (cents: number) => formatPrice(site, cents);
  // Preț „tăiat" (marketing) — vine din quote, doar dacă e setat și > prețul real.
  const compareAtCents =
    quote?.compareAtCents && quote.compareAtCents > priceCents ? quote.compareAtCents : null;
  const discountPct = compareAtCents
    ? Math.round((1 - priceCents / compareAtCents) * 100)
    : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className={`occ-pick ${selected ? 'on' : ''}`}
      aria-pressed={selected}
      style={{
        position: 'relative',
        display: 'block',
        textAlign: 'left',
        padding: '16px 14px',
        borderRadius: 12,
        border: `2px solid ${selected ? 'var(--gold)' : pkg.recommended ? 'rgba(241,200,77,0.4)' : 'rgba(241,200,77,0.18)'}`,
        background: selected
          ? 'linear-gradient(135deg, rgba(241,200,77,0.12), rgba(176,124,30,0.06))'
          : 'rgba(255,255,255,0.02)',
        cursor: 'pointer',
      }}
    >
      {pkg.recommended && (
        <span
          style={{
            position: 'absolute', top: -10, right: 12,
            fontSize: 10, fontWeight: 900, letterSpacing: '0.08em',
            padding: '3px 10px', borderRadius: 999,
            background: 'linear-gradient(180deg,#ffe28a,#f1c84d,#b07c1e)',
            color: '#2a1a04',
            boxShadow: '0 3px 10px rgba(241,200,77,0.4)',
          }}
        >
          RECOMANDAT
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--gold-2)', fontFamily: 'Cinzel, serif' }}>
          {pkg.nameRO}
        </div>
        <div style={{ textAlign: 'right' }}>
          {compareAtCents && (
            <div
              style={{
                fontSize: 13, fontWeight: 700, lineHeight: 1,
                color: 'rgba(255,245,220,0.45)', textDecoration: 'line-through',
              }}
            >
              {fmt(compareAtCents)}
            </div>
          )}
          <div className="gold-text" style={{ fontWeight: 900, fontSize: 20, whiteSpace: 'nowrap' }}>
            {fmt(priceCents)}
          </div>
        </div>
      </div>
      {compareAtCents && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <span
            style={{
              fontSize: 11, fontWeight: 900, letterSpacing: '0.04em',
              padding: '3px 8px', borderRadius: 999,
              background: 'linear-gradient(135deg,#e0394b,#b01e2e)', color: '#fff',
              boxShadow: '0 2px 8px rgba(214,47,63,0.35)',
            }}
          >
            −{discountPct}% REDUCERE
          </span>
          <OfferCountdown />
        </div>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
        {pkg.features.map((f, i) => (
          <li
            key={i}
            style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              fontSize: 13, lineHeight: 1.4, color: 'rgba(255,245,220,0.85)',
              marginBottom: 6,
            }}
          >
            <span style={{ color: 'var(--gold)', flexShrink: 0, fontWeight: 900 }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div style={{
        marginTop: 10, fontSize: 12, fontWeight: 700,
        color: selected ? 'var(--gold)' : 'rgba(255,245,220,0.55)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        ⚡ {pkg.deliveryLabel}
      </div>
    </div>
  );
}

function PackageStep({ data, upd }: { data: Data; upd: <K extends keyof Data>(k: K, v: Data[K]) => void }) {
  const tg = useTranslations('generator');
  return (
    <>
      <h3>{tg('step4.title')}</h3>
      <p className="ld">{tg('step4.sub')}</p>

      <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
        {PACKAGES.map((pkg) => (
          <PackageCard
            key={pkg.tier}
            tier={pkg.tier}
            selected={data.packageTier === pkg.tier}
            onSelect={() => upd('packageTier', pkg.tier)}
          />
        ))}
      </div>
    </>
  );
}

/**
 * Reacționează la `tick` (orice valoare > 0): aprinde clasa `field-error` +
 * `shake-x` pe wrapper, scroll-into-view + focus input. Animația durează ~600ms.
 * Refolosit în DemoStep + PayFirstStep pentru highlight-ul de email invalid.
 */
function useFieldErrorSignal(tick: number) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (tick === 0) return;
    setActive(true);
    // Scroll + focus pe următorul frame (DOM-ul e deja randat cu clasa).
    requestAnimationFrame(() => {
      try {
        wrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        inputRef.current?.focus({ preventScroll: true });
      } catch {}
    });
    // Scoatem `shake-x` după ce animația se termină — clasa `field-error`
    // (border roșu) rămâne până când userul tastează ceva valid.
    const tShake = setTimeout(() => setActive(false), 600);
    return () => clearTimeout(tShake);
  }, [tick]);
  return { wrapperRef, inputRef, shaking: active };
}

// ============ STEP — VERSURI (review înainte de plată) ============
const MAX_LYRICS_REGENS = 5;
const REJECT_REASONS = ['artist_name', 'public_figure', 'offensive', 'copyright', 'other'];

function rejectReasonText(tg: TFn, reason: string): string {
  switch (reason) {
    case 'artist_name': return tg('lyricsReview.rejected.artist_name');
    case 'public_figure': return tg('lyricsReview.rejected.public_figure');
    case 'offensive': return tg('lyricsReview.rejected.offensive');
    case 'copyright': return tg('lyricsReview.rejected.copyright');
    default: return tg('lyricsReview.rejected.other');
  }
}

function LyricsStep({
  data,
  upd,
  goNext,
}: {
  data: Data;
  upd: <K extends keyof Data>(k: K, v: Data[K]) => void;
  goNext: () => void;
}) {
  const site = useSite();
  const tg = useTranslations('generator');
  const tc = useTranslations('common');
  const [text, setText] = useState(data.customLyrics || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [validating, setValidating] = useState(false);
  const [rejected, setRejected] = useState<{ reason: string; detail?: string } | null>(null);
  // false = vede versurile + butoanele [Nu îmi plac][Îmi plac];
  // true = a apăsat „Nu îmi plac" → apare feedback-ul + [Înapoi][Regenerează].
  const [feedbackMode, setFeedbackMode] = useState(false);
  // true după ce „Refă cu AI" a fost apăsat cu feedback gol → highlight roșu pe câmp.
  const [feedbackErr, setFeedbackErr] = useState(false);
  const startedRef = useRef(false);

  const regenLeft = MAX_LYRICS_REGENS - data.lyricsRegenCount;

  const generate = useCallback(
    async (fb?: string) => {
      setLoading(true);
      setError(null);
      setRejected(null);
      try {
        const res = await api.generateLyrics({
          style: data.style,
          occasion: data.occ,
          recipientName: data.name,
          message: data.msg || undefined,
          dedication: data.dedic || undefined,
          voiceArtist: data.voice,
          locale: site.locale,
          feedback: fb || undefined,
          previousLyrics: fb ? text || data.customLyrics || undefined : undefined,
        });
        setText(res.lyrics);
        upd('customLyrics', res.lyrics);
        upd('lyricsAccepted', false);
      } catch {
        setError(tg('lyricsReview.errGenerate'));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.style, data.occ, data.name, data.msg, data.dedic, data.voice, site.locale, text],
  );

  // Generăm automat la prima intrare în pas, dacă nu există deja versuri
  // (ex. userul s-a întors din pasul de pachet → păstrăm ce avea).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (data.customLyrics?.trim()) {
      setText(data.customLyrics);
    } else {
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onEditText = (v: string) => {
    setText(v);
    upd('customLyrics', v);
    upd('lyricsAccepted', false);
    setRejected(null);
  };

  const onRegen = () => {
    if (loading || regenLeft <= 0) return;
    if (!feedback.trim()) {
      setFeedbackErr(true); // câmp gol → eroare roșie pe câmp (ca la ceilalți pași)
      return;
    }
    setFeedbackErr(false);
    upd('lyricsRegenCount', data.lyricsRegenCount + 1);
    const fb = feedback.trim();
    setFeedback('');
    setFeedbackMode(false); // după regenerare revenim la [Nu îmi plac][Îmi plac]
    void generate(fb);
  };

  const onAccept = async () => {
    if (loading || validating) return;
    const lyrics = text.trim();
    if (!lyrics) {
      setError(tg('lyricsReview.errEmpty'));
      return;
    }
    setValidating(true);
    setError(null);
    setRejected(null);
    try {
      const res = await api.validateLyrics({
        lyrics,
        recipientName: data.name,
        dedication: data.dedic || undefined,
        locale: site.locale,
      });
      if (res.ok) {
        upd('customLyrics', lyrics);
        upd('lyricsAccepted', true);
        goNext();
      } else {
        const reason = res.reason && REJECT_REASONS.includes(res.reason) ? res.reason : 'other';
        setRejected({ reason, detail: res.detail });
      }
    } catch {
      setError(tg('lyricsReview.errValidate'));
    } finally {
      setValidating(false);
    }
  };

  const loadingPhrases = (() => {
    try {
      const raw = (tg as unknown as { raw: (k: string) => unknown }).raw('lyricsReview.loadingPhrases');
      return Array.isArray(raw) && raw.length ? (raw as string[]) : [tg('lyricsReview.loading')];
    } catch {
      return [tg('lyricsReview.loading')];
    }
  })();

  const firstLoad = loading && !text;

  return (
    <>
      <h3>{tg('lyricsReview.title')}</h3>
      <p className="ld">{tg('lyricsReview.sub')}</p>

      {firstLoad ? (
        <LyricsLoader phrases={loadingPhrases} hint={tg('lyricsReview.loadingHint')} />
      ) : (
        <>
          <div style={{ position: 'relative', marginTop: 14 }}>
            <div style={{
              fontSize: 11, color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', marginBottom: 8, display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{tg('lyricsReview.lyricsLabel')}</span>
              {data.lyricsAccepted && <span style={{ color: '#7be09b' }}>✓ {tg('lyricsReview.acceptedTag')}</span>}
            </div>
            <textarea
              value={text}
              onChange={(e) => onEditText(e.target.value)}
              rows={14}
              spellCheck={false}
              style={{
                width: '100%', resize: 'vertical', minHeight: 240, padding: 14, borderRadius: 12,
                background: 'rgba(241,200,77,0.05)', border: '1px solid rgba(241,200,77,0.25)',
                color: 'var(--gold-2)', fontSize: 14, lineHeight: 1.7, fontFamily: 'inherit',
              }}
            />
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                background: 'rgba(10,6,6,0.55)', borderRadius: 12, backdropFilter: 'blur(2px)',
              }}>
                <LyricsLoader phrases={loadingPhrases} compact />
              </div>
            )}
            <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.45)', marginTop: 6 }}>
              {tg('lyricsReview.bracketsHint')}
            </div>
          </div>

          {feedbackMode && (
            <div style={{
              marginTop: 16, padding: 14, borderRadius: 12,
              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--line)',
            }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-2)', display: 'block', marginBottom: 6 }}>
                {tg('lyricsReview.feedbackLabel')}
              </label>
              <textarea
                value={feedback}
                onChange={(e) => { setFeedback(e.target.value); if (feedbackErr) setFeedbackErr(false); }}
                placeholder={tg('lyricsReview.feedbackPlaceholder')}
                rows={2}
                maxLength={2000}
                disabled={regenLeft <= 0 || loading}
                style={{
                  width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)',
                  border: feedbackErr ? '1px solid var(--rose)' : '1px solid var(--line)',
                  color: 'var(--cream)', fontSize: 13, fontFamily: 'inherit',
                  opacity: regenLeft <= 0 ? 0.5 : 1,
                }}
              />
              {feedbackErr ? (
                <div style={{ fontSize: 12, color: 'var(--rose)', fontWeight: 700, marginTop: 8 }}>
                  {tg('lyricsReview.errFeedbackEmpty')}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: regenLeft > 0 ? 'rgba(255,245,220,0.55)' : '#ffb3b3', fontWeight: 600, marginTop: 8 }}>
                  {regenLeft > 0 ? tg('lyricsReview.regensLeft', { count: regenLeft }) : tg('lyricsReview.regensExhausted')}
                </div>
              )}
            </div>
          )}

          {rejected && (
            <div role="alert" style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(220,38,38,0.18), rgba(220,38,38,0.08))',
              border: '1px solid rgba(255,120,120,0.45)', color: '#ffd4d4', fontSize: 13, fontWeight: 600,
            }}>
              ⚠️ {rejectReasonText(tg, rejected.reason)}
              {rejected.detail ? <span style={{ opacity: 0.8 }}>{` („${rejected.detail}")`}</span> : null}
            </div>
          )}

          {error && <ErrorBox text={error} />}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {!feedbackMode ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-lg"
                  onClick={() => { setError(null); setRejected(null); setFeedbackErr(false); setFeedbackMode(true); }}
                  disabled={loading || validating}
                  style={{ flex: 1, opacity: loading || validating ? 0.5 : 1 }}
                >
                  👎 {tg('lyricsReview.dislikeCta')}
                </button>
                <button
                  type="button"
                  className="btn btn-gold btn-lg"
                  onClick={onAccept}
                  disabled={loading || validating || !text.trim()}
                  style={{ flex: 1, opacity: loading || validating || !text.trim() ? 0.5 : 1 }}
                  data-hint={!loading && !validating ? 'true' : undefined}
                  data-hint-label={tg('lyricsReview.acceptHint')}
                >
                  {validating ? tg('lyricsReview.validating') : `👍 ${tg('lyricsReview.likeCta')}`}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-lg"
                  onClick={() => { setError(null); setFeedbackErr(false); setFeedbackMode(false); }}
                  disabled={loading}
                  style={{ flex: 1, opacity: loading ? 0.5 : 1 }}
                >
                  {tc('cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-gold btn-lg"
                  onClick={onRegen}
                  disabled={regenLeft <= 0 || loading}
                  style={{ flex: 1, opacity: regenLeft <= 0 || loading ? 0.5 : 1 }}
                >
                  {loading ? tg('lyricsReview.regenerating') : tg('lyricsReview.regenCta')}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** Loader brandit pentru generarea versurilor (spinner gold + fraze rotative). */
function LyricsLoader({ phrases, hint, compact }: { phrases: string[]; hint?: string; compact?: boolean }) {
  return (
    <div style={{
      display: 'grid', placeItems: 'center', gap: 16, textAlign: 'center',
      padding: compact ? 12 : '44px 12px',
    }}>
      <style>{`@keyframes mcLyrSpin{to{transform:rotate(360deg)}}@keyframes mcLyrGlow{0%,100%{opacity:.45}50%{opacity:1}}`}</style>
      <div style={{ position: 'relative', width: compact ? 52 : 72, height: compact ? 52 : 72 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '3px solid rgba(241,200,77,0.15)', borderTopColor: 'var(--gold)',
          animation: 'mcLyrSpin 0.9s linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          fontSize: compact ? 20 : 28, animation: 'mcLyrGlow 1.6s ease-in-out infinite',
        }}>🎶</div>
      </div>
      <div style={{ minHeight: '1.4em', fontWeight: 700, color: 'var(--gold-2)', fontSize: compact ? 13 : 15 }}>
        <RotatingStatus phrases={phrases} intervalMs={2200} />
      </div>
      {hint && <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.5)', maxWidth: 360 }}>{hint}</div>}
    </div>
  );
}

// ============ STEP — PLATĂ (pay-first) ============
function PayFirstStep({
  data,
  email,
  emailDraft,
  onEmailChange,
  emailErrorTick,
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
  emailErrorTick: number;
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
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDraft.trim());
  const emailSignal = useFieldErrorSignal(emailErrorTick);
  const showEmailError = emailErrorTick > 0 && !emailValid;
  const pkg = PACKAGES.find((p) => p.tier === data.packageTier)!;
  const { data: quote } = useQuery({
    queryKey: ['package-quote', data.packageTier],
    queryFn: () => api.priceQuote(data.packageTier),
    staleTime: 5 * 60_000,
  });
  const fmt = (cents: number) => formatPrice(site, cents);
  const packagePrice = quote?.total ?? pkg.priceCents;
  const compareAtCents =
    quote?.compareAtCents && quote.compareAtCents > packagePrice ? quote.compareAtCents : null;
  const finalTotal = Math.max(0, packagePrice - (promoApplied?.discountCents ?? 0));

  return (
    <>
      <h3>{tg('step5PayFirst.title')}</h3>
      <p className="ld">{tg('step5PayFirst.sub')}</p>

      <div
        ref={emailSignal.wrapperRef}
        className={`field${showEmailError ? ' field-error' : ''}${emailSignal.shaking ? ' shake-x' : ''}`}
        style={{ marginTop: 14 }}
      >
        <label>{tg('step5PayFirst.emailLabel')}</label>
        <input
          ref={emailSignal.inputRef}
          type="email"
          placeholder={tg('step5Demo.emailPlaceholder')}
          value={emailDraft}
          onChange={(e) => onEmailChange(e.target.value)}
          aria-invalid={showEmailError || undefined}
          required
        />
        {emailDraft && !showEmailError && (
          <div style={{ fontSize: 11, color: 'var(--gold-2)', marginTop: 4 }}>
            {tg('step5PayFirst.emailSentTo')} <b>{emailDraft}</b>
          </div>
        )}
        {showEmailError && (
          <div style={{ fontSize: 12, color: 'var(--rose)', marginTop: 6, fontWeight: 600 }}>
            {tg('humanError.emailInvalid')}
          </div>
        )}
      </div>

      <div style={{
        marginTop: 14, padding: 14, borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(90,13,24,0.4), rgba(40,12,18,0.4))',
        border: '1px solid var(--gold)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span>{pkg.nameRO}</span>
          <span>
            {compareAtCents && (
              <span style={{ textDecoration: 'line-through', opacity: 0.5, marginRight: 6 }}>
                {fmt(compareAtCents)}
              </span>
            )}
            {fmt(packagePrice)}
          </span>
        </div>
        {compareAtCents && (
          <div style={{ marginTop: 8 }}>
            <OfferCountdown label="Prețul redus se termină în" />
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
                  const r = await api.validatePromo(promoCode.trim(), email ?? undefined, packagePrice);
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
