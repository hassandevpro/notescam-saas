// Moteur PUR du CATALOGUE DE FRAIS (obligatoires / optionnels). Aucune I/O.
//
// Compatible avec le système de paiements existant : les paiements restent dans
// `fee_payments` ; chaque paiement peut cibler un frais précis via
// `student_fee_item_id`. Un paiement sans ce lien = paiement global (héritage).
//
// Entièrement CONFIGURABLE par établissement : le catalogue est une table de
// données (fee_catalog) éditable par la direction, sans changement de code.

export const FEE_CATEGORIES = [
  'inscription', 'scolarite', 'apee',                 // obligatoires typiques
  'tenue', 'cantine', 'transport', 'internat', 'soutien',
  'activites', 'bibliotheque', 'assurance', 'sortie', 'autre', // optionnels typiques
];
export const FEE_PAYMENT_TYPES = ['unique', 'echelonne'];

// ── DEUX FAMILLES : ce que l'école FACTURE vs ce qu'elle REND comme service ──
// Un parent ne lit pas « apee » et « cantine » de la même façon : l'un est une
// obligation de scolarité, l'autre une prestation à laquelle il a souscrit. La
// distinction ne change aucun calcul — elle ne sert qu'à présenter le relevé
// d'un élève en deux blocs lisibles.
//
// `autre` est rangé du côté ACADÉMIQUE, et c'est un choix : c'est le fourre-tout
// historique du catalogue, employé bien avant que les services existent. Le
// basculer côté services déplacerait sans prévenir des frais déjà saisis par les
// écoles dans un bloc où elles ne les ont jamais rangés.
export const ACADEMIC_CATEGORIES = ['inscription', 'scolarite', 'apee', 'autre'];
export const SERVICE_CATEGORIES = ['cantine', 'transport', 'tenue', 'internat',
  'soutien', 'activites', 'bibliotheque', 'assurance', 'sortie'];

export function feeFamily(category) {
  return SERVICE_CATEGORIES.includes(category) ? 'service' : 'academique';
}

// Relevé d'un élève en deux blocs + totaux. PUR : `paidOf` est injecté par
// l'appelant, parce que le payé se calcule depuis les paiements et que ce
// moteur ne connaît ni la base ni le store.
export function statementByFamily(items = [], paidOf = () => 0, dueOf = null) {
  const vivants = items.filter((i) => i.status !== 'removed');
  const bloc = (famille) => {
    const lignes = vivants
      .filter((i) => feeFamily(i.category) === famille)
      .map((i) => {
        // Le dû d'un frais PÉRIODIQUE n'est pas `amount` : `amount` est le prix
        // d'UNE période. Une cantine à 15 000/mois afficherait « dû 15 000,
        // payé 45 000 » — un relevé que personne ne peut présenter à un parent.
        // L'appelant injecte donc le dû quand il sait le calculer (échéancier),
        // et `amount` reste le défaut pour tous les frais à versement unique.
        const du = dueOf ? Number(dueOf(i)) || 0 : Number(i.amount) || 0;
        const paye = Number(paidOf(i)) || 0;
        // Solde borné à 0 : un trop-perçu sur un frais ne doit pas venir effacer
        // la dette d'un autre en se propageant dans le total.
        return { ...i, due: du, paid: paye, balance: Math.max(0, du - paye) };
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return {
      lignes,
      due: lignes.reduce((s, l) => s + l.due, 0),
      paid: lignes.reduce((s, l) => s + l.paid, 0),
      balance: lignes.reduce((s, l) => s + l.balance, 0),
    };
  };
  const academique = bloc('academique');
  const service = bloc('service');
  return {
    academique, service,
    total: {
      due: academique.due + service.due,
      paid: academique.paid + service.paid,
      balance: academique.balance + service.balance,
    },
  };
}

// Un frais du catalogue s'applique-t-il à un élève (année / niveau / classe) ?
// Priorité : classe ciblée > niveau ciblé > global (toute l'école).
export function itemApplies(item, { academicYear, level, classId } = {}) {
  if (!item || item.active === false) return false;
  if (item.academic_year && academicYear && item.academic_year !== academicYear) return false;
  if (item.class_id) return item.class_id === classId;
  if (item.level) return item.level === level;
  return true;
}

export function mandatoryItemsFor(catalog = [], ctx) {
  return catalog.filter((i) => i.mandatory && itemApplies(i, ctx));
}
export function optionalItemsFor(catalog = [], ctx) {
  return catalog.filter((i) => !i.mandatory && i.optional !== false && itemApplies(i, ctx));
}

// Snapshot d'un frais du catalogue vers un frais d'élève (fige nom/catégorie/
// montant/type au moment de l'attribution → indépendant des évolutions futures).
export function snapshotItem(catalogItem, { studentId, schoolId, academicYear }) {
  return {
    school_id: schoolId, student_id: studentId, fee_catalog_id: catalogItem.id,
    academic_year: academicYear || catalogItem.academic_year || null,
    name: catalogItem.name, category: catalogItem.category,
    amount: Number(catalogItem.amount) || 0,
    mandatory: !!catalogItem.mandatory, payment_type: catalogItem.payment_type || 'unique',
    status: 'active',
  };
}

// ── Paiements par frais ───────────────────────────────────────────────────────
export function paidForItem(itemId, payments = []) {
  return payments.filter((p) => p.student_fee_item_id === itemId).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

export function itemBalance(studentItem, payments = []) {
  const amount = Number(studentItem.amount) || 0;
  const paid = paidForItem(studentItem.id, payments);
  const balance = amount - paid;
  const status = amount > 0 && paid >= amount ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  return { amount, paid, balance, status };
}

const activeItems = (items) => items.filter((si) => si.status !== 'removed');

// Solde PAR CATÉGORIE pour un élève.
export function balanceByCategory(studentItems = [], payments = []) {
  const map = {};
  for (const si of activeItems(studentItems)) {
    const cat = si.category || 'autre';
    const b = itemBalance(si, payments);
    const m = map[cat] || (map[cat] = { category: cat, due: 0, paid: 0, balance: 0 });
    m.due += b.amount; m.paid += b.paid; m.balance += b.balance;
  }
  return Object.values(map).sort((a, b) => b.due - a.due);
}

// Totaux d'un élève (obligatoire vs optionnel).
export function studentTotals(studentItems = [], payments = []) {
  let due = 0, paid = 0, mandatoryDue = 0, optionalDue = 0;
  for (const si of activeItems(studentItems)) {
    const b = itemBalance(si, payments);
    due += b.amount; paid += b.paid;
    if (si.mandatory) mandatoryDue += b.amount; else optionalDue += b.amount;
  }
  return { due, paid, balance: due - paid, mandatoryDue, optionalDue };
}

// ── Statistiques : recettes PAR TYPE DE FRAIS (établissement) ──────────────────
export function revenueByFeeType(studentItems = [], payments = []) {
  const byId = {};
  for (const si of studentItems) byId[si.id] = si;
  const map = {};
  for (const p of payments) {
    if (!p.student_fee_item_id) continue;             // paiement global (hérité) exclu
    const si = byId[p.student_fee_item_id]; if (!si) continue;
    const cat = si.category || 'autre';
    map[cat] = (map[cat] || 0) + (Number(p.amount) || 0);
  }
  return Object.entries(map).map(([category, collected]) => ({ category, collected })).sort((a, b) => b.collected - a.collected);
}
