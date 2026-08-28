'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PhoneFrame } from './PhoneFrame';
import {
  IconCamera,
  IconClapper,
  IconComment,
  IconDots,
  IconHeart,
  IconHome,
  IconMusic,
  IconPlane,
  IconPlay,
  IconPlusSquare,
  IconSearch,
} from './icons';
import type { PhoneClip } from './types';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function InstagramPhone({
  clip,
  time,
  playing,
  onToggle,
  muted = true,
  onBindVideo,
  onUnmute,
}: {
  clip: PhoneClip;
  time: string;
  /** INTENȚIA de redare. Ce se vede vine din evenimentele reale ale `<video>`. */
  playing: boolean;
  onToggle: (video: HTMLVideoElement) => void;
  /** Acceptat pentru paritate cu TikTokPhone (apelanții îl dau la amândouă),
   *  dar aici nu mai schimbă nimic de când `preload` urmează `playing`. */
  autoPlayMuted?: boolean;
  muted?: boolean;
  onBindVideo?: (el: HTMLVideoElement | null) => void;
  /** Setat doar când redarea a pornit MUTĂ — arătăm butonul de unmute. */
  onUnmute?: () => void;
}) {
  const tPlayer = useTranslations('cadou.player');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [burst, setBurst] = useState(0);
  // Starea REALĂ a videoului (vezi comentariul din TikTokPhone).
  const [live, setLive] = useState(false);
  const cover = clip.posterUrl || clip.avatarUrl || clip.videoUrl;
  const avatar = clip.avatarUrl || cover;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    el.defaultMuted = muted;
    el.playsInline = true;
    if (playing) void el.play().catch(() => undefined);
    else el.pause();
  }, [playing, muted, clip.videoUrl]);

  return (
    <PhoneFrame time={time}>
      <video
        ref={(el) => {
          videoRef.current = el;
          onBindVideo?.(el);
        }}
        className="phone-media"
        src={clip.videoUrl}
        poster={clip.posterUrl}
        muted
        loop
        playsInline
        preload={
          /* `none` până când clipul chiar trebuie să ruleze. Înainte era `auto`
             ori de câte ori telefonul era pe autoplay, adică din primul moment
             al paginii: două clipuri se descărcau integral înainte ca
             vizitatorul să fi derulat până la ele. Posterul se vede oricum, iar
             `+faststart` din scripts/optimize-videos.mjs face pornirea promptă. */
          playing ? 'auto' : 'none'
        }
        onPlay={() => setLive(true)}
        onPlaying={() => setLive(true)}
        onPause={() => setLive(false)}
        onEnded={() => setLive(false)}
      />
      <div className="tt-fade-top" />
      <div className="ig-fade-bot" />

      <button
        type="button"
        className="phone-tap"
        aria-label={live ? tPlayer('pause') : tPlayer('play')}
        onClick={() => {
          const v = videoRef.current;
          if (v) onToggle(v);
        }}
      />
      {!live ? (
        <div className="center-play" aria-hidden>
          <IconPlay width={64} height={64} style={{ marginLeft: 8 }} />
        </div>
      ) : null}
      {/* Rulează, dar mut (iOS a refuzat sunetul) — al doilea gest îl pornește. */}
      {live && onUnmute ? (
        <button type="button" className="phone-unmute" onClick={onUnmute}>
          🔇 {tPlayer('unmute')}
        </button>
      ) : null}

      {burst > 0 ? (
        <div key={burst} className="heart-burst">
          <IconHeart filled width={96} height={96} />
        </div>
      ) : null}

      <div className="ig-top">
        <h3>Reels</h3>
        <IconCamera width={28} height={28} />
      </div>

      <div className="ig-rail">
        <IgRail
          label={fmt((clip.likes ?? 0) + (liked ? 1 : 0))}
          onClick={() => {
            setLiked((v) => !v);
            if (!liked) setBurst((n) => n + 1);
          }}
        >
          <IconHeart filled={liked} width={32} height={32} className={liked ? 'ig-like' : undefined} />
        </IgRail>
        <IgRail label={fmt(clip.comments ?? 0)}>
          <IconComment width={32} height={32} />
        </IgRail>
        <IgRail label={fmt(clip.shares ?? 0)}>
          <IconPlane width={32} height={32} />
        </IgRail>
        <button type="button" className="more-btn" aria-label="More">
          <IconDots width={32} height={32} />
        </button>
        <div className="ig-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" loading="lazy" decoding="async" />
        </div>
      </div>

      <div className="ig-meta">
        <div className="ig-user">
          <span className="ig-ring">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar} alt="" loading="lazy" decoding="async" />
          </span>
          <b>{clip.username}</b>
          {clip.verified ? (
            <span className="ig-blue">
              <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
                <path d="M2.4 6.2 4.7 8.5 9.6 3.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ) : null}
          <button
            type="button"
            className={`ig-follow${following ? ' on' : ''}`}
            onClick={() => setFollowing((v) => !v)}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>
        <p className="ig-caption">{clip.caption}</p>
        <div className="ig-song">
          <IconMusic width={14} height={14} />
          <span>{clip.song}</span>
        </div>
      </div>

      <nav className="ig-nav">
        <span><IconHome width={28} height={28} /></span>
        <span><IconSearch width={28} height={28} /></span>
        <span><IconPlusSquare width={28} height={28} /></span>
        <span className="on"><IconClapper filled width={28} height={28} /></span>
        <span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatar} alt="" loading="lazy" decoding="async" />
        </span>
      </nav>
    </PhoneFrame>
  );
}

function IgRail({ children, label, onClick }: { children: ReactNode; label: string; onClick?: () => void }) {
  return (
    <button type="button" className="tt-rail-btn" onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  );
}
