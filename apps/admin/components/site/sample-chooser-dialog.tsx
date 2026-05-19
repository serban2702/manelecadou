'use client';

/**
 * Dialog secvențial pentru alegerea unui track Suno dintre cele 2 candidate
 * întoarse după fiecare generare de mostră.
 *
 * Utilizare: parintele ține o coadă `PendingChoice[]`; randează componenta cu
 * `current = queue[0]`. Userul ascultă cele 2 variante și apasă „Alege" pe una
 * → callback-ul commit-uiește pe server și parintele scoate din coadă (next
 * dialog se deschide automat).
 *
 * Designat să fie robust:
 *  - Disabled pe toate butoanele cât timp commit-ul e în zbor (evită dublu-tap).
 *  - „Renunță" doar închide dialogul fără să salveze (track-urile rămân
 *    accesibile pe Suno câteva ore — userul poate regenera dacă vrea).
 *  - Audio elements separate per candidate; pauză automat când userul alege.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Music2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SampleCandidateDto } from '@/lib/api/sites.api';

export interface PendingChoice {
  /** ID unic în coada locală — folosit pentru re-mount audio elements când se schimbă current. */
  queueId: string;
  kind: 'style' | 'voice';
  key: string;
  /** Eticheta umană a stilului / vocii — pentru titlul dialogului. */
  label: string;
  candidates: SampleCandidateDto[];
  sunoTaskId: string;
}

interface Props {
  current: PendingChoice | null;
  remaining: number;
  onChoose: (choice: PendingChoice, candidate: SampleCandidateDto) => Promise<void>;
  onSkip: (choice: PendingChoice) => void;
}

export function SampleChooserDialog({ current, remaining, onChoose, onSkip }: Props) {
  const [busy, setBusy] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const audioRefs = useRef<Array<HTMLAudioElement | null>>([]);

  // Reset la fiecare schimbare de current → audio elements proaspete, fără stat lipit.
  useEffect(() => {
    setBusy(false);
    setSelectedIdx(null);
    audioRefs.current = [];
  }, [current?.queueId]);

  const pauseAll = useCallback(() => {
    for (const el of audioRefs.current) {
      try {
        el?.pause();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleChoose = useCallback(
    async (idx: number) => {
      if (!current || busy) return;
      const candidate = current.candidates[idx];
      if (!candidate) return;
      setSelectedIdx(idx);
      setBusy(true);
      pauseAll();
      try {
        await onChoose(current, candidate);
      } catch {
        // Părintele afișează toast-ul; resetăm starea ca să poată reîncerca.
        setBusy(false);
        setSelectedIdx(null);
      }
      // Pe succes, părintele scoate din coadă → useEffect-ul de mai sus resetează.
    },
    [busy, current, onChoose, pauseAll],
  );

  const handleSkip = useCallback(() => {
    if (!current || busy) return;
    pauseAll();
    onSkip(current);
  }, [busy, current, onSkip, pauseAll]);

  const open = !!current;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleSkip();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music2 className="h-5 w-5 text-primary" />
            Alege varianta pentru „{current?.label ?? ''}"
          </DialogTitle>
          <DialogDescription>
            Suno a generat 2 piese. Ascultă fiecare variantă și apasă <strong>„Alege"</strong>{' '}
            pe cea care îți place — aceea se salvează ca mostră.
            {remaining > 0 && (
              <span className="ml-1 text-amber-500">
                · încă {remaining} {remaining === 1 ? 'mostră' : 'mostre'} în coadă după aceasta
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(current?.candidates ?? []).map((cand, idx) => {
            const isSelected = selectedIdx === idx;
            return (
              <div
                key={`${current?.queueId}-${idx}`}
                className={`rounded-md border p-3 space-y-2 transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-secondary/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {cand.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cand.coverUrl}
                        alt=""
                        className="w-10 h-10 rounded object-cover border border-border/50"
                      />
                    ) : null}
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Varianta {idx + 1}
                      {typeof cand.durationSec === 'number' && (
                        <span className="ml-2 text-[10px] normal-case tracking-normal text-muted-foreground/70">
                          ~{cand.durationSec}s
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isSelected ? 'default' : 'outline'}
                    disabled={busy}
                    onClick={() => handleChoose(idx)}
                  >
                    {busy && isSelected ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Se salvează…
                      </>
                    ) : (
                      'Alege această variantă'
                    )}
                  </Button>
                </div>
                <audio
                  ref={(el) => {
                    audioRefs.current[idx] = el;
                  }}
                  controls
                  preload="metadata"
                  src={cand.audioUrl}
                  className="w-full h-10"
                />
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleSkip} disabled={busy}>
            <X className="h-4 w-4" />
            Renunță (nu salva nimic)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
