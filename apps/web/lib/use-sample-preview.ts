'use client';

import { useEffect, useRef } from 'react';
import { api, resolveMediaUrl } from '@/lib/api';
import { claimPlayback, releasePlayback } from '@/lib/audio-registry';
import { useExperienceCatalog } from '@/experiences/use-experience-catalog';
import { useSite } from '@/lib/site-context';

/** Cache global pentru mostrele audio (voice/style) — evită refetch-urile.
 *  `null` înseamnă "am cerut, nu există mostră publică pentru această voce/stil". */
const SAMPLE_CACHE = new Map<string, string | null>();

/**
 * Player partajat pentru mostrele de voce/stil din carduri.
 * Când `playing` are forma `voice-XYZ` sau `style-XYZ`, fetchează cea mai recentă
 * piesă publică ce folosește acea voce / acel stil și o redă (max 30s preview).
 * La schimbarea selecției sau la unmount, audio-ul curent e oprit.
 */
export function useSamplePreview(
  playing: string | null,
  onAutoStop: (id: string) => void,
) {
  const site = useSite();
  const catalog = useExperienceCatalog();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        /* noop */
      }
      audioRef.current = null;
    }
    activeKeyRef.current = null;

    if (!playing) return;
    const isVoice = playing.startsWith('voice-');
    const isStyle = playing.startsWith('style-');
    if (!isVoice && !isStyle) return;

    const id = playing.slice(isVoice ? 'voice-'.length : 'style-'.length);
    const key = playing;
    activeKeyRef.current = key;
    let cancelled = false;

    const presetEntry = isStyle ? catalog.styleSamples?.[id] : site.voiceSamples?.[id];
    const presetUrl = presetEntry?.audioUrl;
    const presetStartSec = presetEntry?.startSec ?? 0;

    async function startPlayback(url: string, startSec = 0) {
      if (cancelled || activeKeyRef.current !== key) return;
      const src = resolveMediaUrl(url) ?? url;
      const a = new Audio(src);
      a.preload = 'auto';
      audioRef.current = a;
      const stopAt = startSec + 30;
      const stopFn = () => {
        try {
          a.pause();
        } catch {
          /* noop */
        }
        if (activeKeyRef.current === key) onAutoStop(key);
      };
      a.addEventListener('play', () => claimPlayback(stopFn));
      a.addEventListener('pause', () => releasePlayback(stopFn));
      a.addEventListener('timeupdate', () => {
        if (a.currentTime >= stopAt) {
          a.pause();
          a.currentTime = 0;
          if (activeKeyRef.current === key) onAutoStop(key);
        }
      });
      a.addEventListener('ended', () => {
        releasePlayback(stopFn);
        if (activeKeyRef.current === key) onAutoStop(key);
      });
      if (startSec > 0) {
        const seek = () => {
          try {
            a.currentTime = startSec;
          } catch {
            /* noop */
          }
        };
        if (a.readyState >= 1) seek();
        else a.addEventListener('loadedmetadata', seek, { once: true });
      }
      try {
        await a.play();
      } catch {
        if (activeKeyRef.current === key) onAutoStop(key);
      }
    }

    (async () => {
      if (presetUrl) {
        await startPlayback(presetUrl, presetStartSec);
        return;
      }
      const cached = SAMPLE_CACHE.get(key);
      if (cached === null) {
        if (activeKeyRef.current === key) onAutoStop(key);
        return;
      }
      if (cached) {
        await startPlayback(cached);
        return;
      }
      try {
        const params = isVoice ? { voice: id, limit: 1 } : { style: id, limit: 1 };
        const res = await api.publicGenerations({ ...params, sort: 'recent' });
        const url = res.items.find((it) => !!it.audioUrl)?.audioUrl ?? null;
        SAMPLE_CACHE.set(key, url);
        if (cancelled || activeKeyRef.current !== key) return;
        if (!url) {
          onAutoStop(key);
          return;
        }
        await startPlayback(url);
      } catch {
        SAMPLE_CACHE.set(key, null);
        if (activeKeyRef.current === key) onAutoStop(key);
      }
    })();

    return () => {
      cancelled = true;
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {
          /* noop */
        }
      }
    };
  }, [playing, onAutoStop, catalog.styleSamples, site.voiceSamples]);
}
