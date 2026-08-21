'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ic } from './icons';
import { resolveMediaUrl } from '@/lib/api';
import { claimPlayback, releasePlayback } from '@/lib/audio-registry';
import { track as trackEvent } from '@/lib/tracker';

type Stopper = () => void;

interface Props {
  audioUrl: string;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  /** @deprecated demo-ul e acum un fișier separat de 30s pe backend.
   *  Lăsat ca prop pentru compatibilitate dar nu mai trunchiază nimic. */
  maxDurationSec?: number;
  /** Secunda de la care să pornească playback-ul (preview-ul scurt al unui
   *  demo curat — sare peste intro). Aplicat când track-ul devine ready. */
  startSec?: number;
  /** Auto-play la `ready`. Folosit în popup-ul de demo-uri, unde montăm
   *  player-ul EXACT când userul a apăsat Play (deci e o continuare a unui
   *  gest user, nu un autoplay agresiv — browsers nu blochează). */
  autoPlay?: boolean;
  /** Când e setat, raportăm play (prima dată) + download la analytics-ul intern.
   *  Doar pentru piesa LIVRATĂ din /m/[id] — NU pentru sample-uri/demo-uri. */
  trackContext?: { generationId?: string; variant?: string };
}

export function ManeaPlayer({ audioUrl: rawAudioUrl, title, subtitle, compact = false, maxDurationSec, startSec, autoPlay, trackContext }: Props) {
  const audioUrl = resolveMediaUrl(rawAudioUrl) ?? rawAudioUrl;
  // Ref ca handler-ele wavesurfer (create o singură dată) să vadă mereu ultimul
  // context + să raporteze play-ul O SINGURĂ dată per montare.
  const trackCtxRef = useRef(trackContext);
  trackCtxRef.current = trackContext;
  const playTrackedRef = useRef(false);
  const previewLimited = typeof maxDurationSec === 'number' && maxDurationSec > 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ws: any = null;
    (async () => {
      try {
        const WaveSurferModule = await import('wavesurfer.js');
        if (cancelled || !containerRef.current) return;
        ws = WaveSurferModule.default.create({
          container: containerRef.current,
          waveColor: 'rgba(241,200,77,0.35)',
          progressColor: '#f1c84d',
          cursorColor: '#ffe28a',
          height: compact ? 32 : 48,
          barWidth: 2,
          barGap: 1.5,
          barRadius: 1,
          normalize: true,
          url: audioUrl,
        });
        wsRef.current = ws;
        ws.on('ready', () => {
          setDuration(ws.getDuration());
          setLoaded(true);
          // Sari peste intro pentru demo-urile curate (popup-ul homepage).
          if (typeof startSec === 'number' && startSec > 0) {
            const d = ws.getDuration();
            if (d > 0 && startSec < d) {
              try {
                ws.seekTo(startSec / d);
              } catch {}
            }
          }
          if (autoPlay) {
            try {
              ws.play();
            } catch {}
          }
        });
        ws.on('audioprocess', () => {
          const t = ws.getCurrentTime();
          setCurrentTime(t);
          if (previewLimited && t >= (maxDurationSec as number)) {
            try {
              ws.pause();
              ws.seekTo(0);
            } catch {}
          }
        });
        ws.on('seeking', () => {
          const t = ws.getCurrentTime();
          setCurrentTime(t);
          if (previewLimited && t > (maxDurationSec as number)) {
            try {
              ws.seekTo((maxDurationSec as number) / Math.max(ws.getDuration(), 1));
              ws.pause();
            } catch {}
          }
        });
        const stopFn = () => {
          try {
            ws.pause();
          } catch {
            /* noop */
          }
        };
        ws.on('play', () => {
          const media = typeof ws.getMediaElement === 'function' ? ws.getMediaElement() : null;
          claimPlayback(stopFn, media ?? undefined);
          setIsPlaying(true);
          const ctx = trackCtxRef.current;
          if (ctx && !playTrackedRef.current) {
            playTrackedRef.current = true;
            trackEvent({ type: 'song_play', props: { generationId: ctx.generationId, variant: ctx.variant } });
          }
        });
        ws.on('pause', () => {
          releasePlayback(stopFn);
          setIsPlaying(false);
        });
        ws.on('finish', () => {
          releasePlayback(stopFn);
          setIsPlaying(false);
        });
        ws.on('error', (err: Error) => setError(err.message));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Eroare');
      }
    })();
    return () => {
      cancelled = true;
      try {
        ws?.destroy();
      } catch {}
    };
  }, [audioUrl, compact]);

  function toggle() {
    wsRef.current?.playPause();
  }

  // Stopper stabil pentru fallback-ul nativ (înregistrat în audio-registry).
  const nativeStopRef = useRef<Stopper | null>(null);
  const getNativeStop = useCallback((el: HTMLAudioElement) => {
    if (!nativeStopRef.current) {
      nativeStopRef.current = () => {
        try {
          el.pause();
        } catch {
          /* noop */
        }
      };
    }
    return nativeStopRef.current;
  }, []);

  // Fallback: dacă wavesurfer eșuează (de regulă din cauza CORS-ului),
  // afișăm un audio nativ stilizat — user-ul tot poate asculta.
  if (error) {
    return (
      <div
        style={{
          padding: compact ? '8px 10px' : '12px 14px',
          background: 'rgba(241,200,77,0.04)',
          border: '1px solid rgba(241,200,77,0.2)',
          borderRadius: 10,
        }}
      >
        {(title || subtitle) && !compact && (
          <div style={{ marginBottom: 6 }}>
            {title && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-2)' }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.55)' }}>{subtitle}</div>}
          </div>
        )}
        <audio
          controls
          src={audioUrl}
          style={{ width: '100%', height: compact ? 32 : 40 }}
          onPlay={(e) => claimPlayback(getNativeStop(e.currentTarget), e.currentTarget)}
          onPause={(e) => releasePlayback(getNativeStop(e.currentTarget))}
          onEnded={(e) => releasePlayback(getNativeStop(e.currentTarget))}
          onTimeUpdate={(e) => {
            if (!previewLimited) return;
            const el = e.currentTarget;
            if (el.currentTime >= (maxDurationSec as number)) {
              el.pause();
              el.currentTime = 0;
            }
          }}
        />
        {previewLimited && (
          <div style={{ marginTop: 4, fontSize: 10, color: '#f1c84d' }}>
            🔒 Previzualizare {maxDurationSec}s — deblochează piesa pentru audiția completă.
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: compact ? 8 : 12,
        alignItems: 'center',
        padding: compact ? '8px 10px' : '12px 14px',
        background: 'rgba(241,200,77,0.04)',
        border: '1px solid rgba(241,200,77,0.2)',
        borderRadius: 10,
      }}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!loaded}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        style={{
          width: compact ? 36 : 44,
          height: compact ? 36 : 44,
          flexShrink: 0,
          borderRadius: '50%',
          background: 'linear-gradient(180deg,#fff5cc 0%,#ffe28a 30%,#f1c84d 60%,#b07c1e 100%)',
          color: '#2a1a04',
          border: 'none',
          cursor: loaded ? 'pointer' : 'wait',
          display: 'grid',
          placeItems: 'center',
          boxShadow: '0 4px 12px rgba(241,200,77,0.3)',
          opacity: loaded ? 1 : 0.5,
          transition: 'transform 0.1s',
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {isPlaying ? <Ic.Pause s={compact ? 14 : 16} /> : <Ic.Play s={compact ? 14 : 16} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {(title || subtitle) && !compact && (
          <div style={{ marginBottom: 4 }}>
            {title && (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--gold-2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.55)' }}>{subtitle}</div>
            )}
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', minWidth: 0 }} />
        {!error && loaded && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: 'rgba(255,245,220,0.5)',
              marginTop: 2,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            <span>{fmt(currentTime)}</span>
            <span>
              {previewLimited
                ? `🔒 ${fmt(maxDurationSec as number)} preview`
                : fmt(duration)}
            </span>
          </div>
        )}
      </div>
      {!previewLimited && (
        <a
          href={audioUrl}
          download
          title="Descarcă MP3"
          onClick={() => {
            const ctx = trackCtxRef.current;
            if (ctx) trackEvent({ type: 'song_download', props: { generationId: ctx.generationId, variant: ctx.variant } });
          }}
          style={{
            color: 'rgba(255,245,220,0.6)',
            padding: 6,
            borderRadius: 6,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <Ic.Download s={16} />
        </a>
      )}
    </div>
  );
}

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
