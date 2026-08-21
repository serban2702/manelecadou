'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, resolveMediaUrl } from '@/lib/api';
import { releasePlayback } from '@/lib/audio-registry';
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
  const { reactionClips } = useExperienceCatalog();
  const { data } = useQuery({
    queryKey: ['site-demos'],
    queryFn: () => api.siteDemos(),
    staleTime: 60_000,
  });

  const clips = useMemo(() => {
    const base = (reactionClips?.length ? reactionClips : CADOU_REACTIONS).slice(0, 8);
    const demos = data?.items ?? [];
    return base.map((c) => {
      const demo = c.demoId ? demos.find((d) => d.id === c.demoId) : null;
      if (!demo) return c;
      return {
        ...c,
        audioUrl: demo.audioUrl || c.audioUrl,
        previewStartSec: demo.previewStartSec ?? c.previewStartSec,
        song: c.song || demo.title,
      };
    });
  }, [reactionClips, data?.items]);

  if (!clips.length) return null;

  return (
    <section className="cadou-section cadou-panel" id="reactii">
      <div className="cadou-kicker">Reacții filmate</div>
      <h2>Oameni reali, manele reale</h2>
      <p className="lead">Așa arată surpriza — din TikTok și Instagram, cu piese generate de noi.</p>
      <div className="cadou-phones" aria-label="Reacții">
        {clips.map((c) => <PhoneCard key={c.id} clip={c} />)}
      </div>
    </section>
  );
}
