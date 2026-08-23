'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError, resolveMediaUrl, type GenerationDto } from '@/lib/api';
import { prettifyLyrics } from '@/lib/lyrics-display';
import { getPagePath } from '@/lib/page-slugs';
import { useSite } from '@/lib/site-context';
import { ChorusClipsSection, chorusClipUrls } from '@/components/ChorusClipsSection';
import { SocialImagesSection } from '@/components/SocialImagesSection';
import { OwnerPasswordControl, UnlockPrompt, useUnlockPassword } from '@/components/UnlockPassword';
import { CadouShell } from './Shell';
import { CadouDemoPlayer } from './DemoPlayer';
import { CadouVideoSection } from './VideoSection';
import { CadouRemakeCard } from './RemakeCard';
import { CadouFollowCard } from './FollowCard';
import { CadouFold } from './Fold';
import { cadouStyleArt } from './style-art';
import { useCadouFromName } from './from-name';
import { useExperienceCatalog } from '../use-experience-catalog';
import { PACKAGES } from '@/lib/packages';

const IN_PROGRESS = new Set([
  'pending', 'queued', 'writing_lyrics', 'checking_lyrics', 'generating_audio', 'running',
]);

const AVG_SEC = 6 * 60;
const LINEAR_SEC = 5 * 60;
const RING = 2 * Math.PI * 46;

const NO_VALUE = '—';

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
  const t = useTranslations('cadou.song');
  const [now, setNow] = useState(() => Date.now());
  const startMs = useMemo(() => {
    const parsed = new Date(createdAt).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  }, [createdAt]);

  const working = useMemo(
    () => [t('workingLyrics'), t('workingRhyme'), t('workingMusic'), t('workingVoice')],
    [t],
  );
  const stretchLines = useMemo(
    () => [t('stretchMix'), t('stretchPolish'), t('stretchAlmost')],
    [t],
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, (now - startMs) / 1000);
  const { remainSec, progress, stretch } = waitEta(elapsed);
  const phrase = stretch
    ? stretchLines[Math.floor(now / 2800) % stretchLines.length]
    : hasLyrics
      ? t('waitOnLyrics')
      : working[Math.floor(now / 2800) % working.length];
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
      <div className="cadou-wait-time" aria-label={t('waitRemaining', { time: fmtRemain(remainRound) })}>
        {fmtRemain(remainRound)}
      </div>
      <span className="cadou-wait-eq" aria-hidden>
        <i /><i /><i /><i /><i />
      </span>
      <div className="cadou-wait-lab">
        {stretch ? t('waitLabelAlmost') : t('waitLabelEta')}
      </div>
      <strong>
        {stretch ? t('waitTitleAlmost') : hasLyrics ? t('waitTitleLyrics') : t('waitTitleMaking')}
      </strong>
      <span>{phrase}</span>
      <div className="cadou-wait-bar" aria-hidden>
        <i style={{ width: `${Math.max(6, progress * 100)}%` }} />
      </div>
    </div>
  );
}

function CadouLyrics({ text }: { text: string }) {
  const site = useSite();
  const pretty = prettifyLyrics(text, site.locale);
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
  const t = useTranslations('cadou.song');
  const fromName = useCadouFromName();
  const catalog = useExperienceCatalog();
  const g = generation;
  const rec = fromName.displayRecipient(g.recipientName);
  const noDedic = !g.recipientName?.trim() || g.recipientName.trim() === NO_VALUE;
  const from = fromName.senderOf(g);
  const styleNm = catalog.styles.find((s) => s.id === g.style)?.nm ?? g.style ?? NO_VALUE;
  const occNm = catalog.occasions.find((o) => o.id === g.occasion)?.nm ?? (g.occasion && g.occasion !== 'altul' ? g.occasion : NO_VALUE);
  const voiceNm = catalog.voices.find((v) => v.id === g.voiceArtist)?.nm
    ?? (g.voiceArtist === 'female' ? t('voiceFemale') : t('voiceMale'));
  const pack = PACKAGES.find((p) => p.tier === g.packageTier)?.nameRO ?? g.packageTier ?? NO_VALUE;
  const story = fromName.stripFromLine(g.message);
  const rows: Array<[string, string]> = [
    [t('orderStyle'), styleNm],
    [t('orderOccasion'), occNm || NO_VALUE],
    [t('orderVoice'), voiceNm],
    [t('orderFor'), noDedic ? t('orderNoDedication') : rec],
    [t('orderFrom'), from || NO_VALUE],
    [t('orderPackage'), pack],
  ];
  if (story) rows.push([t('orderStory'), story]);
  if (g.customLyrics?.trim()) rows.push([t('orderCustomLyrics'), g.customLyrics.trim()]);

  return (
    <CadouFold title={t('orderTitle')} className="cadou-order" defaultOpen={false}>
      <div className="cadou-order-body">
        {rows.map(([k, v]) => (
          <div key={k} className="cadou-order-row">
            <b>{k}</b>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </CadouFold>
  );
}

export default function CadouSongView() {
  return (
    <CadouShell>
      <Suspense fallback={<CadouSongFallback />}>
        <CadouSongInner />
      </Suspense>
    </CadouShell>
  );
}

function CadouSongFallback() {
  const t = useTranslations('cadou.song');
  return (
    <div className="cadou-wrap cadou-song-wrap">
      <div className="cadou-panel cadou-song"><p className="cadou-hint">{t('loading')}</p></div>
    </div>
  );
}

function CadouSongInner() {
  const t = useTranslations('cadou.song');
  const fromName = useCadouFromName();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const site = useSite();
  const id = params?.id;
  const mine = getPagePath(site.locale, 'manelele-mele');
  const studio = getPagePath(site.locale, 'studio');

  const [g, setG] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  // Parola de privacy peste conținutul vechi privat (poza încărcată de owner +
  // colaje). Owner-ul nu are nevoie de ea; vizitatorul o introduce o dată.
  const { password, unlock } = useUnlockPassword(id);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const fresh = await api.getGeneration(id, password ?? undefined);
      setG(fresh);
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError && (e.status === 401 || e.status === 403)
          ? t('errForbidden')
          : t('errLoad'),
      );
    }
  }, [id, password, t]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!g) return;
    const waitingAudio = g.status === 'failed' && !g.audioUrl;
    const enriching = g.status === 'succeeded' && g.deliverablesReady === false;
    const remaking = (g.workingVariants?.length ?? 0) > 0;
    const remakePaid = search.get('remakePaid') === '1';
    if (!IN_PROGRESS.has(g.status) && !waitingAudio && !enriching && !remaking && !remakePaid) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [g?.status, g?.audioUrl, g?.deliverablesReady, g?.workingVariants?.length, refresh, search]);

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

  const titleName = fromName.displayRecipient(g?.recipientName);
  const from = g ? fromName.senderOf(g) : null;
  const cover = g
    ? (resolveMediaUrl(g.coverUrl) ?? cadouStyleArt(g.style))
    : cadouStyleArt('iubire');

  const trackMain = t('trackMain');
  const trackBonus = t('trackBonus');
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
      ...(g.audioUrl ? [{ id: `${g.id}-main`, label: trackMain, audioUrl: g.audioUrl }] : []),
      ...(g.bonusAudioUrl ? [{ id: `${g.id}-bonus`, label: trackBonus, audioUrl: g.bonusAudioUrl }] : []),
    ];
  }, [g, trackMain, trackBonus]);

  const lyrics = g?.lyrics || g?.lyricsDraft || '';
  const paid = !!g && (g.type === 'full' || g.paidUnlocked);
  const justPaid = search.get('success') === '1' || !!search.get('paymentId');
  const awaitingPay = g?.status === 'pending' && !g.paidUnlocked && !justPaid;
  const making = !!g && !awaitingPay && (IN_PROGRESS.has(g.status) || (g.status === 'failed' && !g.audioUrl));
  const ready = tracks.length > 0;
  const remaking = (g?.workingVariants?.length ?? 0) > 0;
  const showPlay = ready;
  const showVideo = ready && paid;
  const showRemake = ready && paid && !!g?.isOwner;
  const showFollow = ready && paid && !!g?.isOwner;
  const showLyrics = !!lyrics;
  const showOrder = !!g?.isOwner;
  // ── Livrabile vechi (nu se mai vând, dar comenzile plătite înainte le au) ──
  // Le afișăm STRICT când generarea chiar are datele — comenzile noi nu le au,
  // deci pentru ele nu apare nicio secțiune goală.
  const clips = g ? chorusClipUrls(g) : [];
  const socialImages = g?.socialImages ?? [];
  const showClips = ready && clips.length > 0;
  const showSocial = g?.status === 'succeeded' && socialImages.length > 0;
  // Parola de privacy: doar unde există conținut privat vechi (poze de share)
  // sau unde owner-ul a setat deja una.
  const showPin = !!g?.isOwner && paid && g?.status === 'succeeded'
    && (socialImages.length > 0 || !!g?.socialImageUploaded || !!g?.hasUnlockPassword);
  const locked = !!g && !g.isOwner && !!g.hasUnlockPassword && !g.unlocked;
  const last = showOrder
    ? 'order'
    : showLyrics
      ? 'lyrics'
      : showFollow
        ? 'follow'
        : showRemake
          ? 'remake'
          : showPin
            ? 'pin'
            : showSocial
              ? 'social'
              : showVideo
                ? 'video'
                : showClips
                  ? 'clips'
                  : 'play';

  return (
    <>
      <div className="cadou-wrap cadou-song-wrap cadou-song">
          <Link href={mine} className="cadou-song-back">{t('back')}</Link>

          {error && <p className="cadou-err" role="alert">{error}</p>}
          {!g && !error && <p className="cadou-hint">{t('loading')}</p>}

          {g && (
            <>
              {unlocking && (
                <div className="cadou-song-card cadou-song-note">{t('confirmingPayment')}</div>
              )}

              {awaitingPay && (
                <div className="cadou-song-card cadou-song-status">
                  <p>{t('awaitingPay')}</p>
                  <Link href={`${studio}?paymentCanceled=1&genId=${g.id}`} className="cadou-cta">{t('resumePayment')}</Link>
                </div>
              )}

              {making && (
                <div className="cadou-song-card">
                  <CadouWaitCard cover={cover} createdAt={g.createdAt} hasLyrics={!!lyrics} />
                </div>
              )}

              {/* Manea privată (livrabil vechi): vizitatorul cere parola de la
                  cel care a comandat-o ca să vadă poza încărcată + colajele. */}
              {locked && (
                <UnlockPrompt skin="cadou" generationId={g.id} onUnlocked={unlock} />
              )}

              <div className="cadou-song-stack">
                {showPlay && (
                  <CadouFold
                    title={tracks.length > 1 ? t('playTitleMany') : t('playTitleOne')}
                    className="cadou-song-play"
                    defaultOpen={last !== 'play'}
                  >
                    <div className="cadou-song-play-head">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cover} alt="" />
                      <div>
                        <div className="ttl">{t('forName', { name: titleName })}</div>
                        <div className="who">{from ? t('fromName', { from }) : t('personalized')}</div>
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
                        <strong>{t('pendingTitle')}</strong>
                        <span>{t('pendingSub')}</span>
                      </div>
                    ))}
                  </CadouFold>
                )}

                {/* Clipurile pe refren — livrabil vechi (premium), separat de
                    colajele din `CadouVideoSection`. */}
                {showClips && (
                  <ChorusClipsSection
                    generation={g}
                    skin="cadou"
                    posterFallback={cover}
                    defaultOpen={last !== 'clips'}
                  />
                )}

                {showVideo && (
                  <CadouVideoSection
                    generation={g}
                    cover={cover}
                    password={password ?? undefined}
                    defaultOpen={last !== 'video'}
                  />
                )}

                {/* Poza de share — livrabil vechi (plus/premium). */}
                {showSocial && (
                  <SocialImagesSection
                    generation={g}
                    isOwner={!!g.isOwner}
                    skin="cadou"
                    defaultOpen={last !== 'social'}
                    // Endpoint-urile select/upload întorc un obiect PARȚIAL —
                    // facem merge ca să nu golim restul câmpurilor.
                    onUpdated={(fresh) => setG((prev) => (prev ? { ...prev, ...fresh } : prev))}
                  />
                )}

                {/* Parola peste pozele private (livrabil vechi) — doar owner. */}
                {showPin && (
                  <OwnerPasswordControl
                    skin="cadou"
                    generationId={g.id}
                    hasPassword={!!g.hasUnlockPassword}
                    currentPin={g.unlockPin ?? null}
                    defaultOpen={last !== 'pin'}
                    onChanged={() => void refresh()}
                  />
                )}

                {showRemake && (
                  <CadouRemakeCard
                    generationId={g.id}
                    remaining={g.freeRemakeRemaining ?? (g.freeRemakeUsedAt ? 0 : 1)}
                    quota={g.freeRemakeQuota ?? 1}
                    paidCents={g.paidRemakeCents}
                    busy={remaking}
                    canceled={search.get('remakeCanceled') === '1'}
                    defaultOpen={last !== 'remake'}
                    onStarted={() => void refresh()}
                  />
                )}

                {showFollow && <CadouFollowCard defaultOpen={last !== 'follow'} />}

                {showLyrics && (
                  <CadouFold title={t('lyricsTitle')} className="cadou-song-sheet" defaultOpen={last !== 'lyrics'}>
                    <CadouLyrics text={lyrics} />
                  </CadouFold>
                )}

                {showOrder && (
                  <CadouOrderCard generation={g} />
                )}
              </div>
            </>
          )}
      </div>
    </>
  );
}
