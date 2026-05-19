'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/providers';
import { useSite } from '@/lib/site-context';

type PrizeKey = 'ghinion' | 'tier1' | 'tier2' | 'tier3' | 'gratis';

const SEGMENT_COLORS: Record<PrizeKey, string> = {
  ghinion: '#5a0d18',
  tier1: '#b07c1e',
  tier2: '#5a0d18',
  tier3: '#b07c1e',
  gratis: '#ff2d7e',
};

const SEGMENT_ORDER: PrizeKey[] = ['ghinion', 'tier1', 'tier2', 'tier3', 'gratis'];
const SLICE_DEG = 360 / SEGMENT_ORDER.length;

/**
 * Echivalentul tier1/tier2/tier3 în cents per currency. Trebuie să fie SINCRON
 * cu TIER_AMOUNTS_BY_CURRENCY din backend (apps/api/.../roulette.service.ts).
 * Folosit pentru randarea segmentelor înainte de spin (când nu avem încă
 * răspuns de la server).
 */
const TIER_AMOUNTS_BY_CURRENCY: Record<string, { tier1: number; tier2: number; tier3: number }> = {
  RON: { tier1: 500, tier2: 1000, tier3: 2000 },
  EUR: { tier1: 100, tier2: 200, tier3: 400 },
  BGN: { tier1: 200, tier2: 400, tier3: 800 },
  RSD: { tier1: 12000, tier2: 24000, tier3: 48000 },
  TRY: { tier1: 4000, tier2: 8000, tier3: 16000 },
  HUF: { tier1: 40000, tier2: 80000, tier3: 160000 },
  BAM: { tier1: 200, tier2: 400, tier3: 800 },
};

interface Result {
  prizeIndex: number;
  prizeKey: PrizeKey;
  code?: string | null;
  discountCents?: number;
  currency?: string;
}

export function RouletteWheel({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const site = useSite();
  const t = useTranslations('roulette');
  const fmt = useFormatter();
  const locale = useLocale();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [nextSpinAt, setNextSpinAt] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .rouletteStatus()
      .then((s) => {
        setAvailable(s.ok);
        if (!s.ok && s.nextSpinAt) setNextSpinAt(s.nextSpinAt);
      })
      .catch(() => setAvailable(false));
  }, []);

  // Sumele pentru tier1/2/3 — în moneda site-ului.
  const tierAmounts = useMemo(() => {
    const cur = site.currency || 'RON';
    return TIER_AMOUNTS_BY_CURRENCY[cur] ?? TIER_AMOUNTS_BY_CURRENCY.RON;
  }, [site.currency]);

  function formatMoney(cents: number, currency: string): string {
    const value = cents / 100;
    try {
      return fmt.number(value, { style: 'currency', currency, maximumFractionDigits: 0 });
    } catch {
      return `${value} ${currency}`;
    }
  }

  // Label per segment, în limba/valuta curentă.
  function labelFor(key: PrizeKey): string {
    if (key === 'ghinion') return t('ghinion');
    if (key === 'gratis') return t('gratis');
    const cents = tierAmounts[key];
    return formatMoney(cents, site.currency || 'RON');
  }

  async function spin() {
    setSpinning(true);
    setError(null);
    try {
      const r = await api.rouletteSpin(session.email ?? undefined);
      const targetCenter = r.prizeIndex * SLICE_DEG + SLICE_DEG / 2;
      const finalRotation = 360 * 5 + (360 - targetCenter);
      setRotation(finalRotation);
      setTimeout(() => {
        setResult(r);
        setSpinning(false);
        setAvailable(false);
      }, 3700);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? t('cooldownError')
          : t('genericError'),
      );
      setSpinning(false);
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #170a0a, #0c0707)',
          border: '2px solid var(--gold)',
          borderRadius: 16,
          padding: 24,
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 20px 60px rgba(241,200,77,0.3)',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,245,220,0.5)',
            cursor: 'pointer',
            fontSize: 24,
          }}
        >
          ×
        </button>

        <div className="serif gold-text" style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>
          🎡 {t('title')}
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,245,220,0.6)', marginBottom: 20 }}>
          {t('subtitle', {
            tier1: formatMoney(tierAmounts.tier1, site.currency || 'RON'),
            tier3: formatMoney(tierAmounts.tier3, site.currency || 'RON'),
          })}
        </p>

        {/* Wheel */}
        <div style={{ position: 'relative', width: 280, height: 280, margin: '0 auto' }}>
          {/* Pointer top */}
          <div
            style={{
              position: 'absolute',
              top: -12,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '14px solid transparent',
              borderRight: '14px solid transparent',
              borderTop: '24px solid var(--gold)',
              zIndex: 2,
              filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
            }}
          />

          <svg
            viewBox="0 0 200 200"
            style={{
              width: '100%',
              height: '100%',
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 3.5s cubic-bezier(0.17, 0.67, 0.16, 0.99)' : 'none',
              filter: 'drop-shadow(0 8px 20px rgba(241,200,77,0.4))',
            }}
          >
            {SEGMENT_ORDER.map((key, i) => {
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
                <g key={key}>
                  <path
                    d={`M 100 100 L ${x1} ${y1} A 95 95 0 0 1 ${x2} ${y2} Z`}
                    fill={SEGMENT_COLORS[key]}
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
                    {labelFor(key)}
                  </text>
                </g>
              );
            })}
            <circle cx="100" cy="100" r="14" fill="var(--gold)" stroke="#2a1a04" strokeWidth="2" />
            <text x="100" y="100" textAnchor="middle" dominantBaseline="middle" fontSize="14">
              👑
            </text>
          </svg>
        </div>

        {error && (
          <div
            style={{
              marginTop: 14,
              padding: 10,
              borderRadius: 8,
              background: 'rgba(255,45,126,0.12)',
              border: '1px solid rgba(255,45,126,0.4)',
              color: '#ffd6e6',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {result ? (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>
              {result.prizeKey === 'ghinion' ? '😅' : '🎉'}
            </div>
            <div className="gold-text" style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
              {result.prizeKey === 'ghinion'
                ? t('ghinion')
                : result.prizeKey === 'gratis'
                  ? t('gratis')
                  : t('discountWin', {
                      amount: formatMoney(
                        result.discountCents ?? 0,
                        result.currency || site.currency || 'RON',
                      ),
                    })}
            </div>
            {result.code && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(241,200,77,0.1)',
                  border: '2px dashed var(--gold)',
                }}
              >
                <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)', marginBottom: 4 }}>
                  {t('codeLabel')}
                </div>
                <div
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    color: 'var(--gold-2)',
                  }}
                >
                  {result.code}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(result.code!)}
                  style={{
                    marginTop: 8,
                    padding: '4px 10px',
                    fontSize: 11,
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--gold)',
                    border: '1px solid rgba(241,200,77,0.3)',
                    borderRadius: 999,
                    cursor: 'pointer',
                  }}
                >
                  📋 {t('copyButton')}
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="btn btn-gold"
              style={{ marginTop: 14, textDecoration: 'none' }}
            >
              {result.code ? t('useAtGenerate') : t('close')}
            </button>
          </div>
        ) : !available ? (
          <div style={{ marginTop: 18, fontSize: 13, color: 'rgba(255,245,220,0.6)' }}>
            ⏳{' '}
            {nextSpinAt
              ? t('availableAgainOn', {
                  date: new Date(nextSpinAt).toLocaleDateString(locale),
                })
              : t('availableAgainSoon')}
          </div>
        ) : (
          <button
            onClick={spin}
            disabled={spinning || available === null}
            className="btn btn-gold btn-lg"
            style={{ marginTop: 18, minWidth: 180 }}
            data-hint="true"
            data-hint-label={t('spinButton')}
          >
            {spinning ? `🎡 ${t('spinning')}` : `🎡 ${t('spinButton')}`}
          </button>
        )}
      </div>
    </div>
  );
}
