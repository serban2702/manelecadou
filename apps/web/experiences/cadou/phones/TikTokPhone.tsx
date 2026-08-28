'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PhoneFrame } from './PhoneFrame';
import {
  IconBookmark,
  IconComment,
  IconFriends,
  IconHeart,
  IconHome,
  IconInbox,
  IconLive,
  IconMusic,
  IconPerson,
  IconPlay,
  IconPlus,
  IconSearch,
  IconShare,
} from './icons';
import type { PhoneClip } from './types';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function TikTokPhone({
  clip,
  time,
  playing,
  progress,
  onToggle,
  autoPlayMuted = false,
  muted = true,
  onBindVideo,
  onUnmute,
}: {
  clip: PhoneClip;
  time: string;
  /** INTENȚIA de redare (ce cere părintele). Ce se vede pe ecran (disc care se
   *  rotește, overlay-ul de play) vine din evenimentele reale ale `<video>`. */
  playing: boolean;
  progress: number;
  onToggle: (video: HTMLVideoElement) => void;
  /** Muted looping video — hides the giant play overlay while running. */
  autoPlayMuted?: boolean;
  /** Keep the <video> muted (soundtrack on a separate <audio>, or autoplay). */
  muted?: boolean;
  onBindVideo?: (el: HTMLVideoElement | null) => void;
  /** Setat doar când redarea a pornit MUTĂ — arătăm butonul de unmute. */
  onUnmute?: () => void;
}) {
  const tPlayer = useTranslations('cadou.player');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [burst, setBurst] = useState(0);
  const [vidProgress, setVidProgress] = useState(0);
  // Starea REALĂ a elementului video. iOS în Low Power Mode refuză `play()`
  // fără să arunce vizibil în toate cazurile — dacă am lua `playing` de bun,
  // discul s-ar roti peste un ecran înghețat.
  const [live, setLive] = useState(false);
  const cover = clip.posterUrl || clip.avatarUrl || clip.videoUrl;
  const avatar = clip.avatarUrl || cover;
  const bar = autoPlayMuted ? vidProgress : progress;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    el.defaultMuted = muted;
    el.playsInline = true;
    if (playing) void el.play().catch(() => undefined);
    else el.pause();
  }, [playing, muted, clip.videoUrl]);

  useEffect(() => {
    if (!autoPlayMuted) return undefined;
    const el = videoRef.current;
    if (!el) return undefined;
    const onTime = () => {
      if (el.duration > 0) setVidProgress(el.currentTime / el.duration);
    };
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  }, [autoPlayMuted, clip.videoUrl]);

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
      <div className="tt-fade-bot" />

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

      <div className="tt-top">
        <div className="tt-live"><IconLive width={24} height={24} /></div>
        <div className="tt-tabs">
          <span className="dim">Following</span>
          <span className="on">For You<b /></span>
        </div>
        <div className="tt-search"><IconSearch width={22} height={22} /></div>
      </div>

      <div className="tt-rail">
        <div className="tt-av">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatar} alt="" loading="lazy" decoding="async" />
          <span className="tt-av-plus"><IconPlus width={14} height={14} /></span>
        </div>
        <RailBtn
          label={fmt((clip.likes ?? 0) + (liked ? 1 : 0))}
          onClick={() => {
            setLiked((v) => !v);
            if (!liked) setBurst((n) => n + 1);
          }}
        >
          <IconHeart filled={liked} width={36} height={36} className={liked ? 'tt-like' : undefined} />
        </RailBtn>
        <RailBtn label={fmt(clip.comments ?? 0)}>
          <IconComment width={36} height={36} />
        </RailBtn>
        <RailBtn label={fmt(clip.bookmarks ?? 0)} onClick={() => setSaved((v) => !v)}>
          <IconBookmark filled={saved} width={32} height={32} className={saved ? 'tt-saved' : undefined} />
        </RailBtn>
        <RailBtn label={fmt(clip.shares ?? 0)}>
          <IconShare width={32} height={32} />
        </RailBtn>
        <div className="tt-disc-wrap">
          <div className={`tt-disc${live ? ' disc-spin' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" loading="lazy" decoding="async" />
          </div>
          <span className="tt-disc-hole" />
        </div>
      </div>

      <div className="tt-meta">
        <div className="tt-user">
          <span>@{clip.username}</span>
          {clip.verified ? (
            <span className="tt-verified">
              <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
                <path d="M2.4 6.2 4.7 8.5 9.6 3.6" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ) : null}
        </div>
        <p className="tt-caption">{clip.caption}</p>
        <div className="tt-song">
          <IconMusic width={14} height={14} />
          <div className="tt-song-track">
            <div className={`caption-ticker${live ? '' : ' pause-anim'}`}>
              <span>{clip.song}</span>
              <span>{clip.song}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tt-progress"><i style={{ width: `${Math.max(4, bar * 100)}%` }} /></div>

      <nav className="tt-nav">
        <Tab icon={<IconHome filled width={28} height={28} />} label="Home" active />
        <Tab icon={<IconFriends width={28} height={28} />} label="Friends" />
        <div className="tt-create">
          <div className="tt-create-btn">
            <span className="tt-create-c" />
            <span className="tt-create-p" />
            <span className="tt-create-w"><IconPlus width={20} height={20} /></span>
          </div>
        </div>
        <Tab icon={<IconInbox width={28} height={28} />} label="Inbox" />
        <Tab icon={<IconPerson width={28} height={28} />} label="Profile" />
      </nav>
    </PhoneFrame>
  );
}

function RailBtn({ children, label, onClick }: { children: ReactNode; label: string; onClick?: () => void }) {
  return (
    <button type="button" className="tt-rail-btn" onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  );
}

function Tab({ icon, label, active }: { icon: ReactNode; label: string; active?: boolean }) {
  return (
    <div className={`tt-tab${active ? ' on' : ''}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}
