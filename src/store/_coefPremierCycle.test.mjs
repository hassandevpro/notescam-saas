// LE CÂBLAGE DU COEFFICIENT DE PREMIER CYCLE
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Signalé le 2026-10-24 : « corrige le défaut de coef du premier cycle : quand
// on crée une matière et qu'on ajoute le coef, ça revient à 1 automatiquement,
// même quand on choisit un coef plus élevé ».
//
// Le premier cycle ne lit PAS `subjects.coef`. `coefFor` (core/apcEngine) lit
// `apc_classe_matieres.coefficient`, puis `apc_matieres.coefficient`, puis 1.
// Le coefficient saisi par l'école n'allait que dans `subjects`, et l'écran de
// création ne le passait même pas à l'action qui écrit le référentiel : la
// ligne naissait donc à 1, et le bulletin affichait 1.
//
// Ce test est un test de CÂBLAGE. La logique d'écriture est prouvée par
// `_matiereMaisonApc.test.mjs` ; ici on fige que l'ÉCRAN la fait appeler — la
// leçon du 2026-10-22, où une correction complète dormait dans le magasin sans
// qu'aucun écran ne l'appelle (« vu du dehors, rien ne change »).
//
//   node src/store/_coefPremierCycle.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ICI = dirname(fileURLToPath(import.meta.url));
const store   = readFileSync(join(ICI, 'schoolStore.js'), 'utf8');
const classes = readFileSync(join(ICI, '..', 'pages', 'Classes.jsx'), 'utf8');
const engine  = readFileSync(join(ICI, '..', 'core', 'apcEngine.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

titre('La règle de lecture est bien celle qu’on croit (la cause racine)');
{
  const i = engine.indexOf('export const coefFor');
  const corps = i > 0 ? engine.slice(i, i + 400) : '';
  ok(i > 0, 'coefFor existe dans le moteur APC');
  ok(/classeMatieres/.test(corps) && /matiere\?\.coefficient/.test(corps),
    'il lit la ligne (classe, matière) puis la matière — jamais subjects.coef');
  ok(!/subjects/.test(corps), 'subjects.coef n’entre pas dans le calcul du premier cycle');
}

titre('L’écran de création PASSE le coefficient saisi');
{
  // Jusqu'au `);` de fin d'instruction : les arguments contiennent eux-mêmes
  // des parenthèses (`name.trim()`), qu'une classe de caractères couperait.
  const appels = [...classes.matchAll(/materialiserMatiereOfficielle\((.*?)\);/g)].map((m) => m[1]);
  ok(appels.length === 2, 'les deux chemins de création (touche Entrée et bouton) sont là', appels.length);
  ok(appels.every((a) => /customSubject\.coef/.test(a)),
    'chacun passe le coefficient saisi par l’école', appels);
  ok(appels.every((a) => /\|\| 1/.test(a)),
    'avec un repli à 1 si le champ est vide (jamais 0 : la matière sortirait de la moyenne)', appels);
}

titre('Le magasin accepte le coefficient et le transmet');
{
  const i = store.indexOf('materialiserMatiereOfficielle: async');
  const corps = store.slice(i, store.indexOf('rattacherMatiereOfficielle:', i));
  ok(/materialiserMatiereOfficielle: async \(cls, nom, coef = 1\)/.test(store),
    'la signature porte le coefficient');
  ok(/coef: Number\(coef\) > 0 \? Number\(coef\) : 1/.test(corps),
    'il est transmis à addMatiereMaisonApc, assaini (> 0, sinon 1)');
}

titre('Corriger le coefficient APRÈS COUP atteint aussi le référentiel');
{
  ok(/majCoefMatiereApc: async \(cls, nom, coef\)/.test(store),
    'l’action existe dans le magasin');
  const i = store.indexOf('majCoefMatiereApc: async');
  const corps = store.slice(i, store.indexOf('updateSubject: async', i));
  ok(/if \(!matiere\.school_id\) return \{ error: 'nationale' \}/.test(corps),
    'une matière NATIONALE est refusée : sa ligne appartient au référentiel MINESEC');
  ok(/majCoefMatiereMaisonApc\(/.test(corps), 'elle délègue l’écriture à la couche Supabase');
  ok(/apcReferentiel: s\.apcReferentiel &&/.test(corps),
    'et le référentiel en mémoire suit, sans retélécharger');

  // LE CÂBLAGE qui compte : c'est `updateSubject` que l'écran appelle.
  const j = store.indexOf('updateSubject: async');
  const upd = store.slice(j, store.indexOf('deleteSubject: async', j));
  ok(/data\.coef !== undefined/.test(upd), 'updateSubject voit un changement de coefficient');
  ok(/majCoefMatiereApc\(cls, record\.name, data\.coef\)/.test(upd),
    'et le propage au référentiel du premier cycle');
  ok(/resolveClassEngine\(school, cls\) === 'apc'/.test(upd),
    'uniquement pour une classe de premier cycle');
  ok(upd.indexOf('majCoefMatiereApc') > upd.indexOf('subjectsDB.put'),
    'APRÈS l’écriture de subjects : le geste de l’école est enregistré quoi qu’il arrive ensuite');
  ok(/'nationale'/.test(upd),
    'et le cas national est DIT à l’école, au lieu d’être accepté en silence');
}

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
