/**
 * Rezolvarea de module pentru `node --test`.
 *
 * Node rulează TypeScript nativ (strip-types), dar nu știe două convenții pe
 * care le folosește tot appul: aliasul `@/*` din tsconfig și importurile fără
 * extensie. Fără hook-ul ăsta, testele ar cere ca fișierele de sursă să fie
 * scrise altfel decât restul codului — adică exact invers decât vrem.
 *
 * Alternativa era o dependență de build (ts-node/tsx) doar ca să rulăm câteva
 * teste pure. Treizeci de linii sunt mai ieftine.
 */
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '.json'];

/** `./x` → `./x.ts`, `./dir` → `./dir/index.ts`. Prima potrivire câștigă. */
function withExtension(filePath) {
  if (path.extname(filePath) && existsSync(filePath)) return filePath;
  for (const ext of EXTENSIONS) {
    if (existsSync(filePath + ext)) return filePath + ext;
  }
  for (const ext of EXTENSIONS) {
    const indexFile = path.join(filePath, `index${ext}`);
    if (existsSync(indexFile)) return indexFile;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = null;

    if (specifier.startsWith('@/')) {
      target = path.join(ROOT, specifier.slice(2));
    } else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      // `fileURLToPath`, nu `.pathname`: calea proiectului conține un spațiu,
      // iar `.pathname` îl dă percent-encodat (`%20`) — o cale care nu există.
      target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }

    if (target) {
      const resolved = withExtension(target);
      if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});
