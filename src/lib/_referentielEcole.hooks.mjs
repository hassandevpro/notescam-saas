// Résolveur de doublures pour _referentielEcole.test.mjs.
//
//   node --experimental-loader ./src/lib/_referentielEcole.hooks.mjs src/lib/_referentielEcole.test.mjs
//
// `referentielEcole.js` tire `./supabase`, qui choisit le client (cloud ou LAN)
// d'après `import.meta.env` — absent hors de Vite.
//
// La doublure était INERTE (`supabase = {}`) : elle suffisait tant qu'on ne
// testait que `idMaison` et `codeMaison`, qui sont du calcul pur. Depuis
// `addMatiereMaisonApc`, qui ÉCRIT trois tables, il faut une doublure qui
// ENREGISTRE ce qui part — c'est tout l'objet du test : vérifier que les trois
// lignes sont bien posées, et que chacune porte son `school_id` (sans quoi la
// RLS les refuserait comme tentative d'écrire du national).
//
//   globalThis.__ecrits   : [{ table, rows }] dans l'ordre d'écriture
//   globalThis.__refus    : { [table]: true } pour simuler un refus d'écriture
//   globalThis.__existant : { [table]: [lignes] } — ce que la base contient DÉJÀ.
//                           Depuis la correction des doublons du 2026-10-21,
//                           `addMatiereMaisonApc` LIT la table avant d'écrire
//                           (recherche de la matière PAR SON NOM, côté serveur,
//                           pour ne jamais la recréer). Sans cette lecture dans
//                           la doublure, le test n'emprunte plus le chemin réel.
//   globalThis.__refusLecture : { [table]: true } pour simuler un échec de lecture
const STUBS = {
  './supabase': `
    globalThis.__ecrits   = globalThis.__ecrits   || [];
    globalThis.__refus    = globalThis.__refus    || {};
    globalThis.__existant = globalThis.__existant || {};
    globalThis.__refusLecture = globalThis.__refusLecture || {};
    export const supabase = {
      from: (table) => ({
        upsert: async (rows) => {
          if (globalThis.__refus[table]) return { error: { message: 'refus ' + table } };
          globalThis.__ecrits.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
          return { error: null };
        },
        select: () => ({
          eq: async (colonne, valeur) => {
            if (globalThis.__refusLecture[table]) return { data: null, error: { message: 'refus lecture ' + table } };
            const toutes = globalThis.__existant[table] || [];
            return { data: toutes.filter((r) => r[colonne] === valeur), error: null };
          },
        }),
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
