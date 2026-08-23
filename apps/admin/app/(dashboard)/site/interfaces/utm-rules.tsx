'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExperienceItemConfig, SiteDto } from '@/lib/api/sites.api';
import { Field } from '../studio-primitives';
import { itemOf, patchItem } from './config';

export function UtmRulesEditor({
  form,
  setForm,
  slug,
  adsUrl,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
  slug: string;
  adsUrl: string;
}) {
  const item = itemOf(form, slug);
  const rules = item.utmRules ?? [];

  function setRules(utmRules: ExperienceItemConfig['utmRules']) {
    setForm(patchItem(form, slug, { utmRules }));
  }

  return (
    <div className="space-y-2" data-field="interfaces.utm">
      <Field
        label="Reguli UTM"
        description={`Gol = nu se alege din reclame. Link ads: ${adsUrl}`}
        fieldId="interfaces.utm"
      >
        <div className="space-y-2">
          {rules.length > 0 && (
            <div className="hidden sm:flex gap-2 text-[10px] text-muted-foreground px-0.5">
              <span className="flex-1 min-w-[120px]">Sursă (de unde vine clientul)</span>
              <span className="flex-1 min-w-[120px]">Campanie</span>
              <span className="flex-1 min-w-[120px]">Variantă anunț</span>
              <span className="w-8" />
            </div>
          )}
          {rules.map((rule, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-center">
              <Input
                className="flex-1 min-w-[120px]"
                placeholder="de unde vine (facebook, tiktok)"
                value={rule.source ?? ''}
                onChange={(e) => {
                  const next = [...rules];
                  next[i] = { ...next[i], source: e.target.value };
                  setRules(next);
                }}
              />
              <Input
                className="flex-1 min-w-[120px]"
                placeholder="campania (nunta-mai)"
                value={rule.campaign ?? ''}
                onChange={(e) => {
                  const next = [...rules];
                  next[i] = { ...next[i], campaign: e.target.value };
                  setRules(next);
                }}
              />
              <Input
                className="flex-1 min-w-[120px]"
                placeholder="varianta anunțului (opțional)"
                value={rule.content ?? ''}
                onChange={(e) => {
                  const next = [...rules];
                  next[i] = { ...next[i], content: e.target.value };
                  setRules(next);
                }}
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                title="Șterge"
                onClick={() => setRules(rules.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRules([...rules, {}])}
          >
            <Plus className="h-3.5 w-3.5" />
            Adaugă regulă
          </Button>
        </div>
      </Field>
    </div>
  );
}
