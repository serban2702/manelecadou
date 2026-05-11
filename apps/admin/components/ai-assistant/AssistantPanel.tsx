'use client';

import { useState } from 'react';
import { Bot, Loader2, Sparkles, Wand2, ScrollText, Languages, ChevronRight, AlertTriangle } from 'lucide-react';
import {
  AiAssistantApi,
  type AssistantContextKind,
  type AssistantResult,
  type AssistantTurn,
  type AssistantOp,
} from '@/lib/api/ai-assistant.api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  contextKind: AssistantContextKind;
  refId: string | null;
  /** Limba detectată a clientului (pentru afișare) — UI hint, backend deduce singur dacă lipsește. */
  detectedLang?: string | null;
  /** Callback când userul apasă „Inserează în composer" → primește textul în limba țintă. */
  onInsertDraft: (text: string) => void;
  className?: string;
}

/**
 * Panou AI Assistant lateral pentru Inbox + Chat.
 * - Vorbești cu el în română.
 * - El îți întoarce: explicația în RO + draft propus în română + draft tradus în limba clientului.
 * - Quick-ops: reformulează, corectează gramatical, scurtează, extinde.
 * - Buton „Inserează" trimite textul ÎN LIMBA ȚINTĂ în composer-ul părinte.
 */
export function AssistantPanel({ contextKind, refId, detectedLang, onInsertDraft, className }: Props) {
  const { toast } = useToast();
  const [history, setHistory] = useState<AssistantTurn[]>([]);
  const [input, setInput] = useState('');
  const [last, setLast] = useState<AssistantResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [overrideLang, setOverrideLang] = useState<string>('');

  async function send(op?: AssistantOp, presetMessage?: string) {
    if (!refId) {
      toast({ variant: 'destructive', title: 'Selectează un mesaj/conversație' });
      return;
    }
    const message = (presetMessage ?? input).trim();
    if (!message) return;
    setLoading(true);
    try {
      const r = await AiAssistantApi.chat({
        context: { kind: contextKind, refId, forceTargetLang: overrideLang || undefined },
        history,
        message,
        op: op ?? 'reply',
      });
      setLast(r);
      setHistory((h) => [
        ...h,
        { role: 'user', content: message },
        { role: 'assistant', content: r.reply },
      ]);
      setInput('');
    } catch (e) {
      toast({ variant: 'destructive', title: 'AI Assistant eroare', description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setHistory([]);
    setLast(null);
    setInput('');
  }

  return (
    <aside className={cn('w-[340px] shrink-0 flex flex-col border border-border rounded-lg bg-card/40 overflow-hidden', className)}>
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          AI Assistant
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-[10px] gap-1">
            <Languages className="h-3 w-3" />
            {detectedLang ?? '—'}
          </Badge>
          {history.length > 0 && (
            <button onClick={reset} className="text-[10px] text-muted-foreground hover:text-foreground">
              reset
            </button>
          )}
        </div>
      </div>

      {!refId && (
        <div className="p-4 text-xs text-muted-foreground">Selectează un {contextKind === 'mail' ? 'mesaj' : 'conversație'} ca să pornești asistentul.</div>
      )}

      {refId && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {history.length === 0 && !last && (
            <div className="text-xs text-muted-foreground space-y-2">
              <p>
                Sunt aici să te ajut cu răspunsul. Tu îmi vorbești în română — eu îți generez draftul în limba clientului folosind baza de cunoștințe a site-ului.
              </p>
              <div className="space-y-1">
                <QuickOp icon={<Sparkles className="h-3 w-3" />} onClick={() => send('reply', 'Generează un răspuns recomandat pe baza KB.')}>
                  Răspuns recomandat (din KB)
                </QuickOp>
                <QuickOp icon={<Wand2 className="h-3 w-3" />} onClick={() => input && send('reformulate')} disabled={!input.trim()}>
                  Reformulează ce am scris
                </QuickOp>
                <QuickOp icon={<ScrollText className="h-3 w-3" />} onClick={() => input && send('fix-grammar')} disabled={!input.trim()}>
                  Corectează gramatical
                </QuickOp>
              </div>
            </div>
          )}

          {history.map((t, i) => (
            <div
              key={i}
              className={cn(
                'rounded-md px-2.5 py-2 text-xs whitespace-pre-wrap',
                t.role === 'user' ? 'bg-primary/10 self-end' : 'bg-secondary/40',
              )}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">
                {t.role === 'user' ? 'tu' : 'asistent'}
              </div>
              {t.content}
            </div>
          ))}

          {last && (
            <div className="space-y-2 border-t border-border pt-3">
              {/* Inserăm draftul RO — backend-ul auto-traduce către limba clientului
                  la trimitere (mail: ReplyDto cu targetLang; chat: sendAsAdmin auto). */}
              <DraftBlock
                title="Draft (ro — pentru insert)"
                text={last.suggestedDraftRo}
                primary
                onInsert={() => onInsertDraft(last.suggestedDraftRo)}
              />
              {last.targetLang !== 'ro' && (
                <DraftBlock
                  title={`Preview (${last.targetLang}) — așa va ajunge la client`}
                  text={last.suggestedDraftTarget}
                  muted
                  consensus={last.translationConsensus}
                />
              )}
              {last.usedKb.length > 0 && (
                <div className="text-[10px] text-muted-foreground">
                  KB folosit:{' '}
                  {last.usedKb.map((k: { id: string; title: string }, i: number) => (
                    <span key={k.id}>
                      {i > 0 && ', '}
                      <span title={k.id}>{k.title}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {refId && (
        <div className="border-t border-border p-2 space-y-2">
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-muted-foreground">Forțează limba:</span>
            <select
              value={overrideLang}
              onChange={(e) => setOverrideLang(e.target.value)}
              className="h-6 px-1 rounded border border-input bg-background"
            >
              <option value="">auto ({detectedLang ?? 'ro'})</option>
              {['ro', 'en', 'bg', 'el', 'sr', 'hu', 'pl', 'de', 'it', 'es', 'fr'].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Scrie în română… (Cmd/Ctrl+Enter ca să trimiți)'
            rows={3}
            className="text-xs min-h-[60px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="flex gap-1">
            <Button size="sm" className="flex-1" onClick={() => send()} disabled={loading || !input.trim()}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Trimite
            </Button>
            <Button size="sm" variant="outline" onClick={() => send('reformulate')} disabled={loading || !input.trim()} title="Reformulează textul scris">
              <Wand2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => send('fix-grammar')} disabled={loading || !input.trim()} title="Corectează gramatical">
              <ScrollText className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}

function DraftBlock({
  title,
  text,
  primary,
  muted,
  consensus,
  onInsert,
}: {
  title: string;
  text: string;
  primary?: boolean;
  muted?: boolean;
  consensus?: number;
  onInsert?: () => void;
}) {
  const lowConsensus = typeof consensus === 'number' && consensus < 0.7;
  return (
    <div className={cn('rounded-md border p-2', primary ? 'border-primary/40 bg-primary/5' : 'border-border bg-background/40', muted && 'opacity-70')}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</span>
        <div className="flex items-center gap-1">
          {typeof consensus === 'number' && (
            <Badge variant={lowConsensus ? 'destructive' : 'outline'} className="text-[9px] h-4 px-1 gap-0.5">
              {lowConsensus && <AlertTriangle className="h-2.5 w-2.5" />}
              consens {(consensus * 100).toFixed(0)}%
            </Badge>
          )}
          {onInsert && (
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={onInsert}>
              Inserează
            </Button>
          )}
        </div>
      </div>
      <div className="text-xs whitespace-pre-wrap">{text}</div>
    </div>
  );
}

function QuickOp({ icon, children, onClick, disabled }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full text-left text-[11px] px-2 py-1.5 rounded border border-border bg-background/40 hover:bg-secondary/40 flex items-center gap-1.5',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
