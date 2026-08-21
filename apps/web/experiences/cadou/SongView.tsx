'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api, ApiError, resolveMediaUrl, type GenerationDto } from '@/lib/api';
import { prettifyLyrics } from '@/lib/lyrics-display';
import { getPagePath } from '@/lib/page-slugs';
import { useSite } from '@/lib/site-context';
import { CadouShell } from './Shell';
import { CadouDemoPlayer } from './DemoPlayer';
import { CadouVideoSection } from './VideoSection';
import { CadouRemakeCard } from './RemakeCard';
import { cadouStyleArt } from './style-art';
import { displayRecipient, senderOf } from './from-name';
import { useExperienceCatalog } from '../use-experience-catalog';
import { PACKAGES } from '@/lib/packages';

const IN_PROGRESS = new Set([
  'pending', 'queued', 'writing_lyrics', 'checking_lyrics', 'generating_audio', 'running',
]);

const AVG_SEC = 6 * 60;
const LINEAR_SEC = 5 * 60;
const RING = 2 * Math.PI * 46;

const WORKING = [
  'Scriem versurile…',
  'Verificăm rima…',
  'Compunem muzica…',
  'Ajustăm vocea…',
];
const STRETCH_LINES = [
  'Ajustăm vocea și mix-ul…',
  'Lustruim ultimele detalii…',
  'Încă puțin — nu închide pagina.',
];

function fmtRemain(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function waitEta(elapsedSec: number): { remainSec: number; progress: number; stretch: boolean } {
  if (elapsedSec < LINEAR_SEC) {
    return {
      remainSec: Math.max(60, AVG_SEC - elapsedSec),
      progress: elapsedSec / AVG_SEC,
      stretch: false,
    };
  }
  const extra = elapsedSec - LINEAR_SEC;
  const remainSec = Math.max(12, 60 * Math.exp(-extra / 210));
  const progress = 5 / 6 + (1 / 6) * 0.82 * (1 - Math.exp(-extra / 360));
  return { remainSec, progress: Math.min(0.97, progress), stretch: true };
}

type Playable = { id: string; label: string; audioUrl: string };

function CadouWaitCard({
  cover,
  createdAt,
  hasLyrics,
}: {
  cover: string;
  createdAt: string;
  hasLyrics: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const startMs = useMemo(() => {
    const t = new Date(createdAt).getTime();
    return Number.isFinite(t) ? t : Date.now();
  }, [createdAt]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, (now - startMs) / 1000);
  const { remainSec, progress, stretch } = waitEta(elapsed);
  const phrase = stretch
    ? STRETCH_LINES[Math.floor(now / 2800) % STRETCH_LINES.length]
    : hasLyrics
      ? 'Compunem audio-ul pe versurile tale.'
      : WORKING[Math.floor(now / 2800) % WORKING.length];
  const remainRound = stretch
    ? Math.min(59, Math.max(12, Math.ceil(remainSec)))
    : Math.max(1, Math.ceil(remainSec));

  return (
    <div className={`cadou-wait${stretch ? ' is-stretch' : ''}`} aria-live="polite">
      <div className="cadou-wait-dial">
        <svg className="cadou-wait-ring" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="46" className="cadou-wait-track" />
          <circle
            cx="50"
            cy="50"
            r="46"
            className="cadou-wait-fill"
            style={{
              strokeDasharray: RING,
              strokeDashoffset: RING * (1 - progress),
            }}
          />
        </svg>
        <div className="cadou-wait-disc">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" />
        </div>
      </div>
      <div className="cadou-wait-time" aria-label={`Mai ai ${fmtRemain(remainRound)}`}>
        {fmtRemain(remainRound)}
      </div>
      <span className="cadou-wait-eq" aria-hidden>
        <i /><i /><i /><i /><i />
      </span>
      <div className="cadou-wait-lab">
        {stretch ? 'sub 1 min · aproape gata' : 'timp rămas · estimare 6 min'}
      </div>
      <strong>{stretch ? 'Aproape gata' : hasLyrics ? 'Versurile sunt gata' : 'Compunem maneaua'}</strong>
      <span>{phrase}</span>
      <div className="cadou-wait-bar" aria-hidden>
        <i style={{ width: `${Math.max(6, progress * 100)}%` }} />
      </div>
    </div>
  );
}

function CadouLyrics({ text }: { text: string }) {
  const pretty = prettifyLyrics(text, 'ro');
  return (
    <div className="cadou-song-lyrics">
      {pretty.split('\n').map((line, i) => {
        const tag = line.match(/^\[(.+)\]\s*$/);
        if (tag) return <div key={i} className="cadou-song-tag">{tag[1]}</div>;
        if (!line.trim()) return <div key={i} className="cadou-song-gap" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

function CadouOrderCard({ generation }: { generation: GenerationDto }) {
  const catalog = useExperienceCatalog();
  const g = generation;
  const rec = displayRecipient(g.recipientName);
  const noDedic = !g.recipientName?.trim() || g.recipientName.trim() === '—';
  const from = senderOf(g);
  const styleNm = catalog.styles.find((s) => s.id === g.style)?.nm ?? g.style ?? '—';
  const occNm = catalog.occasions.find((o) => o.id === g.occasion)?.nm ?? (g.occasion && g.occasion !== 'altul' ? g.occasion : '—');
  const voiceNm = catalog.voices.find((v) => v.id === g.voiceArtist)?.nm ?? (g.voiceArtist === 'female' ? 'Feminină' : 'Bărbătească');
  const pack = PACKAGES.find((p) => p.tier === g.packageTier)?.nameRO ?? g.packageTier ?? '—';
  const story = (g.message ?? '').replace(/(?:^|\n)\s*De la\s+.+\s*$/im, '').trim();
  const rows: Array<[string, string]> = [
    ['Stil', styleNm],
    ['Ocazia', occNm || '—'],
    ['Voce', voiceNm],
    ['Pentru', noDedic ? 'fără dedicație' : rec],
    ['De la', from || '—'],
    ['Pachet', pack],
  ];
  if (story) rows.push(['Povestea', story]);
  if (g.customLyrics?.trim()) rows.push(['Versuri proprii', g.customLyrics.trim()]);

  return (
    <details className="cadou-song-card cadou-order">
      <summary>Detaliile comenzii</summary>
      <div className="cadou-order-body">
        {rows.map(([k, v]) => (
          <div key={k} className="cadou-order-row">
            <b>{k}</b>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function CadouSongView() {
  return (
    <CadouShell>
      <Suspense fallback={<div className="cadou-wrap cadou-song-wrap"><div className="cadou-panel cadou-song"><p className="cadou-hint">Încărcăm cadoul…</p></div></div>}>
        <CadouSongInner />
      </Suspense>
    </CadouShell>
  );
}

function CadouSongInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const site = useSite();
  const id = params?.id;
  const mine = getPagePath(site.locale, 'manelele-mele');
  const studio = getPagePath(site.locale, 'studio');

  const [g, setG] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const fresh = await api.getGeneration(id);
      setG(fresh);
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError && (e.status === 401 || e.status === 403)
          ? 'Maneaua e disponibilă doar pentru cine a comandat-o.'
          : 'Nu am putut încărca maneaua.',
      );
    }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!g) return;
    const waitingAudio = g.status === 'failed' && !g.audioUrl;
    const enriching = g.status === 'succeeded' && g.deliverablesReady === false;
    const remaking = (g.workingVariants?.length ?? 0) > 0;
    if (!IN_PROGRESS.has(g.status) && !waitingAudio && !enriching && !remaking) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [g?.status, g?.audioUrl, g?.deliverablesReady, g?.workingVariants?.length, refresh]);

  useEffect(() => {
    const paymentId = search.get('paymentId');
    if (!id || !paymentId || search.get('success') !== '1' || unlocking) return;
    setUnlocking(true);
    (async () => {
      try {
        await api.unlockGeneration(id, paymentId);
        await refresh();
      } catch {
        /* already paid / free checkout */
      } finally {
        setUnlocking(false);
        window.history.replaceState({}, '', `/m/${id}`);
      }
    })();
  }, [search, id, unlocking, refresh]);

  const titleName = displayRecipient(g?.recipientName);
  const from = g ? senderOf(g) : null;
  const cover = g
    ? (resolveMediaUrl(g.coverUrl) ?? cadouStyleArt(g.style))
    : cadouStyleArt('iubire');

  const tracks: Playable[] = useMemo(() => {
    if (!g) return [];
    if (g.variants?.length) {
      return g.variants
        .filter((v) => v.audioUrl)
        .map((v) => ({
          id: v.kind === 'bonus' ? `${g.id}-bonus` : v.kind === 'variation' ? v.id : `${g.id}-main`,
          label: v.label,
          audioUrl: v.audioUrl,
        }));
    }
    return [
      ...(g.audioUrl ? [{ id: `${g.id}-main`, label: 'Maneaua', audioUrl: g.audioUrl }] : []),
      ...(g.bonusAudioUrl ? [{ id: `${g.id}-bonus`, label: 'Varianta 2', audioUrl: g.bonusAudioUrl }] : []),
    ];
  }, [g]);

  const lyrics = g?.lyrics || g?.lyricsDraft || '';
  const paid = !!g && (g.type === 'full' || g.paidUnlocked);
  const justPaid = search.get('success') === '1' || !!search.get('paymentId');
  const awaitingPay = g?.status === 'pending' && !g.paidUnlocked && !justPaid;
  const making = !!g && !awaitingPay && (IN_PROGRESS.has(g.status) || (g.status === 'failed' && !g.audioUrl));
  const ready = tracks.length > 0;
  const remaking = (g?.workingVariants?.length ?? 0) > 0;

  return (
    <>
      <div className="cadou-wrap cadou-song-wrap cadou-song">
          <Link href={mine} className="cadou-song-back">← Manelele mele</Link>

          {error && <p className="cadou-err" role="alert">{error}</p>}
          {!g && !error && <p className="cadou-hint">Încărcăm cadoul…</p>}

          {g && (
            <>
              {unlocking && (
                <div className="cadou-song-card cadou-song-note">Confirmăm plata…</div>
              )}

              {awaitingPay && (
                <div className="cadou-song-card cadou-song-status">
                  <p>Plata nu s-a finalizat. Revino și închide comanda ca să pornim maneaua.</p>
                  <Link href={`${studio}?paymentCanceled=1&genId=${g.id}`} className="cadou-cta">Reia plata</Link>
                </div>
              )}

              {making && (
                <div className="cadou-song-card">
                  <CadouWaitCard cover={cover} createdAt={g.createdAt} hasLyrics={!!lyrics} />
                </div>
              )}

              <div className="cadou-song-stack">
                {ready && (
                  <section className="cadou-song-card cadou-song-play">
                    <div className="cadou-song-play-head">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cover} alt="" />
                      <div>
                        <div className="ttl">{tracks.length > 1 ? 'Ascultă variantele' : 'Ascultă maneaua'}</div>
                        <div className="who">Pentru {titleName}{from ? ` · de la ${from}` : ''}</div>
                      </div>
                    </div>
                    {tracks.map((v) => (
                      <div key={v.id} className="cadou-song-track">
                        <CadouDemoPlayer audioUrl={v.audioUrl} label={tracks.length > 1 ? v.label : undefined} />
                      </div>
                    ))}
                    {g.workingVariants?.map((v) => (
                      <div key={v.id} className="cadou-song-pending" aria-live="polite">
                        <div className="cadou-song-track-lab">{v.label}</div>
                        <strong>Compunem varianta nouă…</strong>
                        <span>Piesele de mai sus rămân. Câteva minute.</span>
                      </div>
                    ))}
                  </section>
                )}

                {ready && paid && (
                  <CadouVideoSection generation={g} cover={cover} />
                )}

                {ready && paid && g.isOwner && (
                  <CadouRemakeCard
                    generationId={g.id}
                    usedAt={g.freeRemakeUsedAt}
                    busy={remaking}
                    onStarted={() => void refresh()}
                  />
                )}

                {lyrics && (
                  <section className="cadou-song-card cadou-song-sheet">
                    <h2>Versurile</h2>
                    <CadouLyrics text={lyrics} />
                  </section>
                )}

                {g.isOwner && (
                  <CadouOrderCard generation={g} />
                )}
              </div>
            </>
          )}
      </div>
    </>
  );
}
