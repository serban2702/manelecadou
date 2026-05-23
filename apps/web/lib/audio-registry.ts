/**
 * Registru global pentru playerele audio din site. Garantează că o singură
 * piesă cântă la un moment dat:
 *   - ManeaPlayer (wavesurfer / native audio)
 *   - useSamplePreview din Generator (mostre voce/stil)
 *   - playerele inline de pe pagini publice
 *
 * Fiecare player apelează `claimPlayback(stop)` când începe să cânte. Registrul
 * cheamă funcția `stop` a player-ului activ anterior și-l înlocuiește. Când
 * player-ul curent se oprește (pause / finish / unmount), apelează `release(stop)`
 * ca să cureţe registrul dacă încă e activ.
 */

type Stopper = () => void;

let active: Stopper | null = null;

export function claimPlayback(stop: Stopper): void {
  if (active && active !== stop) {
    try {
      active();
    } catch {
      /* noop */
    }
  }
  active = stop;
}

export function releasePlayback(stop: Stopper): void {
  if (active === stop) active = null;
}
