'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { resolveMediaUrl } from '@/lib/api';
import { claimPlayback, releasePlayback } from '@/lib/audio-registry';

const VOL_KEY = 'mc_cadou_vol';
const VOL_EVT = 'mc:cadou-vol';

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function slugify(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `fileBase` vine din traduceri (`cadou.player.fileBase`) — numele descărcării. */
function fileName(fileBase: string, label?: string): string {
  const prefix = slugify(fileBase) || 'manea';
  const base = slugify(label || fileBase) || prefix;
  return `${prefix}-${base}.mp3`;
}

/** Same-origin `/uploads/...` so `download` works (local rewrite / prod Caddy). */
function downloadHref(src: string): string {
  try {
    const u = new URL(src, 'http://localhost');
    if (u.pathname.startsWith('/uploads/')) return `${u.pathname}${u.search}`;
  } catch { /* ignore */ }
  return src;
}

function clampVol(n: number): number {
  if (!Number.isFinite(n)) return 0.85;
  return Math.min(1, Math.max(0, n));
}

function readVol(): { vol: number; muted: boolean } {
  try {
    const raw = localStorage.getItem(VOL_KEY);
    if (!raw) return { vol: 0.85, muted: false };
    const p = JSON.parse(raw) as { vol?: number; muted?: boolean };
    return { vol: clampVol(Number(p.vol)), muted: !!p.muted };
  } catch {
    return { vol: 0.85, muted: false };
  }
}

function writeVol(vol: number, muted: boolean) {
  try { localStorage.setItem(VOL_KEY, JSON.stringify({ vol, muted })); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(VOL_EVT, { detail: { vol, muted } }));
}

function SpeakerIcon({ level }: { level: 'off' | 'low' | 'high' }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M4.5 9.2h3.1L12 5.8v12.4l-4.4-3.4H4.5a1.2 1.2 0 0 1-1.2-1.2V10.4c0-.66.54-1.2 1.2-1.2z"
        fill="currentColor"
      />
      {level === 'off' ? (
        <path
          d="M15.2 9.2l4.6 4.6M19.8 9.2l-4.6 4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path
            d="M15.2 9.6a3.2 3.2 0 0 1 0 4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          {level === 'high' && (
            <path
              d="M17.6 7.4a6 6 0 0 1 0 9.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          )}
        </>
      )}
    </svg>
  );
}

export function CadouDemoPlayer({
  audioUrl,
  startSec = 0,
  label,
}: {
  audioUrl: string;
  startSec?: number;
  label?: string;
}) {
  const t = useTranslations('cadou.player');
  const src = resolveMediaUrl(audioUrl) ?? audioUrl;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const lastVol = useRef(0.85);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(0.85);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const v = readVol();
    setVol(v.vol);
    setMuted(v.muted);
    lastVol.current = v.vol > 0 ? v.vol : 0.85;
    const onSync = (e: Event) => {
      const d = (e as CustomEvent<{ vol: number; muted: boolean }>).detail;
      if (!d) return;
      setVol(d.vol);
      setMuted(d.muted);
      if (d.vol > 0) lastVol.current = d.vol;
    };
    window.addEventListener(VOL_EVT, onSync);
    return () => window.removeEventListener(VOL_EVT, onSync);
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = muted ? 0 : vol;
    a.muted = muted || vol === 0;
  }, [vol, muted]);

  useEffect(() => {
    setPlaying(false);
    setCur(0);
    setDur(0);
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }, [src]);

  useEffect(() => () => {
    const a = audioRef.current;
    if (a && stopRef.current) {
      try { a.pause(); } catch { /* ignore */ }
      releasePlayback(stopRef.current);
    }
  }, []);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (!stopRef.current) {
      stopRef.current = () => {
        try { a.pause(); } catch { /* ignore */ }
        setPlaying(false);
      };
    }
    if (playing) {
      a.pause();
      setPlaying(false);
      releasePlayback(stopRef.current);
      return;
    }
    if (startSec > 0 && a.currentTime < 0.2) {
      try { a.currentTime = startSec; } catch { /* ignore */ }
    }
    claimPlayback(stopRef.current, a);
    try {
      await a.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const changeVol = (next: number) => {
    const v = clampVol(next);
    const isMuted = v === 0;
    setVol(v);
    setMuted(isMuted);
    if (v > 0) lastVol.current = v;
    writeVol(v, isMuted);
  };

  const toggleMute = () => {
    if (muted || vol === 0) {
      const restored = lastVol.current > 0 ? lastVol.current : 0.85;
      setMuted(false);
      setVol(restored);
      writeVol(restored, false);
      return;
    }
    lastVol.current = vol;
    setMuted(true);
    writeVol(vol, true);
  };

  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  const volPct = muted ? 0 : Math.round(vol * 100);
  const speaker: 'off' | 'low' | 'high' = muted || vol === 0 ? 'off' : vol < 0.45 ? 'low' : 'high';

  return (
    <div className={`cadou-demo${playing ? ' is-playing' : ''}`}>
      {label && <div className="cadou-demo-lab">{label}</div>}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const a = e.currentTarget;
          setDur(a.duration || 0);
          a.volume = muted ? 0 : vol;
          a.muted = muted || vol === 0;
        }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime || 0)}
        onEnded={() => {
          setPlaying(false);
          if (stopRef.current) releasePlayback(stopRef.current);
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <div className="cadou-demo-row">
        <button
          type="button"
          className="cadou-demo-play"
          onClick={() => void toggle()}
          aria-label={playing ? t('pause') : t('play')}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <rect x="5" y="4" width="5" height="16" rx="1.4" fill="currentColor" />
              <rect x="14" y="4" width="5" height="16" rx="1.4" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M8 5.1v13.8c0 .72.78 1.16 1.38.76l10.4-6.9a.9.9 0 0 0 0-1.52l-10.4-6.9A.88.88 0 0 0 8 5.1z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className="cadou-demo-seek" style={{ ['--pct' as string]: `${pct}%` }}>
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={0.1}
            value={Math.min(cur, dur || 0)}
            onChange={(e) => {
              const a = audioRef.current;
              if (!a || !dur) return;
              const next = Number(e.target.value);
              a.currentTime = next;
              setCur(next);
            }}
            aria-label={t('seek')}
          />
          <div className="cadou-demo-times">
            <span>{fmt(cur)}</span>
            <span>{fmt(dur)}</span>
          </div>
        </div>
      </div>
      <div className="cadou-demo-vol" style={{ ['--vol' as string]: `${volPct}%` }}>
        <button
          type="button"
          className="cadou-demo-mute"
          onClick={toggleMute}
          aria-label={muted || vol === 0 ? t('unmute') : t('mute')}
        >
          <SpeakerIcon level={speaker} />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : vol}
          onChange={(e) => changeVol(Number(e.target.value))}
          aria-label={t('volume')}
        />
        {playing && (
          <span className="cadou-demo-eq" aria-hidden>
            <i /><i /><i /><i />
          </span>
        )}
        <a
          className="cadou-demo-dl"
          href={downloadHref(src)}
          download={fileName(t('fileBase'), label)}
          aria-label={t('downloadAria')}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path d="M12 4v10.2M8.2 10.8 12 14.6l3.8-3.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 18.2h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {t('download')}
        </a>
      </div>
    </div>
  );
}
