'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Bot, Check, Loader2, Plus, Sparkles, Trash2, Zap } from 'lucide-react';
import { AiChatApi, type AiMemory, type AiMemoryKind, type MemoryStats } from '@/lib/api';
import { useAsync } from '@/lib/hooks/use-async';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';

const KIND_LABEL: Record<AiMemoryKind, { label: string; color: string }> = {
  fact: { label: 'Fapt', color: 'bg-blue-500/15 text-blue-400' },
  faq: { label: 'FAQ', color: 'bg-green-500/15 text-green-400' },
  tone_example: { label: 'Ton', color: 'bg-purple-500/15 text-purple-400' },
  edge_case: { label: 'Edge case', color: 'bg-amber-500/15 text-amber-400' },
  product: { label: 'Produs', color: 'bg-pink-500/15 text-pink-400' },
  policy: { label: 'Politică', color: 'bg-red-500/15 text-red-400' },
};

const KINDS = Object.keys(KIND_LABEL) as AiMemoryKind[];

export default function AiMemoryPage() {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'all'>('pending');
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const approvedFilter = filter === 'all' ? undefined : filter === 'approved';
  const { data, refetch } = useAsync(
    () => AiChatApi.memoryList(approvedFilter),
    [filter],
  );

  useEffect(() => {
    AiChatApi.memoryStats().then(setStats).catch(() => {});
  }, [data]);

  async function approve(id: string) {
    await AiChatApi.memoryUpdate(id, { approved: true });
    refetch();
  }
  async function reject(id: string) {
    if (!confirm('Șterge definitiv această memorie?')) return;
    await AiChatApi.memoryDelete(id);
    refetch();
  }
  async function unapprove(id: string) {
    await AiChatApi.memoryUpdate(id, { approved: false });
    refetch();
  }
  async function saveEdit(id: string, content: string) {
    await AiChatApi.memoryUpdate(id, { content });
    refetch();
  }
  async function extractNow() {
    setExtracting(true);
    try {
      const r = await AiChatApi.extractNow();
      alert(`Scanate: ${r.scannedConversations} conversații · Noi: ${r.newMemories} candidate`);
      refetch();
    } catch (e) {
      alert(`Eroare: ${(e as Error).message}`);
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="AI Memory"
        description="Faptele pe care AI-ul le folosește în system prompt. Doar cele aprobate intră în răspunsuri."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={extractNow} disabled={extracting}>
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Extrage acum din conversații
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-3.5 w-3.5" />
              Adaugă manual
            </Button>
          </div>
        }
      />

      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="text-xs text-emerald-400 uppercase tracking-wider">Aprobate (active)</div>
            <div className="text-2xl font-bold">{stats.approved}</div>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="text-xs text-amber-400 uppercase tracking-wider">În review</div>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {(['pending', 'approved', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm transition border',
              filter === f
                ? 'bg-primary/15 border-primary/40 text-foreground'
                : 'bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/60',
            )}
          >
            {f === 'pending' && '⏳ În review'}
            {f === 'approved' && '✅ Aprobate'}
            {f === 'all' && 'Toate'}
          </button>
        ))}
      </div>

      {showAdd && (
        <AddMemoryForm
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            refetch();
          }}
        />
      )}

      <div className="space-y-2">
        {!data || data.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
            <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {filter === 'pending'
              ? 'Niciun candidate în review. Rulează "Extrage acum" pentru a scana conversațiile recente.'
              : filter === 'approved'
                ? 'Nicio memorie aprobată încă. Adaugă manual sau aprobă candidați din review.'
                : 'Niciun fapt salvat încă.'}
          </div>
        ) : (
          data.map((m) => (
            <MemoryRow
              key={m.id}
              m={m}
              onApprove={() => approve(m.id)}
              onUnapprove={() => unapprove(m.id)}
              onDelete={() => reject(m.id)}
              onSaveEdit={(content) => saveEdit(m.id, content)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MemoryRow({
  m,
  onApprove,
  onUnapprove,
  onDelete,
  onSaveEdit,
}: {
  m: AiMemory;
  onApprove: () => void;
  onUnapprove: () => void;
  onDelete: () => void;
  onSaveEdit: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);
  const k = KIND_LABEL[m.kind];

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition',
        m.approved
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-amber-500/40 bg-amber-500/5',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1 shrink-0">
          <Badge className={cn('h-5 px-1.5', k.color)}>{k.label}</Badge>
          {m.sourceConversationId && (
            <Badge variant="muted" className="h-5 px-1.5 gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              auto
            </Badge>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="mb-2 text-sm"
            />
          ) : (
            <div className="text-sm whitespace-pre-wrap">{m.content}</div>
          )}
          <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-2">
            <span>{format(new Date(m.createdAt), 'd MMM yyyy HH:mm', { locale: ro })}</span>
            {m.approved && (
              <>
                <span>·</span>
                <span>folosit de {m.usageCount}× în prompt</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {editing ? (
            <>
              <Button
                size="sm"
                onClick={() => {
                  if (draft.trim() && draft.trim() !== m.content) onSaveEdit(draft.trim());
                  setEditing(false);
                }}
              >
                Salvează
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(m.content);
                  setEditing(false);
                }}
              >
                Anulează
              </Button>
            </>
          ) : (
            <>
              {!m.approved ? (
                <Button size="sm" onClick={onApprove}>
                  <Check className="h-3.5 w-3.5" />
                  Aprobă
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={onUnapprove}>
                  Dezactivează
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Editează
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Șterge
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AddMemoryForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<AiMemoryKind>('fact');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Adaugă fapt nou (intră aprobat direct)</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ×
        </Button>
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
            Tip
          </label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as AiMemoryKind)}
            className="w-full h-9 px-3 text-sm rounded-md bg-secondary/40 border border-border focus:outline-none"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
            Conținut (max 1000 caractere)
          </label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Ex: Garanție 30 zile, refund integral fără întrebări."
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Anulează
        </Button>
        <Button
          disabled={!content.trim() || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await AiChatApi.memoryCreate({ kind, content: content.trim(), approved: true });
              onSaved();
            } catch (e) {
              alert((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Salvează
        </Button>
      </div>
    </div>
  );
}
