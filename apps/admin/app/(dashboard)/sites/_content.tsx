'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, Plus, Trash2, Pencil, Check, X, Star, Music2 } from 'lucide-react';
import {
  SitesApi,
  type SiteDto,
  type SiteStyleEntry,
  type SiteVoiceEntry,
  type SiteOccasionEntry,
} from '@/lib/api/sites.api';
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
  hiddenMode: false,
  maintenanceMessage: {},
  ipWhitelist: [],
  demoEnabled: true,
  styles: [],
  voices: [],
  occasions: [],
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
              <Toggle
                label="Mentenanță (pagină brandită + spinner)"
                value={form.maintenanceMode ?? false}
                onChange={(v) => setForm({ ...form, maintenanceMode: v })}
              />
              <Toggle
                label="Hidden (empty response — pare domeniu fără server)"
                value={form.hiddenMode ?? false}
                onChange={(v) => setForm({ ...form, hiddenMode: v })}
              />
              {form.hiddenMode && (
                <p style={{ fontSize: 12, color: '#a78bfa', margin: '4px 0 0 0' }}>
                  ⚠️ În acest mod, browserul afișează „This site can&apos;t be reached" — folosește când nu vrei
                  ca cineva să știe ce pregătești pe domeniu. Are precedență față de mentenanță.
                </p>
              )}
              <Toggle
                label="Demo gratuit 30s activat (debifează = plata se face înainte de generare)"
                value={form.demoEnabled ?? true}
                onChange={(v) => setForm({ ...form, demoEnabled: v })}
              />
              {form.demoEnabled === false && (
                <p style={{ fontSize: 12, color: '#fbbf24', margin: '4px 0 0 0' }}>
                  ℹ️ În acest mod, userul completează formularul, plătește, și abia apoi se generează maneaua
                  completă (90s × 2). Nu mai există preview gratuit.
                </p>
              )}
            </Section>

            {(form.maintenanceMode || form.hiddenMode) && (
              <Section title="IP whitelist (scutiri de mentenanță / hidden)">
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px 0' }}>
                    Câte un IP pe linie. Suportă exact-match (<code>1.2.3.4</code>) sau prefix wildcard
                    (<code>192.168.*</code>). IP-urile listate vor vedea site-ul normal chiar dacă e
                    în mentenanță sau hidden mode.
                  </p>
                  <Textarea
                    value={(form.ipWhitelist ?? []).join('\n')}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ipWhitelist: e.target.value
                          .split(/\r?\n/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    rows={4}
                    placeholder={'1.2.3.4\n192.168.*\n2001:db8::1'}
                  />
                </div>
              </Section>
            )}

            <CategoriesEditor
              title="Stiluri muzicale (carduri din /studio · step 1)"
              kind="style"
              entries={form.styles ?? []}
              defaultLocale={form.locale ?? 'ro'}
              onChange={(next) => setForm({ ...form, styles: next as SiteStyleEntry[] })}
            />

            <CategoriesEditor
              title="Ocazii (carduri step 2 — zi naștere, nuntă, etc.)"
              kind="occasion"
              entries={form.occasions ?? []}
              defaultLocale={form.locale ?? 'ro'}
              onChange={(next) => setForm({ ...form, occasions: next as SiteOccasionEntry[] })}
            />

            <CategoriesEditor
              title="Voci / artiști (carduri step 3)"
              kind="voice"
              entries={form.voices ?? []}
              defaultLocale={form.locale ?? 'ro'}
              onChange={(next) => setForm({ ...form, voices: next as SiteVoiceEntry[] })}
            />

            {form.maintenanceMode && !form.hiddenMode && (
              <Section title="Mesaj mentenanță per locale (opțional)">
                <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px 0' }}>
                  Format: prima linie = titlu, restul = subtitlu. Dacă lipsește un locale,
                  cade pe locale-ul site-ului ({form.locale ?? 'ro'}), apoi pe text default.
                </p>
                {['ro', 'bg', 'sr', 'tr', 'el', 'hr', 'sl', 'bs', 'en'].map((loc) => (
                  <Field key={loc} label={loc.toUpperCase()}>
                    <Textarea
                      value={(form.maintenanceMessage ?? {})[loc] ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          maintenanceMessage: {
                            ...(form.maintenanceMessage ?? {}),
                            [loc]: e.target.value,
                          },
                        })
                      }
                      rows={2}
                      placeholder={loc === 'ro' ? 'Lucrăm la ceva tare.\nRevenim foarte curând.' : ''}
                    />
                  </Field>
                ))}
              </Section>
            )}

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

// ──────────────────────────────────────────────────────────────────────────
// Editor pentru styles / voices / occasions per site.
// Toate trei au câmpuri comune (id, nm) + câmpuri specifice. Folosim un
// component generic care primește un `kind` și schimbă rândurile afișate.
// ──────────────────────────────────────────────────────────────────────────

type CategoryKind = 'style' | 'voice' | 'occasion';
type AnyEntry = SiteStyleEntry | SiteVoiceEntry | SiteOccasionEntry;

const EXTRA_LOCALES_FOR_I18N = ['ro', 'bg', 'sr', 'tr', 'el', 'hr', 'sl', 'bs', 'sq', 'mk', 'hu', 'en'];

function CategoriesEditor({
  title,
  kind,
  entries,
  defaultLocale,
  onChange,
}: {
  title: string;
  kind: CategoryKind;
  entries: AnyEntry[];
  defaultLocale: string;
  onChange: (next: AnyEntry[]) => void;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  function add() {
    const blank: AnyEntry =
      kind === 'voice'
        ? ({ id: '', nm: '', tg: '', av: '' } as SiteVoiceEntry)
        : kind === 'occasion'
          ? ({ id: '', em: '✨', nm: '' } as SiteOccasionEntry)
          : ({ id: '', em: '🎵', nm: '', ds: '' } as SiteStyleEntry);
    onChange([...entries, blank]);
    setExpandedIdx(entries.length);
  }

  function update(idx: number, patch: Partial<AnyEntry>) {
    const next = entries.map((e, i) => (i === idx ? ({ ...e, ...patch } as AnyEntry) : e));
    onChange(next);
  }

  function remove(idx: number) {
    onChange(entries.filter((_, i) => i !== idx));
    if (expandedIdx === idx) setExpandedIdx(null);
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
    if (expandedIdx === idx) setExpandedIdx(j);
    else if (expandedIdx === j) setExpandedIdx(idx);
  }

  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
        <Button size="sm" variant="ghost" onClick={add}>
          <Plus className="h-3 w-3" />
          Adaugă
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Lista e goală — site-ul va folosi configurația default (din seed-data.ts).
          Apasă „Adaugă" pentru a customiza.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, idx) => {
            const isOpen = expandedIdx === idx;
            return (
              <div key={idx} className="border border-border rounded-md">
                <div className="flex items-center gap-2 p-2">
                  {'em' in entry && (entry as { em?: string }).em ? (
                    <span className="text-lg w-7 text-center">{(entry as { em?: string }).em}</span>
                  ) : null}
                  {kind === 'voice' && (
                    <span className="text-[10px] font-bold w-8 h-7 grid place-items-center rounded bg-secondary/40">
                      {(entry as SiteVoiceEntry).av || '··'}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{entry.nm || <span className="italic text-muted-foreground">fără nume</span>}</div>
                    <code className="text-[10px] text-muted-foreground">{entry.id || 'fără id'}</code>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => move(idx, 1)} disabled={idx === entries.length - 1}>↓</Button>
                  <Button size="sm" variant="ghost" onClick={() => setExpandedIdx(isOpen ? null : idx)}>
                    {isOpen ? 'Închide' : 'Editează'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(idx)} title="Șterge">
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>

                {isOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-border space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Field label="ID (slug, stabil — folosit în URL-uri și mostre)">
                        <Input
                          value={entry.id}
                          onChange={(e) =>
                            update(idx, { id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
                          }
                          placeholder={kind === 'voice' ? 'adi' : 'clasic'}
                        />
                      </Field>
                      <Field label={`Nume (în ${defaultLocale.toUpperCase()})`}>
                        <Input
                          value={entry.nm}
                          onChange={(e) => update(idx, { nm: e.target.value })}
                          placeholder={kind === 'voice' ? 'Adi Șampanie' : 'Clasică de pahar'}
                        />
                      </Field>
                      {kind !== 'voice' && (
                        <Field label="Emoji / icon">
                          <Input
                            value={(entry as SiteStyleEntry).em ?? ''}
                            onChange={(e) => update(idx, { em: e.target.value } as Partial<AnyEntry>)}
                            placeholder="🎻"
                          />
                        </Field>
                      )}
                      {kind === 'voice' && (
                        <>
                          <Field label="Inițiale avatar (2 caractere)">
                            <Input
                              value={(entry as SiteVoiceEntry).av ?? ''}
                              maxLength={2}
                              onChange={(e) =>
                                update(idx, { av: e.target.value.toUpperCase() } as Partial<AnyEntry>)
                              }
                              placeholder="AȘ"
                            />
                          </Field>
                          <Field label="Tagline (apare sub nume)">
                            <Input
                              value={(entry as SiteVoiceEntry).tg ?? ''}
                              onChange={(e) =>
                                update(idx, { tg: e.target.value } as Partial<AnyEntry>)
                              }
                              placeholder="Modern, club"
                            />
                          </Field>
                          <Field label="Voce Suno (override voiceMap)">
                            <Input
                              value={(entry as SiteVoiceEntry).sunoVoice ?? ''}
                              onChange={(e) =>
                                update(idx, { sunoVoice: e.target.value } as Partial<AnyEntry>)
                              }
                              placeholder="lasă gol = id-ul"
                            />
                          </Field>
                        </>
                      )}
                      {kind === 'style' && (
                        <>
                          <Field label="Descriere (sub nume)">
                            <Input
                              value={(entry as SiteStyleEntry).ds ?? ''}
                              onChange={(e) =>
                                update(idx, { ds: e.target.value } as Partial<AnyEntry>)
                              }
                              placeholder="Acordeon, lăutărească"
                            />
                          </Field>
                          <Field label='Badge "heat" (opțional)'>
                            <Input
                              value={(entry as SiteStyleEntry).heat ?? ''}
                              onChange={(e) =>
                                update(idx, { heat: e.target.value } as Partial<AnyEntry>)
                              }
                              placeholder="🔥 #1"
                            />
                          </Field>
                          <div className="sm:col-span-2">
                            <Field label="Prompt Suno (override stylePromptMap pentru acest stil)">
                              <Textarea
                                value={(entry as SiteStyleEntry).sunoPrompt ?? ''}
                                onChange={(e) =>
                                  update(idx, { sunoPrompt: e.target.value } as Partial<AnyEntry>)
                                }
                                rows={2}
                                placeholder="Acordeon, vioară, ritm 7/8, instrumentație lăutărească..."
                              />
                            </Field>
                          </div>
                        </>
                      )}
                    </div>

                    <I18nEditor
                      defaultLocale={defaultLocale}
                      kind={kind}
                      i18n={(entry.i18n ?? {}) as Record<string, Record<string, string>>}
                      onChange={(next) => update(idx, { i18n: next } as Partial<AnyEntry>)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function I18nEditor({
  defaultLocale,
  kind,
  i18n,
  onChange,
}: {
  defaultLocale: string;
  kind: CategoryKind;
  i18n: Record<string, Record<string, string>>;
  onChange: (next: Record<string, Record<string, string>>) => void;
}) {
  const [open, setOpen] = useState(false);
  const fields = kind === 'voice' ? ['nm', 'tg'] : kind === 'occasion' ? ['nm'] : ['nm', 'ds', 'heat'];
  const otherLocales = EXTRA_LOCALES_FOR_I18N.filter((l) => l !== defaultLocale);

  return (
    <div className="border-t border-dashed border-border/60 pt-2">
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '▾' : '▸'} Traduceri per locale (opțional)
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {otherLocales.map((loc) => (
            <details key={loc} className="border border-border/60 rounded p-2">
              <summary className="text-xs cursor-pointer">{loc.toUpperCase()}</summary>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {fields.map((f) => (
                  <Field key={f} label={f}>
                    <Input
                      value={i18n[loc]?.[f] ?? ''}
                      onChange={(e) => {
                        const next = { ...i18n, [loc]: { ...(i18n[loc] ?? {}), [f]: e.target.value } };
                        onChange(next);
                      }}
                    />
                  </Field>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
