// Moteur PUR du journal de caisse. Aucune I/O, aucune dépendance React.
//
// Il répond à une seule question : « que contient cette caisse, et pourquoi ? »
// en lisant DEUX sources qui ne se recoupent pas :
//   • `cash_movements`  → ce qui entre, ce qui est reporté, ce qui est retiré ;
//   • `budget_expenses` → ce qui sort en dépense (seule source de vérité des
//                         dépenses : rien n'en est recopié dans le journal).
// Une dépense enregistrée une fois est donc comptée une fois.

// ── Natures de mouvement ────────────────────────────────────────────────────
export const MOVEMENT_KINDS = ['report', 'approvisionnement', 'recette_diverse',
  'transfert_entrant', 'transfert_sortant', 'retrait'];

// UN REPORT N'EST PAS UNE RECETTE. Il reprend le solde de la période précédente :
// il POSITIONNE le solde d'ouverture, il ne l'augmente pas. D'où sa place à part
// dans les trois prédicats ci-dessous — c'est la règle comptable la plus facile à
// enfreindre, et celle qui gonfle le plus les totaux quand on l'enfreint.
export const isOpening = (kind) => kind === 'report';
export const isEntry = (kind) => kind === 'approvisionnement' || kind === 'recette_diverse' || kind === 'transfert_entrant';
export const isExit = (kind) => kind === 'transfert_sortant' || kind === 'retrait';

// Effet d'un mouvement sur le solde : +1 entrée, −1 sortie, 0 report (le report
// ne bouge pas le solde, il l'ÉTABLIT — cf. `openingOf`).
export function movementEffect(kind) {
  if (isEntry(kind)) return 1;
  if (isExit(kind)) return -1;
  return 0;
}

// ── Quelles dépenses ont réellement QUITTÉ la caisse ────────────────────────
// Une dépense engagée (submitted/approved) est un ENGAGEMENT : l'argent est
// réservé mais encore dans le tiroir. Seul `paid` l'en a fait sortir. Compter
// les engagements ferait apparaître un solde plus bas que l'espèce réellement
// présente — et un contrôle de caisse en échec permanent.
export const CASH_OUT_STATUSES = ['paid'];
export const isCashOut = (expense) => CASH_OUT_STATUSES.includes(expense?.status);

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const unitKey = (v) => (v === null || v === undefined || v === '' ? null : v);
const monthOf = (d) => (typeof d === 'string' && d.length >= 7 ? d.slice(0, 7) : null);

// ── Journal unifié d'une caisse ─────────────────────────────────────────────
// `unitId` : identifiant d'unité pédagogique, ou null pour la caisse du complexe.
// Passer `unitId: undefined` ne filtre rien (vue consolidée), ce qui n'a de sens
// que pour un total général — jamais pour un solde de caisse.
export function cashLedger({ movements = [], expenses = [], unitId } = {}) {
  const keep = (row) => (unitId === undefined ? true : unitKey(row.school_unit_id) === unitKey(unitId));

  const rows = [
    ...movements.filter(keep).map((m) => ({
      id: m.id,
      date: m.date || null,
      kind: m.kind,
      type: isOpening(m.kind) ? 'report' : (isEntry(m.kind) ? 'entree' : 'sortie'),
      label: m.label || '',
      reference: m.reference || '',
      amount: n(m.amount),
      sourceBalance: m.source_balance === null || m.source_balance === undefined ? null : n(m.source_balance),
      sourceBalanceRaw: m.source_balance_raw ?? null,
      schoolUnitId: unitKey(m.school_unit_id),
      sourceFile: m.source_file || null,
      sourceRow: m.source_row ?? null,
      origin: 'cash_movements',
    })),
    ...expenses.filter((e) => keep(e) && isCashOut(e)).map((e) => ({
      id: e.id,
      date: e.expense_date || null,
      kind: 'depense',
      type: 'depense',
      label: e.notes || e.supplier || '',
      reference: e.receipt || '',
      amount: n(e.amount),
      sourceBalance: e.source_balance === null || e.source_balance === undefined ? null : n(e.source_balance),
      sourceBalanceRaw: e.source_balance_raw ?? null,
      schoolUnitId: unitKey(e.school_unit_id),
      sourceFile: e.source_file || null,
      sourceRow: e.source_row ?? null,
      origin: 'budget_expenses',
    })),
  ];

  // Tri chronologique STABLE. À date égale, la ligne d'origine (fichier, n° de
  // ligne) départage : c'est l'ordre du cahier, le seul qui reproduise la
  // suite des soldes inscrits. Sans lui, deux écritures du même jour
  // s'intervertiraient d'un affichage à l'autre et le solde paraîtrait sauter.
  rows.sort((a, b) => {
    if ((a.date || '') !== (b.date || '')) return (a.date || '') < (b.date || '') ? -1 : 1;
    // Le report ouvre toujours sa journée.
    if ((a.type === 'report') !== (b.type === 'report')) return a.type === 'report' ? -1 : 1;
    const fa = a.sourceFile || '', fb = b.sourceFile || '';
    if (fa !== fb) return fa < fb ? -1 : 1;
    const ra = a.sourceRow ?? Number.MAX_SAFE_INTEGER, rb = b.sourceRow ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return String(a.id || '') < String(b.id || '') ? -1 : 1;
  });

  // Solde courant. Un report REMPLACE le solde au lieu de s'y ajouter.
  let solde = 0;
  for (const r of rows) {
    if (r.type === 'report') solde = r.amount;
    else if (r.type === 'entree') solde += r.amount;
    else solde -= r.amount;
    r.balance = solde;
  }
  return rows;
}

// ── Totaux d'une caisse ─────────────────────────────────────────────────────
export function cashTotals(rows = []) {
  const t = { entrees: 0, sorties: 0, depenses: 0, reports: 0, nEntrees: 0, nSorties: 0, nDepenses: 0, solde: 0 };
  for (const r of rows) {
    if (r.type === 'report') { t.reports += r.amount; continue; }   // jamais dans `entrees`
    if (r.type === 'entree') { t.entrees += r.amount; t.nEntrees++; }
    else if (r.type === 'depense') { t.depenses += r.amount; t.sorties += r.amount; t.nDepenses++; }
    else { t.sorties += r.amount; t.nSorties++; }
  }
  t.solde = rows.length ? rows[rows.length - 1].balance : 0;
  return t;
}

// ── Récapitulatif par mois ──────────────────────────────────────────────────
// `opening` = solde juste AVANT la première écriture du mois (donc le report s'il
// y en a un, sinon la clôture du mois précédent). `closing` = dernier solde.
export function monthlySummary(rows = []) {
  const byMonth = new Map();
  let previousClosing = 0;
  for (const r of rows) {
    const m = monthOf(r.date) || 'sans-date';
    if (!byMonth.has(m)) {
      byMonth.set(m, { month: m, opening: previousClosing, entrees: 0, sorties: 0, depenses: 0, reports: 0, closing: previousClosing, count: 0 });
    }
    const e = byMonth.get(m);
    e.count++;
    if (r.type === 'report') { e.reports += r.amount; e.opening = r.amount; }
    else if (r.type === 'entree') e.entrees += r.amount;
    else if (r.type === 'depense') { e.depenses += r.amount; e.sorties += r.amount; }
    else e.sorties += r.amount;
    e.closing = r.balance;
    previousClosing = r.balance;
  }
  return [...byMonth.values()];
}

// ── Contrôle des écarts contre les soldes du document d'origine ─────────────
// Ne « corrige » rien : signale, et laisse la valeur source intacte. Un écart
// est une information, pas un défaut à faire disparaître.
export function reconcile(rows = []) {
  const out = [];
  for (const r of rows) {
    if (r.sourceBalance === null) continue;
    if (r.sourceBalance !== r.balance) {
      out.push({
        id: r.id, date: r.date, label: r.label,
        sourceFile: r.sourceFile, sourceRow: r.sourceRow,
        sourceBalance: r.sourceBalance, computed: r.balance,
        delta: r.balance - r.sourceBalance,
      });
    }
  }
  return out;
}

// ── Balances du document ILLISIBLES, en attente d'arbitrage ─────────────────
// Distinct d'un écart : ici on ne peut même pas comparer, faute de nombre. La
// valeur brute est conservée (`source_balance_raw`) et la ligne remonte ici pour
// qu'un humain tranche. Sans cette fonction, l'incohérence du document resterait
// en base sans jamais s'afficher — c'est le défaut constaté sur « 254 08 ».
export function pendingBalances(rows = []) {
  return rows
    .filter((r) => r.sourceBalance === null && r.sourceBalanceRaw !== null && String(r.sourceBalanceRaw).trim() !== '')
    .map((r) => ({
      id: r.id, date: r.date, label: r.label,
      sourceFile: r.sourceFile, sourceRow: r.sourceRow,
      raw: String(r.sourceBalanceRaw),
      computed: r.balance,
      amount: r.amount,
    }));
}

// ── Répartition par caisse, pour vérifier qu'aucun solde ne se mélange ──────
export function balancesByUnit({ movements = [], expenses = [] } = {}) {
  const units = new Set([
    ...movements.map((m) => unitKey(m.school_unit_id)),
    ...expenses.filter(isCashOut).map((e) => unitKey(e.school_unit_id)),
  ]);
  const out = [];
  for (const u of units) {
    const rows = cashLedger({ movements, expenses, unitId: u });
    out.push({ schoolUnitId: u, ...cashTotals(rows), rows: rows.length });
  }
  return out;
}
