'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError, resolveMediaUrl, type GenerationDto } from '@/lib/api';
import { track as trackEvent } from '@/lib/tracker';
import type { SongSkin } from '@/components/song-skin';
import { CadouFold } from '@/experiences/cadou/Fold';

/**
 * Galeria de poze de share (livrabil vechi, plus/premium). Afișează variantele
 * generate ca thumbnails, una preselectată (`socialImageSelected`); click pe
 * alta → select optimistic + persist. Owner-ul își poate încărca poza proprie
 * (`socialImageUploaded`, conținut privat — vezi `UnlockPassword`).
 *
 * Se montează DOAR când există poze (`socialImages`), ca `selected` să pornească
 * pe varianta corectă. Placeholder-ul „se generează pozele" rămâne la call-site.
 */
export function SocialImagesSection({
  generation,
  isOwner,
  skin,
  defaultOpen = true,
  onUpdated,
  renderExtra,
}: {
  generation: GenerationDto;
  isOwner: boolean;
  skin: SongSkin;
  /** cadou: secțiunea pornește deschisă sau pliată. */
  defaultOpen?: boolean;
  // Backend-ul întoarce un obiect PARȚIAL (doar câmpurile schimbate), deci
  // callback-ul primește un Partial<GenerationDto>, iar părintele face merge.
  onUpdated: (fresh: Partial<GenerationDto>) => void;
  /** Extra sub butoane, specific interfeței (classic: panoul image→video). */
  renderExtra?: (selectedUrl: string | null) => ReactNode;
}) {
  const t = useTranslations('cadou.legacy.social');
  const images = generation.socialImages ?? [];
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selected, setSelected] = useState<string | null>(
    generation.socialImageSelected ?? images[0] ?? null,
  );
  const [uploaded, setUploaded] = useState<string | null>(generation.socialImageUploaded ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Sincronizează cu prop-ul când conținutul privat devine vizibil (ex. după
  // deblocare cu parolă, `socialImageUploaded` apare nou din backend).
  useEffect(() => {
    if (generation.socialImageUploaded != null) setUploaded(generation.socialImageUploaded);
  }, [generation.socialImageUploaded]);

  async function pick(url: string) {
    const prev = selected;
    setSelected(url); // optimistic
    setErr(null);
    try {
      const fresh = await api.selectSocialImage(generation.id, url);
      onUpdated(fresh);
    } catch {
      setSelected(prev); // rollback
      setErr(t('errSelect'));
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-upload același fișier
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fresh = await api.uploadSocialImage(generation.id, file);
      onUpdated(fresh);
      // `fresh` poate fi parțial — luăm câmpurile dacă există, altfel păstrăm starea.
      const freshUploaded = fresh.socialImageUploaded ?? null;
      setUploaded(freshUploaded);
      setSelected(fresh.socialImageSelected ?? freshUploaded ?? selected);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t('errUpload'));
    } finally {
      setBusy(false);
    }
  }

  const trackDownload = () =>
    trackEvent({ type: 'image_download', props: { generationId: generation.id, kind: 'social' } });

  const allThumbs = uploaded ? [uploaded, ...images] : images;
  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      onChange={onUpload}
      style={{ display: 'none' }}
    />
  );

  if (skin === 'classic') {
    return (
      <div style={{
        marginTop: 20, padding: 16, borderRadius: 12,
        background: 'rgba(241,200,77,0.06)',
        border: '1px solid rgba(241,200,77,0.2)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
          {t('title')}
        </div>
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
          {t('lead')}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {allThumbs.map((url) => {
            const resolved = resolveMediaUrl(url)!;
            const isSel = selected === url;
            return (
              <button
                key={url}
                type="button"
                onClick={() => pick(url)}
                style={{
                  position: 'relative', padding: 0, borderRadius: 10, overflow: 'hidden',
                  border: `3px solid ${isSel ? 'var(--gold)' : 'transparent'}`,
                  cursor: 'pointer', background: '#000', aspectRatio: '1 / 1',
                  boxShadow: isSel ? '0 4px 16px rgba(241,200,77,0.4)' : 'none',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolved}
                  alt={t('alt')}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {isSel && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'var(--gold)', color: '#2a1a04',
                    display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 900,
                  }}>✓</span>
                )}
                {uploaded === url && (
                  <span style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    fontSize: 10, fontWeight: 700, textAlign: 'center',
                    padding: '3px 0', background: 'rgba(0,0,0,0.6)', color: 'var(--gold)',
                  }}>{t('yours')}</span>
                )}
              </button>
            );
          })}
        </div>

        {fileInput}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {/* Upload poză proprie — doar owner. */}
          {isOwner && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="btn btn-ghost"
              style={{ flex: '1 1 140px', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? t('uploading') : t('upload')}
            </button>
          )}
          {/* Descarcă varianta selectată (PNG) — publică, oricine poate. */}
          {selected && (
            <a
              href={resolveMediaUrl(selected)!}
              download
              onClick={trackDownload}
              className="btn btn-ghost"
              style={{ flex: '1 1 140px', textAlign: 'center', textDecoration: 'none' }}
            >
              {t('download')}
            </a>
          )}
        </div>

        {renderExtra?.(selected)}

        {err && <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{err}</div>}
      </div>
    );
  }

  return (
    <CadouFold title={t('titleFold')} className="cadou-video" defaultOpen={defaultOpen}>
      <p className="cadou-video-lead">{isOwner ? t('lead') : t('leadGuest')}</p>

      <div className="cadou-video-thumbs">
        {allThumbs.map((url) => {
          const resolved = resolveMediaUrl(url)!;
          const isSel = selected === url;
          const badge = uploaded === url ? (
            <span style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              fontSize: 10, fontWeight: 800, textAlign: 'center', padding: '3px 0',
              background: 'rgba(26,26,26,0.62)', color: '#fff',
            }}>{t('yours')}</span>
          ) : null;
          if (!isOwner) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={resolved} alt={t('alt')} />
            );
          }
          return (
            <button
              key={url}
              type="button"
              className={isSel ? 'is-on' : undefined}
              aria-pressed={isSel}
              onClick={() => pick(url)}
              style={{ position: 'relative' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolved} alt={t('alt')} />
              {badge}
            </button>
          );
        })}
      </div>

      {fileInput}
      <div className="cadou-clip-actions">
        {isOwner && (
          <button
            type="button"
            className="cadou-clip-btn"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? t('uploading') : t('uploadShort')}
          </button>
        )}
        {selected && (
          <a
            className="cadou-clip-btn"
            href={resolveMediaUrl(selected)!}
            download
            onClick={trackDownload}
          >
            {t('downloadShort')}
          </a>
        )}
      </div>

      {renderExtra?.(selected)}

      {err && <p className="cadou-err" role="alert">{err}</p>}
    </CadouFold>
  );
}
