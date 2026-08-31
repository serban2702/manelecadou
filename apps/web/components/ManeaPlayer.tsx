'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { downloadUrl } from '@/lib/download';
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
  const t = useTranslations('player');
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
  // WaveSurfer descarcă și decodează fișierul ÎNTREG ca să deseneze unda, la
  // montare. Pe /istoric sunt 30 de carduri: 30 de MP3-uri, ~14 MB, înainte ca
  // vizitatorul să apese ceva. Așa că nu-l creăm decât când chiar e nevoie —
  // până atunci desenăm o undă decorativă. `autoPlay` înseamnă că player-ul a
  // fost montat exact la gestul userului, deci pornim direct.
  const [armed, setArmed] = useState(!!autoPlay);
  const playOnReadyRef = useRef(!!autoPlay);
  // Elementul de redare, creat ȘI pornit sincron în handler-ul de click.
  // iOS Safari deblochează redarea doar pentru elemente pe care `play()` a fost
  // apelat în interiorul gestului; un `play()` dintr-un callback `ready` de mai
  // târziu e respins. Îl dăm apoi lui WaveSurfer prin opțiunea `media`, ca să
  // nu-și creeze el altul (pe care iOS l-ar bloca).
  const mediaRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!armed) return undefined;
    let cancelled = false;
    let ws: any = null;
    (async () => {
      try {
        const WaveSurferModule = await import('wavesurfer.js');
        if (cancelled || !containerRef.current) return;
        // Culorile erau fixe, gândite pentru fundal închis — pe crema
        // interfeței `cadou` unda ieșea aproape invizibilă. Le citim din
        // variabile CSS, deci fiecare temă își pune propriile valori.
        const cs = getComputedStyle(containerRef.current);
        const pick = (name: string, fallback: string) =>
          cs.getPropertyValue(name).trim() || fallback;
        ws = WaveSurferModule.default.create({
          container: containerRef.current,
          ...(mediaRef.current ? { media: mediaRef.current } : {}),
          waveColor: pick('--wave-idle', 'rgba(241,200,77,0.35)'),
          progressColor: pick('--wave-progress', '#f1c84d'),
          cursorColor: pick('--wave-cursor', '#ffe28a'),
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
          if (playOnReadyRef.current) {
            playOnReadyRef.current = false;
            // Dacă elementul pornise deja din gest, îl lăsăm în pace — un
            // `play()` în plus ar reporni de la zero.
            const el = mediaRef.current;
            if (!el || el.paused) {
              try {
                ws.play();
              } catch {}
            } else {
              setIsPlaying(true);
            }
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
      try {
        mediaRef.current?.pause();
      } catch {}
    };
  }, [audioUrl, compact, armed]);

  function toggle() {
    // Primul click doar montează player-ul; redarea pornește la `ready`.
    // Contează că e tot în interiorul gestului userului, deci browserele nu
    // tratează pornirea ca autoplay nesolicitat.
    if (!armed) {
      // Ordinea contează: creăm și pornim elementul CÂT SUNTEM ÎNCĂ în gestul
      // userului, altfel iOS refuză. WaveSurfer îl preia apoi ca `media`.
      try {
        const el = new Audio(audioUrl);
        el.preload = 'auto';
        // Fără `crossOrigin`: redarea simplă n-are nevoie de CORS, iar setarea
        // lui ar lega pornirea piesei de antetele lui files.manelecadou.ro.
        // Azi le trimite (`vary: Origin` + `access-control-allow-origin: *`),
        // dar dacă s-ar schimba, butonul de play ar muri tăcut. WaveSurfer își
        // face oricum fetch-ul lui pentru desenarea undei, ca și până acum.
        mediaRef.current = el;
        void el.play().catch(() => undefined);
      } catch {
        mediaRef.current = null;
      }
      playOnReadyRef.current = true;
      setArmed(true);
      return;
    }
    wsRef.current?.playPause();
  }

  /** Undă decorativă cât timp fișierul nu e descărcat.
   *  Înălțimile se derivă din URL, nu din `Math.random()`: trebuie să iasă la
   *  fel pe server și pe client, altfel React semnalează hydration mismatch. */
  function placeholderBars() {
    let h = 0;
    for (let i = 0; i < audioUrl.length; i++) h = (h * 31 + audioUrl.charCodeAt(i)) >>> 0;
    const n = compact ? 48 : 64;
    const bars = [];
    for (let i = 0; i < n; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      bars.push(18 + ((h >>> 16) % 82));
    }
    return bars;
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
            {subtitle && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{subtitle}</div>}
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
            {t('previewNotice', { sec: maxDurationSec })}
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
        disabled={armed && !loaded}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        style={{
          width: compact ? 36 : 44,
          height: compact ? 36 : 44,
          flexShrink: 0,
          borderRadius: '50%',
          background: 'linear-gradient(180deg,#fff5cc 0%,#ffe28a 30%,#f1c84d 60%,#b07c1e 100%)',
          color: '#2a1a04',
          border: 'none',
          cursor: !armed || loaded ? 'pointer' : 'wait',
          display: 'grid',
          placeItems: 'center',
          boxShadow: '0 4px 12px rgba(241,200,77,0.3)',
          opacity: !armed || loaded ? 1 : 0.5,
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
              <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{subtitle}</div>
            )}
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', minWidth: 0, display: armed ? undefined : 'none' }} />
        {!armed && (
          <div
            aria-hidden
            style={{
              display: 'flex', alignItems: 'center', gap: 1.5,
              height: compact ? 32 : 48, width: '100%', minWidth: 0, overflow: 'hidden',
            }}
          >
            {placeholderBars().map((v, i) => (
              <span
                key={i}
                style={{
                  flex: 1, minWidth: 0, height: `${v}%`, borderRadius: 1,
                  background: 'var(--wave-idle, rgba(241,200,77,0.35))',
                }}
              />
            ))}
          </div>
        )}
        {!error && loaded && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: 'var(--fg-muted)',
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
          href={downloadUrl(audioUrl)}
          download
          title={t('downloadMp3')}
          onClick={() => {
            const ctx = trackCtxRef.current;
            if (ctx) trackEvent({ type: 'song_download', props: { generationId: ctx.generationId, variant: ctx.variant } });
          }}
          style={{
            color: 'var(--fg-muted)',
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
