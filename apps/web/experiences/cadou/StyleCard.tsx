'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import type { SiteStyleEntry } from '@/lib/site-shared';
import { useSamplePreview } from '@/lib/use-sample-preview';
import { cadouStyleArt } from './style-art';

export function useCadouStylePreview() {
  const [playing, setPlaying] = useState<string | null>(null);
  const onAutoStop = useCallback((key: string) => {
    setPlaying((p) => (p === key ? null : p));
  }, []);
  useSamplePreview(playing, onAutoStop);
  const toggle = (styleId: string) => {
    const key = `style-${styleId}`;
    setPlaying((p) => (p === key ? null : key));
  };
  const stop = useCallback(() => setPlaying(null), []);
  return { playing, toggle, stop };
}

function PlayGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M4 2.6v10.8L13.2 8 4 2.6Z" fill="currentColor" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="2" y="2" width="3.6" height="10" rx="1" fill="currentColor" />
      <rect x="8.4" y="2" width="3.6" height="10" rx="1" fill="currentColor" />
    </svg>
  );
}

export function CadouStyleCard({
  style,
  href,
  selected,
  onSelect,
  playing,
  onTogglePlay,
}: {
  style: SiteStyleEntry;
  href?: string;
  selected?: boolean;
  onSelect?: () => void;
  playing: boolean;
  onTogglePlay: () => void;
}) {
  const playBtn = (
    <button
      type="button"
      className={`cadou-style-play${playing ? ' is-on' : ''}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onTogglePlay();
      }}
      aria-label={playing ? `Oprește mostra ${style.nm}` : `Ascultă mostra ${style.nm}`}
    >
      {playing ? <PauseGlyph /> : <PlayGlyph />}
    </button>
  );

  const inner = (
    <>
      {playBtn}
      {selected ? <span className="cadou-style-check" aria-hidden>✓</span> : null}
      <span className="nm">{style.nm}</span>
      {href ? <span className="go">Fă o manea!</span> : null}
    </>
  );

  const bg = { backgroundImage: `url(${cadouStyleArt(style.id, style.artUrl)})` };

  if (href) {
    return (
      <Link href={href} className={`cadou-style${playing ? ' is-playing' : ''}`} style={bg}>
        {inner}
      </Link>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`cadou-style${selected ? ' selected' : ''}${playing ? ' is-playing' : ''}`}
      style={bg}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        }
      }}
      aria-pressed={selected}
    >
      {inner}
    </div>
  );
}
