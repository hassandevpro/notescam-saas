// Moteur PUR du module DÉPENSES (aucune dépendance : testable en Node).
//
// Une dépense est TOUJOURS rattachée à un budget (via son chapitre budgétaire).
// Le « budget restant » n'est JAMAIS stocké : il est recalculé à la lecture
// (planifié − engagé), donc toujours juste, jamais désynchronisé.
//
// Réutilise le moteur Budgets (computeBudgetTotals) pour le planifié.
import { computeBudgetTotals, chapterRollup, childrenIndex } from './budgetEngine.js';

// ── Statuts & cycle de vie ────────────────────────────────────────────────────
export const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'paid', 'rejected'];

// Statuts qui ENGAGENT le budget (comptent dans le « consommé »). Un brouillon ou
// une dépense rejetée ne consomment rien.
export const COMMITTING_STATUSES = ['submitted', 'approved', 'paid'];
export function isCommitting(status) { return COMMITTING_STATUSES.includes(status); }

// Transitions autorisées du circuit de la dépense.
const TRANSITIONS = {
  draft:     ['submitted'],
  submitted: ['approved', 'rejected', 'draft'], // approbation / rejet / retrait
  approved:  ['paid', 'rejected'],
  rejected:  ['draft'],                          // reprise
  paid:      [],                                 // terminal
};
export function canTransition(from, to) { return (TRANSITIONS[from] || []).includes(to); }
export function isExpenseLocked(expense) { return expense?.status === 'paid'; }

// ── Consommation & reste ──────────────────────────────────────────────────────

// Montant engagé par chapitre (id -> total des dépenses « committing »).
export function spentByChapter(expenses = [], { onlyCommitting = true } = {}) {
  const map = new Map();
  for (const e of expenses) {
    if (onlyCommitting && !isCommitting(e.status)) continue;
    const key = e.budget_chapter_id || null;
    map.set(key, (map.get(key) || 0) + (Number(e.amount) || 0));
  }
  return map;
}

// Total engagé sur un budget (toutes lignes « committing »).
export function totalSpent(expenses = [], opts) {
  let s = 0;
  for (const [, v] of spentByChapter(expenses, opts)) s += v;
  return s;
}

// Reste consolidé d'un chapitre : planifié (sous-arbre) − engagé (sous-arbre).
export function chapterRemaining(chapter, chapters = [], expenses = []) {
  const { amountOf, childrenByParent } = chapterRollup(chapters);
  const spent = spentByChapter(expenses);
  const spentSubtree = (c) => {
    const kids = childrenByParent.get(c.id);
    const own = spent.get(c.id) || 0;
    if (kids && kids.length) return own + kids.reduce((s, k) => s + spentSubtree(k), 0);
    return own;
  };
  const planned = amountOf(chapter);
  const used = spentSubtree(chapter);
  return { planned, spent: used, remaining: planned - used };
}

// Synthèse d'un budget : recettes / dépenses prévues + engagé + RESTE à dépenser.
// C'est le « budget restant » recalculé automatiquement demandé.
export function budgetConsumption(chapters = [], expenses = []) {
  const totals = computeBudgetTotals(chapters);
  const spent = totalSpent(expenses);
  return {
    recettes: totals.recettes,
    depensesPrevues: totals.depenses,
    engage: spent,
    reste: totals.depenses - spent,       // budget de dépenses restant
    tauxConsommation: totals.depenses > 0 ? Math.round((spent / totals.depenses) * 100) : 0,
    depassement: spent > totals.depenses, // alerte dépassement
  };
}

// ── Rattachement automatique à un budget ──────────────────────────────────────
// Dérive le budget_id d'une dépense depuis le chapitre choisi (source de vérité).
export function resolveBudgetId(chapter) { return chapter?.budget_id || null; }

// ── Analyse HIÉRARCHIQUE : budget alloué / engagé / reste / % par nœud ─────────
// Arbre Catégorie → Chapitre → Sous-chapitre avec, pour CHAQUE nœud : alloué
// (planifié consolidé des feuilles), engagé (dépenses « committing » du sous-arbre),
// reste et taux d'exécution. Base des tableaux de bord par catégorie/chapitre/
// sous-chapitre.
const LEVELS = ['category', 'chapter', 'subchapter'];
export function hierarchyRollup(chapters = [], expenses = []) {
  const { amountOf } = chapterRollup(chapters);         // planifié consolidé (feuilles)
  const spent = spentByChapter(expenses);               // engagé par feuille
  const { byParent } = childrenIndex(chapters);
  const sortFn = (a, b) => ((a.position || 0) - (b.position || 0)) || String(a.label || '').localeCompare(String(b.label || ''));
  const spentSubtree = (c) => {
    const kids = byParent.get(c.id);
    const own = spent.get(c.id) || 0;
    return (kids && kids.length) ? own + kids.reduce((s, k) => s + spentSubtree(k), 0) : own;
  };
  const build = (node, depth) => {
    const planned = amountOf(node);
    const engage = spentSubtree(node);
    return {
      id: node.id, label: node.label, kind: node.kind,
      level: node.level || LEVELS[Math.min(depth, 2)],
      planned, engage, reste: planned - engage,
      taux: planned > 0 ? Math.round((engage / planned) * 100) : 0,
      depassement: engage > planned,
      children: (byParent.get(node.id) || []).slice().sort(sortFn).map((k) => build(k, depth + 1)),
    };
  };
  return (byParent.get('__root__') || []).slice().sort(sortFn).map((n) => build(n, 0));
}

// Aplatit l'arbre par niveau (pour un tableau « par catégorie / chapitre / sous-chapitre »).
export function flattenByLevel(tree = []) {
  const out = { category: [], chapter: [], subchapter: [] };
  const walk = (nodes) => { for (const n of nodes) { (out[n.level] || out.subchapter).push(n); walk(n.children || []); } };
  walk(tree);
  return out;
}

// ── Déblocage d'une ligne épuisée ─────────────────────────────────────────────
// Une demande de déblocage suit : pending -> refused | authorized | increased.
//   • increased  : le planifié du chapitre est augmenté (permanent) ;
//   • authorized : autorisation EXCEPTIONNELLE (relève le plafond sans toucher au
//                  budget prévu — tracée à part) ;
//   • refused    : sans effet.
export const UNLOCK_STATUSES = ['pending', 'refused', 'authorized', 'increased'];
export function isUnlockDecided(status) { return status && status !== 'pending'; }

// Somme des autorisations EXCEPTIONNELLES accordées par chapitre.
export function authorizedAllowanceByChapter(requests = []) {
  const map = new Map();
  for (const r of requests) {
    if (r.status !== 'authorized') continue;
    const key = r.budget_chapter_id || null;
    map.set(key, (map.get(key) || 0) + (Number(r.granted_amount) || 0));
  }
  return map;
}

// Disponibilité consolidée d'un chapitre : planifié (+ autorisations exception.)
// − engagé, sur tout le sous-arbre. `excludeExpenseId` retire une dépense en
// cours d'édition du calcul (pour re-tester le nouveau montant).
export function chapterAvailability(chapter, chapters = [], expenses = [], requests = [], { excludeExpenseId = null } = {}) {
  const { amountOf, childrenByParent } = chapterRollup(chapters);
  const kept = excludeExpenseId ? expenses.filter((e) => e.id !== excludeExpenseId) : expenses;
  const spent = spentByChapter(kept);
  const allow = authorizedAllowanceByChapter(requests);
  const subtree = (c, m) => {
    const kids = childrenByParent.get(c.id);
    const own = m.get(c.id) || 0;
    if (kids && kids.length) return own + kids.reduce((s, k) => s + subtree(k, m), 0);
    return own;
  };
  const planned = amountOf(chapter);
  const exceptional = subtree(chapter, allow);
  const used = subtree(chapter, spent);
  return { planned, exceptional, spent: used, available: planned + exceptional - used };
}

export function isChapterExhausted(chapter, chapters, expenses, requests) {
  return chapterAvailability(chapter, chapters, expenses, requests).available <= 0;
}

// Un montant dépasserait-il le disponible de la ligne ? (blocage d'une dépense)
export function wouldExceed(chapter, amount, chapters, expenses, requests, opts) {
  const { available } = chapterAvailability(chapter, chapters, expenses, requests, opts);
  return (Number(amount) || 0) > available;
}
