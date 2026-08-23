'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ensureGuestSession } from '@/lib/api';
import { useSite } from '@/lib/site-context';
import { CadouFold } from './Fold';

const PROMO_KEY = 'mc_follow_promo';

function readPromo(): string | null {
  try {
    return window.localStorage.getItem(PROMO_KEY);
  } catch {
    return null;
  }
}

function writePromo(code: string) {
  try {
    window.localStorage.setItem(PROMO_KEY, code);
  } catch {
    /* storage blocat */
  }
}

export function CadouFollowCard({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const site = useSite();
  const t = useTranslations('cadou.follow');
  const [fb, setFb] = useState(false);
  const [tt, setTt] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<'facebook' | 'tiktok' | null>(null);

  // Fără fallback către conturile altui site: dacă tenantul n-are rețeaua
  // configurată, butonul pur și simplu nu apare.
  const fbUrl = site.social?.facebook?.trim() || null;
  const ttUrl = site.social?.tiktok?.trim() || null;

  useEffect(() => {
    const stored = readPromo();
    if (stored) setCode(stored);
    (async () => {
      try {
        await ensureGuestSession();
        const me = await api.guestMe();
        if (me.followFacebook) setFb(true);
        if (me.followTiktok) setTt(true);
        if (me.followPromoCode) {
          setCode(me.followPromoCode);
          writePromo(me.followPromoCode);
        }
      } catch {
        /* guest lipsă — butoanele tot marchează local după click */
      }
    })();
  }, []);

  const mark = async (network: 'facebook' | 'tiktok', url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    const nextFb = network === 'facebook' ? true : fb;
    const nextTt = network === 'tiktok' ? true : tt;
    setFb(nextFb);
    setTt(nextTt);
    setBusy(network);
    try {
      await ensureGuestSession();
      let r = await api.markSocialFollow(network);
      if (fbUrl && ttUrl && nextFb && nextTt && !r.promoCode) {
        const other = network === 'facebook' ? 'tiktok' : 'facebook';
        r = await api.markSocialFollow(other);
      }
      setFb(r.facebook);
      setTt(r.tiktok);
      if (r.promoCode) {
        setCode(r.promoCode);
        writePromo(r.promoCode);
      }
    } catch {
      /* click-ul tot contează local; promo-ul se emite la următorul succes */
    } finally {
      setBusy(null);
    }
  };

  if (!fbUrl && !ttUrl) return null;

  const done = (fb || !fbUrl) && (tt || !ttUrl);
  const lead = fbUrl && ttUrl
    ? t('lead')
    : t('leadOne', { network: fbUrl ? t('facebook') : t('tiktok') });

  return (
    <CadouFold
      title={t('title')}
      className="cadou-follow"
      defaultOpen={defaultOpen}
      badge={<span className="cadou-follow-badge">{t('badge')}</span>}
    >
      {done ? (
        <>
          <p className="cadou-follow-lead">
            {t('done')}
            {code ? <> {t.rich('doneCode', { code, b: (chunks) => <b>{chunks}</b> })}</> : null}
            {' '}{t('doneAuto')}
          </p>
        </>
      ) : (
        <>
          <p className="cadou-follow-lead">{lead}</p>
          <div className="cadou-follow-btns">
            {fbUrl && (
              <button
                type="button"
                className={`cadou-follow-btn fb${fb ? ' on' : ''}`}
                onClick={() => void mark('facebook', fbUrl)}
                disabled={fb || busy === 'facebook'}
              >
                {fb ? t('facebookDone') : t('facebookCta')}
              </button>
            )}
            {ttUrl && (
              <button
                type="button"
                className={`cadou-follow-btn tt${tt ? ' on' : ''}`}
                onClick={() => void mark('tiktok', ttUrl)}
                disabled={tt || busy === 'tiktok'}
              >
                {tt ? t('tiktokDone') : t('tiktokCta')}
              </button>
            )}
          </div>
        </>
      )}
    </CadouFold>
  );
}
