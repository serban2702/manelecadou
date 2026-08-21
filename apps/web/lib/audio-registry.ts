/**
 * Un singur player activ pe tot site-ul.
 * claimPlayback(stop) oprește TOȚI ceilalți (telefoane, mostre, demo, ManeaPlayer)
 * plus orice <audio>/<video> din DOM, în afară de elementele păstrate.
 */

type Stopper = () => void;

const players = new Set<Stopper>();
const background = new Set<Stopper>();

function pauseForeignMedia(keep?: HTMLMediaElement | HTMLMediaElement[] | null): void {
  if (typeof document === 'undefined') return;
  const keepSet = new Set(Array.isArray(keep) ? keep : keep ? [keep] : []);
  document.querySelectorAll('audio, video').forEach((node) => {
    const el = node as HTMLMediaElement;
    if (keepSet.has(el)) return;
    try {
      if (!el.paused) el.pause();
    } catch {
      /* noop */
    }
  });
}

export function claimPlayback(
  stop: Stopper,
  keep?: HTMLMediaElement | HTMLMediaElement[] | null,
): void {
  if (keep) pauseForeignMedia(keep);

  const others = [...players].filter((p) => p !== stop);
  const bg = [...background].filter((p) => p !== stop);
  players.clear();
  background.clear();
  players.add(stop);

  for (const other of [...others, ...bg]) {
    try {
      other();
    } catch {
      /* noop */
    }
  }
}

/** Autoplay mute (hero) — se oprește când cineva dă play, dar nu evince alte playere. */
export function registerBackgroundPlayback(stop: Stopper): () => void {
  background.add(stop);
  return () => {
    background.delete(stop);
  };
}

export function releasePlayback(stop: Stopper): void {
  players.delete(stop);
  background.delete(stop);
}
