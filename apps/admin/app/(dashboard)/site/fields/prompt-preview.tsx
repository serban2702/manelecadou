'use client';

import { cn } from '@/lib/cn';

export const WRITER_PLACEHOLDERS = [
  'style',
  'occasion',
  'recipientName',
  'senderName',
  'tipAmount',
  'currency',
  'message',
  'voiceArtist',
  'styleHint',
] as const;

export const CRITIC_PLACEHOLDERS = [...WRITER_PLACEHOLDERS, 'draft'] as const;

export function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`,
  );
}

export function insertPlaceholder(
  el: HTMLTextAreaElement | null,
  current: string,
  token: string,
  onChange: (next: string) => void,
): void {
  const wrapped = token.startsWith('{{') ? token : `{{${token}}}`;
  if (!el) {
    onChange(current + wrapped);
    return;
  }
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  const next = current.slice(0, start) + wrapped + current.slice(end);
  onChange(next);
  const pos = start + wrapped.length;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

export function PlaceholderChips({
  tokens,
  onInsert,
}: {
  tokens: readonly string[];
  onInsert: (token: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {tokens.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onInsert(t)}
          className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/10 transition-colors"
        >
          {`{{${t}}}`}
        </button>
      ))}
    </div>
  );
}

export function PromptPreview({
  template,
  vars,
  emptyHint = 'Gol = se trimite template-ul default din API.',
}: {
  template: string;
  vars: Record<string, string>;
  emptyHint?: string;
}) {
  const raw = template.trim();
  if (!raw) {
    return <p className="text-[11px] text-muted-foreground italic">{emptyHint}</p>;
  }
  return (
    <pre
      className={cn(
        'text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words',
        'rounded-md border border-border bg-secondary/30 px-3 py-2 max-h-48 overflow-auto',
      )}
    >
      {interpolateTemplate(template, vars)}
    </pre>
  );
}
