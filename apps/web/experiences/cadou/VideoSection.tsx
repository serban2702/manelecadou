'use client';

import Link from 'next/link';
import { downloadUrl } from '@/lib/download';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, resolveMediaUrl, type CollageDto, type GenerationDto } from '@/lib/api';
import { claimPlayback, releasePlayback } from '@/lib/audio-registry';
import { useSite } from '@/lib/site-context';
import { cadouClipLabel, cadouClipTracks, useCadouTrackLabels } from './video-tracks';
import { CadouFold } from './Fold';

function CadouClipPlayer({
  src,
  poster,
  label,
}: {
  src: string;
  poster?: string | null;
  label: string;
}) {
  const site = useSite();
  const t = useTranslations('cadou.video.section');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [busyShare, setBusyShare] = useState<'tiktok' | 'send' | null>(null);

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

  const fileShare = async (kind: 'tiktok' | 'send') => {
    setBusyShare(kind);
    const title = t('shareTitle', { label, site: site.name });
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const file = new File([blob], 'manea.mp4', { type: blob.type || 'video/mp4' });
      const canFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canFiles && navigator.share) {
        await navigator.share({
          files: [file],
          title,
          text: kind === 'tiktok' ? t('shareTiktokText') : title,
        });
        return;
      }
      if (kind === 'tiktok') {
        const a = document.createElement('a');
        a.href = downloadUrl(src, 'manea.mp4');
        a.download = 'manea.mp4';
        a.click();
        window.open('https://www.tiktok.com/tiktokstudio/upload', '_blank', 'noopener,noreferrer');
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, url: window.location.href.split('?')[0] });
        return;
      }
      await navigator.clipboard.writeText(window.location.href.split('?')[0]);
    } catch {
      /* cancelled / unsupported */
    } finally {
      setBusyShare(null);
    }
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
        <button
          type="button"
          className="cadou-cta"
          onClick={() => void fileShare('tiktok')}
          disabled={busyShare !== null}
        >
          {busyShare === 'tiktok' ? t('shareTiktokBusy') : t('shareTiktok')}
        </button>
        <button
          type="button"
          className="cadou-clip-btn"
          onClick={() => void fileShare('send')}
          disabled={busyShare !== null}
        >
          {busyShare === 'send' ? t('shareSendBusy') : t('shareSend')}
        </button>
        <a className="cadou-clip-btn" href={src} download>
          {t('download')}
        </a>
      </div>
    </article>
  );
}

function CadouClipLoader({ label }: { label: string }) {
  const t = useTranslations('cadou.video.section');
  return (
    <article className="cadou-clip is-loading" aria-live="polite">
      <div className="cadou-clip-lab">{label}</div>
      <div className="cadou-clip-frame cadou-clip-wait">
        <span className="cadou-clip-spin" aria-hidden />
        <strong>{t('loaderTitle')}</strong>
        <span>{t('loaderSub')}</span>
      </div>
    </article>
  );
}

export function CadouVideoSection({
  generation,
  cover,
  password,
  defaultOpen = true,
}: {
  generation: GenerationDto;
  cover: string;
  /** Parola de privacy (livrabil vechi) — un vizitator deblocat vede colajele. */
  password?: string;
  defaultOpen?: boolean;
}) {
  const t = useTranslations('cadou.video.section');
  const trackLabels = useCadouTrackLabels();
  const g = generation;
  const tracks = useMemo(() => cadouClipTracks(g, trackLabels), [g, trackLabels]);
  const [collages, setCollages] = useState<CollageDto[]>([]);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await api.listCollages(g.id, password);
      if (cancelled) return;
      setCollages(list);
      if (list.some((c) => c.status === 'pending' || c.status === 'processing')) {
        setPolling(true);
      }
    })();
    return () => { cancelled = true; };
  }, [g.id, password]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#cadou-video') return;
    document.getElementById('cadou-video')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [collages.length, polling]);

  useEffect(() => {
    if (!polling) return;
    const tick = async () => {
      const list = await api.listCollages(g.id, password);
      setCollages(list);
      if (!list.some((c) => c.status === 'pending' || c.status === 'processing')) {
        setPolling(false);
      }
    };
    const id = setInterval(() => void tick(), 4000);
    return () => clearInterval(id);
  }, [polling, g.id, password]);

  const byTrack = (list: CollageDto[]) =>
    [...list].sort((a, b) => {
      const ia = tracks.findIndex((t2) => t2.track === a.track);
      const ib = tracks.findIndex((t2) => t2.track === b.track);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  const working = byTrack(collages.filter((c) => c.status === 'pending' || c.status === 'processing'));
  const done = byTrack(collages.filter((c) => c.status === 'succeeded' && c.videoUrl));
  const failed = collages.filter((c) => c.status === 'failed');
  const orderedDone = done;

  const isOwner = !!g.isOwner;
  const studioHref = `/m/${g.id}/video`;
  const poster = resolveMediaUrl(g.socialImageUploaded ?? g.socialImageSelected ?? g.coverUrl) ?? cover;

  if (!isOwner && orderedDone.length === 0 && working.length === 0) return null;

  return (
    <CadouFold id="cadou-video" title={t('title')} className="cadou-video" defaultOpen={defaultOpen}>
      <p className="cadou-video-lead">
        {tracks.length > 1 ? t('leadMany', { count: tracks.length }) : t('leadOne')}
      </p>

      {working.length > 0 && (
        <div className="cadou-clips">
          {(working.length ? working : tracks.map((tr) => ({ id: tr.track, track: tr.track } as CollageDto))).map((c) => (
            <CadouClipLoader key={c.id} label={cadouClipLabel(c.track, tracks, trackLabels)} />
          ))}
        </div>
      )}

      {orderedDone.length > 0 && (
        <div className="cadou-clips">
          {orderedDone.map((c) => (
            <CadouClipPlayer
              key={c.id}
              src={resolveMediaUrl(c.videoUrl!)!}
              poster={poster}
              label={cadouClipLabel(c.track, tracks, trackLabels)}
            />
          ))}
        </div>
      )}

      {failed.length > 0 && working.length === 0 && orderedDone.length === 0 && (
        <p className="cadou-err" role="alert">{t('failed')}</p>
      )}

      {isOwner && working.length === 0 && (
        <div className="cadou-video-cta">
          {orderedDone.length === 0 ? (
            <>
              <p>{t('ctaLead')}</p>
              <Link href={studioHref} className="cadou-cta">{t('ctaMake')}</Link>
            </>
          ) : (
            <Link href={studioHref} className="cadou-ghost">{t('ctaAnother')}</Link>
          )}
        </div>
      )}
    </CadouFold>
  );
}
