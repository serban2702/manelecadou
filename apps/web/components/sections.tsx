'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ic } from './icons';
import { toast } from './Toaster';
import { DEMOS, FEED, TESTI, TOP } from '@/lib/seed-data';
import { siteSupportEmail, siteUrl } from '@/lib/site-shared';
import { useSite } from '@/lib/site-context';

export function Hero({ onGen, onListen }: { onGen: () => void; onListen: () => void }) {
  const t = useTranslations('hero');
  const tc = useTranslations('common');
  return (
    <section className="hero">
      <div className="hero-flag">{t('flag')}</div>
      <h1>
        {t('titleA')} <span className="gold-text">{t('titleHl')}</span> {t('titleB')}
      </h1>
      <p className="sub">{t('sub')}</p>
      <div className="hero-actions">
        <button className="btn btn-gold btn-lg" onClick={onGen}>{tc('ctaMakeManea')}</button>
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

  // Folosim prețul real din site config (editabil din admin per site),
  // nu cele hardcoded din messages JSON.
  const standardCents = site.standardPriceCents ?? 0;
  const baseCents = site.basePriceCents;
  const showStrike = standardCents > baseCents;

  const baseValue = baseCents / 100;
  const baseInt = Math.floor(baseValue);
  const baseFrac = Math.round((baseValue - baseInt) * 100)
    .toString()
    .padStart(2, '0');
  const standardFormatted = (standardCents / 100).toFixed(2).replace('.', ',');

  return (
    <div className="price-strip">
      <span className="badge">{t('badge')}</span>
      <div className="left">
        {showStrike && (
          <div className="strike">
            {standardFormatted} {site.currency}
          </div>
        )}
        <div className="now gold-text">
          {baseInt}
          <span style={{ fontSize: 18 }}>,{baseFrac}</span>
          <span className="lei">{site.currency}</span>
        </div>
      </div>
      <div className="right">
        <div className="save">{t('save')}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,245,220,0.5)', marginTop: 4 }}>{t('newAccount')}</div>
      </div>
    </div>
  );
}

export function QuickListen({ playing, onPlay }: { playing: string | null; onPlay: (id: string) => void }) {
  const t = useTranslations('quickListen');
  return (
    <section className="qlisten">
      <div className="head">
        <h3>{t('title')}</h3>
        <span className="more">{t('more', { count: DEMOS.length })}</span>
      </div>
      <div className="ql-scroll">
        {DEMOS.map((d) => {
          const isP = playing === d.id;
          return (
            <div key={d.id} className={`ql-card ${isP ? 'playing' : ''}`} onClick={() => onPlay(d.id)}>
              <div className="cover">
                <div className="vinyl"></div>
                <button className="play-mini" aria-label="Play">
                  {isP ? <Ic.Pause s={14} /> : <Ic.Play s={14} />}
                </button>
              </div>
              <div className="ttl">{d.ttl}</div>
              <div className="by">{d.by}</div>
              <div className="heat">{d.heat}</div>
            </div>
          );
        })}
      </div>
    </section>
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

export function Leaderboard() {
  const [playing, setPlaying] = useState<number | null>(null);
  return (
    <div className="lb">
      {TOP.map((t) => (
        <div key={t.rk} className={`lb-row ${t.rk === 1 ? 'top1' : ''}`}>
          <div className="rk">{t.rk === 1 ? '👑' : `#${t.rk}`}</div>
          <div className="info">
            <div className="ttl">{t.ttl}</div>
            <div className="by">{t.by}</div>
          </div>
          <div className="pl">▶ {t.pl}</div>
          <button className="play-rk" onClick={() => setPlaying(playing === t.rk ? null : t.rk)}>
            {playing === t.rk ? <Ic.Pause s={11} /> : <Ic.Play s={11} />}
          </button>
        </div>
      ))}
    </div>
  );
}

export function Testimonials() {
  return (
    <div className="testi-scroll">
      {TESTI.map((t, i) => (
        <div key={i} className="testi-card">
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
    const text = t('shareText', { label: verdictLabel, emoji: verdictEmoji, pct });
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: t('title'), text, url });
    } else {
      navigator.clipboard?.writeText(`${text} ${url}`);
      toast(t('shareCopied'), 'success');
    }
  }

  return (
    <div className="smc">
      <div className="s-head" style={{ marginBottom: 14 }}>
        <div className="ek">{t('tag')}</div>
        <h2 className="gold-text" style={{ fontSize: 18 }}>{t('title')}</h2>
      </div>
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
  type Pop = { id: number; em: string; av: string; tx: string; when: string; out?: boolean };
  const [pops, setPops] = useState<Pop[]>([]);
  const idx = useRef(0);

  useEffect(() => {
    const intv = setInterval(() => {
      const item = FEED[idx.current % FEED.length];
      idx.current++;
      const id = Math.random();
      setPops((p) => [...p, { ...item, id }]);
      setTimeout(() => {
        setPops((p) => p.map((x) => (x.id === id ? { ...x, out: true } : x)));
        setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 350);
      }, 4500);
    }, 6500);
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
  return (
    <div className="cc">
      <h4><span className="em">🍪</span> {t('title')}</h4>
      <p>
        {t.rich('body', {
          a: (chunks) => <a href="/cookies" style={{ color: 'var(--gold)' }}>{chunks}</a>,
        })}
      </p>
      <div className="cc-row">
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
          {social.instagram && <SocialIcon href={social.instagram} label="Instagram" emoji="📷" />}
          {social.facebook && <SocialIcon href={social.facebook} label="Facebook" emoji="📘" />}
          {social.tiktok && <SocialIcon href={social.tiktok} label="TikTok" emoji="🎵" />}
          {social.youtube && <SocialIcon href={social.youtube} label="YouTube" emoji="▶️" />}
          {social.whatsapp && <SocialIcon href={social.whatsapp} label="WhatsApp" emoji="💬" />}
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
        <a href="/termeni">{t('links.termeni')}</a>
        <a href="/confidentialitate">{t('links.confidentialitate')}</a>
        <a href="/cookies">{t('links.cookies')}</a>
        <a href="/contact">{t('links.contact')}</a>
        <a href="/faq">{t('links.faq')}</a>
        <a href="https://anpc.ro" target="_blank" rel="noopener noreferrer">ANPC</a>
        <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener noreferrer">SAL</a>
        <a href="https://ec.europa.eu/consumers/odr/main/index.cfm?event=main.home2.show&lng=RO" target="_blank" rel="noopener noreferrer">SOL</a>
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

function SocialIcon({ href, label, emoji }: { href: string; label: string; emoji: string }) {
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
        fontSize: 16, textDecoration: 'none',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {emoji}
    </a>
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

export function GiftMini() {
  const t = useTranslations('giftMini');
  return (
    <div className="gift-mini">
      <span className="ribbon">🎁 NEW</span>
      <h3 className="gold-text">{t('title')}</h3>
      <p>{t('body')}</p>
      <button className="btn btn-rose btn-block">
        <Ic.Gift s={14} /> {t('cta')}
      </button>
    </div>
  );
}
