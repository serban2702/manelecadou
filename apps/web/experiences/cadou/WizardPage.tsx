'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError, ensureGuestSession } from '@/lib/api';
import { useSession } from '@/lib/providers';
import { useSite } from '@/lib/site-context';
import { formatPrice } from '@/lib/site-shared';
import { OCC, STYLES, VOICES } from '@/lib/seed-data';
import { PACKAGES, type PackageTier } from '@/lib/packages';
import { CadouShell } from './Shell';
import {
  EMPTY_CADOU,
  clearCadouWizard,
  readCadouWizard,
  saveCadouWizard,
  type CadouWizardData,
} from './wizard-storage';

const STEPS = ['Stil', 'Detalii', 'Extra', 'Plată'] as const;

const STORIES = [
  { label: 'Pentru iubitul meu ❤️', msg: 'O manea de iubire în care vreau să-i mulțumesc că e mereu lângă mine și să-i spun cât înseamnă pentru mine.' },
  { label: 'Pentru iubita mea 💕', msg: 'Vreau o manea romantică în care să-i spun că e totul pentru mine și că nu o schimb pe nimeni.' },
  { label: 'Pentru soțul meu 💍', msg: 'O manea de mulțumire pentru soțul meu, pentru tot ce construim împreună.' },
  { label: 'Pentru soția mea 👰', msg: 'O manea de suflet pentru soția mea, cu recunoștință și iubire.' },
  { label: 'Pentru un prieten 🥂', msg: 'O manea de petrecere pentru cel mai bun prieten, să râdem și să ridicăm paharul.' },
];

function emailOk(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function WizardInner() {
  const site = useSite();
  const session = useSession();
  const search = useSearchParams();
  const styles = site.styles?.length ? site.styles : STYLES;
  const occasions = site.occasions?.length ? site.occasions : OCC;
  const voices = site.voices?.length ? site.voices : VOICES;

  const [step, setStep] = useState(0);
  const [data, setData] = useState<CadouWizardData>(EMPTY_CADOU);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lyrics, setLyrics] = useState<string>('');
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [promoDraft, setPromoDraft] = useState('');
  const [promo, setPromo] = useState<{ code: string; discountCents: number } | null>(null);
  const [quotes, setQuotes] = useState<Partial<Record<PackageTier, { total: number; compareAtCents?: number | null }>>>({});
  const restored = useRef(false);

  const upd = <K extends keyof CadouWizardData>(k: K, v: CadouWizardData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const fromUrlStyle = search.get('style');
    const fromUrlStep = Number(search.get('step') || '0');
    const snap = readCadouWizard();
    if (snap) {
      setData({ ...EMPTY_CADOU, ...snap.data, ...(fromUrlStyle ? { style: fromUrlStyle } : {}) });
      if (snap.generationId) setGenerationId(snap.generationId);
      const s = search.get('paymentCanceled') === '1' ? 3 : Math.min(3, Math.max(0, snap.step));
      setStep(Number.isFinite(fromUrlStep) && fromUrlStep >= 1 ? Math.min(3, fromUrlStep - 1) : s);
      return;
    }
    if (fromUrlStyle) setData((d) => ({ ...d, style: fromUrlStyle }));
    if (fromUrlStep >= 1 && fromUrlStep <= 4) setStep(fromUrlStep - 1);
  }, [search]);

  useEffect(() => {
    if (!session.email || data.email) return;
    setData((d) => (d.email ? d : { ...d, email: session.email || '' }));
  }, [session.email, data.email]);

  useEffect(() => {
    saveCadouWizard({ step, data, generationId, at: Date.now() });
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('step', String(step + 1));
      if (data.style) url.searchParams.set('style', data.style);
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

  const lyricsStarted = useRef(false);
  useEffect(() => {
    if (step !== 3) return;
    if (data.useCustomLyrics && data.customLyrics.trim()) {
      setLyrics(data.customLyrics);
      return;
    }
    if (lyrics || lyricsStarted.current) return;
    lyricsStarted.current = true;
    setLyricsLoading(true);
    api.generateLyrics({
      style: data.style,
      occasion: data.occ || 'altul',
      recipientName: data.noDedic ? 'nimeni' : data.name,
      message: [data.msg, data.about].filter(Boolean).join('\n'),
      dedication: data.noDedic ? undefined : data.name,
      voiceArtist: data.voice || 'male',
    }).then((r) => setLyrics(r.lyrics)).catch(() => setLyrics('')).finally(() => setLyricsLoading(false));
  }, [step, data, lyrics]);

  const expPacks = site.experienceConfig?.items?.cadou?.packages;
  const packCards = useMemo(() => PACKAGES.map((p) => {
    const override = expPacks?.[p.tier];
    const q = quotes[p.tier];
    return {
      tier: p.tier,
      name: p.tier === 'basic' ? 'Standard' : p.nameRO.replace('Pachet ', ''),
      features: override?.features?.length ? override.features : p.features,
      price: q?.total ?? p.priceCents,
      compare: q?.compareAtCents ?? null,
      recommended: p.recommended,
    };
  }), [expPacks, quotes]);

  const currentPrice = packCards.find((p) => p.tier === data.packageTier)?.price ?? site.basePriceCents;
  const afterPromo = Math.max(0, currentPrice - (promo?.discountCents ?? 0));

  const stepValid = (s: number): boolean => {
    if (s === 0) return !!data.style;
    if (s === 1) return !!data.msg.trim() && (data.noDedic || !!data.name.trim());
    if (s === 2) {
      return !!data.voice && emailOk(data.email) && data.privacy && (!data.useCustomLyrics || !!data.customLyrics.trim());
    }
    return true;
  };

  const goto = (s: number) => {
    setNudge(false);
    setError(null);
    setStep(s);
  };

  const next = () => {
    if (!stepValid(step)) {
      setNudge(true);
      return;
    }
    setNudge(false);
    setStep((s) => Math.min(3, s + 1));
  };

  const applyPromo = async () => {
    const code = promoDraft.trim();
    if (!code) return;
    try {
      const r = await api.validatePromo(code, data.email || undefined, currentPrice);
      if (!r.ok) {
        setError(r.reason || 'Cod invalid');
        setPromo(null);
        return;
      }
      setPromo({ code, discountCents: r.appliedDiscountCents ?? 0 });
      setError(null);
    } catch {
      setError('Nu am putut valida codul');
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
        message: [data.msg.trim(), data.about.trim()].filter(Boolean).join('\n'),
        dedication: data.noDedic ? undefined : data.name.trim(),
        voiceArtist: (data.voice || 'male') as 'male' | 'female',
        customLyrics: data.useCustomLyrics ? data.customLyrics : (lyrics || undefined),
        packageTier: data.packageTier,
      };
      let url: string;
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
        setGenerationId(r.generationId);
        url = r.url;
      }
      clearCadouWizard();
      window.location.href = url;
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 503
          ? 'Plățile sunt temporar indisponibile. Încearcă în câteva minute.'
          : e instanceof ApiError
            ? e.message
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
        <div className="cadou-hero" style={{ paddingBottom: 4 }}>
          <h1>Creează maneaua ta</h1>
          <p>Alege stilul, adaugă detaliile și noi creăm muzica.</p>
          <div style={{ fontSize: 14 }}>
            <span className="cadou-price-now">de la {formatPrice(site, quotes.basic?.total ?? site.basePriceCents)}</span>
            <span style={{ marginLeft: 8, color: 'var(--cadou-muted)' }}>· 100% satisfacție garantată</span>
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

        {step === 0 && (
          <>
            <div className="cadou-kicker">Alege stilul muzical</div>
            <div className="cadou-grid">
              {styles.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="cadou-style"
                  onClick={() => upd('style', s.id)}
                  style={data.style === s.id ? { boxShadow: '0 0 0 2px var(--cadou-gold)' } : undefined}
                >
                  <span className="em">{s.em}</span>
                  <span className="nm">{s.nm}{data.style === s.id ? ' ✓' : ''}</span>
                </button>
              ))}
            </div>
            {nudge && !data.style && <p className="cadou-err">Alege un stil ca să continui.</p>}
          </>
        )}

        {step === 1 && (
          <div className="cadou-form">
            <div>
              <div className="cadou-label">Alege o poveste</div>
              <div className="cadou-chips" style={{ marginTop: 8 }}>
                {STORIES.map((st) => (
                  <button key={st.label} type="button" className="cadou-chip" onClick={() => upd('msg', st.msg)}>
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="cadou-label">Ce vrei să menționăm în melodie</div>
              <textarea
                className="cadou-area"
                value={data.msg}
                onChange={(e) => upd('msg', e.target.value)}
                placeholder="Despre ce vrei să fie maneaua ta?"
              />
              {nudge && !data.msg.trim() && <p className="cadou-err">Scrie câteva cuvinte despre poveste.</p>}
            </div>
            <label className="cadou-check">
              <input type="checkbox" checked={data.noDedic} onChange={(e) => upd('noDedic', e.target.checked)} />
              Nu dedic nimănui — vreau doar maneaua
            </label>
            {!data.noDedic && (
              <div>
                <div className="cadou-label">Cui dedici melodia</div>
                <input
                  className="cadou-input"
                  value={data.name}
                  onChange={(e) => upd('name', e.target.value)}
                  placeholder="Ex.: Ionuț, Maria…"
                />
                {nudge && !data.name.trim() && <p className="cadou-err">Spune-ne numele destinatarului.</p>}
              </div>
            )}
            <div>
              <div className="cadou-label">Spune-ne mai multe despre destinatar</div>
              <textarea
                className="cadou-area"
                value={data.about}
                onChange={(e) => upd('about', e.target.value)}
                placeholder="1-2 propoziții: cum v-ați cunoscut, ce îi place, un moment anume…"
              />
            </div>
            <div>
              <div className="cadou-label">Ocazia (opțional)</div>
              <div className="cadou-chips" style={{ marginTop: 8 }}>
                {occasions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`cadou-chip${data.occ === o.id ? ' on' : ''}`}
                    onClick={() => upd('occ', data.occ === o.id ? '' : o.id)}
                  >
                    {o.em} {o.nm}
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
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                {voices.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`cadou-voice${data.voice === v.id ? ' on' : ''}`}
                    onClick={() => upd('voice', v.id === 'female' ? 'female' : 'male')}
                  >
                    {v.av} {v.nm}
                  </button>
                ))}
              </div>
              {nudge && !data.voice && <p className="cadou-err">Alege vocea.</p>}
            </div>
            <div>
              <div className="cadou-label">Pachet</div>
              <div className="cadou-packs" style={{ marginTop: 8 }}>
                {packCards.map((p) => (
                  <button
                    key={p.tier}
                    type="button"
                    className={`cadou-pack${data.packageTier === p.tier ? ' rec' : ''}`}
                    onClick={() => upd('packageTier', p.tier)}
                    style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit' }}
                  >
                    {p.recommended && <div className="cadou-kicker" style={{ textAlign: 'left' }}>Recomandat</div>}
                    <h3 style={{ margin: '6px 0' }}>{p.name}</h3>
                    <div>
                      {p.compare && p.compare > p.price && (
                        <span className="cadou-price-cut">{formatPrice(site, p.compare)}</span>
                      )}
                      <span className="cadou-price-now">{formatPrice(site, p.price)}</span>
                    </div>
                    <ul style={{ paddingLeft: 18, color: 'var(--cadou-muted)', fontSize: 13 }}>
                      {p.features.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                  </button>
                ))}
              </div>
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
              <textarea
                className="cadou-area"
                value={data.customLyrics}
                onChange={(e) => upd('customLyrics', e.target.value)}
                placeholder="Scrie versurile tale…"
              />
            )}
            <div>
              <div className="cadou-label">Emailul tău *</div>
              <input
                className="cadou-input"
                type="email"
                value={data.email}
                onChange={(e) => upd('email', e.target.value)}
                placeholder="email@exemplu.ro"
              />
              <div className="cadou-hint">Te anunțăm când maneaua e gata. Fără spam.</div>
              {nudge && !emailOk(data.email) && <p className="cadou-err">Introdu un email valid.</p>}
            </div>
            <label className="cadou-check">
              <input type="checkbox" checked={data.privacy} onChange={(e) => upd('privacy', e.target.checked)} />
              Sunt de acord cu politica de confidențialitate și să primesc emailuri despre comandă.
            </label>
            {nudge && !data.privacy && <p className="cadou-err">Trebuie să fii de acord ca să continui.</p>}
          </div>
        )}

        {step === 3 && (
          <div className="cadou-form">
            <div className="cadou-kicker">Pasul 4 din 4</div>
            <h2 style={{ textAlign: 'center', margin: 0 }}>Maneaua {data.noDedic ? 'ta' : `pentru ${data.name}`}</h2>
            <div className="cadou-recap">
              {([
                ['Genul', styleName, 0],
                ['Pentru', data.noDedic ? 'fără dedicație' : data.name, 1],
                ['Ocazia', occName || '—', 1],
                ['Pachet', packCards.find((p) => p.tier === data.packageTier)?.name ?? data.packageTier, 2],
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
              <div className="cadou-label">Versurile manelei tale</div>
              {lyricsLoading && <p className="cadou-hint">Compunem versurile pentru maneaua ta…</p>}
              {!lyricsLoading && lyrics && <div className="cadou-lyrics">{lyrics}</div>}
              {!lyricsLoading && !lyrics && <p className="cadou-hint">Versurile apar după plată, dacă generarea din preview nu e disponibilă.</p>}
            </div>
            <div>
              <div className="cadou-label">Cod de reducere</div>
              <div className="cadou-row">
                <input className="cadou-input" value={promoDraft} onChange={(e) => setPromoDraft(e.target.value)} placeholder="PROMO" />
                <button type="button" className="cadou-cta" onClick={applyPromo}>Aplică</button>
              </div>
              {promo && <p className="cadou-hint">Aplicat {promo.code} (−{formatPrice(site, promo.discountCents)})</p>}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="cadou-price-now" style={{ fontSize: 28 }}>{formatPrice(site, afterPromo)}</div>
              <p className="cadou-hint">Satisfacție garantată · regenerări gratuite dacă nu-ți place</p>
            </div>
          </div>
        )}

        {error && <p className="cadou-err" style={{ textAlign: 'center' }}>{error}</p>}

        <div className="cadou-row" style={{ marginTop: 24, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
          {step > 0 ? (
            <button type="button" className="cadou-ghost" onClick={() => goto(step - 1)}>← Înapoi</button>
          ) : <span />}
          {step < 3 ? (
            <button type="button" className="cadou-cta" onClick={next}>Pasul următor →</button>
          ) : (
            <button type="button" className="cadou-cta" onClick={pay} disabled={submitting}>
              {submitting ? 'Se deschide plata…' : `Plătește ${formatPrice(site, afterPromo)} →`}
            </button>
          )}
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
