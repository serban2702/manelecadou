'use client';

import { SpaLink as Link } from '@/lib/spa-router';
import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { ro } from 'date-fns/locale';
import DOMPurify from 'dompurify';
import { Archive, ArchiveRestore, Bot, Inbox as InboxIcon, Mail, MessagesSquare, Paperclip, PenSquare, Settings2, Sparkles, Trash2, Users, Wifi, WifiOff, X } from 'lucide-react';
import { MailApi, type MailMessageRow } from '@/lib/api';
import { useAsync } from '@/lib/hooks/use-async';
import { useMailSocket } from '@/lib/inbox-ws';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/use-toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { HtmlBody } from '@/components/inbox/HtmlBody';
import { ReplyComposer } from '@/components/inbox/ReplyComposer';
import { ComposeDialog } from '@/components/inbox/ComposeDialog';
import { SuggestionBanner } from '@/components/inbox/SuggestionBanner';
import { SiteBadge } from '@/components/site-badge';
import { AssistantPanel } from '@/components/ai-assistant/AssistantPanel';
import { TranslationToggle } from '@/components/inbox/TranslationToggle';

export default function InboxPage() {
  const { toast } = useToast();
  const [activeAccountId, setActiveAccountId] = useState<string | 'all' | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [composerHtml, setComposerHtml] = useState<string>('');
  const [view, setView] = useState<'inbox' | 'archive'>('inbox');
  const [bodyMode, setBodyMode] = useState<'original' | 'ro'>('original');
  const [showAccounts, setShowAccounts] = useState(true);
  const [showAssistant, setShowAssistant] = useState(true);
  const [showReply, setShowReply] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  const { data: accounts, refetch: refetchAccounts } = useAsync(
    () => MailApi.accounts(),
    [],
    { refetchInterval: 30_000 },
  );
  useEffect(() => {
    if (activeAccountId === null && accounts && accounts.length > 0) setActiveAccountId('all');
  }, [accounts, activeAccountId]);

  const { data: messages, loading: loadingList, refetch: refetchMessages } = useAsync(
    () => MailApi.messages({
      accountId: activeAccountId && activeAccountId !== 'all' ? activeAccountId : undefined,
      q: search || undefined,
      limit: 100,
      archived: view === 'archive' ? 'true' : undefined,
    }),
    [activeAccountId, search, view],
    { enabled: activeAccountId !== null, refetchInterval: 60_000 },
  );

  const { data: detail, refetch: refetchDetail } = useAsync(
    () => activeMessageId ? MailApi.message(activeMessageId) : Promise.resolve(null as never),
    [activeMessageId],
    { enabled: !!activeMessageId, refetchInterval: 30_000 },
  );

  const { data: thread, refetch: refetchThread } = useAsync(
    () => detail?.message?.threadId
      ? MailApi.thread(detail.message.threadId)
      : detail?.message ? Promise.resolve([detail.message]) : Promise.resolve(null as never),
    [detail?.message?.threadId, detail?.message?.id],
    { enabled: !!detail?.message },
  );

  // WS live updates: declanșează refetch pe cele mai relevante când vin evenimente.
  const { connected } = useMailSocket({
    onNewMessage: () => { refetchMessages(); },
    onSuggestion: () => { refetchDetail(); refetchMessages(); },
    onAccountStatus: () => { refetchAccounts(); },
  });

  // Mark seen automat când deschizi
  useEffect(() => {
    if (detail?.message && detail.message.direction === 'in' && !detail.message.seen) {
      MailApi.messagePatch(detail.message.id, { seen: true }).then(() => {
        refetchMessages();
        refetchDetail();
      });
    }
  }, [detail?.message?.id, detail?.message?.seen, detail?.message?.direction, refetchMessages, refetchDetail]);

  const accountMap = useMemo(() => Object.fromEntries((accounts ?? []).map((a) => [a.id, a])), [accounts]);

  async function handleArchive() {
    if (!detail?.message) return;
    const ok = await confirmDialog({
      title: 'Arhivezi mesajul?',
      description: 'Atașamentele lui vor fi șterse local; textul rămâne.',
      confirmText: 'Arhivează',
    });
    if (!ok) return;
    try {
      await MailApi.archive(detail.message.id);
      toast({ variant: 'success', title: 'Mesaj arhivat', description: 'Atașamentele au fost șterse.' });
      refetchMessages();
      setActiveMessageId(null);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    }
  }

  async function handleUnarchive() {
    if (!detail?.message) return;
    try {
      await MailApi.unarchive(detail.message.id);
      toast({ variant: 'success', title: 'Mesaj dezarhivat' });
      refetchMessages();
      refetchDetail();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    }
  }

  async function handleDelete() {
    if (!detail?.message) return;
    const ok = await confirmDialog({
      title: 'Ștergi mesajul complet?',
      description: 'Atât textul cât și atașamentele vor dispărea. Acțiunea nu se poate anula local.',
      confirmText: 'Șterge',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await MailApi.deleteMessage(detail.message.id);
      toast({ variant: 'success', title: 'Mesaj șters' });
      refetchMessages();
      setActiveMessageId(null);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare', description: (e as Error).message });
    }
  }

  async function handleSend(html: string) {
    if (!detail?.message) return;
    try {
      await MailApi.reply(detail.message.id, { html });
      toast({ variant: 'success', title: 'Răspuns trimis' });
      refetchThread();
      refetchMessages();
      setComposerHtml('');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare la trimitere', description: (e as Error).message });
      throw e;
    }
  }

  if (!accounts) {
    return (
      <div className="flex gap-4">
        <Skeleton className="h-[60vh] w-56" />
        <Skeleton className="h-[60vh] flex-1" />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div>
        <Empty
          icon={<InboxIcon className="h-5 w-5" />}
          title="Niciun cont conectat"
          description="Adaugă o adresă de email ca să poți primi și răspunde la mailuri din admin."
          action={<Link href="/inbox/accounts"><Button><Settings2 className="h-4 w-4" /> Conectează un cont</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] -my-2">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Email</h1>
          {connected ? (
            <Badge variant="secondary" className="gap-1 text-emerald-500"><Wifi className="h-3 w-3" /> live</Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 text-muted-foreground"><WifiOff className="h-3 w-3" /> offline</Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <PenSquare className="h-4 w-4" /> Scrie email
          </Button>
          <PanelToggle
            active={showAccounts}
            onClick={() => setShowAccounts((v) => !v)}
            icon={<Users className="h-3.5 w-3.5" />}
            label="Conturi"
          />
          <PanelToggle
            active={showReply}
            onClick={() => setShowReply((v) => !v)}
            icon={<MessagesSquare className="h-3.5 w-3.5" />}
            label="Reply"
          />
          <PanelToggle
            active={showAssistant}
            onClick={() => setShowAssistant((v) => !v)}
            icon={<Bot className="h-3.5 w-3.5" />}
            label="AI"
          />
          <Link href="/inbox/accounts"><Button variant="outline" size="sm"><Settings2 className="h-4 w-4" /> Conturi</Button></Link>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-3">
        {/* Pane 1: accounts */}
        {showAccounts && (
        <aside className="w-56 shrink-0 flex flex-col border border-border rounded-lg overflow-hidden bg-card/40">
          <div className="px-3 py-2 border-b border-border text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-between gap-2">
            <span>Conturi</span>
            <button
              onClick={() => setShowAccounts(false)}
              className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              title="Ascunde panoul Conturi"
              aria-label="Ascunde panoul Conturi"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <button
              className={cn('w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2', activeAccountId === 'all' && 'bg-primary/10 text-primary')}
              onClick={() => { setActiveAccountId('all'); setActiveMessageId(null); }}
            >
              <InboxIcon className="h-4 w-4" />
              <span className="flex-1">Toate</span>
            </button>
            {accounts.map((a) => (
              <button
                key={a.id}
                className={cn('w-full text-left px-3 py-2 text-sm hover:bg-secondary/50 flex items-center gap-2', activeAccountId === a.id && 'bg-primary/10 text-primary')}
                onClick={() => { setActiveAccountId(a.id); setActiveMessageId(null); }}
              >
                <Mail className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{a.label}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{a.email}</div>
                  <div className="mt-0.5"><SiteBadge siteId={a.siteId} /></div>
                </div>
                {a.lastError && <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />}
              </button>
            ))}
          </div>
        </aside>
        )}

        {/* Pane 2: message list */}
        <section className="w-[360px] shrink-0 flex flex-col border border-border rounded-lg overflow-hidden bg-card/40">
          <div className="flex items-center gap-1 px-2 pt-2">
            <button
              type="button"
              onClick={() => { setView('inbox'); setActiveMessageId(null); }}
              className={cn('flex-1 text-xs px-2 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5', view === 'inbox' ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary')}
            >
              <InboxIcon className="h-3.5 w-3.5" /> Inbox
            </button>
            <button
              type="button"
              onClick={() => { setView('archive'); setActiveMessageId(null); }}
              className={cn('flex-1 text-xs px-2 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1.5', view === 'archive' ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary')}
            >
              <Archive className="h-3.5 w-3.5" /> Arhivate
            </button>
          </div>
          <div className="px-3 py-2 border-b border-border">
            <Input placeholder="Caută în mailuri..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : !messages || messages.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Niciun mesaj. Așteaptă sync sau apasă „Sincronizează" în Conturi.</div>
            ) : (
              messages.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  active={m.id === activeMessageId}
                  accountLabel={accountMap[m.accountId]?.label}
                  onClick={() => setActiveMessageId(m.id)}
                />
              ))
            )}
          </div>
        </section>

        {/* Pane 3: thread + reply */}
        <section className="flex-1 min-w-0 flex flex-col border border-border rounded-lg overflow-hidden bg-card/40">
          {!detail?.message ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Selectează un mesaj.</div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold truncate flex items-center gap-2">
                    {detail.message.subject || '(fără subiect)'}
                    <SiteBadge siteId={detail.message.siteId} />
                    {detail.message.archived && <Badge variant="outline" className="gap-1 text-xs"><Archive className="h-3 w-3" /> Arhivat</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    De la {detail.message.fromName ? `${detail.message.fromName} <${detail.message.fromAddr}>` : detail.message.fromAddr}
                    {' · '}către {detail.message.toAddrs.map((t) => t.address).join(', ')}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {detail.message.archived ? (
                    <Button variant="outline" size="sm" onClick={handleUnarchive} title="Dezarhivează">
                      <ArchiveRestore className="h-3.5 w-3.5" /> Dezarhivează
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={handleArchive} title="Arhivează (șterge atașamente, păstrează textul)">
                      <Archive className="h-3.5 w-3.5" /> Arhivează
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleDelete} title="Șterge mesajul complet" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Șterge
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {detail.suggestion && (
                  <SuggestionBanner
                    suggestion={detail.suggestion}
                    onAfterSend={() => { refetchThread(); refetchDetail(); }}
                    onAfterDismiss={() => refetchDetail()}
                    onApplyToComposer={(html) => setComposerHtml(html)}
                  />
                )}

                {(thread ?? [detail.message]).map((m) => (
                  <article key={m.id} className={cn('rounded-lg border border-border overflow-hidden', m.direction === 'out' ? 'bg-primary/5' : 'bg-background')}>
                    <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/20">
                      <div className="text-xs">
                        <span className="font-medium">{m.fromName ?? m.fromAddr}</span>
                        <span className="text-muted-foreground"> · {m.sentAt ? formatDistanceToNowStrict(new Date(m.sentAt), { locale: ro, addSuffix: true }) : ''}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TranslationToggle
                          detectedLang={m.detectedLang}
                          hasRoTranslation={!!m.bodyTextRo || !!m.bodyHtmlRo}
                          consensus={m.translationConsensus}
                          initial={bodyMode}
                          onChange={setBodyMode}
                        />
                        {m.aiGenerated && <Badge variant="secondary" className="gap-1 text-primary"><Sparkles className="h-3 w-3" /> AI</Badge>}
                        {m.direction === 'out' && <Badge variant="outline" className="text-xs">Trimis</Badge>}
                        {m.attachmentCount > 0 && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Paperclip className="h-3 w-3" /> {m.attachmentCount}
                          </Badge>
                        )}
                      </div>
                    </header>
                    <div className="px-3 py-2">
                      {bodyMode === 'ro' && (m.bodyTextRo || m.bodyHtmlRo) ? (
                        <HtmlBody html={m.bodyHtmlRo} text={m.bodyTextRo} />
                      ) : (
                        <HtmlBody html={m.bodyHtml} text={m.bodyText} />
                      )}
                    </div>
                    {m.id === detail.message.id && m.attachmentsPurged && (
                      <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                        <Archive className="h-3.5 w-3.5" />
                        Atașamentele acestui mesaj au fost șterse local (la arhivare).
                      </div>
                    )}
                    {m.id === detail.message.id && detail.attachments.length > 0 && (
                      <div className="border-t border-border px-3 py-2 flex flex-wrap gap-2">
                        {detail.attachments.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              MailApi.downloadAttachment(a.id, a.filename).catch((e) =>
                                toast({
                                  variant: 'destructive',
                                  title: 'Descărcare eșuată',
                                  description: (e as Error).message,
                                }),
                              );
                            }}
                            className="text-xs px-2 py-1 rounded-md border border-border hover:bg-secondary/50 inline-flex items-center gap-1.5"
                            title="Descarcă (atașamentul nu se randează în browser)"
                          >
                            <Paperclip className="h-3 w-3" />
                            {a.filename}
                            <span className="text-muted-foreground">({prettySize(a.size)})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>

              {detail.message.direction === 'in' && showReply && (
                <div className="border-t border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Răspunde</div>
                    <button
                      onClick={() => setShowReply(false)}
                      className="rounded-md p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      title="Ascunde composer-ul de reply"
                      aria-label="Ascunde composer-ul de reply"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <ReplyComposer
                    key={detail.message.id}
                    to={[detail.message.fromAddr ?? '']}
                    subject={replySubject(detail.message.subject)}
                    initialHtml={composerHtml || undefined}
                    quotedHtml={buildQuotedReply(detail.message)}
                    aiSuggestionHtml={detail.suggestion?.htmlReply ?? null}
                    onSend={handleSend}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Pane 4: AI Assistant — vizibil mereu, contextual pe mesajul activ */}
        {showAssistant && (
          <AssistantPanel
            contextKind="mail"
            refId={detail?.message?.id ?? null}
            detectedLang={detail?.message?.detectedLang}
            onInsertDraft={(text) => setComposerHtml(toHtmlIfPlain(text))}
            onClose={() => setShowAssistant(false)}
          />
        )}
      </div>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        accounts={accounts}
        defaultAccountId={activeAccountId && activeAccountId !== 'all' ? activeAccountId : null}
        onSent={() => { refetchMessages(); }}
      />
    </div>
  );
}

function PanelToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-secondary',
      )}
      title={`${active ? 'Ascunde' : 'Afișează'} panoul ${label}`}
      aria-pressed={active}
    >
      {icon} {label}
    </button>
  );
}

/** Acceptă text simplu și-l înfășoară în <p> ca să meargă în composer-ul HTML. */
function toHtmlIfPlain(s: string): string {
  if (/<\w+/.test(s)) return s;
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function MessageRow({ m, active, accountLabel, onClick }: { m: MailMessageRow; active: boolean; accountLabel?: string; onClick: () => void }) {
  const date = m.sentAt ?? m.receivedAt ?? m.createdAt;
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-secondary/40 transition-colors',
        active && 'bg-primary/10',
        !m.seen && m.direction === 'in' && 'border-l-2 border-l-primary',
      )}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <div className={cn('truncate text-xs flex-1', !m.seen && m.direction === 'in' && 'font-semibold')}>
          {m.direction === 'out' ? `Către: ${m.toAddrs[0]?.address ?? ''}` : (m.fromName ?? m.fromAddr ?? '')}
        </div>
        <div className="text-[10px] text-muted-foreground shrink-0">
          {date ? formatDistanceToNowStrict(new Date(date), { locale: ro }) : ''}
        </div>
      </div>
      <div className="text-xs truncate font-medium">{m.subject || '(fără subiect)'}</div>
      <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
        {m.aiGenerated && <Sparkles className="h-2.5 w-2.5 text-primary" />}
        {m.attachmentCount > 0 && <Paperclip className="h-2.5 w-2.5" />}
        <span className="truncate">{m.snippet}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <SiteBadge siteId={m.siteId} />
        {accountLabel && <span className="text-[10px] text-muted-foreground truncate">{accountLabel}</span>}
      </div>
    </button>
  );
}

function replySubject(s: string): string {
  if (!s) return 'Re:';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

function prettySize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Construiește citatul mesajului original în composer (format Gmail-style):
 * attribution + <blockquote> cu textul/html-ul curățat al mesajului.
 */
function buildQuotedReply(m: MailMessageRow): string {
  if (typeof window === 'undefined') return '';
  const when = m.sentAt ?? m.receivedAt ?? m.createdAt;
  const dateStr = when
    ? format(new Date(when), "d MMM yyyy 'la' HH:mm", { locale: ro })
    : '';
  const who = m.fromName
    ? `${escapeHtml(m.fromName)} &lt;${escapeHtml(m.fromAddr ?? '')}&gt;`
    : escapeHtml(m.fromAddr ?? 'expeditor necunoscut');
  const attribution = `Pe ${escapeHtml(dateStr)}, ${who} a scris:`;

  let bodyInner: string;
  if (m.bodyHtml && m.bodyHtml.trim()) {
    bodyInner = DOMPurify.sanitize(m.bodyHtml, {
      WHOLE_DOCUMENT: false,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed', 'meta', 'link'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    }) as string;
    // Blochează imaginile externe (rămân doar inline cid:/data:).
    bodyInner = bodyInner.replace(/<img\b[^>]*?\bsrc\s*=\s*"([^"]*)"/gi, (full, src) => {
      if (/^cid:/i.test(src) || /^data:/i.test(src)) return full;
      return full.replace(src, '');
    });
  } else if (m.bodyText && m.bodyText.trim()) {
    bodyInner = escapeHtml(m.bodyText).replace(/\n/g, '<br>');
  } else {
    bodyInner = `<em>${escapeHtml(m.snippet || '')}</em>`;
  }

  return (
    `<p></p>` +
    `<div class="mail-quote">` +
    `<p style="color:#6b7280;font-size:12px;margin:0 0 4px;">${attribution}</p>` +
    `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #d1d5db;padding-left:1ex;color:#6b7280;">` +
    bodyInner +
    `</blockquote>` +
    `</div>`
  );
}
