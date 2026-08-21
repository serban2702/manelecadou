'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type SiteDemoDto } from '@/lib/api';
import { useSite } from '@/lib/site-context';
import { getPagePath } from '@/lib/page-slugs';
import { useExperienceCatalog } from '../use-experience-catalog';
import { CadouShell } from './Shell';
import { CadouDemoPlayer } from './DemoPlayer';
import { cadouArtForDemo, cadouStyleIdFromTitle } from './style-art';

export default function CadouListenPage() {
  const site = useSite();
  const studio = getPagePath(site.locale, 'studio');
  const { demoIds, styles } = useExperienceCatalog();
  const [styleKey, setStyleKey] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['site-demos'],
    queryFn: () => api.siteDemos(),
    staleTime: 60_000,
  });

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (!demoIds?.length) return all;
    return all.filter((d) => demoIds.includes(d.id));
  }, [data?.items, demoIds]);

  const filtered = useMemo(() => {
    if (!styleKey) return items;
    return items.filter((d) => cadouStyleIdFromTitle(d.title, d.category) === styleKey);
  }, [items, styleKey]);

  const styleFilters = useMemo(() => {
    const used = new Set(items.map((d) => cadouStyleIdFromTitle(d.title, d.category)));
    const hits = styles.filter((s) => used.has(s.id));
    return hits.length ? hits : styles;
  }, [items, styles]);

  return (
    <CadouShell>
      <div className="cadou-wrap">
        <section className="cadou-section cadou-panel">
          <div className="cadou-kicker">Demo-uri reale</div>
          <h2>Ascultă manele generate de noi</h2>
          <p className="lead">Exemple complete, cu nume și povești — ca să știi ce primești.</p>

          {styleFilters.length > 1 && (
            <div className="cadou-chips" style={{ justifyContent: 'center', marginBottom: 22 }}>
              <button
                type="button"
                className={`cadou-chip${!styleKey ? ' on' : ''}`}
                onClick={() => setStyleKey('')}
              >
                Toate
              </button>
              {styleFilters.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`cadou-chip${styleKey === s.id ? ' on' : ''}`}
                  onClick={() => setStyleKey(s.id)}
                >
                  {s.nm}
                </button>
              ))}
            </div>
          )}

          {isLoading ? (
            <p className="cadou-hint" style={{ textAlign: 'center' }}>Încărcăm demo-urile…</p>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 8px' }}>
              <p className="cadou-hint">Niciun demo încă. Fă tu prima manea.</p>
              <Link href={studio} className="cadou-cta" style={{ marginTop: 14 }}>Fă o manea!</Link>
            </div>
          ) : (
            <div className="cadou-listen-grid">
              {filtered.map((d) => (
                <CadouDemoCard key={d.id} demo={d} />
              ))}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <Link href={studio} className="cadou-cta">Fă o manea ca astea</Link>
          </div>
        </section>
      </div>
    </CadouShell>
  );
}

function CadouDemoCard({ demo }: { demo: SiteDemoDto }) {
  const [lyrics, setLyrics] = useState(false);
  const dedic = [demo.fromName && `de la ${demo.fromName}`, demo.toName && `pentru ${demo.toName}`]
    .filter(Boolean)
    .join(' ');
  const cover = cadouArtForDemo({
    title: demo.title,
    category: demo.category,
    thumbnailUrl: demo.thumbnailUrl,
  });

  return (
    <article className="cadou-listen-card">
      <div className="cadou-listen-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cadou-listen-cover" src={cover} alt="" />
        <div className="cadou-listen-meta">
          <div className="ttl">{demo.title}</div>
          {dedic && <div className="who">{dedic}</div>}
        </div>
      </div>
      <CadouDemoPlayer audioUrl={demo.audioUrl} startSec={demo.previewStartSec} />
      {demo.lyrics && (
        <>
          <button type="button" className="cadou-listen-lyrics-btn" onClick={() => setLyrics((v) => !v)}>
            {lyrics ? 'Ascunde versurile' : 'Vezi versurile'}
          </button>
          {lyrics && <pre className="cadou-listen-lyrics">{demo.lyrics}</pre>}
        </>
      )}
    </article>
  );
}
