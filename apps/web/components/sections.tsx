'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Ic } from './icons';
import { toast } from './Toaster';
import { ManeaPlayer } from './ManeaPlayer';
import { DEMOS, FEED as FEED_FALLBACK, TESTI, TOP, VOICES } from '@/lib/seed-data';
import { api } from '@/lib/api';
import { formatPrice, siteSupportEmail, siteUrl } from '@/lib/site-shared';
import { useSite } from '@/lib/site-context';
import { getLegalPath } from '@/lib/legal-slugs';
import { getPagePath } from '@/lib/page-slugs';
import { useExperienceCatalog } from '@/experiences/use-experience-catalog';
import { usePackages } from '@/experiences/use-packages';

export function Hero({ onGen, onListen }: { onGen: () => void; onListen: () => void }) {
  const t = useTranslations('hero');
  const tc = useTranslations('common');
  const site = useSite();
  // „de la X" = cel mai mic preț dintre pachetele ACTIVE, aceeași sursă ca
  // vitrina de tarife. `basePriceCents` (legacy) arăta altă cifră decât cardul.
  const { fromCents } = usePackages();
  return (
    <section className="hero">
      <div className="hero-flag">{t('flag')}</div>
      <h1>
        {t('titleA')} <span className="gold-text">{t('titleHl')}</span> {t('titleB')}
      </h1>
      <p className="sub">{t('sub')}</p>
      <div className="hero-actions">
        <button className="btn btn-gold btn-lg" onClick={onGen}>
          {fromCents !== null
            ? tc('ctaMakeManea', { price: formatPrice(site, fromCents) })
            : tc('ctaMakeManeaPlain')}
        </button>
        <button className="btn btn-ghost" onClick={onListen}><Ic.Play s={14} /> {tc('ctaListen')}</button>
      </div>
      <div className="hero-trust">
        <span>⭐ <span dangerouslySetInnerHTML={{ __html: t.raw('trustReviews') as string }} /></span>
        <span>🎤 <span dangerouslySetInnerHTML={{ __html: t.raw('trustCount') as string }} /></span>
        <span>⚡ <span dangerouslySetInnerHTML={{ __html: t.raw('trustSpeed') as string }} /></span>
      </div>
    </section>
  );
}

export function PriceStrip() {
  const t = useTranslations('price');
  const site = useSite();

  // Prețul afișat e al celui mai ieftin pachet ACTIV de pe interfața curentă —
  // exact ce vede clientul în grila de tarife și ce taxează Stripe. Câmpurile
  // legacy `basePriceCents` / `standardPriceCents` se editează în alt ecran din
  // admin și divergeau de carduri.
  const { items, loaded } = usePackages();
  const cheapest = items.reduce<(typeof items)[number] | null>(
    (best, p) => (p.priceCents > 0 && (!best || p.priceCents < best.priceCents) ? p : best),
    null,
  );

  if (!loaded || !cheapest) {
    return (
      <div className="price-strip" aria-hidden>
        <span className="badge">{t('badge')}</span>
        <div className="left">
          <div className="skel-line" style={{ width: 120, height: 26 }} />
        </div>
      </div>
    );
  }

  const baseCents = cheapest.priceCents;
  const standardCents =
    cheapest.compareAtCents && cheapest.compareAtCents > baseCents ? cheapest.compareAtCents : 0;
  const showStrike = standardCents > baseCents;

  const baseValue = baseCents / 100;
  const baseInt = Math.floor(baseValue);
  const baseFrac = Math.round((baseValue - baseInt) * 100)
    .toString()
    .padStart(2, '0');
  // Reducerea calculată din prețuri reale, nu hardcodată per locale — altfel
  // se afișează „-23%" chiar și când prețul a fost schimbat din admin.
  const discountPct = showStrike
    ? Math.round(((standardCents - baseCents) / standardCents) * 100)
    : 0;

  return (
    <div className="price-strip">
      <span className="badge">{t('badge')}</span>
      <div className="left">
        {showStrike && (
          <div className="strike">{formatPrice(site, standardCents)}</div>
        )}
        <div className="now gold-text">
          {baseInt}
          <span style={{ fontSize: 18 }}>,{baseFrac}</span>
          <span className="lei">{site.currency}</span>
        </div>
      </div>
      <div className="right">
        {discountPct > 0 && <div className="save">{`-${discountPct}%`}</div>}
        <div style={{ fontSize: 10, color: 'rgba(255,245,220,0.5)', marginTop: 4 }}>{t('firstOrder')}</div>
      </div>
    </div>
  );
}

/**
 * QuickListen — galerie de demo-uri curate de pe homepage. Folosește
 * `site_demos` (aceleași date ca pop-up-ul de demo, ca pagina /asculta).
 * Limităm la 6 card-uri ca să încapă în grid-ul orizontal.
 *
 * `playing` / `onPlay` rămân în signature pentru retrocompatibilitate cu
 * `page.tsx`, dar nu mai sunt folosite — player-ele se controlează singure
 * prin audio-registry (un singur sunet la moment).
 */
export function QuickListen(_props: { playing: string | null; onPlay: (id: string) => void }) {
  const t = useTranslations('quickListen');

  const { data } = useQuery({
    queryKey: ['quick-listen-demos'],
    queryFn: () => api.siteDemos(),
    staleTime: 60_000,
  });

  // Taie la 6 ca să se potrivească în grid-ul orizontal — chiar dacă pe pagina
  // /asculta arătăm până la 15-20 de demo-uri.
  const items = (data?.items ?? []).slice(0, 6);

  if (items.length === 0) return null;

  return (
    <section className="qlisten">
      <div className="head">
        <h3>{t('title')}</h3>
        <span className="more">{t('more', { count: items.length })}</span>
      </div>
      <div className="ql-scroll">
        {items.map((d) => (
          <QuickListenCard key={d.id} demo={d} />
        ))}
      </div>
    </section>
  );
}

function QuickListenCard({ demo }: { demo: import('@/lib/api').SiteDemoDto }) {
  // Lazy mount: ManeaPlayer descarcă MP3-ul integral + face waveform-decode
  // la mount. 6 card-uri simultane = timp mort vizibil pe homepage. Card-ul
  // randează un vinyl + buton Play „static" și inițializează player-ul real
  // doar la primul click — care apoi auto-play-ează (gest user, browser nu
  // blochează).
  const [activated, setActivated] = useState(false);
  // „Pentru X" e principalul label — exact ca în screenshot-ul user-ului.
  // Cădem pe titlul demo-ului dacă n-avem recipient (nu strică).
  const headline = demo.toName ? `Pentru ${demo.toName}` : demo.title;
  const subline = demo.fromName ?? demo.title;

  return (
    <div className={`ql-card ${activated ? 'playing' : ''}`}>
      <div
        className="cover"
        onClick={() => !activated && setActivated(true)}
        style={{ cursor: activated ? 'default' : 'pointer' }}
      >
        <div className="vinyl"></div>
        <button
          type="button"
          className="play-mini"
          aria-label="Play"
          onClick={(e) => {
            e.stopPropagation();
            if (!activated) setActivated(true);
          }}
        >
          <Ic.Play s={14} />
        </button>
      </div>
      <div
        className="ttl"
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {headline}
      </div>
      <div
        className="by"
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {subline}
      </div>
      {activated && (
        <div style={{ marginTop: 6 }}>
          <ManeaPlayer
            audioUrl={demo.audioUrl}
            compact
            startSec={demo.previewStartSec}
            autoPlay
          />
        </div>
      )}
    </div>
  );
}

export function Wave() {
  const bars = 28;
  return (
    <div style={{ display: 'flex', gap: 1.5, height: 18, marginTop: 4, alignItems: 'center' }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} style={{
          flex: 1,
          background: i < bars * 0.4 ? 'var(--gold)' : 'rgba(241,200,77,0.3)',
          height: `${30 + Math.sin((i + Date.now() / 300) * 0.7) * 60 + Math.random() * 30}%`,
          minHeight: 2,
          borderRadius: 1,
          animation: `wpulse ${0.4 + (i % 5) * 0.1}s ease-in-out infinite`,
          animationDelay: `${(i % 6) * 0.05}s`,
        }} />
      ))}
    </div>
  );
}

export function NowPlaying({ playing, onClose }: { playing: string; onClose: () => void }) {
  const item = useMemo(() => DEMOS.find((d) => d.id === playing), [playing]);
  if (!item) return null;
  return (
    <div style={{
      margin: '8px 16px 0', padding: '10px 12px',
      background: 'linear-gradient(135deg, rgba(90,13,24,0.8), rgba(40,12,18,0.8))',
      border: '1px solid var(--gold)', borderRadius: 10,
      display: 'flex', gap: 10, alignItems: 'center',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: 'linear-gradient(135deg,#ffe28a,#b07c1e)',
        display: 'grid', placeItems: 'center', color: '#2a1a04',
        animation: 'spin 4s linear infinite',
      }}>
        <Ic.Pause s={12} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-2)' }}>{item.ttl}</div>
        <Wave />
      </div>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,245,220,0.6)', fontSize: 18, cursor: 'pointer' }}>✕</button>
    </div>
  );
}

/** Format plays count în "12.4K" / "1.2M" / raw. Folosit pentru leaderboard. */
function formatPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Plays „aspiraționale" descrescătoare când nu avem contorizare reală
 *  (viewCount === 0 peste tot). Pattern: 12.4K → 1.8K pe 10 poziții, ca să
 *  arate ca un top crescut natural. Deterministic per id (nu se schimbă la fiecare render). */
const SYNTH_PLAYS = [12_400, 8_900, 7_100, 5_600, 4_300, 3_800, 3_200, 2_700, 2_100, 1_800];

export function Leaderboard() {
  const site = useSite();
  const isLive = site.topSource === 'live';
  const isTemplate = site.topSource === 'template';
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Sursa live: cere 10 generări publice sortate după plays. Avem și audioUrl,
  // ca să putem da play efectiv din leaderboard.
  const { data: live } = useQuery({
    queryKey: ['leaderboard-live'],
    queryFn: () => api.publicGenerations({ limit: 10, sort: 'popular', period: 'week' }),
    staleTime: 60_000,
    enabled: isLive,
  });

  // Sursa template: top curat manual din mostre (audioUrl + startSec + previewSec
  // vin rezolvate de backend din suno.styleSamples / voiceSamples).
  const { data: tpl } = useQuery({
    queryKey: ['leaderboard-template'],
    queryFn: () => api.topList('week', 10),
    staleTime: 60_000,
    enabled: isTemplate,
  });

  const liveItems = isLive ? (live?.items ?? []) : [];
  const tplItems = isTemplate ? (tpl?.items ?? []) : [];

  // Construim rows uniform indiferent de sursă. `linkable` = id real de generare
  // (doar 'live') → titlul devine link spre /m/[id]; template/seed nu linkează.
  type Row = {
    rk: number;
    id: string;
    ttl: string;
    by: string;
    pl: string;
    audioUrl: string | null;
    startSec?: number;
    previewSec?: number;
    linkable: boolean;
  };
  const rows: Row[] =
    isLive && liveItems.length > 0
      ? liveItems.map((it, i) => {
          const real = it.viewCount ?? 0;
          const pl = real > 0 ? formatPlays(real) : formatPlays(SYNTH_PLAYS[i] ?? 1_000);
          return {
            rk: i + 1,
            id: it.id,
            ttl: `🎤 ${it.recipientName}`,
            by: it.voiceArtist,
            pl,
            audioUrl: it.audioUrl,
            linkable: true,
          };
        })
      : isTemplate && tplItems.length > 0
        ? tplItems.map((it) => ({
            rk: it.rk,
            id: it.id,
            ttl: it.ttl,
            by: it.by,
            pl: it.pl,
            audioUrl: it.audioUrl ?? null,
            startSec: it.startSec,
            previewSec: it.previewSec,
            linkable: false,
          }))
        : TOP.map((t) => ({
            rk: t.rk,
            id: `seed-${t.rk}`,
            ttl: t.ttl,
            by: t.by,
            pl: t.pl,
            audioUrl: null,
            linkable: false,
          }));

  // `TOP` e umplutură ROMÂNEASCĂ („Manea pentru Costel șeful", „La mulți ani,
  // soacră!"). E conținut legitim doar când sursa chiar e `seed`. Când site-ul are
  // `live`/`template`, datele reale vin după hidratare — dar randarea de pe server
  // n-are încă răspunsul, așa că până acum HTML-ul servit pe chalgapodarok.bg și
  // doroparaggelia.gr conținea topul în română (verificat pe prod, 31 aug 2026).
  // Se vedea ca flash la încărcare și rămânea în ce citesc crawlerele. Așteptăm.
  const awaitingRealRows = (isLive || isTemplate) && rows.length > 0 && rows[0].id.startsWith('seed-');

  const mid = Math.ceil(rows.length / 2);
  const cols = [rows.slice(0, mid), rows.slice(mid)];

  if (awaitingRealRows) {
    return (
      <div className="lb-grid" aria-busy="true">
        {[0, 1].map((ci) => (
          <div key={ci} className="lb">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="lb-row" style={{ opacity: 0.35 }}>
                <div className="rk">{ci * 5 + i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ttl" style={{ background: 'currentColor', opacity: 0.12, height: 12, borderRadius: 4 }} />
                  <div className="by" style={{ background: 'currentColor', opacity: 0.08, height: 10, borderRadius: 4, marginTop: 5, width: '55%' }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="lb-grid">
      {cols.map((col, ci) => (
        <div key={ci} className="lb">
          {col.map((t) => {
            const isPlaying = playingId === t.id;
            const canPlay = !!t.audioUrl;
            // previewSec > 0 → limităm la startSec+previewSec; altfel melodia întreagă.
            const maxDurationSec =
              t.previewSec && t.previewSec > 0
                ? (t.startSec ?? 0) + t.previewSec
                : undefined;
            const titleInner = (
              <>
                <div className="ttl" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.ttl}</div>
                <div className="by" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.by}</div>
              </>
            );
            return (
              <div key={t.id} style={{ display: 'flex', flexDirection: 'column' }}>
                <div className={`lb-row ${t.rk === 1 ? 'top1' : ''}`}>
                  <div className="rk">{t.rk === 1 ? '👑' : `#${t.rk}`}</div>
                  <div className="info" style={{ minWidth: 0 }}>
                    {t.linkable ? (
                      <Link
                        href={`/m/${t.id}`}
                        style={{ textDecoration: 'none', color: 'inherit', display: 'block', minWidth: 0 }}
                      >
                        {titleInner}
                      </Link>
                    ) : (
                      <div style={{ minWidth: 0 }}>{titleInner}</div>
                    )}
                  </div>
                  <div className="pl">▶ {t.pl}</div>
                  <button
                    className="play-rk"
                    onClick={() => canPlay && setPlayingId(isPlaying ? null : t.id)}
                    disabled={!canPlay}
                    style={{ opacity: canPlay ? 1 : 0.4, cursor: canPlay ? 'pointer' : 'not-allowed' }}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Ic.Pause s={11} /> : <Ic.Play s={11} />}
                  </button>
                </div>
                {isPlaying && canPlay && (
                  <div style={{ padding: '6px 10px 10px 44px' }}>
                    <ManeaPlayer
                      audioUrl={t.audioUrl!}
                      compact
                      autoPlay
                      startSec={t.startSec}
                      maxDurationSec={maxDurationSec}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Testimonials() {
  const site = useSite();
  const { testimonials } = useExperienceCatalog();
  const locale = site.locale;

  // Folosește testimonialele configurate (catalog experiență → per-site) dacă
  // există, altfel fallback la lista hardcoded din seed-data.ts (TESTI —
  // formatul vechi). Listă goală ⇒ tot fallback, nu secțiune goală.
  const items = !testimonials?.length
    ? TESTI.map((t, i) => ({
        key: `seed-${i}`,
        stars: t.stars,
        q: t.q,
        nm: t.nm,
        rl: t.rl,
        av: t.av,
      }))
    : testimonials.map((t) => {
        const tr = t.i18n?.[locale] ?? {};
        return {
          key: t.id,
          stars: Math.max(0, Math.min(5, t.stars ?? 5)),
          q: tr.quote ?? t.quote,
          nm: tr.name ?? t.name,
          rl: tr.role ?? t.role,
          av: t.avatar,
        };
      });

  return (
    <div className="testi-scroll">
      {items.map((t) => (
        <div key={t.key} className="testi-card">
          <div className="stars">{'★'.repeat(t.stars)}</div>
          <div className="q">{t.q}</div>
          <div className="who">
            <div className="av">{t.av}</div>
            <div>
              <div className="nm">{t.nm}</div>
              <div className="rl">{t.rl}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type SmcAnswers = {
  manele: number | null;
  carCadou: number | null;
  nas: number | null;
  petreceri: number | null;
  banii: number | null;
};

const VERDICT_KEYS = ['boschetar', 'amator', 'petrecaret', 'baron', 'rege'] as const;
const VERDICT_RANGES = [
  { min: 0, max: 24, presetStyle: 'comerciala', presetOcc: 'cuplu' },
  { min: 25, max: 49, presetStyle: 'modern', presetOcc: 'sef' },
  { min: 50, max: 74, presetStyle: 'pahar', presetOcc: 'cumatrie' },
  { min: 75, max: 94, presetStyle: 'opulenta', presetOcc: 'nunta' },
  { min: 95, max: 100, presetStyle: 'trompeta', presetOcc: 'nunta' },
];
const FIELDS: Array<keyof SmcAnswers> = ['manele', 'carCadou', 'nas', 'petreceri', 'banii'];

export function Smecher() {
  const t = useTranslations('smecher');
  const site = useSite();
  const url = siteUrl(site);
  const [a, setA] = useState<SmcAnswers>({ manele: null, carCadou: null, nas: null, petreceri: null, banii: null });
  const score = (a.manele ?? 0) + (a.carCadou ?? 0) + (a.nas ?? 0) + (a.petreceri ?? 0) + (a.banii ?? 0);
  const pct = Math.min(100, Math.round((score / (5 * 3)) * 100));
  const idx = VERDICT_RANGES.findIndex((v) => pct >= v.min && pct <= v.max);
  const verdictIdx = idx >= 0 ? idx : 0;
  const vk = VERDICT_KEYS[verdictIdx];
  const range = VERDICT_RANGES[verdictIdx];
  const allAnswered = Object.values(a).every((v) => v !== null);

  const verdictLabel = t(`verdicts.${vk}.label`);
  const verdictEmoji = t(`verdicts.${vk}.emoji`);
  const verdictTip = t(`verdicts.${vk}.tip`);

  const questions = (t.raw('questions') as Array<{ q: string; opts: string[] }>) ?? [];

  function shareResult() {
    // Domeniul vine din `site`, NU din traducere: cheia avea „manelecadou.ro"
    // scris în text în toate cele 8 limbi, deci un client bulgar/grec trimitea
    // prietenilor domeniul altui site.
    const text = t('shareText', {
      label: verdictLabel,
      emoji: verdictEmoji,
      pct,
      site: site.domain,
    });
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: t('title'), text, url });
    } else {
      navigator.clipboard?.writeText(`${text} ${url}`);
      toast(t('shareCopied'), 'success');
    }
  }

  return (
    <div className="smc">
      <div className="smc-meter">
        <div className="smc-needle" style={{ left: `${pct}%` }}></div>
      </div>
      <div className="smc-labels">
        <span>{t('labels.low')}</span><span>{t('labels.mid')}</span><span>{t('labels.high')}</span>
      </div>
      <div className="smc-questions">
        {questions.map((q, i) => (
          <SmcQ
            key={i}
            q={q.q}
            opts={q.opts}
            val={a[FIELDS[i]]}
            onSet={(v) => setA({ ...a, [FIELDS[i]]: v })}
          />
        ))}
      </div>
      <div className="smc-result">
        <div className="lbl">{t('verdictLabel')}</div>
        <div className="v gold-text">
          {verdictEmoji} {verdictLabel}
          <span style={{ fontSize: 12, marginLeft: 8, opacity: 0.6, fontWeight: 400 }}>{pct}/100</span>
        </div>
      </div>
      {allAnswered && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 13, color: 'rgba(255,245,220,0.7)', textAlign: 'center', marginBottom: 10 }}>
            {verdictTip}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a
              href={`/studio?style=${range.presetStyle}&occ=${range.presetOcc}`}
              className="btn btn-gold btn-sm"
              style={{ textDecoration: 'none' }}
              data-hint="true"
              data-hint-label="Studio"
            >
              {t('ctaMake', { label: verdictLabel.toLowerCase() })}
            </a>
            <button onClick={shareResult} className="btn btn-ghost btn-sm">
              {t('share')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SmcQ({ q, opts, val, onSet }: { q: string; opts: string[]; val: number | null; onSet: (v: number) => void }) {
  return (
    <div className="smc-q">
      <label>{q}</label>
      <div className="opts">
        {opts.map((o, i) => (
          <button key={i} className={val === i ? 'on' : ''} onClick={() => onSet(i)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

export function LiveFeed() {
  type FeedItem = { em: string; av: string; tx: string; when: string };
  type Pop = FeedItem & { id: number; out?: boolean };
  const t = useTranslations('liveFeed');
  const items = useMemo<FeedItem[]>(() => {
    const raw = t.raw('items');
    return Array.isArray(raw) && raw.length ? (raw as FeedItem[]) : (FEED_FALLBACK as FeedItem[]);
  }, [t]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [pops, setPops] = useState<Pop[]>([]);
  const idx = useRef(0);

  useEffect(() => {
    const intv = setInterval(() => {
      const list = itemsRef.current;
      if (!list.length) return;
      const item = list[idx.current % list.length];
      idx.current++;
      const id = Math.random();
      setPops((p) => [...p, { ...item, id }]);
      setTimeout(() => {
        setPops((p) => p.map((x) => (x.id === id ? { ...x, out: true } : x)));
        setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 350);
      }, 4500);
    }, 19500); // ~3x mai rar decât 6500ms inițial
    return () => clearInterval(intv);
  }, []);

  return (
    <div className="lf-stack">
      {pops.slice(-2).map((p) => (
        <div key={p.id} className={`lf-pop ${p.out ? 'out' : ''}`}>
          <div className="av">{p.av}</div>
          <div className="tx" dangerouslySetInnerHTML={{ __html: p.tx + `<span class="when">${p.when}</span>` }} />
          <span className="em">{p.em}</span>
        </div>
      ))}
    </div>
  );
}

export function Ticker() {
  const t = useTranslations('ticker');
  const items = (t.raw('items') as string[]) ?? [];
  return (
    <div className="ticker-bar">
      <div className="track">
        {[...items, ...items].map((tx, i) => (
          <span key={i}>{tx}</span>
        ))}
      </div>
    </div>
  );
}

export function Cookie({ onClose }: { onClose: (mode: 'rej' | 'all') => void }) {
  const t = useTranslations('cookie');
  const site = useSite();
  const cookiesHref = getLegalPath(site.locale, 'cookies');
  return (
    <div className="cookie-banner">
      <h4><span className="em">🍪</span> {t('title')}</h4>
      <p>
        {t.rich('body', {
          a: (chunks) => <a href={cookiesHref} style={{ color: 'var(--gold)' }}>{chunks}</a>,
        })}
      </p>
      <div className="cookie-banner-row">
        <button className="btn btn-gold btn-block" onClick={() => onClose('all')}>
          {t('accept')}
        </button>
      </div>
    </div>
  );
}

export function Footer() {
  const t = useTranslations('footer');
  const site = useSite();
  const brandName = site.name;
  const logoSrc = site.brand?.logoUrl || '/logo-80.png';
  const social = site.social ?? {};
  const company = site.companyInfo ?? {};
  const supportEmail = siteSupportEmail(site);
  const phoneRaw = social.phone || '';
  const phoneDisplay = phoneRaw.replace(/^\+?40\s*/, '0').trim();
  const phoneHref = phoneRaw ? `tel:${phoneRaw.replace(/\s+/g, '')}` : null;
  const companyLine =
    [company.legalName, company.cui, company.regCom].filter(Boolean).join(' · ') || t('company');

  return (
    <footer className="foot">
      <div className="br">
        <img
          src={logoSrc}
          alt={brandName}
          width={32}
          height={32}
          style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #b07c1e', objectFit: 'cover' }}
        />
        <div className="serif gold-text" style={{ fontSize: 16, fontWeight: 900 }}>{brandName}</div>
      </div>
      <p style={{ maxWidth: 460, margin: '0 auto 14px' }}>
        {site.brand?.tagline || t('tagline')}
      </p>

      {(social.instagram || social.facebook || social.tiktok || social.youtube || social.whatsapp) && (
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 14 }}>
          {social.instagram && <SocialIcon href={social.instagram} label="Instagram" icon={<InstagramIcon />} />}
          {social.facebook && <SocialIcon href={social.facebook} label="Facebook" icon={<FacebookIcon />} />}
          {social.tiktok && <SocialIcon href={social.tiktok} label="TikTok" icon={<TikTokIcon />} />}
          {social.youtube && <SocialIcon href={social.youtube} label="YouTube" icon={<YouTubeIcon />} />}
          {social.whatsapp && <SocialIcon href={social.whatsapp} label="WhatsApp" icon={<WhatsAppIcon />} />}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.5)', marginBottom: 10 }}>
        {phoneHref && (
          <>
            ☎️ <a href={phoneHref} style={{ color: 'inherit', textDecoration: 'none' }}>{phoneDisplay || phoneRaw}</a>
            {' · '}
          </>
        )}
        ✉️ <a href={`mailto:${supportEmail}`} style={{ color: 'inherit', textDecoration: 'none' }}>{supportEmail}</a>
      </div>

      <div className="links">
        <a href={getLegalPath(site.locale, 'terms')}>{t('links.termeni')}</a>
        <a href={getLegalPath(site.locale, 'privacy')}>{t('links.confidentialitate')}</a>
        <a href={getLegalPath(site.locale, 'cookies')}>{t('links.cookies')}</a>
        <a href={getPagePath(site.locale, 'contact')}>{t('links.contact')}</a>
        <a href={getPagePath(site.locale, 'faq')}>{t('links.faq')}</a>
        <a href={getPagePath(site.locale, 'articole')}>{t('links.articles')}</a>
        {site.locale === 'ro' && (
          <>
            <a href="https://anpc.ro" target="_blank" rel="noopener noreferrer">ANPC</a>
            <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener noreferrer">SAL</a>
            <a href="https://ec.europa.eu/consumers/odr/main/index.cfm?event=main.home2.show&lng=RO" target="_blank" rel="noopener noreferrer">SOL</a>
          </>
        )}
      </div>

      <div style={{
        display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap',
        marginTop: 14, fontSize: 10, color: 'rgba(255,245,220,0.45)',
      }}>
        <Badge>{t('badges.ssl')}</Badge>
        <Badge>{t('badges.pay')}</Badge>
        <Badge>{t('badges.warranty')}</Badge>
        <Badge>{t('badges.server')}</Badge>
      </div>

      <p style={{ marginTop: 14 }}>{companyLine}</p>
    </footer>
  );
}

function SocialIcon({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'rgba(241,200,77,0.06)',
        border: '1px solid var(--line)',
        display: 'grid', placeItems: 'center',
        color: '#f1c84d',
        textDecoration: 'none',
        transition: 'border-color 0.15s, background 0.15s, color 0.15s',
      }}
    >
      {icon}
    </a>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.93a8.16 8.16 0 0 0 4.77 1.52V7a4.85 4.85 0 0 1-1.84-.31z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.12C19.55 3.5 12 3.5 12 3.5s-7.55 0-9.4.58A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.12c1.85.58 9.4.58 9.4.58s7.55 0 9.4-.58a3 3 0 0 0 2.1-2.12A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.6 15.6V8.4l6.27 3.6z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.74-1.65-2.04-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.23 1.35.2 1.86.12.57-.08 1.76-.72 2-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35zM12.05 21.5h-.04a9.43 9.43 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.47-.22-.36a9.4 9.4 0 0 1-1.44-5 9.45 9.45 0 0 1 16.13-6.68 9.4 9.4 0 0 1 2.77 6.69 9.45 9.45 0 0 1-9.44 9.4zm8.04-17.44A11.43 11.43 0 0 0 12.05 0C5.78 0 .68 5.08.68 11.34c0 2 .52 3.96 1.52 5.68L.58 24l7.13-1.86a11.36 11.36 0 0 0 5.43 1.38h.01c6.27 0 11.37-5.08 11.37-11.34a11.26 11.26 0 0 0-3.43-8.12z" />
    </svg>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: '4px 9px', borderRadius: 999,
      background: 'rgba(241,200,77,0.06)',
      border: '1px solid var(--line)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

