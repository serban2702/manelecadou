'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { SiteShell } from '@/components/SiteShell';
import { api, type GenerationDto } from '@/lib/api';
import { STYLES, VOICES, OCC } from '@/lib/seed-data';

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  queued:           { label: 'În așteptare',  color: '#ffd680', bg: 'rgba(241,200,77,0.12)' },
  writing_lyrics:   { label: 'Scriem versuri', color: '#ffd680', bg: 'rgba(241,200,77,0.12)' },
  checking_lyrics:  { label: 'Verificăm versuri', color: '#ffd680', bg: 'rgba(241,200,77,0.12)' },
  generating_audio: { label: 'Se cântă',       color: '#ffd680', bg: 'rgba(241,200,77,0.12)' },
  succeeded:        { label: 'Gata',           color: '#bff5d2', bg: 'rgba(62,224,126,0.12)' },
  failed:           { label: 'Eșuat',          color: '#ffd6e6', bg: 'rgba(255,45,126,0.18)' },
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ro-RO', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function ManeleleMelePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-generations'],
    queryFn: api.listGenerations,
    refetchInterval: (q) => {
      const items = q.state.data;
      // dacă e ceva în lucru, refetch la 5s
      const inFlight = items?.some(
        (g) => g.status !== 'succeeded' && g.status !== 'failed',
      );
      return inFlight ? 5000 : false;
    },
  });

  return (
    <SiteShell hideStickyCta>
      <div className="inner-page">
        <h1 className="gold-text">🎵 Manelele mele</h1>
        <p className="lead">
          Toate piesele pe care le-ai generat — demouri și complete. Click pe oricare ca să asculți și
          (dacă e demo) să o deblochezi.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, marginBottom: 22 }}>
          <Link href="/studio" className="btn btn-gold" style={{ textDecoration: 'none' }}>
            🎤 Fă încă o manea
          </Link>
        </div>

        {isLoading && <p className="ld">Se încarcă manelele tale...</p>}

        {error && (
          <p style={{ color: '#ff8888' }}>
            Nu am putut încărca lista. Încearcă din nou peste un moment.
          </p>
        )}

        {data && data.length === 0 && (
          <div style={{
            padding: 24, textAlign: 'center',
            background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(241,200,77,0.3)',
            borderRadius: 12,
          }}>
            <p>N-ai generat încă nicio manea.</p>
            <Link href="/studio" className="btn btn-gold" style={{ textDecoration: 'none', marginTop: 10 }}>
              🎤 Fă prima manea
            </Link>
          </div>
        )}

        {data && data.length > 0 && (
          <div style={{ display: 'grid', gap: 12 }}>
            {data.map((g) => (
              <GenerationRow key={g.id} g={g} />
            ))}
          </div>
        )}
      </div>
    </SiteShell>
  );
}

function GenerationRow({ g }: { g: GenerationDto }) {
  const styleNm = STYLES.find((s) => s.id === g.style)?.nm ?? g.style;
  const occNm = OCC.find((o) => o.id === g.occasion)?.nm ?? g.occasion;
  const voiceNm = VOICES.find((v) => v.id === g.voiceArtist)?.nm ?? g.voiceArtist;
  const status = STATUS_BADGE[g.status] ?? { label: g.status, color: '#ccc', bg: 'rgba(255,255,255,0.08)' };
  const isPaid = g.type === 'full' || g.paidUnlocked;
  const isPlayable = g.status === 'succeeded' && !!g.audioUrl;

  return (
    <Link
      href={`/m/${g.id}`}
      style={{
        display: 'block',
        padding: 14,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--line)',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s ease, background 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold-2)' }}>
              Pentru {g.recipientName}
            </span>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 999,
              background: status.bg, color: status.color, fontWeight: 600,
            }}>
              {status.label}
            </span>
            {isPaid ? (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 999,
                background: 'rgba(62,224,126,0.15)', color: '#bff5d2', fontWeight: 600,
              }}>
                ✓ Deblocată
              </span>
            ) : g.type === 'demo' ? (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 999,
                background: 'rgba(241,200,77,0.15)', color: '#f1c84d', fontWeight: 600,
              }}>
                🔒 Demo (30s)
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.55)', marginTop: 4 }}>
            {styleNm} · {occNm} · voce: {voiceNm}
          </div>
          {g.dedication && (
            <div style={{ fontSize: 12, color: 'rgba(255,245,220,0.45)', marginTop: 2 }}>
              de la {g.dedication}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.4)', marginTop: 6 }}>
            {fmtDate(g.createdAt)}
          </div>
        </div>
        <div style={{ alignSelf: 'center', fontSize: 13, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
          {isPlayable ? (isPaid ? 'Ascultă →' : 'Ascultă demo / Deblochează →') : 'Detalii →'}
        </div>
      </div>
    </Link>
  );
}
