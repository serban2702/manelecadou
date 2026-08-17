'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useSite } from '@/lib/site-context';
import { STYLES } from '@/lib/seed-data';
import { CadouShell } from './Shell';

function WizardInner() {
  const site = useSite();
  const search = useSearchParams();
  const styles = (site.styles && site.styles.length > 0) ? site.styles : STYLES;
  const [style, setStyle] = useState(search.get('style') || '');

  return (
    <CadouShell>
      <div className="cadou-wrap">
        <div className="cadou-hero" style={{ paddingBottom: 8 }}>
          <h1>Creează maneaua ta</h1>
          <p>Alege stilul, adaugă detaliile și noi creăm muzica.</p>
        </div>
        <div className="cadou-kicker">Pasul 1 din 4 · Stil</div>
        <h2 style={{ textAlign: 'center' }}>Alege stilul muzical</h2>
        <div className="cadou-grid">
          {styles.map((s) => (
            <button
              key={s.id}
              type="button"
              className="cadou-style"
              onClick={() => setStyle(s.id)}
              style={style === s.id ? { boxShadow: '0 0 0 2px var(--cadou-gold)' } : undefined}
            >
              <span className="em">{s.em}</span>
              <span className="nm">{s.nm}{style === s.id ? ' ✓' : ''}</span>
            </button>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link
            href={style ? `/studio?step=2&style=${encodeURIComponent(style)}` : '#'}
            className="cadou-cta"
            onClick={(e) => { if (!style) e.preventDefault(); }}
            style={!style ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            Pasul următor →
          </Link>
          <p style={{ color: 'var(--cadou-muted)', fontSize: 13, marginTop: 12 }}>
            Pașii 2–4 (detalii, pachet, plată) urmează imediat — skeleton-ul e pe loc.
          </p>
        </div>
      </div>
    </CadouShell>
  );
}

export default function CadouWizardPage() {
  return (
    <Suspense fallback={null}>
      <WizardInner />
    </Suspense>
  );
}
