'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Județele acceptate de SmartBill (denumiri standard, fără diacritice). */
export const RO_COUNTIES = [
  'Alba', 'Arad', 'Arges', 'Bacau', 'Bihor', 'Bistrita-Nasaud', 'Botosani',
  'Brasov', 'Braila', 'Bucuresti', 'Buzau', 'Caras-Severin', 'Calarasi', 'Cluj',
  'Constanta', 'Covasna', 'Dambovita', 'Dolj', 'Galati', 'Giurgiu', 'Gorj',
  'Harghita', 'Hunedoara', 'Ialomita', 'Iasi', 'Ilfov', 'Maramures', 'Mehedinti',
  'Mures', 'Neamt', 'Olt', 'Prahova', 'Satu Mare', 'Salaj', 'Sibiu', 'Suceava',
  'Teleorman', 'Timis', 'Tulcea', 'Vaslui', 'Valcea', 'Vrancea',
];

/**
 * Selector de județ ca POPUP cu grilă pe mai multe coloane — toate cele 42 de
 * județe vizibile simultan, fără scroll.
 *
 * De ce nu un `<Select>` clasic: lista de 42 de opțiuni intra într-un dropdown
 * cu scroll, din care se vedeau ~8 deodată. Emiterea facturilor se face (și) cu
 * un bot care citește ecranul — un dropdown derulabil îi ascunde restul
 * opțiunilor, iar o grilă completă i le arată pe toate dintr-o privire.
 *
 * `city` / `address` / `clientName` sunt context afișat în popup: județul se
 * alege uitându-te la oraș și la adresă, iar popup-ul le acoperă pe cele din
 * formularul de dedesubt.
 *
 * `showLabel=false` + `className` pentru folosire inline în tabel (fără label).
 */
export function CountySelect({
  value,
  onChange,
  showLabel = true,
  className,
  city,
  address,
  clientName,
}: {
  value?: string | null;
  onChange: (v: string) => void;
  showLabel?: boolean;
  className?: string;
  city?: string | null;
  address?: string | null;
  clientName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const v = value?.trim() ?? '';
  // Valoare veche care nu e în listă: o păstrăm vizibilă ca să nu se piardă tăcut.
  const custom = v && !RO_COUNTIES.includes(v) ? v : null;

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm',
        'ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        'hover:border-ring disabled:cursor-not-allowed disabled:opacity-50',
        !v && 'text-muted-foreground',
        className,
      )}
    >
      <span className="truncate">{v || '— alege —'}</span>
      <ChevronDown className="size-4 shrink-0 opacity-50" />
    </button>
  );

  return (
    <>
      {showLabel ? (
        <div className="space-y-1">
          <Label className="text-xs">Județ (SmartBill)</Label>
          {trigger}
        </div>
      ) : (
        trigger
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Alege județul{clientName ? ` — ${clientName}` : ''}</DialogTitle>
            <DialogDescription>
              Denumirile sunt cele acceptate de SmartBill (fără diacritice).
            </DialogDescription>
          </DialogHeader>

          {(address || city) && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-secondary/20 p-3 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Adresă</div>
                <div className="break-words">{address || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Oraș</div>
                <div className="break-words">{city || '—'}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-6 gap-1.5">
            {RO_COUNTIES.map((c) => (
              <CountyButton key={c} label={c} selected={c === v} onClick={() => pick(c)} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
            <CountyButton label="— fără județ —" selected={!v} onClick={() => pick('')} />
            {custom && (
              <CountyButton
                label={`${custom} (necunoscut SmartBill)`}
                selected
                onClick={() => pick(custom)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CountyButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
        selected
          ? 'border-primary bg-primary/15 font-medium text-foreground'
          : 'border-border bg-transparent hover:border-ring hover:bg-secondary/40',
      )}
    >
      <span className="truncate">{label}</span>
      {selected && <Check className="size-3 shrink-0 text-primary" />}
    </button>
  );
}
