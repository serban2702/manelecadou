'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError, ensureGuestSession, type GenerationDto } from '@/lib/api';
import { useSession } from '@/lib/providers';
import { useSite } from '@/lib/site-context';
import { formatPrice } from '@/lib/site-shared';
import { OCC, VOICES } from '@/lib/seed-data';
import { useExperienceCatalog } from '../use-experience-catalog';
import { PACKAGES, type PackageTier } from '@/lib/packages';
import { CadouShell } from './Shell';
import { CadouPackGrid } from './PackCard';
import { CadouStyleCard, useCadouStylePreview } from './StyleCard';
import {
  EMPTY_CADOU,
  readCadouWizard,
  saveCadouWizard,
  type CadouWizardData,
} from './wizard-storage';
import { defaultStoryForStyle, isPresetStoryMsg, storiesForStyle } from './stories';

const STEPS = ['Stil', 'Detalii', 'Extra', 'Plată'] as const;

function emailOk(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function wizardFromGeneration(g: GenerationDto): CadouWizardData {
  const rec = (g.recipientName ?? '').trim();
  const noDedic = !rec || rec === '—';
  const fromLine = g.message?.match(/(?:^|\n)\s*De la\s+(.+?)\s*$/im);
  const fromName = (
    (g.dedication && g.dedication !== rec ? g.dedication : '') ||
    fromLine?.[1]?.trim() ||
    ''
  );
  const msg = (g.message ?? '').replace(/(?:^|\n)\s*De la\s+.+\s*$/im, '').trim();
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

function afterPayNotes(tier: PackageTier): string[] {
  const remakes = tier === 'premium' ? 3 : tier === 'plus' ? 2 : 1;
  const remakeLabel = remakes === 1 ? 'o refacere gratuită' : `${remakes} refaceri gratuite`;
  const lines = [
    `După plată vom genera maneaua și dacă doriți vreo modificare, beneficiați de ${remakeLabel}.`,
  ];
  if (tier === 'plus' || tier === 'premium') {
    lines.push('Colajul cu imagini se va face după generarea manelei.');
  }
  if (tier === 'premium') {
    lines.push('Felicitarea personalizată se face după generarea manelei.');
    lines.push('Postarea pe Facebook și TikTok, cu dedicație, se face după ce maneaua e gata.');
  }
  return lines;
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
  const [quotes, setQuotes] = useState<Partial<Record<PackageTier, { total: number; compareAtCents?: number | null }>>>({});
  const restored = useRef(false);
  const hydrated = useRef(false);

  const point = (on: boolean, children: ReactNode, kind: 'field' | 'area' | 'grid' | 'voice' = 'field') => (
    <div className={`cadou-field cadou-field-${kind}`}>
      {children}
      {on ? <CadouTapHand key={errPulse} /> : null}
    </div>
  );

  const stories = useMemo(() => storiesForStyle(data.style), [data.style]);

  useEffect(() => {
    if (step !== 0) stylePreview.stop();
  }, [step, stylePreview.stop]);

  useEffect(() => {
    if (!restored.current) return;
    if (step !== 1 || !data.style) return;
    const list = storiesForStyle(data.style);
    const preset = defaultStoryForStyle(data.style);
    const occOk = (id?: string) => !!id && occasions.some((o) => o.id === id);
    setData((d) => {
      if (list.some((s) => s.msg === d.msg)) return d;
      if (d.msg.trim() && !isPresetStoryMsg(d.msg)) return d;
      return {
        ...d,
        msg: preset.msg,
        occ: occOk(preset.occ) ? preset.occ! : d.occ,
      };
    });
  }, [step, data.style, occasions]);

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
            setData((d) => ({ ...wizardFromGeneration(g), email: d.email }));
            setGenerationId(g.id);
            setStep(3);
            setError('Plata nu a putut fi efectuată. Comanda e salvată — poți încerca din nou.');
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
            setError('Plata nu a putut fi efectuată. Comanda e salvată — poți încerca din nou.');
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
      if (canceled) setError('Plata nu a putut fi efectuată. Comanda e salvată — poți încerca din nou.');
      hydrated.current = true;
      return;
    }
    if (fromUrlStyle) setData((d) => ({ ...d, style: fromUrlStyle }));
    if (fromUrlStep >= 1 && fromUrlStep <= 4) setStep(fromUrlStep - 1);
    hydrated.current = true;
  }, [search]);

  useEffect(() => {
    if (!session.email || data.email) return;
    setData((d) => (d.email ? d : { ...d, email: session.email || '' }));
  }, [session.email, data.email]);

  useEffect(() => {
    if (!hydrated.current) return;
    saveCadouWizard({ step, data, generationId, at: Date.now() });
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('step', String(step + 1));
      if (data.style) url.searchParams.set('style', data.style);
      url.searchParams.delete('paymentCanceled');
      url.searchParams.delete('genId');
      window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`);
    }
  }, [step, data, generationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: typeof quotes = {};
      for (const tier of ['basic', 'plus', 'premium'] as PackageTier[]) {
        try {
          const q = await api.priceQuote(tier);
          next[tier] = { total: q.total, compareAtCents: q.compareAtCents };
        } catch {
          const fallback = PACKAGES.find((p) => p.tier === tier);
          if (fallback) next[tier] = { total: fallback.priceCents };
        }
      }
      if (!cancelled) setQuotes(next);
    })();
    return () => { cancelled = true; };
  }, []);

  const currentPrice = (PACKAGES.find((p) => p.tier === data.packageTier)?.priceCents
    ?? quotes[data.packageTier]?.total
    ?? site.basePriceCents);
  const afterPromo = Math.max(0, currentPrice - (promo?.discountCents ?? 0));
  const fromPrice = quotes.basic?.total ?? site.basePriceCents;
  const quotedCompare = (quotes.basic?.compareAtCents && quotes.basic.compareAtCents > fromPrice)
    ? quotes.basic.compareAtCents
    : (site.standardPriceCents && site.standardPriceCents > fromPrice ? site.standardPriceCents : 0);
  const compareAt = quotedCompare || fromPrice * 2;
  const discountPct = compareAt > fromPrice ? Math.round((1 - fromPrice / compareAt) * 100) : 50;

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
      const bad = document.querySelector('.cadou-input.err, .cadou-area.err, .cadou-check.err, .cadou-err');
      if (bad) bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setNudge(false);
    setStep((s) => Math.min(3, s + 1));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const promoFailText = (reason?: string): string => {
    if (reason === 'expired') return 'Codul a expirat.';
    if (reason === 'not_yet_valid') return 'Codul nu e încă activ.';
    if (reason === 'used_up') return 'Codul nu mai poate fi folosit.';
    if (reason === 'wrong_email') return 'Codul e valabil doar pentru alt email.';
    if (reason === 'empty') return 'Introdu un cod de reducere.';
    return 'Nu recunoaștem acest cod. Verifică-l și încearcă din nou.';
  };

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
      setPromoError('Nu am putut verifica codul. Încearcă din nou.');
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
          ? 'Plățile sunt temporar indisponibile. Încearcă în câteva minute.'
          : e instanceof ApiError && /guest session/i.test(e.message)
            ? 'Sesiunea a expirat. Reîncearcă plata.'
            : 'Nu am putut deschide plata. Verifică emailul și încearcă din nou.',
      );
      setSubmitting(false);
    }
  };

  const styleName = styles.find((s) => s.id === data.style)?.nm ?? data.style;
  const occName = occasions.find((o) => o.id === data.occ)?.nm ?? data.occ;
  const voiceName = voices.find((v) => v.id === data.voice)?.nm ?? data.voice;

  return (
    <CadouShell>
      <div className="cadou-wrap">
        <div className="cadou-panel cadou-wizard-head" data-step={step}>
          <div className="cadou-hero-mini">
            <h1>Creează maneaua ta</h1>
            <p>Alege stilul, adaugă detaliile și noi creăm muzica.</p>
            <div className="cadou-offer">
              <div className="cadou-offer-badge">🎁 1+1 GRATIS{discountPct > 0 ? ` · ${discountPct}% REDUCERE` : ''}</div>
              <div className="cadou-offer-price">
                {compareAt > 0 && <s>{formatPrice(site, compareAt)}</s>}
                <strong>{formatPrice(site, fromPrice)}</strong>
              </div>
              <div className="cadou-offer-trust">★ 4,9/5 din peste 10.000 recenzii · ♪ 100.000+ melodii create</div>
            </div>
          </div>
          <div className="cadou-stepper">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                className={i === step ? 'on' : i < step ? 'done' : ''}
                onClick={() => { if (i <= step) goto(i); }}
              >
                <span className="dot">{i < step ? '✓' : i + 1}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="cadou-panel cadou-wizard-body">

        {step === 0 && (
          <>
            <div className="cadou-kicker" style={{ textAlign: 'center', marginBottom: 12 }}>Alege stilul muzical</div>
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
            {nudge && !data.style && <CadouErr>Alege un stil muzical ca să continui.</CadouErr>}
          </>
        )}

        {step === 1 && (
          <div className="cadou-form">
            <div>
              <div className="cadou-label">Alege o poveste</div>
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
              <div className="cadou-label">Ce vrei să menționăm în melodie</div>
              {point(
                nudge && !data.msg.trim(),
                <textarea
                  className={`cadou-area${nudge && !data.msg.trim() ? ' err' : ''}`}
                  value={data.msg}
                  onChange={(e) => upd('msg', e.target.value)}
                  placeholder="Despre ce vrei să fie maneaua ta?"
                  aria-invalid={nudge && !data.msg.trim()}
                />,
                'area',
              )}
              {nudge && !data.msg.trim() && <CadouErr>Scrie în căsuța de mai sus despre ce vrei să fie maneaua.</CadouErr>}
            </div>
            <div className="cadou-from-to">
              <div>
                <div className="cadou-label">De la cine</div>
                {point(
                  nudge && !data.fromName.trim(),
                  <input
                    className={`cadou-input${nudge && !data.fromName.trim() ? ' err' : ''}`}
                    value={data.fromName}
                    onChange={(e) => upd('fromName', e.target.value)}
                    placeholder="Ex.: Mihai, familia…"
                    autoComplete="name"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    aria-invalid={nudge && !data.fromName.trim()}
                  />,
                )}
                {nudge && !data.fromName.trim() && <CadouErr>Completează câmpul „De la cine”.</CadouErr>}
              </div>
              {!data.noDedic && (
                <div>
                  <div className="cadou-label">Pentru cine</div>
                  {point(
                    nudge && !data.name.trim(),
                    <input
                      className={`cadou-input${nudge && !data.name.trim() ? ' err' : ''}`}
                      value={data.name}
                      onChange={(e) => upd('name', e.target.value)}
                      placeholder="Ex.: Ionuț, Maria…"
                      autoComplete="name"
                      autoCapitalize="words"
                      enterKeyHint="next"
                      aria-invalid={nudge && !data.name.trim()}
                    />,
                  )}
                  {nudge && !data.name.trim() && <CadouErr>Completează câmpul „Pentru cine”.</CadouErr>}
                </div>
              )}
            </div>
            <label className="cadou-check">
              <input type="checkbox" checked={data.noDedic} onChange={(e) => upd('noDedic', e.target.checked)} />
              Nu dedic nimănui — vreau doar maneaua
            </label>
            <div>
              <div className="cadou-label">Ocazia (opțional)</div>
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
              <div className="cadou-label">Voce</div>
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
                      {v.id === 'male' && <span className="cadou-voice-badge">Recomandat</span>}
                      {v.av} {v.nm}
                    </button>
                  ))}
                </div>,
                'voice',
              )}
              {nudge && !data.voice && <CadouErr>Alege vocea: bărbătească sau feminină.</CadouErr>}
            </div>
            <div>
              <div className="cadou-label">Pachet</div>
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
              Vreau să scriu propriile versuri
            </label>
            {data.useCustomLyrics && (
              <>
                {point(
                  nudge && !data.customLyrics.trim(),
                  <textarea
                    className={`cadou-area${nudge && !data.customLyrics.trim() ? ' err' : ''}`}
                    value={data.customLyrics}
                    onChange={(e) => upd('customLyrics', e.target.value)}
                    placeholder="Scrie versurile tale…"
                    aria-invalid={nudge && !data.customLyrics.trim()}
                  />,
                  'area',
                )}
                {nudge && !data.customLyrics.trim() && (
                  <CadouErr>Scrie versurile tale în căsuța de mai sus.</CadouErr>
                )}
              </>
            )}
            <div>
              <div className="cadou-label">Emailul tău *</div>
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
                  placeholder="email@exemplu.ro"
                  aria-invalid={nudge && !emailOk(data.email)}
                />,
              )}
              <div className="cadou-hint">Te anunțăm când maneaua e gata. Fără spam.</div>
              {nudge && !emailOk(data.email) && (
                <CadouErr>Introdu un email valid ca să-ți trimitem maneaua.</CadouErr>
              )}
            </div>
            <label className={`cadou-check${nudge && !data.privacy ? ' err' : ''}`}>
              <span className="cadou-check-box">
                <input type="checkbox" checked={data.privacy} onChange={(e) => upd('privacy', e.target.checked)} />
                {nudge && !data.privacy && <CadouTapHand key={errPulse} />}
              </span>
              Sunt de acord cu politica de confidențialitate și să primesc emailuri despre comandă.
            </label>
            {nudge && !data.privacy && (
              <CadouErr>Trebuie să bifezi căsuța de mai sus.</CadouErr>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="cadou-form">
            {error && (
              <div className="cadou-pay-warn" role="alert">{error}</div>
            )}
            <h2 className="cadou-pay-title">
              {data.noDedic ? (
                <>Maneaua <em>ta</em></>
              ) : (
                <>Maneaua pentru <em>{data.name}</em></>
              )}
            </h2>
            <div className="cadou-recap">
              {([
                ['Genul', styleName, 0],
                ['De la', data.fromName || '—', 1],
                ['Pentru', data.noDedic ? 'fără dedicație' : data.name, 1],
                ['Ocazia', occName || '—', 1],
                ['Pachet', PACKAGES.find((p) => p.tier === data.packageTier)?.nameRO ?? data.packageTier, 2],
                ['Voce', voiceName, 2],
                ['Email', data.email, 2],
              ] as const).map(([k, v, jump]) => (
                <div key={k} className="cadou-recap-row">
                  <span><b>{k}</b> · {v}</span>
                  <button type="button" className="cadou-ghost" onClick={() => goto(jump)}>Modifică</button>
                </div>
              ))}
            </div>
            <div>
              <div className="cadou-label">Cod de reducere</div>
              <div className="cadou-row">
                <input
                  className={`cadou-input${promoError ? ' err' : ''}`}
                  value={promoDraft}
                  onChange={(e) => {
                    setPromoDraft(e.target.value);
                    if (promoError) setPromoError(null);
                  }}
                  placeholder="PROMO"
                  autoCapitalize="characters"
                  aria-invalid={!!promoError}
                />
                <button type="button" className="cadou-cta" onClick={applyPromo}>Aplică</button>
              </div>
              {promoError && <p className="cadou-promo-err" role="alert">{promoError}</p>}
              {promo && (
                <div className="cadou-promo-ok">
                  <span className="cadou-promo-ok-mark" aria-hidden>✓</span>
                  <span>Cod <b>{promo.code}</b> aplicat</span>
                  <span className="cadou-promo-ok-save">−{formatPrice(site, promo.discountCents)}</span>
                </div>
              )}
            </div>
            <div className="cadou-afterpay">
              {afterPayNotes(data.packageTier).map((line, i) => (
                <p key={line} className={i === 0 ? 'lead' : undefined}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {error && step !== 3 && <CadouErr>{error}</CadouErr>}

        <div className="cadou-wizard-nav">
          {step > 0 && (
            <button type="button" className="cadou-nav-back" onClick={() => goto(step - 1)}>Înapoi</button>
          )}
          {step < 3 ? (
            <button type="button" className="cadou-cta" onClick={next}>Continuă</button>
          ) : (
            <button type="button" className="cadou-cta" onClick={pay} disabled={submitting}>
              {submitting ? 'Se deschide plata…' : `Plătește ${formatPrice(site, afterPromo)}`}
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
