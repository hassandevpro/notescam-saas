// PARITÉ DU CLIENT LAN : AUCUN APPEL QUE LE SERVEUR D'ÉCOLE NE SAIT PAS FAIRE
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Signalement du 2026-10-23 : « quand on essaie d'entrer les notes du primaire,
// le référentiel se charge sans cesse », puis — décisif — « la version EN LIGNE
// n'a pas le problème de chargement ».
//
// La 0.3.22 avait ajouté, pour ne plus mélanger les écoles :
//
//     q.or(`school_id.is.null,school_id.eq.${schoolId}`)
//
// `.or()` existe chez supabase-js. Il N'EXISTE PAS sur `localClient`, le client
// qui parle au serveur d'école (édition LAN). Sur un poste installé, l'appel
// levait « q.or is not a function » ; le `catch` de `fetchReferentiel` rendait
// `null` ; et comme la MÊME version changeait la clé du cache, il n'y avait
// aucun cache à peindre. Résultat : écran bloqué sur « Chargement du
// référentiel APC… », pour toujours, et la saisie du premier cycle impossible.
//
// Le dépôt connaissait le piège — feeCatalogService.js l'écrit en toutes
// lettres depuis des mois — mais RIEN ne l'empêchait. Ce test est ce
// garde-fou : tout ce qui est appelé sur une requête `supabase.from(…)` doit
// exister sur le QueryBuilder du client LAN.
//
//   node src/lib/_localClientParite.test.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ICI  = dirname(fileURLToPath(import.meta.url));
const SRC  = join(ICI, '..');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// ── Ce que le client LAN sait faire, lu dans son source ────────────────────
const lc = readFileSync(join(ICI, 'localClient.js'), 'utf8');
const classe = lc.slice(lc.indexOf('class QueryBuilder'));
const corps  = classe.slice(0, classe.indexOf('\n}\n'));
const SUPPORTEES = new Set(
  [...corps.matchAll(/^\s{2}([a-zA-Z_][\w$]*)\s*\(/gm)].map((m) => m[1]),
);
// Appels qui ne vont PAS au QueryBuilder : promesses, et le client lui-même.
const HORS_BUILDER = new Set(['then', 'catch', 'finally', 'from', 'rpc', 'channel', 'removeChannel']);

titre('Le client LAN expose bien le socle attendu');
for (const m of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'is', 'order', 'limit', 'single', 'maybeSingle']) {
  ok(SUPPORTEES.has(m), `localClient sait .${m}()`);
}
ok(!SUPPORTEES.has('or'), '.or() n’est TOUJOURS pas supporté en LAN (constat, pas un souhait)');

// ── Tous les fichiers de l'application qui parlent à supabase ──────────────
function fichiers(dir, acc = []) {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) { fichiers(p, acc); continue; }
    if (/\.(js|jsx)$/.test(nom) && !/\.test\.mjs$/.test(nom) && !/^_/.test(nom)) acc.push(p);
  }
  return acc;
}

// Une chaîne de requête = depuis `supabase.from(` (ou `client.from(`) jusqu'au
// bout de l'expression. On s'arrête au premier `;` ou `\n\n` : au-delà, les
// `.méthode(` appartiennent à autre chose.
const CHAINE = /\b(?:supabase|client|sb)\s*\n?\s*\.from\(/g;

// Les commentaires parlent DES méthodes interdites (c'est leur rôle) : on ne
// lit que du code, sinon ce test se mordrait la queue.
const sansCommentaires = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const fautes = [];
let chainesVues = 0;

for (const f of fichiers(SRC)) {
  // localClient.js EST l'implémentation : il ne s'appelle pas lui-même.
  if (f.endsWith('localClient.js')) continue;
  const code = sansCommentaires(readFileSync(f, 'utf8'));
  for (const m of code.matchAll(CHAINE)) {
    chainesVues += 1;
    const reste = code.slice(m.index);
    const finPv = reste.indexOf(';');
    const finVide = reste.indexOf('\n\n');
    const fin = Math.min(finPv < 0 ? reste.length : finPv, finVide < 0 ? reste.length : finVide);
    const chaine = reste.slice(0, fin);
    for (const appel of chaine.matchAll(/\.([a-zA-Z_][\w$]*)\s*\(/g)) {
      const nom = appel[1];
      if (HORS_BUILDER.has(nom) || SUPPORTEES.has(nom)) continue;
      // Appels de fonctions JS courantes sur les données, pas sur la requête.
      if (['map', 'filter', 'find', 'some', 'every', 'reduce', 'join', 'push', 'toISOString', 'trim', 'replace', 'split', 'slice', 'concat', 'sort', 'includes', 'startsWith', 'toLowerCase', 'toUpperCase',
        // `Promise.resolve(...)` / `Promise.all([...])` écrits DANS une chaîne.
        'resolve', 'all', 'allSettled', 'race'].includes(nom)) continue;
      fautes.push(`${f.replace(SRC, 'src')} → .${nom}()`);
    }
  }
}

titre('Aucun appel hors parité dans les chaînes de requête');
ok(chainesVues > 50, `le balayage voit bien les requêtes de l’application (${chainesVues} chaînes)`, chainesVues);
ok(fautes.length === 0,
  'toute méthode chaînée sur supabase.from(…) existe aussi sur le client LAN',
  fautes.slice(0, 12));

// ── LE TROU QUE LE BALAYAGE PAR CHAÎNE LAISSAIT ────────────────────────────
// La 0.3.22 n'appelait PAS `.or()` dans la chaîne : elle passait la requête à
// une fonction (`const sienne = (q) => q.or(…)`) qui l'appelait ailleurs. Le
// balayage ci-dessus ne l'aurait donc pas vue. On interdit donc aussi, PARTOUT
// dans l'application, les méthodes de requête que le client LAN ne connaît pas
// — quel que soit le chemin par lequel la requête y arrive.
//
// `.filter(`, `.includes(` et `.contains(` ne sont pas listées : ce sont
// d'abord des méthodes de tableau JavaScript et du DOM (`element.contains`),
// qu'on ne peut pas distinguer d'un filtre PostgREST sans analyser les types.
const INTERDITES = ['or', 'ilike', 'like', 'textSearch', 'overlaps', 'csv', 'throwOnError', 'rangeGt', 'rangeLt'];

titre('Aucune méthode inconnue du client LAN, même appelée indirectement');
{
  const trouvees = [];
  for (const f of fichiers(SRC)) {
    if (f.endsWith('localClient.js')) continue;
    const code = sansCommentaires(readFileSync(f, 'utf8'));
    for (const m of code.matchAll(/\.([a-zA-Z_][\w$]*)\s*\(/g)) {
      if (INTERDITES.includes(m[1])) trouvees.push(`${f.replace(SRC, 'src')} → .${m[1]}()`);
    }
  }
  ok(trouvees.length === 0,
    `aucun appel à .${INTERDITES.slice(0, 4).join('() / .')}()… dans src/`,
    trouvees.slice(0, 12));
}

titre('Le référentiel APC filtre l’école SANS .or()');
{
  const apc = sansCommentaires(readFileSync(join(ICI, 'apcService.js'), 'utf8'));
  ok(!/\.or\(/.test(apc), 'fetchReferentiel n’émet plus de .or()');
  ok(/school_id == null \|\| r\.school_id === schoolId/.test(apc),
    'le filtre par école est fait en JavaScript, sur les lignes reçues');
  ok(/matieres: sienne\(/.test(apc) && /classeMatieres: sienne\(/.test(apc) && /competences: sienne\(/.test(apc),
    'et il est appliqué aux TROIS familles de lignes maison');
}

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
