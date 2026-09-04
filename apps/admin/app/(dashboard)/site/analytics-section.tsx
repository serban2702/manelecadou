'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SitesApi, type SiteDto } from '@/lib/api/sites.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Field, StudioSection } from './studio-primitives';
import { SpaLink } from '@/lib/spa-router';

type SecretKey = keyof NonNullable<SiteDto['analyticsSecrets']>;

function SecretInput({
  stored,
  editing,
  value,
  onStart,
  onChange,
  placeholder,
}: {
  stored: string;
  editing: boolean;
  value: string;
  onStart: () => void;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Input
        type="password"
        autoComplete="new-password"
        value={editing ? value : ''}
        placeholder={stored ? 'lasă gol = neschimbat' : placeholder}
        onChange={(e) => {
          if (!editing) onStart();
          onChange(e.target.value);
        }}
      />
      {!!stored && !editing && (
        <p className="text-[11px] text-muted-foreground">Setat. Lasă gol ca să rămână, scrie unul nou ca să-l înlocuiești.</p>
      )}
    </div>
  );
}

export function AnalyticsSection({
  form,
  setForm,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
}) {
  const [edited, setEdited] = useState<Set<SecretKey>>(new Set());
  const [testingOpenAi, setTestingOpenAi] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setEdited(new Set());
  }, [form.id]);

  function patchPublic(patch: Partial<NonNullable<SiteDto['analytics']>>) {
    setForm({ ...form, analytics: { ...form.analytics, ...patch } });
  }

  function patchSecret(key: SecretKey, value: string) {
    setForm({
      ...form,
      analyticsSecrets: { ...form.analyticsSecrets, [key]: value },
    });
  }

  function secretField(key: SecretKey) {
    const stored = form.analyticsSecrets?.[key] ?? '';
    return {
      stored,
      editing: edited.has(key),
      value: stored,
      onStart: () => setEdited((s) => new Set(s).add(key)),
      onChange: (v: string) => patchSecret(key, v),
    };
  }

  return (
    <>
      <StudioSection
        title="Măsurare (pixeli)"
        help="ID-urile publice (pixel, GA4) apar în pagină. Tokenii server-side nu se reafișează — lasă gol ca să rămână neschimbați."
      >
        {/* Pixelii spun platformei ce s-a întâmplat; UTM-urile ne spun NOUĂ din
            ce reclamă a venit omul. Sunt două lucruri diferite și se configurează
            în locuri diferite — de-aia linkul stă exact aici, unde se caută. */}
        <div
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground"
          data-field="operations.utm"
        >
          <span>
            Pixelii de aici raportează conversiile către platforme. Etichetele de campanie
            (UTM) — ce lipești în Meta, TikTok, Google, ChatGPT — sunt în pagina dedicată.
          </span>
          <SpaLink href="/utm" className="font-medium text-primary hover:underline">
            Linkuri și UTM →
          </SpaLink>
        </div>
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <Field
              label="ID Google Analytics (GA4)"
              fieldId="operations.analytics"
              description="Format G-XXXXXXX. Din GA4 → Admin → Data streams."
            >
              <Input
                value={form.analytics?.ga4Id ?? ''}
                onChange={(e) => patchPublic({ ga4Id: e.target.value })}
                placeholder="G-XXXXXXX"
              />
            </Field>
            <Field
              label="Secret GA4 (server)"
              description="Pentru tracking server-side. Din Data Streams → Measurement Protocol API secrets."
            >
              <SecretInput {...secretField('ga4ApiSecret')} />
            </Field>
            <Field label="ID pixel Meta" description="ID-ul pixelului Facebook / Instagram.">
              <Input
                value={form.analytics?.metaPixelId ?? ''}
                onChange={(e) => patchPublic({ metaPixelId: e.target.value })}
              />
            </Field>
            <Field
              label="Token Meta Conversions API"
              description="Conversions API server-side. Events Manager → Settings → Generate access token."
            >
              <SecretInput {...secretField('metaCapiToken')} />
            </Field>
            <Field
              label="Cod test Meta"
              description="Doar debug, în tab-ul Test events. Șterge după test — altfel evenimentele nu intră în reporting."
            >
              <SecretInput {...secretField('metaTestEventCode')} placeholder="TEST12345" />
            </Field>
            <Field label="ID pixel TikTok">
              <Input
                value={form.analytics?.tiktokPixelId ?? ''}
                onChange={(e) => patchPublic({ tiktokPixelId: e.target.value })}
                placeholder="CXXXXXXXXXXX"
              />
            </Field>
            <Field
              label="Token TikTok Events"
              description="Din TikTok Events Manager → Settings. Tracking server-side."
            >
              <SecretInput {...secretField('tiktokAccessToken')} />
            </Field>
            <Field
              label="ID conversie Google Ads"
              description={'Format AW-XXXXXXXXX. gtag.js e partajat cu GA4 — nu se dublează scriptul.'}
            >
              <Input
                value={form.analytics?.googleAdsConversionId ?? ''}
                onChange={(e) => patchPublic({ googleAdsConversionId: e.target.value })}
                placeholder="AW-XXXXXXXXX"
              />
            </Field>
            <Field
              label="Etichetă conversie Google Ads (cumpărare)"
              description={'Partea de după „/" din eticheta conversiei Purchase. Se declanșează la plată, cu valoare + transaction_id.'}
            >
              <Input
                value={form.analytics?.googleAdsPurchaseLabel ?? ''}
                onChange={(e) => patchPublic({ googleAdsPurchaseLabel: e.target.value })}
                placeholder="AbC-D_efGh"
              />
            </Field>
            <Field
              label="Pixel ID ChatGPT Ads"
              fieldId="operations.openaiPixel"
              description="Din OpenAI Ads Manager → tab-ul Conversions. Se montează în <head>, cât mai devreme."
            >
              <Input
                value={form.analytics?.openaiPixelId ?? ''}
                onChange={(e) => patchPublic({ openaiPixelId: e.target.value })}
                placeholder="KJceR4a84bdTfdXENYmP4x"
              />
            </Field>
            <Field
              label="Cheie ChatGPT Conversions API"
              description="Din Ads Manager → Manage conversion keys. Trimite aceleași conversii din backend, ca plata confirmată după închiderea tabului să nu se piardă."
            >
              <SecretInput {...secretField('openaiConversionsApiKey')} />
            </Field>
          </CardContent>
        </Card>

        {/* Testul merge cu `validate_only`: OpenAI confirmă pixelul, cheia și
            forma payload-ului, dar NU înregistrează nimic. Altfel fiecare
            apăsare pe buton ar fi umflat raportul cu comenzi inexistente. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={testingOpenAi}
            onClick={async () => {
              setTestingOpenAi(true);
              try {
                const res = await SitesApi.openaiAdsTest({ validateOnly: true });
                toast({
                  title: res.ok ? 'ChatGPT Ads: configurare validă' : 'ChatGPT Ads: a răspuns cu eroare',
                  description: res.ok
                    ? 'Pixelul și cheia sunt acceptate. Nu s-a înregistrat nicio conversie (validate_only).'
                    : `${res.status ?? '—'} · ${res.response ?? res.reason ?? 'fără detalii'}`,
                  variant: res.ok ? undefined : 'destructive',
                });
              } catch (e) {
                toast({ title: 'Testul nu a pornit', description: (e as Error).message, variant: 'destructive' });
              } finally {
                setTestingOpenAi(false);
              }
            }}
          >
            {testingOpenAi && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Testează ChatGPT Ads
          </Button>
          <span className="text-xs text-muted-foreground">
            Salvează întâi. Testul rulează în modul de validare — nu înregistrează conversii.
          </span>
        </div>
      </StudioSection>

      <StudioSection
        title="Cheltuieli ads"
        help="Pentru raportarea de spend din Marketing API. Tokenii de aici sunt alții decât CAPI / Events API."
      >
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <Field
              label="Meta Ad Account ID"
              description={'Partea numerică din act_1234567890 (Business Settings → Ad Accounts).'}
            >
              <Input
                value={form.analytics?.metaAdAccountId ?? ''}
                onChange={(e) => patchPublic({ metaAdAccountId: e.target.value })}
                placeholder="1234567890"
              />
            </Field>
            <Field
              label="Meta Marketing API token"
              description={'System User token cu ads_read. Nu expiră. Diferit de tokenul CAPI.'}
            >
              <SecretInput {...secretField('metaMarketingToken')} />
            </Field>
            <Field
              label="TikTok Advertiser ID"
              description="Din TikTok Ads Manager → Account info."
            >
              <Input
                value={form.analytics?.tiktokAdvertiserId ?? ''}
                onChange={(e) => patchPublic({ tiktokAdvertiserId: e.target.value })}
                placeholder="700000000000000000"
              />
            </Field>
            <Field
              label="TikTok Marketing API token"
              description="Access token din TikTok for Business (Reporting). Diferit de Events API."
            >
              <SecretInput {...secretField('tiktokMarketingToken')} />
            </Field>
            <Field
              label="Cont ChatGPT Ads (opțional)"
              description="adacct_… din URL-ul Ads Manager. Doar informativ — cheia de mai jos e deja legată de un singur cont."
            >
              <Input
                value={form.analytics?.openaiAdAccountId ?? ''}
                onChange={(e) => patchPublic({ openaiAdAccountId: e.target.value })}
                placeholder="adacct_6a971f8a3aec819da1e2270a7221948e"
              />
            </Field>
            <Field
              label="Cheie ChatGPT Advertiser API"
              description="Ads Manager → Setări → Chei API → Creează o cheie nouă. Citește cheltuiala. A TREIA cheie OpenAI: nu e nici cea de conversii, nici OPENAI_API_KEY."
            >
              <SecretInput {...secretField('openaiAdsApiKey')} />
            </Field>
          </CardContent>
        </Card>
      </StudioSection>
    </>
  );
}
