'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SiteShell } from '@/components/SiteShell';
import { useSite } from '@/lib/site-context';
import { siteSupportEmail } from '@/lib/site-shared';

export default function ContactPage() {
  const t = useTranslations('contactPage');
  const site = useSite();
  const support = siteSupportEmail(site);
  const tech = site.companyInfo?.legalName ? `tech@${site.domain}` : support;
  const business = site.companyInfo?.legalName ? `business@${site.domain}` : support;
  const company = site.companyInfo ?? {};
  const [sent, setSent] = useState(false);

  return (
    <SiteShell>
      <div className="inner-page">
        <h1 className="gold-text">{t('title')}</h1>
        <p className="lead">{t('lead')}</p>

        <div className="split-2" style={{ marginTop: 12 }}>
          <div>
            <h2>{t('writeUs')}</h2>
            {sent ? (
              <div style={{
                padding: 16, borderRadius: 10,
                border: '1px solid var(--gold)', background: 'rgba(241,200,77,0.06)',
              }}>
                {t('sent')}
              </div>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); setSent(true); }}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div className="field">
                  <label>{t('emailLabel')}</label>
                  <input type="email" required placeholder={t('emailPlaceholder')} />
                </div>
                <div className="field">
                  <label>{t('subjectLabel')}</label>
                  <input type="text" required placeholder={t('subjectPlaceholder')} />
                </div>
                <div className="field">
                  <label>{t('messageLabel')}</label>
                  <textarea required style={{ minHeight: 140 }} placeholder={t('messagePlaceholder')} />
                </div>
                <button className="btn btn-gold btn-lg">{t('send')}</button>
              </form>
            )}
          </div>
          <div>
            <h2>{t('details')}</h2>
            <p><b>{t('emailGeneral')}</b><br /><a href={`mailto:${support}`} style={{ color: 'var(--gold)' }}>{support}</a></p>
            <p><b>{t('emailSupport')}</b><br /><a href={`mailto:${tech}`} style={{ color: 'var(--gold)' }}>{tech}</a></p>
            <p><b>{t('emailBusiness')}</b><br /><a href={`mailto:${business}`} style={{ color: 'var(--gold)' }}>{business}</a></p>

            {(company.legalName || company.cui || company.address) && (
              <>
                <h2 style={{ marginTop: 24 }}>{t('companyTitle')}</h2>
                <p style={{ fontSize: 13 }}>
                  {company.legalName && <>{company.legalName}<br /></>}
                  {(company.cui || company.regCom) && (
                    <>
                      {[company.cui && `CUI: ${company.cui}`, company.regCom].filter(Boolean).join(' · ')}
                      <br />
                    </>
                  )}
                  {company.address}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
