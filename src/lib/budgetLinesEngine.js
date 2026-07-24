// Moteur PUR du modèle budgétaire CIBLE v3 (E2) — aucune I/O, testable en Node.
//
// Modèle : Budget ANNUEL global → RUBRIQUES → LIGNES (budget_chapters). La LIGNE
// (feuille, `scope` renseigné) porte le MONTANT ANNUEL (`planned_amount`) et se
// répartit selon DEUX vecteurs INDÉPENDANTS :
//   • temporel  → budget_line_periods (% par période)               — toujours ;
//   • sectoriel → budget_line_sectors (% par secteur)               — si scope='sectors'.
// L'utilisateur saisit les POURCENTAGES ; le moteur DÉRIVE les montants. Le
// « disponible » n'est JAMAIS stocké : recalculé (plafond − engagé) à la lecture.
//
// Les agrégats supérieurs (période globale, secteur global, annuel) sont CALCULÉS
// depuis les lignes/dépenses (jamais stockés) → aucun double comptage. Miroir
// applicatif des gardes DB (server/budget-lines.sql) et de l'enforcement E3.
//
// Réutilise le moteur Dépenses (pas de règle dupliquée) : statuts engageants et
// autorisations exceptionnelles de déblocage.

import { isCommitting, authorizedAllowanceByChapter } from './expenseEngine.js';

const EPS = 0.01;                                   // tolérance sur les sommes de %
const pctAmount = (base, pct) => Math.round(((Number(base) || 0) * (Number(pct) || 0)) / 100);
const near100 = (sum) => Math.abs((Number(sum) || 0) - 100) <= EPS;

// ── Identification des nœuds ─────────────────────────────────────────────────
// Une LIGNE budgétaire = chapitre dont la portée est définie (feuille configurée).
// Une RUBRIQUE = nœud d'agrégation (scope non défini).
export function isLine(chapter) { return chapter?.scope === 'complex' || chapter?.scope === 'sectors'; }
export const lines = (chapters = []) => chapters.filter(isLine);

// ── Indexation des allocations par ligne ─────────────────────────────────────
export function indexAllocations(periodAllocs = [], sectorAllocs = []) {
  const byLinePeriod = new Map();  // lineId -> [alloc période]
  const byLineSector = new Map();  // lineId -> [alloc secteur]
  for (const a of periodAllocs) {
    if (!byLinePeriod.has(a.budget_chapter_id)) byLinePeriod.set(a.budget_chapter_id, []);
    byLinePeriod.get(a.budget_chapter_id).push(a);
  }
  for (const a of sectorAllocs) {
    if (!byLineSector.has(a.budget_chapter_id)) byLineSector.set(a.budget_chapter_id, []);
    byLineSector.get(a.budget_chapter_id).push(a);
  }
  return { byLinePeriod, byLineSector };
}
const periodAllocsOf = (lineId, idx) => idx.byLinePeriod.get(lineId) || [];
const sectorAllocsOf = (lineId, idx) => idx.byLineSector.get(lineId) || [];

// ── Montants dérivés des % ───────────────────────────────────────────────────
// Montant temporel d'une ligne pour une période (part du montant annuel).
export function linePeriodAmount(line, periodAlloc) { return pctAmount(line?.planned_amount, periodAlloc?.pct); }
// Montant sectoriel d'une ligne pour un secteur (part du montant annuel).
export function lineSectorAmount(line, sectorAlloc) { return pctAmount(line?.planned_amount, sectorAlloc?.pct); }
// Cellule fine ligne × période × secteur (part croisée du montant annuel).
export function cellAmount(line, periodPct, sectorPct = 100) {
  const base = Number(line?.planned_amount) || 0;
  return Math.round((base * (Number(periodPct) || 0) * (Number(sectorPct) || 0)) / 10000);
}

// ── Contrôles des 100 % ──────────────────────────────────────────────────────
export function periodPctTotal(lineId, idx) { return periodAllocsOf(lineId, idx).reduce((s, a) => s + (Number(a.pct) || 0), 0); }
export function sectorPctTotal(lineId, idx) { return sectorAllocsOf(lineId, idx).reduce((s, a) => s + (Number(a.pct) || 0), 0); }

// Secteurs AUTORISÉS par une ligne (ids d'unités portant une allocation sectorielle).
export function lineSectorIds(lineId, idx) { return new Set(sectorAllocsOf(lineId, idx).map((a) => a.school_unit_id)); }

// Anomalies de configuration d'une ligne (vide = prête à activer). Miroir de la
// garde d'activation DB + arbitrage métier (montant défini, pas de % négatif, etc.).
export function lineAllocationErrors(line, idx) {
  const out = [];
  if (!isLine(line)) { out.push('not_a_line'); return out; }
  const amount = Number(line.planned_amount) || 0;
  const pAllocs = periodAllocsOf(line.id, idx);
  const sAllocs = sectorAllocsOf(line.id, idx);

  if (amount <= 0) out.push('amount_missing');
  if (pAllocs.some((a) => Number(a.pct) < 0)) out.push('period_pct_negative');
  if (sAllocs.some((a) => Number(a.pct) < 0)) out.push('sector_pct_negative');
  if (pAllocs.length === 0) out.push('period_alloc_missing');
  if (!near100(periodPctTotal(line.id, idx))) out.push('period_pct_not_100');

  if (line.scope === 'sectors') {
    if (sAllocs.length === 0) out.push('sector_alloc_missing');
    if (!near100(sectorPctTotal(line.id, idx))) out.push('sector_pct_not_100');
  } else if (sAllocs.length > 0) {
    out.push('sector_alloc_on_complex'); // portée complexe : aucune allocation sectorielle attendue
  }
  return out;
}

// Une ligne est-elle activable ? (configuration complète et cohérente)
export function canActivateLine(line, idx) { return lineAllocationErrors(line, idx).length === 0; }

// ── Cycle de vie d'une ligne ─────────────────────────────────────────────────
export const isLineDraft  = (line) => (line?.status || 'draft') === 'draft';
export const isLineActive = (line) => line?.status === 'active';
export const isLineClosed = (line) => line?.status === 'closed';
// Une ligne n'accepte des dépenses (engagement) QUE si elle est active.
export function lineEngageable(line) { return isLineActive(line); }

// Statut DÉRIVÉ du budget annuel (jamais stocké, sauf 'closed' = clôture explicite).
// Une ligne clôturée a TERMINÉ son cycle (draft→active→closed) : elle compte comme
// FINALISÉE (jamais de régression vers `partial` quand une ligne active se clôture).
//   draft   : uniquement des lignes brouillon (aucune finalisée) ;
//   partial : mélange brouillon + finalisées (active/closed) ;
//   active  : toutes les lignes finalisées (active ou closed) ;
//   closed  : exercice clôturé (état explicite de l'annuel).
export function annualStatus(annual, chapters = []) {
  if (annual?.status === 'closed') return 'closed';
  const ls = lines(chapters);
  if (ls.length === 0) return 'draft';
  const finalized = ls.filter((l) => isLineActive(l) || isLineClosed(l)).length;
  if (finalized === 0) return 'draft';
  if (finalized === ls.length) return 'active';
  return 'partial';
}

// ── Plafond ANNUEL FERME à l'activation ──────────────────────────────────────
// Σ des montants annuels des lignes déjà FINALISÉES (active + closed) — base du
// contrôle « aucune combinaison de lignes activées ne dépasse le budget annuel ».
export function annualCommittedAmount(chapters = [], { excludeLineId = null } = {}) {
  return lines(chapters)
    .filter((l) => l.id !== excludeLineId && (isLineActive(l) || isLineClosed(l)))
    .reduce((s, l) => s + (Number(l.planned_amount) || 0), 0);
}
// Marge encore activable de l'enveloppe annuelle (hors la ligne considérée).
export function annualActivationRoom(annual, chapters = [], { excludeLineId = null } = {}) {
  return (Number(annual?.envelope_amount) || 0) - annualCommittedAmount(chapters, { excludeLineId });
}
// Le montant de la ligne tient-il dans la marge annuelle restante ?
export function canActivateLineAnnual(line, annual, chapters = []) {
  return (Number(line?.planned_amount) || 0) <= annualActivationRoom(annual, chapters, { excludeLineId: line?.id });
}
// Anomalies TOTALES d'activation d'une ligne : configuration (Σ=100…) + plafond annuel.
export function activationErrors(line, annual, chapters, idx) {
  const out = lineAllocationErrors(line, idx);
  if (annual && !canActivateLineAnnual(line, annual, chapters)) out.push('annual_cap_exceeded');
  return out;
}

// ── Engagé / payé (les dépenses portent budget_chapter_id + budget_period_id + school_unit_id) ──
const committingAmount = (e) => (isCommitting(e.status) ? (Number(e.amount) || 0) : 0);
const paidAmount = (e) => (e.status === 'paid' ? (Number(e.amount) || 0) : 0);

// Somme filtrée (engagé/payé) sur les dépenses vérifiant `pred`, avec exclusion
// optionnelle d'une dépense en cours d'édition (re-test du nouveau montant).
function sumExpenses(expenses, pred, pick, excludeExpenseId) {
  let s = 0;
  for (const e of expenses) {
    if (excludeExpenseId && e.id === excludeExpenseId) continue;
    if (!pred(e)) continue;
    s += pick(e);
  }
  return s;
}

// Consommation d'une LIGNE (plafond = montant annuel + autorisations exceptionnelles).
export function lineConsumption(line, { expenses = [], requests = [], excludeExpenseId = null } = {}) {
  const exceptional = authorizedAllowanceByChapter(requests).get(line.id) || 0;
  const ceiling = (Number(line.planned_amount) || 0) + exceptional;
  const onLine = (e) => e.budget_chapter_id === line.id;
  const committed = sumExpenses(expenses, (e) => onLine(e) && isCommitting(e.status), committingAmount, excludeExpenseId);
  const paid = sumExpenses(expenses, (e) => onLine(e) && e.status === 'paid', paidAmount, excludeExpenseId);
  return metrics(ceiling, committed, paid);
}

// Consommation d'une CELLULE ligne × période (plafond = part temporelle de la ligne).
export function linePeriodConsumption(line, periodId, idx, { expenses = [], excludeExpenseId = null } = {}) {
  const alloc = periodAllocsOf(line.id, idx).find((a) => a.budget_period_id === periodId) || null;
  const ceiling = alloc ? linePeriodAmount(line, alloc) : 0;
  const match = (e) => e.budget_chapter_id === line.id && e.budget_period_id === periodId && isCommitting(e.status);
  const committed = sumExpenses(expenses, match, committingAmount, excludeExpenseId);
  const paid = sumExpenses(expenses, (e) => e.budget_chapter_id === line.id && e.budget_period_id === periodId && e.status === 'paid', paidAmount, excludeExpenseId);
  return metrics(ceiling, committed, paid);
}

// Consommation d'une CELLULE ligne × secteur (plafond = part sectorielle de la ligne).
export function lineSectorConsumption(line, sectorId, idx, { expenses = [], excludeExpenseId = null } = {}) {
  const alloc = sectorAllocsOf(line.id, idx).find((a) => a.school_unit_id === sectorId) || null;
  const ceiling = alloc ? lineSectorAmount(line, alloc) : 0;
  const match = (e) => e.budget_chapter_id === line.id && e.school_unit_id === sectorId && isCommitting(e.status);
  const committed = sumExpenses(expenses, match, committingAmount, excludeExpenseId);
  const paid = sumExpenses(expenses, (e) => e.budget_chapter_id === line.id && e.school_unit_id === sectorId && e.status === 'paid', paidAmount, excludeExpenseId);
  return metrics(ceiling, committed, paid);
}

// Agrégat PÉRIODE (tous secteurs, toutes lignes) : plafond = Σ parts temporelles des lignes.
export function periodTotals(chapters, periodId, idx, { expenses = [] } = {}) {
  const ceiling = lines(chapters).reduce((s, l) => {
    const a = periodAllocsOf(l.id, idx).find((x) => x.budget_period_id === periodId);
    return s + (a ? linePeriodAmount(l, a) : 0);
  }, 0);
  const committed = sumExpenses(expenses, (e) => e.budget_period_id === periodId && isCommitting(e.status), committingAmount);
  const paid = sumExpenses(expenses, (e) => e.budget_period_id === periodId && e.status === 'paid', paidAmount);
  return metrics(ceiling, committed, paid);
}

// Agrégat SECTEUR (toutes lignes sectorielles, toutes périodes) : plafond = Σ parts sectorielles.
export function sectorTotals(chapters, sectorId, idx, { expenses = [] } = {}) {
  const ceiling = lines(chapters).reduce((s, l) => {
    const a = sectorAllocsOf(l.id, idx).find((x) => x.school_unit_id === sectorId);
    return s + (a ? lineSectorAmount(l, a) : 0);
  }, 0);
  const committed = sumExpenses(expenses, (e) => e.school_unit_id === sectorId && isCommitting(e.status), committingAmount);
  const paid = sumExpenses(expenses, (e) => e.school_unit_id === sectorId && e.status === 'paid', paidAmount);
  return metrics(ceiling, committed, paid);
}

// Agrégat ANNUEL : plafond = enveloppe globale ; engagé/payé = toutes les dépenses.
export function annualConsumption(annual, { expenses = [], excludeExpenseId = null } = {}) {
  const ceiling = Number(annual?.envelope_amount) || 0;
  const committed = sumExpenses(expenses, (e) => isCommitting(e.status), committingAmount, excludeExpenseId);
  const paid = sumExpenses(expenses, (e) => e.status === 'paid', paidAmount, excludeExpenseId);
  return metrics(ceiling, committed, paid);
}

function metrics(ceiling, committed, paid) {
  return {
    ceiling, committed, paid,
    aPayer: Math.max(0, committed - paid),
    available: ceiling - committed,
    taux: ceiling > 0 ? Math.round((committed / ceiling) * 100) : 0,
    depassement: committed > ceiling,
  };
}

// ── Période budgétaire DÉRIVÉE de la date de la dépense ───────────────────────
// La période n'est JAMAIS choisie manuellement : elle est déterminée par la DATE
// effective de la dépense (jamais la date du jour). Règle : start_date ≤ date ≤
// end_date (inclusif, conforme à la spec métier). 0 période couvrant la date →
// erreur `no_period` ; plusieurs → erreur de configuration `overlap`.
export function resolvePeriodForDate(periods = [], dateISO) {
  if (!dateISO) return { period: null, error: 'no_date' };
  const covering = periods.filter((p) => p.start_date && p.end_date && p.start_date <= dateISO && dateISO <= p.end_date);
  if (covering.length === 0) return { period: null, error: 'no_period' };
  if (covering.length > 1) return { period: null, error: 'overlap' };
  return { period: covering[0], error: null };
}

// ── Imputation d'une dépense : cohérence secteur/période/ligne (prédicats E3) ──
// Erreurs d'imputation (vide = imputation valide). `sectorId` NULL = Complexe/Global.
export function expenseImputationErrors(line, { periodId = null, sectorId = null }, idx) {
  const out = [];
  if (!isLine(line)) { out.push('not_a_line'); return out; }
  if (!lineEngageable(line)) out.push('line_not_active');            // brouillon/clôturée ⇒ pas d'engagement
  // Période : la ligne doit être répartie sur cette période.
  if (!periodId) out.push('period_required');
  else if (!periodAllocsOf(line.id, idx).some((a) => a.budget_period_id === periodId)) out.push('period_not_allocated');
  // Secteur : global (NULL) toujours permis ; sinon doit appartenir aux secteurs autorisés.
  if (sectorId != null && !lineSectorIds(line.id, idx).has(sectorId)) out.push('sector_not_allowed');
  return out;
}
export function canImputeExpense(line, imputation, idx) { return expenseImputationErrors(line, imputation, idx).length === 0; }

// ── Chaîne de dépassement (maillon contraignant) — préparée pour l'enforcement E3 ──
// Disponible à CHAQUE maillon applicable pour une dépense (ligne, période, secteur,
// annuel) ; le maillon au disponible minimal est CONTRAIGNANT. Une dépense ne peut
// jamais dépasser ce minimum → aucune enveloppe contournée (§10).
export function chainAvailability({ line, periodId = null, sectorId = null, annual = null, idx, expenses = [], requests = [], excludeExpenseId = null }) {
  const opts = { expenses, excludeExpenseId };
  const levels = [];
  if (line) levels.push({ level: 'line', available: lineConsumption(line, { expenses, requests, excludeExpenseId }).available });
  if (line && periodId) levels.push({ level: 'period', available: linePeriodConsumption(line, periodId, idx, opts).available });
  if (line && sectorId != null) levels.push({ level: 'sector', available: lineSectorConsumption(line, sectorId, idx, opts).available });
  if (annual) levels.push({ level: 'annual', available: annualConsumption(annual, { expenses, excludeExpenseId }).available });

  const binding = levels.length
    ? levels.reduce((min, l) => (l.available < min.available ? l : min))
    : { level: null, available: 0 };
  const byLevel = Object.fromEntries(levels.map((l) => [l.level, l.available]));
  return { levels, binding, byLevel };
}

// Verdict d'engagement d'une dépense : autorisée SSI le montant ne dépasse AUCUN
// maillon ET l'imputation est cohérente. Renvoie le niveau bloquant pour l'UI/E3.
export function checkExpense({ amount, line, periodId = null, sectorId = null, annual = null, idx, expenses = [], requests = [], excludeExpenseId = null }) {
  const requested = Number(amount) || 0;
  const imputationErrors = expenseImputationErrors(line, { periodId, sectorId }, idx);
  const chain = chainAvailability({ line, periodId, sectorId, annual, idx, expenses, requests, excludeExpenseId });
  const withinChain = requested <= chain.binding.available;
  const ok = imputationErrors.length === 0 && withinChain;
  return {
    ok,
    requested,
    available: chain.binding.available,
    blockingLevel: imputationErrors.length ? 'imputation' : (withinChain ? null : chain.binding.level),
    imputationErrors,
    overBy: withinChain ? 0 : requested - chain.binding.available,
    chain,
  };
}

// ── Arbre annoté complet (base UI E4 / dashboard E6) ─────────────────────────
// Rubriques → lignes avec consommation + état de configuration/activation. Les
// totaux ne comptent QUE les lignes (feuilles) → pas de double comptage.
export function computeBudget(annual, chapters = [], { periodAllocs = [], sectorAllocs = [], periods = [], expenses = [], requests = [] } = {}) {
  const idx = indexAllocations(periodAllocs, sectorAllocs);
  const byParent = new Map();
  for (const c of chapters) {
    const k = c.parent_id || '__root__';
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(c);
  }
  const sortFn = (a, b) => ((a.position || 0) - (b.position || 0)) || String(a.label || '').localeCompare(String(b.label || ''));
  const build = (node) => {
    const line = isLine(node);
    const cons = line ? lineConsumption(node, { expenses, requests }) : null;
    const kids = (byParent.get(node.id) || []).slice().sort(sortFn).map(build);
    // Rubrique : agrège la consommation de ses lignes descendantes.
    const agg = line ? cons : kids.reduce((acc, k) => ({
      ceiling: acc.ceiling + (k.consumption?.ceiling || 0),
      committed: acc.committed + (k.consumption?.committed || 0),
      paid: acc.paid + (k.consumption?.paid || 0),
    }), { ceiling: 0, committed: 0, paid: 0 });
    return {
      id: node.id, label: node.label, kind: node.kind, position: node.position,
      isLine: line, scope: node.scope || null, status: node.status || 'draft',
      periodPct: line ? periodPctTotal(node.id, idx) : null,
      sectorPct: line && node.scope === 'sectors' ? sectorPctTotal(node.id, idx) : null,
      activationErrors: line ? lineAllocationErrors(node, idx) : [],
      consumption: line ? cons : metrics(agg.ceiling, agg.committed, agg.paid),
      children: kids,
    };
  };
  const tree = (byParent.get('__root__') || []).slice().sort(sortFn).map(build);
  return {
    annual: { id: annual?.id, label: annual?.label, envelope_amount: Number(annual?.envelope_amount) || 0,
      status: annualStatus(annual, chapters), storedStatus: annual?.status || 'draft',
      consumption: annualConsumption(annual, { expenses }) },
    periods: periods.map((p) => ({ id: p.id, name: p.name, position: p.position, ...periodTotals(chapters, p.id, idx, { expenses }) })),
    tree,
  };
}
