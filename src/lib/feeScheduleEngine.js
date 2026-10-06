// ════════════════════════════════════════════════════════════════════════════
// ÉCHÉANCIER D'UN FRAIS PÉRIODIQUE — moteur PUR (aucune I/O, aucun DOM)
// ════════════════════════════════════════════════════════════════════════════
// Ce que ce moteur résout, et que le catalogue ne savait pas faire : dire que
// « novembre est dû, pour cet élève, à tel montant ». Jusqu'ici un frais portait
// UN montant et UNE date ; la cantine mensuelle et le transport trimestriel n'y
// entraient pas.
//
// ── CE QUE LES DOCUMENTS DE L'ÉCOLE IMPOSENT ────────────────────────────────
// L'état de cantine 2024/2025 facture SEPT, OCT, NOV, JAN, FEV, MAR, AVR, MAI.
// Décembre n'y est pas. Une périodicité « mensuelle » qui déduirait bêtement
// douze mois — ou même dix — facturerait un mois que l'école ne facture pas, à
// chaque élève. La liste des périodes est donc une DONNÉE (`billing_periods`),
// pas un calcul ; le calcul n'intervient que pour proposer un défaut raisonnable
// au moment de créer le frais.
//
// L'état de transport 2025/2026, lui, facture par TRIMESTRE alors que le tarif
// est exprimé au mois (7 500 ou 10 000 /mois). Périodicité et tarif sont deux
// questions séparées : `amount` reste le montant D'UNE période.
//
// ── LA RÈGLE QUI PROTÈGE LES FAMILLES ───────────────────────────────────────
// Aucune créance avant l'inscription effective. Un élève arrivé en janvier ne
// doit pas septembre : il ne l'a pas consommé. C'est `enrolledAt` qui tranche,
// et le test le verrouille — c'est la règle la plus facile à casser plus tard,
// et celle qui se voit le plus vite au guichet.
//
// Le montant PAYÉ ne figure nulle part ici. Il se calcule depuis `fee_payments`,
// comme le fait déjà `paidForItem()`. Deux sources de vérité pour un même
// montant finissent toujours par diverger, et c'est la caisse qui en paie le prix.

export const PERIODICITIES = ['unique', 'mensuel', 'trimestriel', 'annuel'];

// Statuts d'une échéance. `partial` et `paid` se DÉDUISENT des paiements ; les
// trois autres sont posés à la main par l'école et gagnent toujours.
export const SCHEDULE_STATUS = ['due', 'partial', 'paid', 'exempted', 'abandoned', 'not_applicable'];
// Les trois statuts que l'école POSE elle-même. Ils ne se déduisent d'aucun
// calcul et aucun encaissement ne les révoque : ce sont des décisions.
export const STATUTS_DECIDES = Object.freeze(['exempted', 'abandoned', 'not_applicable']);
// Statuts qu'un écran peut poser à la main : les trois décisions, plus le retour
// au suivi automatique. `paid` et `partial` n'en sont pas — ils se DÉDUISENT des
// versements, et les poser à la main ferait mentir la caisse.
export const STATUTS_POSABLES = Object.freeze(['due', ...STATUTS_DECIDES]);
const STATUTS_MANUELS = new Set(STATUTS_DECIDES);

const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MOIS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MOIS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Les deux millésimes d'une année scolaire « 2025-2026 ». Tolère « 2025/2026 »
// et « 2025 » (année civile), parce que les écoles saisissent les trois formes.
export function anneesDe(academicYear) {
  const m = String(academicYear || '').match(/(\d{4})\D+(\d{4})/);
  if (m) return [Number(m[1]), Number(m[2])];
  const seule = String(academicYear || '').match(/(\d{4})/);
  return seule ? [Number(seule[1]), Number(seule[1]) + 1] : [null, null];
}

// Clé de période mensuelle : « 2025-11 ». Triable comme du texte, ce qui évite
// de comparer des dates pour ordonner un échéancier.
const cleMois = (annee, mois) => `${annee}-${String(mois).padStart(2, '0')}`;

export function libelleMois(cle, langue = 'fr') {
  const m = String(cle || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return String(cle || '');
  const noms = langue === 'en' ? MOIS_EN : langue === 'es' ? MOIS_ES : MOIS_FR;
  return `${noms[Number(m[2]) - 1]} ${m[1]}`;
}

export function libelleTrimestre(cle, langue = 'fr') {
  const m = String(cle || '').match(/^(\d{4})-T([123])$/);
  if (!m) return String(cle || '');
  const n = m[2];
  if (langue === 'en') return `Term ${n}`;
  if (langue === 'es') return `${n}.º trimestre`;
  return n === '1' ? '1er trimestre' : `${n}e trimestre`;
}

export function libellePeriode(cle, langue = 'fr') {
  if (/^\d{4}-T[123]$/.test(cle)) return libelleTrimestre(cle, langue);
  if (/^\d{4}-\d{2}$/.test(cle)) return libelleMois(cle, langue);
  return String(cle || '');
}

/**
 * Périodes PROPOSÉES par défaut à la création d'un frais. Ce n'est qu'une
 * proposition : l'école corrige la liste, et c'est cette liste corrigée
 * (`billing_periods`) qui fait foi ensuite.
 *
 * Le défaut mensuel court de septembre à juin — l'année scolaire telle qu'elle
 * se vit, et non l'année civile. Décembre y figure : c'est à l'école de le
 * retirer si elle ne le facture pas, comme le montre son état de cantine.
 */
export function periodesParDefaut(periodicity, academicYear) {
  const [a1, a2] = anneesDe(academicYear);
  if (!a1) return [];
  if (periodicity === 'unique' || periodicity === 'annuel') return [`${a1}-annee`];
  if (periodicity === 'trimestriel') return [`${a1}-T1`, `${a1}-T2`, `${a1}-T3`];
  if (periodicity === 'mensuel') {
    const out = [];
    for (let m = 9; m <= 12; m++) out.push(cleMois(a1, m));
    for (let m = 1; m <= 6; m++) out.push(cleMois(a2, m));
    return out;
  }
  return [];
}

// Périodes RETENUES pour un frais : sa liste explicite si elle existe, sinon le
// défaut. Une liste explicite vide est traitée comme « non renseignée » — sans
// quoi un frais mensuel mal configuré ne facturerait jamais rien, en silence.
export function periodesDuFrais(item, academicYear) {
  const brut = item?.billing_periods;
  let liste = Array.isArray(brut) ? brut : null;
  if (!liste && typeof brut === 'string' && brut.trim()) {
    try { const p = JSON.parse(brut); if (Array.isArray(p)) liste = p; } catch { liste = null; }
  }
  if (liste && liste.length) return liste.map(String);
  return periodesParDefaut(item?.periodicity || 'unique', academicYear || item?.academic_year);
}

// Premier mois couvert par une période — sert à la comparer à une date
// d'inscription. Un trimestre est ramené à son premier mois.
function moisInitial(cle) {
  const t = String(cle).match(/^(\d{4})-T([123])$/);
  if (t) {
    const a = Number(t[1]);
    return t[2] === '1' ? cleMois(a, 9) : t[2] === '2' ? cleMois(a + 1, 1) : cleMois(a + 1, 4);
  }
  const m = String(cle).match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// Dernier mois couvert — c'est LUI qui décide si une période est déjà passée au
// moment de l'inscription. Retenir le premier mois priverait l'école d'un
// trimestre entamé par un élève arrivé en cours de trimestre.
function moisFinal(cle) {
  const t = String(cle).match(/^(\d{4})-T([123])$/);
  if (t) {
    const a = Number(t[1]);
    return t[2] === '1' ? cleMois(a, 12) : t[2] === '2' ? cleMois(a + 1, 3) : cleMois(a + 1, 6);
  }
  return moisInitial(cle);
}

// ── DÉBUT DU SERVICE ────────────────────────────────────────────────────────
// La date qui fait foi pour un service est celle de la souscription À CE SERVICE,
// pas celle de l'inscription à l'école. Un élève présent depuis septembre peut
// prendre la cantine en février ; lui facturer septembre parce qu’il était déjà
// scolarisé serait lui faire payer des repas qu’il n’a pas pris.
//
// `enrolledAt` reste le REPLI, et c'est ce qui rend la colonne `started_at`
// inoffensive pour l’existant : une souscription antérieure à B6 ne porte pas de
// date de service, et retombe exactement sur le comportement d’avant.
export function debutServiceEffectif({ startedAt, enrolledAt } = {}) {
  const garde = (d) => (/^[0-9]{4}-[0-9]{2}/.test(String(d || '')) ? String(d) : null);
  return garde(startedAt) || garde(enrolledAt) || null;
}

/**
 * Échéancier d'un frais attribué à un élève.
 *
 * @param {object} item          l’article du catalogue (periodicity, billing_periods, amount…)
 * @param {object} opts
 * @param {string} opts.academicYear  année scolaire visée
 * @param {string} [opts.startedAt]   date de souscription À CE SERVICE (ISO). PRIORITAIRE.
 * @param {string} [opts.enrolledAt]  date d'inscription de l'élève — repli seulement.
 * @param {number} [opts.amount]      montant d’UNE période (défaut : celui du frais)
 * @param {string} [opts.langue]      'fr' | 'en' | 'es' — fige le libellé affiché
 * @returns {Array} [{ period_key, period_label, amount_due }]
 *
 * LA RÈGLE DU MOIS D’ENTRÉE. Une période est écartée si elle est ENTIÈREMENT
 * écoulée avant le début du service ; le mois (ou le trimestre) pendant lequel
 * l'élève arrive est donc dû EN ENTIER, quel que soit le jour.
 *
 * Ce n'est pas une approximation faute de mieux : l'état de cantine de l'école
 * facture 7 500 à un élève entré le 15/10 et 15 000 à un autre entré le 17/11.
 * Le prorata n'y est pas une règle, c'est une décision prise au cas par cas. Le
 * déduire automatiquement amputerait la recette de chaque arrivant en cours de
 * mois, dans toutes les écoles, sans que personne ne l'ait demandé. L'école garde
 * la main : corriger le montant de la période, ou la déclarer non applicable.
 */
export function echeancierPour(item, { academicYear, startedAt, enrolledAt, amount, langue = 'fr' } = {}) {
  if (!item) return [];
  const annee = academicYear || item.academic_year;
  const montant = Number(amount ?? item.amount ?? 0) || 0;
  const periodes = periodesDuFrais(item, annee);

  // Début ramené au MOIS : comparer des mois entre eux évite les pièges de fuseau
  // et de fin de mois qu’une comparaison de dates complètes ramènerait.
  const debut = debutServiceEffectif({ startedAt, enrolledAt });
  const moisEntree = debut ? debut.slice(0, 7) : null;

  return periodes
    .filter((cle) => {
      if (!moisEntree) return true;
      const fin = moisFinal(cle);
      return !fin || fin >= moisEntree;   // période déjà close avant l’arrivée → écartée
    })
    .map((cle) => ({
      period_key: cle,
      period_label: libellePeriode(cle, langue),
      amount_due: montant,
    }));
}

// PREMIÈRE période réellement applicable à une souscription, ou null si le
// service commence après la dernière période facturée (souscription tardive sur
// un service déjà terminé). Sert à expliquer à l’école ce qu’elle vient de créer.
export function premierePeriodeApplicable(item, opts = {}) {
  const lignes = echeancierPour(item, opts);
  return lignes.length ? lignes[0].period_key : null;
}
/**
 * Statut d'une échéance. Un statut posé à la main par l'école (exempté,
 * abandonné, non applicable) l'emporte TOUJOURS sur le calcul : c'est une
 * décision, pas une déduction, et rien ne doit pouvoir la révoquer dans le dos
 * de celui qui l'a prise.
 */
export function statutEcheance({ amountDue = 0, amountPaid = 0, manualStatus = null } = {}) {
  if (manualStatus && STATUTS_MANUELS.has(manualStatus)) return manualStatus;
  const du = Number(amountDue) || 0;
  const paye = Number(amountPaid) || 0;
  if (du <= 0) return 'not_applicable';
  if (paye <= 0) return 'due';
  return paye >= du ? 'paid' : 'partial';
}

// VENTILATION d'un échéancier. Le relevé doit pouvoir dire, séparément, ce qui
// est PAYÉ, ce qui reste DÛ, et ce qui est sorti du dû — en distinguant les trois
// façons d'en sortir. Les confondre reviendrait à présenter à un parent « 45 000
// exemptés » alors que 15 000 sont une faveur de l’école, 15 000 un abandon de
// sa part à lui, et 15 000 un mois que l’école ne facture à personne.
//
// `exempted`, `abandoned` et `not_applicable` sortent tous du DÛ : une exemption
// qui continuerait d’alourdir le solde de la famille ne serait pas une exemption.
// Ce qui a déjà été versé sur une telle période reste compté dans le payé — cet
// argent est entré en caisse, le relevé ne peut pas faire comme s’il n’existait pas.
export function ventilationEcheancier(lignes = [], paiementsParPeriode = {}) {
  let du = 0, paye = 0, exempte = 0, abandonne = 0, nonApplicable = 0;
  for (const l of lignes) {
    const p = Number(paiementsParPeriode[l.period_key] || 0);
    const montant = Number(l.amount_due) || 0;
    const statut = statutEcheance({ amountDue: l.amount_due, amountPaid: p, manualStatus: l.status });
    paye += p;
    if (statut === 'exempted') { exempte += montant; continue; }
    if (statut === 'abandoned') { abandonne += montant; continue; }
    if (statut === 'not_applicable') { nonApplicable += montant; continue; }
    du += montant;
  }
  const horsDu = exempte + abandonne + nonApplicable;
  return { du, paye, solde: Math.max(0, du - paye), exempte, abandonne, nonApplicable, horsDu };
}

// Totaux d'un échéancier — contrat d'origine CONSERVÉ pour ses appelants : ici
// `exempte` désigne TOUT ce qui sort du dû, les trois décisions confondues. La
// ventilation détaillée est dans `ventilationEcheancier`, au-dessus.
export function totauxEcheancier(lignes = [], paiementsParPeriode = {}) {
  const v = ventilationEcheancier(lignes, paiementsParPeriode);
  return { du: v.du, paye: v.paye, solde: v.solde, exempte: v.horsDu };
}

// ── AFFECTER UN VERSEMENT AUX PÉRIODES ──────────────────────────────────────
// Le guichet ne raisonne pas en périodes : un parent pose 30 000 sur le
// comptoir et dit « pour la cantine ». C'est ici que cette somme devient
// « novembre soldé, décembre soldé », et nulle part ailleurs — un écran qui
// répartirait à sa façon finirait par diverger d'un autre écran.
//
// Solde d'UNE échéance. Une période portant une décision de l'école (exemptée,
// abandonnée, non applicable) vaut 0 : elle ne doit RIEN recevoir, sinon un
// encaissement révoquerait dans le dos de l'école ce qu'elle a décidé.
export function soldeEcheance(ligne, paye = null) {
  if (!ligne) return 0;
  const verse = Number(paye ?? ligne.amount_paid ?? 0) || 0;
  const statut = statutEcheance({
    amountDue: ligne.amount_due, amountPaid: verse, manualStatus: ligne.status,
  });
  if (STATUTS_MANUELS.has(statut)) return 0;
  return Math.max(0, (Number(ligne.amount_due) || 0) - verse);
}

/**
 * Répartit un versement sur les échéances d'un frais.
 *
 * LES PLUS ANCIENNES D'ABORD. C'est ce qui fait du rattrapage d'arriérés le
 * comportement par défaut : l'état de cantine de l'école montre des « 30 000 »
 * posés en janvier pour solder décembre ET janvier. Imputer au plus récent
 * laisserait au contraire une dette ancienne s'installer sous un compte qui
 * paraît à jour.
 *
 * TOUT OU RIEN quand l'école interdit le paiement partiel : la répartition
 * S'ARRÊTE à la première période que le reste ne couvre pas entièrement. Passer
 * à la suivante réglerait mars avant février — un arriéré masqué derrière un
 * mois vert, c'est exactement ce que le guichet ne doit pas pouvoir produire.
 *
 * @param {Array}  lignes   échéances de l'élève ({ id, period_key, period_label,
 *                          amount_due, amount_paid, status })
 * @param {number} montant  somme remise par la famille
 * @param {object} [opts]
 * @param {boolean} [opts.allowPartial=true]  `allow_partial` du frais
 * @returns {{affectations: Array, affecte: number, reste: number}}
 *          `reste` = ce que la répartition n'a PAS pu imputer. L'appelant décide
 *          quoi en faire ; il n'est jamais encaissé en douce sur rien.
 */
export function repartitionVersement(lignes = [], montant = 0, { allowPartial = true } = {}) {
  const total = Math.max(0, Math.floor(Number(montant) || 0));
  if (total <= 0) return { affectations: [], affecte: 0, reste: 0 };

  const candidates = (Array.isArray(lignes) ? lignes : [])
    .map((l) => ({ ligne: l, solde: soldeEcheance(l) }))
    .filter((x) => x.solde > 0)
    // `period_key` est bâtie pour se trier comme du texte ('2025-09' < '2025-10'),
    // ce qui évite de comparer des dates pour ordonner un échéancier.
    .sort((a, b) => String(a.ligne.period_key).localeCompare(String(b.ligne.period_key)));

  let reste = total;
  const affectations = [];
  for (const { ligne, solde } of candidates) {
    if (reste <= 0) break;
    const part = Math.min(reste, solde);
    if (!allowPartial && part < solde) break;      // tout ou rien, dans l'ordre
    affectations.push({
      schedule_id: ligne.id,
      period_key: ligne.period_key,
      period_label: ligne.period_label || libellePeriode(ligne.period_key),
      amount: part,
    });
    reste -= part;
  }
  return { affectations, affecte: total - reste, reste };
}

// Somme versée sur UNE échéance. Pure : elle ne connaît ni base ni réseau, et
// vit donc ici plutôt que dans la couche I/O qui l'exposait jusqu'alors.
//
// Les contre-passations entrent dans la somme comme les encaissements, avec
// leur montant NÉGATIF. Cela n’a rien d’un détail : annuler le versement de
// novembre doit remettre novembre à « dû ». Si la ligne négative ne portait pas
// la période, elle réduirait le total de l’élève sans jamais toucher le mois
// concerné — le relevé afficherait un mois payé que personne n’a payé.
export function paidForSchedule(scheduleId, payments = []) {
  return payments
    .filter((p) => p.fee_schedule_item_id === scheduleId)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
}
// ── DÉCIDER DU SORT D’UNE PÉRIODE ──────────────────────────────────────────
// Exempter, acter un abandon, déclarer une période non applicable : trois
// décisions de l'école, et non des déductions. Cette fonction dit si la décision
// est recevable ; elle ne l’applique pas.
//
// LA RÈGLE QUI PROTÈGE LA CAISSE. Une période sur laquelle de l’argent a été
// encaissé ne peut pas être requalifiée. Sans ce refus, relabelliser un mois
// suffirait à faire sortir une recette du dû sans la contre-passer : l’argent
// resterait en caisse, la dette disparaîtrait, et rien ne dirait où est passée la
// différence. L'ordre imposé est donc : contre-passer d'abord, décider ensuite —
// la contre-passation, elle, laisse deux écritures visibles et son motif.
//
// Un versement entièrement annulé ramène le net à zéro et rouvre la décision.
//
// `allow_exemption` ne gouverne QUE l’exemption. Un abandon est un fait — la
// famille a quitté le service — et « non applicable » une constatation ; ni l’un
// ni l’autre n’est une faveur que l’école pourrait s’interdire d’enregistrer.
//
// @returns {{ok: boolean, raison: string|null}} raison : statut_non_posable |
//          exemption_interdite | periode_payee
export function peutChangerStatut({
  nouveauStatut, verse = 0, allowExemption = true,
} = {}) {
  if (!STATUTS_POSABLES.includes(nouveauStatut)) {
    return { ok: false, raison: 'statut_non_posable' };
  }
  // Revenir au suivi automatique est toujours possible : c’est ce qui permet de
  // défaire une exemption posée par erreur, et cela ne fait disparaître aucune dette.
  if (nouveauStatut === 'due') return { ok: true, raison: null };
  if (nouveauStatut === 'exempted' && !allowExemption) {
    return { ok: false, raison: 'exemption_interdite' };
  }
  if ((Number(verse) || 0) > 0) {
    return { ok: false, raison: 'periode_payee' };
  }
  return { ok: true, raison: null };
}