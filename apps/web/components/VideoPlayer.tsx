'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  /** URL deja rezolvat (absolut) al videoclipului. */
  src: string;
  /** Poster opțional (poza socială selectată). */
  poster?: string | null;
}

const GOLD = '#f1c84d';

/**
 * Player video custom, branded (auriu/negru), robust și mobile-first.
 * - controale mari pentru tap (play/pause central, seek, mute, fullscreen, download)
 * - `playsInline` + `preload="metadata"` + poster din poza socială
 * - degradare grațioasă: la `onError` afișează mesaj prietenos + download +
 *   link „deschide într-un tab nou" în loc să crape pagina.
 */
export function VideoPlayer({ src, poster }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [errored, setErrored] = useState(false);
  const [ready, setReady] = useState(false);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {/* autoplay/gest, ignoră */});
    } else {
      v.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const onSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(duration) || duration <= 0) return;
    const pct = Number(e.target.value);
    v.currentTime = (pct / 100) * duration;
    setCurrent(v.currentTime);
  }, [duration]);

  const goFullscreen = useCallback(() => {
    const v = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      requestFullscreen?: () => Promise<void>;
    }) | null;
    if (!v) return;
    try {
      if (v.requestFullscreen) {
        v.requestFullscreen().catch(() => {});
      } else if (typeof v.webkitEnterFullscreen === 'function') {
        // iOS Safari — doar pe element, nu pe container.
        v.webkitEnterFullscreen();
      }
    } catch {/* noop */}
  }, []);

  // Sincronizăm starea muted inițială (în caz că browserul forțează mute).
  useEffect(() => {
    const v = videoRef.current;
    if (v) setMuted(v.muted);
  }, []);

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  // ── Fallback grațios la eroare de redare ───────────────────────────────────
  if (errored) {
    return (
      <div style={{
        padding: 16, borderRadius: 12, background: '#000',
        border: '1px solid rgba(241,200,77,0.25)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: 'var(--gold-2)', marginBottom: 12 }}>
          Videoclipul nu poate fi redat aici.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a
            href={src}
            download
            className="btn btn-ghost btn-sm"
            style={{ textDecoration: 'none' }}
          >
            ⬇ Descarcă videoclipul
          </a>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ textDecoration: 'none' }}
          >
            ↗ Deschide într-un tab nou
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative', borderRadius: 12, overflow: 'hidden',
      background: '#000', border: '1px solid rgba(241,200,77,0.25)',
    }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        playsInline
        preload="metadata"
        onClick={togglePlay}
        onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); setReady(true); }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setErrored(true)}
        style={{ width: '100%', display: 'block', background: '#000', cursor: 'pointer' }}
      />

      {/* Buton mare play/pause central — zonă uriașă de tap pe mobil. */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pauză' : 'Redă'}
        style={{
          position: 'absolute', inset: 0, margin: 'auto',
          width: 72, height: 72, borderRadius: '50%', border: 'none',
          background: playing ? 'rgba(0,0,0,0.35)' : 'linear-gradient(180deg,#fff5cc,#ffe28a,#f1c84d,#b07c1e)',
          color: playing ? '#fff' : '#2a1a04',
          display: playing ? 'none' : 'grid', placeItems: 'center',
          cursor: 'pointer', boxShadow: '0 6px 20px rgba(241,200,77,0.4)',
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>

      {/* Bară de controale — fundal gradient pentru lizibilitate pe orice cadru. */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '10px 12px 10px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 100%)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {/* Seek bar — input range stilizat, scrubbing direct. */}
        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={pct}
          onChange={onSeek}
          aria-label="Derulează videoclipul"
          disabled={!ready}
          style={{
            width: '100%', height: 20, cursor: ready ? 'pointer' : 'default',
            accentColor: GOLD, background: 'transparent',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Play/Pause mic în bară. */}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pauză' : 'Redă'}
            style={iconBtn}
          >
            {playing ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>

          <span style={timeStyle}>{fmt(current)} / {fmt(duration)}</span>

          <div style={{ flex: 1 }} />

          {/* Mute/Volum. */}
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Activează sunetul' : 'Dezactivează sunetul'} style={iconBtn}>
            {muted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-1.3-3.2l-1 1A3 3 0 0 1 15.5 12c0 .5-.1 1-.3 1.4l1.1 1.1c.4-.7.7-1.6.7-2.5zM4.3 3 3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.3 1.3-1.3L4.3 3z" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" /></svg>
            )}
          </button>

          {/* Download. */}
          <a href={src} download aria-label="Descarcă videoclipul" style={{ ...iconBtn, textDecoration: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.6l3.3-3.3 1.4 1.4L12 17.4l-4.7-4.7 1.4-1.4L12 13.6V3zM5 19h14v2H5z" /></svg>
          </a>

          {/* Fullscreen. */}
          <button type="button" onClick={goFullscreen} aria-label="Ecran complet" style={iconBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5h5V3H3v7h2V5zm9-2v2h5v5h2V3h-7zM5 19v-5H3v7h7v-2H5zm14 0h-5v2h7v-7h-2v5z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 36, height: 36, flexShrink: 0,
  display: 'grid', placeItems: 'center',
  background: 'rgba(0,0,0,0.4)', color: GOLD,
  border: '1px solid rgba(241,200,77,0.35)', borderRadius: 8,
  cursor: 'pointer',
};

const timeStyle: React.CSSProperties = {
  fontSize: 12, color: '#fff', fontFamily: 'ui-monospace, monospace',
  whiteSpace: 'nowrap',
};

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
