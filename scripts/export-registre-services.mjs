// EXPORT DE L'ÉCRAN « REGISTRE DES SERVICES » POUR UNE REFONTE FRONT-END.
//
//   node scripts/export-registre-services.mjs
//
// Produit docs/refonte-registre-services/*.json : ce qu'un développeur front
// qui ne connaît pas ce dépôt doit avoir sous les yeux pour redessiner
// `src/pages/Cantine.jsx` et ses trois onglets sans rien casser.
//
// ── POURQUOI UN SCRIPT, ET NON UN JSON ÉCRIT À LA MAIN ─────────────────────
//
// Les valeurs livrées (grille, états mensuels, totaux, quote-part) ne sont PAS
// recopiées : elles sortent du moteur réel — `src/lib/cantineEngine.js` et
// `src/lib/feeScheduleEngine.js`, importés ci-dessous. Un jeu d'essai écrit à
// la main dérive du code au premier changement de règle, et le dev refait sa
// maquette sur des chiffres faux. Ici il suffit de relancer le script.
//
// ── LES NOMS SONT INVENTÉS, ET C'EST VOLONTAIRE ───────────────────────────
//
// Le registre réel porte 78 abonnés de THE GENIUS : des enfants mineurs, avec
// leur classe et ce que leur famille doit. Ces lignes-là ne sortent pas du
// dépôt pour une maquette. La STRUCTURE et les ORDRES DE GRANDEUR sont réels
// (relevés en base le 2026-11-03, voir `source` dans le JSON produit) ; les
// noms, matricules et identifiants sont fabriqués.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  moisDuService, enteteMois, tarifPleinDe, grilleCantine, etatsMensuels,
  motPeriode, pastilleCellule, CONVENTIONS, TEXTE_CONVENTION, TAUX_DEMI_MOIS,
} from '../src/lib/cantineEngine.js';
import {
  SCHEDULE_STATUS, STATUTS_POSABLES, paidForSchedule,
} from '../src/lib/feeScheduleEngine.js';

const ici = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ici, '..', 'docs', 'refonte-registre-services');

const ANNEE = '2026-2027';

// ── CE QUI A ÉTÉ RELEVÉ EN BASE DE PRODUCTION (LECTURE SEULE) ─────────────
// Les ordres de grandeur que la maquette doit tenir. Mesuré le 2026-11-03 sur
// le projet Cloud, école « THE GENIUS INTERNATIONAL SCHOOL & COLLEGE ».
const SOURCE = {
  releve_le: '2026-11-03',
  base: 'Supabase (édition Cloud), école THE GENIUS INTERNATIONAL SCHOOL & COLLEGE',
  devise: 'XAF',
  annee_scolaire: ANNEE,
  eleves_dans_l_ecole: 716,
  classes_dans_l_ecole: 28,
  services_a_abonnement: 2,
  service_cantine: {
    tarif_mensuel: 15000, quote_part: 3500, periodicite: 'mensuel',
    abonnements: 78, echeances_creees: 146, paiements_rattaches: 144,
    mois_factures_a_ce_jour: ['2026-09', '2026-10'],
  },
  service_transport: { tarif_affiche: 10000, quote_part: null, abonnements: 0 },
  // Relevé dans le classeur Excel réel de l'école, pas en base : le registre
  // transport porte TREIZE tarifs mensuels selon la résidence de l'élève.
  // C'est ce qui oblige la grille à connaître un tarif PAR ÉLÈVE.
  tarifs_transport_reels: [5000, 6000, 7000, 7500, 8000, 9000, 10000, 11000,
    12000, 12500, 13000, 14000, 15000],
  avertissement: 'Noms, matricules et UUID du jeu d’essai sont inventés. '
    + 'Les montants, classes, clés de période et statuts sont ceux du réel.',
};

// Les 28 classes de l'école, telles qu'elles s'appellent vraiment. Un nom de
// classe est ce que l'école tape : « 6eme », « Class 1 B », « CP BIL »,
// « PRE-MATERNELLE A ». La maquette doit supporter ces longueurs-là.
const CLASSES = [
  { id: 'c-pre-a', name: 'PRE-MATERNELLE A', cycle: 'maternelle' },
  { id: 'c-nur1b', name: 'NURSERY 1 B', cycle: 'maternelle' },
  { id: 'c-nur2b', name: 'NURSERY 2 B', cycle: 'maternelle' },
  { id: 'c-creche', name: 'CRECHES', cycle: 'maternelle' },
  { id: 'c-sil', name: 'SIL', cycle: 'primaire' },
  { id: 'c-cp-bil', name: 'CP BIL', cycle: 'primaire' },
  { id: 'c-cl1b', name: 'Class 1 B', cycle: 'primaire' },
  { id: 'c-ce2', name: 'CE2', cycle: 'primaire' },
  { id: 'c-cm2', name: 'CM2', cycle: 'primaire' },
  { id: 'c-form1', name: 'FORM1', cycle: 'secondaire' },
  { id: 'c-6eme', name: '6eme', cycle: 'secondaire' },
  { id: 'c-5eme', name: '5eme', cycle: 'secondaire' },
];
const classeParId = Object.fromEntries(CLASSES.map((c) => [c.id, c]));

// ── LE SERVICE AFFICHÉ ────────────────────────────────────────────────────
// `fee_catalog`, catégorie `cantine`. Valeurs réelles.
const SERVICE = {
  id: 'svc-cantine', school_id: 'ecole-1', name: 'Cantine', category: 'cantine',
  amount: 15000, quote_part: 3500, academic_year: ANNEE,
  periodicity: 'mensuel', billing_periods: '[]',
  mandatory: false, optional: true, payment_type: 'echelonne',
  allow_partial: true, allow_exemption: true, active: true, position: 0,
};

// Le second service du même écran, choisi dans le menu déroulant : même page,
// même grille, mais périodicité TRIMESTRIELLE et un tarif par élève. Il est
// là pour que la maquette ne suppose pas « douze colonnes de mois ».
const SERVICE_TRANSPORT = {
  id: 'svc-transport', school_id: 'ecole-1', name: 'Transport', category: 'transport',
  amount: 10000, quote_part: null, academic_year: ANNEE,
  periodicity: 'trimestriel', billing_periods: '[]',
  mandatory: false, optional: true, payment_type: 'echelonne',
  allow_partial: true, allow_exemption: true, active: true, position: 1,
};

// ── LES ABONNÉS DU JEU D'ESSAI ────────────────────────────────────────────
// Un scénario par cas que l'écran doit savoir peindre. `m` donne, pour chaque
// mois facturé, ce que porte l'échéance : `du` le montant dû, `paye` ce qui a
// été imputé, `st` un statut POSÉ À LA MAIN (exempté, abandon, sans objet).
// Un mois absent de `m` = AUCUNE échéance : « non inscrit », et non « dû à
// zéro » — la nuance décide si l'élève entre dans les états du mois.
const PLEIN = 15000;
const DEMI = 7500;

const SCENARIOS = [
  { id: 's01', nom: 'ABENA NGOLO Pélagie', mat: 'M260101', classe: 'c-nur2b',
    cas: 'À jour sur tous les mois facturés — le cas le plus fréquent',
    m: { '2026-09': { du: PLEIN, paye: PLEIN }, '2026-10': { du: PLEIN, paye: PLEIN },
      '2026-11': { du: PLEIN, paye: PLEIN }, '2027-01': { du: PLEIN, paye: PLEIN },
      '2027-02': { du: PLEIN, paye: PLEIN }, '2027-03': { du: PLEIN, paye: PLEIN } } },

  { id: 's02', nom: 'BIKOI MANGA Thierry', mat: 'M260102', classe: 'c-form1',
    cas: 'Impayé total : facturé six mois, rien encaissé',
    m: { '2026-09': { du: PLEIN, paye: 0 }, '2026-10': { du: PLEIN, paye: 0 },
      '2026-11': { du: PLEIN, paye: 0 }, '2027-01': { du: PLEIN, paye: 0 },
      '2027-02': { du: PLEIN, paye: 0 }, '2027-03': { du: PLEIN, paye: 0 } } },

  { id: 's03', nom: 'CHOUNA TAGNE Mireille', mat: 'M260103', classe: 'c-ce2',
    cas: 'Partiel : un mois réglé en partie (7 000 sur 15 000)',
    m: { '2026-09': { du: PLEIN, paye: PLEIN }, '2026-10': { du: PLEIN, paye: 7000 },
      '2026-11': { du: PLEIN, paye: 0 }, '2027-01': { du: PLEIN, paye: 0 } } },

  { id: 's04', nom: 'DJOUMESSI FOTSO Armand', mat: 'M260104', classe: 'c-cl1b',
    cas: 'Demi-mois : entré en cours de septembre, 7 500 au lieu de 15 000',
    m: { '2026-09': { du: DEMI, paye: DEMI }, '2026-10': { du: PLEIN, paye: PLEIN },
      '2026-11': { du: PLEIN, paye: 0 }, '2027-01': { du: PLEIN, paye: 0 } } },

  { id: 's05', nom: 'EYENGA ATANGANA Clarisse', mat: 'M260105', classe: 'c-cm2',
    cas: 'Abandon en janvier : les mois suivants portent le statut « abandoned »',
    m: { '2026-09': { du: PLEIN, paye: PLEIN }, '2026-10': { du: PLEIN, paye: PLEIN },
      '2026-11': { du: PLEIN, paye: PLEIN }, '2027-01': { du: PLEIN, paye: 0, st: 'abandoned' },
      '2027-02': { du: PLEIN, paye: 0, st: 'abandoned' },
      '2027-03': { du: PLEIN, paye: 0, st: 'abandoned' } } },

  { id: 's06', nom: 'FOUDA NKOA Serge', mat: 'M260106', classe: 'c-6eme',
    cas: 'Exempté toute l’année (enfant du personnel)',
    m: { '2026-09': { du: PLEIN, paye: 0, st: 'exempted' },
      '2026-10': { du: PLEIN, paye: 0, st: 'exempted' },
      '2026-11': { du: PLEIN, paye: 0, st: 'exempted' },
      '2027-01': { du: PLEIN, paye: 0, st: 'exempted' } } },

  { id: 's07', nom: 'GWETH NDOUMBE Sandrine', mat: 'M260107', classe: 'c-sil',
    cas: 'Abonnée en novembre : septembre et octobre n’ont AUCUNE échéance (« / »)',
    m: { '2026-11': { du: PLEIN, paye: PLEIN }, '2027-01': { du: PLEIN, paye: PLEIN },
      '2027-02': { du: PLEIN, paye: 0 } } },

  { id: 's08', nom: 'HAMADOU BELLO Idrissou', mat: 'M260108', classe: 'c-5eme',
    cas: 'Abonné mais AUCUN mois facturé : « Rien dû », bouton Encaisser inactif',
    m: {} },

  { id: 's09', nom: 'IBRAHIM MOUSSA Farida', mat: 'M260109', classe: 'c-cp-bil',
    cas: 'Mois réglé en deux versements (10 000 + 5 000) : soldé, deux reçus',
    m: { '2026-09': { du: PLEIN, versements: [10000, 5000] },
      '2026-10': { du: PLEIN, paye: 0 } } },

  { id: 's10', nom: 'JIOFACK TCHOUTA Blandine', mat: 'M260110', classe: 'c-nur1b',
    cas: 'Contre-passation : un versement de 15 000 annulé, l’échéance redevient due',
    m: { '2026-09': { du: PLEIN, versements: [PLEIN, -PLEIN] },
      '2026-10': { du: PLEIN, paye: PLEIN } } },

  { id: 's11', nom: 'KAMGA NJIKE Christian', mat: 'M260111', classe: 'c-pre-a',
    cas: 'Homonyme n°1 — deux élèves du même nom : seul le matricule les sépare',
    m: { '2026-09': { du: PLEIN, paye: PLEIN }, '2026-10': { du: PLEIN, paye: 0 } } },

  { id: 's12', nom: 'KAMGA NJIKE Christian', mat: 'M260112', classe: 'c-cl1b',
    cas: 'Homonyme n°2 — même nom, autre classe, autre solde',
    m: { '2026-09': { du: PLEIN, paye: 0 }, '2026-10': { du: PLEIN, paye: 0 } } },

  { id: 's13', nom: 'MBOUOMBOUO NSANGOU ABDOUL KARIMOU NCHARE', mat: 'M260113',
    classe: 'c-creche',
    cas: 'Nom très long : vérifie la troncature, jamais de débordement horizontal',
    m: { '2026-09': { du: PLEIN, paye: PLEIN }, '2026-10': { du: PLEIN, paye: 7500 } } },

  { id: 's14', nom: 'NANA SILEYAH Grâce', mat: 'M260114', classe: null,
    cas: 'Élève sans classe affectée : la ligne affiche « — » sous le nom',
    m: { '2026-09': { du: PLEIN, paye: 0 }, '2026-10': { du: PLEIN, paye: 0 } } },

  { id: 's15', nom: 'ONANA BILOA Évariste', mat: 'M260115', classe: 'c-form1',
    cas: 'Mois « sans objet » posé à la main en février (voyage scolaire)',
    m: { '2026-09': { du: PLEIN, paye: PLEIN }, '2026-10': { du: PLEIN, paye: PLEIN },
      '2027-02': { du: PLEIN, paye: 0, st: 'not_applicable' } } },

  { id: 's16', nom: 'ZANGUE TCHIO Ornella', mat: 'M260116', classe: 'c-cm2',
    cas: 'Dernier de la liste au tri alphabétique, soldé — borne du tri',
    m: { '2026-09': { du: PLEIN, paye: PLEIN }, '2026-10': { du: PLEIN, paye: PLEIN } } },
];

// ── CONSTRUCTION DES TABLES, EXACTEMENT COMME EN BASE ─────────────────────
// Trois tables, et le lien qui les joint : `student_fee_items` porte le
// `fee_catalog_id` (c'est l'ABONNEMENT), `fee_schedule_items` porte le
// `student_fee_item_id` (c'est l'ÉCHÉANCE du mois), `fee_payments` porte le
// `fee_schedule_item_id` (c'est le VERSEMENT imputé). Sans l'abonnement on ne
// peut pas distinguer l'échéance de cantine de celle du transport, même mois.
const MOIS_LABEL = {
  '2026-09': 'Septembre 2026', '2026-10': 'Octobre 2026', '2026-11': 'Novembre 2026',
  '2026-12': 'Décembre 2026', '2027-01': 'Janvier 2027', '2027-02': 'Février 2027',
  '2027-03': 'Mars 2027', '2027-04': 'Avril 2027', '2027-05': 'Mai 2027',
  '2027-06': 'Juin 2027',
};

const eleves = [];
const abonnements = [];
const echeances = [];
const paiements = [];
let recu = 968;   // les numéros de reçu réels tournaient autour de 968

for (const s of SCENARIOS) {
  const cl = s.classe ? classeParId[s.classe] : null;
  eleves.push({
    id: s.id, school_id: 'ecole-1', name: s.nom, matricule: s.mat,
    class_id: s.classe, class_name: cl?.name || '', cycle: cl?.cycle || null,
    archived_at: null, _cas: s.cas,
  });

  const abo = {
    id: `abo-${s.id}`, school_id: 'ecole-1', student_id: s.id,
    fee_catalog_id: SERVICE.id, academic_year: ANNEE, name: 'Cantine',
    category: 'cantine', amount: PLEIN, mandatory: false,
    payment_type: 'echelonne', status: 'active', started_at: '2026-09-01',
  };
  abonnements.push(abo);

  for (const [cle, d] of Object.entries(s.m)) {
    const idEch = `ech-${s.id}-${cle}`;
    echeances.push({
      id: idEch, school_id: 'ecole-1', student_id: s.id,
      student_fee_item_id: abo.id, academic_year: ANNEE,
      period_key: cle, period_label: MOIS_LABEL[cle],
      amount_due: d.du, status: d.st || 'due', notes: null,
    });
    const versements = d.versements || (d.paye ? [d.paye] : []);
    versements.forEach((montant, i) => {
      paiements.push({
        id: `pay-${s.id}-${cle}-${i}`, school_id: 'ecole-1', student_id: s.id,
        academic_year: ANNEE, amount: montant, date: `${cle}-05`,
        student_fee_item_id: abo.id, fee_schedule_item_id: idEch,
        method: montant < 0 ? 'annulation' : 'especes',
        receipt_no: ++recu, recorded_by_name: 'Secrétariat',
        reversal_of: montant < 0 ? `pay-${s.id}-${cle}-${i - 1}` : null,
        void_reason: montant < 0 ? 'Chèque sans provision' : null,
      });
    });
  }
}

// ── LE MOTEUR, APPELÉ EXACTEMENT COMME LA PAGE L'APPELLE ──────────────────
// `src/pages/Cantine.jsx` l.176-230 et l.260-292. Rien n'est recalculé ici :
// ce sont les mêmes fonctions, donc les mêmes chiffres qu'à l'écran.
const faux = (t) => t;   // `t(fr, en, es)` → on garde le français

const mois = moisDuService(SERVICE, ANNEE);
const entete = enteteMois(mois);
const tarifPlein = tarifPleinDe(SERVICE);
const quotePart = SERVICE.quote_part ?? null;
const mot = motPeriode(SERVICE, faux);

// `eleves` tel que la page le façonne (l.197-208) : nom composé, classe
// résolue, matricule reporté.
const elevesGrille = eleves.map((e) => ({
  id: e.id, name: e.name, className: e.class_name, matricule: e.matricule,
}));

// Le tarif PROPRE à chaque élève (l.215-223) : ici tout le monde est à 15 000
// à la cantine. Au transport il y en a treize différents — voir SOURCE.
const tarifParEleve = Object.fromEntries(abonnements
  .filter((a) => a.fee_catalog_id === SERVICE.id && a.status !== 'removed' && a.amount > 0)
  .map((a) => [a.student_id, a.amount]));

const grille = grilleCantine({
  eleves: elevesGrille, echeances, paiements, mois, tarifPlein, tarifParEleve,
});
const { parMois, total } = etatsMensuels({ grille, mois, quotePart });

// La liste des abonnés (l.284-297) : la grille, lue par élève.
const STATUT_ABONNE = {
  a_jour: ['À jour', 'Up to date', 'Al día'],
  partiel: ['Partiel', 'Partial', 'Parcial'],
  impaye: ['Impayé', 'Unpaid', 'Impago'],
  sans_dette: ['Rien dû', 'Nothing due', 'Nada debido'],
};
const abonnes = grille.map((r) => ({
  ...r,
  moisCrees: r.cellules.filter((c) => c.echeance_id).length,
  section: classeParId[eleves.find((e) => e.id === r.student_id)?.class_id]?.cycle || 'autre',
  statut: r.du <= 0 ? 'sans_dette' : r.reste <= 0 ? 'a_jour' : r.paye > 0 ? 'partiel' : 'impaye',
}));
const abonnesTries = [...abonnes].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

// ── CE QUE LE DEV REÇOIT ──────────────────────────────────────────────────
const fixture = {
  $schema: 'aucun — JSON de travail, décrit par CONTRAT.md à côté',
  genere_par: 'scripts/export-registre-services.mjs',
  genere_le: new Date().toISOString().slice(0, 10),
  ecran: {
    titre: 'Registre des services',
    route: '/cantine',
    fichier: 'src/pages/Cantine.jsx',
    onglets: ['liste', 'grille', 'resume'],
    onglet_par_defaut: 'liste',
    utilisatrice: 'la secrétaire de l’école',
    trois_gestes: ['trouver un élève', 'encaisser', 'imprimer'],
  },
  source: SOURCE,

  // 1. LES ENTRÉES — ce que la page reçoit de la base, tel quel.
  entrees: {
    ecole: {
      id: 'ecole-1', name: 'École de démonstration', current_year: ANNEE,
      currency: 'XAF', strict_role_enforcement: true,
    },
    catalogue: [SERVICE, SERVICE_TRANSPORT],
    service_affiche: SERVICE.id,
    classes: CLASSES,
    eleves,
    abonnements,            // student_fee_items
    echeances,              // fee_schedule_items
    paiements,              // fee_payments
  },

  // 2. LES DÉRIVÉES — sorties du moteur réel, à afficher sans les recalculer.
  derivees: {
    mois, entete, tarifPlein, quotePart,
    mot_de_la_periode: mot,
    grille, parMois, total, abonnes: abonnesTries,
  },

  // 3. LES PROPS, composant par composant : la signature à respecter.
  props: {
    ListeAbonnes: {
      fichier: 'src/components/services/ListeAbonnes.jsx',
      abonnes: abonnesTries, tri: 'nom',
      setTri: '(fn) nom | reste | statut',
      libelleStatut: '(fn) statut → libellé traduit',
      canCollect: true,
      onEncaisser: '(fn) ligne → ouvre EncaissementServiceModal',
      onFiche: '(fn) ligne → ouvre ServiceFicheEleve',
      onAbonner: '(fn|null) null si l’utilisateur n’encaisse pas',
      money: '(fn) 15000 → "15 000 XAF"',
      t: '(fn) t(fr, en, es)',
      _rendu_par_tranches: 60,
    },
    GrilleMensuelle: {
      fichier: 'src/components/services/GrilleMensuelle.jsx',
      grille, entete, parMois, total, quotePart,
      moisCourant: '2026-11', canCollect: true,
      onCellule: '(fn) cellule → ouvre le choix de statut',
      onEncaisser: '(fn) ligne → encaissement',
    },
    ResumeService: {
      fichier: 'src/components/services/ResumeService.jsx',
      total, parMois, entete, quotePart,
      nbAbonnes: abonnesTries.length, filtreActif: false,
      onExport: '(fn) → CSV point-virgule + BOM',
    },
  },

  // 4. LE VOCABULAIRE — rien n'est en dur dans un composant.
  vocabulaire: {
    statuts_abonne: STATUT_ABONNE,
    tons_statut: {
      a_jour: 'emerald', partiel: 'amber', impaye: 'rose', sans_dette: 'slate',
    },
    conventions_cellule: CONVENTIONS,
    texte_convention: TEXTE_CONVENTION,
    taux_demi_mois: TAUX_DEMI_MOIS,
    statuts_echeance_en_base: SCHEDULE_STATUS,
    statuts_posables_a_la_main: STATUTS_POSABLES,
    tri_liste: ['nom', 'reste', 'statut'],
    filtres: ['section', 'classe', 'recherche (nom | matricule | classe)'],
    monnaie: { code: 'XAF', exemple: '15 000 XAF', decimales: 0, separateur: 'espace' },
  },

  // 5. LES CAS COUVERTS — un par ligne du jeu d'essai.
  cas_couverts: SCENARIOS.map((s) => ({ id: s.id, nom: s.nom, cas: s.cas })),
};

// ── LE CAS DU VOLUME : 320 ABONNÉS ────────────────────────────────────────
// L'école a 716 élèves et 78 abonnés à la cantine ; le transport en aura
// davantage. `ListeAbonnes` ne rend que 60 lignes puis propose « Afficher les
// N autres », et `GrilleMensuelle` doit tenir dix colonnes sans défilement
// horizontal. Une maquette validée sur seize lignes ne prouve rien.
const NOMS = ['ABANDA', 'BELINGA', 'CHOUNDONG', 'DONGMO', 'ESSOMBA', 'FEUPOSSI',
  'GUIMFACK', 'HAMADJAM', 'ITOUA', 'JIMBE', 'KENFACK', 'LONTSI', 'MOUAFO',
  'NGUEKAM', 'OUMAROU', 'PENKA', 'QUENUM', 'ROUAMBA', 'SONKENG', 'TCHAMI',
  'UMARU', 'VOUNDI', 'WANKO', 'YEMELE', 'ZEBAZE'];
const PRENOMS = ['Alain', 'Brenda', 'Cédric', 'Danielle', 'Emmanuel', 'Francine',
  'Gaston', 'Honorine', 'Ismaël', 'Joséphine', 'Kevin', 'Laure', 'Marcel',
  'Nadège', 'Olivier', 'Pascaline', 'Raoul', 'Sabine', 'Thomas', 'Viviane'];

const grandEleves = [];
const grandEch = [];
const grandPaie = [];
const grandTarifs = {};
for (let i = 0; i < 320; i++) {
  const id = `g${String(i).padStart(3, '0')}`;
  const cl = CLASSES[i % CLASSES.length];
  grandEleves.push({
    id, name: `${NOMS[i % NOMS.length]} ${PRENOMS[(i * 7) % PRENOMS.length]}`,
    className: cl.name, matricule: `M26${String(2000 + i)}`,
  });
  grandTarifs[id] = PLEIN;
  // Trois élèves sur quatre sont facturés, un sur quatre reste « non inscrit »
  // sur certains mois ; un sur cinq n'a rien payé. Une liste où tout est vert
  // ne montre pas si l'œil retrouve les impayés.
  for (const cle of ['2026-09', '2026-10', '2026-11', '2027-01', '2027-02']) {
    if ((i + cle.charCodeAt(6)) % 4 === 0) continue;
    const idEch = `gech-${id}-${cle}`;
    grandEch.push({
      id: idEch, student_id: id, student_fee_item_id: `gabo-${id}`,
      period_key: cle, period_label: MOIS_LABEL[cle], amount_due: PLEIN,
      status: 'due', academic_year: ANNEE,
    });
    const paye = i % 5 === 0 ? 0 : (i % 7 === 0 ? 7000 : PLEIN);
    if (paye) {
      grandPaie.push({
        id: `gpay-${id}-${cle}`, student_id: id, fee_schedule_item_id: idEch,
        amount: paye, date: `${cle}-05`, method: 'especes', receipt_no: ++recu,
      });
    }
  }
}
const grandGrille = grilleCantine({
  eleves: grandEleves, echeances: grandEch, paiements: grandPaie, mois,
  tarifPlein, tarifParEleve: grandTarifs,
});
const grandEtats = etatsMensuels({ grille: grandGrille, mois, quotePart });
const grandAbonnes = grandGrille.map((r) => ({
  ...r,
  moisCrees: r.cellules.filter((c) => c.echeance_id).length,
  statut: r.du <= 0 ? 'sans_dette' : r.reste <= 0 ? 'a_jour' : r.paye > 0 ? 'partiel' : 'impaye',
})).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

const volume = {
  genere_par: 'scripts/export-registre-services.mjs',
  pourquoi: 'Le cas du VOLUME. 320 abonnés, dix mois : la liste ne rend que 60 '
    + 'lignes puis propose « Afficher les N autres », et la grille doit tenir '
    + 'dix colonnes sans défilement horizontal, y compris à 375 px.',
  mois, entete, quotePart, tarifPlein,
  abonnes: grandAbonnes,
  grille: grandGrille,
  parMois: grandEtats.parMois,
  total: grandEtats.total,
  repartition_statuts: grandAbonnes.reduce((m, a) => {
    m[a.statut] = (m[a.statut] || 0) + 1; return m;
  }, {}),
};

mkdirSync(SORTIE, { recursive: true });
const ecrire = (nom, obj) => {
  const p = join(SORTIE, nom);
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`  ${nom}  ${(JSON.stringify(obj).length / 1024).toFixed(1)} ko`);
};

console.log('Export « Registre des services » →', SORTIE);
ecrire('registre-services.fixture.json', fixture);
ecrire('registre-services.volume.json', volume);

// ── CONTRÔLES : le jeu d'essai couvre-t-il vraiment l'espace des états ? ──
// Un export qui prétend couvrir les cas sans le vérifier ne vaut pas mieux
// qu'une capture d'écran. On compte ce qui sort du moteur.
const vus = new Set();
for (const r of grille) for (const c of r.cellules) vus.add(c.convention);
const statutsVus = new Set(abonnes.map((a) => a.statut));
const pastillesVues = new Set();
for (const r of grille) for (const c of r.cellules) pastillesVues.add(pastilleCellule(c).ton);
const moisVides = parMois.filter((m) => m.moisSansService).map((m) => m.period_key);

let manque = false;
const exige = (ok, quoi) => {
  console.log(`  ${ok ? 'OK ' : 'MANQUE'}  ${quoi}`);
  if (!ok) manque = true;
};
console.log('\nCouverture :');
exige(CONVENTIONS.every((c) => vus.has(c)),
  `les ${CONVENTIONS.length} conventions de cellule (${[...vus].sort().join(', ')})`);
exige(['a_jour', 'partiel', 'impaye', 'sans_dette'].every((s) => statutsVus.has(s)),
  `les 4 états d’abonné (${[...statutsVus].sort().join(', ')})`);
exige(pastillesVues.size >= 5, `les tons de pastille (${[...pastillesVues].sort().join(', ')})`);
exige(moisVides.length > 0, `au moins un mois sans service (${moisVides.join(', ') || 'aucun'})`);
exige(paiements.some((p) => p.amount < 0), 'une contre-passation');
exige(new Set(eleves.map((e) => e.name)).size < eleves.length, 'un cas d’homonymes');
exige(grandAbonnes.length === 320, `le jeu de volume (${grandAbonnes.length} abonnés)`);
exige(quotePart > 0 && total.quotePart > 0,
  `la quote-part calculée (${total.quotePart} XAF sur l’année)`);

console.log(`\nTotaux du jeu d’essai : attendu ${total.attendu} · encaissé ${total.encaisse}`
  + ` · impayé ${total.impaye} · quote-part ${total.quotePart} XAF`
  + ` · ${abonnes.length} abonnés · ${echeances.length} échéances`
  + ` · ${paiements.length} versements`);
console.log(manque ? '\n❌ COUVERTURE INCOMPLÈTE' : '\n✅ Export complet.');
process.exit(manque ? 1 : 0);
