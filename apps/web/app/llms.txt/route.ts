/**
 * `/llms.txt` — în limba site-ului. Variantele traduse: `/llms/<locale>.txt`.
 */
import { llmsTxtResponse } from '@/lib/llms-response';

// Fișierul depinde de Host (tenantul) și de configul citit din API la fiecare
// cerere — nu poate fi prerandat la build, când niciun Host nu e cunoscut.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return llmsTxtResponse();
}
