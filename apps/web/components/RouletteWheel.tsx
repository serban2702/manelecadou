'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/providers';

const SEGMENTS = [
  { color: '#5a0d18', text: 'Mai noroc' },
  { color: '#b07c1e', text: '5 lei' },
  { color: '#5a0d18', text: '10 lei' },
  { color: '#b07c1e', text: '20 lei' },
  { color: '#ff2d7e', text: 'GRATIS!' },
];

const SLICE_DEG = 360 / SEGMENTS.length;

interface Result {
  prizeIndex: number;
  prizeLabel: string;
  code?: string | null;
}

export function RouletteWheel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [nextSpinAt, setNextSpinAt] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.rouletteStatus().then((s) => {
      setAvailable(s.ok);
      if (!s.ok && s.nextSpinAt) setNextSpinAt(s.nextSpinAt);
    }).catch(() => setAvailable(false));
  }, []);

  async function spin() {
    setSpinning(true);
    setError(null);
    try {
      const r = await api.rouletteSpin(session.email ?? undefined);
      // Calculează rotația: target = punctul de mijloc al segmentului winner
      const targetCenter = r.prizeIndex * SLICE_DEG + SLICE_DEG / 2;
      // Rotim wheel-ul invers ca pointer-ul de sus să indice spre target
      const finalRotation = 360 * 5 + (360 - targetCenter); // 5 ture extra
      setRotation(finalRotation);
      // Așteaptă animația (3.5s)
      setTimeout(() => {
        setResult(r);
        setSpinning(false);
        setAvailable(false);
      }, 3700);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? 'Ai folosit deja roata. Încearcă peste 7 zile.'
          : 'Eroare. Încearcă din nou.',
      );
      setSpinning(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'grid', placeItems: 'center', padding: 16,
      }}
    >
      <div style={{
        background: 'linear-gradient(180deg, #170a0a, #0c0707)',
        border: '2px solid var(--gold)',
        borderRadius: 16,
        padding: 24,
        maxWidth: 480,
        width: '100%',
        boxShadow: '0 20px 60px rgba(241,200,77,0.3)',
        textAlign: 'center',
        position: 'relative',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 14,
            background: 'transparent', border: 'none',
            color: 'rgba(255,245,220,0.5)', cursor: 'pointer', fontSize: 24,
          }}
        >×</button>

        <div className="serif gold-text" style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>
          🎡 Roata Norocului
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,245,220,0.6)', marginBottom: 20 }}>
          1 spin gratis la 7 zile. Reduceri 5-20 lei sau șansă de manea GRATIS!
        </p>

        {/* Wheel */}
        <div style={{ position: 'relative', width: 280, height: 280, margin: '0 auto' }}>
          {/* Pointer top */}
          <div style={{
            position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '14px solid transparent',
            borderRight: '14px solid transparent',
            borderTop: '24px solid var(--gold)',
            zIndex: 2,
            filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
          }} />

          {/* Wheel disk */}
          <svg
            viewBox="0 0 200 200"
            style={{
              width: '100%', height: '100%',
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 3.5s cubic-bezier(0.17, 0.67, 0.16, 0.99)' : 'none',
              filter: 'drop-shadow(0 8px 20px rgba(241,200,77,0.4))',
            }}
          >
            {SEGMENTS.map((seg, i) => {
              const startAngle = i * SLICE_DEG - 90;
              const endAngle = (i + 1) * SLICE_DEG - 90;
              const startRad = (startAngle * Math.PI) / 180;
              const endRad = (endAngle * Math.PI) / 180;
              const x1 = 100 + 95 * Math.cos(startRad);
              const y1 = 100 + 95 * Math.sin(startRad);
              const x2 = 100 + 95 * Math.cos(endRad);
              const y2 = 100 + 95 * Math.sin(endRad);
              const labelAngle = (startAngle + endAngle) / 2;
              const labelRad = (labelAngle * Math.PI) / 180;
              const labelX = 100 + 60 * Math.cos(labelRad);
              const labelY = 100 + 60 * Math.sin(labelRad);
              return (
                <g key={i}>
                  <path
                    d={`M 100 100 L ${x1} ${y1} A 95 95 0 0 1 ${x2} ${y2} Z`}
                    fill={seg.color}
                    stroke="var(--gold)"
                    strokeWidth="1.5"
                  />
                  <text
                    x={labelX}
                    y={labelY}
                    fill="white"
                    fontSize="11"
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${labelAngle + 90}, ${labelX}, ${labelY})`}
                  >
                    {seg.text}
                  </text>
                </g>
              );
            })}
            {/* Center hub */}
            <circle cx="100" cy="100" r="14" fill="var(--gold)" stroke="#2a1a04" strokeWidth="2" />
            <text x="100" y="100" textAnchor="middle" dominantBaseline="middle" fontSize="14">👑</text>
          </svg>
        </div>

        {error && (
          <div style={{
            marginTop: 14, padding: 10, borderRadius: 8,
            background: 'rgba(255,45,126,0.12)', border: '1px solid rgba(255,45,126,0.4)',
            color: '#ffd6e6', fontSize: 13,
          }}>{error}</div>
        )}

        {result ? (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>
              {result.prizeIndex === 0 ? '😅' : '🎉'}
            </div>
            <div className="gold-text" style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
              {result.prizeLabel}
            </div>
            {result.code && (
              <div style={{
                marginTop: 10, padding: 12, borderRadius: 10,
                background: 'rgba(241,200,77,0.1)', border: '2px dashed var(--gold)',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)', marginBottom: 4 }}>Codul tău</div>
                <div style={{
                  fontFamily: 'ui-monospace, monospace', fontSize: 22, fontWeight: 800,
                  letterSpacing: '0.1em', color: 'var(--gold-2)',
                }}>{result.code}</div>
                <button
                  onClick={() => navigator.clipboard.writeText(result.code!)}
                  style={{
                    marginTop: 8, padding: '4px 10px', fontSize: 11,
                    background: 'rgba(255,255,255,0.05)', color: 'var(--gold)',
                    border: '1px solid rgba(241,200,77,0.3)', borderRadius: 999, cursor: 'pointer',
                  }}
                >📋 Copiază</button>
              </div>
            )}
            <button
              onClick={onClose}
              className="btn btn-gold"
              style={{ marginTop: 14, textDecoration: 'none' }}
            >
              {result.code ? 'Folosesc la generare' : 'Închide'}
            </button>
          </div>
        ) : !available ? (
          <div style={{ marginTop: 18, fontSize: 13, color: 'rgba(255,245,220,0.6)' }}>
            ⏳ Roata e disponibilă din nou
            {nextSpinAt && <> pe <b>{new Date(nextSpinAt).toLocaleDateString('ro-RO')}</b></>}.
          </div>
        ) : (
          <button
            onClick={spin}
            disabled={spinning || available === null}
            className="btn btn-gold btn-lg"
            style={{ marginTop: 18, minWidth: 180 }}
            data-hint="true"
            data-hint-label="Învârte roata"
          >
            {spinning ? '🎡 Se învârte...' : '🎡 Învârte roata'}
          </button>
        )}
      </div>
    </div>
  );
}
