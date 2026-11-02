// Vue « liste de lignes » de la page Budgets — fonctions PURES.
//
// Avec 65 lignes, la page doit se parcourir : états (prête / à compléter / active),
// motifs de blocage groupés, recherche, tri, activation en lot. Rien ici ne
// décide d'une règle budgétaire : l'état d'une ligne vient des anomalies que
// `activationErrors` (budgetLinesEngine) a déjà calculées ; le serveur reste
// l'autorité à l'activation.
import { activationErrors, annualCommittedAmount } from './budgetLinesEngine.js';
import { flattenLines } from './budgetSummary.js';

// ── État d'une ligne ─────────────────────────────────────────────────────────
// `errs` = codes d'anomalie d'activation (vide = prête). Seul un brouillon peut
// être « à compléter » ou « prêt » ; actif et clôturé n'ont rien à compléter.
export function lineState(status, errs = []) {
  if (status === 'active') return 'active';
  if (status === 'closed') return 'closed';
  return errs.length ? 'todo' : 'ready';
}

export const STATE_FILTERS = ['all', 'todo', 'ready', 'active', 'closed'];

// Compteurs par état. `errsOf(node)` → codes d'anomalie du nœud-ligne.
export function countByState(lines, errsOf) {
  const c = { all: lines.length, todo: 0, ready: 0, active: 0, closed: 0 };
  for (const l of lines) c[lineState(l.status, errsOf(l))] += 1;
  return c;
}

// Motifs de blocage groupés. Une ligne peut cumuler plusieurs motifs : le total
// de lignes « à compléter » est donc le nombre de lignes DISTINCTES, jamais la
// somme des motifs.
export function blockerGroups(lines, errsOf) {
  const byCode = new Map();
  const todoIds = new Set();
  for (const l of lines) {
    if (l.status !== 'draft' && l.status != null) continue;
    const errs = errsOf(l);
    if (!errs.length) continue;
    todoIds.add(l.id);
    for (const code of new Set(errs)) {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(l.id);
    }
  }
  const groups = [...byCode.entries()]
    .map(([code, ids]) => ({ code, count: ids.length, ids }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  return { groups, todoCount: todoIds.size };
}

// ── Parcours en 5 étapes ─────────────────────────────────────────────────────
// Périodes → Rubriques et lignes → Répartition → Activation → Dépenses.
// L'étape EN COURS est la première non terminée.
export function computeSteps({ periodCount = 0, lineCount = 0, todoCount = 0, readyCount = 0, activeCount = 0 } = {}) {
  const done = [
    periodCount > 0,
    lineCount > 0,
    lineCount > 0 && todoCount === 0,
    lineCount > 0 && todoCount === 0 && readyCount === 0,
    activeCount > 0,
  ];
  const keys = ['periods', 'lines', 'allocation', 'activation', 'expenses'];
  let currentSet = false;
  return keys.map((key, i) => {
    let state = 'todo';
    if (done[i]) state = 'done';
    else if (!currentSet) { state = 'current'; currentSet = true; }
    return { key, state };
  });
}

// ── Recherche, filtres, tri ──────────────────────────────────────────────────
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Applique recherche / état / motif / tri à l'arbre de `computeBudget`.
// Une rubrique est conservée si elle contient une ligne retenue (ou si son
// propre libellé correspond à la recherche : on garde alors toutes ses lignes
// qui passent les autres filtres). Les totaux d'une rubrique restent ceux de
// la rubrique entière : ils ne dépendent pas du filtre.
export function filterTree(tree, { query = '', state = 'all', blocker = null, sort = 'order' } = {}, errsOf = () => []) {
  const q = fold(query);
  const keepLine = (l, rubriqueMatches) => {
    if (state !== 'all' && lineState(l.status, errsOf(l)) !== state) return false;
    if (blocker && !errsOf(l).includes(blocker)) return false;
    if (q && !rubriqueMatches && !fold(l.label).includes(q)) return false;
    return true;
  };
  const sorter = sort === 'amountDesc' ? (a, b) => num(b.consumption?.ceiling) - num(a.consumption?.ceiling)
    : sort === 'amountAsc' ? (a, b) => num(a.consumption?.ceiling) - num(b.consumption?.ceiling) : null;
  const sortList = (list) => (sorter ? [...list].sort(sorter) : list);

  const out = [];
  const rootLines = [];
  for (const node of tree) {
    if (node.isLine) { if (keepLine(node, false)) rootLines.push(node); continue; }
    const matches = !!q && fold(node.label).includes(q);
    const kids = sortList((node.children || []).filter((k) => (k.isLine ? keepLine(k, matches) : true)));
    if (kids.length) out.push({ ...node, children: kids });
  }
  return [...out, ...sortList(rootLines)];
}

function num(v) { return Number(v) || 0; }

export function hasActiveFilters({ query = '', state = 'all', blocker = null } = {}) {
  return !!(query.trim() || state !== 'all' || blocker);
}

// ── Activation en lot ────────────────────────────────────────────────────────
// `candidates` = lignes brutes (budget_chapters) en brouillon que l'écran juge
// prêtes, dans l'ordre d'affichage. On les passe UNE PAR UNE dans le contrôle du
// moteur, en comptant comme déjà activées celles retenues avant elles : le
// plafond annuel est cumulatif, et c'est ce que le serveur appliquera.
export function planBulkActivation({ candidates = [], annual, chapters = [], idx }) {
  const accepted = [];
  const excluded = [];
  const takenIds = new Set();
  for (const raw of candidates) {
    const current = chapters.map((c) => (takenIds.has(c.id) ? { ...c, status: 'active' } : c));
    const errs = activationErrors(raw, annual, current, idx);
    if (errs.length) excluded.push({ id: raw.id, label: raw.label, errs });
    else { accepted.push(raw); takenIds.add(raw.id); }
  }
  const total = accepted.reduce((s, l) => s + num(l.planned_amount), 0);
  const envelope = num(annual?.envelope_amount);
  const alreadyActive = annualCommittedAmount(chapters);
  return { accepted, excluded, total, envelope, alreadyActive, remaining: envelope - alreadyActive - total };
}

export { flattenLines };
