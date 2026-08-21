'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

const MAX = 1000;

export function CadouRemakeCard({
  generationId,
  usedAt,
  busy: parentBusy,
  onStarted,
}: {
  generationId: string;
  usedAt?: string | null;
  busy?: boolean;
  onStarted: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const used = !!usedAt;
  const len = notes.trim().length;

  const submit = async () => {
    if (used || busy) return;
    if (len < 8) {
      setErr('Spune-ne mai concret ce vrei schimbat.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.requestRemake(generationId, notes.trim());
      setNotes('');
      onStarted();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Nu am putut porni refacerea.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cadou-song-card cadou-remake">
      <h2>Refă maneaua</h2>
      {used || parentBusy ? (
        <p className="cadou-remake-lead">
          {parentBusy
            ? 'Refacem o variantă nouă după ce ne-ai spus. Piesele actuale rămân. Durează câteva minute.'
            : 'Ai folosit refacerea gratuită. Varianta nouă apare mai sus, lângă celelalte. Alte modificări — din chat.'}
        </p>
      ) : (
        <>
          <p className="cadou-remake-lead">
            Nu-ți convine ceva? Scrie ce vrei schimbat. Refacem o dată gratuit și
            îți adăugăm o variantă nouă — piesele actuale rămân.
          </p>
          <label className="cadou-remake-lab" htmlFor="cadou-remake-notes">
            Ce nu-ți convine
          </label>
          <textarea
            id="cadou-remake-notes"
            className={`cadou-area${err ? ' err' : ''}`}
            maxLength={MAX}
            rows={5}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value.slice(0, MAX));
              if (err) setErr(null);
            }}
            placeholder="ex. vreau voce de femeie, scoate «la mulți ani», mai tristă…"
          />
          <div className="cadou-remake-meta">
            <span>{len}/1000</span>
          </div>
          {err && <p className="cadou-err" role="alert">{err}</p>}
          <button
            type="button"
            className="cadou-cta"
            onClick={() => void submit()}
            disabled={busy || len < 8}
          >
            {busy ? 'Pornim refacerea…' : 'Refă maneaua'}
          </button>
        </>
      )}
    </section>
  );
}
