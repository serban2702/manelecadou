'use client';

import { useEffect, useState } from 'react';
import type { SiteDto } from '@/lib/api/sites.api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field, StudioSection } from './studio-primitives';

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
          </CardContent>
        </Card>
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
          </CardContent>
        </Card>
      </StudioSection>
    </>
  );
}
