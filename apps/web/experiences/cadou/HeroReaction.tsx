'use client';

import { useEffect, useRef, useState } from 'react';
import { resolveMediaUrl } from '@/lib/api';
import { registerBackgroundPlayback, releasePlayback } from '@/lib/audio-registry';
import { useExperienceCatalog } from '../use-experience-catalog';
import { CADOU_REACTIONS, type CadouReactionClip } from './reactions';
import { InstagramPhone } from './phones/InstagramPhone';
import { PhoneStage } from './phones/PhoneFrame';
import { startPhoneMedia } from './phones/play-reaction';
import { TikTokPhone } from './phones/TikTokPhone';
import type { PhoneClip } from './phones/types';

function toPhone(c: CadouReactionClip): PhoneClip {
  return {
    id: c.id,
    platform: c.platform,
    videoUrl: c.videoUrl,
    posterUrl: c.posterUrl,
    avatarUrl: c.avatarUrl || c.posterUrl,
    username: c.username,
    caption: c.caption,
    song: c.song,
    likes: c.likes,
    comments: c.comments,
    shares: c.shares,
    bookmarks: Math.round((c.likes ?? 0) * 0.42),
    verified: true,
  };
}

function pickHeroClips(list: CadouReactionClip[]): CadouReactionClip[] {
  const a = list.find((c) => c.id === 'iubire');
  const b = list.find((c) => c.id === 'pahar') ?? list.find((c) => c.id !== a?.id);
  const pair = [a, b].filter((c): c is CadouReactionClip => !!c);
  if (pair.length >= 2) return pair.slice(0, 2);
  return list.slice(0, 2);
}

function HeroPhone({
  clip,
  time,
  videoOn,
  inView,
}: {
  clip: CadouReactionClip;
  time: string;
  videoOn: boolean;
  inView: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const unregBgRef = useRef<(() => void) | null>(null);
  const [sounding, setSounding] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const src = clip.audioUrl ? (resolveMediaUrl(clip.audioUrl) ?? clip.audioUrl) : '';
  const start = clip.previewStartSec ?? 0;
  const phone = toPhone(clip);
  const videoPlaying = !silenced && (videoOn || tapped || sounding);
  const videoMuted = sounding || !tapped;

  const bindVideo = (el: HTMLVideoElement | null) => {
    videoElRef.current = el;
  };

  const makeStop = () => () => {
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    try { videoElRef.current?.pause(); } catch { /* ignore */ }
    setSounding(false);
    setTapped(false);
    setSilenced(true);
  };

  const stopSound = () => {
    makeStop()();
    if (stopRef.current) releasePlayback(stopRef.current);
  };

  useEffect(() => () => {
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    try { videoElRef.current?.pause(); } catch { /* ignore */ }
    if (stopRef.current) releasePlayback(stopRef.current);
  }, []);

  useEffect(() => {
    if (!inView) {
      stopSound();
      return;
    }
    setSilenced(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  useEffect(() => {
    unregBgRef.current?.();
    unregBgRef.current = null;
    if (!videoOn || tapped || sounding || silenced) return undefined;
    unregBgRef.current = registerBackgroundPlayback(makeStop());
    return () => {
      unregBgRef.current?.();
      unregBgRef.current = null;
    };
  }, [videoOn, tapped, sounding, silenced]);

  const toggleSound = async (video: HTMLVideoElement) => {
    videoElRef.current = video;
    unregBgRef.current?.();
    unregBgRef.current = null;
    if (tapped || sounding) {
      video.pause();
      stopSound();
      return;
    }
    setSilenced(false);
    stopRef.current = makeStop();
    setTapped(true);
    const mode = await startPhoneMedia({
      video,
      audio: audioRef.current,
      audioUrl: clip.audioUrl,
      startSec: start,
      stop: stopRef.current,
    });
    setSounding(mode === 'soundtrack');
  };

  return (
    <div className="cadou-hero-phone">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onEnded={() => {
          setSounding(false);
          if (stopRef.current) releasePlayback(stopRef.current);
        }}
      />
      <PhoneStage>
        {clip.platform === 'instagram' ? (
          <InstagramPhone
            clip={phone}
            time={time}
            playing={videoPlaying}
            muted={videoMuted}
            autoPlayMuted
            onBindVideo={bindVideo}
            onToggle={(v) => void toggleSound(v)}
          />
        ) : (
          <TikTokPhone
            clip={phone}
            time={time}
            playing={videoPlaying}
            progress={0}
            muted={videoMuted}
            autoPlayMuted
            onBindVideo={bindVideo}
            onToggle={(v) => void toggleSound(v)}
          />
        )}
      </PhoneStage>
    </div>
  );
}

export function CadouHeroReaction() {
  const { reactionClips } = useExperienceCatalog();
  const list = reactionClips.length ? reactionClips : CADOU_REACTIONS;
  const clips = pickHeroClips(list);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [reachedByScroll, setReachedByScroll] = useState(false);
  const [time, setTime] = useState('21:14');
  const videoOn = inView && reachedByScroll;

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;

    const markReached = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 0;
      const visible = rect.top < vh * 0.92 && rect.bottom > vh * 0.12;
      if (visible && window.scrollY > 8) setReachedByScroll(true);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        const shown = entry.isIntersecting && entry.intersectionRatio >= 0.35;
        setInView(shown);
        if (shown && window.scrollY > 8) setReachedByScroll(true);
      },
      { threshold: [0, 0.35, 0.6, 1] },
    );
    io.observe(el);
    window.addEventListener('scroll', markReached, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', markReached);
    };
  }, []);

  return (
    <div ref={wrapRef} className="cadou-hero-phones">
      {clips.map((clip) => (
        <HeroPhone key={clip.id} clip={clip} time={time} videoOn={videoOn} inView={inView} />
      ))}
    </div>
  );
}
