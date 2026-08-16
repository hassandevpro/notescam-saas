#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// ÉTABLISSEMENT DE DÉMONSTRATION — « COLLÈGE LA RETRAITE » (édition LAN/SQLite)
//
// Crée un complexe scolaire COMPLET et 100 % FICTIF destiné à l'enregistrement
// des vidéos de formation : 16 comptes de connexion (13 rôles de direction —
// tous ceux que l'application connaît, hors enseignant — + 3 enseignants
// maternelle / primaire / secondaire), 3 unités pédagogiques, 13 classes,
// 232 élèves, notes, scolarité, budget, RH/paie, vie scolaire, patrimoine,
// signalements et emploi du temps.
//
// SÉCURITÉ : par défaut le script écrit dans `server/data-demo/` — JAMAIS dans
// la base de production `server/data/`. Il refuse d'écraser une base contenant
// déjà un autre établissement (sauf `--force`).
//
//   node scripts/seed-college-la-retraite.mjs                  # → server/data-demo
//   node scripts/seed-college-la-retraite.mjs --data-dir <dir> # dossier au choix
//   node scripts/seed-college-la-retraite.mjs --reset          # purge le démo avant
//
// Démarrer le serveur sur cette base :
//   NOTESCAM_DATA_DIR=server/data-demo npm run server
//   (PowerShell : $env:NOTESCAM_DATA_DIR="server/data-demo"; npm run server)
//
// Miroir cloud : supabase/seed_college_la_retraite.sql
// Comptes & scénarios de tournage : docs/DEMO_COLLEGE_LA_RETRAITE.md
// ════════════════════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Arguments ───────────────────────────────────────────────────────────────
const ARGV = process.argv.slice(2);
const has = (f) => ARGV.includes(f);
const opt = (f, d) => { const i = ARGV.indexOf(f); return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : d; };

const DATA_DIR = resolve(ROOT, opt('--data-dir', join('server', 'data-demo')));
const FORCE = has('--force');
const RESET = has('--reset');

// `server/db.js` lit NOTESCAM_DATA_DIR à l'import : on le pose AVANT (import
// dynamique, les `import` statiques étant hissés en tête de module).
process.env.NOTESCAM_DATA_DIR = DATA_DIR;
const { db, DB_PATH } = await import('../server/db.js');
const { hashPassword } = await import('../server/security.js');
// Catalogue de gouvernance : modules PURS partagés avec le front (aucun React).
const { DEFAULT_CATALOG } = await import('../src/governance/defaultCatalog.js');
const { GOV_PERM: P } = await import('../src/governance/permissions.js');

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTES DU JEU DE DONNÉES
// ════════════════════════════════════════════════════════════════════════════

const MARKER  = 'seed-laretraite-v1';           // marqueur de nettoyage
const SCHOOL_ID = '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8'; // même id qu'au cloud
const YEAR    = '2025-2026';
const PASSWORD = 'Retraite2026!';
const DOMAIN  = 'laretraite.demo';

// Instantané : 30 juin 2026 — année scolaire quasi terminée.
//   T1 et T2 clos, T3 actif ; séquences 1-5 saisies, séquence 6 à ~70 %.
// Toutes les dates du jeu sont donc PASSÉES : rien ne « sonne faux » à l'écran.
const TRIMESTRES = [
  { name: '1er Trimestre', ord: 1, status: 'closed', start: '2025-09-08', end: '2025-12-05' },
  { name: '2e Trimestre',  ord: 2, status: 'closed', start: '2026-01-05', end: '2026-03-27' },
  { name: '3e Trimestre',  ord: 3, status: 'active', start: '2026-04-06', end: '2026-07-03' },
];
const SEQUENCES = [
  { n: 1, trim: 1, status: 'closed', exam: '2025-10-20', deadline: '2025-10-27' },
  { n: 2, trim: 1, status: 'closed', exam: '2025-11-24', deadline: '2025-12-01' },
  { n: 3, trim: 2, status: 'closed', exam: '2026-01-26', deadline: '2026-02-02' },
  { n: 4, trim: 2, status: 'closed', exam: '2026-03-09', deadline: '2026-03-16' },
  { n: 5, trim: 3, status: 'closed', exam: '2026-05-04', deadline: '2026-05-11' },
  { n: 6, trim: 3, status: 'active', exam: '2026-06-15', deadline: '2026-06-22' },
];

// ── Les 16 comptes ──────────────────────────────────────────────────────────
// `base` = school_users.role (le seul rôle que connaît l'authentification) ;
// `gov`  = rôle de gouvernance ADDITIF (user_governance_roles), qui pilote
// réellement menus, permissions et validations. Un compte « Fondatrice » est
// donc techniquement un admin porteur du rôle de gouvernance `fondatrice`.
const ACCOUNTS = [
  { key: 'admin',        email: `admin@${DOMAIN}`,            name: 'M. ONANA Célestin',           base: 'admin',       gov: null,                             gender: 'M', dept: 'administration', fonction: 'Administrateur système',              salary: 320000 },
  { key: 'fondatrice',   email: `fondatrice@${DOMAIN}`,       name: 'Mme AWONO Marie-Thérèse',     base: 'admin',       gov: 'fondatrice',                     gender: 'F', dept: 'administration', fonction: 'Fondatrice',                          salary: 750000 },
  { key: 'coordo',       email: `coordonnateur@${DOMAIN}`,    name: 'M. MBALLA Emmanuel',          base: 'censeur',     gov: 'coordonnateur_general',          gender: 'M', dept: 'administration', fonction: 'Coordonnateur Général',               salary: 600000 },
  { key: 'raf',          email: `raf@${DOMAIN}`,              name: 'M. FOTSO Landry',             base: 'censeur',     gov: 'raf',                            gender: 'M', dept: 'comptabilite',   fonction: 'Responsable Administratif et Financier', salary: 480000 },
  { key: 'controleur',   email: `controleur@${DOMAIN}`,       name: 'M. ONDOA Guy',                base: 'censeur',     gov: 'controleur',                     gender: 'M', dept: 'administration', fonction: 'Contrôleur de gestion',               salary: 420000 },
  { key: 'principal',    email: `principal@${DOMAIN}`,        name: 'M. NJOYA Blaise',             base: 'censeur',     gov: 'principal',                      gender: 'M', dept: 'administration', fonction: 'Principal du Collège',                salary: 450000 },
  { key: 'vice',         email: `vice.principal@${DOMAIN}`,   name: 'M. ESSOMBA Rodrigue',         base: 'censeur',     gov: 'vice_principal',                 gender: 'M', dept: 'administration', fonction: 'Vice-principal',                      salary: 380000 },
  { key: 'dirprim',      email: `dir.primaire@${DOMAIN}`,     name: 'Mme ETOA Chantal',            base: 'censeur',     gov: 'directrice_primaire',            gender: 'F', dept: 'administration', fonction: 'Directrice du Primaire',              salary: 420000 },
  { key: 'dirprimadj',   email: `dir.adj.primaire@${DOMAIN}`, name: 'Mme NGO BELL Prisca',         base: 'censeur',     gov: 'directrice_adjointe_primaire',   gender: 'F', dept: 'administration', fonction: 'Directrice adjointe du Primaire',     salary: 350000 },
  { key: 'respmat',      email: `resp.maternelle@${DOMAIN}`,  name: 'Mme MANGA Odile',             base: 'censeur',     gov: 'responsable_maternelle',         gender: 'F', dept: 'administration', fonction: 'Responsable de la Maternelle',        salary: 380000 },
  { key: 'caissiere',    email: `caissiere@${DOMAIN}`,        name: 'Mme ABENA Carine',            base: 'censeur',     gov: 'caissier',                       gender: 'F', dept: 'comptabilite',   fonction: 'Caissière',                           salary: 260000 },
  { key: 'censeur',      email: `censeur@${DOMAIN}`,          name: 'M. TABI Serge',               base: 'censeur',     gov: null,                             gender: 'M', dept: 'administration', fonction: 'Censeur',                             salary: 400000 },
  { key: 'surveillant',  email: `surveillant@${DOMAIN}`,      name: 'M. BELLO Achille',            base: 'surveillant', gov: null,                             gender: 'M', dept: 'surveillance',   fonction: 'Surveillant Général',                 salary: 300000 },
  // Les 3 enseignants (un par cycle) — titulaires de toutes les classes de leur cycle.
  { key: 'ens_mat',      email: `ens.maternelle@${DOMAIN}`,   name: 'Mme ABANDA Clarisse',         base: 'teacher',     gov: null,                             gender: 'F', dept: 'enseignants',    fonction: 'Enseignante — Maternelle',            salary: 220000, cycle: 'maternelle', specialty: 'Préscolaire' },
  { key: 'ens_prim',     email: `ens.primaire@${DOMAIN}`,     name: 'M. NKOULOU Bertrand',         base: 'teacher',     gov: null,                             gender: 'M', dept: 'enseignants',    fonction: 'Enseignant — Primaire',               salary: 240000, cycle: 'primaire',   specialty: 'Polyvalent primaire' },
  { key: 'ens_sec',      email: `ens.secondaire@${DOMAIN}`,   name: 'Mme TCHUENTE Léonie',         base: 'teacher',     gov: null,                             gender: 'F', dept: 'enseignants',    fonction: 'Enseignante — Secondaire',            salary: 280000, cycle: 'college',    specialty: 'Mathématiques' },
];

// ── Unités pédagogiques ─────────────────────────────────────────────────────
// `section_key` suit classSectionKey() (src/core/engineResolver.js) : c'est lui
// qui permet à un bulletin de porter l'identité de SON unité.
const UNITS = [
  { key: 'maternelle', section_key: 'maternelle',    name: 'École Maternelle La Retraite', short: 'Maternelle', director: 'Mme MANGA Odile',   color: '#e11d48' },
  { key: 'primaire',   section_key: 'primaire',      name: 'École Primaire La Retraite',   short: 'Primaire',   director: 'Mme ETOA Chantal',  color: '#2563eb' },
  { key: 'college',    section_key: 'premier_cycle', name: 'Collège La Retraite',          short: 'Collège',    director: 'M. NJOYA Blaise',   color: '#059669' },
];

// ── Classes (13) ────────────────────────────────────────────────────────────
// `section` reprend le vocabulaire des secteurs budgétaires (budgetUi.SECTOR_LABELS).
// `birth` = année de naissance « à l'heure » pour le niveau (rentrée 2025) ;
// le générateur y ajoute ±1 an pour obtenir des âges crédibles et variés.
const CLASSES = [
  { name: 'Petite Section',  level: 'PS',   unit: 'maternelle', section: 'maternelle', n: 12, birth: 2022 },
  { name: 'Moyenne Section', level: 'MS',   unit: 'maternelle', section: 'maternelle', n: 12, birth: 2021 },
  { name: 'Grande Section',  level: 'GS',   unit: 'maternelle', section: 'maternelle', n: 12, birth: 2020 },
  { name: 'SIL',             level: 'SIL',  unit: 'primaire',   section: 'primaire',   n: 18, birth: 2019 },
  { name: 'CP',              level: 'CP',   unit: 'primaire',   section: 'primaire',   n: 18, birth: 2018 },
  { name: 'CE1',             level: 'CE1',  unit: 'primaire',   section: 'primaire',   n: 18, birth: 2017 },
  { name: 'CE2',             level: 'CE2',  unit: 'primaire',   section: 'primaire',   n: 18, birth: 2016 },
  { name: 'CM1',             level: 'CM1',  unit: 'primaire',   section: 'primaire',   n: 18, birth: 2015 },
  { name: 'CM2',             level: 'CM2',  unit: 'primaire',   section: 'primaire',   n: 18, birth: 2014 },
  { name: '6e',              level: '6e',   unit: 'college',    section: 'college',    n: 22, birth: 2013 },
  { name: '5e',              level: '5e',   unit: 'college',    section: 'college',    n: 22, birth: 2012 },
  { name: '4e',              level: '4e',   unit: 'college',    section: 'college',    n: 22, birth: 2011 },
  { name: '3e',              level: '3e',   unit: 'college',    section: 'college',    n: 22, birth: 2010 },
];

const SUBJECTS = {
  maternelle: [
    ['Langage oral', 2], ['Graphisme & Écriture', 2], ['Mathématiques', 2],
    ['Découverte du monde', 1], ['Éveil artistique', 1], ['Motricité', 1],
  ],
  primaire: [
    ['Français', 4], ['Mathématiques', 4], ['Anglais', 2], ["Sciences d'Observation", 2],
    ['Histoire-Géographie', 2], ['Éducation Civique et Morale', 1], ['EPS', 1],
  ],
  college: [
    ['Français', 4], ['Anglais', 3], ['Mathématiques', 4], ['SVT', 2],
    ['Physique-Chimie-Technologie', 3], ['Histoire-Géographie', 2],
    ['Éducation Civique et Morale', 1], ['Informatique', 1], ['EPS', 1],
  ],
};

// Scolarité annuelle et frais d'inscription par section.
const TARIFS = {
  maternelle: { annuel: 120000, inscription: 25000 },
  primaire:   { annuel: 150000, inscription: 30000 },
  college:    { annuel: 200000, inscription: 35000 },
};

// `category` doit appartenir à FEE_CATEGORIES (src/lib/feeCatalogEngine.js) :
// inscription | scolarite | apee | tenue | cantine | transport | internat |
// soutien | activites | bibliotheque | assurance | sortie | autre.
const FEE_CATALOG = [
  { name: 'Uniforme scolaire',     category: 'tenue',        amount: 18000, mandatory: 1, payment_type: 'unique' },
  { name: 'Assurance scolaire',    category: 'assurance',    amount:  4000, mandatory: 1, payment_type: 'unique' },
  { name: 'Cotisation APEE',       category: 'apee',         amount: 10000, mandatory: 1, payment_type: 'unique' },
  { name: 'Fournitures & manuels', category: 'bibliotheque', amount: 22000, mandatory: 1, payment_type: 'unique' },
  { name: 'Carte scolaire',        category: 'autre',        amount:  2000, mandatory: 1, payment_type: 'unique' },
  { name: 'Cantine',               category: 'cantine',      amount: 55000, mandatory: 0, payment_type: 'echelonne' },
  { name: 'Transport scolaire',    category: 'transport',    amount: 45000, mandatory: 0, payment_type: 'echelonne' },
  { name: 'Sortie pédagogique',    category: 'sortie',       amount:  7500, mandatory: 0, payment_type: 'unique' },
];

// ── Budget annuel : rubriques → lignes (Σ lignes = 45 000 000 = enveloppe) ──
const BUDGET_ENVELOPE = 45000000;
const BUDGET_RUBRIQUES = [
  { code: 'RUB-FONC', label: 'Fonctionnement', pos: 1 },
  { code: 'RUB-PERS', label: 'Personnel',      pos: 2 },
  { code: 'RUB-INV',  label: 'Investissement', pos: 3 },
];
// scope 'complex' = ligne du complexe ; 'sectors' = répartie entre les unités.
const BUDGET_LIGNES = [
  { rub: 'RUB-FONC', code: 'FOURN', label: 'Fournitures pédagogiques',   amount:  3500000, scope: 'sectors' },
  { rub: 'RUB-FONC', code: 'ENTR',  label: 'Entretien & maintenance',    amount:  2800000, scope: 'complex' },
  { rub: 'RUB-FONC', code: 'ELEC',  label: 'Électricité & eau',          amount:  2200000, scope: 'complex' },
  { rub: 'RUB-FONC', code: 'COMM',  label: 'Communication',              amount:   800000, scope: 'complex' },
  { rub: 'RUB-FONC', code: 'ACTI',  label: 'Activités scolaires',        amount:  1500000, scope: 'sectors' },
  { rub: 'RUB-FONC', code: 'EXAM',  label: 'Examens & évaluations',      amount:  1800000, scope: 'sectors' },
  { rub: 'RUB-FONC', code: 'TRANS', label: 'Transport',                  amount:  1200000, scope: 'complex' },
  { rub: 'RUB-FONC', code: 'SECU',  label: 'Sécurité & gardiennage',     amount:  1400000, scope: 'complex' },
  { rub: 'RUB-FONC', code: 'HYG',   label: 'Hygiène & santé',            amount:   900000, scope: 'complex' },
  { rub: 'RUB-FONC', code: 'IMPR',  label: 'Imprévus',                   amount:  1000000, scope: 'complex' },
  { rub: 'RUB-PERS', code: 'SAL',   label: 'Salaires & charges',         amount: 24000000, scope: 'complex' },
  { rub: 'RUB-PERS', code: 'FORM',  label: 'Formation du personnel',     amount:  1200000, scope: 'complex' },
  { rub: 'RUB-INV',  code: 'INFO',  label: 'Équipement informatique',    amount:  2000000, scope: 'complex' },
  { rub: 'RUB-INV',  code: 'MOB',   label: 'Mobilier scolaire',          amount:   700000, scope: 'sectors' },
];
const BUDGET_PERIODES = [
  { name: 'Trimestre 1', start: '2025-09-01', end: '2025-12-15', pct: 40, pos: 1 },
  { name: 'Trimestre 2', start: '2026-01-05', end: '2026-03-31', pct: 30, pos: 2 },
  { name: 'Trimestre 3', start: '2026-04-06', end: '2026-07-05', pct: 30, pos: 3 },
];
// Dépenses déjà exécutées et payées (consommation « normale » de l'exercice).
const DEPENSES_PAYEES = [
  ['FOURN', 1900000, '2025-10-14', 'Librairie Étoile'],
  ['ENTR',  1450000, '2025-11-06', 'Ets Nkolo Bâtiment'],
  ['ELEC',  1500000, '2026-01-12', 'ENEO / CAMWATER'],
  ['COMM',   420000, '2026-02-03', 'Camtel'],
  ['ACTI',   700000, '2026-03-10', 'Comité des fêtes'],
  ['EXAM',   950000, '2026-05-18', 'Imprimerie Mvog-Ada'],
  ['TRANS',  640000, '2025-12-01', 'Transport Le Bosquet'],
  ['SECU',  1250000, '2026-04-20', 'Sécurité Vigilance SARL'],
  ['HYG',    505000, '2026-02-17', 'Pharmacie du Centre'],
  ['SAL',  16800000, '2026-05-28', 'Personnel'],
  ['FORM',   300000, '2026-01-22', 'Cabinet Perform'],
  ['INFO',  1200000, '2025-10-28', 'Cameroun Informatique'],
  ['MOB',    380000, '2025-09-22', 'Menuiserie Bonanjo'],
];
// Les 8 CAS pédagogiques du circuit de validation (une vidéo par cas possible).
const DEPENSES_CAS = [
  { cas: 'CAS-A', code: 'FOURN', amount:   85000, by: 'caissiere',  status: 'submitted', date: '2026-06-22', note: 'Achat de fournitures — EN ATTENTE d’approbation du Coordonnateur Général.' },
  { cas: 'CAS-B', code: 'INFO',  amount:  450000, by: 'raf',        status: 'approved',  date: '2026-06-12', note: 'Maintenance du parc informatique — APPROUVÉE par la Fondatrice, décaissement à venir.' },
  { cas: 'CAS-C', code: 'COMM',  amount:  125000, by: 'caissiere',  status: 'paid',      date: '2026-06-15', note: 'Communication — circuit complet : soumise, approuvée, puis décaissée.' },
  { cas: 'CAS-D', code: 'ENTR',  amount: 1250000, by: 'raf',        status: 'submitted', date: '2026-06-24', note: 'Réfection de la toiture du bloc B — EN ATTENTE de décision de la Fondatrice (montant élevé).' },
  { cas: 'CAS-E', code: 'ACTI',  amount:  300000, by: 'caissiere',  status: 'rejected',  date: '2026-06-08', note: 'REJETÉE : activité non prioritaire en fin d’exercice.' },
  { cas: 'CAS-F', code: 'EXAM',  amount:  220000, by: 'raf',        status: 'approved',  date: '2026-06-18', note: 'Examens blancs — approuvée, non encore décaissée.' },
  { cas: 'CAS-G', code: 'HYG',   amount:  175000, by: 'caissiere',  status: 'paid',      date: '2026-06-05', note: 'Produits d’hygiène — exécutée et décaissée.' },
  { cas: 'CAS-H', code: 'SECU',  amount:  250000, by: 'raf',        status: 'draft',     date: '2026-06-26', note: 'BLOQUÉE : dépasse le disponible de la ligne Sécurité → une demande de déblocage est en attente.' },
];

// ── Paie ────────────────────────────────────────────────────────────────────
const PAYROLL_CATALOG = [
  { code: 'PRIM-TRANS', name: 'Prime de transport',   kind: 'prime',      calc_type: 'fixed',   amount: 20000, rate: null, base_ref: 'brut',         pos: 1 },
  { code: 'PRIM-LOG',   name: 'Prime de logement',    kind: 'prime',      calc_type: 'percent', amount: null,  rate: 15,   base_ref: 'salaire_base', pos: 2 },
  { code: 'PRIM-ANC',   name: 'Prime d’ancienneté',   kind: 'prime',      calc_type: 'fixed',   amount: 10000, rate: null, base_ref: 'brut',         pos: 3 },
  { code: 'RET-CNPS',   name: 'CNPS (part salarié)',  kind: 'retenue',    calc_type: 'percent', amount: null,  rate: 4.2,  base_ref: 'brut',         pos: 4 },
  { code: 'RET-IRPP',   name: 'IRPP',                 kind: 'retenue',    calc_type: 'percent', amount: null,  rate: 8,    base_ref: 'brut',         pos: 5 },
  { code: 'RET-AVAN',   name: 'Avance sur salaire',   kind: 'retenue',    calc_type: 'fixed',   amount: 25000, rate: null, base_ref: 'brut',         pos: 6 },
  { code: 'PAT-CNPS',   name: 'CNPS (part patronale)', kind: 'patronale', calc_type: 'percent', amount: null,  rate: 11.2, base_ref: 'brut',         pos: 7 },
];

// ── Viviers de noms (élèves) ────────────────────────────────────────────────
const PRENOMS_M = ['Jean', 'Paul', 'Samuel', 'Emmanuel', 'Éric', 'Franck', 'Serge', 'Landry', 'Cédric', 'Blaise', 'Boris', 'Yannick', 'Rodrigue', 'Achille', 'Guy', 'Hervé', 'Armand', 'Ghislain', 'Pierre', 'Bruno'];
const PRENOMS_F = ['Marie', 'Christine', 'Solange', 'Brigitte', 'Estelle', 'Carine', 'Nadège', 'Laure', 'Prisca', 'Rachel', 'Sandrine', 'Vanessa', 'Larissa', 'Chantal', 'Odile', 'Bertille', 'Mireille', 'Josiane', 'Yolande', 'Flore'];
const NOMS = ['NKOLO', 'MBALLA', 'TCHOUA', 'FOTSO', 'KAMDEM', 'NGONO', 'ESSOMBA', 'MANGA', 'EKWALLA', 'NJOYA', 'NDONGO', 'ABENA', 'ETOA', 'ONANA', 'TABI', 'ZE', 'BELLO', 'AYISSI', 'NANA', 'TALLA', 'SOP', 'DIBOM', 'EYENGA', 'MFEGE', 'NJIKE', 'OWONA', 'BIKORO', 'NGUEMA', 'ATANGANA', 'ELA'];

// ════════════════════════════════════════════════════════════════════════════
// OUTILLAGE
// ════════════════════════════════════════════════════════════════════════════

// PRNG seedable (mulberry32) — le même jeu de données à chaque exécution.
function makeRng(seed = 20260630) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng();
const int  = (min, max) => min + Math.floor(rng() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const uid  = () => randomUUID();
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// node:sqlite n'accepte ni `undefined` ni les booléens : on normalise.
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

const stmtCache = new Map();
const counts = {};
function ins(table, row) {
  const cols = Object.keys(row);
  const key = `${table}|${cols.join(',')}`;
  let stmt = stmtCache.get(key);
  if (!stmt) {
    stmt = db.prepare(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    );
    stmtCache.set(key, stmt);
  }
  stmt.run(...cols.map((c) => norm(row[c])));
  counts[table] = (counts[table] || 0) + 1;
  return row;
}

// Période budgétaire couvrant une date (l'imputation d'une dépense en dérive).
function periodOf(periods, dateISO) {
  return periods.find((p) => dateISO >= p.start_date && dateISO <= p.end_date) || periods[periods.length - 1];
}

// ════════════════════════════════════════════════════════════════════════════
// GARDE-FOUS
// ════════════════════════════════════════════════════════════════════════════

const existing = db.prepare('SELECT id, name FROM schools').all();
const foreign = existing.filter((s) => s.id !== SCHOOL_ID);
if (foreign.length && !FORCE) {
  console.error(`\n✖ La base ${DB_PATH} contient déjà un autre établissement :`);
  foreign.forEach((s) => console.error(`   • ${s.name} (${s.id})`));
  console.error('\n  Ce script ne veut pas polluer une base réelle. Options :');
  console.error('   • viser un autre dossier :  --data-dir server/data-demo');
  console.error('   • passer outir sciemment :  --force\n');
  process.exit(1);
}

// ════════════════════════════════════════════════════════════════════════════
// PURGE (idempotence) — supprime UNIQUEMENT l'établissement de démonstration
// ════════════════════════════════════════════════════════════════════════════

const alreadyThere = existing.some((s) => s.id === SCHOOL_ID);
if (alreadyThere && !RESET && !FORCE) {
  console.error(`\n✖ « COLLÈGE LA RETRAITE » existe déjà dans ${DB_PATH}.`);
  console.error('  Relancez avec --reset pour le régénérer à neuf.\n');
  process.exit(1);
}

db.exec('BEGIN');
try {
  if (alreadyThere) {
    // Purge ORDONNÉE (enfants d'abord). On ne peut pas se reposer sur la seule
    // cascade `schools ON DELETE CASCADE` : plusieurs FK internes sont en
    // ON DELETE RESTRICT (budget_line_periods → budget_periods,
    // budget_line_sectors → school_units…) et bloqueraient la suppression.
    const PURGE_ORDER = [
      'audit_events', 'domain_events', 'notification_outbox', 'notifications',
      'signalement_comments', 'signalement_history', 'signalements',
      'asset_expenses', 'asset_repairs', 'asset_breakdowns', 'assets',
      'hr_payroll_items', 'hr_payroll', 'hr_payroll_catalog', 'hr_attendance',
      'hr_career_events', 'hr_evaluations', 'hr_leaves', 'hr_contracts',
      'exit_permissions', 'parent_meetings', 'student_detentions', 'student_warnings',
      'disciplinary_actions', 'disciplinary_incidents', 'late_arrivals', 'discipline_statistics',
      'budget_line_reallocations', 'budget_unlock_requests', 'budget_expenses',
      'budget_line_sectors', 'budget_line_periods', 'budget_revisions',
      'budget_reallocations', 'budget_chapters', 'budgets', 'budget_periods',
      'cash_sessions', 'fee_payments', 'student_fee_items', 'student_fees',
      'class_fee_grids', 'fee_catalog',
      'attendance', 'student_absences', 'student_class_assignments', 'timetable_slots',
      'grades', 'students', 'subjects', 'classes',
      'sequence_dates', 'academic_periods',
      'staff', 'teachers', 'school_units',
      'governance_role_history', 'user_governance_roles', 'governance_roles',
      'school_messages', 'teacher_notifications', 'school_users', 'schools',
    ];
    const userIds = db.prepare('SELECT user_id FROM school_users WHERE school_id = ?')
      .all(SCHOOL_ID).map((r) => r.user_id);
    for (const t of PURGE_ORDER) {
      const col = t === 'schools' ? 'id' : 'school_id';
      try { db.prepare(`DELETE FROM ${t} WHERE ${col} = ?`).run(SCHOOL_ID); }
      catch (e) { if (!/no such table/.test(String(e))) throw e; }
    }
    const delUser = db.prepare('DELETE FROM users WHERE id = ?');
    for (const id of userIds) delUser.run(id);
    db.prepare('DELETE FROM users WHERE email LIKE ?').run(`%@${DOMAIN}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 1. ÉCOLE + UNITÉS PÉDAGOGIQUES
  // ══════════════════════════════════════════════════════════════════════════
  ins('schools', {
    id: SCHOOL_ID,
    name: 'COLLÈGE LA RETRAITE',
    type: 'prive_confessionnel',
    region: 'Centre', division: 'Mfoundi', subdivision: 'Yaoundé III',
    address: 'Quartier Nsimeyong, BP 4127 — Yaoundé',
    phone: '+237 222 31 45 60',
    director: 'Mme AWONO Marie-Thérèse',
    email: `contact@${DOMAIN}`,
    current_year: YEAR,
    currency: 'XAF',
    language: 'francophone',   // 'fr' viole schools_language_check côté cloud
    country_system: 'cameroon_fr',
    grade_entry_mode: 'principal',
    bulletin_engine: 'classic',
    bulletin_subject_mode: 'synthetic',
    bulletin_bilingual: 1,
    period_mode: 'manual',        // l'instantané pilote les périodes, pas la date du jour
    budget_validation: 1,          // circuit d'approbation des dépenses ACTIF
    censeur_name: 'M. TABI Serge',
    surveillant_name: 'M. BELLO Achille',
    niu: 'M012600123456X',
    cnps_number: '0-12345-6',
    plan: 'reseau',   // 'premium' n'est pas un plan valide (starter|ecole|pro|reseau)
    price_per_student: 0,
    license_status: 'active',
    license_expires_at: '2027-08-31',
  });

  const units = {};
  UNITS.forEach((u, i) => {
    units[u.key] = ins('school_units', {
      id: uid(), school_id: SCHOOL_ID, section_key: u.section_key,
      name: u.name, short_name: u.short, director: u.director,
      address: 'Quartier Nsimeyong, Yaoundé', phone: '+237 222 31 45 60',
      email: `${u.key}@${DOMAIN}`, motto: 'Travail — Discipline — Réussite',
      establishment_no: `CE/${2000 + i}/YDE`,
      color_primary: u.color, color_secondary: '#0f172a', position: i + 1,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. CATALOGUE DE GOUVERNANCE (10 rôles) — table `governance_roles`
  // ══════════════════════════════════════════════════════════════════════════
  // Le moteur (governanceEngine) dérive de CE catalogue les menus, permissions
  // et droits de validation. Deux ajustements par rapport au catalogue par
  // défaut, indispensables au scénario filmé :
  //   • `controleur` n'y figure pas (il n'existe qu'en SQL cloud) → sans lui, le
  //     compte Contrôleur n'aurait ni menu ni droit : sa vidéo serait vide ;
  //   • le Caissier ne peut pas SAISIR de dépense par défaut, alors que le jeu de
  //     données lui en fait soumettre quatre (CAS A/C/E/G) → on lui ouvre
  //     expense.prepare + expense.submit pour que le circuit soit rejouable.
  const CATALOG = [
    ...DEFAULT_CATALOG.map((r) => (r.code === 'caissier'
      ? { ...r, permissions: [...r.permissions, P.EXPENSE_PREPARE, P.EXPENSE_SUBMIT] }
      : r)),
    {
      code: 'controleur', name: 'Contrôleur',
      description: 'Consultation et audit à distance (aucune approbation par défaut).',
      rank: 70, scope: 'complex', sector: null,
      permissions: [P.VIEW, P.BUDGET_VIEW, P.EXPENSE_VIEW],
      workflows: [],
      pages: ['/app/groupe', '/app/reports', '/app/budgets', '/app/budget-global', '/app/depenses'],
      dashboards: ['group', 'budget-global'],
      active: true, is_system: true,
    },
  ];
  for (const r of CATALOG) {
    ins('governance_roles', {
      id: uid(), school_id: SCHOOL_ID, code: r.code, name: r.name,
      description: r.description, rank: r.rank, scope: r.scope, sector: r.sector,
      permissions: JSON.stringify(r.permissions), pages: JSON.stringify(r.pages),
      dashboards: JSON.stringify(r.dashboards), workflows: JSON.stringify(r.workflows),
      active: 1, is_system: 1,
    });
  }
  const sectorOfRole = Object.fromEntries(CATALOG.map((r) => [r.code, r.sector]));

  // ══════════════════════════════════════════════════════════════════════════
  // 3. COMPTES (users + school_users + rôles de gouvernance) + PERSONNEL
  // ══════════════════════════════════════════════════════════════════════════
  const pwHash = hashPassword(PASSWORD);
  const acc = {};      // key → { userId, staffId, teacherId, name }
  const nowIso = new Date().toISOString();

  ACCOUNTS.forEach((a, i) => {
    const userId = uid();
    ins('users', {
      id: userId, email: a.email, password_hash: pwHash,
      full_name: a.name, email_confirmed_at: nowIso,
    });
    ins('school_users', {
      id: uid(), school_id: SCHOOL_ID, user_id: userId, role: a.base,
      full_name: a.name, active: 1,
      // Le Contrôleur et les autorités financières consultent à distance (H4).
      remote_access_allowed: ['controleur', 'fondatrice', 'coordo', 'raf'].includes(a.key) ? 1 : 0,
    });
    if (a.gov) {
      ins('user_governance_roles', {
        id: uid(), school_id: SCHOOL_ID, user_id: userId, role: a.gov,
        sector: sectorOfRole[a.gov] || null,
        status: 'active', start_date: '2025-09-01',
      });
      ins('governance_role_history', {
        id: uid(), school_id: SCHOOL_ID, user_id: userId, role_code: a.gov,
        action: 'assigned', start_date: '2025-09-01',
        actor_name: 'M. ONANA Célestin', detail: '{}', at: '2025-09-01T08:00:00.000Z',
      });
    }

    // Dossier personnel (module Personnel + RH/paie).
    const staffId = uid();
    const [civ, ...rest] = a.name.split(' ');
    ins('staff', {
      id: staffId, school_id: SCHOOL_ID, matricule: `PERS-${String(i + 1).padStart(3, '0')}`,
      first_name: rest.slice(1).join(' ') || null, last_name: rest[0] || null,
      name: a.name, gender: a.gender === 'F' ? 'Feminin' : 'Masculin',
      phone: `+237 6${int(70, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
      email: a.email, address: 'Yaoundé, Cameroun',
      fonction: a.fonction, department: a.dept, hire_date: `20${int(15, 23)}-09-01`,
      status: 'actif', active: 1, auth_user_id: userId,
      convention_collective: 'Enseignement privé laïc et confessionnel',
      categorie_echelon: `${int(4, 10)}/${pick(['A', 'B', 'C'])}`,
      situation_familiale: pick(['célibataire', 'marié(e)', 'marié(e)']),
      cnps_number: `${int(100000, 999999)}-${int(10, 99)}`,
      niu: `P0${int(10, 99)}600${int(100000, 999999)}Z`,
      cni_number: `${int(100000000, 999999999)}`,
      bank_account: `100${int(10, 99)} 000${int(10, 99)} ${int(10000000000, 99999999999)} ${int(10, 99)}`,
    });
    void civ;

    acc[a.key] = { ...a, userId, staffId, name: a.name };
  });

  // Les 3 enseignants ont AUSSI un profil pédagogique (table `teachers`),
  // c'est lui que voient Classes / Matières / Emploi du temps / Cockpit.
  for (const key of ['ens_mat', 'ens_prim', 'ens_sec']) {
    const a = acc[key];
    const teacherId = uid();
    ins('teachers', {
      id: teacherId, school_id: SCHOOL_ID, name: a.name, email: a.email,
      phone: `+237 6${int(70, 99)} ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
      specialty: a.specialty, auth_user_id: a.userId, active: 1,
    });
    a.teacherId = teacherId;
  }
  const teacherOfCycle = {
    maternelle: acc.ens_mat.teacherId,
    primaire:   acc.ens_prim.teacherId,
    college:    acc.ens_sec.teacherId,
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 4. PÉRIODES ACADÉMIQUES (3 trimestres + 6 séquences) + dates d'examen
  // ══════════════════════════════════════════════════════════════════════════
  const trimIds = {};
  for (const t of TRIMESTRES) {
    const id = uid();
    trimIds[t.ord] = id;
    ins('academic_periods', {
      id, school_id: SCHOOL_ID, school_year: YEAR, type: 'trimestre',
      name: t.name, sequence_order: t.ord, status: t.status,
      teaching_start: t.start, teaching_end: t.end, is_locked: 0,
    });
  }
  for (const s of SEQUENCES) {
    ins('academic_periods', {
      id: uid(), school_id: SCHOOL_ID, school_year: YEAR, type: 'sequence',
      parent_id: trimIds[s.trim], name: `Séquence ${s.n}`, sequence_order: s.n,
      status: s.status, teaching_end: s.exam, entry_deadline: s.deadline,
      // is_locked = 0 partout : rien ne doit bloquer une saisie pendant une démo.
      is_locked: 0,
    });
    ins('sequence_dates', {
      id: uid(), school_id: SCHOOL_ID, seq_key: `seq${s.n}`, seq_label: `Séquence ${s.n}`,
      exam_date: s.exam, deadline_date: s.deadline, conseil_date: addDays(s.deadline, 7),
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. CLASSES + MATIÈRES + ÉLÈVES + NOTES + CONSEIL DE CLASSE
  // ══════════════════════════════════════════════════════════════════════════
  const classes = [];
  const students = [];
  let matricule = 0;

  for (const c of CLASSES) {
    const classId = uid();
    const titulaire = teacherOfCycle[c.unit];
    ins('classes', {
      id: classId, school_id: SCHOOL_ID, name: c.name, level: c.level,
      section: c.section, system: 'FR', cycle: c.unit, current_year: YEAR,
      teacher_id: titulaire, unit_id: units[c.unit].id, max_students: 45,
      grade_max: 20,
    });
    const subs = SUBJECTS[c.unit].map(([name, coef], pos) => ins('subjects', {
      id: uid(), school_id: SCHOOL_ID, class_id: classId, name, coef,
      max: 20, position: pos + 1, teacher_id: titulaire,
    }));
    const cls = { ...c, id: classId, subjects: subs };
    classes.push(cls);

    for (let k = 0; k < c.n; k++) {
      matricule += 1;
      const male = (k % 2) === 0;
      const name = `${pick(NOMS)} ${male ? pick(PRENOMS_M) : pick(PRENOMS_F)}`;
      const birthYear = c.birth + (k % 7 === 0 ? -1 : 0);   // ~1 élève sur 7 a un an de plus
      const studentId = uid();
      ins('students', {
        id: studentId, school_id: SCHOOL_ID, class_id: classId, name,
        matricule: `ELV-2025-${String(matricule).padStart(4, '0')}`,
        gender: male ? 'Masculin' : 'Feminin',
        // `statut` est CONTRAINT côté cloud (CHECK nouveau|redoublant|transfere,
        // supabase_sprint23.sql) : on s'y tient aussi en LAN, sinon la ligne
        // serait rejetée à la première synchronisation.
        statut: matricule % 9 === 0 ? 'redoublant' : matricule % 23 === 0 ? 'transfere' : 'nouveau',
        statut_etablissement: k % 4 === 0 ? 'nouveau' : 'ancien',
        date_naissance: `${birthYear}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
        sport_aptitude: k % 19 === 0 ? 'inapte' : 'apte',
        created_by_name: 'Mme ABENA Carine',
        created_at: `2025-09-${String(int(1, 28)).padStart(2, '0')} 08:30:00`,
      });
      ins('student_class_assignments', {
        id: uid(), school_id: SCHOOL_ID, student_id: studentId, class_id: classId,
        class_name: c.name, assigned_by_name: 'Mme ABENA Carine',
        reason: k % 4 === 0 ? 'Inscription (nouvel élève)' : 'Réinscription',
        assigned_at: '2025-09-05 08:00:00',
      });
      students.push({ id: studentId, classId, cls, name, idx: matricule });
    }
  }

  // Notes : séquences 1→5 complètes, séquence 6 à ~70 % (saisie en cours).
  // ~3 % de valeurs nulles = élève absent à l'évaluation (cas réel à montrer).
  for (const stu of students) {
    for (const sub of stu.cls.subjects) {
      for (let seq = 1; seq <= 6; seq++) {
        if (seq === 6 && rng() < 0.3) continue;
        const absent = rng() < 0.03;
        ins('grades', {
          id: uid(), school_id: SCHOOL_ID, class_id: stu.classId, student_id: stu.id,
          subject_id: sub.id, sequence: seq,
          value: absent ? null : String(int(5, 19) + (rng() < 0.35 ? 0.5 : 0)),
        });
      }
    }
    // Conseil de classe : assiduité + conduite + décisions (une ligne / séquence).
    for (let seq = 1; seq <= 6; seq++) {
      if (seq === 6 && rng() < 0.5) continue;
      const absJ = rng() < 0.35 ? int(1, 6) : 0;
      const absNJ = rng() < 0.18 ? int(1, 4) : 0;
      ins('student_absences', {
        id: uid(), school_id: SCHOOL_ID, class_id: stu.classId, student_id: stu.id,
        sequence: seq, abs_j: absJ, abs_nj: absNJ,
        // Codes de conduite attendus par le bulletin (CONDUITE_LABELS, Bulletins.jsx) :
        // TB | B | AB | P | M. Écrire un libellé en clair l'afficherait tel quel.
        conduite: absNJ > 2 ? 'P' : pick(['B', 'B', 'TB', 'AB']),
        th: rng() < 0.12 ? 1 : 0,
        encouragement: rng() < 0.18 ? 1 : 0,
        felicitation: rng() < 0.08 ? 1 : 0,
        aver_travail: rng() < 0.07 ? 1 : 0,
        blame_travail: 0,
        exclusions: 0,
        aver_conduite: absNJ > 2 ? 1 : 0,
        blame_conduite: 0,
        // `decision` est un CODE ('admis' | 'renvoye'), traduit par le bulletin.
        // Laissé NULL pour la majorité : le bulletin déduit alors la décision de
        // la moyenne — c'est le comportement à montrer par défaut. Le cloud
        // contraint en plus cette colonne (CHECK admis|redoublant|renvoye).
        decision: seq === 6 || rng() > 0.25 ? null : 'admis',
        appreciation: pick([
          'Élève sérieux(se) et régulier(ère). Continuez.',
          'Des résultats en progression, encore un effort à l’oral.',
          'Trimestre correct, attention à l’assiduité.',
          'Bon niveau d’ensemble, participation à renforcer.',
        ]),
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. EMPLOI DU TEMPS — une semaine complète pour GS, CM2 et 6e
  // ══════════════════════════════════════════════════════════════════════════
  const CRENEAUX = [['07:30', '08:25'], ['08:25', '09:20'], ['09:35', '10:30'], ['10:30', '11:25'], ['12:30', '13:25'], ['13:25', '14:20']];
  for (const cname of ['Grande Section', 'CM2', '6e']) {
    const cls = classes.find((c) => c.name === cname);
    for (let day = 1; day <= 5; day++) {
      CRENEAUX.forEach(([start, end], i) => {
        // Mercredi et vendredi après-midi libres (usage courant au Cameroun).
        if ((day === 3 || day === 5) && i >= 4) return;
        const sub = cls.subjects[(day * 3 + i) % cls.subjects.length];
        ins('timetable_slots', {
          id: uid(), school_id: SCHOOL_ID, class_id: cls.id, subject_id: sub.id,
          teacher_id: teacherOfCycle[cls.unit], day_of_week: day,
          start_time: start, end_time: end, label: sub.name,
          room: `Salle ${cls.name.replace(/\s/g, '')}`, academic_year: YEAR,
        });
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. SCOLARITÉ — catalogue, grilles, pension, encaissements
  // ══════════════════════════════════════════════════════════════════════════
  const catalog = FEE_CATALOG.map((f, i) => ins('fee_catalog', {
    id: uid(), school_id: SCHOOL_ID, name: f.name, category: f.category,
    amount: f.amount, academic_year: YEAR, mandatory: f.mandatory,
    optional: f.mandatory ? 0 : 1, payment_type: f.payment_type,
    active: 1, position: i + 1,
  }));

  for (const cls of classes) {
    const t = TARIFS[cls.unit];
    const t1 = Math.round(t.annuel * 0.4), t2 = Math.round(t.annuel * 0.3);
    ins('class_fee_grids', {
      id: uid(), school_id: SCHOOL_ID, class_id: cls.id, academic_year: YEAR,
      amount_comptant: t.annuel, amount_echelonne: t.annuel + 5000,
      amount_inscription: t.inscription, currency: 'XAF',
      tranches: JSON.stringify([
        { id: 'T1', label: '1ère tranche', amount: t1, due_date: '2025-10-15' },
        { id: 'T2', label: '2e tranche',  amount: t2, due_date: '2026-01-15' },
        { id: 'T3', label: '3e tranche',  amount: t.annuel - t1 - t2, due_date: '2026-04-15' },
      ]),
    });
  }

  // 5 profils de recouvrement : rien payé / 30 % / 55 % / 80 % / soldé.
  const RATIOS = [0, 0.30, 0.55, 0.80, 1];
  let receiptNo = 0;
  const paiements = [];       // collectés puis insérés triés par date (n° de reçu continus)
  for (const stu of students) {
    const t = TARIFS[stu.cls.unit];
    const bucket = stu.idx % 5;
    const paye = Math.round(t.annuel * RATIOS[bucket]);
    const nbVersements = bucket >= 3 ? 2 : 1;
    ins('student_fees', {
      id: uid(), school_id: SCHOOL_ID, student_id: stu.id, academic_year: YEAR,
      frais_annuels: t.annuel, frais_payes: paye,
      date_dernier_paiement: paye > 0 ? addDays('2025-10-05', (stu.idx * 3) % 200) : null,
      payment_mode: bucket >= 3 ? 'echelonne' : 'comptant',
      tranches: '[]', adjustments: '[]',
    });
    if (paye > 0) {
      const first = bucket >= 3 ? Math.round(paye * 0.6) : paye;
      const parts = nbVersements === 2 ? [first, paye - first] : [paye];
      parts.forEach((amount, k) => {
        paiements.push({
          student_id: stu.id, item_id: null, amount,
          date: addDays('2025-10-05', ((stu.idx * 3) % 200) + k * 60),
          note: `Versement scolarité ${YEAR}`,
        });
      });
    }
    // Frais annexes obligatoires. `status` est un CYCLE DE VIE ('active' |
    // 'removed'), PAS un état de paiement : celui-ci est CALCULÉ par
    // feeCatalogEngine à partir des versements rattachés (student_fee_item_id).
    // On rattache donc de vrais versements pour que soldé/partiel/impayé
    // apparaisse à l'écran.
    for (const f of catalog.filter((x) => x.mandatory)) {
      const itemId = uid();
      ins('student_fee_items', {
        id: itemId, school_id: SCHOOL_ID, student_id: stu.id, fee_catalog_id: f.id,
        academic_year: YEAR, name: f.name, category: f.category, amount: f.amount,
        mandatory: 1, payment_type: f.payment_type, status: 'active',
      });
      // bucket 4 → soldé ; bucket 3 → partiel (moitié) ; en dessous → impayé.
      if (bucket >= 3) {
        paiements.push({
          student_id: stu.id, item_id: itemId,
          amount: bucket === 4 ? f.amount : Math.round(f.amount / 2),
          date: addDays('2025-10-10', (stu.idx * 5) % 180),
          note: `Frais annexes — ${f.name}`,
        });
      }
    }
    // ~1 élève sur 3 souscrit une option (cantine, transport ou sortie).
    if (stu.idx % 3 === 0) {
      const optional = catalog.filter((x) => !x.mandatory);
      const f = optional[stu.idx % optional.length];
      ins('student_fee_items', {
        id: uid(), school_id: SCHOOL_ID, student_id: stu.id, fee_catalog_id: f.id,
        academic_year: YEAR, name: f.name, category: f.category, amount: f.amount,
        mandatory: 0, payment_type: f.payment_type, status: 'active',
      });
    }
  }
  // Numérotation SÉQUENTIELLE des reçus par ordre chronologique : c'est la
  // continuité de cette série qui rend visible une recette escamotée.
  paiements.sort((a, b) => a.date.localeCompare(b.date));
  for (const p of paiements) {
    receiptNo += 1;
    ins('fee_payments', {
      id: uid(), school_id: SCHOOL_ID, student_id: p.student_id, academic_year: YEAR,
      amount: p.amount, date: p.date, note: p.note,
      // Un versement SANS `student_fee_item_id` porte sur la pension (héritage) ;
      // avec, il solde un frais annexe précis.
      student_fee_item_id: p.item_id,
      recorded_by: acc.caissiere.userId, recorded_by_name: acc.caissiere.name,
      receipt_no: receiptNo,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. BUDGET ANNUEL v3 : annuel → périodes → rubriques → lignes → dépenses
  // ══════════════════════════════════════════════════════════════════════════
  const budgetId = uid();
  ins('budgets', {
    id: budgetId, school_id: SCHOOL_ID, academic_year: YEAR, tier: 'annual',
    envelope_amount: BUDGET_ENVELOPE, label: `Budget annuel ${YEAR}`, status: 'active',
    start_date: '2025-09-01', end_date: '2026-07-05',
  });

  const periods = BUDGET_PERIODES.map((p) => ins('budget_periods', {
    id: uid(), school_id: SCHOOL_ID, academic_year: YEAR, name: p.name,
    start_date: p.start, end_date: p.end, position: p.pos,
  }));

  // Chapitre RECETTE (hors enveloppe de dépense) — alimente « recettes prévues ».
  ins('budget_chapters', {
    id: uid(), school_id: SCHOOL_ID, budget_id: budgetId, code: 'REC-SCOL',
    label: 'Scolarités & frais annexes', kind: 'recette',
    planned_amount: 52000000, position: 0, status: 'active',
  });

  const rubIds = {};
  for (const r of BUDGET_RUBRIQUES) {
    rubIds[r.code] = uid();
    ins('budget_chapters', {
      id: rubIds[r.code], school_id: SCHOOL_ID, budget_id: budgetId, code: r.code,
      label: r.label, kind: 'depense', planned_amount: 0, position: r.pos,
      scope: null, status: 'active',
    });
  }

  const lignes = {};
  BUDGET_LIGNES.forEach((l, i) => {
    const id = uid();
    lignes[l.code] = { id, ...l };
    ins('budget_chapters', {
      id, school_id: SCHOOL_ID, budget_id: budgetId, parent_id: rubIds[l.rub],
      code: l.code, label: l.label, kind: 'depense', planned_amount: l.amount,
      position: i + 1, scope: l.scope,
      // Insérées en brouillon puis activées après leurs allocations : la garde
      // d'activation exige Σ% temporel = 100 (cf. budgetGuard).
      status: 'draft',
    });
    // Répartition TEMPORELLE (Σ = 100 %).
    periods.forEach((p, k) => ins('budget_line_periods', {
      id: uid(), school_id: SCHOOL_ID, budget_chapter_id: id, budget_period_id: p.id,
      pct: BUDGET_PERIODES[k].pct,
      amount: Math.round((l.amount * BUDGET_PERIODES[k].pct) / 100),
    }));
    // Répartition SECTORIELLE pour les lignes de portée « sectors » (Σ = 100 %).
    if (l.scope === 'sectors') {
      const parts = [['maternelle', 20], ['primaire', 40], ['college', 40]];
      for (const [key, pct] of parts) {
        ins('budget_line_sectors', {
          id: uid(), school_id: SCHOOL_ID, budget_chapter_id: id,
          school_unit_id: units[key].id, pct,
          amount: Math.round((l.amount * pct) / 100),
        });
      }
    }
  });
  db.prepare(
    "UPDATE budget_chapters SET status = 'active' WHERE budget_id = ? AND scope IS NOT NULL",
  ).run(budgetId);

  // Dépenses exécutées.
  for (const [code, amount, date, supplier] of DEPENSES_PAYEES) {
    const l = lignes[code];
    ins('budget_expenses', {
      id: uid(), school_id: SCHOOL_ID, budget_id: budgetId, budget_chapter_id: l.id,
      budget_period_id: periodOf(periods, date).id,
      school_unit_id: l.scope === 'sectors' ? units.college.id : null,
      category: l.label, supplier, amount, requester: acc.raf.name,
      status: 'paid', expense_date: date, notes: 'Dépense de fonctionnement de l’exercice.',
      created_by: acc.raf.name,
    });
  }
  // Les 8 cas du circuit de validation.
  const casIds = {};
  for (const d of DEPENSES_CAS) {
    const l = lignes[d.code];
    const id = uid();
    casIds[d.cas] = id;
    ins('budget_expenses', {
      id, school_id: SCHOOL_ID, budget_id: budgetId, budget_chapter_id: l.id,
      budget_period_id: periodOf(periods, d.date).id,
      school_unit_id: l.scope === 'sectors' ? units.college.id : null,
      category: l.label, subcategory: d.cas, supplier: 'Fournisseur local',
      amount: d.amount, requester: acc[d.by].name, status: d.status,
      expense_date: d.date, notes: d.note, created_by: acc[d.by].name,
    });
  }
  // CAS-H : la ligne Sécurité n'a plus le disponible → demande de déblocage.
  ins('budget_unlock_requests', {
    id: uid(), school_id: SCHOOL_ID, budget_id: budgetId,
    budget_chapter_id: lignes.SECU.id, requested_amount: 250000,
    reason: 'Ligne Sécurité presque épuisée — renfort de gardiennage pour les examens de fin d’année.',
    requester: acc.raf.name, requested_by: acc.raf.userId, status: 'pending',
  });

  // Chronologie des décisions (journal d'événements + audit).
  const CHRONO = [
    ['CAS-A', 'ExpenseSubmitted', 'caissiere', '2026-06-22 10:15'],
    ['CAS-B', 'ExpenseSubmitted', 'raf',       '2026-06-10 09:00'],
    ['CAS-B', 'ExpenseApproved',  'fondatrice', '2026-06-12 16:30'],
    ['CAS-C', 'ExpenseSubmitted', 'caissiere', '2026-06-14 10:15'],
    ['CAS-C', 'ExpenseApproved',  'coordo',    '2026-06-15 11:47'],
    ['CAS-C', 'ExpensePaid',      'raf',       '2026-06-15 14:20'],
    ['CAS-D', 'ExpenseSubmitted', 'raf',       '2026-06-24 08:40'],
    ['CAS-E', 'ExpenseSubmitted', 'caissiere', '2026-06-07 15:00'],
    ['CAS-E', 'ExpenseRejected',  'coordo',    '2026-06-08 09:10'],
    ['CAS-F', 'ExpenseSubmitted', 'raf',       '2026-06-17 11:00'],
    ['CAS-F', 'ExpenseApproved',  'coordo',    '2026-06-18 10:05'],
    ['CAS-G', 'ExpenseSubmitted', 'caissiere', '2026-06-04 09:30'],
    ['CAS-G', 'ExpenseApproved',  'coordo',    '2026-06-04 14:00'],
    ['CAS-G', 'ExpensePaid',      'caissiere', '2026-06-05 10:00'],
  ];
  let seqNo = 0;
  for (const [cas, type, who, at] of CHRONO) {
    seqNo += 1;
    ins('domain_events', {
      id: uid(), school_id: SCHOOL_ID, aggregate_type: 'expense',
      aggregate_id: casIds[cas], event_type: type,
      payload: JSON.stringify({ cas, seed: MARKER }),
      actor_id: acc[who].userId, actor_name: acc[who].name,
      occurred_at: `${at.replace(' ', 'T')}:00.000Z`, seq: seqNo, device_id: MARKER,
    });
  }
  const AUDIT = [
    ['CAS-B', 'expense.approved', 'fondatrice', '2026-06-12 16:30'],
    ['CAS-C', 'expense.paid',     'raf',        '2026-06-15 14:20'],
    ['CAS-E', 'expense.rejected', 'coordo',     '2026-06-08 09:10'],
    ['CAS-F', 'expense.approved', 'coordo',     '2026-06-18 10:05'],
    ['CAS-G', 'expense.paid',     'caissiere',  '2026-06-05 10:00'],
  ];
  for (const [cas, action, who, at] of AUDIT) {
    ins('audit_events', {
      id: uid(), school_id: SCHOOL_ID, action, aggregate_type: 'expense',
      target_id: casIds[cas], actor_id: acc[who].userId, actor_name: acc[who].name,
      payload: JSON.stringify({ cas, seed: MARKER }),
      at: `${at.replace(' ', 'T')}:00.000Z`,
    });
  }

  // Cloche : ce qui attend une décision à l'écran d'ouverture.
  const NOTIFS = [
    [acc.fondatrice.userId, 'fondatrice', 'expense.pending', 'Dépense en attente de votre décision', 'Réfection de la toiture — 1 250 000 FCFA (ligne Entretien) à approuver.'],
    [acc.coordo.userId, 'coordonnateur_general', 'expense.pending', 'Dépense en attente d’approbation', 'Fournitures — 85 000 FCFA soumise par la Caissière.'],
    [acc.fondatrice.userId, 'fondatrice', 'unlock.pending', 'Demande de déblocage de ligne', 'Sécurité : 250 000 FCFA demandés (ligne presque épuisée).'],
    [acc.raf.userId, 'raf', 'expense.approved', 'Dépense approuvée', 'Maintenance informatique — 450 000 FCFA : décaissement à effectuer.'],
  ];
  for (const [rid, role, type, title, body] of NOTIFS) {
    ins('notifications', {
      id: uid(), school_id: SCHOOL_ID, recipient_id: rid, recipient_role: role,
      type, title, body, link: '/app/depenses', read: 0,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9. RESSOURCES HUMAINES — contrats, congés, présences, paie de juin 2026
  // ══════════════════════════════════════════════════════════════════════════
  const catPaie = PAYROLL_CATALOG.map((p) => ins('hr_payroll_catalog', {
    id: uid(), school_id: SCHOOL_ID, code: p.code, name: p.name, kind: p.kind,
    calc_type: p.calc_type, amount: p.amount, rate: p.rate, base_ref: p.base_ref,
    active: 1, position: p.pos,
  }));

  // Réplique EXACTE de resolvePayrollItems() (src/lib/hrEngine.js) : les primes
  // se calculent sur le salaire de base, retenues et charges patronales sur le brut.
  const resolveAmount = (item, baseSalary, brut) =>
    item.calc_type === 'percent'
      ? Math.round(((item.base_ref === 'salaire_base' ? baseSalary : brut) * (item.rate || 0)) / 100)
      : (item.amount || 0);

  for (const a of ACCOUNTS) {
    const { staffId } = acc[a.key];
    ins('hr_contracts', {
      id: uid(), school_id: SCHOOL_ID, staff_id: staffId, type: 'cdi',
      reference: `CT-${YEAR}-${a.key.toUpperCase()}`, title: a.fonction,
      start_date: '2021-09-01', salary: a.salary, status: 'active',
      notes: 'Contrat à durée indéterminée — établissement privé confessionnel.',
    });
    ins('hr_career_events', {
      id: uid(), school_id: SCHOOL_ID, staff_id: staffId, event_date: '2021-09-01',
      type: 'recrutement', title: 'Recrutement', description: `Prise de fonction : ${a.fonction}.`,
    });
    // Quelques présences sur juin 2026 (le mois de paie).
    for (let d = 1; d <= 10; d++) {
      ins('hr_attendance', {
        id: uid(), school_id: SCHOOL_ID, staff_id: staffId,
        att_date: `2026-06-${String(d).padStart(2, '0')}`,
        status: rng() < 0.08 ? pick(['retard', 'mission']) : 'present',
        check_in: '07:15', check_out: '16:30',
      });
    }

    // Bulletin de paie de juin 2026 : primes → brut → retenues → net.
    const items = catPaie.filter((c) => c.code !== 'RET-AVAN' || ['caissiere', 'surveillant', 'ens_prim'].includes(a.key));
    const primes = items.filter((i) => i.kind === 'prime')
      .map((i) => ({ ...i, resolved: resolveAmount(i, a.salary, a.salary) }));
    const bonuses = primes.reduce((s, i) => s + i.resolved, 0);
    const brut = a.salary + bonuses;
    const retenues = items.filter((i) => i.kind === 'retenue')
      .map((i) => ({ ...i, resolved: resolveAmount(i, a.salary, brut) }));
    const patronales = items.filter((i) => i.kind === 'patronale')
      .map((i) => ({ ...i, resolved: resolveAmount(i, a.salary, brut) }));
    const deductions = retenues.reduce((s, i) => s + i.resolved, 0);

    const payrollId = uid();
    ins('hr_payroll', {
      id: payrollId, school_id: SCHOOL_ID, staff_id: staffId, period: '2026-06',
      base_salary: a.salary, worked_days: 22, bonuses, deductions,
      net_salary: Math.max(0, a.salary + bonuses - deductions),
      status: 'paid', paid_date: '2026-06-28',
      notes: 'Bulletin de paie — juin 2026.',
    });
    for (const it of [...primes, ...retenues, ...patronales]) {
      ins('hr_payroll_items', {
        id: uid(), school_id: SCHOOL_ID, payroll_id: payrollId, catalog_id: it.id,
        code: it.code, kind: it.kind, name: it.name, calc_type: it.calc_type,
        rate: it.rate, base_ref: it.base_ref, amount: it.resolved,
      });
    }
  }
  // Congés : un approuvé, un en attente, un maladie — de quoi montrer le circuit.
  const CONGES = [
    ['dirprim',     'annuel',  '2026-04-06', '2026-04-17', 12, 'approved', 'Congé annuel.'],
    ['surveillant', 'maladie', '2026-05-11', '2026-05-15',  5, 'approved', 'Certificat médical fourni.'],
    ['ens_prim',    'annuel',  '2026-07-06', '2026-07-24', 19, 'pending',  'Demande de congé annuel — en attente de décision.'],
  ];
  for (const [key, type, start, end, days, status, reason] of CONGES) {
    ins('hr_leaves', {
      id: uid(), school_id: SCHOOL_ID, staff_id: acc[key].staffId, type,
      start_date: start, end_date: end, days, reason, status,
      decided_by: status === 'approved' ? acc.coordo.name : null,
      decided_at: status === 'approved' ? '2026-03-30T09:00:00.000Z' : null,
    });
  }
  // Évaluations annuelles (échantillon).
  for (const key of ['ens_mat', 'ens_prim', 'ens_sec', 'caissiere', 'surveillant']) {
    ins('hr_evaluations', {
      id: uid(), school_id: SCHOOL_ID, staff_id: acc[key].staffId,
      eval_date: '2026-06-20', period: YEAR, evaluator: acc.coordo.name,
      score: Math.round((13 + rng() * 6) * 10) / 10, rating: pick(['Bon', 'Très bon', 'Satisfaisant']),
      strengths: 'Ponctualité, implication auprès des élèves.',
      improvements: 'Renforcer l’usage des outils numériques.',
      comments: 'Évaluation annuelle de fin d’exercice.', status: 'final',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 10. VIE SCOLAIRE (Surveillant Général) — collège uniquement
  // ══════════════════════════════════════════════════════════════════════════
  const collegiens = students.filter((s) => s.cls.unit === 'college');
  const sv = acc.surveillant.userId;

  collegiens.slice(0, 30).forEach((s, i) => {
    ins('late_arrivals', {
      id: uid(), school_id: SCHOOL_ID, student_id: s.id, class_id: s.classId,
      year_label: YEAR, date: addDays('2025-10-02', i * 6),
      arrival_time: `07:${String(35 + (i % 25)).padStart(2, '0')}`,
      reason: pick(['Transport', 'Réveil tardif', 'Embouteillage', 'Raison familiale', 'Non justifié']),
      justified: i % 2 === 0 ? 1 : 0,
      justification: i % 2 === 0 ? 'Mot des parents présenté au surveillant.' : null,
      validated: i % 3 !== 0 ? 1 : 0,
      sequence_order: 1 + (i % 6), recorded_by: sv, device_id: MARKER,
    });
  });

  // Les champs de la vie scolaire stockent des CODES (src/core/disciplineTerms.js),
  // pas des libellés : un libellé en clair s'afficherait brut à l'écran.
  const incidents = collegiens.slice(0, 12).map((s, i) => {
    const id = uid();
    ins('disciplinary_incidents', {
      id, school_id: SCHOOL_ID, student_id: s.id, class_id: s.classId,
      year_label: YEAR,
      incident_type: pick(['bagarre', 'insolence', 'fraude', 'degradation', 'telephone', 'autre']),
      date: addDays('2025-10-10', i * 15), incident_time: '10:15',
      location: pick(['Cour de récréation', 'Salle de classe', 'Couloir du bloc B', 'Terrain de sport']),
      description: 'Fait constaté et consigné par le surveillant général.',
      witnesses: 'Deux camarades de classe',
      severity: pick(['mineur', 'majeur', 'grave']),
      responsible: sv,
      decision: i % 3 === 0 ? null : 'Sanction appliquée et notifiée aux parents.',
      status: ['ouvert', 'traite', 'classe'][i % 3],
      sequence_order: 1 + (i % 6), recorded_by: sv, device_id: MARKER,
    });
    return { id, s };
  });

  incidents.slice(0, 8).forEach(({ id, s }, i) => {
    const actionId = uid();
    ins('disciplinary_actions', {
      id: actionId, school_id: SCHOOL_ID, student_id: s.id, class_id: s.classId,
      incident_id: id, year_label: YEAR,
      action_type: pick(['avertissement_ecrit', 'exclusion_temporaire', 'travail_interet', 'blame', 'retenue']),
      date: addDays('2025-10-12', i * 15), reason: 'Suite à incident disciplinaire.',
      duration_days: i % 4 === 1 ? 2 : null,
      start_date: i % 4 === 1 ? addDays('2025-10-13', i * 15) : null,
      end_date: i % 4 === 1 ? addDays('2025-10-15', i * 15) : null,
      decided_by: acc.censeur.name, recorded_by: sv,
      sequence_order: 1 + (i % 6), device_id: MARKER,
    });
    if (i < 5) {
      ins('student_detentions', {
        id: uid(), school_id: SCHOOL_ID, student_id: s.id, class_id: s.classId,
        action_id: actionId, year_label: YEAR, date: addDays('2025-10-18', i * 15),
        start_time: '15:00', end_time: '17:00', duration_hours: 2,
        task: 'Devoir supplémentaire encadré.', supervised_by: acc.surveillant.name,
        completed: i % 2 === 0 ? 1 : 0, recorded_by: sv, device_id: MARKER,
      });
    }
    if (i < 6) {
      ins('parent_meetings', {
        id: uid(), school_id: SCHOOL_ID, student_id: s.id, class_id: s.classId,
        incident_id: id, year_label: YEAR, target: ['parent', 'les_deux', 'eleve'][i % 3],
        reason: 'Convocation des parents suite à incident.',
        meeting_date: addDays('2025-10-20', i * 15), meeting_time: '14:00',
        location: 'Bureau du surveillant général',
        status: ['planifie', 'honore', 'absent', 'annule'][i % 4],
        outcome: i % 4 === 1 ? 'Entretien tenu — engagement écrit de l’élève.' : null,
        convened_by: sv, device_id: MARKER,
      });
    }
  });

  collegiens.slice(30, 40).forEach((s, i) => {
    ins('student_warnings', {
      id: uid(), school_id: SCHOOL_ID, student_id: s.id, class_id: s.classId,
      year_label: YEAR, warning_type: i % 3 === 0 ? 'oral' : 'ecrit',
      category: i % 2 === 0 ? 'travail' : 'conduite',
      date: addDays('2026-01-12', i * 4),
      reason: 'Avertissement notifié à l’élève et à sa famille.',
      acknowledged: i % 2 === 0 ? 1 : 0, recorded_by: sv, device_id: MARKER,
    });
  });

  collegiens.slice(40, 48).forEach((s, i) => {
    ins('exit_permissions', {
      id: uid(), school_id: SCHOOL_ID, student_id: s.id, class_id: s.classId,
      year_label: YEAR, exit_type: pick(['parentale', 'medicale', 'administrative']),
      date: addDays('2026-02-03', i * 5), exit_time: '10:00',
      return_time: i % 2 === 0 ? '12:00' : null,
      reason: 'Rendez-vous médical / raison familiale.',
      authorized_by: acc.surveillant.name,
      accompanied_by: i % 3 === 0 ? 'Parent' : null,
      returned: i % 2 === 0 ? 1 : 0, recorded_by: sv, device_id: MARKER,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 11. PATRIMOINE (immobilisations) + SIGNALEMENTS
  // ══════════════════════════════════════════════════════════════════════════
  // Catégories et statuts = codes de src/lib/assetEngine.js
  // (vehicule|batiment|ordinateur|imprimante|groupe_electrogene|mobilier ;
  //  active|maintenance|out_of_service|disposed).
  const ASSETS = [
    ['Photocopieur Canon iR2625',    'imprimante',        1250000, 'Secrétariat',       'college'],
    ['Vidéoprojecteur Epson EB-X06', 'ordinateur',         380000, 'Salle multimédia',  'college'],
    ['Lot de 40 tables-bancs',       'mobilier',          1600000, 'Bloc pédagogique',  'primaire'],
    ['Ordinateur portable HP',       'ordinateur',         450000, 'Bureau du RAF',     'college'],
    ['Serveur local NotesCam',       'ordinateur',         680000, 'Salle serveur',     'college'],
    ['Groupe électrogène 15 kVA',    'groupe_electrogene',3200000, 'Cour arrière',      'college'],
    ['Bus scolaire Toyota Coaster',  'vehicule',         12500000, 'Parking',           'college'],
    ['Bloc pédagogique A',           'batiment',         28000000, 'Enceinte',          'primaire'],
    ['Jeux de motricité',            'mobilier',           540000, 'Cour maternelle',   'maternelle'],
    ['Tableaux blancs (lot de 8)',   'mobilier',           440000, 'Bloc primaire',     'primaire'],
    ['Imprimante Epson L3250',       'imprimante',         180000, 'Bureau du Censeur', 'college'],
    ['Extincteurs (lot de 10)',      'mobilier',           350000, 'Ensemble du site',  'college'],
  ];
  ASSETS.forEach(([name, category, value, location, unitKey], i) => {
    const assetId = uid();
    ins('assets', {
      id: assetId, school_id: SCHOOL_ID, category, name, value,
      asset_number: `IMMO-${String(i + 1).padStart(3, '0')}`,
      acquisition_date: `20${int(19, 24)}-${String(int(1, 12)).padStart(2, '0')}-15`,
      // Le bus est immobilisé : alimente le signalement « patrimoine » plus bas.
      status: i === 6 ? 'maintenance' : 'active', location,
      serial_number: `SN${int(100000, 999999)}`, unit_id: units[unitKey].id,
    });
    if (i % 4 === 2) {
      const bd = uid();
      ins('asset_breakdowns', {
        id: bd, school_id: SCHOOL_ID, asset_id: assetId, date: '2026-03-04',
        description: 'Panne signalée par le service concerné.',
        severity: pick(['mineure', 'majeure']), status: i === 6 ? 'open' : 'resolved',
        reported_by: acc.censeur.name,
      });
      if (i !== 6) {
        ins('asset_repairs', {
          id: uid(), school_id: SCHOOL_ID, asset_id: assetId, date: '2026-03-18',
          description: 'Réparation effectuée par un prestataire externe.',
          provider: 'Ets Technique Nsimeyong', cost: int(45000, 180000), status: 'done',
        });
        ins('asset_expenses', {
          id: uid(), school_id: SCHOOL_ID, asset_id: assetId, date: '2026-03-18',
          category: 'reparation', amount: int(45000, 180000), supplier: 'Ets Technique Nsimeyong',
        });
      }
    }
  });

  const SIGNALEMENTS = [
    ['maintenance',  'Fuite d’eau aux sanitaires du bloc B',    'high',     'in_progress', 'support'],
    ['maintenance',  'Panne électrique en salle informatique',  'critical', 'assigned',    'support'],
    ['vie_scolaire', 'Attroupement récurrent devant le portail', 'normal',   'new',         'surveillance'],
    ['academique',   'Manuels de SVT manquants en 4e',          'normal',   'in_progress', 'administration'],
    ['finances',     'Écart de caisse constaté le 12/05',       'high',     'resolved',    'comptabilite'],
    ['patrimoine',   'Bus scolaire immobilisé — boîte de vitesses', 'critical', 'assigned', 'support'],
    ['vie_scolaire', 'Absences répétées d’un élève de 3e',      'normal',   'resolved',    'surveillance'],
    ['maintenance',  'Vitre cassée en salle de CM1',            'low',      'new',         'support'],
  ];
  SIGNALEMENTS.forEach(([domain, title, priority, status, dept], i) => {
    const sigId = uid();
    const created = addDays('2026-02-02', i * 9);
    ins('signalements', {
      id: sigId, school_id: SCHOOL_ID, domain, title,
      description: 'Signalement enregistré depuis le module Reports.',
      priority, status,
      reporter_id: acc.censeur.userId, reporter_name: acc.censeur.name,
      assignee_id: acc.coordo.userId,
      resolution: status === 'resolved' ? 'Traité et clôturé.' : null,
      created_at: `${created}T09:00:00.000Z`, updated_at: `${created}T09:00:00.000Z`,
      version: 1, device_id: MARKER,
    });
    ins('signalement_history', {
      id: uid(), school_id: SCHOOL_ID, signalement_id: sigId, action: 'created',
      to_status: 'new', detail: `Affecté au département « ${dept} ».`,
      actor: acc.censeur.name, actor_id: acc.censeur.userId, at: `${created}T09:00:00.000Z`,
    });
    if (status !== 'new') {
      ins('signalement_history', {
        id: uid(), school_id: SCHOOL_ID, signalement_id: sigId, action: 'status_changed',
        from_status: 'new', to_status: status, actor: acc.coordo.name,
        actor_id: acc.coordo.userId, at: `${addDays(created, 2)}T11:00:00.000Z`,
      });
      ins('signalement_comments', {
        id: uid(), school_id: SCHOOL_ID, signalement_id: sigId,
        body: 'Prise en charge en cours, un prestataire a été contacté.',
        author: acc.coordo.name, author_id: acc.coordo.userId,
      });
    }
  });

  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('\n✖ Échec du seed — aucune donnée écrite.\n');
  throw e;
}

// ════════════════════════════════════════════════════════════════════════════
// RÉSUMÉ
// ════════════════════════════════════════════════════════════════════════════
const total = Object.values(counts).reduce((s, n) => s + n, 0);
const order = Object.keys(counts).sort();
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  COLLÈGE LA RETRAITE — établissement de démonstration (LAN)  ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`  Base    : ${DB_PATH}`);
console.log(`  École   : ${SCHOOL_ID}`);
console.log(`  Année   : ${YEAR}  (instantané : 30 juin 2026)`);
console.log(`  Total   : ${total} lignes insérées\n`);
for (const t of order) console.log(`   ${String(counts[t]).padStart(6)}  ${t}`);
console.log(`\n  16 comptes — mot de passe commun : ${PASSWORD}`);
for (const a of ACCOUNTS) {
  console.log(`   ${a.email.padEnd(34)} ${(a.gov || a.base).padEnd(30)} ${a.name}`);
}
console.log('\n  Démarrer sur cette base :');
console.log(`     NOTESCAM_DATA_DIR="${DATA_DIR}" npm run server`);
console.log(`     (PowerShell) $env:NOTESCAM_DATA_DIR="${DATA_DIR}"; npm run server\n`);
