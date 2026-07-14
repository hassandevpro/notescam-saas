// Moteur PUR du module Budgets (aucune dépendance : testable en Node).
//
// Périmètre 1re tranche : cycle de vie des BUDGETS (création / modification /
// consultation / clôture). Le modèle est volontairement EXTENSIBLE pour les
// itérations suivantes :
//   • dépenses réelles       -> future table budget_expenses (ref budget_chapters)
//   • workflows de validation-> futures colonnes/table d'approbation
//   • rapports budgétaires   -> lecture des chapitres + (plus tard) réalisé
//
// Un budget = une ENVELOPPE prévisionnelle caractérisée par :
//   - une PÉRIODE : annuel | trimestriel | mensuel (+ un rang de période) ;
//   - un SECTEUR  : maternelle, primaire, administration, transport… (extensible) ;
//   - une STRUCTURE : chapitres budgétaires + sous-chapitres (hiérarchie 1..n) ;
//   - un STATUT   : draft (brouillon) | active (validé/en cours) | closed (clôturé).

// ── Énumérations (extensibles) ────────────────────────────────────────────────

export const BUDGET_PERIOD_TYPES = ['annuel', 'trimestriel', 'mensuel'];

// Statut = machine à états minimale de cette tranche (pas de workflow de validation
// encore : draft -> active -> closed, et réouverture closed -> active par la direction).
export const BUDGET_STATUSES = ['draft', 'active', 'closed'];

// Secteurs budgétaires par défaut. Liste ouverte : la colonne `sector` est un TEXT
// libre, ces valeurs ne sont que des suggestions d'UI (extensible sans migration).
export const BUDGET_SECTORS = [
  'general', 'maternelle', 'primaire', 'college', 'lycee',
  'administration', 'transport', 'maintenance', 'informatique',
  'cantine', 'internat',
];

// Nature d'un chapitre côté PRÉVISIONNEL (recette prévue / dépense prévue).
// NB : ce n'est PAS le suivi des dépenses réelles (déféré aux itérations suivantes).
export const BUDGET_CHAPTER_KINDS = ['recette', 'depense'];

// ── Options de rang de période ────────────────────────────────────────────────

// Rangs valides selon le type de période (trimestre 1..3, mois 1..12, aucun en annuel).
export function periodRefOptions(periodType) {
  if (periodType === 'trimestriel') return [1, 2, 3];
  if (periodType === 'mensuel') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return [];
}

// ── Hiérarchie chapitres / sous-chapitres ─────────────────────────────────────

// Indexe les enfants par parent + fournit `amountOf` (montant CONSOLIDÉ) : un
// chapitre porteur de sous-chapitres vaut la somme de ses enfants (récursif) ;
// une feuille vaut son propre `planned_amount`. Évite le double comptage.
export function chapterRollup(chapters = []) {
  const childrenByParent = new Map();
  for (const c of chapters) {
    if (c.parent_id) {
      if (!childrenByParent.has(c.parent_id)) childrenByParent.set(c.parent_id, []);
      childrenByParent.get(c.parent_id).push(c);
    }
  }
  const amountOf = (c) => {
    const kids = childrenByParent.get(c.id);
    if (kids && kids.length) return kids.reduce((s, k) => s + amountOf(k), 0);
    return Number(c.planned_amount) || 0;
  };
  return { amountOf, childrenByParent };
}

// Construit l'arbre d'affichage : [{...chapitre, children:[...sous-chapitres]}].
// Trié par `position` puis libellé. (Hiérarchie à 2 niveaux comme demandé, mais
// la structure parent_id supporte davantage sans changement de schéma.)
export function buildChapterTree(chapters = []) {
  const byParent = new Map();
  for (const c of chapters) {
    const key = c.parent_id || '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  }
  const sortFn = (a, b) =>
    ((a.position || 0) - (b.position || 0)) ||
    String(a.label || '').localeCompare(String(b.label || ''));
  const roots = (byParent.get('__root__') || []).slice().sort(sortFn);
  return roots.map((r) => ({
    ...r,
    children: (byParent.get(r.id) || []).slice().sort(sortFn),
  }));
}

// ── Hiérarchie N-niveaux (Catégorie → Chapitre → Sous-chapitre) ───────────────
// Le modèle repose sur `parent_id` (arbre). Le NIVEAU est déduit de la profondeur
// (0=category, 1=chapter, 2=subchapter) — rétro-compatible avec l'existant à
// 2 niveaux, sans migration : le champ `level` n'est qu'un cache facultatif.

export const BUDGET_LEVELS = ['category', 'chapter', 'subchapter'];

export function childrenIndex(chapters = []) {
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const byParent = new Map();
  for (const c of chapters) {
    const k = c.parent_id || '__root__';
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(c);
  }
  return { byId, byParent };
}

// Profondeur d'un noeud (0 = racine). Borne à 8 (garde anti-cycle).
export function nodeDepth(chapter, byId) {
  let d = 0, cur = chapter;
  while (cur?.parent_id && d < 8) { cur = byId.get(cur.parent_id); d++; }
  return d;
}
export function levelName(chapter, byId) {
  return BUDGET_LEVELS[Math.min(nodeDepth(chapter, byId), 2)];
}

export function isLeaf(chapter, byParent) {
  const kids = byParent.get(chapter.id);
  return !(kids && kids.length);
}

// Feuilles = points de rattachement des dépenses (« sous-chapitres » fonctionnels).
export function leafChapters(chapters = []) {
  const { byParent } = childrenIndex(chapters);
  return chapters.filter((c) => isLeaf(c, byParent));
}

// Arbre imbriqué complet [{...node, level, children:[…]}] trié par position/label.
export function buildBudgetTree(chapters = []) {
  const { byId, byParent } = childrenIndex(chapters);
  const sortFn = (a, b) => ((a.position || 0) - (b.position || 0)) || String(a.label || '').localeCompare(String(b.label || ''));
  const build = (node) => ({
    ...node,
    level: node.level || levelName(node, byId),
    children: (byParent.get(node.id) || []).slice().sort(sortFn).map(build),
  });
  return (byParent.get('__root__') || []).slice().sort(sortFn).map(build);
}

// ── Totaux prévisionnels ──────────────────────────────────────────────────────

// Total recettes / dépenses / solde. On ne somme QUE les feuilles (un chapitre
// porteur de sous-chapitres est consolidé par ses enfants -> pas de double compte).
export function computeBudgetTotals(chapters = []) {
  const { childrenByParent } = chapterRollup(chapters);
  let recettes = 0;
  let depenses = 0;
  for (const c of chapters) {
    const kids = childrenByParent.get(c.id);
    if (kids && kids.length) continue; // parent = consolidé par ses feuilles
    const amt = Number(c.planned_amount) || 0;
    if (c.kind === 'recette') recettes += amt;
    else depenses += amt;
  }
  return { recettes, depenses, solde: recettes - depenses };
}

// ── Dates d'exercice (Phase D) ────────────────────────────────────────────────
// Mois de début d'année scolaire par défaut (septembre) — surchargé par
// schools.school_year_start_month. Base multi-pays.
export const DEFAULT_SCHOOL_YEAR_START_MONTH = 9;

function clampMonth(m) { return Math.min(12, Math.max(1, Number(m) || DEFAULT_SCHOOL_YEAR_START_MONTH)); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); }

// Année de DÉBUT dérivée de l'étiquette « 2025-2026 » -> 2025.
export function academicStartYear(academicYear) {
  const y = parseInt(String(academicYear || '').slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

// Bornes effectives d'un budget. Priorité aux DATES EXPLICITES (start_date/end_date) ;
// sinon DÉRIVÉES de academic_year + period_type + period_ref + mois de début d'année
// scolaire (zéro régression pour les budgets créés avant la Phase D).
// Renvoie { start (inclusif), end (EXCLUSIF), endInclusive, source } — ou null.
export function budgetPeriodBounds(budget, startMonth = DEFAULT_SCHOOL_YEAR_START_MONTH) {
  const sm = clampMonth(startMonth);
  if (budget?.start_date && budget?.end_date) {
    const start = new Date(budget.start_date);
    const endInc = new Date(budget.end_date);
    if (!isNaN(start.getTime()) && !isNaN(endInc.getTime())) {
      const end = new Date(endInc.getFullYear(), endInc.getMonth(), endInc.getDate() + 1); // exclusif
      return { start, end, endInclusive: endInc, source: 'explicit' };
    }
  }
  const y = academicStartYear(budget?.academic_year);
  if (y == null) return null;
  const yearStart = new Date(y, sm - 1, 1);
  const type = budget?.period_type || 'annuel';
  const ref = Number(budget?.period_ref) || 1;
  let start, end;
  if (type === 'trimestriel') {          // 3 trimestres de 4 mois dans l'exercice
    start = addMonths(yearStart, (Math.min(3, Math.max(1, ref)) - 1) * 4);
    end = addMonths(start, 4);
  } else if (type === 'mensuel') {
    start = addMonths(yearStart, Math.min(12, Math.max(1, ref)) - 1);
    end = addMonths(start, 1);
  } else {                                // annuel : 12 mois pleins
    start = yearStart;
    end = addMonths(yearStart, 12);
  }
  const endInclusive = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  return { start, end, endInclusive, source: 'derived' };
}

// Libellé de plage de dates : « 01/09/2026 – 31/08/2027 » (pour l'UI et l'impression).
export function periodDatesLabel(budget, startMonth = DEFAULT_SCHOOL_YEAR_START_MONTH) {
  const bd = budgetPeriodBounds(budget, startMonth);
  if (!bd) return '';
  const f = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return `${f(bd.start)} – ${f(bd.endInclusive)}`;
}

// Durée d'un budget en jours (pour départager en cas de chevauchement).
function spanDays(budget, sm) {
  const bd = budgetPeriodBounds(budget, sm);
  return bd ? Math.round((bd.end - bd.start) / 86400000) : Infinity;
}

// Budget « en cours » à une date donnée (selon ses bornes). Préfère un budget de
// statut `active`, puis la période la PLUS COURTE (la plus spécifique).
export function getActiveBudget(budgets = [], date = new Date(), startMonth = DEFAULT_SCHOOL_YEAR_START_MONTH) {
  const t = date instanceof Date ? date : new Date(date);
  const inRange = budgets.filter((b) => {
    const bd = budgetPeriodBounds(b, startMonth);
    return bd && t >= bd.start && t < bd.end;
  });
  inRange.sort((a, b) => {
    const sa = a.status === 'active' ? 0 : 1, sb = b.status === 'active' ? 0 : 1;
    return (sa - sb) || (spanDays(a, startMonth) - spanDays(b, startMonth));
  });
  return inRange[0] || null;
}

// Deux budgets se chevauchent-ils dans le temps ? (bornes qui s'intersectent)
export function budgetsOverlap(a, b, startMonth = DEFAULT_SCHOOL_YEAR_START_MONTH) {
  const ba = budgetPeriodBounds(a, startMonth), bb = budgetPeriodBounds(b, startMonth);
  if (!ba || !bb) return false;
  return ba.start < bb.end && bb.start < ba.end;
}

// Premier budget EXISTANT (même secteur) chevauchant `candidate` — avertissement à
// la création (pas de blocage : un budget « Investissement » peut légitimement
// chevaucher l'exercice annuel, d'où le filtre par secteur).
export function findOverlappingBudget(candidate, budgets = [], startMonth = DEFAULT_SCHOOL_YEAR_START_MONTH) {
  return budgets.find((b) =>
    b.id !== candidate.id &&
    (b.sector || 'general') === (candidate.sector || 'general') &&
    budgetsOverlap(candidate, b, startMonth)) || null;
}

// ── Machine à états (statut) ──────────────────────────────────────────────────

// Transitions autorisées de cette tranche (sans workflow de validation).
const STATUS_TRANSITIONS = {
  draft: ['active'],
  active: ['closed'],
  closed: ['active'], // réouverture par la direction
};

export function canTransition(from, to) {
  return (STATUS_TRANSITIONS[from] || []).includes(to);
}

// Un budget clôturé est en LECTURE SEULE (ni édition d'entête, ni des chapitres).
export function isBudgetLocked(budget) {
  return budget?.status === 'closed';
}
