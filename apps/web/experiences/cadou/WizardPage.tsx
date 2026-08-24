'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError, ensureGuestSession, type GenerationDto } from '@/lib/api';
import { track } from '@/lib/tracking';
import { useSession } from '@/lib/providers';
import { useSite } from '@/lib/site-context';
import { formatPrice } from '@/lib/site-shared';
import { OCC, VOICES } from '@/lib/seed-data';
import { useExperienceCatalog } from '../use-experience-catalog';
import type { PackageTier } from '@/lib/packages';
import { usePackages } from '@/experiences/use-packages';
import { CadouShell } from './Shell';
import { CadouPackGrid } from './PackCard';
import { CadouStyleCard, useCadouStylePreview } from './StyleCard';
import {
  clearCadouWizard,
  EMPTY_CADOU,
  readCadouWizard,
  saveCadouWizard,
  type CadouWizardData,
} from './wizard-storage';
import { useCadouStories } from './stories';
import { fromLineRe, stripFromLine, useCadouFromName } from './from-name';

/** Pașii wizardului — etichetele vin din `cadou.wizard`. */
const STEP_KEYS = ['stepStyle', 'stepDetails', 'stepExtra', 'stepPay'] as const;

function emailOk(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** `fromLabel` = eticheta „de la" a locale-ului; parsarea acceptă și varianta RO legacy. */
function wizardFromGeneration(g: GenerationDto, fromLabel: string): CadouWizardData {
  const rec = (g.recipientName ?? '').trim();
  const noDedic = !rec || rec === '—';
  const fromLine = g.message?.match(fromLineRe(fromLabel));
  const fromName = (
    (g.dedication && g.dedication !== rec ? g.dedication : '') ||
    fromLine?.[1]?.trim() ||
    ''
  );
  const msg = stripFromLine(g.message, fromLabel);
  const tier = g.packageTier === 'plus' || g.packageTier === 'premium' ? g.packageTier : 'basic';
  return {
    ...EMPTY_CADOU,
    style: g.style ?? '',
    occ: g.occasion && g.occasion !== 'altul' ? g.occasion : '',
    name: noDedic ? '' : rec,
    fromName,
    noDedic,
    msg,
    voice: g.voiceArtist === 'female' ? 'female' : 'male',
    packageTier: tier,
    customLyrics: g.customLyrics ?? '',
    useCustomLyrics: !!g.customLyrics?.trim(),
    privacy: true,
  };
}

function CadouErr({ children }: { children: ReactNode }) {
  return <p className="cadou-err" role="alert">{children}</p>;
}

function CadouTapHand() {
  return (
    <span className="cadou-err-hand" aria-hidden>
      <svg viewBox="0 0 64 64" width="44" height="44">
        <path
          fill="#f4d38a"
          stroke="#1a1a1a"
          strokeWidth="2.2"
          strokeLinejoin="round"
          d="M18 28v-9.5a4 4 0 0 1 8 0V28m0-14.5a4 4 0 0 1 8 0V28m0-11.5a4 4 0 0 1 8 0V30m0-8.5a4 4 0 0 1 8 0V34c0 8.5-6.2 16-16.5 16H30c-7.8 0-14-5.4-14-13.2V28"
        />
        <path
          fill="#e8c56d"
          d="M26 28v-14.5a4 4 0 0 1 8 0V28"
        />
      </svg>
    </span>
  );
}

function WizardInner() {
  const site = useSite();
  const t = useTranslations('cadou.wizard');
  const fromLabel = useCadouFromName().label;
  const session = useSession();
  const search = useSearchParams();
  const catalog = useExperienceCatalog();
  const styles = catalog.styles;
  const stylePreview = useCadouStylePreview();
  const occasions = catalog.occasions.length ? catalog.occasions : OCC;
  const voices = catalog.voices.length ? catalog.voices : VOICES;

  const [step, setStep] = useState(0);
  const [data, setData] = useState<CadouWizardData>(EMPTY_CADOU);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  const [errPulse, setErrPulse] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [promoDraft, setPromoDraft] = useState('');
  const [promo, setPromo] = useState<{ code: string; discountCents: number } | null>(null);
  const packages = usePackages();
  const restored = useRef(false);
  const hydrated = useRef(false);
  const followPromoTried = useRef(false);

  const point = (on: boolean, children: ReactNode, kind: 'field' | 'area' | 'grid' | 'voice' = 'field') => (
    <div className={`cadou-field cadou-field-${kind}`}>
      {children}
      {on ? <CadouTapHand key={errPulse} /> : null}
    </div>
  );

  const storyPresets = useCadouStories();
  const stories = useMemo(() => storyPresets.forStyle(data.style), [storyPresets, data.style]);

  useEffect(() => {
    if (step !== 0) stylePreview.stop();
  }, [step, stylePreview.stop]);

  useEffect(() => {
    if (!restored.current) return;
    if (step !== 1 || !data.style) return;
    const list = storyPresets.forStyle(data.style);
    const preset = storyPresets.defaultForStyle(data.style);
    const occOk = (id?: string) => !!id && occasions.some((o) => o.id === id);
    setData((d) => {
      if (list.some((s) => s.msg === d.msg)) return d;
      if (d.msg.trim() && !storyPresets.isPresetMsg(d.msg)) return d;
      return {
        ...d,
        msg: preset.msg,
        occ: occOk(preset.occ) ? preset.occ! : d.occ,
      };
    });
  }, [step, data.style, occasions, storyPresets]);

  const upd = <K extends keyof CadouWizardData>(k: K, v: CadouWizardData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const fromUrlStyle = search.get('style');
    const fromUrlStep = Number(search.get('step') || '0');
    const canceled = search.get('paymentCanceled') === '1';
    const genId = search.get('genId');
    if (canceled && genId) {
      (async () => {
        let ok = false;
        try {
          const g = await api.getGeneration(genId);
          if (g && !g.paidUnlocked) {
            setData((d) => ({ ...wizardFromGeneration(g, fromLabel), email: d.email }));
            setGenerationId(g.id);
            setStep(3);
            setError(t('errPaymentCanceled'));
            ok = true;
          }
        } catch {
          /* fallback pe snapshot local */
        }
        if (!ok) {
          const snap = readCadouWizard();
          if (snap) {
            setData({
              ...EMPTY_CADOU,
              ...snap.data,
              voice: snap.data.voice || 'male',
            });
            if (snap.generationId) setGenerationId(snap.generationId);
            setStep(3);
            setError(t('errPaymentCanceled'));
          }
        }
        hydrated.current = true;
      })();
      return;
    }
    const snap = readCadouWizard();
    if (snap) {
      setData({
        ...EMPTY_CADOU,
        ...snap.data,
        voice: snap.data.voice || 'male',
        ...(fromUrlStyle ? { style: fromUrlStyle } : {}),
      });
      if (snap.generationId) setGenerationId(snap.generationId);
      const s = canceled ? 3 : Math.min(3, Math.max(0, snap.step));
      setStep(Number.isFinite(fromUrlStep) && fromUrlStep >= 1 && !canceled ? Math.min(3, fromUrlStep - 1) : s);
      if (canceled) setError(t('errPaymentCanceled'));
      hydrated.current = true;
      // Snapshotul poate aparține unei comenzi DEJA plătite (clientul revine
      // peste zile pentru a doua manea). Atunci e gunoi: l-ar pune direct în
      // pasul 4 cu datele vechi, iar „Plătește" l-ar trimite la
      // /m/<id-vechi>?already=1 — fără să înțeleagă nimic. Verificăm în fundal
      // și pornim curat.
      if (snap.generationId && !canceled) {
        const staleId = snap.generationId;
        void (async () => {
          try {
            const old = await api.getGeneration(staleId);
            if (!old?.paidUnlocked) return;
          } catch {
            return;
          }
          clearCadouWizard();
          setData((d) => ({ ...EMPTY_CADOU, email: d.email }));
          setGenerationId(null);
          setPromo(null);
          setPromoDraft('');
          setPromoError(null);
          setStep(0);
        })();
      }
      return;
    }
    if (fromUrlStyle) setData((d) => ({ ...d, style: fromUrlStyle }));
    if (fromUrlStep >= 1 && fromUrlStep <= 4) setStep(fromUrlStep - 1);
    hydrated.current = true;
  }, [search, fromLabel, t]);

  useEffect(() => {
    if (!session.email || data.email) return;
    setData((d) => (d.email ? d : { ...d, email: session.email || '' }));
  }, [session.email, data.email]);

  // URL-ul depinde DOAR de pas + stil, deci se schimbă rar. Ținut separat de
  // snapshot: înainte, fiecare tastă în textarea chema `replaceState`, iar
  // WebKit plafonează la ~100 apeluri / 30s (plus jank pe telefoane slabe).
  useEffect(() => {
    if (!hydrated.current || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('step', String(step + 1));
    if (data.style) url.searchParams.set('style', data.style);
    else url.searchParams.delete('style');
    url.searchParams.delete('paymentCanceled');
    url.searchParams.delete('genId');
    const next = `${url.pathname}?${url.searchParams.toString()}`;
    if (next === `${window.location.pathname}${window.location.search}`) return;
    window.history.replaceState({}, '', next);
  }, [step, data.style]);

  // Snapshotul (JSON.stringify + scriere sincronă în localStorage) — debounce
  // ca tastarea să nu-l rescrie la fiecare caracter.
  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      saveCadouWizard({ step, data, generationId, at: Date.now() });
    }, 500);
    return () => clearTimeout(timer);
  }, [step, data, generationId]);

  // Prețul AFIȘAT e prețul TAXAT: pachetul rezolvat din configul de site trece
  // prin exact aceeași precedență ca `PaymentsService.quote` (preț per-site +
  // override pe interfață). Fără pachete în config nu inventăm nicio cifră.
  const currentPack = packages.byTier[data.packageTier] ?? null;
  const currentPrice = currentPack?.priceCents ?? 0;
  const afterPromo = Math.max(0, currentPrice - (promo?.discountCents ?? 0));
  // Ancora „de la" = cel mai ieftin pachet ACTIV, nu neapărat `basic`.
  const cheapest = packages.items.reduce<typeof packages.items[number] | null>(
    (best, p) => (!best || p.priceCents < best.priceCents ? p : best),
    null,
  );
  const fromPrice = cheapest?.priceCents ?? null;
  // Preț „tăiat" doar dacă e chiar configurat pe pachet. Fără ancore inventate
  // — un „-50%" fals față de un preț care n-a existat niciodată.
  const compareAt =
    cheapest?.compareAtCents && fromPrice !== null && cheapest.compareAtCents > fromPrice
      ? cheapest.compareAtCents
      : 0;
  const discountPct =
    fromPrice !== null && compareAt > fromPrice
      ? Math.round((1 - fromPrice / compareAt) * 100)
      : 0;

  // Pachetul selectat trebuie să existe în vitrină: dacă proprietarul a oprit
  // tier-ul implicit din admin, cădem pe primul pachet ACTIV — altfel clientul
  // ar plăti un pachet pe care nu-l vede nicăieri.
  useEffect(() => {
    if (!packages.loaded || packages.items.length === 0) return;
    if (packages.items.some((p) => p.tier === data.packageTier)) return;
    upd('packageTier', packages.items[0].tier);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages.loaded, packages.items, data.packageTier]);

  const stepValid = (s: number): boolean => {
    if (s === 0) return !!data.style;
    if (s === 1) {
      return !!data.msg.trim() && !!data.fromName.trim() && (data.noDedic || !!data.name.trim());
    }
    if (s === 2) {
      return !!data.voice && emailOk(data.email) && data.privacy && (!data.useCustomLyrics || !!data.customLyrics.trim());
    }
    return true;
  };

  const goto = (s: number) => {
    setNudge(false);
    setError(null);
    setStep(s);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const next = () => {
    if (!stepValid(step)) {
      setNudge(true);
      setErrPulse((n) => n + 1);
      // `setNudge` e batched de React 18: clasele `.err` nu există încă la
      // momentul ăsta. Fără rAF, `querySelector` nu găsea nimic și primul tap
      // pe „Continuă" nu derula nicăieri — pe pasul 2 eroarea e la ~400px
      // deasupra ecranului, deci userul credea că butonul e mort.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const bad = document.querySelector('.cadou-input.err, .cadou-area.err, .cadou-check.err, .cadou-err');
          bad?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
      return;
    }
    setNudge(false);
    setStep((s) => Math.min(3, s + 1));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** „Începe o manea nouă" — aruncă snapshotul și repornește de la pasul 1.
   *  Fără el, clientul care a plătit deja rămâne blocat pe comanda veche. */
  const startFresh = () => {
    clearCadouWizard();
    setData({ ...EMPTY_CADOU, email: session.email || '' });
    setGenerationId(null);
    setPromo(null);
    setPromoDraft('');
    setPromoError(null);
    setError(null);
    setNudge(false);
    setStep(0);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Are ceva de aruncat? (comandă în curs / date completate)
  const hasDraft = !!generationId || step > 0 || !!data.style || !!data.msg.trim() || !!data.name.trim();

  const promoFailText = (reason?: string): string => {
    if (reason === 'expired') return t('promoExpired');
    if (reason === 'not_yet_valid') return t('promoNotYetValid');
    if (reason === 'used_up') return t('promoUsedUp');
    if (reason === 'wrong_email') return t('promoWrongEmail');
    if (reason === 'empty') return t('promoEmpty');
    return t('promoUnknown');
  };

  useEffect(() => {
    // Așteptăm pachetele: `validatePromo` calculează reducerea pe baza prețului
    // trimis, iar o cifră din cod ar da alt discount decât cel real.
    if (promo || followPromoTried.current || !packages.loaded || !currentPrice) return;
    (async () => {
      let code: string | null = null;
      try {
        code = window.localStorage.getItem('mc_follow_promo');
      } catch {
        code = null;
      }
      if (!code) {
        try {
          const me = await api.guestMe();
          code = me.followPromoCode ?? null;
          if (code) {
            try { window.localStorage.setItem('mc_follow_promo', code); } catch { /* */ }
          }
        } catch {
          return;
        }
      }
      if (!code) {
        followPromoTried.current = true;
        return;
      }
      try {
        const r = await api.validatePromo(code, data.email || undefined, currentPrice);
        if (r.ok) {
          followPromoTried.current = true;
          setPromo({ code, discountCents: r.appliedDiscountCents ?? 0 });
          setPromoDraft(code);
          return;
        }
        if (r.reason !== 'wrong_email') followPromoTried.current = true;
      } catch {
        followPromoTried.current = true;
      }
    })();
  }, [promo, packages.loaded, currentPrice, data.email]);

  const applyPromo = async () => {
    const code = promoDraft.trim();
    if (!code) {
      setPromoError(promoFailText('empty'));
      return;
    }
    try {
      const r = await api.validatePromo(code, data.email || undefined, currentPrice);
      if (!r.ok) {
        setPromoError(promoFailText(r.reason));
        setPromo(null);
        return;
      }
      setPromo({ code, discountCents: r.appliedDiscountCents ?? 0 });
      setPromoError(null);
    } catch {
      setPromoError(t('promoCheckFailed'));
    }
  };

  const pay = async () => {
    if (!stepValid(2) && !stepValid(3)) {
      setNudge(true);
      return;
    }
    const candidate = data.email.trim().toLowerCase();
    setSubmitting(true);
    setError(null);
    try {
      await ensureGuestSession();
      if (!session.email) {
        await api.setGuestEmail(candidate);
        await session.refresh();
        try {
          track('CompleteRegistration', {
            email: candidate,
            content_name: 'guest_email_provided',
            custom_data: { source: 'generator_payfirst' },
          });
        } catch { /* silent */ }
      }
      const payload = {
        style: data.style,
        occasion: data.occ || 'altul',
        recipientName: data.noDedic ? '—' : data.name.trim(),
        message: data.msg.trim(),
        dedication: data.fromName.trim() || undefined,
        voiceArtist: (data.voice || 'male') as 'male' | 'female',
        customLyrics: data.useCustomLyrics ? data.customLyrics : undefined,
        packageTier: data.packageTier,
      };
      // Valoarea raportată pixelurilor = prețul pachetului ALES (același din
      // care se calculează și suma taxată), nu prețul legacy din admin.
      track('InitiateCheckout', {
        content_id: generationId ?? 'pay-first',
        content_name: 'Manea Cadou',
        content_type: 'product',
        value: currentPrice / 100,
        currency: site.currency,
        // event_id stabil pe generație — dacă userul apasă de 2x, Meta dedup-uiește.
        event_id: generationId ? `init-${generationId}` : undefined,
      });
      let url: string;
      let paidGenId = generationId;
      if (generationId) {
        const r = await api.createCheckoutSession({
          generationId,
          packageTier: data.packageTier,
          promoCode: promo?.code,
          email: candidate,
        });
        url = r.url;
      } else {
        const r = await api.createDirectCheckoutSession({
          generation: payload,
          promoCode: promo?.code,
          email: candidate,
        });
        paidGenId = r.generationId;
        setGenerationId(r.generationId);
        url = r.url;
      }
      saveCadouWizard({ step: 3, data, generationId: paidGenId, at: Date.now() });
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? t('errPaymentsUnavailable')
          : e instanceof ApiError && /guest session/i.test(e.message)
            ? t('errSessionExpired')
            : t('errCheckout'),
      );
      setSubmitting(false);
    }
  };

  /** Ce primește clientul după plată — citit din pachetul rezolvat (admin), nu
   *  din if-uri pe numele tier-ului. */
  const afterPayNotes = (): string[] => {
    if (!currentPack) return [];
    const remakes = currentPack.remakes ?? 0;
    const lines: string[] = [];
    if (remakes === 1) lines.push(t('afterPayRemakeOne'));
    else if (remakes > 1) lines.push(t('afterPayRemakeMany', { count: String(remakes) }));
    if (currentPack.collage) {
      lines.push(
        currentPack.collageFullTrack
          ? t('afterPayCollageFull', { photos: String(currentPack.collagePhotoLimit ?? 0) })
          : t('afterPayCollage', { photos: String(currentPack.collagePhotoLimit ?? 0) }),
      );
    }
    if (currentPack.greetingCard) lines.push(t('afterPayCard'));
    if (currentPack.socialPost) lines.push(t('afterPaySocial'));
    return lines;
  };

  const styleName = styles.find((s) => s.id === data.style)?.nm ?? data.style;
  const occName = occasions.find((o) => o.id === data.occ)?.nm ?? data.occ;
  const voiceName = voices.find((v) => v.id === data.voice)?.nm ?? data.voice;

  return (
    <CadouShell>
      <div className="cadou-wrap">
        <div className="cadou-panel cadou-wizard-head" data-step={step}>
          <div className="cadou-hero-mini">
            <h1>{t('title')}</h1>
            <p>{t('lead')}</p>
            <div className="cadou-offer">
              <div className="cadou-offer-badge">
                {discountPct > 0 ? t('offerBadgeDiscount', { pct: String(discountPct) }) : t('offerBadge')}
              </div>
              <div className="cadou-offer-price">
                {compareAt > 0 && <s>{formatPrice(site, compareAt)}</s>}
                {fromPrice !== null && <strong>{formatPrice(site, fromPrice)}</strong>}
              </div>
              <div className="cadou-offer-trust">{t('offerTrust')}</div>
            </div>
          </div>
          <div className="cadou-stepper">
            {STEP_KEYS.map((key, i) => (
              <button
                key={key}
                type="button"
                className={i === step ? 'on' : i < step ? 'done' : ''}
                onClick={() => { if (i <= step) goto(i); }}
              >
                <span className="dot">{i < step ? '✓' : i + 1}</span>
                <span>{t(key)}</span>
              </button>
            ))}
          </div>
          {hasDraft && (
            <button type="button" className="cadou-wizard-fresh" onClick={startFresh}>
              {t('startFresh')}
            </button>
          )}
        </div>

        <div className="cadou-panel cadou-wizard-body">

        {step === 0 && (
          <>
            <div className="cadou-kicker" style={{ textAlign: 'center', marginBottom: 12 }}>{t('styleKicker')}</div>
            {point(
              nudge && !data.style,
              <div className="cadou-grid">
                {styles.map((s) => (
                  <CadouStyleCard
                    key={s.id}
                    style={s}
                    selected={data.style === s.id}
                    onSelect={() => upd('style', s.id)}
                    playing={stylePreview.playing === `style-${s.id}`}
                    onTogglePlay={() => {
                      upd('style', s.id);
                      stylePreview.toggle(s.id);
                    }}
                  />
                ))}
              </div>,
              'grid',
            )}
            {nudge && !data.style && <CadouErr>{t('errStyle')}</CadouErr>}
          </>
        )}

        {step === 1 && (
          <div className="cadou-form">
            <div>
              <div className="cadou-label">{t('storyLabel')}</div>
              <div className="cadou-chips stories" style={{ marginTop: 10 }}>
                {stories.map((st) => (
                  <button
                    key={st.label}
                    type="button"
                    className={`cadou-chip${data.msg === st.msg ? ' on' : ''}`}
                    onClick={() => {
                      setData((d) => ({
                        ...d,
                        msg: st.msg,
                        occ: st.occ && occasions.some((o) => o.id === st.occ) ? st.occ : d.occ,
                      }));
                    }}
                  >
                    <span className="ico" aria-hidden>{st.em}</span>
                    <span>{st.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="cadou-label">{t('msgLabel')}</div>
              {point(
                nudge && !data.msg.trim(),
                <textarea
                  className={`cadou-area${nudge && !data.msg.trim() ? ' err' : ''}`}
                  value={data.msg}
                  onChange={(e) => upd('msg', e.target.value)}
                  placeholder={t('msgPlaceholder')}
                  aria-invalid={nudge && !data.msg.trim()}
                />,
                'area',
              )}
              {nudge && !data.msg.trim() && <CadouErr>{t('errMsg')}</CadouErr>}
            </div>
            <div className="cadou-from-to">
              <div>
                <div className="cadou-label">{t('fromLabel')}</div>
                {point(
                  nudge && !data.fromName.trim(),
                  <input
                    className={`cadou-input${nudge && !data.fromName.trim() ? ' err' : ''}`}
                    value={data.fromName}
                    onChange={(e) => upd('fromName', e.target.value)}
                    placeholder={t('fromPlaceholder')}
                    autoComplete="name"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    aria-invalid={nudge && !data.fromName.trim()}
                  />,
                )}
                {nudge && !data.fromName.trim() && <CadouErr>{t('errFrom')}</CadouErr>}
              </div>
              {!data.noDedic && (
                <div>
                  <div className="cadou-label">{t('toLabel')}</div>
                  {point(
                    nudge && !data.name.trim(),
                    <input
                      className={`cadou-input${nudge && !data.name.trim() ? ' err' : ''}`}
                      value={data.name}
                      onChange={(e) => upd('name', e.target.value)}
                      placeholder={t('toPlaceholder')}
                      autoComplete="name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      aria-invalid={nudge && !data.name.trim()}
                    />,
                  )}
                  {nudge && !data.name.trim() && <CadouErr>{t('errTo')}</CadouErr>}
                </div>
              )}
            </div>
            <label className="cadou-check">
              <input type="checkbox" checked={data.noDedic} onChange={(e) => upd('noDedic', e.target.checked)} />
              {t('noDedication')}
            </label>
            <div>
              <div className="cadou-label">{t('occasionLabel')}</div>
              <div className="cadou-chips occasions" style={{ marginTop: 10 }}>
                {occasions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`cadou-chip tile${data.occ === o.id ? ' on' : ''}`}
                    onClick={() => upd('occ', data.occ === o.id ? '' : o.id)}
                  >
                    <span className="ico" aria-hidden>{o.em}</span>
                    <span>{o.nm}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="cadou-form">
            <div>
              <div className="cadou-label">{t('voiceLabel')}</div>
              {point(
                nudge && !data.voice,
                <div className="cadou-voices">
                  {voices.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`cadou-voice${data.voice === v.id ? ' on' : ''}${v.id === 'male' ? ' is-rec' : ''}`}
                      onClick={() => upd('voice', v.id === 'female' ? 'female' : 'male')}
                    >
                      {v.id === 'male' && <span className="cadou-voice-badge">{t('voiceRecommended')}</span>}
                      {v.av} {v.nm}
                    </button>
                  ))}
                </div>,
                'voice',
              )}
              {nudge && !data.voice && <CadouErr>{t('errVoice')}</CadouErr>}
            </div>
            <div>
              <div className="cadou-label">{t('packageLabel')}</div>
              <CadouPackGrid
                selected={data.packageTier}
                onSelect={(tier) => upd('packageTier', tier)}
              />
            </div>
            <label className="cadou-check">
              <input
                type="checkbox"
                checked={data.useCustomLyrics}
                onChange={(e) => upd('useCustomLyrics', e.target.checked)}
              />
              {t('customLyricsCheck')}
            </label>
            {data.useCustomLyrics && (
              <>
                {point(
                  nudge && !data.customLyrics.trim(),
                  <textarea
                    className={`cadou-area${nudge && !data.customLyrics.trim() ? ' err' : ''}`}
                    value={data.customLyrics}
                    onChange={(e) => upd('customLyrics', e.target.value)}
                    placeholder={t('customLyricsPlaceholder')}
                    aria-invalid={nudge && !data.customLyrics.trim()}
                  />,
                  'area',
                )}
                {nudge && !data.customLyrics.trim() && (
                  <CadouErr>{t('errCustomLyrics')}</CadouErr>
                )}
              </>
            )}
            <div>
              <div className="cadou-label">{t('emailLabel')}</div>
              {point(
                nudge && !emailOk(data.email),
                <input
                  className={`cadou-input${nudge && !emailOk(data.email) ? ' err' : ''}`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  enterKeyHint="next"
                  value={data.email}
                  onChange={(e) => upd('email', e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  aria-invalid={nudge && !emailOk(data.email)}
                />,
              )}
              <div className="cadou-hint">{t('emailHint')}</div>
              {nudge && !emailOk(data.email) && (
                <CadouErr>{t('errEmail')}</CadouErr>
              )}
            </div>
            <label className={`cadou-check${nudge && !data.privacy ? ' err' : ''}`}>
              <span className="cadou-check-box">
                <input type="checkbox" checked={data.privacy} onChange={(e) => upd('privacy', e.target.checked)} />
                {nudge && !data.privacy && <CadouTapHand key={errPulse} />}
              </span>
              {t('privacy')}
            </label>
            {nudge && !data.privacy && (
              <CadouErr>{t('errPrivacy')}</CadouErr>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="cadou-form">
            {error && (
              <div className="cadou-pay-warn" role="alert">{error}</div>
            )}
            <h2 className="cadou-pay-title">
              {data.noDedic
                ? t.rich('payTitleSelf', { em: (chunks) => <em>{chunks}</em> })
                : t.rich('payTitleFor', { em: (chunks) => <em>{chunks}</em>, name: data.name })}
            </h2>
            <div className="cadou-recap">
              {([
                [t('recapStyle'), styleName, 0],
                [t('recapFrom'), data.fromName || '—', 1],
                [t('recapTo'), data.noDedic ? t('recapNoDedication') : data.name, 1],
                [t('recapOccasion'), occName || '—', 1],
                [t('recapPackage'), currentPack?.label ?? data.packageTier, 2],
                [t('recapVoice'), voiceName, 2],
                [t('recapEmail'), data.email, 2],
              ] as const).map(([k, v, jump]) => (
                <div key={k} className="cadou-recap-row">
                  <span><b>{k}</b> · {v}</span>
                  <button type="button" className="cadou-ghost" onClick={() => goto(jump)}>{t('recapEdit')}</button>
                </div>
              ))}
            </div>
            <div>
              <div className="cadou-label">{t('promoLabel')}</div>
              <div className="cadou-row">
                <input
                  className={`cadou-input${promoError ? ' err' : ''}`}
                  value={promoDraft}
                  onChange={(e) => {
                    setPromoDraft(e.target.value);
                    if (promoError) setPromoError(null);
                  }}
                  placeholder={t('promoPlaceholder')}
                  autoCapitalize="characters"
                  aria-invalid={!!promoError}
                />
                <button type="button" className="cadou-cta" onClick={applyPromo}>{t('promoApply')}</button>
              </div>
              {promoError && <p className="cadou-promo-err" role="alert">{promoError}</p>}
              {promo && (
                <div className="cadou-promo-ok">
                  <span className="cadou-promo-ok-mark" aria-hidden>✓</span>
                  <span>{t.rich('promoApplied', { b: (chunks) => <b>{chunks}</b>, code: promo.code })}</span>
                  <span className="cadou-promo-ok-save">−{formatPrice(site, promo.discountCents)}</span>
                </div>
              )}
            </div>
            <div className="cadou-afterpay">
              {afterPayNotes().map((line, i) => (
                <p key={line} className={i === 0 ? 'lead' : undefined}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {error && step !== 3 && <CadouErr>{error}</CadouErr>}

        <div className="cadou-wizard-nav">
          {step > 0 && (
            <button type="button" className="cadou-nav-back" onClick={() => goto(step - 1)}>{t('back')}</button>
          )}
          {step < 3 ? (
            <button type="button" className="cadou-cta" onClick={next}>{t('next')}</button>
          ) : (
            <button
              type="button"
              className="cadou-cta"
              onClick={pay}
              /* Fără pachet rezolvat n-avem preț: butonul ar zice „Plătește 0,00". */
              disabled={submitting || !currentPack}
            >
              {submitting || !currentPack
                ? t('payBusy')
                : t('pay', { price: formatPrice(site, afterPromo) })}
            </button>
          )}
        </div>
        </div>
      </div>
    </CadouShell>
  );
}

export default function CadouWizardPage() {
  return (
    <Suspense fallback={null}>
      <WizardInner />
    </Suspense>
  );
}
