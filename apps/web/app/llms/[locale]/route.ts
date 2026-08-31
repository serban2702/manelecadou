/**
 * `/llms/<locale>.txt` — același fișier, în oricare dintre limbile livrate.
 *
 * Ruta e `[locale]`, nu `llms-[locale].txt`: Next.js nu suportă segmente
 * PARȚIAL dinamice (`prefix-[param]`), deci extensia intră în valoarea
 * parametrului și o tăiem aici. Acceptăm și forma fără extensie (`/llms/bg`),
 * ca un link scris de mână să nu dea 404.
 */
import { isLocale } from '@/i18n/locales';
import { llmsTxtResponse } from '@/lib/llms-response';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<Response> {
  const { locale: raw } = await params;
  const locale = raw.replace(/\.txt$/i, '');
  if (!isLocale(locale)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return llmsTxtResponse(locale);
}
