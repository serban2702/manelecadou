import type { GenerationDto } from '@/lib/api';

/** Sender from wizard (`De la X`), never the recipient stuffed into dedication. */
export function senderOf(
  g: Pick<GenerationDto, 'recipientName' | 'message' | 'dedication'> & { dedicatorName?: string | null },
): string | null {
  const rec = (g.recipientName ?? '').trim();
  const named = (g.dedicatorName ?? '').trim();
  if (named && named !== rec && named !== '—') return named;
  const m = g.message?.match(/(?:^|\n)\s*De la\s+(.+?)\s*$/im);
  const fromMsg = m?.[1]?.trim();
  if (fromMsg && fromMsg !== rec && fromMsg !== '—') return fromMsg;
  const d = (g.dedication ?? '').trim();
  if (d && d !== rec && d !== '—') return d;
  return null;
}

export function displayRecipient(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n || n === '—') return 'tine';
  return n;
}
