'use client';

import { useEffect, useRef } from 'react';
import { downloadUrl } from '@/lib/download';
import { useTranslations } from 'next-intl';
import { resolveMediaUrl, type GenerationDto } from '@/lib/api';
import { claimPlayback, releasePlayback } from '@/lib/audio-registry';
import { VideoPlayer } from '@/components/VideoPlayer';
import type { SongSkin } from '@/components/song-skin';
import { CadouFold } from '@/experiences/cadou/Fold';
import { useCadouTrackLabels } from '@/experiences/cadou/video-tracks';

/**
 * Clipurile SCURTE verticale pe refren (`videoUrl` / `videoUrlBonus`) — livrabil
 * vechi al pachetului premium. Nu se mai vinde, dar comenzile plătite înainte îl
 * au și trebuie să rămână vizibil pe pagina clientului.
 *
 * NU are legătură cu colajele video (`listCollages`), care sunt un livrabil
 * separat, generat din pozele încărcate de client.
 */
export function chorusClipUrls(g: GenerationDto): string[] {
  return [g.videoUrl, g.videoUrlBonus].filter(Boolean) as string[];
}

const classicHeader: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8,
};

export function ChorusClipsSection({
  generation,
  skin,
  pending = false,
  posterFallback,
  defaultOpen = true,
}: {
  generation: GenerationDto;
  skin: SongSkin;
  /** Livrabilele premium încă se montează → placeholder în loc de secțiune goală. */
  pending?: boolean;
  /** Poster de rezervă când generarea nu are poză de share (cadou: coperta). */
  posterFallback?: string | null;
  /** cadou: secțiunea pornește deschisă sau pliată. */
  defaultOpen?: boolean;
}) {
  const t = useTranslations('cadou.legacy.clips');
  const trackLabels = useCadouTrackLabels();
  const g = generation;
  const clipPoster =
    resolveMediaUrl(g.socialImageUploaded ?? g.socialImageSelected ?? g.coverUrl)
    ?? posterFallback
    ?? null;
  const clips = [
    { url: g.videoUrl, label: trackLabels.variant1 },
    { url: g.videoUrlBonus, label: trackLabels.variant2 },
  ].filter((c): c is { url: string; label: string } => !!c.url);

  if (clips.length === 0 && !pending) return null;

  if (skin === 'classic') {
    return (
      <div style={{ marginTop: 16 }}>
        <div style={classicHeader}>
          {t('title')}
        </div>
        {clips.length > 0 ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {clips.map((c, i) => (
              <div key={c.url + i} style={{ flex: 1, minWidth: 0 }}>
                <VideoPlayer src={resolveMediaUrl(c.url)!} poster={clipPoster} />
              </div>
            ))}
          </div>
        ) : (
          <div className="ld" style={{ fontSize: 13, opacity: 0.85 }}>
            {t('pending')}
          </div>
        )}
      </div>
    );
  }

  return (
    <CadouFold title={t('titleFold')} className="cadou-video" defaultOpen={defaultOpen}>
      <p className="cadou-video-lead">
        {clips.length > 1 ? t('leadMany', { count: clips.length }) : t('leadOne')}
      </p>
      <div className="cadou-clips">
        {clips.length > 0
          ? clips.map((c, i) => (
              <CadouChorusClip
                key={c.url + i}
                src={resolveMediaUrl(c.url)!}
                poster={clipPoster}
                label={c.label}
                download={t('download')}
              />
            ))
          : (
              <article className="cadou-clip is-loading" aria-live="polite">
                <div className="cadou-clip-lab">{trackLabels.clip}</div>
                <div className="cadou-clip-frame cadou-clip-wait">
                  <span className="cadou-clip-spin" aria-hidden />
                  <strong>{t('pendingTitle')}</strong>
                  <span>{t('pendingSub')}</span>
                </div>
              </article>
            )}
      </div>
    </CadouFold>
  );
}

/** Un clip vertical în chenarul cadou, cu un singur player activ pe site. */
function CadouChorusClip({
  src,
  poster,
  label,
  download,
}: {
  src: string;
  poster?: string | null;
  label: string;
  download: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    const v = videoRef.current;
    if (v && stopRef.current) {
      try { v.pause(); } catch { /* ignore */ }
      releasePlayback(stopRef.current);
    }
  }, []);

  const onPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!stopRef.current) {
      stopRef.current = () => {
        try { v.pause(); } catch { /* ignore */ }
      };
    }
    claimPlayback(stopRef.current, v);
  };

  return (
    <article className="cadou-clip">
      <div className="cadou-clip-lab">{label}</div>
      <div className="cadou-clip-frame">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={src}
          poster={poster ?? undefined}
          controls
          playsInline
          preload="metadata"
          onPlay={onPlay}
        />
      </div>
      <div className="cadou-clip-actions">
        <a className="cadou-clip-btn" href={downloadUrl(src)} download>{download}</a>
      </div>
    </article>
  );
}
