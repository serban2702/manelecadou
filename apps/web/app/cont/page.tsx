'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SiteShell } from '@/components/SiteShell';
import { confirmDialog } from '@/components/ConfirmDialog';
import { useSession } from '@/lib/providers';
import { api, ApiError } from '@/lib/api';
import { useSite } from '@/lib/site-context';
import { getLegalPath } from '@/lib/legal-slugs';
import { getPagePath } from '@/lib/page-slugs';

export default function ContPage() {
  const t = useTranslations('contPage');
  const router = useRouter();
  const session = useSession();
  const site = useSite();
  const privacyHref = getLegalPath(site.locale, 'privacy');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState<'export' | 'delete' | null>(null);
  const [submitted, setSubmitted] = useState<'export' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.ready && !session.user) {
      router.replace(getPagePath(site.locale, 'login'));
    }
  }, [session.ready, session.user, router]);

  async function submit(type: 'export' | 'delete') {
    const ok = await confirmDialog(
      type === 'delete'
        ? {
            title: t('deleteTitle'),
            description: t('deleteDesc'),
            confirmText: t('deleteConfirm'),
            variant: 'destructive',
          }
        : {
            title: t('exportTitle'),
            description: t('exportDesc'),
            confirmText: t('exportConfirm'),
          },
    );
    if (!ok) return;
    setSubmitting(type);
    setError(null);
    try {
      await api.gdprRequest(type, reason || undefined);
      setSubmitted(type);
      setReason('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('errGeneric'));
    } finally {
      setSubmitting(null);
    }
  }

  if (!session.ready || !session.user) {
    return (
      <SiteShell hideStickyCta>
        <div className="inner-page"><p className="lead">{t('loading')}</p></div>
      </SiteShell>
    );
  }

  return (
    <SiteShell hideStickyCta>
      <div className="inner-page">
        <h1 className="gold-text">{t('title')}</h1>
        <p className="lead">
          {session.user.email}
          {session.user.role === 'admin' && (
            <span style={{ marginLeft: 8, padding: '2px 8px', background: 'var(--gold)', color: '#2a1a04', borderRadius: 999, fontSize: 11, fontWeight: 800 }}>
              {t('adminBadge')}
            </span>
          )}
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <Link href={getPagePath(site.locale, 'studio')} className="btn btn-gold" style={{ textDecoration: 'none' }}>
            {t('makeManea')}
          </Link>
          <button
            className="btn btn-ghost"
            onClick={() => { session.logout(); router.replace('/'); }}
          >
            {t('logout')}
          </button>
        </div>

        <h2>{t('gdprTitle')}</h2>
        <p>{t('gdprBody')}</p>

        <div className="field" style={{ marginTop: 14 }}>
          <label>{t('reasonLabel')}</label>
          <textarea
            placeholder={t('reasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={400}
            style={{ minHeight: 80 }}
          />
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 8,
            background: 'rgba(255,45,126,0.12)', border: '1px solid rgba(255,45,126,0.4)',
            color: '#ffd6e6', fontSize: 13,
          }}>{error}</div>
        )}

        {submitted && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 8,
            background: 'rgba(62,224,126,0.12)', border: '1px solid rgba(62,224,126,0.4)',
            color: '#bff5d2', fontSize: 13,
          }}>
            {submitted === 'export' ? t('submittedExport') : t('submittedDelete')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <button
            className="btn btn-ghost"
            disabled={!!submitting}
            onClick={() => submit('export')}
          >
            {submitting === 'export' ? t('submitting') : t('exportCta')}
          </button>
          <button
            className="btn btn-ghost"
            disabled={!!submitting}
            onClick={() => submit('delete')}
            style={{ borderColor: 'rgba(255,45,126,0.4)', color: '#ff6cb0' }}
          >
            {submitting === 'delete' ? t('submitting') : t('deleteCta')}
          </button>
        </div>

        <p style={{ marginTop: 24, fontSize: 12, color: 'rgba(255,245,220,0.5)' }}>
          {t('footer')} <Link href={privacyHref} style={{ color: 'var(--gold)' }}>{t('privacy')}</Link>.
        </p>
      </div>
    </SiteShell>
  );
}
