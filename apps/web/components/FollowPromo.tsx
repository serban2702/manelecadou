'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FollowPromoState } from '@/lib/follow-promo';

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1 0-5.18c.27 0 .53.04.78.12v-3.16a5.71 5.71 0 0 0-.78-.05A5.72 5.72 0 0 0 4.14 15.4 5.72 5.72 0 0 0 9.86 21.1a5.72 5.72 0 0 0 5.72-5.72V9.01a7.35 7.35 0 0 0 4.28 1.37V7.29a4.28 4.28 0 0 1-3.26-1.47Z" />
    </svg>
  );
}

/** Codul emis + butonul de copiere. Codul se aplică oricum automat la checkout,
 *  dar oamenii vor să-l poată păstra — și îl cer pe chat dacă nu-l văd. */
function FollowPromoCode({ code }: { code: string }) {
  const t = useTranslations('followPromo');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <div className="fp-done">
      <span className="fp-code">{code}</span>
      <button
        type="button"
        className="fp-copy"
        onClick={() => {
          navigator.clipboard?.writeText(code).then(
            () => setCopied(true),
            () => {/* clipboard refuzat (http, permisiuni) — codul rămâne vizibil */},
          );
        }}
      >
        {copied ? t('copied') : t('copy')}
      </button>
    </div>
  );
}

/**
 * Conținutul propriu-zis: îndemnul + butoanele, sau confirmarea cu cod.
 * Folosit identic de secțiunea din pagină (ambele interfețe) și de pop-up.
 */
export function FollowPromoBody({ state }: { state: FollowPromoState }) {
  const t = useTranslations('followPromo');
  const { facebookUrl, tiktokUrl, facebook, tiktok, done, code, percent, busy, mark } = state;

  // Până răspunde API-ul nu inventăm o cifră: fără procent nu scriem promisiunea.
  // O secundă de text fără număr e mai bună decât un „40%" care se corectează în
  // 25% sub ochii omului.
  if (percent === null) {
    return <p className="fp-lead">{t('loading')}</p>;
  }

  const pct = String(percent);

  if (done) {
    return (
      <>
        <p className="fp-lead">{t('done', { pct })}</p>
        {code ? <FollowPromoCode code={code} /> : null}
        <p className="fp-note">{t('doneAuto')}</p>
      </>
    );
  }

  const both = !!facebookUrl && !!tiktokUrl;
  const lead = both
    ? t('lead', { pct })
    : t('leadOne', { network: facebookUrl ? t('facebook') : t('tiktok'), pct });

  return (
    <>
      <p className="fp-lead">{lead}</p>
      <div className={`fp-btns${both ? '' : ' one'}`}>
        {facebookUrl && (
          <button
            type="button"
            className={`fp-btn fb${facebook ? ' on' : ''}`}
            onClick={() => mark('facebook')}
            disabled={facebook || busy === 'facebook'}
          >
            <FacebookIcon />
            {facebook ? t('facebookDone') : t('facebookCta')}
          </button>
        )}
        {tiktokUrl && (
          <button
            type="button"
            className={`fp-btn tt${tiktok ? ' on' : ''}`}
            onClick={() => mark('tiktok')}
            disabled={tiktok || busy === 'tiktok'}
          >
            <TikTokIcon />
            {tiktok ? t('tiktokDone') : t('tiktokCta')}
          </button>
        )}
      </div>
    </>
  );
}

/** Secțiunea din pagina melodiei, în stilul interfeței `classic`. */
export function FollowPromoSection({ state }: { state: FollowPromoState }) {
  const t = useTranslations('followPromo');
  if (!state.available) return null;
  return (
    <section className="fp-card">
      <div className="fp-head">
        <h2 className="fp-title">{t('title')}</h2>
        {state.percent !== null && !state.done && (
          <span className="fp-badge">{t('badge', { pct: String(state.percent) })}</span>
        )}
      </div>
      <FollowPromoBody state={state} />
    </section>
  );
}

/**
 * Pop-up-ul de după 30 de secunde pe pagina melodiei. Aceleași butoane ca
 * secțiunea — cine îl închide găsește oferta mai jos, în pagină.
 */
export function FollowPromoModal({
  state,
  open,
  onClose,
}: {
  state: FollowPromoState;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('followPromo');

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !state.available || state.percent === null) return null;

  return (
    <div
      className="fp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('popupTitle')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fp-modal">
        <button type="button" className="fp-x" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
        <span className="fp-badge">{t('badge', { pct: String(state.percent) })}</span>
        <h3 className="fp-modal-title">{state.done ? t('popupDoneTitle') : t('popupTitle')}</h3>
        <FollowPromoBody state={state} />
        <button type="button" className="fp-later" onClick={onClose}>
          {state.done ? t('close') : t('popupLater')}
        </button>
      </div>
    </div>
  );
}
