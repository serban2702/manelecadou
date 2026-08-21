'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, resolveMediaUrl, type GenerationDto } from '@/lib/api';
import { useSite } from '@/lib/site-context';
import { getPagePath } from '@/lib/page-slugs';
import { useExperienceCatalog } from '../use-experience-catalog';
import { CadouShell } from './Shell';
import { cadouStyleArt } from './style-art';
import { displayRecipient, senderOf } from './from-name';

const IN_PROGRESS = new Set([
  'pending', 'queued', 'writing_lyrics', 'checking_lyrics', 'generating_audio', 'running',
]);

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ro-RO', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function toneOf(g: GenerationDto): { label: string; kind: 'ok' | 'wait' | 'pay' } {
  const awaitingPay = g.status === 'pending' && !g.paidUnlocked;
  if (awaitingPay) return { label: 'Plată neterminată', kind: 'pay' };
  if (g.status === 'succeeded' && g.audioUrl) return { label: 'Gata', kind: 'ok' };
  if (IN_PROGRESS.has(g.status) || (g.status === 'failed' && !g.audioUrl)) {
    return { label: 'Se compune', kind: 'wait' };
  }
  return { label: 'Vezi cadoul', kind: 'ok' };
}

export default function CadouMinePage() {
  const site = useSite();
  const studio = getPagePath(site.locale, 'studio');
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-generations'],
    queryFn: api.listGenerations,
    refetchInterval: (q) => {
      const items = q.state.data;
      const busy = items?.some((g) => !g.audioUrl && !(g.status === 'pending' && !g.paidUnlocked));
      return busy ? 5000 : false;
    },
  });

  return (
    <CadouShell>
      <div className="cadou-wrap cadou-mine-wrap">
        <section className="cadou-panel cadou-mine">
          <div className="cadou-kicker">Biblioteca ta</div>
          <h1>Manelele mele</h1>
          <p className="lead">Toate cadourile pe care le-ai făcut. Deschide una ca s-o asculți.</p>
          <Link href={studio} className="cadou-cta">Fă încă o manea</Link>

          {isLoading && <p className="cadou-hint" style={{ marginTop: 22 }}>Încărcăm manelele tale…</p>}
          {error && <p className="cadou-err" role="alert">Nu am putut încărca lista. Încearcă din nou.</p>}

          {data && data.length === 0 && (
            <div className="cadou-mine-empty">
              <p>N-ai făcut încă nicio manea.</p>
              <Link href={studio} className="cadou-cta">Fă prima manea</Link>
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
  const studio = getPagePath(site.locale, 'studio');
  const catalog = useExperienceCatalog();
  const styleNm = catalog.styles.find((s) => s.id === g.style)?.nm ?? g.style;
  const occNm = catalog.occasions.find((o) => o.id === g.occasion)?.nm ?? g.occasion;
  const from = senderOf(g);
  const name = displayRecipient(g.recipientName);
  const cover = resolveMediaUrl(g.coverUrl) ?? cadouStyleArt(g.style);
  const tone = toneOf(g);
  const action = tone.kind === 'pay'
    ? 'Reia plata'
    : g.audioUrl
      ? 'Ascultă'
      : 'Vezi versurile';
  const href = tone.kind === 'pay'
    ? `${studio}?paymentCanceled=1&genId=${g.id}`
    : `/m/${g.id}`;

  return (
    <Link href={href} className="cadou-mine-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cadou-mine-cover" src={cover} alt="" />
      <div className="cadou-mine-body">
        <div className="cadou-mine-top">
          <div className="ttl">Pentru {name}</div>
          <span className={`cadou-mine-chip is-${tone.kind}`}>{tone.label}</span>
        </div>
        <div className="meta">{[styleNm, occNm].filter(Boolean).join(' · ')}</div>
        {from && <div className="from">De la {from}</div>}
        <div className="when">{fmtDate(g.createdAt)}</div>
      </div>
      <span className="cadou-mine-go">{action} →</span>
    </Link>
  );
}
