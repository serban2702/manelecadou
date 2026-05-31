'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  Megaphone,
  Mail,
  Send,
  Eye,
  Plus,
  Play,
  Trash2,
  Users,
  CreditCard,
  UserX,
  RefreshCw,
  Sparkles,
  Lock,
} from 'lucide-react';
import {
  MarketingApi,
  PromoApi,
  type MarketingTemplateMeta,
  type MarketingCampaign,
  type MarketingRule,
  type CampaignAudience,
  type RuleTrigger,
  type CreateRuleInput,
} from '@/lib/api';
import type { AdminPromoCode } from '@/lib/types';
import { useAsync } from '@/lib/hooks/use-async';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const AUDIENCE_LABEL: Record<CampaignAudience, string> = {
  all: 'Toți',
  payers: 'Au plătit',
  nonpayers: 'Nu au plătit',
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  sent: 'success',
  sending: 'warning',
  draft: 'secondary',
  failed: 'destructive',
};

export default function MarketingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing emails"
        description="Trimite oferte clienților, vezi toate șabloanele de email și pune reduceri pe pilot automat."
      />
      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">
            <Megaphone className="h-4 w-4 mr-1.5" /> Campanii
          </TabsTrigger>
          <TabsTrigger value="templates">
            <Mail className="h-4 w-4 mr-1.5" /> Șabloane
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Sparkles className="h-4 w-4 mr-1.5" /> Reguli automate
          </TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns" className="mt-5">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-5">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="rules" className="mt-5">
          <RulesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =================== CAMPANII ===================

function CampaignsTab() {
  const { data: counts } = useAsync(() => MarketingApi.audience(), [], { refetchInterval: 30_000 });
  const { data: campaigns, loading, refetch } = useAsync(() => MarketingApi.campaigns(), [], {
    refetchInterval: 5_000,
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <AudienceCard label="Audiență totală" value={counts?.all} icon={Users} tone="muted" />
        <AudienceCard label="Au plătit" value={counts?.payers} icon={CreditCard} tone="success" />
        <AudienceCard label="Nu au plătit" value={counts?.nonpayers} icon={UserX} tone="warning" />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Campanii trimise</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Campanie nouă
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && !campaigns ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !campaigns || campaigns.length === 0 ? (
            <Empty
              icon={<Megaphone className="h-5 w-5" />}
              title="Nicio campanie încă"
              description={'Apasă „Campanie nouă” ca să trimiți prima ofertă.'}
            />
          ) : (
            <div className="divide-y">
              {campaigns.map((c) => (
                <CampaignRow key={c.id} c={c} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CampaignDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSent={() => { setDialogOpen(false); refetch(); }} counts={counts} />
    </div>
  );
}

function CampaignRow({ c }: { c: MarketingCampaign }) {
  const pct = c.totalRecipients > 0 ? Math.round(((c.sentCount + c.failedCount) / c.totalRecipients) * 100) : 0;
  return (
    <div className="p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{c.name}</span>
          <Badge variant={STATUS_VARIANT[c.status] ?? 'secondary'} className="text-[10px]">{c.status}</Badge>
          <Badge variant="secondary" className="text-[10px]">{AUDIENCE_LABEL[c.audience]}</Badge>
          {c.promoCodeSnapshot && (
            <Badge variant="secondary" className="text-[10px] font-mono">{c.promoCodeSnapshot}</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {c.sentCount}/{c.totalRecipients} trimise
          {c.failedCount > 0 && <span className="text-red-500"> · {c.failedCount} eșuate</span>}
          {' · '}
          {format(new Date(c.createdAt), 'd MMM yyyy, HH:mm', { locale: ro })}
        </div>
        {c.status === 'sending' && (
          <div className="mt-1.5 h-1.5 w-full rounded bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignDialog({
  open,
  onClose,
  onSent,
  counts,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  counts: { all: number; payers: number; nonpayers: number } | null;
}) {
  const { data: templates } = useAsync(() => MarketingApi.templates(), []);
  const { data: promos } = useAsync(() => PromoApi.list(), []);
  const sendable = (templates ?? []).filter((t) => t.sendable);

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [audience, setAudience] = useState<CampaignAudience>('nonpayers');
  const [promoCodeId, setPromoCodeId] = useState<string>('none');
  const [headline, setHeadline] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tpl = sendable.find((t) => t.id === templateId);
  const audienceCount = counts ? counts[audience] : undefined;

  function buildOverrides(): Record<string, unknown> {
    const o: Record<string, unknown> = {};
    if (tpl?.supports.customHeadline && headline) o.headline = headline;
    if (tpl?.supports.customBody && bodyHtml) o.bodyHtml = bodyHtml;
    const promo = (promos ?? []).find((p) => p.id === promoCodeId);
    if (promo) {
      o.discountLabel = promo.discountType === 'percent' ? `${promo.discountValue}%` : `${(promo.discountValue / 100).toFixed(0)} lei`;
    }
    return o;
  }

  async function doPreview() {
    if (!templateId) return;
    try {
      const o = buildOverrides();
      const promo = (promos ?? []).find((p) => p.id === promoCodeId);
      if (promo) o.promoCode = promo.code;
      const r = await MarketingApi.preview(templateId, o);
      setPreviewHtml(r.html);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare preview', description: (e as Error).message });
    }
  }

  async function submit() {
    if (!name.trim() || !templateId) {
      toast({ variant: 'destructive', title: 'Completează numele și șablonul' });
      return;
    }
    setBusy(true);
    try {
      await MarketingApi.createCampaign({
        name: name.trim(),
        templateId,
        audience,
        promoCodeId: promoCodeId === 'none' ? null : promoCodeId,
        overrides: buildOverrides(),
      });
      toast({ variant: 'success', title: 'Campanie pornită', description: 'Emailurile se trimit în fundal.' });
      onSent();
      resetForm();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setName(''); setTemplateId(''); setAudience('nonpayers'); setPromoCodeId('none');
    setHeadline(''); setBodyHtml(''); setPreviewHtml(null);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setPreviewHtml(null); } }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Campanie nouă</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nume campanie (intern)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Ofertă Crăciun non-plătitori" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Șablon</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Alege un șablon" /></SelectTrigger>
                <SelectContent>
                  {sendable.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tpl && <p className="text-[11px] text-muted-foreground">{tpl.description}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Audiență</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as CampaignAudience)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nonpayers">Nu au plătit{counts ? ` (${counts.nonpayers})` : ''}</SelectItem>
                  <SelectItem value="payers">Au plătit{counts ? ` (${counts.payers})` : ''}</SelectItem>
                  <SelectItem value="all">Toți{counts ? ` (${counts.all})` : ''}</SelectItem>
                </SelectContent>
              </Select>
              {audienceCount !== undefined && (
                <p className="text-[11px] text-muted-foreground">Se va trimite către ~{audienceCount} destinatari.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cod de reducere (opțional)</Label>
              <Select value={promoCodeId} onValueChange={setPromoCodeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Fără cod</SelectItem>
                  {(promos ?? []).filter((p) => p.active).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} ({p.discountType === 'percent' ? `${p.discountValue}%` : `${(p.discountValue / 100).toFixed(0)} lei`})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {tpl?.supports.customHeadline && (
              <div className="space-y-1.5">
                <Label className="text-xs">Titlu (opțional)</Label>
                <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="ex. Reducere de sărbători!" />
              </div>
            )}
            {tpl?.supports.customBody && (
              <div className="space-y-1.5">
                <Label className="text-xs">Mesaj (HTML simplu)</Label>
                <Textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={5} placeholder="<p>Scrie mesajul tău aici...</p>" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Preview</Label>
              <Button variant="outline" size="sm" onClick={doPreview} disabled={!templateId}>
                <Eye className="h-3.5 w-3.5 mr-1.5" /> Generează preview
              </Button>
            </div>
            {previewHtml ? (
              <iframe title="preview" srcDoc={previewHtml} className="w-full h-[420px] rounded border bg-white" sandbox="" />
            ) : (
              <div className="h-[420px] rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">
                Apasă „Generează preview" ca să vezi emailul.
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Anulează</Button>
          <Button onClick={submit} disabled={busy}>
            <Send className="h-4 w-4 mr-1.5" /> {busy ? 'Se trimite…' : `Trimite${audienceCount !== undefined ? ` (~${audienceCount})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================== ȘABLOANE ===================

function TemplatesTab() {
  const { data: templates, loading } = useAsync(() => MarketingApi.templates(), []);
  const [preview, setPreview] = useState<MarketingTemplateMeta | null>(null);

  const marketing = (templates ?? []).filter((t) => t.category === 'marketing');
  const transactional = (templates ?? []).filter((t) => t.category === 'transactional');

  if (loading && !templates) {
    return <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-1.5"><Send className="h-4 w-4 text-primary" /> Marketing (se pot trimite)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {marketing.map((t) => <TemplateCard key={t.id} t={t} onPreview={() => setPreview(t)} />)}
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-1.5"><Lock className="h-4 w-4 text-muted-foreground" /> Transacționale (automate, read-only)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {transactional.map((t) => <TemplateCard key={t.id} t={t} onPreview={() => setPreview(t)} />)}
        </div>
      </section>
      <TemplatePreviewDialog tpl={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function TemplateCard({ t, onPreview }: { t: MarketingTemplateMeta; onPreview: () => void }) {
  return (
    <Card className="hover:border-primary/40 transition cursor-pointer" onClick={onPreview}>
      <CardContent className="pt-4 pb-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">{t.name}</span>
          {t.sendable ? (
            <Badge variant="success" className="text-[10px]">trimisibil</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">auto</Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-3">{t.description}</p>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"><Eye className="h-3.5 w-3.5 mr-1" /> Preview</Button>
      </CardContent>
    </Card>
  );
}

function TemplatePreviewDialog({ tpl, onClose }: { tpl: MarketingTemplateMeta | null; onClose: () => void }) {
  const { data, loading } = useAsync(
    () => (tpl ? MarketingApi.preview(tpl.id) : Promise.resolve(null)),
    [tpl?.id],
  );
  return (
    <Dialog open={!!tpl} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{tpl?.name}</DialogTitle>
        </DialogHeader>
        {loading || !data ? (
          <Skeleton className="h-[480px] w-full" />
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Subiect: <span className="text-foreground font-medium">{data.subject}</span></div>
            <iframe title="preview" srcDoc={data.html} className="w-full h-[520px] rounded border bg-white" sandbox="" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =================== REGULI ===================

function RulesTab() {
  const { data: rules, loading, refetch } = useAsync(() => MarketingApi.rules(), [], { refetchInterval: 10_000 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MarketingRule | null>(null);

  async function runAll() {
    try {
      const r = await MarketingApi.runAll();
      toast({ variant: 'success', title: 'Reguli rulate', description: `${r.rules} reguli · ${r.totalSent} emailuri trimise` });
      refetch();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    }
  }

  return (
    <div className="space-y-5">
      <Card className="bg-amber-500/[0.03] border-amber-500/20">
        <CardContent className="pt-4 pb-3 text-xs text-muted-foreground">
          Regulile trimit automat oferte cu cod personal de reducere. Cron-ul rulează nightly (09:00 UTC) doar dacă
          „Reguli automate active" e pornit în <span className="font-medium">Settings → Marketing emails</span>. Fiecare regulă
          are și propriul on/off. Folosește „Rulează acum" pentru test.
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Reguli automate</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runAll}>
            <Play className="h-3.5 w-3.5 mr-1.5" /> Rulează toate acum
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Regulă nouă
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && !rules ? (
            <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !rules || rules.length === 0 ? (
            <Empty icon={<Sparkles className="h-5 w-5" />} title="Nicio regulă" description="Creează o regulă pentru reduceri automate." />
          ) : (
            <div className="divide-y">
              {rules.map((r) => (
                <RuleRow key={r.id} r={r} onChanged={refetch} onEdit={() => { setEditing(r); setDialogOpen(true); }} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RuleDialog open={dialogOpen} rule={editing} onClose={() => setDialogOpen(false)} onSaved={() => { setDialogOpen(false); refetch(); }} />
    </div>
  );
}

function RuleRow({ r, onChanged, onEdit }: { r: MarketingRule; onChanged: () => void; onEdit: () => void }) {
  async function toggle(active: boolean) {
    try {
      await MarketingApi.updateRule(r.id, { active });
      onChanged();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    }
  }
  async function runNow() {
    try {
      const res = await MarketingApi.runRule(r.id);
      toast({ variant: 'success', title: 'Regulă rulată', description: `${res.sent} trimise din ${res.eligible} eligibili` });
      onChanged();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    }
  }
  async function del() {
    if (!confirm(`Ștergi regula „${r.name}"?`)) return;
    try {
      await MarketingApi.deleteRule(r.id);
      onChanged();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    }
  }
  return (
    <div className="p-3 flex items-center gap-3">
      <Switch checked={r.active} onCheckedChange={toggle} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{r.name}</span>
          <Badge variant={r.trigger === 'payer' ? 'success' : 'warning'} className="text-[10px]">
            {r.trigger === 'payer' ? 'au plătit' : 'nu au plătit'}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          La {r.daysAfter} zile · −{r.discountType === 'percent' ? `${r.discountValue}%` : `${(r.discountValue / 100).toFixed(0)} lei`} · cod valabil {r.validDays} zile · {r.totalSent} trimise
          {r.lastRunAt && ` · ultima rulare ${format(new Date(r.lastRunAt), 'd MMM HH:mm', { locale: ro })}`}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={runNow}><Play className="h-3.5 w-3.5" /></Button>
      <Button variant="ghost" size="sm" onClick={onEdit}>Editează</Button>
      <Button variant="ghost" size="sm" onClick={del}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
    </div>
  );
}

function RuleDialog({
  open,
  rule,
  onClose,
  onSaved,
}: {
  open: boolean;
  rule: MarketingRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: templates } = useAsync(() => MarketingApi.templates(), []);
  const sendable = (templates ?? []).filter((t) => t.sendable);

  const [name, setName] = useState(rule?.name ?? '');
  const [trigger, setTrigger] = useState<RuleTrigger>(rule?.trigger ?? 'nonpayer');
  const [daysAfter, setDaysAfter] = useState(String(rule?.daysAfter ?? 3));
  const [templateId, setTemplateId] = useState(rule?.templateId ?? 'discount_offer');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>(rule?.discountType ?? 'percent');
  const [discountValue, setDiscountValue] = useState(String(rule?.discountValue ?? 15));
  const [validDays, setValidDays] = useState(String(rule?.validDays ?? 14));
  const [active, setActive] = useState(rule?.active ?? false);
  const [busy, setBusy] = useState(false);

  // Reset când se schimbă regula editată.
  useEffect(() => {
    setName(rule?.name ?? '');
    setTrigger(rule?.trigger ?? 'nonpayer');
    setDaysAfter(String(rule?.daysAfter ?? 3));
    setTemplateId(rule?.templateId ?? 'discount_offer');
    setDiscountType(rule?.discountType ?? 'percent');
    setDiscountValue(String(rule?.discountValue ?? 15));
    setValidDays(String(rule?.validDays ?? 14));
    setActive(rule?.active ?? false);
  }, [rule?.id]);

  async function submit() {
    const payload: CreateRuleInput = {
      name: name.trim(),
      trigger,
      daysAfter: Number(daysAfter),
      templateId,
      discountType,
      discountValue: discountType === 'percent' ? Number(discountValue) : Math.round(Number(discountValue) * 100),
      validDays: Number(validDays),
      active,
    };
    if (!payload.name) {
      toast({ variant: 'destructive', title: 'Completează numele' });
      return;
    }
    setBusy(true);
    try {
      if (rule) {
        await MarketingApi.updateRule(rule.id, payload);
      } else {
        await MarketingApi.createRule(payload);
      }
      toast({ variant: 'success', title: rule ? 'Regulă actualizată' : 'Regulă creată' });
      onSaved();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? 'Editează regula' : 'Regulă nouă'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Nume</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Reducere 15% după 3 zile" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Țintă</Label>
              <Select value={trigger} onValueChange={(v) => setTrigger(v as RuleTrigger)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nonpayer">Nu au plătit</SelectItem>
                  <SelectItem value="payer">Au plătit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">După câte zile</Label>
              <Input type="number" value={daysAfter} onChange={(e) => setDaysAfter(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Șablon</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {sendable.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tip reducere</Label>
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as 'percent' | 'fixed')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Procent (%)</SelectItem>
                  <SelectItem value="fixed">Sumă (lei)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valoare</Label>
              <Input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cod valabil (zile)</Label>
              <Input type="number" value={validDays} onChange={(e) => setValidDays(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label className="text-xs">Activă (intră în cron-ul nightly)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Anulează</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Se salvează…' : 'Salvează'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================== shared ===================

function AudienceCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | undefined;
  icon: typeof Users;
  tone: 'muted' | 'success' | 'warning';
}) {
  const toneClass = tone === 'success' ? 'text-emerald-500' : tone === 'warning' ? 'text-amber-500' : 'text-muted-foreground';
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${toneClass}`} />
        </div>
        <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value ?? '—'}</div>
      </CardContent>
    </Card>
  );
}
