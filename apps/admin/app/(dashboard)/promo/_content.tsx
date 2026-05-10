'use client';

import { useState } from 'react';
import { useAsync } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Plus, Tag } from 'lucide-react';
import { PromoApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { SiteBadge } from '@/components/site-badge';
import { useSitesMap } from '@/lib/hooks/use-sites-map';

export default function AdminPromoPage() {
  const { toast } = useToast();
  const { isAllSelected } = useSitesMap();
  const { data: codes, loading: isLoading, refetch } = useAsync(
    () => PromoApi.list(),
    [],
    { refetchInterval: 10_000 },
  );

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('10');
  const [validUntil, setValidUntil] = useState<Date | undefined>(undefined);
  const [maxUses, setMaxUses] = useState('0');
  const [restrictedEmail, setRestrictedEmail] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      await PromoApi.create({
        code: code || undefined,
        discountType,
        discountValue: parseInt(discountValue) || 0,
        validUntil: validUntil ? validUntil.toISOString() : undefined,
        maxUses: parseInt(maxUses) || 0,
        restrictedToEmail: restrictedEmail || undefined,
        note: note || undefined,
      });
      setCode('');
      setDiscountValue('10');
      setValidUntil(undefined);
      setMaxUses('0');
      setRestrictedEmail('');
      setNote('');
      refetch();
      toast({ variant: 'success', title: 'Cod creat' });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setCreating(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    await PromoApi.setActive(id, active);
    refetch();
  }

  return (
    <div>
      <PageHeader
        title="Coduri promoționale"
        description="Coduri generale sau per email · procent (%) sau sumă fixă (cents RON)"
      />

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <CardTitle>Cod nou</CardTitle>
          </div>
          <CardDescription>Lasă „Cod" gol pentru a genera automat.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Cod (gol = auto)">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ex. FRATE10"
              />
            </Field>
            <Field label="Tip discount">
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as 'percent' | 'fixed')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Procent (%)</SelectItem>
                  <SelectItem value="fixed">Sumă fixă (cents RON)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={discountType === 'percent' ? 'Valoare (%)' : 'Valoare (cents RON)'}>
              <Input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </Field>
            <Field label="Valabil până la">
              <DateTimePicker
                value={validUntil}
                onChange={setValidUntil}
                placeholder="Fără expirare"
                fromYear={new Date().getFullYear()}
                toYear={new Date().getFullYear() + 5}
              />
            </Field>
            <Field label="Max utilizări (0 = ∞)">
              <Input
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
              />
            </Field>
            <Field label="Restrict la email">
              <Input
                type="email"
                value={restrictedEmail}
                onChange={(e) => setRestrictedEmail(e.target.value)}
                placeholder="opțional"
              />
            </Field>
            <Field label="Notă internă" className="md:col-span-2 lg:col-span-3">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="opțional — ex. campanie newsletter Q2"
              />
            </Field>
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={create} loading={creating}>
              <Plus />
              Creează cod
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (codes ?? []).length === 0 ? (
        <Empty
          icon={<Tag className="h-5 w-5" />}
          title="Niciun cod promoțional încă"
          description="Creează primul cod folosind formularul de mai sus."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cod</TableHead>
              {isAllSelected && <TableHead>Site</TableHead>}
              <TableHead>Discount</TableHead>
              <TableHead>Folosit</TableHead>
              <TableHead>Restrict email</TableHead>
              <TableHead>Valabil până</TableHead>
              <TableHead>Notă</TableHead>
              <TableHead>Activ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(codes ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <code className="font-mono font-semibold text-primary">{c.code}</code>
                </TableCell>
                {isAllSelected && (
                  <TableCell>
                    <SiteBadge siteId={c.siteId} />
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant={c.discountType === 'percent' ? 'default' : 'info'}>
                    {c.discountType === 'percent'
                      ? `${c.discountValue}%`
                      : `${(c.discountValue / 100).toFixed(2)} lei`}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {c.usedCount}
                  {c.maxUses > 0 ? ` / ${c.maxUses}` : ''}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.restrictedToEmail ?? '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.validUntil
                    ? format(new Date(c.validUntil), 'd MMM yyyy', { locale: ro })
                    : '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                  {c.note ?? '—'}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={c.active}
                    onCheckedChange={(v) => toggle(c.id, v)}
                    aria-label={`Activează ${c.code}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
