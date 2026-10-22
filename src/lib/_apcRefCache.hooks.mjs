// Résolveur de doublures pour _apcRefCache.test.mjs.
//
//   node --experimental-loader ./src/lib/_apcRefCache.hooks.mjs src/lib/_apcRefCache.test.mjs
//
// Deux modules doivent être doublés : `./supabase` (qui choisit son client
// d'après `import.meta.env`, absent hors de Vite) et `./edition` (même raison,
// et `IS_LAN` coupe court à tout calcul d'empreinte).
//
// La doublure de Supabase est un constructeur de requêtes qui ENREGISTRE ce
// qu'on lui demande, parce que c'est précisément ce que le test vérifie :
//   · le FILTRE par école est-il posé sur les tables à lignes maison ?
//   · combien de lignes l'empreinte compte-t-elle, et pour quelle école ?
//
//   globalThis.__tables  : { [table]: [lignes] } — ce que la base contient
//   globalThis.__appels  : [{ table, filtres: [...], head: bool }] dans l'ordre
//   globalThis.__echecs  : { [table]: true } pour simuler une table illisible
const STUBS = {
  './edition': 'export const IS_LAN = false; export const EDITION = "cloud";',
  './supabase': `
    globalThis.__tables = globalThis.__tables || {};
    globalThis.__appels = globalThis.__appels || [];
    globalThis.__echecs = globalThis.__echecs || {};

    const lignes = (table) => globalThis.__tables[table] || [];

    function builder(table, trace) {
      // Chaque filtre est NOTÉ puis APPLIQUÉ : le test lit la trace pour
      // vérifier qu'un filtre d'école existe, et les données pour vérifier
      // qu'il porte.
      const b = {
        _rows: lignes(table),
        eq(col, val) { trace.filtres.push(\`eq:\${col}=\${val}\`); b._rows = b._rows.filter((r) => r[col] === val); return b; },
        in(col, vals) { trace.filtres.push(\`in:\${col}\`); b._rows = b._rows.filter((r) => vals.includes(r[col])); return b; },
        order() { return b; },
        or(expr) {
          trace.filtres.push(\`or:\${expr}\`);
          // On n'interprète qu'une forme, celle que le produit émet :
          // « school_id.is.null,school_id.eq.<id> ».
          const m = /^school_id\\.is\\.null,school_id\\.eq\\.(.+)$/.exec(expr);
          if (m) b._rows = b._rows.filter((r) => r.school_id == null || r.school_id === m[1]);
          return b;
        },
        then(resoudre, rejeter) {
          if (globalThis.__echecs[table]) {
            return Promise.resolve({ data: null, count: null, error: { message: 'illisible ' + table } })
              .then(resoudre, rejeter);
          }
          return Promise.resolve({ data: b._rows, count: b._rows.length, error: null }).then(resoudre, rejeter);
        },
      };
      return b;
    }

    export const supabase = {
      from: (table) => ({
        select: (_cols, opts) => {
          const trace = { table, filtres: [], head: !!(opts && opts.head) };
          globalThis.__appels.push(trace);
          return builder(table, trace);
        },
      }),
    };`,
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
