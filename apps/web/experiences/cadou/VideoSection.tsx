'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, resolveMediaUrl, type CollageDto, type GenerationDto } from '@/lib/api';
import { claimPlayback, releasePlayback } from '@/lib/audio-registry';
import { cadouClipLabel, cadouClipTracks } from './video-tracks';

function CadouClipPlayer({
  src,
  poster,
  label,
}: {
  src: string;
  poster?: string | null;
  label: string;
}) {
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
    const title = `${label} — Manele Cadou`;
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const file = new File([blob], 'manea.mp4', { type: blob.type || 'video/mp4' });
      const canFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canFiles && navigator.share) {
        await navigator.share({
          files: [file],
          title,
          text: kind === 'tiktok'
            ? 'Videoclipul manelei mele — gata de TikTok'
            : title,
        });
        return;
      }
      if (kind === 'tiktok') {
        const a = document.createElement('a');
        a.href = src;
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
          {busyShare === 'tiktok' ? 'Se pregătește…' : 'Postează pe TikTok'}
        </button>
        <button
          type="button"
          className="cadou-clip-btn"
          onClick={() => void fileShare('send')}
          disabled={busyShare !== null}
        >
          {busyShare === 'send' ? 'Se trimite…' : 'Trimite clipul'}
        </button>
        <a className="cadou-clip-btn" href={src} download>
          Descarcă
        </a>
      </div>
    </article>
  );
}

function CadouClipLoader({ label }: { label: string }) {
  return (
    <article className="cadou-clip is-loading" aria-live="polite">
      <div className="cadou-clip-lab">{label}</div>
      <div className="cadou-clip-frame cadou-clip-wait">
        <span className="cadou-clip-spin" aria-hidden />
        <strong>Montăm clipul</strong>
        <span>Pozele tale pe melodie. Câteva minute.</span>
      </div>
    </article>
  );
}

export function CadouVideoSection({
  generation,
  cover,
}: {
  generation: GenerationDto;
  cover: string;
}) {
  const g = generation;
  const tracks = useMemo(() => cadouClipTracks(g), [g]);
  const [collages, setCollages] = useState<CollageDto[]>([]);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await api.listCollages(g.id);
      if (cancelled) return;
      setCollages(list);
      if (list.some((c) => c.status === 'pending' || c.status === 'processing')) {
        setPolling(true);
      }
    })();
    return () => { cancelled = true; };
  }, [g.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#cadou-video') return;
    document.getElementById('cadou-video')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [collages.length, polling]);

  useEffect(() => {
    if (!polling) return;
    const tick = async () => {
      const list = await api.listCollages(g.id);
      setCollages(list);
      if (!list.some((c) => c.status === 'pending' || c.status === 'processing')) {
        setPolling(false);
      }
    };
    const id = setInterval(() => void tick(), 4000);
    return () => clearInterval(id);
  }, [polling, g.id]);

  const byTrack = (list: CollageDto[]) =>
    [...list].sort((a, b) => {
      const ia = tracks.findIndex((t) => t.track === a.track);
      const ib = tracks.findIndex((t) => t.track === b.track);
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
    <section id="cadou-video" className="cadou-song-card cadou-video">
      <h2>Videoclipul</h2>
      <p className="cadou-video-lead">
        {tracks.length > 1
          ? `Câte un clip vertical pe fiecare variantă a manelei (${tracks.length}). Gata de TikTok.`
          : 'Clip vertical pe manea, gata de TikTok.'}
      </p>

      {working.length > 0 && (
        <div className="cadou-clips">
          {(working.length ? working : tracks.map((t) => ({ id: t.track, track: t.track } as CollageDto))).map((c) => (
            <CadouClipLoader key={c.id} label={cadouClipLabel(c.track, tracks)} />
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
              label={cadouClipLabel(c.track, tracks)}
            />
          ))}
        </div>
      )}

      {failed.length > 0 && working.length === 0 && orderedDone.length === 0 && (
        <p className="cadou-err" role="alert">Nu am putut monta videoclipul. Încearcă din nou cu pozele tale.</p>
      )}

      {isOwner && working.length === 0 && (
        <div className="cadou-video-cta">
          {orderedDone.length === 0 ? (
            <>
              <p>Încarcă pozele și le montăm pe fiecare variantă a manelei.</p>
              <Link href={studioHref} className="cadou-cta">Fă videoclipul</Link>
            </>
          ) : (
            <Link href={studioHref} className="cadou-ghost">Fă alt videoclip</Link>
          )}
        </div>
      )}
    </section>
  );
}
