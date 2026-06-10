'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  SquareTerminal,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { getAdminToken } from '@/lib/http/client';
import { cn } from '@/lib/cn';

/**
 * Claude Ops — două view-uri peste același Claude Code din containerul ops:
 *
 *  - „Chat"     → UI de chat brandat; fiecare mesaj rulează `claude -p --resume`
 *                 headless prin bridge-ul SSE (/ops-chat/chat, auth = JWT admin).
 *  - „Terminal" → ttyd + tmux (iframe /ops/), pentru control total interactiv.
 *
 * Ambele folosesc ACELAȘI login pe abonamentul Max (volumul ops_home) — login-ul
 * se face o singură dată, din Terminal view (`claude` → `/login`).
 */

type ViewMode = 'chat' | 'terminal';

type ChatItem =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; detail: string };

type ChatMessage = { role: 'user' | 'assistant'; items: ChatItem[] };

const LS_VIEW = 'mc_ops_view';
const LS_SESSION = 'mc_ops_chat_session';
const LS_HISTORY = 'mc_ops_chat_history';

const SUGGESTIONS = [
  'Ce erori noi avem în ultimele 24h? Grupează-le și zi-mi care cer acțiune.',
  'Caută clientul cu emailul … și fă-mi dosarul complet (plăți, piese, chat).',
  'Câte plăți failed vs paid avem azi, pe fiecare site?',
  'Generarea … a ieșit prost — fă o variație nouă cu vocea feminină.',
];

export default function OpsTerminal() {
  const [view, setView] = useState<ViewMode>('terminal');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(LS_VIEW);
    if (saved === 'chat' || saved === 'terminal') setView(saved);
    setHydrated(true);
  }, []);

  const switchView = (v: ViewMode) => {
    setView(v);
    try { localStorage.setItem(LS_VIEW, v); } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <PageHeader
        title="Claude Ops"
        description="Claude Code pe VPS — regenerări, investigații, DB. Chat pentru rapid, Terminal pentru control total."
      />

      <div className="flex items-center gap-2 mb-3 -mt-2 flex-wrap">
        {/* Switch-ul de view */}
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => switchView('chat')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
              view === 'chat'
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <MessageSquare className="h-4 w-4" />
            Chat
          </button>
          <button
            type="button"
            onClick={() => switchView('terminal')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
              view === 'terminal'
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <SquareTerminal className="h-4 w-4" />
            Terminal
          </button>
        </div>

        {view === 'terminal' && <TerminalToolbar />}
      </div>

      {/* Terminalul rămâne montat (iframe-ul nu se reîncarcă la switch) */}
      <div className={cn('flex-1 min-h-0 flex-col', view === 'terminal' ? 'flex' : 'hidden')}>
        {hydrated && <TerminalView />}
      </div>
      <div className={cn('flex-1 min-h-0 flex-col', view === 'chat' ? 'flex' : 'hidden')}>
        <ChatView active={view === 'chat'} />
      </div>
    </div>
  );
}

/* ============================== Terminal view ============================== */

let reloadTerminal: (() => void) | null = null;

function TerminalToolbar() {
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => reloadTerminal?.()}>
        <RefreshCw className="h-4 w-4" />
        Reconectează
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.open('/ops/', '_blank')}>
        <ExternalLink className="h-4 w-4" />
        Full-screen
      </Button>
      <span className="text-xs text-muted-foreground hidden md:inline">
        Prima dată: rulează <code className="bg-secondary px-1 rounded">claude</code>, apoi{' '}
        <code className="bg-secondary px-1 rounded">/login</code> (abonament Max). Scroll: rotița mouse-ului.
      </span>
    </>
  );
}

function TerminalView() {
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    reloadTerminal = () => setReloadKey((k) => k + 1);
    return () => { reloadTerminal = null; };
  }, []);

  return (
    <iframe
      key={reloadKey}
      src="/ops/"
      title="Claude Ops Terminal"
      className="flex-1 w-full rounded-lg border border-border bg-black min-h-[420px]"
      allow="clipboard-read; clipboard-write"
    />
  );
}

/* ================================ Chat view ================================ */

function ChatView({ active }: { active: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore sesiune + istoric (rezistă la navigarea prin admin).
  useEffect(() => {
    try {
      const sid = localStorage.getItem(LS_SESSION);
      if (sid) setSessionId(sid);
      const hist = localStorage.getItem(LS_HISTORY);
      if (hist) setMessages(JSON.parse(hist));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_HISTORY, JSON.stringify(messages.slice(-60))); } catch { /* ignore */ }
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const newSession = () => {
    setMessages([]);
    setSessionId(null);
    setError(null);
    try {
      localStorage.removeItem(LS_SESSION);
      localStorage.removeItem(LS_HISTORY);
    } catch { /* ignore */ }
  };

  const send = useCallback(async (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || streaming) return;
    setInput('');
    setError(null);
    setStreaming(true);
    setMessages((m) => [
      ...m,
      { role: 'user', items: [{ kind: 'text', text: prompt }] },
      { role: 'assistant', items: [] },
    ]);

    // Mutația itemilor ULTIMULUI mesaj assistant, imutabil la nivel de array.
    const patchLast = (fn: (items: ChatItem[]) => ChatItem[]) =>
      setMessages((m) => {
        const copy = m.slice();
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, items: fn(last.items) };
        return copy;
      });

    try {
      const res = await fetch('/ops-chat/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken() ?? ''}`,
        },
        body: JSON.stringify({ prompt, sessionId }),
      });
      if (!res.ok || !res.body) {
        throw new Error(res.status === 401 ? 'Sesiunea admin a expirat — dă refresh și loghează-te.' : `Bridge HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      // Blocurile turnului API curent: index → poziția itemului în listă.
      let blockMap = new Map<number, { pos: number; inputJson: string }>();
      let itemCount = 0;
      let gotText = false;

      const processEvent = (ev: any) => {
        if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id) {
          setSessionId(ev.session_id);
          try { localStorage.setItem(LS_SESSION, ev.session_id); } catch { /* ignore */ }
          return;
        }
        if (ev.type === 'bridge_error') {
          setError(String(ev.message || 'Eroare necunoscută'));
          return;
        }
        if (ev.type === 'stream_event' && ev.event) {
          const e = ev.event;
          if (e.type === 'message_start') {
            blockMap = new Map();
            return;
          }
          if (e.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
            const pos = itemCount++;
            blockMap.set(e.index, { pos, inputJson: '' });
            patchLast((items) => [...items, { kind: 'tool', name: e.content_block.name || 'tool', detail: '' }]);
            return;
          }
          if (e.type === 'content_block_delta') {
            if (e.delta?.type === 'text_delta' && e.delta.text) {
              gotText = true;
              const known = blockMap.get(e.index);
              if (known === undefined) {
                const pos = itemCount++;
                blockMap.set(e.index, { pos, inputJson: '' });
                patchLast((items) => [...items, { kind: 'text', text: e.delta.text }]);
              } else {
                patchLast((items) =>
                  items.map((it, i) =>
                    i === known.pos && it.kind === 'text' ? { ...it, text: it.text + e.delta.text } : it,
                  ),
                );
              }
            } else if (e.delta?.type === 'input_json_delta') {
              const known = blockMap.get(e.index);
              if (known) known.inputJson += e.delta.partial_json || '';
            }
            return;
          }
          if (e.type === 'content_block_stop') {
            const known = blockMap.get(e.index);
            if (known?.inputJson) {
              let detail = '';
              try {
                const inp = JSON.parse(known.inputJson);
                detail = String(
                  inp.command ?? inp.file_path ?? inp.pattern ?? inp.description ?? inp.prompt ?? inp.skill ?? '',
                ).slice(0, 90);
              } catch { /* input incomplet — lăsăm gol */ }
              if (detail) {
                patchLast((items) =>
                  items.map((it, i) => (i === known.pos && it.kind === 'tool' ? { ...it, detail } : it)),
                );
              }
            }
            return;
          }
          return;
        }
        // Fallback: dacă versiunea CLI nu emite deltas, folosim mesajele complete.
        if (ev.type === 'assistant' && !gotText && Array.isArray(ev.message?.content)) {
          for (const block of ev.message.content) {
            if (block.type === 'text' && block.text) {
              patchLast((items) => [...items, { kind: 'text', text: block.text }]);
              itemCount++;
            } else if (block.type === 'tool_use') {
              const detail = String(
                block.input?.command ?? block.input?.file_path ?? block.input?.pattern ?? block.input?.description ?? '',
              ).slice(0, 90);
              patchLast((items) => [...items, { kind: 'tool', name: block.name || 'tool', detail }]);
              itemCount++;
            }
          }
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          const line = frame.startsWith('data: ') ? frame.slice(6) : frame;
          if (!line.trim()) continue;
          try { processEvent(JSON.parse(line)); } catch { /* linie non-JSON — ignor */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conexiunea a picat.');
    } finally {
      setStreaming(false);
      // Curăță bula goală dacă n-a venit nimic (ex. eroare imediată).
      setMessages((m) => {
        const last = m[m.length - 1];
        return last?.role === 'assistant' && last.items.length === 0 ? m.slice(0, -1) : m;
      });
      inputRef.current?.focus();
    }
  }, [input, sessionId, streaming]);

  return (
    <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border bg-card/40">
      {/* Header sesiune */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Claude</span>
        {sessionId && (
          <span className="text-[11px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded">
            sesiune {sessionId.slice(0, 8)}
          </span>
        )}
        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={newSession} disabled={streaming}>
            <Plus className="h-4 w-4" />
            Sesiune nouă
          </Button>
        </div>
      </div>

      {/* Mesaje */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-10">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-amber-300 flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="text-sm text-muted-foreground max-w-md">
              Vorbește cu Claude Code direct pe serverul de producție. Are acces la DB
              (read + write cu confirmare), API-ul admin și skill-urile ops.
            </div>
            <div className="grid gap-2 w-full max-w-lg mt-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="text-left text-xs px-3 py-2 rounded-md border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {streaming && <TypingDots />}

        {error && (
          <div className="text-xs rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 whitespace-pre-wrap">
            {error}
            {/login|autent|api key|credit/i.test(error) && (
              <div className="mt-1 text-muted-foreground">
                Probabil Claude nu e logat încă — comută pe <b>Terminal</b>, rulează{' '}
                <code className="bg-secondary px-1 rounded">claude</code> și fă <code className="bg-secondary px-1 rounded">/login</code> o singură dată.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 flex gap-2 items-end">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={streaming ? 'Claude lucrează…' : 'Scrie ce vrei să facă (Enter trimite, Shift+Enter rând nou)'}
          disabled={streaming}
          rows={2}
          className="resize-none"
        />
        <Button onClick={() => void send()} disabled={streaming || !input.trim()} className="shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 border border-primary/25 px-3.5 py-2.5 text-sm whitespace-pre-wrap">
          {msg.items[0]?.kind === 'text' ? msg.items[0].text : ''}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5">
      <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-to-br from-primary to-amber-300 flex items-center justify-center mt-0.5">
        <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
      </div>
      <div className="max-w-[85%] min-w-0 space-y-1.5">
        {msg.items.map((item, i) =>
          item.kind === 'tool' ? (
            <div
              key={i}
              className="inline-flex max-w-full items-center gap-1.5 text-[11px] font-mono bg-secondary/70 border border-border rounded-md px-2 py-1 text-muted-foreground mr-1.5"
              title={item.detail}
            >
              <Wrench className="h-3 w-3 shrink-0 text-primary/70" />
              <span className="font-semibold shrink-0">{item.name}</span>
              {item.detail && <span className="truncate">{item.detail}</span>}
            </div>
          ) : (
            <RichText key={i} text={item.text} />
          ),
        )}
      </div>
    </div>
  );
}

/** Rendering minimal: code fences → <pre>, `inline` → <code>, **bold** → <strong>. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/```(?:\w+)?\n?/);
  return (
    <div className="text-sm leading-relaxed space-y-2">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="bg-[#0a0606] text-[#e8e3d8] border border-border rounded-md p-3 text-xs overflow-x-auto whitespace-pre"
          >
            {part.replace(/\n$/, '')}
          </pre>
        ) : (
          <InlineText key={i} text={part} />
        ),
      )}
    </div>
  );
}

function InlineText({ text }: { text: string }) {
  if (!text.trim()) return null;
  // Tokenizare simplă pe `code` și **bold** — suficient pentru răspunsuri ops.
  const tokens = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return (
    <p className="whitespace-pre-wrap break-words">
      {tokens.map((t, i) => {
        if (t.startsWith('`') && t.endsWith('`')) {
          return (
            <code key={i} className="bg-secondary px-1 py-0.5 rounded text-[0.85em] font-mono">
              {t.slice(1, -1)}
            </code>
          );
        }
        if (t.startsWith('**') && t.endsWith('**')) {
          return <strong key={i}>{t.slice(2, -2)}</strong>;
        }
        return t;
      })}
    </p>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-2.5 items-center">
      <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-to-br from-primary to-amber-300 flex items-center justify-center opacity-70">
        <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
      </div>
      <div className="flex gap-1 px-3 py-2.5">
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce"
            style={{ animationDelay: `${d * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
