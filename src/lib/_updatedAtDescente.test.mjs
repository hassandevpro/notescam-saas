// UNE LIGNE SANS `updated_at` NE DESCEND JAMAIS VERS LE SERVEUR DE L'ÉCOLE
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Trouvé le 2026-10-24 en lisant le journal d'installation de la 0.3.23 sur le
// serveur de THE GENIUS. Le script de déploiement annonçait un seul échec :
// « curseur de descente TOUJOURS à … — la caisse resterait vide ». Le curseur
// n'était pas la cause : il était posé sur la SEULE écriture de caisse datée.
//
// MESURÉ DANS LA BASE DE PRODUCTION, le même jour :
//
//     prim_notes ............ 2 337 / 2 337  sans updated_at  (100 %)
//     apc_notes ............. 1 334 / 1 334  sans updated_at  (100 %)
//     mat_observations .........544 /   544  sans updated_at  (100 %)
//     budget_expenses (GENIUS) . 60 /    60  sans updated_at  (100 %)
//     cash_movements (GENIUS) .. 10 /    11  sans updated_at
//
// LA RÈGLE QUI REND CELA FATAL. La descente Cloud → école est un keyset
// `(updated_at, id)`, et `supabase/functions/sync-pull/index.ts` écarte
// EXPLICITEMENT les lignes sans date :
//
//     .not('updated_at', 'is', null)   // le keyset exige updated_at non NULL
//
// Une ligne sans `updated_at` est donc invisible POUR TOUJOURS sur le serveur
// de l'école — remettre le curseur à zéro n'y change rien, et c'est pourquoi la
// parade de I13 ne suffisait pas. La même colonne sert d'arbitre aux conflits
// (LWW, cloudSync.js:104) : `Date.parse(null)` vaut 0, donc une ligne sans date
// perd tout arbitrage.
//
//   node src/lib/_updatedAtDescente.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ICI  = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..', '..');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// ── 1. LA RÈGLE DE LA DESCENTE EST BIEN CELLE QU'ON CROIT ──────────────────
// Si un jour `sync-pull` acceptait les lignes sans date, ce test tout entier
// n'aurait plus de raison d'être : on le fige donc ici, à la source.
titre('La descente écarte les lignes sans date (c’est la cause racine)');
{
  const pull = readFileSync(join(RACINE, 'supabase', 'functions', 'sync-pull', 'index.ts'), 'utf8');
  ok(/\.not\('updated_at', 'is', null\)/.test(pull),
    'sync-pull écarte updated_at IS NULL — une ligne sans date ne descend pas');
  ok(/order\('updated_at'/.test(pull) && /order\('id'/.test(pull),
    'et le keyset est bien (updated_at, id)');
}

// ── 2. LES TROIS CONSTRUCTEURS DE NOTES POSENT LA COLONNE ──────────────────
// Ce sont les seuls écrivains de `apc_notes`, `prim_notes` et
// `mat_observations` : ce qu'ils omettent n'est posé par personne d'autre.
titre('Les trois moteurs par compétences datent ce qu’ils écrivent');
for (const [fichier, builder] of [
  ['apcService.js', 'buildNoteRecord'],
  ['primService.js', 'buildPrimNoteRecord'],
  ['matService.js', 'buildObsRecord'],
]) {
  const src = readFileSync(join(ICI, fichier), 'utf8');
  const i = src.indexOf(`export function ${builder}`);
  ok(i > 0, `${fichier} : ${builder} existe`);
  // Corps du constructeur : jusqu'à la fin de son `return { … }`.
  const corps = src.slice(i, src.indexOf('\n}', i));
  ok(/updated_at: new Date\(\)\.toISOString\(\)/.test(corps),
    `${builder} pose updated_at`);
  // `date_saisie` est la date PÉDAGOGIQUE : elle ne remplace pas l'horloge de
  // synchronisation, et la descente ne la lit pas.
  ok(/date_saisie:/.test(corps), `${builder} garde date_saisie (ce n’est pas la même chose)`);
}

// ── 3. LES DEUX ÉCRITURES D'APPLICATION LA POSAIENT DÉJÀ ───────────────────
// Vérifié pour qu'une refonte ne les perde pas : ce sont elles qui expliquent
// qu'UNE écriture de caisse sur onze était datée chez THE GENIUS.
titre('Les écritures d’application restent datées');
for (const [fichier, fn] of [['cashBookService.js', 'upsertCashMovement'], ['expenseService.js', 'upsertExpense']]) {
  const src = readFileSync(join(ICI, fichier), 'utf8');
  const i = src.indexOf(`export async function ${fn}`);
  const corps = i > 0 ? src.slice(i, i + 2000) : '';
  ok(/updated_at: new Date\(\)\.toISOString\(\)/.test(corps), `${fn} pose updated_at`);
}

// ── 4. L'IMPORT DE REPRISE NOMME LA COLONNE DANS SON INSERT ────────────────
// C'est l'origine exacte des 70 lignes invisibles de THE GENIUS : la colonne
// n'était posée que dans la branche ON CONFLICT, donc jamais au premier import.
titre('L’import de reprise date ses lignes dès le PREMIER passage');
{
  const imp = readFileSync(join(RACINE, 'scripts', 'import-caisse-genius.mjs'), 'utf8');
  // Les listes de colonnes des deux INSERT, telles qu'elles sont écrites.
  const listes = [...imp.matchAll(/INSERT INTO (budget_expenses|cash_movements) \(([^`]*?)\)`\)/gs)]
    .map((m) => ({ table: m[1], cols: m[2].replace(/\s+/g, ' ') }));
  ok(listes.length === 0 || listes.length === 2, 'les deux INSERT sont trouvés', listes.map((l) => l.table));
  // Les colonnes sont écrites sur deux `L.push` : on regarde la zone entière.
  for (const table of ['budget_expenses', 'cash_movements']) {
    const i = imp.indexOf(`INSERT INTO ${table} (`);
    const zone = imp.slice(i, imp.indexOf("L.push('VALUES')", i));
    ok(/updated_at\)/.test(zone), `${table} : updated_at est dans la liste des colonnes`);
    const vals = imp.slice(i, imp.indexOf('ON CONFLICT', i));
    ok(/now\(\)\)/.test(vals), `${table} : et une valeur now() lui correspond`);
  }
}

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
