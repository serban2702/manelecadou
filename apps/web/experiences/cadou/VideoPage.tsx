'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError, type GenerationDto } from '@/lib/api';
import { CadouShell } from './Shell';
import { useCadouFromName } from './from-name';
import { cadouClipTracks, useCadouTrackLabels } from './video-tracks';

const MAX_IMAGES = 15;
const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;

export default function CadouVideoPage() {
  return (
    <CadouShell>
      <Suspense fallback={<CadouVideoFallback />}>
        <CadouVideoInner />
      </Suspense>
    </CadouShell>
  );
}

function CadouVideoFallback() {
  const t = useTranslations('cadou.video.page');
  return (
    <div className="cadou-wrap cadou-song-wrap">
      <div className="cadou-panel cadou-song"><p className="cadou-hint">{t('loading')}</p></div>
    </div>
  );
}

function CadouVideoInner() {
  const t = useTranslations('cadou.video.page');
  const fromName = useCadouFromName();
  const trackLabels = useCadouTrackLabels();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [g, setG] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const fresh = await api.getGeneration(id);
      setG(fresh);
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError && (e.status === 401 || e.status === 403)
          ? t('errForbidden')
          : t('errLoad'),
      );
    }
  }, [id, t]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => () => { previews.forEach((u) => URL.revokeObjectURL(u)); }, [previews]);

  const tracks = g ? cadouClipTracks(g, trackLabels) : [];

  const acceptFiles = (all: File[]) => {
    const picked = all.filter((f) => f.type.startsWith('image/'));
    if (picked.length === 0) {
      if (all.length > 0) setError(t('errOnlyImages'));
      return;
    }
    if (picked.length > MAX_IMAGES) {
      setError(t('errMaxImages', { max: MAX_IMAGES }));
      return;
    }
    const tooBig = picked.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(t('errTooBig', { name: tooBig.name, max: MAX_MB }));
      return;
    }
    previews.forEach((u) => URL.revokeObjectURL(u));
    setError(null);
    setFiles(picked);
    setPreviews(picked.map((f) => URL.createObjectURL(f)));
  };

  const submit = async () => {
    if (!id || !g) return;
    if (files.length === 0) {
      setError(t('errNoImages'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createCollageBatch(id, files.slice(0, MAX_IMAGES), '9x16');
      router.replace(`/m/${id}#cadou-video`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('errStart'));
      setSubmitting(false);
    }
  };

  const titleName = fromName.displayRecipient(g?.recipientName);
  const songHref = id ? `/m/${id}` : '/manelele-mele';
  const paid = !!g && (g.type === 'full' || g.paidUnlocked);
  const canMake = !!g && g.isOwner && paid && tracks.length > 0 && g.status === 'succeeded';

  return (
    <div className="cadou-wrap cadou-song-wrap">
      <Link href={songHref} className="cadou-song-back">{t('back')}</Link>
      <article className="cadou-panel cadou-song">
        {error && <p className="cadou-err" role="alert">{error}</p>}
        {!g && !error && <p className="cadou-hint">{t('loading')}</p>}

        {g && (
          <>
            <div className="cadou-kicker">{t('kicker')}</div>
            <h1>{t('titleFor', { name: titleName })}</h1>
            <p className="cadou-song-meta">
              {tracks.length > 1 ? t('metaMany', { count: tracks.length }) : t('metaOne')}
            </p>

            {!canMake && (
              <div className="cadou-song-status">
                <p>{g.isOwner ? t('notReadyOwner') : t('notReadyOther')}</p>
                <Link href={songHref} className="cadou-cta">{t('seeSong')}</Link>
              </div>
            )}

            {canMake && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    acceptFiles(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                  hidden
                />
                <div
                  role="button"
                  tabIndex={0}
                  className={`cadou-drop${dragOver ? ' is-over' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    acceptFiles(Array.from(e.dataTransfer.files ?? []));
                  }}
                >
                  <strong>
                    {files.length > 0
                      ? (files.length === 1
                        ? t('dropSelectedOne')
                        : t('dropSelectedMany', { count: files.length }))
                      : dragOver ? t('dropOver') : t('dropIdle')}
                  </strong>
                  <span>{t('dropHint', { max: MAX_IMAGES, mb: MAX_MB })}</span>
                </div>

                {previews.length > 0 && (
                  <div className="cadou-video-thumbs">
                    {previews.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src + i} src={src} alt={t('thumbAlt', { index: i + 1 })} />
                    ))}
                  </div>
                )}

                <div className="cadou-song-actions">
                  <button
                    type="button"
                    className="cadou-cta"
                    onClick={() => void submit()}
                    disabled={submitting || files.length === 0}
                  >
                    {submitting
                      ? t('submitting')
                      : tracks.length > 1
                        ? t('submitMany', { count: tracks.length })
                        : t('submitOne')}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </article>
    </div>
  );
}
