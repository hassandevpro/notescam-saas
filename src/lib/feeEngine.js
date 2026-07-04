// ════════════════════════════════════════════════════════════════════════════
// MOTEUR TARIFAIRE — frais de scolarité flexibles par classe
// ════════════════════════════════════════════════════════════════════════════
//
// Logique métier PURE (aucune dépendance réseau / store / React) afin d'être
// testable et réutilisable côté impression, dashboard, portail parent, etc.
//
// Trois concepts :
//   1. Grille tarifaire de classe (class_fee_grids) : définit, pour une classe et
//      une année, le tarif COMPTANT (réduit, payé en une fois), le tarif
//      ÉCHELONNÉ (total) et la liste des tranches (libellé, montant, échéance).
//   2. Frais élève (student_fees) : porte le mode de paiement choisi à
//      l'inscription (`payment_mode`), un INSTANTANÉ des tranches applicables
//      (pour qu'une modification ultérieure de la grille ne perturbe pas un
//      élève déjà inscrit), le total payé et d'éventuels ajustements
//      (bourses / remises / réductions familiales…).
//   3. Échéancier résolu : calculé à la volée à partir des deux précédents.
//
// Architecture évolutive : toute nouvelle politique tarifaire (bourse, remise,
// réduction familiale, gratuité fratrie…) s'ajoute comme un « ajustement »
// déclaratif appliqué par applyAdjustments(), sans toucher au reste du moteur.
// ════════════════════════════════════════════════════════════════════════════

export const PAYMENT_MODES = {
  COMPTANT:  'comptant',   // paiement unique, tarif réduit
  ECHELONNE: 'echelonne',  // paiement par tranches selon la grille
  LIBRE:     'libre',      // legacy / saisie manuelle libre (compatibilité)
};

export const FEE_STATUS = {
  NONE:       'none',        // aucun frais défini
  PAID:       'paid',        // intégralement réglé
  UP_TO_DATE: 'up_to_date',  // à jour des échéances passées
  DUE_SOON:   'due_soon',    // échéance dans les prochains jours
  LATE:       'late',        // au moins une échéance passée non couverte
};

export const ADJUSTMENT_TYPES = {
  BOURSE:             'bourse',
  REMISE:             'remise',
  REDUCTION_FAMILIALE:'reduction_familiale',
  AUTRE:              'autre',
};

// ── Helpers numériques / dates ──────────────────────────────────────────────

function toInt(n) { const v = parseInt(n, 10); return Number.isFinite(v) ? v : 0; }
function clampPos(n) { return n < 0 ? 0 : n; }

export function todayISO() { return new Date().toISOString().slice(0, 10); }

// Nombre de jours entiers entre deux dates ISO (b - a). >0 si b après a.
export function daysBetween(aISO, bISO) {
  if (!aISO || !bISO) return 0;
  const a = new Date(aISO + 'T00:00:00');
  const b = new Date(bISO + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

// ── Ajustements (bourses / remises / réductions) ────────────────────────────
//
// adjustments : [{ id, type, label, mode:'amount'|'percent', value }]
//   - mode 'amount'  : value = montant fixe déduit (FCFA)
//   - mode 'percent' : value = pourcentage déduit (0–100) du total brut
//
// Renvoie { gross, reduction, net, applied:[{...adj, computed}] }. Le net est
// borné à [0, gross].
export function applyAdjustments(gross, adjustments = []) {
  const g = clampPos(toInt(gross));
  let reduction = 0;
  const applied = [];
  for (const adj of adjustments || []) {
    if (!adj) continue;
    const computed = adj.mode === 'percent'
      ? Math.round((g * clampPos(toInt(adj.value))) / 100)
      : clampPos(toInt(adj.value));
    reduction += computed;
    applied.push({ ...adj, computed });
  }
  reduction = Math.min(reduction, g);
  return { gross: g, reduction, net: g - reduction, applied };
}

// ── Échéancier brut d'une grille selon le mode ──────────────────────────────
//
// Renvoie la liste ordonnée des tranches { id, label, amount, due_date } et le
// total, AVANT ajustements. Pour le comptant, une tranche unique sans échéance
// (paiement immédiat attendu).
function baseSchedule(mode, grid, fee) {
  if (mode === PAYMENT_MODES.COMPTANT) {
    // Repli sur l'instantané figé (fee.frais_annuels) si la grille n'est pas
    // disponible (ex. portail parent qui n'a pas accès aux grilles de classe).
    const total = toInt(grid?.amount_comptant) || toInt(fee?.frais_annuels);
    const due = fee?.tranches?.[0]?.due_date || grid?.tranches?.[0]?.due_date || null;
    return {
      total,
      tranches: [{ id: 'comptant', label: 'Paiement comptant', amount: total, due_date: due }],
    };
  }

  if (mode === PAYMENT_MODES.ECHELONNE) {
    // Priorité à l'instantané figé sur l'élève (fee.tranches), sinon la grille.
    const src = (fee?.tranches?.length ? fee.tranches : grid?.tranches) || [];
    const tranches = src.map((t, i) => ({
      id:       t.id || `t${i}`,
      label:    t.label || `Tranche ${i + 1}`,
      amount:   toInt(t.amount),
      due_date: t.due_date || null,
    }));
    const declared = toInt(grid?.amount_echelonne);
    const sum = tranches.reduce((s, t) => s + t.amount, 0);
    return { total: declared || sum, tranches };
  }

  // LIBRE / legacy : tranches manuelles si présentes, sinon une tranche unique
  // égale aux frais annuels saisis à la main.
  const manual = (fee?.tranches || []).map((t, i) => ({
    id:       t.id || `t${i}`,
    label:    t.label || `Tranche ${i + 1}`,
    amount:   toInt(t.amount),
    due_date: t.due_date || null,
  }));
  if (manual.length) {
    const sum = manual.reduce((s, t) => s + t.amount, 0);
    return { total: toInt(fee?.frais_annuels) || sum, tranches: manual };
  }
  const total = toInt(fee?.frais_annuels);
  return {
    total,
    tranches: total > 0
      ? [{ id: 'unique', label: 'Frais annuels', amount: total, due_date: null }]
      : [],
  };
}

// Met à l'échelle les tranches pour qu'elles totalisent `net` (après ajustements),
// en préservant les proportions. Le reliquat d'arrondi est absorbé par la
// dernière tranche, de sorte que la somme des tranches == net exactement.
function scaleTranches(tranches, gross, net) {
  if (gross <= 0 || net === gross || !tranches.length) {
    return tranches.map((t) => ({ ...t }));
  }
  const scaled = tranches.map((t) => ({
    ...t,
    amount: Math.round((t.amount * net) / gross),
  }));
  const diff = net - scaled.reduce((s, t) => s + t.amount, 0);
  if (diff !== 0) {
    const last = scaled[scaled.length - 1];
    last.amount = clampPos(last.amount + diff);
  }
  return scaled;
}

// ════════════════════════════════════════════════════════════════════════════
// resolveSchedule — échéancier effectif d'un élève (ajustements compris)
// ════════════════════════════════════════════════════════════════════════════
// fee  : enregistrement student_fees (peut être null)
// grid : grille tarifaire de la classe (peut être null)
// Renvoie : { mode, gross, reduction, net, total, adjustments, tranches:[{ id,
//   label, amount, due_date, cumulative }] } où `cumulative` est le total
//   attendu cumulé jusqu'à cette tranche incluse (sert à la répartition).
// opts.applyInscription : ajoute les frais d'inscription (grid.amount_inscription)
// en TÊTE de l'échéancier, pour les élèves nouveaux dans l'établissement. Cette
// ligne fixe n'est PAS soumise aux ajustements (bourses/remises), qui ne portent
// que sur la scolarité.
export function resolveSchedule(fee, grid, opts = {}) {
  const mode = fee?.payment_mode || PAYMENT_MODES.LIBRE;
  const base = baseSchedule(mode, grid, fee);
  const { gross, reduction, net, applied } = applyAdjustments(base.total, fee?.adjustments);
  const tuition = scaleTranches(base.tranches, base.total, net);

  const inscription = opts.applyInscription ? clampPos(toInt(grid?.amount_inscription)) : 0;
  const inscriptionTranches = inscription > 0
    ? [{
        id: 'inscription',
        label: "Frais d'inscription",
        amount: inscription,
        due_date: fee?.tranches?.[0]?.due_date || grid?.tranches?.[0]?.due_date || null,
        inscription: true,
      }]
    : [];

  let running = 0;
  const withCumul = [...inscriptionTranches, ...tuition].map((t) => {
    running += t.amount;
    return { ...t, cumulative: running };
  });

  return {
    mode,
    gross: gross + inscription,
    reduction,
    net: net + inscription,
    total: net + inscription,
    inscription,
    adjustments: applied,
    tranches: withCumul,
  };
}

// Un élève « nouveau dans l'établissement » règle des frais d'inscription en plus
// de la scolarité. C'est une dimension INDÉPENDANTE du statut de classe (un élève
// peut être nouveau dans l'établissement ET redoublant). Champ : statut_etablissement.
export function inscriptionApplies(student) {
  return student?.statut_etablissement === 'nouveau';
}

// ════════════════════════════════════════════════════════════════════════════
// trancheBreakdown — répartition automatique séquentielle du total payé
// ════════════════════════════════════════════════════════════════════════════
// Les versements forment une cagnotte unique (fee.frais_payes) répartie dans
// l'ordre des tranches. Les avances sur tranches suivantes sont donc permises.
// Pour chaque tranche : { ...tranche, allocated, remaining, status, daysLate }
//   status ∈ 'covered' | 'partial' | 'overdue' | 'upcoming'
export function trancheBreakdown(schedule, paidTotal, today = todayISO(), soonDays = 7) {
  let paid = clampPos(toInt(paidTotal));
  return schedule.tranches.map((t) => {
    const allocated = Math.min(paid, t.amount);
    paid -= allocated;
    const remaining = clampPos(t.amount - allocated);

    let status;
    if (remaining === 0) {
      status = 'covered';
    } else if (t.due_date && t.due_date < today) {
      status = 'overdue';
    } else if (t.due_date && daysBetween(today, t.due_date) <= soonDays) {
      status = allocated > 0 ? 'partial' : 'upcoming'; // due_soon traité globalement
    } else {
      status = allocated > 0 ? 'partial' : 'upcoming';
    }

    const daysLate = (status === 'overdue' && t.due_date) ? daysBetween(t.due_date, today) : 0;
    return { ...t, allocated, remaining, status, daysLate };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// studentFeeSituation — synthèse complète pour un élève
// ════════════════════════════════════════════════════════════════════════════
// Renvoie tout ce qu'il faut afficher : total, payé, solde, statut global,
// tranche attendue, prochaine échéance, jours de retard, détail des tranches.
// opts : { today, soonDays, applyInscription }. applyInscription ajoute les frais
// d'inscription au total (élève nouveau dans l'établissement).
export function studentFeeSituation(fee, grid, opts = {}) {
  const { today = todayISO(), soonDays = 7 } = opts;
  const schedule = resolveSchedule(fee, grid, opts);
  const paid = clampPos(toInt(fee?.frais_payes));
  const total = schedule.total;
  const balance = clampPos(total - paid);
  const tranches = trancheBreakdown(schedule, paid, today, soonDays);

  // Montant attendu à ce jour = tranches dont l'échéance est passée ou aujourd'hui.
  const expectedToDate = schedule.tranches
    .filter((t) => t.due_date && t.due_date <= today)
    .reduce((s, t) => s + t.amount, 0);
  const overdueAmount = clampPos(expectedToDate - paid);

  // Première tranche non entièrement couverte = « tranche attendue ».
  const current = tranches.find((t) => t.remaining > 0) || null;

  let status;
  if (total <= 0 || !schedule.tranches.length) {
    status = FEE_STATUS.NONE;
  } else if (balance <= 0) {
    status = FEE_STATUS.PAID;
  } else if (overdueAmount > 0) {
    status = FEE_STATUS.LATE;
  } else if (current?.due_date && daysBetween(today, current.due_date) <= soonDays) {
    status = FEE_STATUS.DUE_SOON;
  } else {
    status = FEE_STATUS.UP_TO_DATE;
  }

  const daysLate = (status === FEE_STATUS.LATE && current?.due_date)
    ? clampPos(daysBetween(current.due_date, today))
    : 0;

  return {
    mode: schedule.mode,
    total,
    inscription: schedule.inscription,
    gross: schedule.gross,
    reduction: schedule.reduction,
    adjustments: schedule.adjustments,
    paid,
    balance,
    expectedToDate,
    overdueAmount,
    status,
    daysLate,
    current,
    nextDueDate: current?.due_date || null,
    tranches,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// feeDashboard — agrégats pour le tableau de bord
// ════════════════════════════════════════════════════════════════════════════
// entries : [{ student, fee, grid }]
// Renvoie : { expected, collected, remaining, counts:{paid,upToDate,dueSoon,late,
//   none}, dueSoon:[{ student, situation, tranche }] } trié par échéance.
export function feeDashboard(entries, today = todayISO(), soonDays = 7) {
  let expected = 0, collected = 0, remaining = 0;
  const counts = { paid: 0, up_to_date: 0, due_soon: 0, late: 0, none: 0 };
  const dueSoon = [];

  for (const { student, fee, grid } of entries) {
    const s = studentFeeSituation(fee, grid, { today, soonDays, applyInscription: inscriptionApplies(student) });
    expected  += s.total;
    collected += Math.min(s.paid, s.total);
    remaining += s.balance;
    counts[s.status] = (counts[s.status] || 0) + 1;

    // Tranches arrivant à échéance dans les `soonDays` prochains jours (non couvertes).
    for (const tr of s.tranches) {
      if (tr.remaining > 0 && tr.due_date) {
        const d = daysBetween(today, tr.due_date);
        if (d >= 0 && d <= soonDays) {
          dueSoon.push({ student, situation: s, tranche: tr, inDays: d });
        }
      }
    }
  }

  dueSoon.sort((a, b) => (a.tranche.due_date || '').localeCompare(b.tranche.due_date || ''));

  return {
    expected,
    collected,
    remaining,
    counts: {
      paid:       counts.paid       || 0,
      upToDate:   counts.up_to_date || 0,
      dueSoon:    counts.due_soon   || 0,
      late:       counts.late       || 0,
      none:       counts.none       || 0,
    },
    upToDateTotal: (counts.paid || 0) + (counts.up_to_date || 0) + (counts.due_soon || 0),
    lateTotal: counts.late || 0,
    dueSoon,
  };
}

// Total déclaré des tranches d'une grille (contrôle de cohérence UI).
export function sumTranches(tranches = []) {
  return (tranches || []).reduce((s, t) => s + toInt(t.amount), 0);
}
