/**
 * Cele două interfețe publice care randează pagina unei manele:
 *  • `classic` — `app/m/[id]/view.tsx` (interfața istorică, cea din producție)
 *  • `cadou`   — `experiences/cadou/SongView.tsx` (interfața nouă)
 *
 * Livrabilele vechi (clipuri pe refren, poza de share, parola peste pozele
 * private) nu se mai vând la pachetele noi, dar comenzile plătite înainte le au
 * și trebuie să rămână disponibile pe ORICE interfață ar folosi site-ul. De
 * aceea componentele lor stau în `components/` și primesc skin-ul ca prop:
 * logica e una singură, prezentarea urmează interfața gazdă.
 */
export type SongSkin = 'classic' | 'cadou';
