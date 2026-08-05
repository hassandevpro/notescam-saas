// ════════════════════════════════════════════════════════════════════════════
// ARRÊTÉ DE CAISSE — rapprochement espèces physiques ↔ écritures
// ════════════════════════════════════════════════════════════════════════════
// Moteur PUR (aucun store, aucun réseau, aucune horloge implicite : « today »
// est toujours fourni par l'appelant).
//
// CE QU'IL RÉSOUT — et ce qu'il ne résout pas.
//
// Rendre les versements immuables empêche d'effacer une recette DÉJÀ SAISIE.
// Cela ne dit rien du détournement le plus simple : ne jamais saisir. Une ligne
// qui n'a jamais existé ne laisse aucune trace à protéger.
//
// L'arrêté de caisse attaque ce cas par le seul bout possible : confronter
// l'argent PHYSIQUE compté en fin de journée au total des écritures du jour.
//   • si le caissier encaisse sans saisir, le tiroir contient PLUS que le
//     système → écart positif, visible ;
//   • s'il saisit sans encaisser (recette fictive), le tiroir contient MOINS.
//
// HONNÊTETÉ SUR LA PORTÉE : un arrêté AUTO-DÉCLARÉ ne bloque pas un voleur
// déterminé, qui déclarera simplement le montant attendu. Il ne devient un
// contrôle qu'associé à deux choses :
//   1. la NUMÉROTATION SÉQUENTIELLE des reçus (un reçu manquant devient un trou
//      visible dans la série — cf. `receiptSequenceGaps` ci-dessous) ;
//   2. une CONTRE-SIGNATURE : le comptage validé par quelqu'un d'autre que
//      celui qui a tenu la caisse (`canValidate`).
// Sans ces deux compléments, cet arrêté détecte les erreurs, pas la fraude.

const toInt = (n) => { const v = parseInt(n, 10); return Number.isFinite(v) ? v : 0; };

export const SESSION_STATUS = Object.freeze({
  OPEN:      'open',       // journée en cours, rien de déclaré
  DECLARED:  'declared',   // le caissier a compté et déclaré
  VALIDATED: 'validated',  // un TIERS a contrôlé le comptage
});

// Les écritures d'un caissier sur une journée donnée. Les contre-passations
// sont incluses (montants négatifs) : le tiroir aussi a rendu l'argent.
export function sessionEntries(payments = [], { cashierId, date }) {
  return (payments || []).filter((p) =>
    p && p.date === date && (p.recorded_by || null) === (cashierId || null));
}

/**
 * Ce que la caisse DEVRAIT contenir pour un caissier et une journée.
 * @returns {{ expected, entries, encaissements, annulations, count }}
 */
export function expectedCash(payments, { cashierId, date, openingFloat = 0 }) {
  const rows = sessionEntries(payments, { cashierId, date });
  const encaissements = rows.filter((p) => toInt(p.amount) > 0).reduce((s, p) => s + toInt(p.amount), 0);
  const annulations   = rows.filter((p) => toInt(p.amount) < 0).reduce((s, p) => s + toInt(p.amount), 0);
  return {
    expected: toInt(openingFloat) + encaissements + annulations,
    entries:  rows,
    count:    rows.length,
    encaissements,
    annulations,          // négatif ou 0
  };
}

/**
 * Écart entre l'argent compté et l'argent attendu.
 * variance > 0 : le tiroir contient PLUS que les écritures → encaissement non
 *                saisi (le cas qui nous intéresse).
 * variance < 0 : le tiroir contient MOINS → recette saisie mais absente, ou vol
 *                pur et simple d'espèces déjà enregistrées.
 */
export function reconcile({ counted, expected }) {
  const variance = toInt(counted) - toInt(expected);
  return {
    expected: toInt(expected),
    counted:  toInt(counted),
    variance,
    balanced: variance === 0,
    direction: variance === 0 ? 'balanced' : variance > 0 ? 'surplus' : 'shortfall',
  };
}

// Un écart doit être JUSTIFIÉ pour clore la journée. Le seuil n'est pas une
// tolérance au vol : il évite qu'un arrondi de monnaie bloque la caisse.
export function requiresExplanation(variance, tolerance = 0) {
  return Math.abs(toInt(variance)) > Math.abs(toInt(tolerance));
}

// Personne ne valide son propre comptage. C'est la règle qui transforme une
// auto-déclaration en contrôle.
export function canValidate(session, userId) {
  if (!session || !userId) return false;
  if (session.status !== SESSION_STATUS.DECLARED) return false;
  return session.cashier_id !== userId;
}

/**
 * TROUS DANS LA SÉRIE DES REÇUS — le contrôle qui rend visible la recette
 * jamais saisie. Un reçu remis au parent porte un numéro séquentiel ; si le
 * numéro 47 n'existe pas en base alors que 46 et 48 y sont, une recette a été
 * encaissée puis escamotée.
 *
 * @param {Array<number>} numbers numéros de reçu émis (peut contenir des trous)
 * @returns {{ gaps: number[], from: number|null, to: number|null, issued: number }}
 */
export function receiptSequenceGaps(numbers = []) {
  const seq = [...new Set((numbers || []).map(toInt).filter((n) => n > 0))].sort((a, b) => a - b);
  if (!seq.length) return { gaps: [], from: null, to: null, issued: 0 };
  const gaps = [];
  for (let n = seq[0]; n <= seq[seq.length - 1]; n++) {
    if (!seq.includes(n)) gaps.push(n);
  }
  return { gaps, from: seq[0], to: seq[seq.length - 1], issued: seq.length };
}

/**
 * Vue de contrôle d'une journée, tous caissiers confondus : un chef
 * d'établissement doit voir d'un coup d'œil qui n'a pas arrêté sa caisse.
 */
export function dayOverview(payments, sessions, { date, cashiers = [] }) {
  const byCashier = new Map();
  for (const c of cashiers) {
    const exp = expectedCash(payments, { cashierId: c.id, date });
    const session = (sessions || []).find((s) => s.date === date && s.cashier_id === c.id) || null;
    const rec = session && session.counted_cash != null
      ? reconcile({ counted: session.counted_cash, expected: exp.expected })
      : null;
    byCashier.set(c.id, {
      cashier: c,
      ...exp,
      session,
      reconciliation: rec,
      // Le point qui compte : de l'argent est passé, mais personne n'a arrêté la
      // caisse. C'est là que se loge la recette non saisie.
      unreconciled: exp.count > 0 && (!session || session.status === SESSION_STATUS.OPEN),
    });
  }
  const rows = [...byCashier.values()];
  return {
    rows,
    totalExpected:  rows.reduce((s, r) => s + r.expected, 0),
    totalCounted:   rows.reduce((s, r) => s + (r.session?.counted_cash != null ? toInt(r.session.counted_cash) : 0), 0),
    totalVariance:  rows.reduce((s, r) => s + (r.reconciliation?.variance || 0), 0),
    unreconciled:   rows.filter((r) => r.unreconciled).length,
  };
}
