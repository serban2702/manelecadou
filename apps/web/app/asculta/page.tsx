'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SiteShell } from '@/components/SiteShell';
import { api } from '@/lib/api';
import { OCC, STYLES, VOICES } from '@/lib/seed-data';
import { ManeaPlayer } from '@/components/ManeaPlayer';

type Period = 'week' | 'month' | 'all';
type Sort = 'recent' | 'popular';

const PAGE_SIZE = 24;

export default function AsculaPage() {
  const [styleId, setStyleId] = useState('');
  const [occasion, setOccasion] = useState('');
  const [voice, setVoice] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['gallery', styleId, occasion, voice, period, sort, page],
    queryFn: () =>
      api.publicGenerations({
        style: styleId || undefined,
        occasion: occasion || undefined,
        voice: voice || undefined,
        period,
        sort,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    refetchInterval: 30_000,
  });

  function clearFilters() {
    setStyleId('');
    setOccasion('');
    setVoice('');
    setPeriod('all');
    setSort('recent');
    setPage(0);
  }

  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const hasFilters = !!styleId || !!occasion || !!voice || period !== 'all' || sort !== 'recent';

  return (
    <SiteShell>
      <div className="site-main">
        <section className="hero-wrap" style={{ padding: '20px 0 6px' }}>
          <div className="hero-flag">🎧 Galerie & live feed</div>
          <h1 className="gold-text">Ascultă manele</h1>
          <p className="sub-lead">
            Manele generate de AI — filtrează după stil, ocazie, voce. Sortează după cele mai noi sau cele mai populare.
          </p>
        </section>

        {/* Filtre */}
        <section className="band" style={{ marginTop: 20 }}>
          <div
            style={{
              display: 'grid',
              gap: 14,
              padding: 16,
              background: 'rgba(241,200,77,0.04)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              marginBottom: 18,
            }}
          >
            <FilterRow label="Stil">
              <Chip active={!styleId} onClick={() => { setStyleId(''); setPage(0); }}>Toate</Chip>
              {STYLES.map((s) => (
                <Chip key={s.id} active={styleId === s.id} onClick={() => { setStyleId(s.id); setPage(0); }}>
                  {s.em} {s.nm}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Ocazie">
              <Chip active={!occasion} onClick={() => { setOccasion(''); setPage(0); }}>Toate</Chip>
              {OCC.map((o) => (
                <Chip key={o.id} active={occasion === o.id} onClick={() => { setOccasion(o.id); setPage(0); }}>
                  {o.em} {o.nm}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Voce">
              <Chip active={!voice} onClick={() => { setVoice(''); setPage(0); }}>Toate</Chip>
              {VOICES.map((v) => (
                <Chip key={v.id} active={voice === v.id} onClick={() => { setVoice(v.id); setPage(0); }}>
                  {v.nm}
                </Chip>
              ))}
            </FilterRow>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)', alignSelf: 'center', marginRight: 4 }}>Perioadă:</span>
                {(['week', 'month', 'all'] as const).map((p) => (
                  <Chip key={p} active={period === p} onClick={() => { setPeriod(p); setPage(0); }}>
                    {p === 'week' ? 'Săpt.' : p === 'month' ? 'Luna' : 'Tot'}
                  </Chip>
                ))}
                <span style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)', alignSelf: 'center', marginLeft: 12, marginRight: 4 }}>Sort:</span>
                <Chip active={sort === 'recent'} onClick={() => { setSort('recent'); setPage(0); }}>Recente</Chip>
                <Chip active={sort === 'popular'} onClick={() => { setSort('popular'); setPage(0); }}>Populare</Chip>
              </div>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  style={{
                    background: 'transparent', border: '1px solid var(--line)',
                    color: 'rgba(255,245,220,0.6)', padding: '6px 12px',
                    borderRadius: 999, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  ✕ Resetează
                </button>
              )}
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.5)', marginBottom: 14 }}>
            {isLoading ? 'Se încarcă...' : `${total} manele găsite`}
          </div>

          {items.length === 0 && !isLoading ? (
            <div style={{ textAlign: 'center', padding: 36 }}>
              <p className="ld">Nu s-a găsit nimic cu filtrele astea. Încearcă să le resetezi.</p>
              <Link href="/studio" className="btn btn-gold" style={{ textDecoration: 'none', marginTop: 14 }}>
                🎤 Fă prima ta manea
              </Link>
            </div>
          ) : (
            <div className="demo-grid">
              {items.map((r) => {
                const voiceNm = VOICES.find((v) => v.id === r.voiceArtist)?.nm ?? r.voiceArtist;
                const styleNm = STYLES.find((s) => s.id === r.style)?.nm ?? r.style;
                return (
                  <Link
                    href={`/m/${r.id}`}
                    key={r.id}
                    className="demo-card"
                    style={{ textDecoration: 'none', flexDirection: 'column', alignItems: 'stretch' }}
                  >
                    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                      <div style={{
                        width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                        background: 'radial-gradient(circle at 35% 35%, #2a1a04 6%, #1a0a0a 12%, #0a0606 24%, #2a1a04 64%)',
                        border: '1px solid var(--gold-deep)',
                      }} />
                      <div className="meta" style={{ flex: 1, minWidth: 0 }}>
                        <div className="nm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Pentru {r.recipientName}</div>
                        <div className="by">{voiceNm} · {styleNm}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,245,220,0.4)', marginTop: 2 }}>
                          ▶ {r.viewCount ?? 0} ascultări
                        </div>
                      </div>
                    </div>
                    {r.audioUrl && <div onClick={(e) => e.preventDefault()}><ManeaPlayer audioUrl={r.audioUrl} compact /></div>}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Paginare */}
          {total > PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 24 }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                style={{ opacity: page === 0 ? 0.4 : 1 }}
              >
                ← Anterioare
              </button>
              <span style={{ alignSelf: 'center', fontSize: 12, color: 'rgba(255,245,220,0.6)' }}>
                {page + 1} / {Math.ceil(total / PAGE_SIZE)}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
                style={{ opacity: (page + 1) * PAGE_SIZE >= total ? 0.4 : 1 }}
              >
                Următoare →
              </button>
            </div>
          )}
        </section>

        <section className="band" style={{ textAlign: 'center' }}>
          <Link href="/studio" className="btn btn-gold btn-lg" style={{ textDecoration: 'none' }}>
            🎤 Fă maneaua ta acum — 24,99 lei
          </Link>
        </section>
      </div>
    </SiteShell>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        background: active ? 'var(--gold)' : 'rgba(241,200,77,0.06)',
        color: active ? '#2a1a04' : 'var(--cream)',
        border: `1px solid ${active ? 'var(--gold)' : 'var(--line)'}`,
        borderRadius: 999,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
