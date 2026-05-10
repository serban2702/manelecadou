'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, Plus, Trash2, Pencil, Check, X, Star, Music2 } from 'lucide-react';
import { SitesApi, type SiteDto } from '@/lib/api/sites.api';
import { useAsync } from '@/lib/hooks/use-async';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

const LOCALES = ['ro', 'bg', 'rs', 'tr', 'el', 'hr', 'sl', 'bs', 'sq', 'mk', 'hu', 'en'];
const CURRENCIES = ['RON', 'EUR', 'USD', 'BGN', 'RSD', 'TRY', 'HUF', 'GBP'];

const EMPTY_FORM: Partial<SiteDto> = {
  slug: '',
  domain: '',
  name: '',
  locale: 'ro',
  currency: 'RON',
  basePriceCents: 4900,
  giftPriceCents: 4900,
  brand: { primaryColor: '#d4af37', tagline: '' },
  seo: {},
  analytics: {},
  stripe: { productName: '', statementDescriptor: '' },
  suno: {},
  fromEmail: '',
  supportEmail: '',
  adminEmails: [],
  active: true,
  isDefault: false,
  sslEnabled: true,
  maintenanceMode: false,
  notes: '',
};

export default function SitesPage() {
  const { data: sites, loading, refetch } = useAsync(() => SitesApi.list(), []);
  const { toast } = useToast();
  const [editing, setEditing] = useState<SiteDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<SiteDto>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setEditing(null);
    setCreating(true);
  }

  function openEdit(s: SiteDto) {
    setForm({ ...s });
    setEditing(s);
    setCreating(false);
  }

  function close() {
    setEditing(null);
    setCreating(false);
    setForm(EMPTY_FORM);
  }

  async function save() {
    if (!form.slug || !form.domain || !form.name) {
      toast({ variant: 'destructive', title: 'Câmpuri lipsă', description: 'slug, domain și name sunt obligatorii' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await SitesApi.update(editing.id, form);
        toast({ variant: 'success', title: 'Site actualizat' });
      } else {
        await SitesApi.create(form);
        toast({ variant: 'success', title: 'Site creat', description: `Acum pointează A record DNS pentru ${form.domain} → IP-ul VPS-ului. SSL se emite automat la primul request.` });
      }
      close();
      refetch();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare salvare', description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: SiteDto) {
    const ok = await confirmDialog({
      title: `Șterge "${s.name}"?`,
      description: `Atenție: vei șterge configul pentru ${s.domain}. Datele asociate (users, generations) NU se șterg, dar nu vor mai fi vizibile sub niciun site activ. Caddy nu va mai accepta cereri pentru ${s.domain}.`,
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
        description="Gestionează toate domeniile rulate sub această platformă. Caddy emite SSL automat pentru orice domeniu activ aici."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Adaugă site
          </Button>
        }
      />

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
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
          <Card key={s.id} className={s.active ? '' : 'opacity-60'}>
            <CardContent className="p-4 flex items-center gap-4">
              <div
                className="h-12 w-12 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: s.brand.primaryColor || '#d4af37' }}
                title={s.brand.tagline}
              >
                {s.slug.slice(0, 3).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{s.name}</span>
                  {s.isDefault && <span title="Default fallback"><Star className="h-3.5 w-3.5 text-amber-400" /></span>}
                  {s.maintenanceMode && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      Mentenanță
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  <code>{s.domain}</code> · {s.locale.toUpperCase()} · {s.currency} {(s.basePriceCents / 100).toFixed(2)} ·{' '}
                  {s.active ? 'activ' : 'inactiv'} · SSL {s.sslEnabled ? 'on' : 'off'}
                </div>
              </div>
              <Link href={`/sites/${s.id}/samples`}>
                <Button variant="ghost" size="sm" title="Mostre audio">
                  <Music2 className="h-4 w-4" />
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => openEdit(s)} title="Editează">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => remove(s)} title="Șterge">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editează ${editing.name}` : 'Adaugă site nou'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <Section title="Identitate">
              <Field label="Slug (intern, ex. „bg”)">
                <Input
                  value={form.slug ?? ''}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  placeholder="bg"
                  disabled={!!editing}
                />
              </Field>
              <Field label="Domeniu (fără https://, fără www)">
                <Input
                  value={form.domain ?? ''}
                  onChange={(e) => setForm({ ...form, domain: e.target.value.toLowerCase().trim() })}
                  placeholder="manele.bg"
                />
              </Field>
              <Field label="Nume brand (afișat în UI)">
                <Input
                  value={form.name ?? ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Manele BG"
                />
              </Field>
            </Section>

            <Section title="Limbă & valută">
              <Field label="Limbă (locale)">
                <select
                  value={form.locale ?? 'ro'}
                  onChange={(e) => setForm({ ...form, locale: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  {LOCALES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                </select>
              </Field>
              <Field label="Valută">
                <select
                  value={form.currency ?? 'RON'}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Preț bază (cents)">
                <Input
                  type="number"
                  value={form.basePriceCents ?? 0}
                  onChange={(e) => setForm({ ...form, basePriceCents: Number(e.target.value) })}
                />
              </Field>
              <Field label="Preț cod cadou single (cents)">
                <Input
                  type="number"
                  value={form.giftPriceCents ?? 0}
                  onChange={(e) => setForm({ ...form, giftPriceCents: Number(e.target.value) })}
                />
              </Field>
            </Section>

            <Section title="Brand">
              <Field label="Culoare primară">
                <Input
                  type="color"
                  value={form.brand?.primaryColor ?? '#d4af37'}
                  onChange={(e) => setForm({ ...form, brand: { ...form.brand, primaryColor: e.target.value } })}
                />
              </Field>
              <Field label="Tagline">
                <Input
                  value={form.brand?.tagline ?? ''}
                  onChange={(e) => setForm({ ...form, brand: { ...form.brand, tagline: e.target.value } })}
                  placeholder="Maneaua ta cadou"
                />
              </Field>
              <Field label="Logo URL">
                <Input
                  value={form.brand?.logoUrl ?? ''}
                  onChange={(e) => setForm({ ...form, brand: { ...form.brand, logoUrl: e.target.value } })}
                  placeholder="https://..."
                />
              </Field>
              <Field label="OG image URL (1200×630)">
                <Input
                  value={form.brand?.ogImageUrl ?? ''}
                  onChange={(e) => setForm({ ...form, brand: { ...form.brand, ogImageUrl: e.target.value } })}
                />
              </Field>
            </Section>

            <Section title="SEO">
              <Field label="Title">
                <Input
                  value={form.seo?.title ?? ''}
                  onChange={(e) => setForm({ ...form, seo: { ...form.seo, title: e.target.value } })}
                />
              </Field>
              <Field label="Description">
                <Textarea
                  value={form.seo?.description ?? ''}
                  onChange={(e) => setForm({ ...form, seo: { ...form.seo, description: e.target.value } })}
                  rows={2}
                />
              </Field>
            </Section>

            <Section title="Suno (generare audio)">
              <Field label="Prompt de bază (override)">
                <Textarea
                  value={form.suno?.basePrompt ?? ''}
                  onChange={(e) => setForm({ ...form, suno: { ...form.suno, basePrompt: e.target.value } })}
                  rows={3}
                  placeholder="Manele moderne, balcanice, cu accente de tallava..."
                />
              </Field>
              <Field label="Limbă lyrics (default = locale-ul site-ului)">
                <select
                  value={form.suno?.lyricsLocale ?? form.locale ?? 'ro'}
                  onChange={(e) => setForm({ ...form, suno: { ...form.suno, lyricsLocale: e.target.value } })}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                >
                  {LOCALES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                </select>
              </Field>
            </Section>

            <Section title="Stripe (un singur cont, metadata per site)">
              <Field label="Nume produs (apare pe factură)">
                <Input
                  value={form.stripe?.productName ?? ''}
                  onChange={(e) => setForm({ ...form, stripe: { ...form.stripe, productName: e.target.value } })}
                  placeholder="Manea personalizată"
                />
              </Field>
              <Field label="Statement descriptor (max 22 chars, apare pe extras)">
                <Input
                  value={form.stripe?.statementDescriptor ?? ''}
                  onChange={(e) => setForm({ ...form, stripe: { ...form.stripe, statementDescriptor: e.target.value.slice(0, 22) } })}
                  placeholder="MANELE-BG"
                  maxLength={22}
                />
              </Field>
            </Section>

            <Section title="Analytics">
              <Field label="GA4 Measurement ID">
                <Input
                  value={form.analytics?.ga4Id ?? ''}
                  onChange={(e) => setForm({ ...form, analytics: { ...form.analytics, ga4Id: e.target.value } })}
                  placeholder="G-XXXXXXX"
                />
              </Field>
              <Field label="Meta Pixel ID">
                <Input
                  value={form.analytics?.metaPixelId ?? ''}
                  onChange={(e) => setForm({ ...form, analytics: { ...form.analytics, metaPixelId: e.target.value } })}
                />
              </Field>
              <Field label="TikTok Pixel ID">
                <Input
                  value={form.analytics?.tiktokPixelId ?? ''}
                  onChange={(e) => setForm({ ...form, analytics: { ...form.analytics, tiktokPixelId: e.target.value } })}
                />
              </Field>
            </Section>

            <Section title="Email">
              <Field label="From email (de pe care se trimit notificări)">
                <Input
                  value={form.fromEmail ?? ''}
                  onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                  placeholder="contact@manele.bg"
                />
              </Field>
              <Field label="Email-uri admin (separate prin virgulă)">
                <Input
                  value={(form.adminEmails ?? []).join(', ')}
                  onChange={(e) => setForm({ ...form, adminEmails: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              </Field>
            </Section>

            <Section title="Status">
              <Toggle label="Activ" value={form.active ?? true} onChange={(v) => setForm({ ...form, active: v })} />
              <Toggle label="Default fallback" value={form.isDefault ?? false} onChange={(v) => setForm({ ...form, isDefault: v })} />
              <Toggle label="SSL enabled (Caddy emite cert)" value={form.sslEnabled ?? true} onChange={(v) => setForm({ ...form, sslEnabled: v })} />
              <Toggle label="Mentenanță (web returnează 503)" value={form.maintenanceMode ?? false} onChange={(v) => setForm({ ...form, maintenanceMode: v })} />
            </Section>

            <Section title="Note interne">
              <Textarea
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Note vizibile doar în admin"
              />
            </Section>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={saving}>
              <X className="h-4 w-4" />
              Anulează
            </Button>
            <Button onClick={save} disabled={saving}>
              <Check className="h-4 w-4" />
              {saving ? 'Se salvează...' : (editing ? 'Salvează' : 'Creează site')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
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

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border cursor-pointer hover:bg-secondary/30 col-span-1">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}
