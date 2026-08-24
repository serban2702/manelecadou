import { resolveMediaUrl } from '@/lib/api';
import { claimPlayback } from '@/lib/audio-registry';

/** Ce s-a întâmplat REAL după tap — nu ce am încercat să pornim.
 *  - `soundtrack`: coloana sonoră (manea) rulează pe `<audio>`, videoul e mut;
 *  - `video`: videoul rulează CU sunet (AAC-ul clipului);
 *  - `muted`: videoul rulează, dar MUT (iOS/Low Power a refuzat sunetul);
 *  - `none`: nu rulează nimic (browserul a refuzat și redarea mută). */
export type PhoneMediaMode = 'soundtrack' | 'video' | 'muted' | 'none';

export type PhoneMediaResult = {
  mode: PhoneMediaMode;
  /** Videoul chiar rulează (a trecut de `play()`). */
  playing: boolean;
  /** Rulează, dar fără sunet — UI-ul trebuie să ofere un buton de unmute. */
  needsUnmute: boolean;
  /** Cum trebuie ținut `<video muted>` după acest tap. */
  videoMuted: boolean;
};

/**
 * Pornește reacția din telefon în gestul de tap:
 *  - încearcă coloana sonoră (manea) dacă avem URL;
 *  - dacă MP3-ul pică / lipsește, dă unmute la video (clipurile au AAC);
 *  - dacă și asta e refuzată (Low Power Mode, browser in-app), repornește MUT
 *    și SPUNE asta apelantului — altfel UI-ul ar minți că se aude ceva.
 * `video.play()` trebuie chemat aici, nu într-un useEffect — altfel browserul
 * blochează sunetul (autoplay policy).
 */
export async function startPhoneMedia(opts: {
  video: HTMLVideoElement;
  audio: HTMLAudioElement | null;
  audioUrl?: string | null;
  startSec?: number;
  stop: () => void;
}): Promise<PhoneMediaResult> {
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
    return {
      mode: soundtrack ? 'soundtrack' : 'video',
      playing: true,
      needsUnmute: false,
      videoMuted: soundtrack,
    };
  } catch {
    /* redarea cu sunet a fost refuzată — reîncercăm mut */
  }

  video.muted = true;
  video.defaultMuted = true;
  try {
    await video.play();
  } catch {
    // Nici mut nu pornește: oprim și coloana sonoră ca să nu rămână un ecran
    // „care se aude" fără imagine.
    if (soundtrack) {
      try { audio?.pause(); } catch { /* ignore */ }
      soundtrack = false;
    }
    return { mode: 'none', playing: false, needsUnmute: false, videoMuted: true };
  }

  // Videoul merge mut. Dacă avem coloană sonoră, sunetul EXISTĂ (pe `<audio>`);
  // altfel clientul vede imagine fără sunet și îi datorăm un buton de unmute.
  return {
    mode: soundtrack ? 'soundtrack' : 'muted',
    playing: true,
    needsUnmute: !soundtrack,
    videoMuted: true,
  };
}

/**
 * Al doilea gest de utilizator: „pornește sunetul". Încearcă întâi coloana
 * sonoră, apoi unmute pe video. Întoarce ce s-a auzit efectiv.
 */
export async function unmutePhoneMedia(opts: {
  video: HTMLVideoElement;
  audio: HTMLAudioElement | null;
  audioUrl?: string | null;
  startSec?: number;
}): Promise<PhoneMediaResult> {
  const { video, audio, audioUrl, startSec = 0 } = opts;
  const src = audioUrl ? (resolveMediaUrl(audioUrl) ?? audioUrl) : '';
  if (audio && src) {
    try {
      if (startSec > 0 && Number.isFinite(audio.currentTime) && audio.currentTime < 0.3) {
        audio.currentTime = startSec;
      }
      await audio.play();
      video.muted = true;
      video.defaultMuted = true;
      return { mode: 'soundtrack', playing: true, needsUnmute: false, videoMuted: true };
    } catch {
      /* cădem pe sunetul videoului */
    }
  }
  video.muted = false;
  video.defaultMuted = false;
  try {
    await video.play();
    return { mode: 'video', playing: true, needsUnmute: false, videoMuted: false };
  } catch {
    video.muted = true;
    video.defaultMuted = true;
    await video.play().catch(() => undefined);
    return { mode: 'muted', playing: true, needsUnmute: true, videoMuted: true };
  }
}
