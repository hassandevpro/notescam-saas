// ════════════════════════════════════════════════════════════════════════════
// PLANIFIER LA REPRISE D'UN REGISTRE EXCEL — ce qui serait écrit, et pourquoi
// ════════════════════════════════════════════════════════════════════════════
//
// Fonction PURE : elle ne touche ni la base ni le réseau. Elle rend un PLAN,
// qu'on peut lire, mesurer et faire relire avant que la moindre ligne ne parte.
// C'est la contrepartie de la règle du dépôt : on ne déclare pas écrit ce qui
// ne l'est pas, et on ne déverse pas cinq cents écritures financières sur la
// foi d'un script que personne n'a inspecté.
//
// ── CE QUE LE FICHIER SAIT, ET CE QU'IL NE SAIT PAS ────────────────────────
//
// Il sait : le tarif mensuel de chaque élève, son FRAIS ANNUEL, et trois
// montants versés, un par trimestre. Il ne sait PAS ce qui était dû par
// trimestre — et ça ne se déduit pas : l'annuel vaut huit mois chez eux, qui ne
// se répartissent pas en trois trimestres entiers.
//
// D'où le modèle retenu : **une seule échéance ANNUELLE** au montant annuel du
// fichier, et les trois versements imputés dessus. C'est exactement ce que le
// fichier affirme, et rien de plus. Les alternatives inventaient toutes :
//
//  • un tiers de l'annuel par trimestre → T1 apparaîtrait en trop-perçu et T3
//    en impayé pour presque tout le monde, alors que l'élève est à jour ;
//  • le versé pris pour le dû → tout le monde soldé, et les 1 030 500 réellement
//    dus s'évaporent. C'est la pire : elle efface une créance.
//
// Le trimestre n'est pas perdu : chaque versement le porte dans son libellé.
//
// ── LA DATE DES VERSEMENTS ─────────────────────────────────────────────────
//
// Le fichier ne donne aucun jour. On ne reconstitue pas 528 dates de mémoire :
// chaque versement est daté de la FIN DE SON TRIMESTRE, porte la mention
// « reprise du registre Excel », et `recorded_by` reste NULL.
//
// Ce dernier point n'est pas cosmétique. `cashSessionEngine.sessionEntries`
// filtre sur `p.date === date && p.recorded_by === cashierId` : un versement
// repris au nom d'un caissier entrerait dans SON arrêté de caisse, qui
// réclamerait alors des millions en espèces dans le tiroir. Sans caissier,
// aucun arrêté ne les revendique. Le journal de caisse, lui, ne lit pas
// `fee_payments` du tout — il n'est pas concerné.
//
// Les dates viennent des `academic_periods` de type 'trimestre' de l'école
// quand elle les a saisies ; sinon d'une convention, et le plan DIT laquelle.
//
// ── L'ANNÉE SCOLAIRE : CELLE DU FICHIER, PAS CELLE D'AUJOURD'HUI ───────────
//
// Les douze seules vraies dates du classeur de THE GENIUS courent du 2025-09-22
// au 2026-02-04 : « TRANSPORT 2026 » est l'année 2025-2026. L'importer dans
// l'année en cours ferait devoir de l'argent à 211 élèves qui n'en doivent pas,
// et gonflerait les recettes de l'exercice de treize millions. L'année est donc
// un paramètre EXPLICITE, jamais `school.current_year` par défaut.

// Les anomalies qui interdisent d'écrire une ligne. Les autres sont des
// signalements : l'école tranchera, la ligne passe.
//
//  • `plusieurs_eleves` / `effectif_inconnu` : « FAMILLE FOMETEU (04) » porte
//    quatre enfants. Inventer quatre noms est hors de question.
//  • `sans_tarif` : sans montant, l'écriture n'a pas d'objet.
//  • `reste_incoherent` : la feuille se contredit (60 000 − 35 000 = 25 000, et
//    elle écrit 2 500). Écrire l'un OU l'autre, c'est trancher à la place de
//    l'école, sur de l'argent.
export const ANOMALIES_BLOQUANTES = Object.freeze([
  'plusieurs_eleves', 'effectif_inconnu', 'sans_tarif', 'reste_incoherent',
]);

// La convention de repli, quand l'école n'a pas saisi ses trimestres. Dernier
// jour du mois, parce qu'aucun versement réel ne tombe « le 31 décembre » par
// hasard : la date se lit tout de suite comme conventionnelle.
const FIN_CONVENTION = { T1: '12-31', T2: '03-31', T3: '06-30' };

/** Les deux années d'un libellé « 2025-2026 ». */
export function anneesDe(academicYear) {
  const m = String(academicYear || '').match(/(\d{4})\D+(\d{4})/);
  if (m) return [Number(m[1]), Number(m[2])];
  const seul = String(academicYear || '').match(/(\d{4})/);
  return seul ? [Number(seul[1]), Number(seul[1]) + 1] : [null, null];
}

/**
 * La date de reprise d'un trimestre, et SA PROVENANCE — qui doit figurer au
 * plan : une date d'école et une date de convention ne s'assument pas pareil.
 */
export function dateDeReprise(trimestre, { periodes = [], academicYear } = {}) {
  const num = Number(String(trimestre).replace(/\D/g, '')) || 0;
  const [a1, a2] = anneesDe(academicYear);

  // 1. Ce que l'école a saisi.
  const sienne = (periodes || []).find((p) => {
    if (p?.type !== 'trimestre') return false;
    if (academicYear && p.school_year && p.school_year !== academicYear) return false;
    const n = Number(String(p.name ?? '').replace(/\D/g, '')) || p.sequence_order;
    return n === num;
  });
  if (sienne?.teaching_end) return { date: sienne.teaching_end, source: 'ecole' };

  // 2. La convention, énoncée.
  const suffixe = FIN_CONVENTION[`T${num}`];
  if (!suffixe || !a1) return { date: null, source: 'inconnue' };
  const annee = num === 1 ? a1 : a2;
  return { date: `${annee}-${suffixe}`, source: 'convention' };
}

const ent = (v) => Math.max(0, Math.floor(Number(v) || 0));

/**
 * Construit le plan de reprise.
 *
 * @param {object}   o
 * @param {object}   o.lecture        la sortie de `lireRegistre`
 * @param {string}   o.serviceNom     « Transport »
 * @param {string}   o.academicYear   l'année DU FICHIER, explicitement
 * @param {Array}   [o.periodes]      `academic_periods` de l'école
 * @param {string}  [o.mention]       la mention portée sur chaque écriture
 * @returns {{ aEcrire: Array, ecartes: Array, dates: object, resume: object }}
 */
export function planifierReprise({
  lecture, serviceNom = 'Service', academicYear,
  periodes = [], mention = 'reprise du registre Excel',
  // ── LA PORTÉE ────────────────────────────────────────────────────────────
  //
  // 'historique' : on reprend l'année DU FICHIER telle qu'elle a été vécue —
  //   abonnements, échéance annuelle, ET les versements déjà encaissés. C'est
  //   la reprise comptable, et elle demande les dates conventionnelles.
  //
  // 'annee_courante' : on ne reprend du fichier que ce qui SERT ENCORE — qui
  //   est abonné, à quel tarif, depuis quelle résidence — et on l'installe sur
  //   l'année en cours. AUCUN versement n'est écrit : l'argent de l'an dernier
  //   n'a rien à faire dans l'exercice de cette année, et il n'y a donc aucune
  //   date à inventer. Les élèves SORTIS sont laissés dehors : ils ne prennent
  //   plus le bus, les réabonner leur ferait devoir une année entière.
  portee = 'historique',
  // ── FAUT-IL CRÉER L'ÉCHÉANCE ? ───────────────────────────────────────────
  //
  // Une échéance est une CRÉANCE : 190 échéances annuelles, ce sont treize
  // millions que l'école réclamera à des parents, calculés sur les montants de
  // l'an dernier. Et le fichier ne dit pas comment l'année se découpe : son
  // annuel vaut huit mois, qui ne tombent pas en trois trimestres entiers.
  //
  // Sur l'année en cours, on écrit donc par défaut l'ABONNEMENT SEUL : qui
  // prend le bus, à quel tarif, depuis quelle résidence. C'est la partie du
  // fichier qui sert encore, elle ne réclame rien à personne, et elle se défait
  // d'un clic. L'école génère ensuite ses échéances depuis l'écran, avec la
  // périodicité et le découpage qu'ELLE choisit — mensuel ou trimestriel.
  //
  // `avecEcheances: true` les crée quand même, et c'est alors un choix énoncé.
  avecEcheances = null,
} = {}) {
  const courante = portee === 'annee_courante';
  const posesEcheances = avecEcheances === null ? !courante : Boolean(avecEcheances);
  const eleves = lecture?.eleves || [];
  const anneeSource = lecture?.anneeSource || null;
  const anomalies = lecture?.anomalies || [];
  const [a1] = anneesDe(academicYear);

  // Les lignes interdites, repérées par leur numéro de ligne dans le classeur.
  const interdites = new Map();
  for (const a of anomalies) {
    if (!ANOMALIES_BLOQUANTES.includes(a.type)) continue;
    interdites.set(a.ligne, [...(interdites.get(a.ligne) || []), a]);
  }

  const dates = {};
  for (const tr of ['T1', 'T2', 'T3']) dates[tr] = dateDeReprise(tr, { periodes, academicYear });

  // La clé de l'échéance annuelle suit la convention du moteur : première année.
  const clePeriode = a1 ? `${a1}-annee` : 'annee';
  const libellePeriode = academicYear ? `Année ${academicYear}` : 'Année';

  const aEcrire = [];
  const ecartes = [];

  for (const e of eleves) {
    const motifs = interdites.get(e.source?.ligne) || [];
    if (motifs.length) {
      ecartes.push({ ...e, pourquoi: motifs.map((m) => m.message) });
      continue;
    }
    // Un élève SORTI ne se réabonne pas : lui créer une échéance pour l'année
    // en cours lui ferait devoir une année de transport qu'il ne prend pas.
    if (courante && e.sortant) {
      ecartes.push({ ...e, pourquoi: [`sorti du service (${e.motif || 'motif non noté'}) — non réabonné`] });
      continue;
    }
    // Le détail dit ce que le fichier savait, et le dit pour longtemps : dans
    // deux ans, « 7 500/mois · résidence ADINA MOTO » est la seule trace de
    // pourquoi cet élève payait ce prix-là.
    const detail = [
      e.tarif ? `${e.tarif}/mois` : '',
      e.residence ? `résidence ${e.residence}` : '',
      e.sortant ? `SORTI — ${e.motif || 'motif non noté'}` : '',
      mention,
    ].filter(Boolean).join(' · ');

    // Sur l'année en cours, le montant VIENT DU REGISTRE DE L'AN DERNIER. Le
    // dire sur l'échéance n'est pas une politesse : c'est ce qui permettra à
    // l'école de corriger un tarif qui a changé, au lieu de le découvrir
    // quand un parent contestera.
    const detailCourant = courante
      ? `${detail} — montant repris du registre ${anneeSource || 'précédent'}, à confirmer`
      : detail;

    // AUCUN VERSEMENT sur l’année en cours : l’argent encaissé l’an dernier
    // n’appartient pas à cet exercice. Rien à reprendre, donc aucune date à
    // inventer et aucun arrêté de caisse à troubler.
    const versements = [];
    for (const v of courante ? [] : e.versements) {
      const d = dates[v.trimestre];
      if (!d?.date || v.montant <= 0) continue;
      versements.push({
        amount: ent(v.montant),
        date: d.date,
        dateSource: d.source,
        period_key: clePeriode,
        note: `${serviceNom} — ${v.trimestre} ${academicYear || ''} (${mention})`.replace(/\s+/g, ' ').trim(),
        // JAMAIS un caissier : sinon son arrêté réclame cet argent en espèces.
        recorded_by: null,
        method: null,
      });
    }

    // Les tableaux « sortis » et « relevé » ne donnent qu'un CUMUL, pas trois
    // versements. On écrit alors une seule écriture, et le plan la signale :
    // un cumul n'est pas une écriture de caisse, et le confondre avec une vraie
    // ferait croire à un encaissement unique qui n'a jamais eu lieu.
    let cumul = false;
    if (!courante && !versements.length && e.paye > 0) {
      const d = dates.T3?.date ? dates.T3 : dates.T1;
      if (d?.date) {
        cumul = true;
        versements.push({
          amount: ent(e.paye), date: d.date, dateSource: d.source,
          period_key: clePeriode,
          note: `${serviceNom} — cumul ${academicYear || ''} (${mention})`.replace(/\s+/g, ' ').trim(),
          recorded_by: null, method: null,
        });
      }
    }

    aEcrire.push({
      source: e.source,
      nom: e.nom,
      classe: e.classe,
      residence: e.residence,
      sortant: e.sortant,
      motif: e.motif,
      // L'ABONNEMENT porte l'engagement ANNUEL, parce que c'est ce que le
      // fichier affirme. Le tarif mensuel vit dans le détail de l'échéance :
      // il renseigne, il n'engage pas.
      abonnement: {
        name: serviceNom,
        amount: ent(e.annuel),
        academic_year: academicYear || null,
        payment_type: 'annuel',
        started_at: a1 ? `${a1}-09-01` : null,
      },
      // UNE échéance annuelle. Le statut n'est pas posé à la main : il se
      // CALCULE depuis le payé, comme partout ailleurs dans le produit.
      echeances: posesEcheances ? [{
        period_key: clePeriode,
        period_label: libellePeriode,
        amount_due: ent(e.annuel),
        status: 'due',
        notes: courante ? detailCourant : detail,
      }] : [],
      versements,
      cumul,
      attendu: ent(e.annuel),
      encaisse: versements.reduce((s, v) => s + v.amount, 0),
    });
  }

  const somme = (l, f) => l.reduce((s, x) => s + f(x), 0);
  const resume = {
    portee,
    avecEcheances: posesEcheances,
    annee: academicYear || null,
    anneeSource,
    eleves: aEcrire.length,
    ecartes: ecartes.length,
    sortants: aEcrire.filter((x) => x.sortant).length,
    echeances: somme(aEcrire, (x) => x.echeances.length),
    versements: somme(aEcrire, (x) => x.versements.length),
    cumuls: aEcrire.filter((x) => x.cumul).length,
    // Sans échéance, rien n’est réclamé : l’attendu est ZÉRO, et le tarif
    // lu reste visible sous `tarifs` pour que l’école le retrouve.
    attendu: posesEcheances ? somme(aEcrire, (x) => x.attendu) : 0,
    engagementLu: somme(aEcrire, (x) => x.attendu),
    encaisse: somme(aEcrire, (x) => x.encaisse),
    restant: posesEcheances ? somme(aEcrire, (x) => Math.max(0, x.attendu - x.encaisse)) : 0,
    dates,
    datesConventionnelles: Object.values(dates).filter((d) => d.source === 'convention').length,
    // Un versement sans caissier ne peut pas polluer un arrêté de caisse.
    sansCaissier: somme(aEcrire, (x) => x.versements.filter((v) => v.recorded_by === null).length),
  };

  return { aEcrire, ecartes, dates, resume };
}

// ════════════════════════════════════════════════════════════════════════════
// CE QUI PARTIRAIT VRAIMENT — après rapprochement, avant écriture
// ════════════════════════════════════════════════════════════════════════════
//
// Le plan dit qui est reprenable, le rapprochement dit qui est identifiable.
// Reste une dernière question, et c'est celle qui coûte de l'argent : cet élève
// est-il DÉJÀ abonné à ce service cette année ?
//
// `upsertStudentFeeItem` tire un identifiant neuf à chaque appel. Importer deux
// fois le même classeur — ce qui arrive, l'école reprend son fichier corrigé —
// créerait donc un SECOND abonnement au même enfant, et le service lui serait
// facturé deux fois. Ce filtre est la seule chose qui l'empêche, et c'est pour
// ça qu'il vit ici, dans le moteur, avec un banc, et non dans l'écran.
//
// La fonction rend aussi `rejets` : TOUT ce qui ne sera pas écrit, d'un seul
// tenant et avec son motif. C'est la liste que l'école reçoit, et elle doit
// être complète — un rejet silencieux, c'est un élève que personne ne cherche.
export function trancherEcriture({ plan = null, rappro = null, dejaAbonnes = [] } = {}) {
  const deja = dejaAbonnes instanceof Set ? dejaAbonnes : new Set(dejaAbonnes || []);
  const candidats = rappro?.prets || [];

  const prets = candidats.filter((x) => !deja.has(x.student_id));
  const doublons = candidats.filter((x) => deja.has(x.student_id));

  const rejets = [
    // Écartés par le plan : plusieurs enfants sur une ligne, feuille qui se
    // contredit, élève sorti du service.
    ...(plan?.ecartes || []).map((x) => ({
      ...x, etat: 'ecarte', raison: (x.pourquoi || []).join(' | '),
    })),
    // Non identifiables : introuvables, homonymes, deux lignes pour un élève.
    ...(rappro?.aTrancher || []).map((x) => ({
      ...x,
      raison: x.message || (x.candidats || [])
        .map((c) => `${c.name} (${c.className || '?'})`).join(' / '),
    })),
    // Déjà abonnés : rien à faire, mais il faut le DIRE, sinon l'école compte
    // ses abonnés et trouve un écart qu'elle ne sait pas expliquer.
    ...doublons.map((x) => ({
      ...x, etat: 'deja_abonne',
      raison: `${x.eleveBase?.name || x.nom} (${x.eleveBase?.className || '?'})`,
    })),
  ];

  return {
    prets,
    rejets,
    resume: {
      lignesDuFichier: (plan?.aEcrire?.length || 0) + (plan?.ecartes?.length || 0),
      prets: prets.length,
      rejets: rejets.length,
      dejaAbonnes: doublons.length,
      ecartes: (plan?.ecartes || []).length,
      aTrancher: (rappro?.aTrancher || []).length,
      // Le total doit se refermer : chaque ligne du fichier est soit écrite,
      // soit rejetée avec un motif. Rien ne disparaît entre les deux.
      boucle: prets.length + rejets.length
        === (plan?.aEcrire?.length || 0) + (plan?.ecartes?.length || 0),
    },
  };
}
