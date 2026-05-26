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
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { IconPicker, renderSiteIcon } from '@/components/icon-picker';
import {
  SitesApi,
  type SamplesListDto,
  type SampleStatusDto,
  type SiteDto,
  type SiteOccasionEntry,
  type SiteSampleDefaults,
  type SiteStyleEntry,
  type SiteTestimonialEntry,
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
import {
  SampleChooserDialog,
  type PendingChoice,
} from '@/components/site/sample-chooser-dialog';
import type { SampleCandidateDto } from '@/lib/api/sites.api';

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
      {activeTab === 'brand' && <BrandSeoTab siteId={siteId} form={form} setForm={setForm} />}
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
        <Field label="Preț bază (cents)" description="Prețul plătit de client la deblocare. Ex: 2999 = 29,99 lei.">
          <Input
            type="number"
            value={form.basePriceCents}
            onChange={(e) => setForm({ ...form, basePriceCents: Number(e.target.value) })}
          />
        </Field>
        <Field label="Preț standard / strikethrough (cents)" description="Prețul ‚vechi’ afișat tăiat în vitrine (de unde se reduce). 0 = nu se afișează.">
          <Input
            type="number"
            value={form.standardPriceCents ?? 0}
            onChange={(e) => setForm({ ...form, standardPriceCents: Number(e.target.value) })}
          />
        </Field>
        <Field label="Upgrade Premium — suprataxă (cents)" description="Cât costă în plus opțiunea Manea Premium. Default 2000 = 20 lei.">
          <Input
            type="number"
            value={form.premiumExtraCents ?? 2000}
            onChange={(e) => setForm({ ...form, premiumExtraCents: Number(e.target.value) })}
          />
        </Field>
        <Field label="Dedicație — procent suprataxă (%)" description="Procent aplicat sumei dedicației. Default 5%.">
          <Input
            type="number"
            min={0}
            max={100}
            value={form.tipSurchargePercent ?? 5}
            onChange={(e) => setForm({ ...form, tipSurchargePercent: Number(e.target.value) })}
          />
        </Field>
        <Field label="Dedicație — plafon suprataxă (cents)" description="Suprataxă maximă (cap) pentru dedicație. Default 5000 = 50 lei.">
          <Input
            type="number"
            value={form.tipSurchargeCapCents ?? 5000}
            onChange={(e) => setForm({ ...form, tipSurchargeCapCents: Number(e.target.value) })}
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
        <Field label="From email" description="Adresa expeditor pentru toate mailurile site-ului. Lasă gol = MAIL_FROM global.">
          <Input
            value={form.fromEmail ?? ''}
            onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
            placeholder="noreply@..."
          />
        </Field>
        <Field label="Support email" description="Apare în footer-ul site-ului și ca Reply-To în mailuri.">
          <Input
            value={form.supportEmail ?? ''}
            onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
            placeholder="salut@..."
          />
        </Field>
        <Field label="Admin emails (separate prin virgulă)" description="Notificările interne (cereri GDPR, alerte) ajung aici.">
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

      <MailConfigSection form={form} setForm={setForm} />

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

type BrandAssetField = 'logoUrl' | 'ogImageUrl' | 'faviconUrl' | 'emailBannerUrl';

function BrandAssetUploader({
  siteId,
  field,
  accept,
  value,
  onChange,
  placeholder,
}: {
  siteId: string;
  field: BrandAssetField;
  accept: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!siteId || siteId === ALL_SITES) return;
    setUploading(true);
    try {
      const res = await SitesApi.uploadBrandAsset(siteId, field, file);
      onChange(res.url);
      toast({ variant: 'success', title: 'Fișier încărcat', description: 'Link public generat și salvat.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare upload', description: (err as Error).message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const isImage = !!value && !value.toLowerCase().endsWith('.ico');

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'https://...'}
        />
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Se încarcă...' : 'Încarcă fișier'}
        </Button>
      </div>
      {value && (
        <div className="flex items-center gap-3 rounded border border-border bg-muted/30 p-2">
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={field}
              className="h-12 w-12 rounded border border-border object-contain bg-white"
            />
          )}
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="truncate text-xs text-muted-foreground hover:text-foreground underline"
          >
            {value}
          </a>
        </div>
      )}
    </div>
  );
}

function BrandSeoTab({ siteId, form, setForm }: { siteId: string; form: SiteDto; setForm: (f: SiteDto) => void }) {
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
        <Field label="Logo (PNG/JPG/WEBP/SVG, max 5 MB)">
          <BrandAssetUploader
            siteId={siteId}
            field="logoUrl"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            value={form.brand?.logoUrl ?? ''}
            onChange={(url) => setForm({ ...form, brand: { ...form.brand, logoUrl: url } })}
          />
        </Field>
        <Field label="OG image (1200×630, PNG/JPG/WEBP, max 5 MB)">
          <BrandAssetUploader
            siteId={siteId}
            field="ogImageUrl"
            accept="image/png,image/jpeg,image/webp"
            value={form.brand?.ogImageUrl ?? ''}
            onChange={(url) => setForm({ ...form, brand: { ...form.brand, ogImageUrl: url } })}
          />
        </Field>
        <Field label="Favicon (ICO/PNG/SVG, max 1 MB)">
          <BrandAssetUploader
            siteId={siteId}
            field="faviconUrl"
            accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml,.ico"
            value={form.brand?.faviconUrl ?? ''}
            onChange={(url) => setForm({ ...form, brand: { ...form.brand, faviconUrl: url } })}
          />
        </Field>
        <Field label="Email banner (600×200, PNG/JPG/WEBP, opțional)">
          <BrandAssetUploader
            siteId={siteId}
            field="emailBannerUrl"
            accept="image/png,image/jpeg,image/webp"
            value={form.brand?.emailBannerUrl ?? ''}
            onChange={(url) => setForm({ ...form, brand: { ...form.brand, emailBannerUrl: url } })}
            placeholder="Lasă gol = folosește logo; gol și acolo = banner Manele Cadou implicit"
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
        <Field label="GA4 Measurement Protocol API secret" description="Pentru tracking server-side. Din GA4 → Data Streams → Measurement Protocol API secrets.">
          <Input
            type="password"
            value={form.analyticsSecrets?.ga4ApiSecret ?? ''}
            onChange={(e) => setForm({ ...form, analyticsSecrets: { ...form.analyticsSecrets, ga4ApiSecret: e.target.value } })}
          />
        </Field>
        <Field label="Meta Pixel ID">
          <Input
            value={form.analytics?.metaPixelId ?? ''}
            onChange={(e) => setForm({ ...form, analytics: { ...form.analytics, metaPixelId: e.target.value } })}
          />
        </Field>
        <Field label="Meta CAPI access token" description="Pentru Meta Conversions API server-side.">
          <Input
            type="password"
            value={form.analyticsSecrets?.metaCapiToken ?? ''}
            onChange={(e) => setForm({ ...form, analyticsSecrets: { ...form.analyticsSecrets, metaCapiToken: e.target.value } })}
          />
        </Field>
        <Field label="TikTok Pixel ID">
          <Input
            value={form.analytics?.tiktokPixelId ?? ''}
            onChange={(e) => setForm({ ...form, analytics: { ...form.analytics, tiktokPixelId: e.target.value } })}
            placeholder="CXXXXXXXXXXX"
          />
        </Field>
        <Field label="TikTok Events API access token" description="Pentru tracking server-side (Sales Conversion). Din TikTok Events Manager → Settings → Generate Access Token.">
          <Input
            type="password"
            value={form.analyticsSecrets?.tiktokAccessToken ?? ''}
            onChange={(e) => setForm({ ...form, analyticsSecrets: { ...form.analyticsSecrets, tiktokAccessToken: e.target.value } })}
          />
        </Field>
      </Section>

      <TestimonialsSection form={form} setForm={setForm} />

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
          <Field
            label="User prompt writer (cererea propriu-zisă)"
            description="Placeholders: {{style}}, {{occasion}}, {{recipientName}}, {{senderName}}, {{tipAmount}}, {{currency}}, {{message}}, {{voiceArtist}}, {{styleHint}}. Gol = template default."
          >
            <Textarea
              value={(form.suno as any)?.writerUserTemplate ?? ''}
              onChange={(e) =>
                setForm({ ...form, suno: { ...form.suno, writerUserTemplate: e.target.value } as any })
              }
              rows={8}
              placeholder={
                'Ex: Write lyrics for an authentic chalga song with these details:\n- Style: {{style}}\n- Recipient: {{recipientName}}\n- Sender: {{senderName}}\n- Message: {{message}}\n...'
              }
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
        <div className="col-span-full">
          <Field
            label="User prompt critic (input pentru rafinare)"
            description="Placeholders ca la writer + {{draft}} (ciorna primită). Gol = template default."
          >
            <Textarea
              value={(form.suno as any)?.criticUserTemplate ?? ''}
              onChange={(e) =>
                setForm({ ...form, suno: { ...form.suno, criticUserTemplate: e.target.value } as any })
              }
              rows={6}
              placeholder={
                'Ex: Refine the following draft.\nContext:\n- Recipient: {{recipientName}}\n- Message: {{message}}\nDraft:\n{{draft}}'
              }
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
        <Toggle
          label="Meniu selectare limbă (topbar)"
          value={form.langSwitcherEnabled ?? false}
          onChange={(v) => setForm({ ...form, langSwitcherEnabled: v })}
        />
        <Field label="Mod AI chat default (conversații noi)">
          <select
            value={form.aiChatModeDefault ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                aiChatModeDefault: (e.target.value || null) as 'manual' | 'suggest' | 'auto' | null,
              })
            }
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Default global (din /settings)</option>
            <option value="manual">Manual — AI nu intervine</option>
            <option value="suggest">AI Suggest — propune răspunsuri, admin aprobă</option>
            <option value="auto">AI Auto — răspunde direct cu guardrails</option>
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">
            Mod inițial pentru conversații noi pe acest site. La schimbare se
            propagă automat pe TOATE conversațiile existente ale acestui site
            (după aceea poți override manual per conv din /chat).
          </p>
        </Field>
        <Toggle
          label="AI Greeting — Irina deschide chat singură la 5s după ce vizitatorul intră"
          value={form.aiGreetingEnabled ?? false}
          onChange={(v) => setForm({ ...form, aiGreetingEnabled: v })}
        />
        <p className="text-[11px] text-muted-foreground -mt-1 col-span-full">
          Anti-spam: o singură dată per sesiune. Skip pe pagina /m/[id]
          (ascultători nu-s prospects). Necesită aiChatModeDefault ≠ manual.
        </p>
        <Field label="Sursă date /top">
          <select
            value={form.topSource ?? 'seed'}
            onChange={(e) => setForm({ ...form, topSource: e.target.value as 'seed' | 'live' })}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
          >
            <option value="seed">Seed (demo placeholder)</option>
            <option value="live">Live (din generări reale)</option>
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">
            Comută pe „Live" după ce ai destule manele generate de useri. „Seed" afișează lista hardcoded din web app.
          </p>
        </Field>
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
  // Mai multe rânduri pot fi în generare simultan — fiecare apariție afișează
  // spinner pe propriul card. Înainte era un singur `busyKey: string | null`
  // și pierdeam vizibilitatea celorlalte generări concurente.
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
  // Coadă locală de alegere — fiecare generare finalizată produce un dialog
  // de selecție Suno (2 variante). Userul alege pe rând. Index 0 = dialogul
  // curent activ; restul așteaptă.
  const [pendingChoices, setPendingChoices] = useState<PendingChoice[]>([]);

  const markBusy = useCallback((token: string, on: boolean) => {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(token);
      else next.delete(token);
      return next;
    });
  }, []);

  // Pre-completare din seed-data: dacă DB returnează liste goale, populăm
  // local form-ul cu valorile default (cele care apar oricum pe site-ul public
  // ca fallback). NU scriem în DB până când userul nu editează / salvează,
  // așa că `sites.styles/voices/occasions` rămân `[]` în DB pentru site-urile
  // ne-customizate (nu poluăm zona Database admin).
  //
  // Backfill: pentru site-urile care AU deja stiluri persistate dar fără
  // `sunoPrompt`/`lyricsHint` (versiune veche a seed-ului), completez aceste
  // câmpuri din seed când id-ul se potrivește. Nu suprascriu valori existente.
  const seededForSiteRef = useRef<string | null>(null);
  useEffect(() => {
    if (seededForSiteRef.current === siteId) return;
    seededForSiteRef.current = siteId;
    const patch: Partial<SiteDto> = {};
    if (!form.styles?.length) {
      patch.styles = SEED_STYLES;
    } else {
      const seedById = new Map(SEED_STYLES.map((s) => [s.id, s]));
      let mutated = false;
      const merged = form.styles.map((s) => {
        const seed = seedById.get(s.id);
        if (!seed) return s;
        const missingSuno = !s.sunoPrompt && !!seed.sunoPrompt;
        const missingHint = !s.lyricsHint && !!seed.lyricsHint;
        if (!missingSuno && !missingHint) return s;
        mutated = true;
        return {
          ...s,
          sunoPrompt: s.sunoPrompt || seed.sunoPrompt,
          lyricsHint: s.lyricsHint || seed.lyricsHint,
        };
      });
      if (mutated) patch.styles = merged;
    }
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

  function entryLabel(kind: 'style' | 'voice', key: string): string {
    if (kind === 'style') {
      return form.styles?.find((s) => s.id === key)?.nm || key;
    }
    return form.voices?.find((v) => v.id === key)?.nm || key;
  }

  async function generateOne(
    kind: 'style' | 'voice',
    key: string,
    regenerate: boolean,
    overrides?: {
      voice?: string;
      lyrics?: string;
      customStylePrompt?: string;
      recipientName?: string;
      dedication?: string;
      style?: string;
      occasion?: string;
      message?: string;
      tipAmount?: number;
      premium?: boolean;
      vocalGender?: 'm' | 'f';
    },
  ) {
    const token = `${kind}-${key}`;
    markBusy(token, true);
    if (samples) {
      onSamplesChange(updateSampleLocal(samples, kind, key, (e) => ({ ...e, generating: true })));
    }
    try {
      const res = await SitesApi.generateSample(siteId, { kind, key, regenerate, ...(overrides ?? {}) });
      if (res.reused) {
        toast({ variant: 'success', title: 'Mostra există deja', description: `${kind}=${key}` });
        const fresh = await SitesApi.listSamples(siteId);
        onSamplesChange(fresh);
      } else {
        // Adăugăm în coada de alegere — dialogul se va deschide automat.
        const choice: PendingChoice = {
          queueId: `${kind}-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind,
          key,
          label: entryLabel(kind, key),
          candidates: res.candidates,
          sunoTaskId: res.sunoTaskId,
        };
        setPendingChoices((prev) => [...prev, choice]);
        toast({
          variant: 'success',
          title: 'Mostra generată — alege varianta',
          description: `${kind}=${key} · ${res.candidates.length} variante`,
        });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare generare', description: (err as Error).message });
      if (samples) {
        onSamplesChange(updateSampleLocal(samples, kind, key, (e) => ({ ...e, generating: false })));
      }
    } finally {
      markBusy(token, false);
    }
  }

  async function updateSampleStartSec(kind: 'style' | 'voice', key: string, sec: number) {
    if (!samples) return;
    // Optimistic local update.
    onSamplesChange(
      updateSampleLocal(samples, kind, key, (s) =>
        s.entry ? { ...s, entry: { ...s.entry, startSec: sec || undefined } } : s,
      ),
    );
    try {
      await SitesApi.updateSampleStartSec(siteId, { kind, key, startSec: sec });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare la salvare', description: (err as Error).message });
      // Reîncarcă de la server ca să nu lăsăm UI-ul desincronizat.
      const fresh = await SitesApi.listSamples(siteId);
      onSamplesChange(fresh);
    }
  }

  async function uploadSample(kind: 'style' | 'voice', key: string, file: File) {
    const token = `${kind}-${key}`;
    markBusy(token, true);
    try {
      await SitesApi.uploadSample(siteId, kind, key, file);
      const fresh = await SitesApi.listSamples(siteId);
      onSamplesChange(fresh);
      toast({ variant: 'success', title: 'Upload reușit' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Upload eșuat', description: (err as Error).message });
    } finally {
      markBusy(token, false);
    }
  }

  async function handleChoose(choice: PendingChoice, candidate: SampleCandidateDto) {
    try {
      await SitesApi.commitSampleChoice(siteId, {
        kind: choice.kind,
        key: choice.key,
        audioUrl: candidate.audioUrl,
        audioId: candidate.audioId,
        sunoTaskId: choice.sunoTaskId,
        durationSec: candidate.durationSec,
      });
      toast({
        variant: 'success',
        title: 'Mostra salvată',
        description: `${choice.kind}=${choice.key}`,
      });
      const fresh = await SitesApi.listSamples(siteId);
      onSamplesChange(fresh);
      // Scoatem din coadă DUPĂ ce a reușit — așa, pe eroare, dialogul rămâne
      // deschis și userul poate reîncerca cu același set de candidați.
      setPendingChoices((prev) => prev.filter((c) => c.queueId !== choice.queueId));
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Eroare la salvare',
        description: (err as Error).message,
      });
      throw err;
    }
  }

  function handleSkip(choice: PendingChoice) {
    setPendingChoices((prev) => prev.filter((c) => c.queueId !== choice.queueId));
    if (samples) {
      onSamplesChange(
        updateSampleLocal(samples, choice.kind, choice.key, (e) => ({ ...e, generating: false })),
      );
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
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 ml-auto"
            onClick={async () => {
              const ok = await confirmDialog({
                title: '⚠️ Reset complet categorii & stiluri?',
                description:
                  'Această acțiune va ȘTERGE toate stilurile, vocile și ocaziile personalizate și le va înlocui cu valorile default (cu iconițele noi). Mostrele audio vor fi șterse de pe disc și din DB. Acțiunea este ireversibilă fără backup DB.',
                confirmText: 'Da, resetează la default',
                variant: 'destructive',
              });
              if (!ok) return;
              const patch = {
                styles: SEED_STYLES,
                voices: SEED_VOICES,
                occasions: SEED_OCCASIONS,
              };
              setForm({ ...form, ...patch });
              await onSavePartial(patch);
              try {
                await SitesApi.clearAllSamples(siteId);
              } catch {
                // non-fatal — categoriile au fost resetate oricum
              }
              onRefresh();
              toast({ variant: 'success', title: 'Reset efectuat', description: 'Categoriile și mostrele audio au fost resetate la valorile default.' });
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Reset la default (cu iconițe noi)
          </Button>
          <div className="text-xs text-muted-foreground">
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
                busy={busyKeys.has(`style-${s.id}`)}
                voiceKeys={voices.map((v) => v.id)}
                site={form}
                siteId={siteId}
                onChange={(patch) => updateEntry('style', idx, patch)}
                onMove={(dir) => moveEntry('style', idx, dir)}
                onRemove={() => removeEntry('style', idx)}
                onGenerate={(regen, overrides) => generateOne('style', s.id, regen, overrides)}
                onUpload={(file) => uploadSample('style', s.id, file)}
                onUpdateStartSec={(sec) => updateSampleStartSec('style', s.id, sec)}
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
                busy={busyKeys.has(`voice-${v.id}`)}
                voiceKeys={voices.map((x) => x.id)}
                site={form}
                siteId={siteId}
                onChange={(patch) => updateEntry('voice', idx, patch)}
                onMove={(dir) => moveEntry('voice', idx, dir)}
                onRemove={() => removeEntry('voice', idx)}
                onGenerate={(regen, overrides) => generateOne('voice', v.id, regen, overrides)}
                onUpload={(file) => uploadSample('voice', v.id, file)}
                onUpdateStartSec={(sec) => updateSampleStartSec('voice', v.id, sec)}
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

      {/* Coadă secvențială de alegere între cele 2 variante Suno per generare.
          Se deschide automat când o generare finalizează; după ce userul alege
          (sau renunță), urmează automat dialogul pentru următoarea generare
          finalizată din coadă. */}
      <SampleChooserDialog
        current={pendingChoices[0] ?? null}
        remaining={Math.max(0, pendingChoices.length - 1)}
        onChoose={handleChoose}
        onSkip={handleSkip}
      />
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
  onUpdateStartSec,
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
    overrides?: {
      voice?: string;
      lyrics?: string;
      customStylePrompt?: string;
      recipientName?: string;
      dedication?: string;
      style?: string;
      occasion?: string;
      message?: string;
      tipAmount?: number;
      premium?: boolean;
      vocalGender?: 'm' | 'f';
    },
  ) => void;
  onUpload?: (file: File) => void;
  onUpdateStartSec?: (sec: number) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast: rowToast } = useToast();

  // Toate inputurile din „Personalizează mostra" sunt persistate pe entry.sampleDefaults.
  // Modificările sunt salvate doar când userul apasă „Salvează modificările" (parent form),
  // exact ca celelalte câmpuri editabile ale entry-ului.
  const sd = (entry as SiteStyleEntry | SiteVoiceEntry).sampleDefaults ?? {};
  const updSampleDefaults = (patch: Partial<SiteSampleDefaults>) => {
    onChange({
      sampleDefaults: { ...sd, ...patch },
    } as Partial<SiteStyleEntry & SiteVoiceEntry & SiteOccasionEntry>);
  };

  // Valori efective afișate (cu fallback la entity-level defaults sau preset).
  const recipient = sd.recipient ?? 'Andrei';
  const dedication = sd.dedication ?? '';
  const voiceOverride = sd.voice ?? '';
  const styleOverride =
    sd.style ?? (kind === 'voice' ? site.styles?.[0]?.id ?? '' : '');
  const occasionOverride = sd.occasion ?? (site.occasions?.[0]?.id ?? '');
  const messageDraft = sd.message ?? '';
  const tipAmountDraft = sd.tipAmount != null ? String(sd.tipAmount) : '';
  const premiumDraft = sd.premium ?? false;
  const genderOverride: '' | 'm' | 'f' =
    sd.gender ?? (kind === 'voice' ? (entry as SiteVoiceEntry).gender ?? '' : '');
  const aiHint =
    sd.aiHint ?? (kind === 'style' ? (entry as SiteStyleEntry).lyricsHint ?? '' : '');
  const sunoPromptDraft =
    sd.sunoPromptDraft ?? (kind === 'style' ? (entry as SiteStyleEntry).sunoPrompt ?? '' : '');
  const lyrics = sd.lyrics ?? '';

  const status: 'present' | 'generating' | 'missing' = !sample
    ? 'missing'
    : sample.generating || busy
      ? 'generating'
      : sample.entry
        ? 'present'
        : 'missing';

  function parseTipAmount(): number | undefined {
    if (typeof sd.tipAmount === 'number' && sd.tipAmount > 0) {
      return Math.floor(sd.tipAmount);
    }
    return undefined;
  }

  async function generateLyricsWithAI() {
    if (!onGenerate || kind === 'occasion') return;
    setLyricsBusy(true);
    try {
      const res = await SitesApi.previewSampleLyrics(siteId, {
        kind: kind as 'style' | 'voice',
        key: entry.id,
        voice: voiceOverride || undefined,
        recipientName: recipient || undefined,
        dedication: dedication.trim() || undefined,
        customStylePrompt: aiHint.trim() || sunoPromptDraft.trim() || undefined,
        style: kind === 'voice' && styleOverride ? styleOverride : undefined,
        occasion: occasionOverride || undefined,
        message: messageDraft.trim() || undefined,
        tipAmount: parseTipAmount(),
      });
      updSampleDefaults({ lyrics: res.lyrics });
      rowToast({ variant: 'success', title: 'Lyrics generate', description: 'Editează apoi „Generează audio".' });
    } catch (err) {
      rowToast({ variant: 'destructive', title: 'Eroare AI', description: (err as Error).message });
    } finally {
      setLyricsBusy(false);
    }
  }

  function submitGenerate(regenerate: boolean) {
    if (!onGenerate) return;
    const overrides: {
      voice?: string;
      lyrics?: string;
      customStylePrompt?: string;
      recipientName?: string;
      dedication?: string;
      style?: string;
      occasion?: string;
      message?: string;
      tipAmount?: number;
      premium?: boolean;
      vocalGender?: 'm' | 'f';
    } = {};
    if (voiceOverride) overrides.voice = voiceOverride;
    if (lyrics.trim()) overrides.lyrics = lyrics.trim();
    if (kind === 'style' && sunoPromptDraft.trim() && sunoPromptDraft !== ((entry as SiteStyleEntry).sunoPrompt ?? '')) {
      overrides.customStylePrompt = sunoPromptDraft.trim();
    }
    if (recipient.trim()) overrides.recipientName = recipient.trim();
    if (dedication.trim()) overrides.dedication = dedication.trim();
    if (kind === 'voice' && styleOverride) overrides.style = styleOverride;
    if (occasionOverride) overrides.occasion = occasionOverride;
    if (messageDraft.trim()) overrides.message = messageDraft.trim();
    const tip = parseTipAmount();
    if (typeof tip === 'number') overrides.tipAmount = tip;
    if (premiumDraft) overrides.premium = true;
    if (genderOverride) overrides.vocalGender = genderOverride;
    onGenerate(regenerate, Object.keys(overrides).length > 0 ? overrides : undefined);
  }

  return (
    <Card className={status === 'missing' && kind !== 'occasion' ? 'border-amber-500/30' : ''}>
      <CardContent className="p-3">
        {/* Header rând: identitate + status + audio + acțiuni rapide */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Icon display: SVG from ic field, else emoji, else initials */}
          <span className="w-8 h-8 flex items-center justify-center shrink-0">
            {(entry as SiteStyleEntry | SiteOccasionEntry | SiteVoiceEntry).ic ? (
              renderSiteIcon((entry as SiteStyleEntry | SiteOccasionEntry | SiteVoiceEntry).ic!, 22)
            ) : 'em' in entry && entry.em ? (
              <span className="text-lg">{entry.em}</span>
            ) : kind === 'voice' ? (
              <span className="text-[11px] font-bold w-8 h-7 grid place-items-center rounded bg-secondary/40">
                {(entry as SiteVoiceEntry).av || '··'}
              </span>
            ) : null}
          </span>
          <div className="w-40 min-w-0">
            <div className="text-sm font-medium truncate">{entry.nm || <span className="italic text-muted-foreground">fără nume</span>}</div>
            <code className="text-[10px] text-muted-foreground">{entry.id}</code>
          </div>

          {kind !== 'occasion' && <SampleStatusBadge status={status} />}

          {kind !== 'occasion' && (
            <div className="flex-1 min-w-[180px] max-w-[280px]">
              {sample?.entry ? (
                <audio controls src={sample.entry.audioUrl} className="w-full h-8" preload="metadata" />
              ) : (
                <span className="text-[11px] text-muted-foreground italic">Mostra nu a fost generată</span>
              )}
            </div>
          )}

          {kind !== 'occasion' && sample?.entry && onUpdateStartSec && (
            <SampleStartSecInput
              audioUrl={sample.entry.audioUrl}
              value={sample.entry.startSec ?? 0}
              onCommit={(sec) => onUpdateStartSec(sec)}
            />
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
                onClick={() => submitGenerate(!!sample?.entry)}
                disabled={busy || sample?.generating}
                title={sample?.entry ? 'Regenerează cu opțiunile salvate' : 'Generează cu opțiunile salvate'}
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
              <Field label="Icoană SVG">
                <IconPicker
                  value={(entry as SiteStyleEntry | SiteOccasionEntry | SiteVoiceEntry).ic ?? null}
                  onChange={(ic) => onChange({ ic: ic ?? undefined } as Partial<SiteStyleEntry & SiteVoiceEntry & SiteOccasionEntry>)}
                />
              </Field>
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
                  <Field label="Sex vocal (trimis ca vocalGender la Suno)">
                    <select
                      value={(entry as SiteVoiceEntry).gender ?? ''}
                      onChange={(e) =>
                        onChange({ gender: (e.target.value || undefined) as 'm' | 'f' | undefined })
                      }
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Auto (Suno alege)</option>
                      <option value="m">♂ Bărbat</option>
                      <option value="f">♀ Femeie</option>
                    </select>
                  </Field>
                  <div className="sm:col-span-2">
                    <PersonaControl
                      siteId={siteId}
                      voiceId={entry.id}
                      voice={entry as SiteVoiceEntry}
                      sample={sample}
                      onPersonaCreated={(patch) => onChange(patch)}
                    />
                  </div>
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
                        rows={3}
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label={'Hint AI default pentru versuri (pre-completează „Hint AI" la mostre)'}>
                      <Textarea
                        value={(entry as SiteStyleEntry).lyricsHint ?? ''}
                        onChange={(e) => onChange({ lyricsHint: e.target.value })}
                        rows={2}
                        placeholder="Ex: manea de jale despre dor, vocabular cu lacrimi/inimă, ritm liric lent"
                      />
                    </Field>
                  </div>
                  <Field
                    label="Style weight (0..1)"
                    description="Cât strict urmează Suno tag-urile de style. Default ~0.5. Pentru genuri tradiționale → 0.7-0.9."
                  >
                    <Input
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      value={(entry as SiteStyleEntry).styleWeight ?? ''}
                      onChange={(e) =>
                        onChange({
                          styleWeight: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder="(default Suno)"
                    />
                  </Field>
                  <Field
                    label="Weirdness constraint (0..1)"
                    description="Creativitate / deviere. Tradițional → 0.1-0.3; experimental → 0.5-0.7."
                  >
                    <Input
                      type="number"
                      step="0.05"
                      min={0}
                      max={1}
                      value={(entry as SiteStyleEntry).weirdnessConstraint ?? ''}
                      onChange={(e) =>
                        onChange({
                          weirdnessConstraint: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder="(default Suno)"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field
                      label="Negative tags (CSV)"
                      description={'Genuri / trăsături de exclus. Mai eficient decât a scrie „NOT pop" în prompt. Ex: pop, EDM, trap-rap, mumble rap.'}
                    >
                      <Input
                        value={(entry as SiteStyleEntry).negativeTags ?? ''}
                        onChange={(e) => onChange({ negativeTags: e.target.value })}
                        placeholder="pop, EDM, trap-rap"
                      />
                    </Field>
                  </div>
                </>
              )}
            </div>

            {/* Personalizare generare (doar pentru kind cu samples) */}
            {kind !== 'occasion' && onGenerate && (
              <div className="pt-3 border-t border-dashed border-border/60 space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">
                  Personalizează mostra <span className="text-[10px] normal-case text-muted-foreground/70">(aceleași câmpuri ca pe site)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field label="Nume destinatar (în lyrics)">
                    <Input
                      value={recipient}
                      onChange={(e) => updSampleDefaults({ recipient: e.target.value })}
                      placeholder="Ex: Andrei, Mariana, Costel..."
                    />
                  </Field>
                  {kind === 'style' && (
                    <Field label="Voce override (gol = default)">
                      <select
                        value={voiceOverride}
                        onChange={(e) => updSampleDefaults({ voice: e.target.value || undefined })}
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
                  )}
                  {kind === 'voice' && (
                    <Field label="Stil muzical (mostra cântă vocea pe stilul ales)">
                      <select
                        value={styleOverride}
                        onChange={(e) => updSampleDefaults({ style: e.target.value || undefined })}
                        className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                      >
                        <option value="">— primul din site —</option>
                        {(site.styles ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nm || s.id}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label="Ocazie">
                    <select
                      value={occasionOverride}
                      onChange={(e) => updSampleDefaults({ occasion: e.target.value || undefined })}
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                    >
                      <option value="">— nespecificat —</option>
                      {(site.occasions ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nm || o.id}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={`Sumă dedicație (${site.currency || 'RON'})`}
                    description="Ajunge în prompt ca {{tipAmount}} {{currency}} — AI-ul îl țese în lyrics."
                  >
                    <Input
                      type="number"
                      min={0}
                      step={100}
                      value={tipAmountDraft}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (!v) {
                          updSampleDefaults({ tipAmount: undefined });
                          return;
                        }
                        const n = Number(v);
                        updSampleDefaults({
                          tipAmount: Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined,
                        });
                      }}
                      placeholder="Ex: 1500"
                    />
                  </Field>
                  {kind === 'voice' && (
                    <Field
                      label="Sex vocal (override pentru această mostră)"
                      description="Trimis ca vocalGender la Suno. Pre-completat din configul vocii — schimbă-l fără să salvezi entry-ul."
                    >
                      <select
                        value={genderOverride}
                        onChange={(e) =>
                          updSampleDefaults({
                            gender: (e.target.value || undefined) as 'm' | 'f' | undefined,
                          })
                        }
                        className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                      >
                        <option value="">Auto (Suno alege)</option>
                        <option value="m">♂ Bărbat</option>
                        <option value="f">♀ Femeie</option>
                      </select>
                    </Field>
                  )}
                </div>

                <Field label="Dedicație — expeditor (opțional)">
                  <Input
                    value={dedication}
                    onChange={(e) => updSampleDefaults({ dedication: e.target.value })}
                    placeholder='Ex: "fratele tău Ionuț" — apare în deschidere ("De la <expeditor>, pentru <destinatar>")'
                  />
                </Field>

                <Field
                  label="Mesaj personal pentru destinatar"
                  description={'Apare ca „Personal message to weave in" în prompt-ul Suno și ca {{message}} la writer-ul de versuri.'}
                >
                  <Textarea
                    value={messageDraft}
                    onChange={(e) => updSampleDefaults({ message: e.target.value })}
                    rows={2}
                    placeholder="Ex: La mulți ani, șefule! Să dea Domnu' să luăm bonus de Crăciun..."
                  />
                </Field>

                <Field label="Hint AI pentru versuri (opțional)">
                  <Textarea
                    value={aiHint}
                    onChange={(e) => updSampleDefaults({ aiHint: e.target.value })}
                    rows={2}
                    placeholder="Ex: manea de jale despre dor, vocabular cu lacrimi/inimă, ritm liric lent"
                  />
                </Field>

                {kind === 'style' && (
                  <Field label="Prompt Suno temporar (override pentru această mostră)">
                    <Textarea
                      value={sunoPromptDraft}
                      onChange={(e) => updSampleDefaults({ sunoPromptDraft: e.target.value })}
                      rows={2}
                    />
                  </Field>
                )}

                <Toggle
                  label="Premium (durată ~60s, calitate full în loc de demo 20s)"
                  value={premiumDraft}
                  onChange={(v) => updSampleDefaults({ premium: v })}
                />

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
                    onChange={(e) => updSampleDefaults({ lyrics: e.target.value })}
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

/** Input pentru `startSec` — secunda de la care începe playback-ul în site.
 *  - Buton „Setează din player": pune second-ul curent al audio-ului de mai sus.
 *  - Input numeric editabil (commit on blur / Enter).
 *  - 0 = de la început (cazul default). */
function SampleStartSecInput({
  audioUrl,
  value,
  onCommit,
}: {
  audioUrl: string;
  value: number;
  onCommit: (sec: number) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<string>(String(Math.round(value * 10) / 10));
  useEffect(() => {
    setDraft(String(Math.round(value * 10) / 10));
  }, [value]);

  const commit = async () => {
    const n = Math.max(0, Math.min(600, Number(draft) || 0));
    if (Math.abs(n - value) < 0.05) return;
    await onCommit(n);
  };

  const grabFromPlayer = () => {
    // Caută elementul <audio> precedent în DOM și citește currentTime-ul.
    const el = document.querySelector<HTMLAudioElement>(`audio[src="${audioUrl}"]`);
    if (!el) return;
    const sec = Math.round(el.currentTime * 10) / 10;
    setDraft(String(sec));
    void onCommit(sec);
  };

  return (
    <div className="flex items-center gap-1" title="Secunda de la care începe playback-ul în site">
      <span className="text-[10px] text-muted-foreground">Start</span>
      <input
        type="number"
        min={0}
        max={600}
        step={0.5}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-14 h-7 rounded border border-input bg-background px-1 text-[11px] text-right"
      />
      <span className="text-[10px] text-muted-foreground">s</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-[10px]"
        onClick={grabFromPlayer}
        title="Setează din playerul de mai sus (currentTime)"
      >
        ⤓
      </Button>
    </div>
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
// Testimoniale (afișate pe pagina principală — secțiunea „Ce zic clienții")
// ─────────────────────────────────────────────────────────────────────────────

function TestimonialsSection({ form, setForm }: { form: SiteDto; setForm: (f: SiteDto) => void }) {
  const list = form.testimonials ?? [];

  function update(idx: number, patch: Partial<SiteTestimonialEntry>) {
    const next = list.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    setForm({ ...form, testimonials: next });
  }

  function add() {
    const next: SiteTestimonialEntry = {
      id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      stars: 5,
      quote: '',
      name: '',
      role: '',
      avatar: '',
    };
    setForm({ ...form, testimonials: [...list, next] });
  }

  function remove(idx: number) {
    const next = list.filter((_, i) => i !== idx);
    setForm({ ...form, testimonials: next });
  }

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[idx], next[target]] = [next[target], next[idx]];
    setForm({ ...form, testimonials: next });
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Testimoniale</div>
            <div className="text-[11px] text-muted-foreground">
              Afișate pe pagina principală. Gol = fallback la lista default din cod.
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={add}>
            <Plus className="h-4 w-4" />
            Adaugă
          </Button>
        </div>

        {list.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md">
            Niciun testimonial. Apasă „Adaugă" pentru primul.
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((t, idx) => (
              <div key={t.id} className="border border-border rounded-lg p-3 space-y-2 bg-secondary/20">
                <div className="flex items-start gap-2">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-2">
                      <Label className="text-[10px] uppercase">Stele</Label>
                      <StarsPicker value={t.stars} onChange={(v) => update(idx, { stars: v })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-[10px] uppercase">Avatar</Label>
                      <Input
                        value={t.avatar}
                        maxLength={3}
                        onChange={(e) => update(idx, { avatar: e.target.value.toUpperCase().slice(0, 3) })}
                        placeholder="CB"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <Label className="text-[10px] uppercase">Nume</Label>
                      <Input
                        value={t.name}
                        onChange={(e) => update(idx, { name: e.target.value })}
                        placeholder="Costel B."
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <Label className="text-[10px] uppercase">Rol / locație</Label>
                      <Input
                        value={t.role}
                        onChange={(e) => update(idx, { role: e.target.value })}
                        placeholder="Buzău"
                      />
                    </div>
                    <div className="sm:col-span-12">
                      <Label className="text-[10px] uppercase">Quote</Label>
                      <Textarea
                        value={t.quote}
                        onChange={(e) => update(idx, { quote: e.target.value })}
                        rows={2}
                        placeholder='"Frate, șeful a plâns. Mărire de salariu garantată."'
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => move(idx, -1)} disabled={idx === 0} title="Sus">
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => move(idx, 1)} disabled={idx === list.length - 1} title="Jos">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(idx)} title="Șterge">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StarsPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5 h-9 px-2 border border-border rounded-md bg-background">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-0.5 hover:scale-110 transition-transform"
          title={`${n} stele`}
        >
          <Star
            className={`h-4 w-4 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`}
          />
        </button>
      ))}
    </div>
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

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {description && <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>}
      {children}
    </div>
  );
}

/**
 * Secțiune dedicată configurării serverului de email per-site.
 * Provider: null (folosește configul global), 'mailgun', sau 'smtp'.
 * Secretele (apiKey, smtp.pass) vin mascate de la server ca __MASKED__;
 * input gol păstrează valoarea curentă; introduce string non-empty pentru schimbare.
 */
function MailConfigSection({
  form,
  setForm,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
}) {
  const mc = form.mailConfig ?? {};
  const provider = mc.provider ?? null;

  function patch(next: Partial<NonNullable<SiteDto['mailConfig']>>) {
    setForm({ ...form, mailConfig: { ...mc, ...next } });
  }
  function patchMailgun(next: Partial<NonNullable<NonNullable<SiteDto['mailConfig']>['mailgun']>>) {
    setForm({ ...form, mailConfig: { ...mc, mailgun: { ...(mc.mailgun ?? {}), ...next } } });
  }
  function patchSmtp(next: Partial<NonNullable<NonNullable<SiteDto['mailConfig']>['smtp']>>) {
    setForm({ ...form, mailConfig: { ...mc, smtp: { ...(mc.smtp ?? {}), ...next } } });
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Server de email</div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Alege de unde se trimit mailurile pentru acest site (login, gift code, melodie gata, etc.).
            Lasă pe „Implicit (global)" ca să folosești configul comun din .env.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([
            { v: null, label: 'Implicit (global)' },
            { v: 'mailgun' as const, label: 'Mailgun' },
            { v: 'smtp' as const, label: 'SMTP' },
          ]).map((opt) => {
            const active = provider === opt.v;
            return (
              <button
                key={String(opt.v)}
                type="button"
                onClick={() => patch({ provider: opt.v })}
                className={`text-xs px-3 py-2 rounded border transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-secondary/30'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {provider && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="From email (override)" description={'Override pentru From; dacă e gol, folosește „From email" de mai sus.'}>
              <Input
                value={mc.fromEmail ?? ''}
                onChange={(e) => patch({ fromEmail: e.target.value })}
                placeholder="noreply@domeniul-tau.com"
              />
            </Field>
            <Field label="From name (display name)">
              <Input
                value={mc.fromName ?? ''}
                onChange={(e) => patch({ fromName: e.target.value })}
                placeholder="ЧалгаПодарък / ManeleCadou"
              />
            </Field>
            <Field label="Reply-To (opțional)">
              <Input
                value={mc.replyTo ?? ''}
                onChange={(e) => patch({ replyTo: e.target.value })}
                placeholder="support@..."
              />
            </Field>
          </div>
        )}

        {provider === 'mailgun' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-3">
            <div className="col-span-full text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Credențiale Mailgun
            </div>
            <Field label="Domain" description="ex. mg.chalgapodarok.bg (domeniul verificat în Mailgun).">
              <Input
                value={mc.mailgun?.domain ?? ''}
                onChange={(e) => patchMailgun({ domain: e.target.value })}
                placeholder="mg.example.com"
              />
            </Field>
            <Field label="API key" description="Lasă necompletat pentru a păstra cheia existentă.">
              <Input
                type="password"
                value={mc.mailgun?.apiKey ?? ''}
                onChange={(e) => patchMailgun({ apiKey: e.target.value })}
                placeholder={mc.mailgun?.apiKey === '__MASKED__' ? '••••••••' : 'key-...'}
              />
            </Field>
            <Field label="Region">
              <select
                value={mc.mailgun?.region ?? 'us'}
                onChange={(e) => patchMailgun({ region: e.target.value as 'eu' | 'us' })}
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="us">US</option>
                <option value="eu">EU</option>
              </select>
            </Field>
            <Field label="API URL (override)" description="Opțional. Lasă gol pentru endpoint-ul standard.">
              <Input
                value={mc.mailgun?.apiUrl ?? ''}
                onChange={(e) => patchMailgun({ apiUrl: e.target.value })}
                placeholder="https://api.eu.mailgun.net"
              />
            </Field>
          </div>
        )}

        {provider === 'smtp' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-3">
            <div className="col-span-full text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Credențiale SMTP
            </div>
            <Field label="Host">
              <Input
                value={mc.smtp?.host ?? ''}
                onChange={(e) => patchSmtp({ host: e.target.value })}
                placeholder="smtp.gmail.com / smtp.sendgrid.net"
              />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                value={mc.smtp?.port ?? ''}
                onChange={(e) => patchSmtp({ port: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="587 / 465"
              />
            </Field>
            <Field label="Username">
              <Input
                value={mc.smtp?.user ?? ''}
                onChange={(e) => patchSmtp({ user: e.target.value })}
                placeholder="apikey / contul-tau@..."
              />
            </Field>
            <Field label="Password" description="Lasă necompletat pentru a păstra parola existentă.">
              <Input
                type="password"
                value={mc.smtp?.pass ?? ''}
                onChange={(e) => patchSmtp({ pass: e.target.value })}
                placeholder={mc.smtp?.pass === '__MASKED__' ? '••••••••' : ''}
              />
            </Field>
            <Field label="Secure (TLS implicit)" description="On = TLS direct (port 465). Off = STARTTLS (port 587).">
              <Switch
                checked={!!mc.smtp?.secure}
                onCheckedChange={(v) => patchSmtp({ secure: v })}
              />
            </Field>
          </div>
        )}
      </CardContent>
    </Card>
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

/**
 * Control inline pentru a genera un Persona Suno pornind de la mostra audio
 * existentă a unei voci. Persona = vocea cantăreață consistentă pe care Suno
 * o aplică pe toate generările (prin parametrul `personaId`).
 *
 * Stări:
 *  - Persona deja generat: afișează nume + data, buton „Regenerează" (re-call).
 *  - Mostră audio cu audioId: buton „Generează persona" activ.
 *  - Fără mostră / mostră fără audioId: dezactivat cu hint.
 */
function PersonaControl({
  siteId,
  voiceId,
  voice,
  sample,
  onPersonaCreated,
}: {
  siteId: string;
  voiceId: string;
  voice: SiteVoiceEntry;
  sample: SampleStatusDto | null;
  onPersonaCreated: (patch: Partial<SiteVoiceEntry>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();

  const hasSample = !!sample?.entry;
  const sampleHasAudioId = !!(sample?.entry as any)?.sunoAudioId;
  const hasPersona = !!voice.sunoPersonaId;

  async function run() {
    setBusy(true);
    try {
      const res = await SitesApi.generatePersona(siteId, voiceId, {
        name: voice.nm || voiceId,
        description: description.trim() || undefined,
      });
      onPersonaCreated({
        sunoPersonaId: res.voice.sunoPersonaId,
        sunoPersonaName: res.voice.sunoPersonaName,
        sunoPersonaSourceTaskId: res.voice.sunoPersonaSourceTaskId,
        sunoPersonaSourceAudioId: res.voice.sunoPersonaSourceAudioId,
        sunoPersonaCreatedAt: res.voice.sunoPersonaCreatedAt,
      });
      toast({ variant: 'success', title: 'Persona generat', description: res.voice.sunoPersonaName ?? voiceId });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Eroare la generare persona',
        description: err?.response?.data?.message ?? err?.message ?? 'unknown',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase text-muted-foreground">Persona Suno</div>
        {hasPersona && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
            ACTIV
          </span>
        )}
      </div>

      {hasPersona ? (
        <div className="text-xs space-y-1">
          <div>
            <span className="text-muted-foreground">Nume:</span>{' '}
            <span className="font-medium">{voice.sunoPersonaName ?? '—'}</span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground truncate">
            id: {voice.sunoPersonaId}
          </div>
          {voice.sunoPersonaCreatedAt && (
            <div className="text-[11px] text-muted-foreground">
              creat: {new Date(voice.sunoPersonaCreatedAt).toLocaleString('ro-RO')}
            </div>
          )}
        </div>
      ) : !hasSample ? (
        <p className="text-xs text-muted-foreground">
          Generează întâi o mostră audio pentru această voce, apoi vei putea crea persona.
        </p>
      ) : !sampleHasAudioId ? (
        <p className="text-xs text-yellow-500">
          Mostra existentă nu are <code>audioId</code> Suno (a fost generată înainte de această
          versiune). Regenerează mostra pentru a putea crea persona.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Mostra are <code>audioId</code> ✓. Click pe „Generează persona" pentru a crea o voce
          consistentă pe care Suno o va aplica pe toate manelele cu această voce.
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-[11px] text-muted-foreground hover:text-foreground"
      >
        {showAdvanced ? '▾' : '▸'} Descriere personalizată (opțional)
      </button>
      {showAdvanced && (
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Ex: Authentic Romanian manele singer, melismatic male vocal, heavy auto-tune, oriental phrasing."
        />
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !hasSample || !sampleHasAudioId}
          onClick={run}
        >
          {busy ? 'Generează…' : hasPersona ? 'Regenerează persona' : 'Generează persona'}
        </Button>
      </div>
    </div>
  );
}
