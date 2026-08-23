'use client';

import { useState } from 'react';
import { Check, Globe, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { SitesApi, type SiteDto, setSelectedSiteId } from '@/lib/api/sites.api';
import { useAsync } from '@/lib/hooks/use-async';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MoneyInput } from '../site/fields/money-input';

const LOCALES = ['ro', 'bg', 'sr', 'tr', 'el', 'hr', 'sl', 'bs', 'sq', 'mk', 'hu', 'en'];
const CURRENCIES = ['RON', 'EUR', 'USD', 'BGN', 'RSD', 'TRY', 'HUF', 'GBP'];

const EMPTY_CREATE = {
  slug: '',
  domain: '',
  name: '',
  locale: 'ro',
  currency: 'RON',
  basePriceCents: 4900,
  giftPriceCents: 4900,
  active: true,
  sslEnabled: true,
  isDefault: false,
};

/**
 * Listă site-uri (cross-tenant). Editarea/configurarea se face în pagina
 * dedicată per-site `/site` (selectorul din sidebar comută contextul).
 *
 * Aici doar: listare, creare, ștergere, marcare default. Detaliile (stiluri,
 * voci, ocazii, mostre audio, branding, Suno/Stripe, status, IP whitelist)
 * sunt în `/site` care citește site-ul din selectorul global.
 */
export default function SitesListPage() {
  const { data: sites, loading, refetch } = useAsync(() => SitesApi.list(), []);
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_CREATE });
  const [saving, setSaving] = useState(false);

  function openSite(s: SiteDto) {
    // Setează selectorul global pe site-ul ales, apoi navighează la pagina de
    // config. `mc:site-changed` declanșează reload-ul global (vezi site-selector.tsx).
    setSelectedSiteId(s.id);
    // setSelectedSiteId face deja window.dispatchEvent + putem naviga direct.
    // Folosim navigate hard ca să forțăm un fresh fetch — same UX ca selectorul.
    window.location.href = '/site';
  }

  async function create() {
    if (!form.slug || !form.domain || !form.name) {
      toast({
        variant: 'destructive',
        title: 'Câmpuri lipsă',
        description: 'Cod intern, domeniu și nume sunt obligatorii',
      });
      return;
    }
    setSaving(true);
    try {
      const created = await SitesApi.create(form);
      toast({
        variant: 'success',
        title: 'Site creat',
        description: `Configurează stilurile/vocile/ocaziile în pagina dedicată.`,
      });
      setCreating(false);
      setForm({ ...EMPTY_CREATE });
      refetch();
      // Sări direct la configul site-ului nou creat
      setSelectedSiteId(created.id);
      window.location.href = '/site';
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: SiteDto) {
    const ok = await confirmDialog({
      title: `Șterge "${s.name}"?`,
      description: `Vei șterge configul pentru ${s.domain}. Datele asociate (users, generations) NU se șterg, dar nu vor mai fi vizibile.`,
      confirmText: 'Șterge',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await SitesApi.remove(s.id);
      toast({ variant: 'success', title: 'Șters' });
      refetch();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
    }
  }

  return (
    <>
      <PageHeader
        title="Site-uri"
        description="Toate domeniile rulate sub platformă. Click pe un site pentru configurare detaliată (stiluri, voci, branding, mostre, etc.)."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Adaugă site
          </Button>
        }
      />

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!loading && (sites ?? []).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <div className="font-medium">Niciun site configurat</div>
            <div className="text-sm">Apasă „Adaugă site" pentru a crea primul.</div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {(sites ?? []).map((s) => (
          <Card key={s.id} className={`${s.active ? '' : 'opacity-60'} cursor-pointer hover:border-primary/40 transition-colors`}>
            <CardContent className="p-4 flex items-center gap-4" onClick={() => openSite(s)}>
              <div
                className="h-12 w-12 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: s.brand?.primaryColor || '#d4af37' }}
                title={s.brand?.tagline}
              >
                {s.slug.slice(0, 3).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold truncate">{s.name}</span>
                  {s.isDefault && (
                    <span title="Default fallback">
                      <Star className="h-3.5 w-3.5 text-amber-400" />
                    </span>
                  )}
                  {s.maintenanceMode && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      Mentenanță
                    </span>
                  )}
                  {s.hiddenMode && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                      Ascuns
                    </span>
                  )}
                  {s.demoEnabled === false && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                      Plată întâi
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  <code>{s.domain}</code> · {s.locale.toUpperCase()} · {s.currency}{' '}
                  {(s.basePriceCents / 100).toFixed(2)} · {s.active ? 'activ' : 'inactiv'} · HTTPS{' '}
                  {s.sslEnabled ? 'pornit' : 'oprit'} · {(s.styles ?? []).length} stiluri ·{' '}
                  {(s.voices ?? []).length} voci · {(s.occasions ?? []).length} ocazii
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  openSite(s);
                }}
                title="Deschide configurare"
              >
                <Pencil className="h-4 w-4" />
                Configurează
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(s);
                }}
                title="Șterge"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adaugă site nou</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <Field label='Cod intern (ex. "bg")'>
              <Input
                value={form.slug}
                onChange={(e) =>
                  setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
                }
                placeholder="bg"
              />
            </Field>
            <Field label="Domeniu (fără https://)">
              <Input
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value.toLowerCase().trim() })}
                placeholder="manele.bg"
              />
            </Field>
            <Field label="Nume brand">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Manele BG"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Limbă">
                <select
                  value={form.locale}
                  onChange={(e) => setForm({ ...form, locale: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  {LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {l.toUpperCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Valută">
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Preț bază">
                <MoneyInput
                  cents={form.basePriceCents}
                  currency={form.currency}
                  onChange={(cents) => setForm({ ...form, basePriceCents: cents ?? 0 })}
                />
              </Field>
              <Field label="Preț cadou">
                <MoneyInput
                  cents={form.giftPriceCents}
                  currency={form.currency}
                  onChange={(cents) => setForm({ ...form, giftPriceCents: cents ?? 0 })}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              După creare, vei fi redirectat la pagina de configurare detaliată unde poți seta stiluri, voci, ocazii, branding, mostre audio etc.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={saving}>
              <X className="h-4 w-4" />
              Anulează
            </Button>
            <Button onClick={create} disabled={saving}>
              <Check className="h-4 w-4" />
              {saving ? 'Se creează...' : 'Creează și configurează'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
