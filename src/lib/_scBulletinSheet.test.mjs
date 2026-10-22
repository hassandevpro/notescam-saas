// Éprouve le classeur des bulletins du SECOND CYCLE, dans les deux sens.
//
// Lancer : node src/lib/_scBulletinSheet.test.mjs
//   (le lanceur du dépôt réessaie avec scripts/lib/esm-resolve.mjs pour les
//    imports sans extension — `npm test -- --filter scBulletinSheet`)
//
// LE VRAI ENJEU EST L'ALLER-RETOUR. Le classeur exporté doit se réimporter sans
// rien changer : si l'écriture et la lecture divergent d'un caractère dans les
// en-têtes, l'import ne reconnaît plus les matières et l'école croit que ses
// notes ont disparu. On ne simule donc PAS le découpage : on extrait le vrai
// `rawRowsToGrades` d'exportCsv.js — celui qu'emploie l'écran Notes — et on lui
// fait relire les feuilles que buildScWorkbook vient d'écrire.
//
// (Extraction par découpage de texte : exportCsv.js réveille le store d'auth et
// le client Supabase à l'import, qui n'existent pas hors navigateur. Même
// technique que _importStudents / _studentFieldsIO, bornes incluses.)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sequenceFromSheetName, buildScWorkbook, planScSheetImport, groupScWrites,
  scSheetColumns, orderScStudents,
} from './scBulletinSheet.js';

const ici = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(ici, 'exportCsv.js'), 'utf8');
const PROCHAINE_DECLARATION = /\n(?:export\s+)?(?:async\s+)?(?:function|const|class)\s/;
const debut = src.indexOf('function rawRowsToGrades');
if (debut < 0) throw new Error('rawRowsToGrades introuvable dans exportCsv.js');
const relative = src.slice(debut + 10).search(PROCHAINE_DECLARATION);
const corps = src.slice(debut, relative < 0 ? undefined : debut + 10 + relative);
const rawRowsToGrades = new Function(`${corps}\n; return rawRowsToGrades;`)();

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};

// ── Une 1ère D : deux groupes, six matières, quatre élèves ──────────────────
const CLASSE = 'c-1ereD';
const subjects = [
  { id: 'm1', name: 'Mathématiques',  max: 20, coef: 6 },
  { id: 'm2', name: 'Physique',       max: 20, coef: 4 },
  { id: 'm3', name: 'Chimie',         max: 20, coef: 2 },
  { id: 'm4', name: 'Français',       max: 20, coef: 3 },
  { id: 'm5', name: 'Histoire-Géographie', max: 20, coef: 2 },
  { id: 'm6', name: 'EPS',            max: 20, coef: 1 },
];
const students = [
  { id: 'e1', name: 'ABEGA Sandrine', matricule: 'S-001' },
  { id: 'e2', name: 'BIYA Paul',      matricule: 'S-002' },
  { id: 'e3', name: 'MOUSSA Ali',     matricule: 'S-003' },
  { id: 'e4', name: 'ZOA Thérèse',    matricule: 'S-004' },
];

// Ce que rend assembleScBulletin : des matières déjà rangées par GROUPE.
const groupeDe = (ids, nom) => ({
  nom,
  rows: ids.map((id) => {
    const s = subjects.find((x) => x.id === id);
    return { id, nom: s.name, coef: s.coef, moyenne: null, rang: '', appreciation: '' };
  }),
  moyenne: null,
});
const dataPour = (rang, moyennes) => {
  const g1 = groupeDe(['m1', 'm2', 'm3'], 'GROUPE 1');
  const g2 = groupeDe(['m4', 'm5', 'm6'], 'GROUPE 2');
  for (const g of [g1, g2]) for (const r of g.rows) r.moyenne = moyennes[r.id] ?? null;
  g1.moyenne = 12.5; g2.moyenne = 13;
  return { groups: [g1, g2], coefSum: 18, mxSum: 225, moyenneGenerale: 12.75,
    appreciation: 'Bien', generalRank: rang };
};
const scDataById = {
  e1: { data: dataPour(2, { m1: 14, m2: 11.5, m3: 9, m4: 13, m5: 12, m6: 16 }), decision: 'Admis(e)' },
  e2: { data: dataPour(1, { m1: 16, m2: 15, m3: 14, m4: 15, m5: 14, m6: 18 }), decision: 'Admis(e)' },
  e3: { data: dataPour(4, { m1: 7, m2: 6.5, m3: 8, m4: 9, m5: 10, m6: 12 }),   decision: '' },
  e4: { data: dataPour(3, { m1: 10, m2: 10, m3: 11, m4: 12, m5: 11.5, m6: 14 }), decision: 'Admis(e)' },
};

// Notes réellement saisies : trimestre 1 = séquences 1 et 2. Toutes les notes de
// la séquence 2 de MOUSSA manquent — un cas ordinaire, pas une anomalie.
const gradeMap = {
  [`${CLASSE}_e1_1`]: { m1: '14', m2: '11.5', m3: '9', m4: '13', m5: '12', m6: '16' },
  [`${CLASSE}_e1_2`]: { m1: '13.75', m2: '10', m3: '', m4: '12', m5: '11', m6: '15' },
  [`${CLASSE}_e2_1`]: { m1: '16', m2: '15', m3: '14', m4: '15', m5: '14', m6: '18' },
  [`${CLASSE}_e2_2`]: { m1: '17', m2: '14.5', m3: '13', m4: '16', m5: '15', m6: '17' },
  [`${CLASSE}_e3_1`]: { m1: '7', m2: '6.5', m3: '8', m4: '9', m5: '10', m6: '12' },
  [`${CLASSE}_e4_1`]: { m1: '10', m2: '10', m3: '11', m4: '12', m5: '11.5', m6: '14' },
};

const LABELS = {
  rang: 'Rang', matricule: 'Matricule', eleve: 'Élève', moyenne: 'Moyenne',
  moyenneGenerale: 'Moyenne générale', appreciation: 'Appréciation',
  decision: 'Décision', recapitulatif: 'Récapitulatif',
};
const seqLabel = (n) => `Séquence ${n}`;
const classeur = () => buildScWorkbook({
  students, scDataById, subjects, gradeMap, classId: CLASSE, seqs: [1, 2],
  labels: LABELS, seqLabel,
});

// ── 1. Le nom de la feuille décide, et le récapitulatif est protégé ─────────
console.log('\n-- Numéro de séquence porté par le nom de la feuille --');
ok(sequenceFromSheetName('Séquence 3') === 3, '« Séquence 3 » → 3', sequenceFromSheetName('Séquence 3'));
ok(sequenceFromSheetName('Sequence 1') === 1, '« Sequence 1 » → 1', sequenceFromSheetName('Sequence 1'));
ok(sequenceFromSheetName('Séq6') === 6, '« Séq6 » → 6', sequenceFromSheetName('Séq6'));
ok(sequenceFromSheetName('Secuencia 4') === 4, '« Secuencia 4 » → 4', sequenceFromSheetName('Secuencia 4'));
ok(sequenceFromSheetName('Récapitulatif') === null,
  'le RÉCAPITULATIF ne porte aucun numéro : il ne sera jamais relu comme une grille',
  sequenceFromSheetName('Récapitulatif'));
ok(sequenceFromSheetName('Summary') === null, '« Summary » non plus', sequenceFromSheetName('Summary'));
ok(sequenceFromSheetName('Séquence 7') === null,
  'une 7e séquence n’existe pas : refusée plutôt que rangée n’importe où', sequenceFromSheetName('Séquence 7'));

// ── 2. La forme du classeur suit le bulletin imprimé ───────────────────────
console.log('\n-- Forme du classeur exporté --');
const feuilles = classeur();
ok(feuilles.length === 3, 'récapitulatif + une feuille par séquence de la période', feuilles.length);
ok(feuilles[0].name === 'Récapitulatif', '1re feuille = récapitulatif', feuilles[0].name);
ok(feuilles[1].name === 'Séquence 1' && feuilles[2].name === 'Séquence 2',
  'les feuilles de séquence portent leur numéro', [feuilles[1].name, feuilles[2].name]);

const [ligneGroupes, enTetes, ...lignesRecap] = feuilles[0].rows;
ok(ligneGroupes[3] === 'GROUPE 1' && ligneGroupes[6] === 'GROUPE 2',
  'la ligne de groupes est alignée sur la 1re matière de chaque groupe',
  [ligneGroupes[3], ligneGroupes[6]]);
ok(enTetes.slice(0, 3).join('|') === 'Rang|Matricule|Élève', 'en-tête : rang, matricule, élève', enTetes.slice(0, 3));
ok(enTetes[3] === 'Mathématiques /20 (×6)', 'une colonne de matière porte son barème et son coefficient', enTetes[3]);
ok(enTetes.slice(-3).join('|') === 'Moyenne générale|Appréciation|Décision',
  'les trois dernières colonnes du récapitulatif', enTetes.slice(-3));
ok(enTetes[9] === 'Moyenne GROUPE 1' && enTetes[10] === 'Moyenne GROUPE 2',
  'une colonne de moyenne par groupe', [enTetes[9], enTetes[10]]);
ok(lignesRecap.length === 4, 'une ligne par élève', lignesRecap.length);
ok(lignesRecap[0][2] === 'BIYA Paul',
  'les élèves sont rangés par RANG GÉNÉRAL, pas par ordre alphabétique', lignesRecap[0][2]);
ok(lignesRecap[0][3] === '16', 'la moyenne de matière vient du bulletin assemblé', lignesRecap[0][3]);
ok(lignesRecap.find((l) => l[2] === 'ABEGA Sandrine')[4] === '11,5',
  'une moyenne décimale est écrite avec la VIRGULE (locale Windows indifférente)',
  lignesRecap.find((l) => l[2] === 'ABEGA Sandrine')[4]);

const [enTeteSeq1, ...lignesSeq1] = feuilles[1].rows;
ok(enTeteSeq1[0] === 'Élève' && enTeteSeq1[1] === 'Mathématiques /20',
  'la feuille de séquence porte l’en-tête de l’écran Notes — « Élève, Matière /max »',
  enTeteSeq1.slice(0, 2));
ok(enTeteSeq1.length === 7, 'sept colonnes : l’élève et ses six matières', enTeteSeq1.length);
ok(lignesSeq1.length === 4, 'une ligne par élève dans la grille de séquence', lignesSeq1.length);

// ── 3. L'ALLER-RETOUR : réimporter l'export ne change rien ─────────────────
console.log('\n-- Aller-retour : le classeur exporté se réimporte sans écriture --');
const relire = (fs) => fs.map((f) => {
  const { rows, error } = rawRowsToGrades(f.rows);
  return { nom: f.name, lignes: rows, erreur: error };
});
const planIdentique = planScSheetImport({
  feuilles: relire(feuilles), classStudents: students, subjects, gradeMap, classId: CLASSE,
});
ok(planIdentique.ecritures.length === 0,
  'AUCUNE écriture : tout ce que porte le classeur est déjà en base, au caractère près',
  planIdentique.ecritures);
ok(planIdentique.feuilles.length === 2,
  'les deux feuilles de séquence sont bien lues (et pas le récapitulatif)',
  planIdentique.feuilles.map((f) => f.nom));
ok(planIdentique.ignorees.length === 1 && planIdentique.ignorees[0] === 'Récapitulatif',
  'le récapitulatif est ignoré, et annoncé comme tel', planIdentique.ignorees);
ok(planIdentique.elevesInconnus.length === 0 && planIdentique.matieresInconnues.length === 0,
  'tous les élèves et toutes les matières de l’export sont reconnus au retour',
  [planIdentique.elevesInconnus, planIdentique.matieresInconnues]);
ok(planIdentique.horsBareme === 0, 'aucune note hors barème dans un export relu', planIdentique.horsBareme);

// ── 4. Ce que l'école modifie dans Excel, et ce qu'on en fait ──────────────
console.log('\n-- Un classeur rempli dans Excel --');
const rempli = [
  {
    name: 'Séquence 2',
    rows: [
      ['Élève', 'Mathématiques /20', 'Physique /20', 'Chimie /20', 'Instruction civique /20'],
      ['ABEGA Sandrine', '15,5', '', '12', '14'],          // 1 remplacement, 1 nouvelle, 1 vide
      ['moussa ali',     '11', '10', '', ''],              // casse et accents indifférents
      ['NKOLO Jean',     '12', '12', '12', '12'],          // élève absent de la classe
      ['ZOA Thérèse',    '25', '9', '', ''],               // 25/20 : hors barème
    ],
  },
  {
    name: 'Récapitulatif',
    rows: [['', '', ''], ['Rang', 'Matricule', 'Élève', 'Mathématiques /20 (×6)'], ['1', 'S-002', 'BIYA Paul', '16']],
  },
];
const plan = planScSheetImport({
  feuilles: relire(rempli), classStudents: students, subjects, gradeMap, classId: CLASSE,
});

const valeur = (eleveId, subjectId) => plan.ecritures
  .find((e) => e.student.id === eleveId && e.subjectId === subjectId)?.valeur;

ok(plan.ecritures.length === 5,
  '5 écritures retenues : 15,5 + 12 (Sandrine) et 11 + 10 (Moussa), plus le 9 de Thérèse',
  plan.ecritures.map((e) => `${e.student.name}/${e.subjectId}=${e.valeur}`));
ok(valeur('e1', 'm1') === '15.5',
  'la virgule décimale saisie dans Excel est normalisée en point pour la base', valeur('e1', 'm1'));
ok(valeur('e1', 'm3') === '12',
  'une colonne vide en base reçoit bien la note du classeur', valeur('e1', 'm3'));
ok(valeur('e1', 'm2') === undefined,
  'une CELLULE VIDE n’efface pas la note déjà enregistrée', valeur('e1', 'm2'));
ok(valeur('e3', 'm1') === '11',
  'l’élève est reconnu malgré la casse et les accents (« moussa ali »)', valeur('e3', 'm1'));
ok(plan.remplacements === 1 && plan.feuilles[0].remplacements === 1,
  'un seul REMPLACEMENT annoncé : le 14 de Sandrine devient 15,5',
  [plan.remplacements, plan.feuilles[0].remplacements]);
ok(plan.elevesInconnus.join() === 'NKOLO Jean',
  'l’élève étranger à la classe est listé, jamais rattaché au plus proche', plan.elevesInconnus);
ok(plan.matieresInconnues.join() === 'Instruction civique',
  'la matière absente de la classe est listée, jamais rattachée au plus proche', plan.matieresInconnues);
ok(plan.horsBareme === 1 && valeur('e4', 'm1') === undefined,
  'le 25/20 est REJETÉ, et surtout pas tronqué à 20', [plan.horsBareme, valeur('e4', 'm1')]);
ok(plan.ignorees.join() === 'Récapitulatif',
  'le récapitulatif d’un classeur rempli reste ignoré : ses moyennes ne sont pas des notes',
  plan.ignorees);

// ── 5. Regroupement des écritures ─────────────────────────────────────────
console.log('\n-- Une seule écriture par élève et par séquence --');
const paquets = groupScWrites(plan.ecritures);
ok(paquets.length === 3, 'trois paquets : Sandrine, Moussa et Thérèse en séquence 2', paquets.length);
const paquetSandrine = paquets.find((p) => p.student.id === 'e1');
ok(paquetSandrine.seq === 2 && Object.keys(paquetSandrine.scores).length === 2,
  'les deux notes de Sandrine partent en UN appel (la file hors-ligne ne gonfle pas)',
  paquetSandrine);

// ── 6. Classe vide : aucune colonne inventée ───────────────────────────────
console.log('\n-- Classe sans bulletin assemblé --');
const vide = scSheetColumns({ students, scDataById: {}, subjects });
ok(vide.matieres.length === 0 && vide.groupes.length === 0,
  'sans bulletin assemblé, aucune colonne n’est inventée', vide);
ok(orderScStudents(students, {})[0].name === 'ABEGA Sandrine',
  'sans rang calculé, les élèves retombent sur l’ordre alphabétique',
  orderScStudents(students, {})[0].name);

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${echecs} ECHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
