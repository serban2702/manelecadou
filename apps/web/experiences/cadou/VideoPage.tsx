'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError, resolveMediaUrl, type GenerationDto } from '@/lib/api';
import { CadouShell } from './Shell';
import { cadouStyleArt } from './style-art';
import { displayRecipient } from './from-name';
import { cadouClipTracks } from './video-tracks';

const MAX_IMAGES = 15;
const MAX_BYTES = 10 * 1024 * 1024;

export default function CadouVideoPage() {
  return (
    <CadouShell>
      <Suspense fallback={<div className="cadou-wrap cadou-song-wrap"><div className="cadou-panel cadou-song"><p className="cadou-hint">Încărcăm…</p></div></div>}>
        <CadouVideoInner />
      </Suspense>
    </CadouShell>
  );
}

function CadouVideoInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [g, setG] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [pickedSocial, setPickedSocial] = useState<string[]>([]);
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
          ? 'Doar cine a comandat maneaua poate face videoclipul.'
          : 'Nu am putut încărca maneaua.',
      );
    }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => () => { previews.forEach((u) => URL.revokeObjectURL(u)); }, [previews]);

  const tracks = g ? cadouClipTracks(g) : [];
  const social = useMemo(() => {
    if (!g) return [];
    const set = new Set<string>();
    for (const u of g.socialImages ?? []) if (u) set.add(u);
    if (g.socialImageUploaded) set.add(g.socialImageUploaded);
    if (g.socialImageSelected) set.add(g.socialImageSelected);
    return [...set];
  }, [g]);

  const acceptFiles = (all: File[]) => {
    const picked = all.filter((f) => f.type.startsWith('image/'));
    if (picked.length === 0) {
      if (all.length > 0) setError('Alege doar imagini (JPG, PNG, WEBP).');
      return;
    }
    if (picked.length > MAX_IMAGES) {
      setError(`Maxim ${MAX_IMAGES} imagini.`);
      return;
    }
    const tooBig = picked.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      setError(`„${tooBig.name}” depășește 10MB.`);
      return;
    }
    previews.forEach((u) => URL.revokeObjectURL(u));
    setError(null);
    setFiles(picked);
    setPreviews(picked.map((f) => URL.createObjectURL(f)));
  };

  const toggleSocial = (url: string) => {
    setPickedSocial((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
  };

  const submit = async () => {
    if (!id || !g) return;
    if (files.length === 0 && pickedSocial.length === 0) {
      setError('Adaugă cel puțin o imagine.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const extra = await Promise.all(
        pickedSocial.map(async (url, i) => {
          const abs = resolveMediaUrl(url) ?? url;
          const res = await fetch(abs);
          const blob = await res.blob();
          const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
          return new File([blob], `social-${i + 1}.${ext}`, { type: blob.type || 'image/jpeg' });
        }),
      );
      const all = [...files, ...extra].slice(0, MAX_IMAGES);
      await api.createCollageBatch(id, all, '9x16');
      router.replace(`/m/${id}#cadou-video`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Nu am putut porni videoclipurile. Încearcă din nou.');
      setSubmitting(false);
    }
  };

  const titleName = displayRecipient(g?.recipientName);
  const cover = g
    ? (resolveMediaUrl(g.coverUrl) ?? cadouStyleArt(g.style))
    : cadouStyleArt('iubire');
  const songHref = id ? `/m/${id}` : '/manelele-mele';
  const paid = !!g && (g.type === 'full' || g.paidUnlocked);
  const canMake = !!g && g.isOwner && paid && tracks.length > 0 && g.status === 'succeeded';

  return (
    <div className="cadou-wrap cadou-song-wrap">
      <article className="cadou-panel cadou-song">
        <Link href={songHref} className="cadou-song-back">← Înapoi la manea</Link>
        {error && <p className="cadou-err" role="alert">{error}</p>}
        {!g && !error && <p className="cadou-hint">Încărcăm…</p>}

        {g && (
          <>
            <div className="cadou-kicker">Videoclip</div>
            <h1>Pozele pentru {titleName}</h1>
            <p className="cadou-song-meta">
              {tracks.length > 1
                ? `Se montează ${tracks.length} videoclipuri — câte unul pe fiecare variantă.`
                : 'Se montează un videoclip vertical pe manea.'}
            </p>

            {!canMake && (
              <div className="cadou-song-status">
                <p>
                  {g.isOwner
                    ? 'Videoclipul e disponibil după ce maneaua e gata.'
                    : 'Doar cine a comandat maneaua poate face videoclipul.'}
                </p>
                <Link href={songHref} className="cadou-cta">Vezi maneaua</Link>
              </div>
            )}

            {canMake && (
              <>
                <div className="cadou-video-head">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover} alt="" />
                  <div>
                    <div className="ttl">Format TikTok 9:16</div>
                    <div className="who">
                      {tracks.map((t) => t.label).join(' · ')}
                    </div>
                  </div>
                </div>

                {social.length > 0 && (
                  <div className="cadou-video-social">
                    <div className="cadou-song-track-lab">Sau alege din pozele generate</div>
                    <div className="cadou-video-thumbs">
                      {social.map((url) => {
                        const on = pickedSocial.includes(url);
                        return (
                          <button
                            key={url}
                            type="button"
                            className={on ? 'is-on' : undefined}
                            onClick={() => toggleSocial(url)}
                            aria-pressed={on}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={resolveMediaUrl(url) ?? url} alt="" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                      ? `${files.length === 1 ? '1 poză selectată' : `${files.length} poze selectate`} — apasă să schimbi`
                      : dragOver ? 'Lasă pozele aici' : 'Încarcă pozele'}
                  </strong>
                  <span>max 15 · până la 10MB · JPG / PNG / WEBP</span>
                </div>

                {previews.length > 0 && (
                  <div className="cadou-video-thumbs">
                    {previews.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src + i} src={src} alt={`Poză ${i + 1}`} />
                    ))}
                  </div>
                )}

                <div className="cadou-song-actions">
                  <button
                    type="button"
                    className="cadou-cta"
                    onClick={() => void submit()}
                    disabled={submitting || (files.length === 0 && pickedSocial.length === 0)}
                  >
                    {submitting
                      ? 'Trimitem…'
                      : tracks.length > 1
                        ? `Creează ${tracks.length} videoclipuri`
                        : 'Creează videoclipul'}
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
