'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, resolveMediaUrl, type SiteDemoDto } from '@/lib/api';
import { claimPlayback, releasePlayback } from '@/lib/audio-registry';
import { useExperienceCatalog } from '../use-experience-catalog';
import { cadouStyleArt } from './style-art';

function artForDemo(demo: SiteDemoDto): string {
  if (demo.thumbnailUrl) return resolveMediaUrl(demo.thumbnailUrl) ?? demo.thumbnailUrl;
  const t = `${demo.title} ${demo.category}`.toLowerCase();
  const pairs: Array<[string, string]> = [
    ['iubire', 'iubire'],
    ['jale', 'romantica'],
    ['pahar', 'clasic'],
    ['clasic', 'clasic'],
    ['modern', 'modern'],
    ['tromp', 'trompeta'],
    ['oriental', 'oriental'],
    ['opulen', 'opulenta'],
    ['tallava', 'tallava'],
    ['kuchek', 'kuchek'],
    ['trapan', 'trapanele'],
    ['comerc', 'comerciala'],
  ];
  const hit = pairs.find(([k]) => t.includes(k));
  return cadouStyleArt(hit?.[1] ?? 'iubire');
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function lyricSnippet(raw: string | null): string {
  if (!raw) return '';
  const verseIdx = raw.search(/\[Verse/i);
  const source = verseIdx >= 0 ? raw.slice(verseIdx) : raw;
  const skip = /^(de la |la \d|îți dau|îți las|te iubesc mai mult ca ieri)/i;
  for (const line of source.split('\n')) {
    const t = line.trim().replace(/^["„«]+|[»"”]+$/g, '');
    if (!t || t.startsWith('[') || t.startsWith('(')) continue;
    if (skip.test(t)) continue;
    if (t.length < 18 || t.length > 92) continue;
    return t.replace(/[,;]+$/, '');
  }
  return '';
}

export function CadouHeroPlayer() {
  const { demoIds } = useExperienceCatalog();
  const { data, isLoading } = useQuery({
    queryKey: ['site-demos'],
    queryFn: () => api.siteDemos(),
    staleTime: 60_000,
  });

  const demo = useMemo(() => {
    let items = data?.items ?? [];
    if (demoIds?.length) items = items.filter((d) => demoIds.includes(d.id));
    return items.find((d) => /iubire/i.test(d.title)) ?? items[0] ?? null;
  }, [data?.items, demoIds]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const src = demo ? (resolveMediaUrl(demo.audioUrl) ?? demo.audioUrl) : '';
  const start = demo?.previewStartSec ?? 0;

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

  if (isLoading) {
    return (
      <div className="cadou-player">
        <div className="cadou-kicker">● Exemplu generat de noi</div>
        <p className="cadou-hint">Încărcăm o manea reală…</p>
      </div>
    );
  }
  if (!demo) {
    return (
      <div className="cadou-player">
        <div className="cadou-kicker">● Exemplu generat de noi</div>
        <p className="cadou-hint">Adaugă un demo din admin ca să apară aici.</p>
      </div>
    );
  }

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
    if (start > 0 && a.currentTime < 0.2) {
      try { a.currentTime = start; } catch { /* ignore */ }
    }
    claimPlayback(stopRef.current, a);
    try {
      await a.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    const next = Number(e.target.value);
    a.currentTime = next;
    setCur(next);
  };

  const to = demo.toName?.trim() || '';
  const from = demo.fromName?.trim() || '';
  const title = to ? `Pentru ${to}` : demo.title;
  const quote = lyricSnippet(demo.lyrics);
  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;

  return (
    <div className={`cadou-player${playing ? ' is-playing' : ''}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime || 0)}
        onEnded={() => {
          setPlaying(false);
          if (stopRef.current) releasePlayback(stopRef.current);
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <div className="cadou-kicker">● Exemplu generat de noi</div>
      <div className="cadou-player-row">
        <div className="cadou-player-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cadou-player-cover" src={artForDemo(demo)} alt="" />
          <span className="cadou-eq" aria-hidden>
            <i /><i /><i /><i />
          </span>
        </div>
        <div className="cadou-player-meta">
          <div className="ttl">{title}</div>
          {from && <div className="who">de la {from}</div>}
          <span className="tag">{demo.title}</span>
        </div>
      </div>
      {quote && <p className="cadou-player-quote">„{quote}”</p>}
      <div className="cadou-player-ctrl">
        <button
          type="button"
          className="cadou-play"
          onClick={() => void toggle()}
          aria-label={playing ? 'Pauză' : 'Redă exemplul'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <rect x="5" y="4" width="5" height="16" rx="1.2" fill="currentColor" />
              <rect x="14" y="4" width="5" height="16" rx="1.2" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path d="M8 5.2v13.6c0 .7.76 1.12 1.35.74l10.2-6.8a.88.88 0 0 0 0-1.48l-10.2-6.8A.88.88 0 0 0 8 5.2z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className="cadou-player-bar" style={{ ['--pct' as string]: `${pct}%` }}>
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={0.1}
            value={Math.min(cur, dur || 0)}
            onChange={onSeek}
            aria-label="Poziție"
          />
          <div className="times">
            <span>{fmt(cur)}</span>
            <span>{fmt(dur)}</span>
          </div>
        </div>
      </div>
      <div className="cadou-hint">Manea reală, creată de platforma noastră</div>
    </div>
  );
}
