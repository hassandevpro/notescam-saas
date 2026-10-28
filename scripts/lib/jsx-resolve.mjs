// Résolveur ESM « à la Vite » + TRANSPILATION JSX, pour exécuter les COMPOSANTS
// de src/ dans Node.
//
// `esm-resolve.mjs` suffit aux modules purs (moteurs, services) : il ne fait que
// compléter l'extension que le dépôt omet à l'import. Mais un gabarit de
// bulletin est du JSX, que Node refuse de parser. Les mesures de mise en page
// ont pourtant besoin du VRAI composant : mesurer une copie HTML écrite à la
// main ne prouve rien sur ce qui s'imprime réellement.
//
// On ajoute donc un hook `load` qui passe les .jsx par esbuild (déjà présent,
// c'est le transpileur de Vite). Même transformation que le build de production
// — `jsx: automatic`, donc aucun `import React` requis.
//
//   node --experimental-loader ./scripts/lib/jsx-resolve.mjs <script>
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:')) throw err;
    for (const suffix of ['.js', '.jsx', '.mjs', '/index.js', '/index.jsx']) {
      try { return await next(specifier + suffix, context); } catch { /* candidat suivant */ }
    }
    throw err;
  }
}

// `import.meta.env` est une invention de Vite : Node ne la connaît pas, et le
// module s'arrête sur « Cannot read properties of undefined ». Un gabarit de
// bulletin n'en a aucun besoin, mais il tire par transitivité des modules qui
// la lisent (`lib/supabase.js`). On la fait donc pointer sur un objet fourni par
// le script appelant — `globalThis.__VITE_ENV__`, posé avant le premier import.
//
// Les .js de src/ passent aussi par esbuild pour cette seule raison : sans quoi
// la substitution ne vaudrait que pour les .jsx, et c'est un .js qui lit la
// variable.
const DEFINE = { 'import.meta.env': 'globalThis.__VITE_ENV__' };
const SRC_DIR = new URL('../../src/', import.meta.url).href;

export async function load(url, context, next) {
  const estJsx = url.endsWith('.jsx');
  const estSrcJs = url.startsWith(SRC_DIR) && url.endsWith('.js');
  if (!estJsx && !estSrcJs) return next(url, context);
  const source = await readFile(fileURLToPath(url), 'utf8');
  const { code } = await esbuild.transform(source, {
    loader: estJsx ? 'jsx' : 'js',
    jsx: 'automatic',
    format: 'esm',
    sourcefile: url,
    define: DEFINE,
  });
  return { format: 'module', shortCircuit: true, source: code };
}
