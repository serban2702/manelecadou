'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { SiteShell } from '@/components/SiteShell';
import { api, type GenerationDto } from '@/lib/api';
import { STYLES, VOICES, OCC } from '@/lib/seed-data';
import { useSite } from '@/lib/site-context';
import { getPagePath } from '@/lib/page-slugs';

const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  queued:           { color: '#ffd680', bg: 'rgba(241,200,77,0.12)' },
  writing_lyrics:   { color: '#ffd680', bg: 'rgba(241,200,77,0.12)' },
  checking_lyrics:  { color: '#ffd680', bg: 'rgba(241,200,77,0.12)' },
  generating_audio: { color: '#ffd680', bg: 'rgba(241,200,77,0.12)' },
  succeeded:        { color: '#bff5d2', bg: 'rgba(62,224,126,0.12)' },
  failed:           { color: '#ffd6e6', bg: 'rgba(255,45,126,0.18)' },
};

function fmtDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ManeleleMelePage() {
  const t = useTranslations('myGens');
  const site = useSite();
  const studio = getPagePath(site.locale, 'studio');
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-generations'],
    queryFn: api.listGenerations,
    refetchInterval: (q) => {
      const items = q.state.data;
      const inFlight = items?.some(
        (g) => g.status !== 'succeeded' && g.status !== 'failed',
      );
      return inFlight ? 5000 : false;
    },
  });

  return (
    <SiteShell hideStickyCta>
      <div className="inner-page">
        <h1 className="gold-text">{t('title')}</h1>
        <p className="lead">{t('lead')}</p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, marginBottom: 22 }}>
          <Link href={studio} className="btn btn-gold" style={{ textDecoration: 'none' }}>
            {t('ctaMake')}
          </Link>
        </div>

        {isLoading && <p className="ld">{t('loading')}</p>}

        {error && (
          <p style={{ color: '#ff8888' }}>{t('errLoad')}</p>
        )}

        {data && data.length === 0 && (
          <div style={{
            padding: 24, textAlign: 'center',
            background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(241,200,77,0.3)',
            borderRadius: 12,
          }}>
            <p>{t('empty')}</p>
            <Link href={studio} className="btn btn-gold" style={{ textDecoration: 'none', marginTop: 10 }}>
              {t('ctaFirst')}
            </Link>
          </div>
        )}

        {data && data.length > 0 && (
          <div style={{ display: 'grid', gap: 12 }}>
            {data.map((g) => (
              <GenerationRow key={g.id} g={g} />
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}

function GenerationRow({ g }: { g: GenerationDto }) {
  const t = useTranslations('myGens');
  const tStyles = useTranslations('styles');
  const tOcc = useTranslations('occasions');
  const site = useSite();
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
  // `t.has()` evită eroarea next-intl MISSING_MESSAGE (care e logată, NU aruncată,
  // deci un try/catch n-o prinde) când un status nou n-are încă cheie de traducere.
  const statusKey = `status.${g.status}`;
  const statusLabel = (t as { has?: (k: string) => boolean }).has?.(statusKey)
    ? t(statusKey as Parameters<typeof t>[0])
    : g.status;
  const color = STATUS_COLOR[g.status] ?? { color: '#ccc', bg: 'rgba(255,255,255,0.08)' };
  const isPaid = g.type === 'full' || g.paidUnlocked;
  const isPlayable = g.status === 'succeeded' && !!g.audioUrl;
  // Pay-first abandonat: generation rămas „pending" + neplătit. Nu e nici
  // „Deblocată" (înșelător), nici în lucru — așteaptă reluarea plății.
  const awaitingPayment = g.status === 'pending' && !g.paidUnlocked;

  return (
    <Link
      href={`/m/${g.id}`}
      style={{
        display: 'block',
        padding: 14,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--line)',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s ease, background 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold-2)' }}>
              {t('forSomeone', { name: g.recipientName })}
            </span>
            {awaitingPayment ? (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 999,
                background: 'rgba(255,150,40,0.15)', color: '#ffce9a', fontWeight: 600,
              }}>
                ⏳ {t('paymentIncompleteBadge')}
              </span>
            ) : (
              <>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 999,
                  background: color.bg, color: color.color, fontWeight: 600,
                }}>
                  {statusLabel}
                </span>
                {isPaid ? (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 999,
                    background: 'rgba(62,224,126,0.15)', color: '#bff5d2', fontWeight: 600,
                  }}>
                    {t('unlockedBadge')}
                  </span>
                ) : g.type === 'demo' ? (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 999,
                    background: 'rgba(241,200,77,0.15)', color: '#f1c84d', fontWeight: 600,
                  }}>
                    {t('demoBadge')}
                  </span>
                ) : null}
              </>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.55)', marginTop: 4 }}>
            {styleNm} · {occNm} · {t('voiceLabel')}: {voiceNm}
          </div>
          {g.dedication && (
            <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.45)', marginTop: 2 }}>
              {t('fromSomeone', { from: g.dedication })}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.4)', marginTop: 6 }}>
            {fmtDate(g.createdAt, 'en-GB')}
          </div>
        </div>
        <div style={{ alignSelf: 'center', fontSize: 13, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
          {awaitingPayment
            ? t('resumePayment')
            : isPlayable
              ? (isPaid ? t('listen') : t('listenUnlock'))
              : t('details')}
        </div>
      </div>
    </Link>
  );
}
