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

// `items || []` : l'appelant peut passer null (chargement en cours, élève sans
// frais). Sans ce repli, toute la page de frais tombait sur un TypeError au lieu
// d'afficher un dû nul — trouvé en éprouvant `gridDuplicates`.
const activeItems = (items) => (items || []).filter((si) => si && si.status !== 'removed');

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

// ── UN MÊME FRAIS NE DOIT JAMAIS ÊTRE COMPTÉ DEUX FOIS ──────────────────────
//
// LE DÉFAUT QUE CECI CORRIGE, relevé chez une école le 16/10/2026 : « il y a
// 50 000 de plus à payer ».
//
// Deux endroits permettent de déclarer le MÊME frais, et le « Dû » additionnait
// les deux :
//   • la GRILLE de classe porte `amount_inscription` (et la scolarité, en
//     comptant / échelonné) ;
//   • le CATALOGUE porte les catégories `inscription` et `scolarite`.
//
// Une école ayant saisi l'inscription aux deux endroits se voyait réclamer le
// double. Le calcul était : 650 000 (scolarité) + 50 000 (inscription de la
// grille) + 85 000 (catalogue, inscription comprise) = 785 000. Après un
// versement de 85 000, le reste affichait 700 000 au lieu de 650 000 — et rien
// à l'écran ne disait d'où venaient les 50 000.
//
// RÈGLE : la GRILLE fait foi, parce que c'est elle qui construit l'échéancier
// (`resolveSchedule` y pose l'inscription comme une tranche, avec sa date). Un
// frais du catalogue de même nature est alors écarté du total.
//
// POURQUOI SUR LA CATÉGORIE, ET PAS SUR LE MONTANT. Si les deux montants
// diffèrent (grille 50 000, catalogue 45 000), c'est encore la même inscription
// saisie deux fois : ne dédoublonner qu'à montant égal laisserait réclamer
// 95 000 pour une seule inscription. La catégorie est le bon critère.
//
// CE QUE ÇA COÛTE, ET POURQUOI C'EST LE BON SENS DE L'ERREUR : une école qui
// aurait VOLONTAIREMENT deux frais de catégorie `inscription` distincts (une
// inscription et des frais de dossier, par exemple) verra le second écarté, donc
// SOUS-facturé. C'est assumé : réclamer de l'argent à tort est pire que d'en
// oublier, et l'écart est VISIBLE — `ignored` est rendu pour que l'écran le
// nomme, au lieu de le soustraire en silence.
//
// Rien n'est supprimé ni modifié en base : seul le TOTAL DÛ change. Les
// versements déjà rattachés à ces frais restent acquis à l'élève.
export const GRID_COVERED = { inscription: 'inscription', scolarite: 'tuition' };

/**
 * Frais du catalogue d'un élève qui DOUBLENT la grille de sa classe.
 *
 * @param studentItems  lignes `student_fee_items` de l'élève
 * @param gridAmounts   { inscription, tuition } — montants portés par la grille
 *                      (0 ou absent = la grille ne couvre pas ce frais, donc le
 *                      catalogue est la seule source et il COMPTE)
 * @returns {{ ignored: object[], ignoredDue: number }}
 */
export function gridDuplicates(studentItems = [], gridAmounts = {}) {
  // `|| {}` en plus du défaut : une grille ABSENTE arrive en `null` (classe sans
  // grille), et le défaut d'argument ne joue que sur `undefined`. Sans grille,
  // rien n'est couvert — donc rien n'est écarté, et le catalogue fait foi.
  const g = gridAmounts || {};
  const couvert = {
    inscription: (Number(g.inscription) || 0) > 0,
    scolarite:   (Number(g.tuition) || 0) > 0,
  };
  const ignored = activeItems(studentItems)
    .filter((si) => couvert[si?.category] === true);
  return {
    ignored,
    ignoredDue: ignored.reduce((s, si) => s + (Number(si.amount) || 0), 0),
  };
}

/**
 * Un SERVICE À ABONNEMENT, facturé période par période — cantine, transport,
 * internat au mois. Il ne relève pas des « frais scolaires » :
 *
 *  • son `amount` est le prix d'UNE période, pas le dû de l'année. L'afficher
 *    comme un dû annoncerait « dû 15 000 » quand huit mois sont dus — c'est le
 *    défaut que `statementByFamily` signale déjà dans son commentaire ;
 *  • ses versements sont rattachés aux ÉCHÉANCES (`fee_schedule_item_id`), donc
 *    `paidForItem` les ignore et l'élève paraît « Non payé » alors qu'il a payé ;
 *  • et l'école le gère à part : « les frais scolaires de GENIUS n'incluent rien
 *    d'autre que pension et inscription » (responsable, 31/10/2026).
 *
 * Ils ont leur écran : le Registre des services (`/app/cantine`), qui raisonne
 * par mois et sait lire les échéances.
 *
 * TOUS LES SERVICES SORTENT, y compris ceux à versement unique — une tenue, une
 * sortie pédagogique. Décision du responsable, 2026-10-31 : « oui tous les
 * services sortent ». J'avais d'abord laissé les versements uniques au guichet
 * parce que leur montant y est juste ; la règle retenue est plus simple et c'est
 * sa force : **« Frais scolaires » ne contient QUE de l'académique** — pension,
 * inscription, APEE. Une seule phrase à tenir, aucun cas particulier à se
 * rappeler, et rien qui dépende d'un `payment_type` qu'une saisie peut laisser
 * à sa valeur par défaut.
 */
export function estServiceHorsScolarite(item) {
  if (!item) return false;
  return feeFamily(item.category) === 'service';
}

/**
 * Dû du catalogue NET de ce que la grille couvre déjà. C'est ce montant, et non
 * `studentTotals().due`, qui doit entrer dans le « Dû » d'un élève.
 *
 * Les services à abonnement en sont également ÉCARTÉS, et rendus dans `services`
 * — jamais tus. Un montant écarté en silence est un montant que personne ne peut
 * vérifier ; c'est la même règle que pour `ignored`.
 *
 * @returns {{ due, paid, balance, mandatoryDue, optionalDue,
 *             ignored, ignoredDue, services, servicesDue }}
 */
export function studentTotalsNetOfGrid(studentItems = [], payments = [], gridAmounts = {}) {
  const { ignored, ignoredDue } = gridDuplicates(studentItems, gridAmounts);
  const exclus = new Set(ignored.map((si) => si.id));
  const restants = (studentItems || []).filter((si) => !exclus.has(si?.id));

  const services = activeItems(restants).filter(estServiceHorsScolarite);
  const idsService = new Set(services.map((si) => si.id));
  const gardes = restants.filter((si) => !idsService.has(si?.id));

  return {
    ...studentTotals(gardes, payments),
    ignored, ignoredDue,
    services,
    // La somme des `amount` écartés — pour un service au mois c'est le prix
    // d'UNE période, pas le dû de l'année. Ce total sert à NOMMER ce qui est
    // écarté, jamais à réclamer : le dû réel se lit dans le Registre des
    // services, seul endroit qui connaisse l'échéancier.
    servicesDue: services.reduce((s, si) => s + (Number(si.amount) || 0), 0),
  };
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

// ── SUPPRIMER UN SERVICE : LA DÉCISION, SÉPARÉE DE L'ACTION ────────────────
//
// `supprimerService()` parle à la base ; la RÈGLE, elle, vit ici, où un banc
// peut l'atteindre sans traîner le client de base derrière lui. C'est la règle
// qui protège la recette, et elle tient en une phrase : on ne supprime pas un
// service sur lequel de l'argent dort.
//
// Pourquoi elle est indispensable : `supabase_fee_integrity.sql` révoque le
// DELETE sur `fee_payments` — l'app n'a PAS le droit d'effacer un encaissement,
// par décision anti-fraude. Et `fee_payments.student_fee_item_id` est en
// `ON DELETE SET NULL`. Supprimer les abonnements d'un service qui porte de
// l'argent ne supprimerait donc pas l'argent : il passerait à NULL. Résultat,
// le pire des deux mondes — une recette invisible à l'écran, toujours comptée
// en balance, et plus rattachée à rien qui l'explique.
//
// La somme est ALGÉBRIQUE : une recette déjà contre-passée pèse zéro. Un service
// soldé par contre-passation n'est donc pas bloqué par le souvenir d'un
// encaissement annulé — ce serait punir l'école d'avoir fait les choses dans
// l'ordre.
export const REFUS_SUPPRESSION = Object.freeze({
  AUCUN_SERVICE: 'aucun_service',
  ARGENT: 'argent_encaisse',
  LIGNES_SOLDEES: 'versements_soldes_restants',
});

/**
 * @param {{ versements?: Array, montant?: number }} dep  dépendances lues
 * @param {{ forcer?: boolean }} [opts]
 * @returns {{ ok: boolean, refus?: string, montant?: number, versements?: number }}
 */
export function decisionSuppression(dep, { forcer = false } = {}) {
  if (!dep) return { ok: false, refus: REFUS_SUPPRESSION.AUCUN_SERVICE };
  const versements = (dep.versements || []).length;
  const montant = Number(dep.montant) || 0;

  // 1. De l'argent vif : refus net, et le montant est dit. Aucun forçage ne
  //    lève ce refus — ce n'est pas une préférence d'écran, c'est le droit que
  //    l'application n'a pas.
  if (montant !== 0) {
    return { ok: false, refus: REFUS_SUPPRESSION.ARGENT, montant, versements };
  }
  // 2. Somme nulle, mais des LIGNES subsistent. Elles survivront à la
  //    suppression du service, car l'app ne peut pas les effacer. On passe
  //    seulement sur une demande explicite, pour que personne ne croie la base
  //    vierge ensuite et ne s'étonne de les retrouver.
  if (versements > 0 && !forcer) {
    return { ok: false, refus: REFUS_SUPPRESSION.LIGNES_SOLDEES, montant: 0, versements };
  }
  return { ok: true, montant, versements };
}
