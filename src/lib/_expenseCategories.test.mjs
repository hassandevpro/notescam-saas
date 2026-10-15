// Test — référentiel des catégories de dépenses.
//
//   node src/lib/_expenseCategories.test.mjs
//
// L'enjeu n'est pas la liste elle-même (c'est de la donnée) mais la règle de
// COMPATIBILITÉ : passer d'un texte libre à une liste déroulante ne doit jamais
// faire disparaître une valeur déjà saisie par une école.
import {
  EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, EXPENSE_SUBCATEGORY_LABELS,
  categoryOptions, subcategoryOptions, subcategoriesOf, usedValues,
  isKnownCategory, categoryLabel, subcategoryLabel, LIBRE,
} from './expenseCategories.js';

let failed = 0;
const ok = (cond, label) => {
  if (cond) console.log('✅', label);
  else { failed++; console.error('❌', label); }
};
const values = (opts) => opts.map((o) => o.value);

// ── 1. Intégrité du référentiel ──────────────────────────────────────────────
ok(EXPENSE_CATEGORIES.length >= 10, '1. au moins 10 catégories');
ok(new Set(EXPENSE_CATEGORIES.map((c) => c.key)).size === EXPENSE_CATEGORIES.length,
  '2. aucune clé de catégorie dupliquée');

const manqueCat = EXPENSE_CATEGORIES.filter((c) => !EXPENSE_CATEGORY_LABELS[c.key]);
ok(manqueCat.length === 0, `3. chaque catégorie a son libellé (${manqueCat.map((c) => c.key)})`);

const toutesSubs = EXPENSE_CATEGORIES.flatMap((c) => c.subs);
const manqueSub = toutesSubs.filter((s) => !EXPENSE_SUBCATEGORY_LABELS[s]);
ok(manqueSub.length === 0, `4. chaque sous-catégorie a son libellé (${manqueSub})`);

ok(new Set(toutesSubs).size === toutesSubs.length,
  '5. aucune sous-catégorie partagée entre deux catégories (le lien reste univoque)');

const malTraduit = [...Object.entries(EXPENSE_CATEGORY_LABELS), ...Object.entries(EXPENSE_SUBCATEGORY_LABELS)]
  .filter(([, v]) => !Array.isArray(v) || v.length !== 3 || v.some((x) => !x));
ok(malTraduit.length === 0, `6. tous les libellés portent les 3 langues (${malTraduit.map(([k]) => k)})`);

ok(!isKnownCategory(LIBRE), '7. la sentinelle de saisie libre n’est pas une catégorie stockable');

// ── 2. Relevé des valeurs employées ──────────────────────────────────────────
const depenses = [
  { category: 'energie_eau', subcategory: 'electricite' },   // référentiel
  { category: 'ELEC',        subcategory: 'compteur' },      // ancienne saisie libre
  { category: 'ELEC',        subcategory: 'compteur' },      // doublon
  { category: 'cantine',     subcategory: 'riz en sac' },    // sous-catégorie maison
  { category: '',            subcategory: 'sans categorie' },
  { category: '  ',          subcategory: '  ' },            // vide après trim
];
const u = usedValues(depenses);
ok(u.categories.has('ELEC') && u.categories.has('cantine') && !u.categories.has(''),
  '8. catégories employées relevées, les vides écartées');
ok(u.subsByCategory.get('ELEC').size === 1, '9. doublons dédupliqués');
ok(u.subsOrphelines.has('sans categorie'), '10. sous-catégorie sans catégorie conservée à part');

// ── 3. Compatibilité : rien de déjà saisi ne disparaît ───────────────────────
const catOpts = categoryOptions(depenses);
ok(values(catOpts).includes('ELEC'), '11. une catégorie hors référentiel reste proposée');
ok(values(catOpts).includes('energie_eau'), '12. le référentiel est proposé');
ok(catOpts.find((o) => o.value === 'ELEC').known === false, '13. elle est marquée « hors référentiel »');
ok(values(catOpts).indexOf('personnel') < values(catOpts).indexOf('ELEC'),
  '14. le référentiel passe avant les valeurs maison');

const catOrphelin = categoryOptions([], 'VIEILLE_RUBRIQUE');
ok(values(catOrphelin).includes('VIEILLE_RUBRIQUE'),
  '15. la valeur de la dépense en cours est proposée même si plus personne ne l’emploie');

// ── 4. Sous-catégories : dépendantes de la catégorie ─────────────────────────
const subCantine = subcategoryOptions(depenses, 'cantine');
ok(values(subCantine).includes('denrees'), '16. sous-catégories du référentiel pour « cantine »');
ok(values(subCantine).includes('riz en sac'), '17. sous-catégorie maison de « cantine » conservée');
ok(!values(subCantine).includes('compteur'),
  '18. une sous-catégorie employée sous une AUTRE catégorie n’est pas proposée ici');

const subElec = subcategoryOptions(depenses, 'ELEC');
ok(values(subElec).includes('compteur') && values(subElec).length === 1,
  '19. catégorie hors référentiel : seules ses propres sous-catégories sont proposées');

ok(subcategoriesOf('inconnue').length === 0, '20. catégorie inconnue → aucune sous-catégorie du référentiel');
ok(values(subcategoryOptions([], 'cantine', 'ma valeur')).includes('ma valeur'),
  '21. la sous-catégorie de la dépense en cours est toujours proposée');

// ── 5. Libellés ──────────────────────────────────────────────────────────────
ok(categoryLabel('cantine')[0] === 'Cantine', '22. libellé FR d’une catégorie connue');
ok(categoryLabel('ELEC') === null, '23. valeur hors référentiel → pas de libellé (affichée telle quelle)');
ok(subcategoryLabel('electricite')[1] === 'Electricity', '24. libellé EN d’une sous-catégorie');

console.log(failed === 0 ? '\n✅ Référentiel des catégories de dépenses OK' : `\n❌ ${failed} échec(s)`);
process.exit(failed === 0 ? 0 : 1);
