'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { resolveMediaUrl } from '@/lib/api';
import { releasePlayback } from '@/lib/audio-registry';
import { type CadouReactionClip } from './reactions';
import { useCadouReactionClips } from './use-reaction-clips';
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

function PhoneCard({ clip }: { clip: CadouReactionClip }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [time, setTime] = useState('21:14');
  const src = clip.audioUrl ? (resolveMediaUrl(clip.audioUrl) ?? clip.audioUrl) : '';
  const start = clip.previewStartSec ?? 0;
  const phone = toPhone(clip);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => () => {
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    try { videoElRef.current?.pause(); } catch { /* ignore */ }
    if (stopRef.current) releasePlayback(stopRef.current);
  }, []);

  const makeStop = () => () => {
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    try { videoElRef.current?.pause(); } catch { /* ignore */ }
    setPlaying(false);
    setVideoMuted(true);
  };

  const stop = () => {
    makeStop()();
    if (stopRef.current) releasePlayback(stopRef.current);
  };

  const bindVideo = (el: HTMLVideoElement | null) => {
    videoElRef.current = el;
  };

  const toggle = async (video: HTMLVideoElement) => {
    videoElRef.current = video;
    if (playing) {
      video.pause();
      stop();
      return;
    }
    stopRef.current = makeStop();
    const mode = await startPhoneMedia({
      video,
      audio: audioRef.current,
      audioUrl: clip.audioUrl,
      startSec: start,
      stop: stopRef.current,
    });
    setVideoMuted(mode === 'soundtrack');
    setPlaying(true);
  };

  const progress = dur > 0 ? Math.min(1, cur / dur) : 0.08;

  return (
    <article className="cadou-phone-card">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime || 0)}
        onEnded={() => stop()}
      />
      <PhoneStage>
        {clip.platform === 'instagram' ? (
          <InstagramPhone
            clip={phone}
            time={time}
            playing={playing}
            muted={videoMuted}
            onBindVideo={bindVideo}
            onToggle={(v) => void toggle(v)}
          />
        ) : (
          <TikTokPhone
            clip={phone}
            time={time}
            playing={playing}
            progress={progress}
            muted={videoMuted}
            onBindVideo={bindVideo}
            onToggle={(v) => void toggle(v)}
          />
        )}
      </PhoneStage>
    </article>
  );
}

export function CadouReactionsRow() {
  const t = useTranslations('cadou.reactions');
  const clips = useCadouReactionClips(8);

  if (!clips.length) return null;

  return (
    <section className="cadou-section cadou-panel" id="reactii">
      <div className="cadou-kicker">{t('kicker')}</div>
      <h2>{t('title')}</h2>
      <p className="lead">{t('lead')}</p>
      <div className="cadou-phones" aria-label={t('aria')}>
        {clips.map((c) => <PhoneCard key={c.id} clip={c} />)}
      </div>
    </section>
  );
}
