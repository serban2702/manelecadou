'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { formatPrice } from '@/lib/site-shared';
import { useSite } from '@/lib/site-context';
import { PAID_REMAKE_CENTS } from '@/lib/packages';
import { CadouFold } from './Fold';

const MAX = 1000;

export function CadouRemakeCard({
  generationId,
  remaining = 0,
  quota = 1,
  paidCents = PAID_REMAKE_CENTS,
  busy: parentBusy,
  canceled,
  defaultOpen = true,
  onStarted,
}: {
  generationId: string;
  remaining?: number;
  quota?: number;
  paidCents?: number;
  busy?: boolean;
  canceled?: boolean;
  defaultOpen?: boolean;
  onStarted: () => void;
}) {
  const site = useSite();
  const t = useTranslations('cadou.remake');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const len = notes.trim().length;
  const freeLeft = remaining > 0;
  const price = formatPrice(site, paidCents || PAID_REMAKE_CENTS);

  const leftCopy = remaining <= 0
    ? (quota === 1 ? t('usedOne') : t('usedMany', { quota }))
    : remaining === 1
      ? t('leftOne')
      : t('leftMany', { remaining });

  const submit = async () => {
    if (busy || parentBusy) return;
    if (len < 8) {
      setErr(t('errShort'));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (freeLeft) {
        await api.requestRemake(generationId, notes.trim());
        setNotes('');
        onStarted();
      } else {
        const r = await api.requestPaidRemake(generationId, notes.trim());
        window.location.href = r.url;
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('errStart'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CadouFold title={t('title')} className="cadou-remake" defaultOpen={defaultOpen}>
      {parentBusy ? (
        <p className="cadou-remake-lead">{t('busyLead')}</p>
      ) : (
        <>
          <p className="cadou-remake-count">{leftCopy}</p>
          <p className="cadou-remake-lead">
            {freeLeft ? t('leadFree') : t('leadPaid', { price })}
          </p>
          {canceled && (
            <p className="cadou-pay-warn" role="status">{t('canceled')}</p>
          )}
          <label className="cadou-remake-lab" htmlFor="cadou-remake-notes">
            {t('label')}
          </label>
          <textarea
            id="cadou-remake-notes"
            className={`cadou-area${err ? ' err' : ''}`}
            maxLength={MAX}
            rows={5}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value.slice(0, MAX));
              if (err) setErr(null);
            }}
            placeholder={t('placeholder')}
          />
          <div className="cadou-remake-meta">
            {/* String, nu number — altfel ICU ar grupa miile („1.000"). */}
            <span>{t('counter', { len: String(len), max: String(MAX) })}</span>
          </div>
          {err && <p className="cadou-err" role="alert">{err}</p>}
          <button
            type="button"
            className="cadou-cta"
            onClick={() => void submit()}
            disabled={busy || len < 8}
          >
            {busy
              ? (freeLeft ? t('busyFree') : t('busyPaid'))
              : freeLeft
                ? t('ctaFree')
                : t('ctaPaid', { price })}
          </button>
        </>
      )}
    </CadouFold>
  );
}
