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
const STATUTS_MANUELS = new Set(['exempted', 'abandoned', 'not_applicable']);

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

/**
 * Échéancier d'un frais attribué à un élève.
 *
 * @param {object} item          l'article du catalogue (periodicity, billing_periods, amount…)
 * @param {object} opts
 * @param {string} opts.academicYear  année scolaire visée
 * @param {string} [opts.enrolledAt]  date d'inscription de l'élève (ISO). Les périodes
 *                                    ENTIÈREMENT écoulées avant elle sont écartées.
 * @param {number} [opts.amount]      montant d'UNE période (défaut : celui du frais)
 * @param {string} [opts.langue]      'fr' | 'en' | 'es' — fige le libellé affiché
 * @returns {Array} [{ period_key, period_label, amount_due }]
 */
export function echeancierPour(item, { academicYear, enrolledAt, amount, langue = 'fr' } = {}) {
  if (!item) return [];
  const annee = academicYear || item.academic_year;
  const montant = Number(amount ?? item.amount ?? 0) || 0;
  const periodes = periodesDuFrais(item, annee);

  // `enrolledAt` ramené au mois : comparer des mois entre eux évite les pièges de
  // fuseau et de fin de mois qu'une comparaison de dates complètes ramènerait.
  const moisEntree = /^\d{4}-\d{2}/.test(String(enrolledAt || ''))
    ? String(enrolledAt).slice(0, 7) : null;

  return periodes
    .filter((cle) => {
      if (!moisEntree) return true;
      const fin = moisFinal(cle);
      return !fin || fin >= moisEntree;   // période déjà close avant l'arrivée → écartée
    })
    .map((cle) => ({
      period_key: cle,
      period_label: libellePeriode(cle, langue),
      amount_due: montant,
    }));
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

// Totaux d'un échéancier. `exempted`, `abandoned` et `not_applicable` sortent du
// DÛ : une exemption qui continuerait d'alourdir le solde de la famille ne serait
// pas une exemption.
export function totauxEcheancier(lignes = [], paiementsParPeriode = {}) {
  let du = 0, paye = 0, exempte = 0;
  for (const l of lignes) {
    const p = Number(paiementsParPeriode[l.period_key] || 0);
    const statut = statutEcheance({ amountDue: l.amount_due, amountPaid: p, manualStatus: l.status });
    if (STATUTS_MANUELS.has(statut)) { exempte += Number(l.amount_due) || 0; paye += p; continue; }
    du += Number(l.amount_due) || 0;
    paye += p;
  }
  return { du, paye, solde: Math.max(0, du - paye), exempte };
}
