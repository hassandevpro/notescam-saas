// Tests du moteur pur Dépenses (aucune dépendance réseau / Vite / React).
//   node src/lib/_expenseEngine.test.mjs
import {
  EXPENSE_STATUSES, COMMITTING_STATUSES, isCommitting, canTransition, isExpenseLocked,
  isCancellable, canHardDelete,
  spentByChapter, totalSpent, totalPaid, chapterRemaining, budgetConsumption, resolveBudgetId,
  UNLOCK_STATUSES, authorizedAllowanceByChapter, chapterAvailability, isChapterExhausted, wouldExceed,
} from './expenseEngine.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// --- Statuts & transitions ---------------------------------------------------
ok(EXPENSE_STATUSES.length === 6, '6 statuts de dépense (dont annulée)');
ok(isCommitting('approved') && isCommitting('paid') && isCommitting('submitted'), 'submitted/approved/paid engagent le budget');
ok(!isCommitting('draft') && !isCommitting('rejected'), 'draft/rejected n’engagent rien');
ok(!isCommitting('cancelled'), 'annulée n’engage rien (exclue des agrégats comme rejected)');
ok(canTransition('draft', 'submitted'), 'draft -> submitted');
ok(canTransition('submitted', 'approved') && canTransition('approved', 'paid'), 'circuit d’approbation');
ok(canTransition('submitted', 'rejected') && canTransition('rejected', 'draft'), 'rejet puis reprise');
ok(!canTransition('paid', 'draft'), 'payé = terminal');
ok(isExpenseLocked({ status: 'paid' }) && !isExpenseLocked({ status: 'approved' }), 'payé = verrouillé');

// --- Annulation tracée (cancelled) ------------------------------------------
ok(canTransition('submitted', 'cancelled') && canTransition('approved', 'cancelled'), 'soumise/approuvée annulables');
ok(!canTransition('cancelled', 'draft') && !canTransition('cancelled', 'paid'), 'annulée = terminal');
ok(isExpenseLocked({ status: 'cancelled' }), 'annulée = verrouillée (conservée)');
ok(isCancellable('submitted') && isCancellable('approved') && !isCancellable('paid'), 'annulable sauf payée/terminal');
ok(canHardDelete('draft') && !canHardDelete('approved') && !canHardDelete('paid'), 'suppression physique = brouillon uniquement');

// --- Rattachement automatique au budget -------------------------------------
ok(resolveBudgetId({ budget_id: 'b1' }) === 'b1', 'budget_id dérivé du chapitre');

// --- Consommation par chapitre ----------------------------------------------
{
  const expenses = [
    { budget_chapter_id: 'c1', amount: 100000, status: 'paid' },
    { budget_chapter_id: 'c1', amount: 50000,  status: 'approved' },
    { budget_chapter_id: 'c1', amount: 30000,  status: 'draft' },     // n'engage pas
    { budget_chapter_id: 'c2', amount: 20000,  status: 'submitted' },
    { budget_chapter_id: 'c2', amount: 999999, status: 'rejected' },  // n'engage pas
  ];
  const m = spentByChapter(expenses);
  ok(m.get('c1') === 150000, 'engagé chapitre c1 = 100k + 50k (brouillon exclu)');
  ok(m.get('c2') === 20000, 'engagé chapitre c2 = 20k (rejet exclu)');
  ok(totalSpent(expenses) === 170000, 'total engagé = 170k');
  ok(totalPaid(expenses) === 100000, 'total payé (décaissé) = 100k (paid uniquement)');
}

// --- Reste consolidé d'un chapitre (parent + sous-chapitres) -----------------
{
  const chapters = [
    { id: 'p', kind: 'depense', planned_amount: 0 },                       // parent (consolidé)
    { id: 'a', parent_id: 'p', kind: 'depense', planned_amount: 400000 },
    { id: 'b', parent_id: 'p', kind: 'depense', planned_amount: 200000 },
  ];
  const expenses = [
    { budget_chapter_id: 'a', amount: 100000, status: 'paid' },
    { budget_chapter_id: 'b', amount: 50000,  status: 'submitted' },
  ];
  const rem = chapterRemaining(chapters[0], chapters, expenses);
  ok(rem.planned === 600000, 'planifié parent = somme sous-chapitres (600k)');
  ok(rem.spent === 150000, 'engagé parent = somme sous-chapitres (150k)');
  ok(rem.remaining === 450000, 'reste parent = 450k');
}

// --- Budget restant (synthèse) ----------------------------------------------
{
  const chapters = [
    { id: 'r', kind: 'recette', planned_amount: 14000000 },
    { id: 'd1', kind: 'depense', planned_amount: 10000000 },
  ];
  const expenses = [
    { budget_chapter_id: 'd1', amount: 3000000, status: 'paid' },
    { budget_chapter_id: 'd1', amount: 1000000, status: 'approved' },
    { budget_chapter_id: 'd1', amount: 500000,  status: 'draft' },
  ];
  const c = budgetConsumption(chapters, expenses);
  ok(c.depensesPrevues === 10000000, 'dépenses prévues');
  ok(c.engage === 4000000, 'engagé = 4M (brouillon exclu)');
  ok(c.reste === 6000000, 'budget restant recalculé = 6M');
  ok(c.tauxConsommation === 40, 'taux de consommation = 40%');
  ok(c.depassement === false, 'pas de dépassement');

  const c2 = budgetConsumption(chapters, [{ budget_chapter_id: 'd1', amount: 11000000, status: 'paid' }]);
  ok(c2.reste === -1000000 && c2.depassement === true, 'dépassement détecté (reste négatif)');
}

// --- Épuisement de ligne + disponibilité + blocage --------------------------
{
  const chapters = [{ id: 'c1', kind: 'depense', planned_amount: 500000 }];
  const expenses = [
    { id: 'e1', budget_chapter_id: 'c1', amount: 300000, status: 'paid' },
    { id: 'e2', budget_chapter_id: 'c1', amount: 200000, status: 'approved' },
  ];
  const av = chapterAvailability(chapters[0], chapters, expenses, []);
  ok(av.available === 0, 'ligne épuisée : disponible = 0 (500k − 500k)');
  ok(isChapterExhausted(chapters[0], chapters, expenses, []), 'chapitre détecté comme épuisé');
  ok(wouldExceed(chapters[0], 1, chapters, expenses, []), 'toute nouvelle dépense dépasse -> bloquée');

  // Autorisation exceptionnelle : relève le plafond sans toucher au planifié.
  const reqs = [{ budget_chapter_id: 'c1', status: 'authorized', granted_amount: 150000 }];
  ok(authorizedAllowanceByChapter(reqs).get('c1') === 150000, 'allocation exceptionnelle cumulée');
  const av2 = chapterAvailability(chapters[0], chapters, expenses, reqs);
  ok(av2.available === 150000 && av2.planned === 500000, 'autorisation : disponible=150k, planifié inchangé');
  ok(!wouldExceed(chapters[0], 100000, chapters, expenses, reqs), 'dépense 100k autorisée après déblocage exceptionnel');

  // Édition : on exclut la dépense courante du calcul.
  ok(chapterAvailability(chapters[0], chapters, expenses, [], { excludeExpenseId: 'e2' }).available === 200000,
    'exclusion de la dépense éditée : disponible = 200k');
}
ok(UNLOCK_STATUSES.length === 4, '4 statuts de déblocage');

console.log(failed ? '\n❌ Expense engine KO' : '\n✅ Expense engine OK');
process.exit(failed ? 1 : 0);
