'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Județele acceptate de SmartBill (denumiri standard, fără diacritice). */
export const RO_COUNTIES = [
  'Alba', 'Arad', 'Arges', 'Bacau', 'Bihor', 'Bistrita-Nasaud', 'Botosani',
  'Brasov', 'Braila', 'Bucuresti', 'Buzau', 'Caras-Severin', 'Calarasi', 'Cluj',
  'Constanta', 'Covasna', 'Dambovita', 'Dolj', 'Galati', 'Giurgiu', 'Gorj',
  'Harghita', 'Hunedoara', 'Ialomita', 'Iasi', 'Ilfov', 'Maramures', 'Mehedinti',
  'Mures', 'Neamt', 'Olt', 'Prahova', 'Satu Mare', 'Salaj', 'Sibiu', 'Suceava',
  'Teleorman', 'Timis', 'Tulcea', 'Vaslui', 'Valcea', 'Vrancea',
];

const NONE = '__none__';

/**
 * Dropdown cu județele SmartBill. Acceptă valoare goală sau una custom (din date
 * vechi care nu sunt în listă) — o adaugă temporar ca să nu se piardă.
 *
 * `showLabel=false` + `className` pentru folosire inline în tabel (fără label).
 */
export function CountySelect({
  value,
  onChange,
  showLabel = true,
  className,
}: {
  value?: string | null;
  onChange: (v: string) => void;
  showLabel?: boolean;
  className?: string;
}) {
  const v = value?.trim() ?? '';
  const options = v && !RO_COUNTIES.includes(v) ? [v, ...RO_COUNTIES] : RO_COUNTIES;
  const select = (
    <Select value={v || NONE} onValueChange={(val) => onChange(val === NONE ? '' : val)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="— alege —" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— fără județ —</SelectItem>
        {options.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  if (!showLabel) return select;
  return (
    <div className="space-y-1">
      <Label className="text-xs">Județ (SmartBill)</Label>
      {select}
    </div>
  );
}
