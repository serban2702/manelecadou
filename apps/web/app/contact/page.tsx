'use client';

import { useState } from 'react';
import { SiteShell } from '@/components/SiteShell';
import { useSite } from '@/lib/site-context';
import { siteSupportEmail } from '@/lib/site-config';

export default function ContactPage() {
  const site = useSite();
  const support = siteSupportEmail(site);
  const tech = site.companyInfo?.legalName ? `tech@${site.domain}` : support;
  const business = site.companyInfo?.legalName ? `business@${site.domain}` : support;
  const company = site.companyInfo ?? {};
  const [sent, setSent] = useState(false);

  return (
    <SiteShell>
      <div className="inner-page">
        <h1 className="gold-text">Contact</h1>
        <p className="lead">Bă fine, scrie-ne. Răspundem în 24h în zilele lucrătoare.</p>

        <div className="split-2" style={{ marginTop: 12 }}>
          <div>
            <h2>Scrie-ne</h2>
            {sent ? (
              <div style={{
                padding: 16, borderRadius: 10,
                border: '1px solid var(--gold)', background: 'rgba(241,200,77,0.06)',
              }}>
                ✓ Mesajul a fost trimis. Te contactăm la email-ul lăsat.
              </div>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); setSent(true); }}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div className="field">
                  <label>Email</label>
                  <input type="email" required placeholder="tu@email.ro" />
                </div>
                <div className="field">
                  <label>Subiect</label>
                  <input type="text" required placeholder="ex. Problemă cu o manea" />
                </div>
                <div className="field">
                  <label>Mesaj</label>
                  <textarea required style={{ minHeight: 140 }} placeholder="Spune-ne ce s-a întâmplat..." />
                </div>
                <button className="btn btn-gold btn-lg">Trimite</button>
              </form>
            )}
          </div>
          <div>
            <h2>Detalii</h2>
            <p><b>Email general</b><br /><a href={`mailto:${support}`} style={{ color: 'var(--gold)' }}>{support}</a></p>
            <p><b>Suport tehnic</b><br /><a href={`mailto:${tech}`} style={{ color: 'var(--gold)' }}>{tech}</a></p>
            <p><b>Comercial / B2B</b><br /><a href={`mailto:${business}`} style={{ color: 'var(--gold)' }}>{business}</a></p>

            {(company.legalName || company.cui || company.address) && (
              <>
                <h2 style={{ marginTop: 24 }}>Date firmă</h2>
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
