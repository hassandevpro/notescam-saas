// Tests de la hiérarchie budgétaire à 3 niveaux.
//   node src/lib/_budgetHierarchy.test.mjs
import { buildBudgetTree, leafChapters, levelName, childrenIndex, computeBudgetTotals } from './budgetEngine.js';
import { hierarchyRollup, flattenByLevel } from './expenseEngine.js';
import { DEFAULT_BUDGET_STRUCTURE, instantiateDefaultStructure } from './budgetDefaults.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Structure par défaut ----------------------------------------------------
ok(DEFAULT_BUDGET_STRUCTURE.length === 5, '5 catégories par défaut');
ok(DEFAULT_BUDGET_STRUCTURE[0].label === 'Fonctionnement' && DEFAULT_BUDGET_STRUCTURE[0].chapters.includes('Salaires'), 'Fonctionnement → Salaires');
{
  let n = 0; const uid = () => `id${++n}`;
  const rows = instantiateDefaultStructure({ schoolId: 's1', budgetId: 'b1', uid });
  const cats = rows.filter((r) => r.level === 'category');
  const chaps = rows.filter((r) => r.level === 'chapter');
  ok(cats.length === 5, 'instanciation : 5 catégories');
  ok(chaps.every((c) => cats.some((k) => k.id === c.parent_id)), 'chaque chapitre rattaché à une catégorie');
  ok(chaps.length === DEFAULT_BUDGET_STRUCTURE.reduce((s, c) => s + c.chapters.length, 0), 'tous les chapitres instanciés');
  ok(rows.every((r) => r.budget_id === 'b1' && r.kind === 'depense'), 'toutes les lignes rattachées au budget, en dépense');
}

// --- Arbre 3 niveaux + niveaux dérivés de la profondeur ---------------------
const chapters = [
  { id: 'cat', budget_id: 'b', kind: 'depense', planned_amount: 0, position: 0 },                       // catégorie
  { id: 'ch',  budget_id: 'b', parent_id: 'cat', kind: 'depense', planned_amount: 0, position: 0 },      // chapitre
  { id: 'sc1', budget_id: 'b', parent_id: 'ch', kind: 'depense', planned_amount: 300000, position: 0 },  // sous-chapitre (feuille)
  { id: 'sc2', budget_id: 'b', parent_id: 'ch', kind: 'depense', planned_amount: 200000, position: 1 },  // sous-chapitre (feuille)
];
const { byId } = childrenIndex(chapters);
ok(levelName(chapters[0], byId) === 'category' && levelName(chapters[1], byId) === 'chapter' && levelName(chapters[2], byId) === 'subchapter', 'niveaux déduits de la profondeur');
const tree = buildBudgetTree(chapters);
ok(tree.length === 1 && tree[0].children[0].children.length === 2, 'arbre imbriqué sur 3 niveaux');
ok(leafChapters(chapters).map((c) => c.id).sort().join(',') === 'sc1,sc2', 'feuilles = sous-chapitres');

// --- Totaux : ne comptent que les feuilles (pas de double compte) ------------
ok(computeBudgetTotals(chapters).depenses === 500000, 'total dépenses = somme des feuilles (300k+200k)');

// --- Rollup hiérarchique : alloué / engagé / reste / taux --------------------
{
  const expenses = [
    { budget_chapter_id: 'sc1', amount: 150000, status: 'paid' },
    { budget_chapter_id: 'sc2', amount: 50000, status: 'approved' },
    { budget_chapter_id: 'sc1', amount: 999, status: 'draft' }, // n'engage pas
  ];
  const roll = hierarchyRollup(chapters, expenses);
  const cat = roll[0], ch = cat.children[0], sc1 = ch.children[0];
  ok(cat.planned === 500000 && cat.engage === 200000 && cat.reste === 300000, 'catégorie : alloué/engagé/reste consolidés');
  ok(cat.taux === 40, 'catégorie : taux d’exécution 40%');
  ok(ch.planned === 500000 && ch.engage === 200000, 'chapitre : rollup de ses sous-chapitres');
  ok(sc1.planned === 300000 && sc1.engage === 150000 && sc1.taux === 50, 'sous-chapitre : valeurs propres');

  const flat = flattenByLevel(roll);
  ok(flat.category.length === 1 && flat.chapter.length === 1 && flat.subchapter.length === 2, 'aplatissement par niveau');
}

// --- Rétro-compatibilité : ancien modèle 2 niveaux fonctionne toujours -------
{
  const old = [
    { id: 'x', kind: 'depense', planned_amount: 0 },
    { id: 'x1', parent_id: 'x', kind: 'depense', planned_amount: 100000 },
    { id: 'y', kind: 'depense', planned_amount: 40000 }, // feuille de 1er niveau (ancien)
  ];
  ok(computeBudgetTotals(old).depenses === 140000, 'ancien 2 niveaux : total = 140k');
  ok(leafChapters(old).map((c) => c.id).sort().join(',') === 'x1,y', 'ancien : feuilles = x1 + y');
}

console.log(failed ? '\n❌ Budget hierarchy KO' : '\n✅ Budget hierarchy OK');
process.exit(failed ? 1 : 0);
