'use client';

import { useState } from 'react';
import { CheckCheck, Loader2, Sparkles, X } from 'lucide-react';
import { type AiReplySuggestionRow, MailApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  suggestion: AiReplySuggestionRow;
  onAfterSend: () => void;
  onAfterDismiss: () => void;
  onApplyToComposer: (html: string) => void;
}

export function SuggestionBanner({ suggestion, onAfterSend, onAfterDismiss, onApplyToComposer }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<'send' | 'dismiss' | null>(null);

  if (suggestion.status === 'skipped') {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5" />
        AI a sărit acest mesaj: {suggestion.reasoning || 'fără potrivire în KB'}.
      </div>
    );
  }

  if (suggestion.status === 'sent' || suggestion.status === 'auto_sent') {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-600 flex items-center gap-2">
        <CheckCheck className="h-4 w-4" />
        {suggestion.status === 'auto_sent' ? 'Răspuns automat trimis de AI' : 'Sugestia AI a fost trimisă'} ·
        confidence {(suggestion.confidence * 100).toFixed(0)}%
      </div>
    );
  }

  if (suggestion.status === 'dismissed') return null;

  const conf = Math.round(suggestion.confidence * 100);
  const confColor = conf >= 80 ? 'text-emerald-500' : conf >= 50 ? 'text-amber-500' : 'text-muted-foreground';

  async function send() {
    setBusy('send');
    try {
      await MailApi.suggestionSend(suggestion.id);
      toast({ variant: 'success', title: 'Răspuns trimis' });
      onAfterSend();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }
  async function dismiss() {
    setBusy('dismiss');
    try {
      await MailApi.suggestionDismiss(suggestion.id);
      onAfterDismiss();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/20">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="text-sm font-medium">Sugestie AI</div>
        <Badge variant="secondary" className={`gap-1 ${confColor}`}>{conf}% confidence</Badge>
        {!suggestion.shouldReply && <Badge variant="outline">AI sugerează: nu răspunde</Badge>}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => onApplyToComposer(suggestion.htmlReply)} disabled={!suggestion.htmlReply}>
            Editează
          </Button>
          <Button size="sm" onClick={send} disabled={busy !== null || !suggestion.htmlReply || !suggestion.shouldReply}>
            {busy === 'send' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Trimite ca atare
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss} disabled={busy !== null}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {suggestion.htmlReply ? (
        <div className="px-3 py-2 prose prose-sm dark:prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: suggestion.htmlReply }} />
      ) : (
        <div className="px-3 py-2 text-xs text-muted-foreground">Fără text sugerat — {suggestion.reasoning || 'verifică KB-ul'}.</div>
      )}
    </div>
  );
}
