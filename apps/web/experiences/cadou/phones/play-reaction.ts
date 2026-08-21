import { resolveMediaUrl } from '@/lib/api';
import { claimPlayback } from '@/lib/audio-registry';

/**
 * Pornește reacția din telefon în gestul de tap:
 *  - încearcă coloana sonoră (manea) dacă avem URL;
 *  - dacă MP3-ul pică / lipsește, dă unmute la video (clipurile au AAC).
 * `video.play()` trebuie chemat aici, nu într-un useEffect — altfel browserul
 * blochează sunetul (autoplay policy).
 */
export async function startPhoneMedia(opts: {
  video: HTMLVideoElement;
  audio: HTMLAudioElement | null;
  audioUrl?: string | null;
  startSec?: number;
  stop: () => void;
}): Promise<'soundtrack' | 'video'> {
  const { video, audio, audioUrl, startSec = 0, stop } = opts;
  video.playsInline = true;

  const src = audioUrl ? (resolveMediaUrl(audioUrl) ?? audioUrl) : '';
  let soundtrack = false;
  const keep = [video, audio].filter((el): el is HTMLMediaElement => !!el);
  claimPlayback(stop, keep);
  if (audio && src) {
    try {
      if (startSec > 0 && Number.isFinite(audio.currentTime) && audio.currentTime < 0.3) {
        audio.currentTime = startSec;
      }
      await audio.play();
      soundtrack = true;
    } catch {
      soundtrack = false;
    }
  }

  video.muted = soundtrack;
  video.defaultMuted = soundtrack;
  try {
    await video.play();
  } catch {
    video.muted = true;
    video.defaultMuted = true;
    await video.play().catch(() => undefined);
  }
  return soundtrack ? 'soundtrack' : 'video';
}
