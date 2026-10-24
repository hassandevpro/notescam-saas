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
//   globalThis.__ecrits   : [{ table, rows }] dans l'ordre d'ecriture
//   globalThis.__refus    : { [table]: true } pour simuler un refus d'ecriture
//   globalThis.__existant : { [table]: [lignes] } — ce que la base contient DEJA.
//                           Depuis la correction des doublons, addMatiereMaisonApc
//                           LIT la table avant d'ecrire (recherche par nom cote
//                           serveur) : sans cette lecture, la doublure ne
//                           reproduirait plus le chemin reel.
//   globalThis.__refusLecture : { [table]: true } pour simuler un echec de lecture
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
        // UPDATE … .eq() … .eq() : chaine filtrante ET « thenable », comme
        // supabase-js. Ajoutee pour majCoefMatiereMaisonApc, qui MET A JOUR une
        // ligne existante au lieu d'en ecrire une nouvelle — c'est la seule
        // facon de ne toucher QUE la ligne de l'ecole.
        update: (patch) => {
          const filtres = {};
          const chaine = {
            eq(colonne, valeur) { filtres[colonne] = valeur; return chaine; },
            then(resolve) {
              if (globalThis.__refus[table]) return resolve({ error: { message: 'refus ' + table } });
              globalThis.__ecrits.push({ table, action: 'update', rows: [patch], filtres });
              return resolve({ error: null });
            },
          };
          return chaine;
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
