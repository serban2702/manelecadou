'use client';

import { useState } from 'react';
import { useAsync, useAsyncCallback } from "@/lib/hooks/use-async";
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { BookOpen, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { KbApi, type KbEntryRow } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';

interface FormState {
  title: string;
  content: string;
  tags: string;
  lang: string;
  active: boolean;
}

const blank: FormState = { title: '', content: '', tags: '', lang: 'ro', active: true };

export default function KnowledgeBasePage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KbEntryRow | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);

  const { data: entries, loading: isLoading, refetch } = useAsync(
    () => KbApi.list(),
    [],
    { refetchInterval: 30_000 },
  );

  function openNew() {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  }
  function openEdit(e: KbEntryRow) {
    setEditing(e);
    setForm({ title: e.title, content: e.content, tags: e.tags.join(', '), lang: e.lang, active: e.active });
    setOpen(true);
  }

  const { run: removeKb } = useAsyncCallback(async (id: string) => {
    await KbApi.delete(id);
    toast({ variant: 'success', title: 'Articol șters' });
    refetch();
  });

  async function save() {
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        lang: form.lang || 'ro',
        active: form.active,
      };
      if (editing) await KbApi.update(editing.id, payload);
      else await KbApi.create(payload);
      toast({ variant: 'success', title: editing ? 'Articol actualizat' : 'Articol adăugat' });
      refetch();
      setOpen(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Bază de cunoștințe"
        description="Articole folosite de AI pentru a genera răspunsuri automate la mailuri. Scrie clar, scurt, în română."
        actions={<Button onClick={openNew}><Plus className="h-4 w-4" /> Articol nou</Button>}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : !entries || entries.length === 0 ? (
        <Empty
          icon={<BookOpen className="h-5 w-5" />}
          title="Niciun articol"
          description="Adaugă întrebări frecvente, prețuri, condiții de livrare. AI le va folosi când răspunde."
          action={<Button onClick={openNew}><Plus className="h-4 w-4" /> Adaugă primul articol</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {entries.map((e) => (
            <Card key={e.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{e.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">{e.content}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: 'Ștergi articolul?',
                          description: `„${e.title}" nu va mai fi folosit de AI pentru răspunsuri.`,
                          confirmText: 'Șterge',
                          variant: 'destructive',
                        });
                        if (ok) removeKb(e.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 items-center text-xs">
                  {!e.active && <Badge variant="outline">inactiv</Badge>}
                  <Badge variant="secondary" className="text-[10px]">{e.lang.toUpperCase()}</Badge>
                  {e.tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                  <span className="ml-auto text-muted-foreground">{format(new Date(e.updatedAt), 'd MMM HH:mm', { locale: ro })}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editează articol' : 'Articol nou'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Titlu</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Cât durează livrarea unei melodii personalizate?" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Conținut</Label>
              <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Răspuns clar, în română, cu detaliile pe care AI poate să se bazeze." className="min-h-[180px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Tags (separate prin virgulă)</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="livrare, prețuri" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Limbă</Label>
                <Input value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })} placeholder="ro" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border bg-background/40">
              <Label>Activ (folosit de AI)</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Renunță</Button>
            <Button onClick={save} disabled={saving || !form.title || !form.content}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? 'Salvează' : 'Adaugă'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
