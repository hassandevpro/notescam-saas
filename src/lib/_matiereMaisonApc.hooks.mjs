// Doublure pour _matiereMaisonApc.test.mjs.
//
//   node --experimental-loader ./src/lib/_matiereMaisonApc.hooks.mjs src/lib/_matiereMaisonApc.test.mjs
//
// `referentielEcole.js` tire `./supabase`, qui choisit son client d'apres
// `import.meta.env` — absent hors de Vite. `addMatiereMaisonApc` ECRIT trois
// tables : la doublure les ENREGISTRE, puisque c'est precisement ce que le test
// verifie (les trois lignes posees, et le `school_id` sur chacune, sans lequel
// la RLS les refuserait comme tentative d'ecrire du national).
//
//   globalThis.__ecrits : [{ table, rows }] dans l'ordre d'ecriture
//   globalThis.__refus  : { [table]: true } pour simuler un refus de la base
const STUBS = {
  './supabase': `
    globalThis.__ecrits = globalThis.__ecrits || [];
    globalThis.__refus  = globalThis.__refus  || {};
    export const supabase = {
      from: (table) => ({
        upsert: async (rows) => {
          if (globalThis.__refus[table]) return { error: { message: 'refus ' + table } };
          globalThis.__ecrits.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
          return { error: null };
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
