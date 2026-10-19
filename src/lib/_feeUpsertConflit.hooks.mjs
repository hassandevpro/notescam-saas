// Résolveur de doublures pour _feeUpsertConflit.test.mjs.
//
//   node --experimental-loader ./src/lib/_feeUpsertConflit.hooks.mjs src/lib/_feeUpsertConflit.test.mjs
//
// `schoolService.js` tire `./supabase`, qui choisit le client (cloud ou LAN)
// d'après `import.meta.env` — absent hors de Vite. La doublure délègue à
// `globalThis.__supabaseDouble` à CHAQUE appel (et non au chargement), pour que
// le test puisse changer de base entre deux cas.
const STUBS = {
  './supabase': 'export const supabase = { from: (...a) => globalThis.__supabaseDouble.from(...a) };',
};

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) {
    return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
  }
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
