'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import type { SongSkin } from '@/components/song-skin';
import { CadouFold } from '@/experiences/cadou/Fold';

/**
 * Parola de privacy peste conținutul privat al unei manele (poza încărcată de
 * owner + colajele). Livrabil vechi: owner-ul setează un PIN, îl dă cui vrea,
 * iar vizitatorul îl introduce o dată și accesul se ține în localStorage.
 *
 * `password` intră în `api.getGeneration` / `api.listCollages` ca header.
 */
export function useUnlockPassword(generationId: string | undefined): {
  password: string | null;
  unlock: (password: string) => void;
} {
  // Parola de privacy (non-owner) — persistată în localStorage ca refresh-ul să
  // păstreze accesul. `null` = neintrodusă / owner.
  const [password, setPassword] = useState<string | null>(null);

  // Citește parola persistată la mount (înainte de primul refresh).
  useEffect(() => {
    if (typeof window === 'undefined' || !generationId) return;
    try {
      const saved = window.localStorage.getItem(`mc_unlock_${generationId}`);
      if (saved) setPassword(saved);
    } catch {/* ignore */}
  }, [generationId]);

  const unlock = useCallback((pw: string) => {
    setPassword(pw);
    if (!generationId) return;
    try { window.localStorage.setItem(`mc_unlock_${generationId}`, pw); } catch {/* ignore */}
  }, [generationId]);

  return { password, unlock };
}

/** Card de deblocare (non-owner) — input parolă + buton „Deblochează". */
export function UnlockPrompt({
  generationId,
  skin,
  onUnlocked,
}: {
  generationId: string;
  skin: SongSkin;
  onUnlocked: (password: string) => void;
}) {
  const t = useTranslations('cadou.legacy.unlock');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!pw.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.checkUnlock(generationId, pw);
      if (r.ok) {
        onUnlocked(pw);
      } else {
        setErr(t('wrong'));
      }
    } catch {
      setErr(t('wrong'));
    } finally {
      setBusy(false);
    }
  }

  if (skin === 'classic') {
    return (
      <div style={{
        marginTop: 14, padding: 16, borderRadius: 12,
        background: 'rgba(241,200,77,0.06)', border: '1px solid rgba(241,200,77,0.3)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold-2)', marginBottom: 4 }}>
          {t('title')}
        </div>
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
          {t('lead')}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setErr(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder={t('placeholder')}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8,
              background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)',
              color: 'var(--gold-2)', fontFamily: 'inherit', fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!pw.trim() || busy}
            className="btn btn-gold"
            style={{ padding: '8px 16px', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? t('checking') : t('submit')}
          </button>
        </div>
        {err && <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{err}</div>}
      </div>
    );
  }

  return (
    <div className="cadou-song-card cadou-song-status">
      <div className="cadou-kicker">{t('titleFold')}</div>
      <p>{t('lead')}</p>
      <div className="cadou-row">
        <input
          className="cadou-input"
          type="password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder={t('placeholder')}
        />
        <button
          type="button"
          className="cadou-cta"
          onClick={() => void submit()}
          disabled={!pw.trim() || busy}
        >
          {busy ? t('checking') : t('submit')}
        </button>
      </div>
      {err && <p className="cadou-err" role="alert">{err}</p>}
    </div>
  );
}

/** Control owner — setează/șterge parola de privacy peste pozele/colajele private. */
export function OwnerPasswordControl({
  generationId,
  hasPassword,
  currentPin,
  skin,
  defaultOpen = true,
  onChanged,
}: {
  generationId: string;
  hasPassword: boolean;
  currentPin?: string | null;
  skin: SongSkin;
  /** cadou: secțiunea pornește deschisă sau pliată. */
  defaultOpen?: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations('cadou.legacy.pin');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(value: string | null) {
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      await api.setUnlockPassword(generationId, value);
      setPw('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('errSave'));
    } finally {
      setBusy(false);
    }
  }

  if (skin === 'classic') {
    return (
      <div style={{
        marginTop: 14, padding: 16, borderRadius: 12,
        background: 'rgba(241,200,77,0.06)', border: '1px solid rgba(241,200,77,0.2)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
          {t('title')}
        </div>
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
          {t('lead')}
          {hasPassword && !currentPin && <b style={{ color: 'var(--gold-2)' }}> {t('active')}</b>}
        </div>
        {currentPin && (
          <div style={{
            marginBottom: 12, padding: '10px 12px', borderRadius: 8, textAlign: 'center',
            background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)',
          }}>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{t('currentLabel')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: 'var(--gold)' }}>{currentPin}</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setErr(null); }}
            placeholder={hasPassword ? t('placeholderNew') : t('placeholderSet')}
            style={{
              flex: '1 1 160px', padding: '8px 10px', borderRadius: 8,
              background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)',
              color: 'var(--gold-2)', fontFamily: 'inherit', fontSize: 13,
            }}
          />
          <button
            type="button"
            onClick={() => save(pw)}
            disabled={!pw.trim() || busy}
            className="btn btn-gold"
            style={{ padding: '8px 16px', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? t('saving') : saved ? t('saved') : t('save')}
          </button>
          {hasPassword && (
            <button
              type="button"
              onClick={() => save(null)}
              disabled={busy}
              className="btn btn-ghost"
              style={{ padding: '8px 16px' }}
            >
              {t('clear')}
            </button>
          )}
        </div>
        {err && <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{err}</div>}
      </div>
    );
  }

  return (
    <CadouFold title={t('titleFold')} defaultOpen={defaultOpen}>
      <p className="cadou-video-lead">
        {t('lead')}
        {hasPassword && !currentPin && <b> {t('active')}</b>}
      </p>

      {currentPin && (
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div className="cadou-hint">{t('currentLabel')}</div>
          <strong style={{
            display: 'block', marginTop: 2, fontSize: 24, fontWeight: 800,
            letterSpacing: 4, color: 'var(--cadou-gold-deep)',
          }}>{currentPin}</strong>
        </div>
      )}

      <div className="cadou-row">
        <input
          className="cadou-input"
          type="text"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(null); }}
          placeholder={hasPassword ? t('placeholderNew') : t('placeholderSet')}
        />
        <button
          type="button"
          className="cadou-cta"
          onClick={() => void save(pw)}
          disabled={!pw.trim() || busy}
        >
          {busy ? t('saving') : saved ? t('saved') : t('save')}
        </button>
      </div>

      {hasPassword && (
        <button
          type="button"
          className="cadou-ghost"
          onClick={() => void save(null)}
          disabled={busy}
          style={{ marginTop: 10 }}
        >
          {t('clear')}
        </button>
      )}

      {err && <p className="cadou-err" role="alert">{err}</p>}
    </CadouFold>
  );
}
