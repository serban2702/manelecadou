'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { api, resolveMediaUrl, type GenerationDto } from '@/lib/api';
import { useSite } from '@/lib/site-context';
import { getPagePath } from '@/lib/page-slugs';
import { useExperienceCatalog } from '../use-experience-catalog';
import { CadouShell } from './Shell';
import { cadouStyleArt } from './style-art';
import { useCadouFromName } from './from-name';
import { Picture } from '@/components/Picture';

const IN_PROGRESS = new Set([
  'pending', 'queued', 'writing_lyrics', 'checking_lyrics', 'generating_audio', 'running',
]);

function fmtDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type ToneKind = 'ok' | 'wait' | 'pay' | 'bad';
type ToneKey = 'statusPay' | 'statusReady' | 'statusWorking' | 'statusFailed' | 'statusView';

/** O comandă picată e picată: „se lucrează" pentru totdeauna e o minciună pe
 *  care clientul o plătește cu așteptarea. */
function failedNoAudio(g: GenerationDto): boolean {
  return g.status === 'failed' && !g.audioUrl;
}

function toneOf(g: GenerationDto): { key: ToneKey; kind: ToneKind } {
  const awaitingPay = g.status === 'pending' && !g.paidUnlocked;
  if (awaitingPay) return { key: 'statusPay', kind: 'pay' };
  if (g.status === 'succeeded' && g.audioUrl) return { key: 'statusReady', kind: 'ok' };
  if (failedNoAudio(g)) return { key: 'statusFailed', kind: 'bad' };
  if (IN_PROGRESS.has(g.status)) return { key: 'statusWorking', kind: 'wait' };
  return { key: 'statusView', kind: 'ok' };
}

export default function CadouMinePage() {
  const site = useSite();
  const t = useTranslations('cadou.mine');
  const studio = getPagePath(site.locale, 'studio');
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-generations'],
    queryFn: api.listGenerations,
    refetchInterval: (q) => {
      const items = q.state.data;
      // Nu mai reîmprospătăm la infinit pentru comenzile picate — acolo
      // polling-ul (cu plafon) se face pe pagina piesei, unde clientul vede și
      // ce s-a întâmplat.
      const busy = items?.some(
        (g) => !g.audioUrl
          && !failedNoAudio(g)
          && !(g.status === 'pending' && !g.paidUnlocked),
      );
      return busy ? 5000 : false;
    },
  });

  return (
    <CadouShell>
      <div className="cadou-wrap cadou-mine-wrap">
        <section className="cadou-panel cadou-mine">
          <div className="cadou-kicker">{t('kicker')}</div>
          <h1>{t('title')}</h1>
          <p className="lead">{t('lead')}</p>
          <Link href={studio} className="cadou-cta">{t('ctaMore')}</Link>

          {isLoading && <p className="cadou-hint" style={{ marginTop: 22 }}>{t('loading')}</p>}
          {error && <p className="cadou-err" role="alert">{t('error')}</p>}

          {data && data.length === 0 && (
            <div className="cadou-mine-empty">
              <p>{t('emptyText')}</p>
              <Link href={studio} className="cadou-cta">{t('emptyCta')}</Link>
            </div>
          )}

          {data && data.length > 0 && (
            <div className="cadou-mine-list">
              {data.map((g) => (
                <CadouMineCard key={g.id} g={g} />
              ))}
            </div>
          )}
        </section>
      </div>
    </CadouShell>
  );
}

function CadouMineCard({ g }: { g: GenerationDto }) {
  const site = useSite();
  const t = useTranslations('cadou.mine');
  const fromName = useCadouFromName();
  const studio = getPagePath(site.locale, 'studio');
  const catalog = useExperienceCatalog();
  const styleNm = catalog.styles.find((s) => s.id === g.style)?.nm ?? g.style;
  const occNm = catalog.occasions.find((o) => o.id === g.occasion)?.nm ?? g.occasion;
  const from = fromName.senderOf(g);
  const name = fromName.displayRecipient(g.recipientName);
  const cover = resolveMediaUrl(g.coverUrl) ?? cadouStyleArt(g.style);
  const tone = toneOf(g);
  const action = tone.kind === 'pay'
    ? t('actionResume')
    : tone.kind === 'bad'
      ? t('actionHelp')
      : g.audioUrl
        ? t('actionListen')
        : t('actionLyrics');
  const href = tone.kind === 'pay'
    ? `${studio}?paymentCanceled=1&genId=${g.id}`
    : `/m/${g.id}`;

  return (
    <Link href={href} className="cadou-mine-card">
      <Picture className="cadou-mine-cover" src={cover} alt="" />
      <div className="cadou-mine-body">
        <div className="cadou-mine-top">
          <div className="ttl">{t('cardFor', { name })}</div>
          <span className={`cadou-mine-chip is-${tone.kind}`}>{t(tone.key)}</span>
        </div>
        <div className="meta">{[styleNm, occNm].filter(Boolean).join(' · ')}</div>
        {from && <div className="from">{t('cardFrom', { from })}</div>}
        <div className="when">{fmtDate(g.createdAt, site.locale)}</div>
      </div>
      <span className="cadou-mine-go">{t('cardGo', { action })}</span>
    </Link>
  );
}
