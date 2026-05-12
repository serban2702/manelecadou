'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  Mic2,
  Music2,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  SitesApi,
  type SamplesListDto,
  type SampleStatusDto,
  type SiteDto,
  type SiteOccasionEntry,
  type SiteStyleEntry,
  type SiteVoiceEntry,
  ALL_SITES,
  getSelectedSiteId,
  setSelectedSiteId,
} from '@/lib/api/sites.api';
import { SEED_OCCASIONS, SEED_STYLES, SEED_VOICES } from '@/lib/seed-categories';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useSpaNavigate } from '@/lib/spa-router';

const LOCALES = ['ro', 'bg', 'sr', 'tr', 'el', 'hr', 'sl', 'bs', 'sq', 'mk', 'hu', 'en'];
const CURRENCIES = ['RON', 'EUR', 'USD', 'BGN', 'RSD', 'TRY', 'HUF', 'GBP'];
const I18N_FIELD_LOCALES = ['ro', 'bg', 'sr', 'tr', 'el', 'hr', 'sl', 'bs', 'sq', 'mk', 'hu', 'en'];

type TabId = 'general' | 'brand' | 'categories' | 'suno-stripe' | 'status';

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'general', label: 'General', icon: Globe },
  { id: 'brand', label: 'Brand & SEO', icon: Sparkles },
  { id: 'categories', label: 'Categorii & Mostre', icon: Music2 },
  { id: 'suno-stripe', label: 'Suno & Stripe', icon: Wand2 },
  { id: 'status', label: 'Status & Whitelist', icon: AlertTriangle },
];

export default function SiteConfigPage() {
  const { toast } = useToast();
  const navigate = useSpaNavigate();
  const [siteId, setSiteId] = useState<string>('');
  const [site, setSite] = useState<SiteDto | null>(null);
  const [form, setForm] = useState<SiteDto | null>(null);
  const [samples, setSamples] = useState<SamplesListDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('general');

  useEffect(() => {
    setSiteId(getSelectedSiteId());
    const onChange = () => {
      setSiteId(getSelectedSiteId());
    };
    window.addEventListener('mc:site-changed', onChange);
    return () => window.removeEventListener('mc:site-changed', onChange);
  }, []);

  const refresh = useCallback(async () => {
    if (!siteId || siteId === ALL_SITES) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [s, sm] = await Promise.all([
        SitesApi.get(siteId),
        SitesApi.listSamples(siteId).catch(() => null),
      ]);
      setSite(s);
      setForm(s);
      setSamples(sm);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [siteId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling soft cât timp ceva e în curs de generare.
  useEffect(() => {
    if (!samples) return;
    const anyGenerating =
      samples.styles.some((s) => s.generating) || samples.voices.some((s) => s.generating);
    if (!anyGenerating) return;
    const t = setInterval(async () => {
      try {
        const sm = await SitesApi.listSamples(siteId);
        setSamples(sm);
      } catch {
        /* ignore */
      }
    }, 8000);
    return () => clearInterval(t);
  }, [samples, siteId]);

  async function save() {
    if (!form || !siteId) return;
    setSaving(true);
    try {
      await SitesApi.update(siteId, form);
      toast({ variant: 'success', title: 'Site actualizat' });
      await refresh();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare salvare', description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (!siteId || siteId === ALL_SITES) {
    return (
      <div>
        <PageHeader title="Configurare site" description="Selectează un site din partea stângă ca să-l configurezi." />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <div className="font-medium">Niciun site selectat</div>
            <div className="text-sm">Folosește dropdown-ul „Site activ" din sidebar.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !site || !form) {
    return (
      <div>
        <PageHeader title="Configurare site" description="Se încarcă..." />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Configurare · ${site.name}`}
        description={`${site.domain} · ${site.locale.toUpperCase()} · ${site.currency}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/sites')}>
              <ArrowLeft className="h-4 w-4" />
              Listă site-uri
            </Button>
            <Button onClick={save} disabled={saving}>
              <Check className="h-4 w-4" />
              {saving ? 'Se salvează...' : 'Salvează modificările'}
            </Button>
          </div>
        }
      />

      {/* Tab nav */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2 text-sm flex items-center gap-2 border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'general' && <GeneralTab form={form} setForm={setForm} />}
      {activeTab === 'brand' && <BrandSeoTab form={form} setForm={setForm} />}
      {activeTab === 'suno-stripe' && <SunoStripeTab form={form} setForm={setForm} />}
      {activeTab === 'status' && <StatusTab form={form} setForm={setForm} />}
      {activeTab === 'categories' && (
        <CategoriesTab
          siteId={siteId}
          form={form}
          setForm={setForm}
          samples={samples}
          onSamplesChange={(next) => setSamples(next)}
          onRefresh={refresh}
          onSavePartial={async (patch) => {
            // Salvează imediat schimbarea de structură (add/remove style/voice/occasion)
            // ca să nu se piardă dacă userul iese fără save final.
            await SitesApi.update(siteId, patch);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: General
// ─────────────────────────────────────────────────────────────────────────────

function GeneralTab({
  form,
  setForm,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
}) {
  return (
    <div className="grid gap-4">
      <Section title="Identitate">
        <Field label="Slug (intern)">
          <Input value={form.slug} disabled />
        </Field>
        <Field label="Domeniu">
          <Input
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value.toLowerCase().trim() })}
          />
        </Field>
        <Field label="Nume brand">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
      </Section>

      <Section title="Limbă & valută">
        <Field label="Locale">
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
        <Field label="Preț bază (cents)">
          <Input
            type="number"
            value={form.basePriceCents}
            onChange={(e) => setForm({ ...form, basePriceCents: Number(e.target.value) })}
          />
        </Field>
        <Field label="Preț cod cadou single (cents)">
          <Input
            type="number"
            value={form.giftPriceCents}
            onChange={(e) => setForm({ ...form, giftPriceCents: Number(e.target.value) })}
          />
        </Field>
      </Section>

      <Section title="Email">
        <Field label="From email">
          <Input
            value={form.fromEmail ?? ''}
            onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
            placeholder="contact@..."
          />
        </Field>
        <Field label="Support email">
          <Input
            value={form.supportEmail ?? ''}
            onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
            placeholder="salut@..."
          />
        </Field>
        <Field label="Admin emails (separate prin virgulă)">
          <Input
            value={(form.adminEmails ?? []).join(', ')}
            onChange={(e) =>
              setForm({
                ...form,
                adminEmails: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
      </Section>

      <Section title="Date firmă (factură)">
        <Field label="Legal name">
          <Input
            value={form.companyInfo?.legalName ?? ''}
            onChange={(e) => setForm({ ...form, companyInfo: { ...form.companyInfo, legalName: e.target.value } })}
          />
        </Field>
        <Field label="CUI">
          <Input
            value={form.companyInfo?.cui ?? ''}
            onChange={(e) => setForm({ ...form, companyInfo: { ...form.companyInfo, cui: e.target.value } })}
          />
        </Field>
        <Field label="Reg. com.">
          <Input
            value={form.companyInfo?.regCom ?? ''}
            onChange={(e) => setForm({ ...form, companyInfo: { ...form.companyInfo, regCom: e.target.value } })}
          />
        </Field>
        <Field label="Adresă">
          <Input
            value={form.companyInfo?.address ?? ''}
            onChange={(e) => setForm({ ...form, companyInfo: { ...form.companyInfo, address: e.target.value } })}
          />
        </Field>
        <Field label="IBAN">
          <Input
            value={form.companyInfo?.iban ?? ''}
            onChange={(e) => setForm({ ...form, companyInfo: { ...form.companyInfo, iban: e.target.value } })}
          />
        </Field>
        <Field label="Owner name">
          <Input
            value={form.companyInfo?.ownerName ?? ''}
            onChange={(e) => setForm({ ...form, companyInfo: { ...form.companyInfo, ownerName: e.target.value } })}
          />
        </Field>
      </Section>

      <Section title="Note interne">
        <div className="col-span-full">
          <Textarea
            value={form.notes ?? ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
          />
        </div>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Brand & SEO
// ─────────────────────────────────────────────────────────────────────────────

function BrandSeoTab({ form, setForm }: { form: SiteDto; setForm: (f: SiteDto) => void }) {
  return (
    <div className="grid gap-4">
      <Section title="Brand">
        <Field label="Culoare primară">
          <Input
            type="color"
            value={form.brand?.primaryColor ?? '#d4af37'}
            onChange={(e) => setForm({ ...form, brand: { ...form.brand, primaryColor: e.target.value } })}
          />
        </Field>
        <Field label="Culoare accent">
          <Input
            type="color"
            value={form.brand?.accentColor ?? '#f5d271'}
            onChange={(e) => setForm({ ...form, brand: { ...form.brand, accentColor: e.target.value } })}
          />
        </Field>
        <Field label="Tagline">
          <Input
            value={form.brand?.tagline ?? ''}
            onChange={(e) => setForm({ ...form, brand: { ...form.brand, tagline: e.target.value } })}
          />
        </Field>
        <Field label="Logo URL">
          <Input
            value={form.brand?.logoUrl ?? ''}
            onChange={(e) => setForm({ ...form, brand: { ...form.brand, logoUrl: e.target.value } })}
          />
        </Field>
        <Field label="OG image URL (1200×630)">
          <Input
            value={form.brand?.ogImageUrl ?? ''}
            onChange={(e) => setForm({ ...form, brand: { ...form.brand, ogImageUrl: e.target.value } })}
          />
        </Field>
        <Field label="Favicon URL">
          <Input
            value={form.brand?.faviconUrl ?? ''}
            onChange={(e) => setForm({ ...form, brand: { ...form.brand, faviconUrl: e.target.value } })}
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
        <Field label="Keywords (comma-separated)">
          <Input
            value={form.seo?.keywords ?? ''}
            onChange={(e) => setForm({ ...form, seo: { ...form.seo, keywords: e.target.value } })}
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

      <Section title="Social">
        <Field label="Instagram URL">
          <Input
            value={form.social?.instagram ?? ''}
            onChange={(e) => setForm({ ...form, social: { ...(form as any).social, instagram: e.target.value } })}
          />
        </Field>
        <Field label="Facebook URL">
          <Input
            value={form.social?.facebook ?? ''}
            onChange={(e) => setForm({ ...form, social: { ...(form as any).social, facebook: e.target.value } })}
          />
        </Field>
        <Field label="TikTok URL">
          <Input
            value={form.social?.tiktok ?? ''}
            onChange={(e) => setForm({ ...form, social: { ...(form as any).social, tiktok: e.target.value } })}
          />
        </Field>
        <Field label="YouTube URL">
          <Input
            value={form.social?.youtube ?? ''}
            onChange={(e) => setForm({ ...form, social: { ...(form as any).social, youtube: e.target.value } })}
          />
        </Field>
        <Field label="WhatsApp URL (wa.me/...)">
          <Input
            value={form.social?.whatsapp ?? ''}
            onChange={(e) => setForm({ ...form, social: { ...(form as any).social, whatsapp: e.target.value } })}
          />
        </Field>
        <Field label="Telefon (ex. +40 ...)">
          <Input
            value={form.social?.phone ?? ''}
            onChange={(e) => setForm({ ...form, social: { ...(form as any).social, phone: e.target.value } })}
          />
        </Field>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Suno & Stripe
// ─────────────────────────────────────────────────────────────────────────────

function SunoStripeTab({ form, setForm }: { form: SiteDto; setForm: (f: SiteDto) => void }) {
  return (
    <div className="grid gap-4">
      <Section title="Suno (generare audio)">
        <div className="col-span-full">
          <Field label="Prompt de bază (override default Suno)">
            <Textarea
              value={form.suno?.basePrompt ?? ''}
              onChange={(e) => setForm({ ...form, suno: { ...form.suno, basePrompt: e.target.value } })}
              rows={3}
            />
          </Field>
        </div>
        <Field label="Limbă lyrics (default = locale-ul site-ului)">
          <select
            value={form.suno?.lyricsLocale ?? form.locale}
            onChange={(e) => setForm({ ...form, suno: { ...form.suno, lyricsLocale: e.target.value } })}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="OpenAI writer/critic (override prompt-uri default RO)">
        <div className="col-span-full">
          <Field label="System prompt writer (lyrics generator)">
            <Textarea
              value={(form.suno as any)?.writerSystemPrompt ?? ''}
              onChange={(e) =>
                setForm({ ...form, suno: { ...form.suno, writerSystemPrompt: e.target.value } as any })
              }
              rows={4}
              placeholder="Lasă gol = default RO. Pentru BG: prompt pentru chalga; TR: arabesk; etc."
            />
          </Field>
        </div>
        <div className="col-span-full">
          <Field label="System prompt critic (verificator lyrics)">
            <Textarea
              value={(form.suno as any)?.criticSystemPrompt ?? ''}
              onChange={(e) =>
                setForm({ ...form, suno: { ...form.suno, criticSystemPrompt: e.target.value } as any })
              }
              rows={3}
            />
          </Field>
        </div>
      </Section>

      <Section title="Stripe (un singur cont, metadata per site)">
        <Field label="Nume produs (apare pe factură)">
          <Input
            value={form.stripe?.productName ?? ''}
            onChange={(e) => setForm({ ...form, stripe: { ...form.stripe, productName: e.target.value } })}
          />
        </Field>
        <Field label="Statement descriptor (max 22 chars)">
          <Input
            value={form.stripe?.statementDescriptor ?? ''}
            onChange={(e) =>
              setForm({ ...form, stripe: { ...form.stripe, statementDescriptor: e.target.value.slice(0, 22) } })
            }
            maxLength={22}
          />
        </Field>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Status & whitelist
// ─────────────────────────────────────────────────────────────────────────────

function StatusTab({ form, setForm }: { form: SiteDto; setForm: (f: SiteDto) => void }) {
  return (
    <div className="grid gap-4">
      <Section title="Flagsuri site">
        <Toggle label="Activ" value={form.active} onChange={(v) => setForm({ ...form, active: v })} />
        <Toggle label="Default fallback" value={form.isDefault} onChange={(v) => setForm({ ...form, isDefault: v })} />
        <Toggle label="SSL enabled" value={form.sslEnabled} onChange={(v) => setForm({ ...form, sslEnabled: v })} />
        <Toggle
          label="Mentenanță (pagină brandită)"
          value={form.maintenanceMode}
          onChange={(v) => setForm({ ...form, maintenanceMode: v })}
        />
        <Toggle
          label="Hidden (444 — pare offline)"
          value={form.hiddenMode}
          onChange={(v) => setForm({ ...form, hiddenMode: v })}
        />
        <Toggle
          label="Demo gratuit 30s activat"
          value={form.demoEnabled ?? true}
          onChange={(v) => setForm({ ...form, demoEnabled: v })}
        />
      </Section>

      {(form.maintenanceMode || form.hiddenMode) && (
        <Section title="IP whitelist (scutiri de mentenanță / hidden)">
          <div className="col-span-full">
            <p className="text-xs text-muted-foreground mb-2">
              Câte un IP pe linie. Suportă exact-match (<code>1.2.3.4</code>) sau prefix wildcard (
              <code>192.168.*</code>). IP-urile listate vor vedea site-ul normal chiar dacă e în mentenanță sau hidden.
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

      {form.demoEnabled === false && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-3 text-xs text-amber-200">
            ℹ️ Demo gratuit dezactivat. Userul completează formularul, plătește, abia apoi se generează maneaua. Nu mai există preview.
          </CardContent>
        </Card>
      )}

      {form.maintenanceMode && !form.hiddenMode && (
        <Section title="Mesaj mentenanță per locale">
          <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 gap-3">
            {['ro', 'bg', 'sr', 'tr', 'el', 'hr', 'sl', 'bs', 'en'].map((loc) => (
              <Field key={loc} label={loc.toUpperCase()}>
                <Textarea
                  value={(form.maintenanceMessage ?? {})[loc] ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      maintenanceMessage: { ...(form.maintenanceMessage ?? {}), [loc]: e.target.value },
                    })
                  }
                  rows={2}
                  placeholder={loc === 'ro' ? 'Lucrăm la ceva tare.\nRevenim foarte curând.' : ''}
                />
              </Field>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Categorii & Mostre
// ─────────────────────────────────────────────────────────────────────────────

function CategoriesTab({
  siteId,
  form,
  setForm,
  samples,
  onSamplesChange,
  onRefresh,
  onSavePartial,
}: {
  siteId: string;
  form: SiteDto;
  setForm: (f: SiteDto) => void;
  samples: SamplesListDto | null;
  onSamplesChange: (next: SamplesListDto) => void;
  onRefresh: () => void;
  onSavePartial: (patch: Partial<SiteDto>) => Promise<void>;
}) {
  const { toast } = useToast();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Pre-completare din seed-data: dacă DB returnează liste goale, populăm
  // local form-ul cu valorile default (cele care apar oricum pe site-ul public
  // ca fallback). NU scriem în DB până când userul nu editează / salvează,
  // așa că `sites.styles/voices/occasions` rămân `[]` în DB pentru site-urile
  // ne-customizate (nu poluăm zona Database admin).
  const seededForSiteRef = useRef<string | null>(null);
  useEffect(() => {
    if (seededForSiteRef.current === siteId) return;
    seededForSiteRef.current = siteId;
    const patch: Partial<SiteDto> = {};
    if (!form.styles?.length) patch.styles = SEED_STYLES;
    if (!form.voices?.length) patch.voices = SEED_VOICES;
    if (!form.occasions?.length) patch.occasions = SEED_OCCASIONS;
    if (Object.keys(patch).length > 0) {
      setForm({ ...form, ...patch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // Identitatea de referință cu seed-ul = lista încă nu a fost editată / salvată
  // (orice modificare creează un array nou prin spread / filter / map).
  const seededStyles = form.styles === SEED_STYLES;
  const seededVoices = form.voices === SEED_VOICES;
  const seededOccasions = form.occasions === SEED_OCCASIONS;
  const anySeeded = seededStyles || seededVoices || seededOccasions;

  // Helpers ────────────────────────────────────────────────────────────────
  const styleSample = (key: string) => samples?.styles.find((s) => s.key === key) ?? null;
  const voiceSample = (key: string) => samples?.voices.find((s) => s.key === key) ?? null;

  async function generateOne(
    kind: 'style' | 'voice',
    key: string,
    regenerate: boolean,
    overrides?: { voice?: string; lyrics?: string; customStylePrompt?: string; recipientName?: string },
  ) {
    setBusyKey(`${kind}-${key}`);
    if (samples) {
      onSamplesChange(updateSampleLocal(samples, kind, key, (e) => ({ ...e, generating: true })));
    }
    try {
      await SitesApi.generateSample(siteId, { kind, key, regenerate, ...(overrides ?? {}) });
      toast({ variant: 'success', title: 'Mostra generată', description: `${kind}=${key}` });
      const fresh = await SitesApi.listSamples(siteId);
      onSamplesChange(fresh);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare generare', description: (err as Error).message });
      if (samples) {
        onSamplesChange(updateSampleLocal(samples, kind, key, (e) => ({ ...e, generating: false })));
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function uploadSample(kind: 'style' | 'voice', key: string, file: File) {
    setBusyKey(`${kind}-${key}`);
    try {
      await SitesApi.uploadSample(siteId, kind, key, file);
      const fresh = await SitesApi.listSamples(siteId);
      onSamplesChange(fresh);
      toast({ variant: 'success', title: 'Upload reușit' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Upload eșuat', description: (err as Error).message });
    } finally {
      setBusyKey(null);
    }
  }

  async function generateAllMissing() {
    if (!samples) return;
    const missing = [...samples.styles.filter((s) => !s.entry), ...samples.voices.filter((v) => !v.entry)];
    if (missing.length === 0) {
      toast({ title: 'Nimic de făcut', description: 'Toate mostrele sunt generate.' });
      return;
    }
    const ok = await confirmDialog({
      title: `Generezi ${missing.length} mostre?`,
      description: `Cost estimat: ~${missing.length * 10} credite Suno. ~3 min/mostră.`,
      confirmText: 'Da, generează',
    });
    if (!ok) return;
    try {
      await SitesApi.generateAllSamples(siteId, { regenerate: false });
      const fresh = await SitesApi.listSamples(siteId);
      onSamplesChange(fresh);
      toast({ variant: 'success', title: 'Pornite', description: `${missing.length} mostre la coadă.` });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
    }
  }

  // Add / remove entries (with auto-save) ───────────────────────────────────
  async function addEntry(kind: 'style' | 'voice' | 'occasion') {
    const blank: SiteStyleEntry | SiteVoiceEntry | SiteOccasionEntry =
      kind === 'voice'
        ? { id: `new-${Date.now()}`, nm: 'Voce nouă', tg: '', av: '' }
        : kind === 'occasion'
          ? { id: `new-${Date.now()}`, em: '✨', nm: 'Ocazie nouă' }
          : { id: `new-${Date.now()}`, em: '🎵', nm: 'Stil nou', ds: '' };
    const field = kind === 'style' ? 'styles' : kind === 'voice' ? 'voices' : 'occasions';
    const next = [...((form as any)[field] ?? []), blank];
    setForm({ ...form, [field]: next });
    await onSavePartial({ [field]: next } as Partial<SiteDto>);
  }

  async function removeEntry(kind: 'style' | 'voice' | 'occasion', idx: number) {
    const field = kind === 'style' ? 'styles' : kind === 'voice' ? 'voices' : 'occasions';
    const list = (form as any)[field] as Array<{ id: string; nm: string }>;
    const entry = list[idx];
    const ok = await confirmDialog({
      title: `Șterge ${entry?.nm || entry?.id}?`,
      description: `Vei elimina această ${kind === 'voice' ? 'voce' : kind === 'occasion' ? 'ocazie' : 'categorie'} din site. Mostra audio existentă rămâne pe disc dar nu mai e vizibilă.`,
      confirmText: 'Șterge',
      variant: 'destructive',
    });
    if (!ok) return;
    const next = list.filter((_, i) => i !== idx);
    setForm({ ...form, [field]: next });
    await onSavePartial({ [field]: next } as Partial<SiteDto>);
  }

  function moveEntry(kind: 'style' | 'voice' | 'occasion', idx: number, dir: -1 | 1) {
    const field = kind === 'style' ? 'styles' : kind === 'voice' ? 'voices' : 'occasions';
    const list = [...((form as any)[field] ?? [])];
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    setForm({ ...form, [field]: list });
  }

  function updateEntry(
    kind: 'style' | 'voice' | 'occasion',
    idx: number,
    patch: Partial<SiteStyleEntry & SiteVoiceEntry & SiteOccasionEntry>,
  ) {
    const field = kind === 'style' ? 'styles' : kind === 'voice' ? 'voices' : 'occasions';
    const list = [...((form as any)[field] ?? [])];
    list[idx] = { ...list[idx], ...patch };
    setForm({ ...form, [field]: list });
  }

  const styles = form.styles ?? [];
  const voices = form.voices ?? [];
  const occasions = form.occasions ?? [];

  return (
    <div className="space-y-6">
      {anySeeded && (
        <Card className="border-dashed border-primary/40 bg-primary/5">
          <CardContent className="p-3 text-sm flex items-start gap-3">
            <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="space-y-1">
              <div className="font-medium text-foreground">
                Listă default pre-completată
              </div>
              <div className="text-muted-foreground text-xs leading-relaxed">
                {[
                  seededStyles ? `${SEED_STYLES.length} stiluri` : null,
                  seededVoices ? `${SEED_VOICES.length} voci` : null,
                  seededOccasions ? `${SEED_OCCASIONS.length} ocazii` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}{' '}
                preluate din seed-data (aceeași listă pe care o vede site-ul când DB-ul e gol).
                Nimic nu e salvat încă în baza de date — editează direct sau apasă „Salvează modificările" ca să le ancorezi pe acest site.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <Button onClick={generateAllMissing}>
            <Wand2 className="h-4 w-4" />
            Generează toate mostrele lipsă
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Regenerezi TOATE mostrele?',
                description: 'Cost estimat ridicat. Mostrele existente vor fi suprascrise.',
                confirmText: 'Da, regenerează tot',
                variant: 'destructive',
              });
              if (!ok) return;
              try {
                await SitesApi.generateAllSamples(siteId, { regenerate: true });
                onRefresh();
              } catch (err) {
                toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
              }
            }}
          >
            <RefreshCcw className="h-4 w-4" />
            Regenerează tot
          </Button>
          <div className="text-xs text-muted-foreground ml-auto">
            {styles.length} stiluri · {voices.length} voci · {occasions.length} ocazii
          </div>
        </CardContent>
      </Card>

      {/* STILURI ─────────────────────────────────────────────────────────────*/}
      <SubSection
        title="Stiluri muzicale"
        subtitle="Carduri din step 1 al generatorului. Fiecare are mostră audio dedicată (~20s)."
        action={
          <Button size="sm" variant="ghost" onClick={() => addEntry('style')}>
            <Plus className="h-3.5 w-3.5" />
            Adaugă stil
          </Button>
        }
      >
        {styles.length === 0 ? (
          <EmptyHint kind="stiluri" />
        ) : (
          <div className="space-y-2">
            {styles.map((s, idx) => (
              <CategoryRow
                key={idx}
                kind="style"
                idx={idx}
                total={styles.length}
                entry={s}
                sample={styleSample(s.id)}
                busy={busyKey === `style-${s.id}`}
                voiceKeys={voices.map((v) => v.id)}
                site={form}
                siteId={siteId}
                onChange={(patch) => updateEntry('style', idx, patch)}
                onMove={(dir) => moveEntry('style', idx, dir)}
                onRemove={() => removeEntry('style', idx)}
                onGenerate={(regen, overrides) => generateOne('style', s.id, regen, overrides)}
                onUpload={(file) => uploadSample('style', s.id, file)}
              />
            ))}
          </div>
        )}
      </SubSection>

      {/* VOCI ───────────────────────────────────────────────────────────────*/}
      <SubSection
        title="Voci / artiști"
        subtitle="Carduri din step 3. Fiecare voce are mostră audio dedicată."
        action={
          <Button size="sm" variant="ghost" onClick={() => addEntry('voice')}>
            <Plus className="h-3.5 w-3.5" />
            Adaugă voce
          </Button>
        }
      >
        {voices.length === 0 ? (
          <EmptyHint kind="voci" />
        ) : (
          <div className="space-y-2">
            {voices.map((v, idx) => (
              <CategoryRow
                key={idx}
                kind="voice"
                idx={idx}
                total={voices.length}
                entry={v}
                sample={voiceSample(v.id)}
                busy={busyKey === `voice-${v.id}`}
                voiceKeys={voices.map((x) => x.id)}
                site={form}
                siteId={siteId}
                onChange={(patch) => updateEntry('voice', idx, patch)}
                onMove={(dir) => moveEntry('voice', idx, dir)}
                onRemove={() => removeEntry('voice', idx)}
                onGenerate={(regen, overrides) => generateOne('voice', v.id, regen, overrides)}
                onUpload={(file) => uploadSample('voice', v.id, file)}
              />
            ))}
          </div>
        )}
      </SubSection>

      {/* OCAZII ────────────────────────────────────────────────────────────*/}
      <SubSection
        title="Ocazii"
        subtitle="Carduri din step 2 (zi naștere, nuntă, etc.). Fără mostre audio."
        action={
          <Button size="sm" variant="ghost" onClick={() => addEntry('occasion')}>
            <Plus className="h-3.5 w-3.5" />
            Adaugă ocazie
          </Button>
        }
      >
        {occasions.length === 0 ? (
          <EmptyHint kind="ocazii" />
        ) : (
          <div className="space-y-2">
            {occasions.map((o, idx) => (
              <CategoryRow
                key={idx}
                kind="occasion"
                idx={idx}
                total={occasions.length}
                entry={o}
                sample={null}
                busy={false}
                voiceKeys={[]}
                site={form}
                siteId={siteId}
                onChange={(patch) => updateEntry('occasion', idx, patch)}
                onMove={(dir) => moveEntry('occasion', idx, dir)}
                onRemove={() => removeEntry('occasion', idx)}
              />
            ))}
          </div>
        )}
      </SubSection>
    </div>
  );
}

function updateSampleLocal(
  d: SamplesListDto,
  kind: 'style' | 'voice',
  key: string,
  patch: (s: SampleStatusDto) => SampleStatusDto,
): SamplesListDto {
  const k = kind === 'style' ? 'styles' : 'voices';
  return { ...d, [k]: d[k].map((s) => (s.key === key ? patch(s) : s)) } as SamplesListDto;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row pentru un singur stil / voce / ocazie (editor inline + sample integrat)
// ─────────────────────────────────────────────────────────────────────────────

function CategoryRow({
  kind,
  idx,
  total,
  entry,
  sample,
  busy,
  voiceKeys,
  site,
  siteId,
  onChange,
  onMove,
  onRemove,
  onGenerate,
  onUpload,
}: {
  kind: 'style' | 'voice' | 'occasion';
  idx: number;
  total: number;
  entry: SiteStyleEntry | SiteVoiceEntry | SiteOccasionEntry;
  sample: SampleStatusDto | null;
  busy: boolean;
  voiceKeys: string[];
  site: SiteDto;
  siteId: string;
  onChange: (patch: Partial<SiteStyleEntry & SiteVoiceEntry & SiteOccasionEntry>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onGenerate?: (
    regenerate: boolean,
    overrides?: { voice?: string; lyrics?: string; customStylePrompt?: string; recipientName?: string },
  ) => void;
  onUpload?: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const [open18n, setOpenI18n] = useState(false);
  const [recipient, setRecipient] = useState('Demo');
  const [voiceOverride, setVoiceOverride] = useState<string>('');
  const [aiHint, setAiHint] = useState('');
  const [sunoPromptDraft, setSunoPromptDraft] = useState<string>(
    kind === 'style' ? (entry as SiteStyleEntry).sunoPrompt ?? '' : '',
  );
  const [lyrics, setLyrics] = useState('');
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast: rowToast } = useToast();

  useEffect(() => {
    if (kind === 'style') {
      setSunoPromptDraft((entry as SiteStyleEntry).sunoPrompt ?? '');
    }
  }, [(entry as SiteStyleEntry).sunoPrompt, kind]);

  const status: 'present' | 'generating' | 'missing' = !sample
    ? 'missing'
    : sample.generating || busy
      ? 'generating'
      : sample.entry
        ? 'present'
        : 'missing';

  async function generateLyricsWithAI() {
    if (!onGenerate || kind === 'occasion') return;
    setLyricsBusy(true);
    try {
      const res = await SitesApi.previewSampleLyrics(siteId, {
        kind: kind as 'style' | 'voice',
        key: entry.id,
        voice: voiceOverride || undefined,
        recipientName: recipient || undefined,
        customStylePrompt: aiHint.trim() || sunoPromptDraft.trim() || undefined,
      });
      setLyrics(res.lyrics);
      rowToast({ variant: 'success', title: 'Lyrics generate', description: 'Editează apoi „Generează audio".' });
    } catch (err) {
      rowToast({ variant: 'destructive', title: 'Eroare AI', description: (err as Error).message });
    } finally {
      setLyricsBusy(false);
    }
  }

  function submitGenerate(regenerate: boolean) {
    if (!onGenerate) return;
    const overrides: { voice?: string; lyrics?: string; customStylePrompt?: string; recipientName?: string } = {};
    if (voiceOverride) overrides.voice = voiceOverride;
    if (lyrics.trim()) overrides.lyrics = lyrics.trim();
    if (kind === 'style' && sunoPromptDraft.trim() && sunoPromptDraft !== ((entry as SiteStyleEntry).sunoPrompt ?? '')) {
      overrides.customStylePrompt = sunoPromptDraft.trim();
    }
    if (recipient && recipient !== 'Demo') overrides.recipientName = recipient;
    onGenerate(regenerate, Object.keys(overrides).length > 0 ? overrides : undefined);
  }

  return (
    <Card className={status === 'missing' && kind !== 'occasion' ? 'border-amber-500/30' : ''}>
      <CardContent className="p-3">
        {/* Header rând: identitate + status + audio + acțiuni rapide */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg w-7 text-center">{('em' in entry && entry.em) || (kind === 'voice' ? '🎤' : '')}</span>
          {kind === 'voice' && (
            <span className="text-[10px] font-bold w-8 h-7 grid place-items-center rounded bg-secondary/40">
              {(entry as SiteVoiceEntry).av || '··'}
            </span>
          )}
          <div className="w-40 min-w-0">
            <div className="text-sm font-medium truncate">{entry.nm || <span className="italic text-muted-foreground">fără nume</span>}</div>
            <code className="text-[10px] text-muted-foreground">{entry.id}</code>
          </div>

          {kind !== 'occasion' && <SampleStatusBadge status={status} />}

          {kind !== 'occasion' && (
            <div className="flex-1 min-w-[180px] max-w-[280px]">
              {sample?.entry ? (
                <audio controls src={sample.entry.audioUrl} className="w-full h-8" preload="none" />
              ) : (
                <span className="text-[11px] text-muted-foreground italic">Mostra nu a fost generată</span>
              )}
            </div>
          )}

          {kind !== 'occasion' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/ogg,.mp3,.wav,.m4a,.ogg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && onUpload) onUpload(f);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
              <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} title="Upload manual">
                <Upload className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant={sample?.entry ? 'outline' : 'default'}
                onClick={() => onGenerate?.(!!sample?.entry)}
                disabled={busy || sample?.generating}
                title={sample?.entry ? 'Regenerează rapid' : 'Generează rapid'}
              >
                {busy || sample?.generating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : sample?.entry ? (
                  <RefreshCcw className="h-3 w-3" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
              </Button>
            </>
          )}

          <Button size="sm" variant="ghost" onClick={() => onMove(-1)} disabled={idx === 0}>↑</Button>
          <Button size="sm" variant="ghost" onClick={() => onMove(1)} disabled={idx === total - 1}>↓</Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} title="Editează">
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove} title="Șterge">
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>

        {open && (
          <div className="mt-3 pt-3 border-t border-border space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="ID (slug, stabil)">
                <Input
                  value={entry.id}
                  onChange={(e) => onChange({ id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                />
              </Field>
              <Field label="Nume">
                <Input value={entry.nm} onChange={(e) => onChange({ nm: e.target.value })} />
              </Field>
              {kind !== 'voice' && (
                <Field label="Emoji / icon">
                  <Input
                    value={(entry as SiteStyleEntry | SiteOccasionEntry).em ?? ''}
                    onChange={(e) => onChange({ em: e.target.value })}
                  />
                </Field>
              )}
              {kind === 'voice' && (
                <>
                  <Field label="Inițiale avatar (2 caractere)">
                    <Input
                      value={(entry as SiteVoiceEntry).av ?? ''}
                      maxLength={2}
                      onChange={(e) => onChange({ av: e.target.value.toUpperCase() })}
                    />
                  </Field>
                  <Field label="Tagline">
                    <Input
                      value={(entry as SiteVoiceEntry).tg ?? ''}
                      onChange={(e) => onChange({ tg: e.target.value })}
                    />
                  </Field>
                  <Field label="Voce Suno (sunoVoice — override voiceMap)">
                    <Input
                      value={(entry as SiteVoiceEntry).sunoVoice ?? ''}
                      onChange={(e) => onChange({ sunoVoice: e.target.value })}
                      placeholder="lasă gol = id-ul"
                    />
                  </Field>
                </>
              )}
              {kind === 'style' && (
                <>
                  <Field label="Descriere">
                    <Input
                      value={(entry as SiteStyleEntry).ds ?? ''}
                      onChange={(e) => onChange({ ds: e.target.value })}
                    />
                  </Field>
                  <Field label='Badge "heat"'>
                    <Input
                      value={(entry as SiteStyleEntry).heat ?? ''}
                      onChange={(e) => onChange({ heat: e.target.value })}
                      placeholder="🔥 #1"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Prompt Suno (override stylePromptMap pentru acest stil)">
                      <Textarea
                        value={(entry as SiteStyleEntry).sunoPrompt ?? ''}
                        onChange={(e) => onChange({ sunoPrompt: e.target.value })}
                        rows={2}
                      />
                    </Field>
                  </div>
                </>
              )}
            </div>

            {/* Traduceri per locale */}
            <div className="pt-2 border-t border-dashed border-border/60">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setOpenI18n((o) => !o)}
              >
                {open18n ? '▾' : '▸'} Traduceri per locale ({Object.keys(entry.i18n ?? {}).length})
              </button>
              {open18n && (
                <div className="mt-2 space-y-2">
                  {I18N_FIELD_LOCALES.filter((l) => l !== site.locale).map((loc) => {
                    const fields = kind === 'voice' ? ['nm', 'tg'] : kind === 'occasion' ? ['nm'] : ['nm', 'ds', 'heat'];
                    return (
                      <details key={loc} className="border border-border/60 rounded p-2">
                        <summary className="text-xs cursor-pointer">{loc.toUpperCase()}</summary>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          {fields.map((f) => (
                            <Field key={f} label={f}>
                              <Input
                                value={(entry.i18n?.[loc] as any)?.[f] ?? ''}
                                onChange={(e) => {
                                  const next = {
                                    ...(entry.i18n ?? {}),
                                    [loc]: { ...(entry.i18n?.[loc] ?? {}), [f]: e.target.value },
                                  };
                                  onChange({ i18n: next });
                                }}
                              />
                            </Field>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Personalizare generare (doar pentru kind cu samples) */}
            {kind !== 'occasion' && onGenerate && (
              <div className="pt-3 border-t border-dashed border-border/60 space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">Personalizează mostra</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field label="Nume destinatar (în lyrics)">
                    <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                  </Field>
                  <Field label="Voce override (gol = default)">
                    <select
                      value={voiceOverride}
                      onChange={(e) => setVoiceOverride(e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                    >
                      <option value="">— default —</option>
                      {voiceKeys.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Hint AI pentru versuri (opțional)">
                  <Textarea
                    value={aiHint}
                    onChange={(e) => setAiHint(e.target.value)}
                    rows={2}
                    placeholder="Ex: manea de jale despre dor, vocabular cu lacrimi/inimă, ritm liric lent"
                  />
                </Field>

                {kind === 'style' && (
                  <Field label="Prompt Suno temporar (pentru această mostră — nu se salvează)">
                    <Textarea
                      value={sunoPromptDraft}
                      onChange={(e) => setSunoPromptDraft(e.target.value)}
                      rows={2}
                    />
                  </Field>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Lyrics (cu Suno tags)</Label>
                    <Button size="sm" variant="ghost" onClick={generateLyricsWithAI} disabled={lyricsBusy} className="h-7">
                      {lyricsBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Generează cu AI
                    </Button>
                  </div>
                  <Textarea
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    rows={6}
                    className="font-mono text-xs"
                    placeholder={`Lasă gol = demo auto în limba site-ului (${site.locale}).`}
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    onClick={() => submitGenerate(true)}
                    disabled={busy || sample?.generating}
                  >
                    {busy || sample?.generating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    Generează cu opțiunile de mai sus
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SampleStatusBadge({ status }: { status: 'present' | 'generating' | 'missing' }) {
  if (status === 'present') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
        <CheckCircle2 className="h-2.5 w-2.5" />
        OK
      </span>
    );
  }
  if (status === 'generating') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        gen
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
      <AlertTriangle className="h-2.5 w-2.5" />
      lipsă
    </span>
  );
}

function EmptyHint({ kind }: { kind: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-6 text-center text-sm text-muted-foreground">
        Nicio {kind === 'voci' ? 'voce' : kind.replace(/i$/, '')} configurată. Site-ul folosește lista default (seed-data).
        Apasă „Adaugă" pentru a customiza.
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UI utils
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">{title}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
      </CardContent>
    </Card>
  );
}

function SubSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wider">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
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
    <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border cursor-pointer hover:bg-secondary/30">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}
