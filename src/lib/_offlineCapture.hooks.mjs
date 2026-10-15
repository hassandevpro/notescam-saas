// Résolveur pour _offlineCapture.test.mjs.
//
//   node --experimental-loader ./src/lib/_offlineCapture.hooks.mjs src/lib/_offlineCapture.test.mjs
//
// `localClient.js` n'importe RIEN : il se teste donc tel quel. Un seul obstacle,
// `import.meta.env`, qui est une construction de Vite et vaut `undefined` sous
// Node — y lire `.VITE_LAN_API_BASE` lèverait avant la première ligne utile.
// Le hook `load` réécrit donc cette seule expression vers une globale que le
// test contrôle. Le reste du fichier est exécuté SANS MODIFICATION : c'est bien
// le code livré aux écoles qui est mis à l'épreuve.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function load(url, context, next) {
  if (url.endsWith('/localClient.js')) {
    const src = await readFile(fileURLToPath(url), 'utf8');
    return {
      format: 'module',
      shortCircuit: true,
      source: src.replace(/import\.meta\.env/g, '(globalThis.__viteEnv)'),
    };
  }
  return next(url, context);
}

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw err;
    for (const suffix of ['.js', '.jsx', '/index.js']) {
      try { return await next(specifier + suffix, context); } catch { /* candidat suivant */ }
    }
    throw err;
  }
}
