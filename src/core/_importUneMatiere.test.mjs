// L'IMPORT DE NOTES N'ÉCRIT QUE LA MATIÈRE CHOISIE
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Consigne du responsable, 2026-10-23 : « il faut aussi que l'import de note se
// fasse une matière à la fois ».
//
// Le classeur exporté porte UNE COLONNE PAR MATIÈRE de la classe. L'import
// lisait toutes les colonnes reconnues : l'enseignant qui réimportait son
// fichier réécrivait les colonnes de ses collègues avec l'état qu'elles avaient
// au moment de l'EXPORT — périmé dès qu'un collègue avait saisi entre-temps.
// C'est la même famille de dégâts que la note qui s'écrivait dans la matière
// suivante (I12) : une note juste, au mauvais endroit.
//
// Les cas ci-dessous sont ceux de l'écran : un classeur de classe entière, un
// enseignant qui n'en remplit qu'une colonne, des cellules vides, un hors
// barème, un élève absent de la classe.
//
//   node src/core/_importUneMatiere.test.mjs
import { lignesPourMatiere, lignesPourMatieres, matieresDuClasseur } from './importUneMatiere.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// `validateGrade` de lib/gradeEntry, recopié à l'identique : le module pur ne
// dépend pas de la couche Vite, et le test doit valider comme l'écran valide.
const valider = (raw, max) => {
  const v = String(raw).trim().toUpperCase();
  if (v === '' || v === '-') return '';
  if (v === 'ABS') return 'ABS';
  const n = parseFloat(v.replace(',', '.'));
  if (isNaN(n) || n < 0 || n > max) return null;
  return String(Math.round(n * 100) / 100);
};

const MATHS    = { id: 'm1', name: 'Mathématiques', max: 20 };
const FRANCAIS = { id: 'm2', name: 'Français', max: 20 };
const EPS      = { id: 'm3', name: 'EPS', max: 20 };
const CLASSE   = [MATHS, FRANCAIS, EPS];

const ELEVES = [
  { id: 'e1', name: 'ABEGA Marie' },
  { id: 'e2', name: 'BIYA Paul' },
  { id: 'e3', name: 'NDONGO Sarah' },
];

// Le classeur tel qu'il revient : l'enseignant de maths a rempli SA colonne, et
// les deux autres portent encore les notes lues à l'export.
const LIGNES = [
  { studentName: 'ABEGA Marie',  grades: { 'Mathématiques': '14', 'Français': '11', 'EPS': '16' } },
  { studentName: 'BIYA Paul',    grades: { 'Mathématiques': '8,5', 'Français': '12', 'EPS': '' } },
  { studentName: 'NDONGO Sarah', grades: { 'Mathématiques': '', 'Français': '9', 'EPS': '13' } },
  { studentName: 'ÉLÈVE INCONNU', grades: { 'Mathématiques': '15', 'Français': '15', 'EPS': '15' } },
];

titre('Les matières du classeur sont celles de la classe, dans l’ordre du fichier');
{
  const trouvees = matieresDuClasseur(['Mathématiques', 'Français', 'EPS'], CLASSE);
  ok(trouvees.map((m) => m.id).join(',') === 'm1,m2,m3', 'les trois colonnes sont reconnues', trouvees.map((m) => m.id));
  const avecIntrus = matieresDuClasseur(['Moyenne', 'Mathématiques', 'Chimie'], CLASSE);
  ok(avecIntrus.length === 1 && avecIntrus[0].id === 'm1', 'une colonne étrangère à la classe est ignorée', avecIntrus);
  ok(matieresDuClasseur(['MATHÉMATIQUES'], CLASSE).length === 1, 'la casse n’empêche pas la reconnaissance');
  ok(matieresDuClasseur(undefined, CLASSE).length === 0, 'aucun classeur : aucune matière');
}

titre('SEULE la matière choisie est écrite — le cœur de la consigne');
{
  const r = lignesPourMatiere({ lignes: LIGNES, eleves: ELEVES, matiere: MATHS, valider });
  const toutes = r.flatMap((l) => Object.keys(l.gradeEntries));
  ok(toutes.every((id) => id === 'm1'), 'aucune note hors de la matière choisie', [...new Set(toutes)]);
  ok(!toutes.includes('m2') && !toutes.includes('m3'),
    'Français et EPS ne sont PAS touchés, même s’ils portent des valeurs dans le fichier');

  const marie = r.find((l) => l.student?.id === 'e1');
  ok(marie.gradeEntries.m1 === '14', 'la note de la matière choisie est bien lue', marie.gradeEntries);
  ok(Object.keys(marie.gradeEntries).length === 1, 'une seule note par élève', marie.gradeEntries);
}

titre('Choisir l’autre matière écrit l’autre colonne, et elle seule');
{
  const r = lignesPourMatiere({ lignes: LIGNES, eleves: ELEVES, matiere: FRANCAIS, valider });
  const paul = r.find((l) => l.student?.id === 'e2');
  ok(paul.gradeEntries.m2 === '12', 'Français est écrit quand Français est choisi', paul.gradeEntries);
  ok(paul.gradeEntries.m1 === undefined, 'et Mathématiques ne l’est pas');
}

titre('Une cellule VIDE ne touche à rien (le défaut fermé en 0.3.19)');
{
  const r = lignesPourMatiere({ lignes: LIGNES, eleves: ELEVES, matiere: MATHS, valider });
  const sarah = r.find((l) => l.student?.id === 'e3');
  ok(Object.keys(sarah.gradeEntries).length === 0,
    'cellule vide ⇒ aucune écriture (la note en place est conservée)', sarah.gradeEntries);

  // Une colonne absente du fichier n'est pas une cellule vide : même résultat,
  // rien n'est écrit — on n'invente pas un effacement.
  const sansColonne = lignesPourMatiere({
    lignes: [{ studentName: 'ABEGA Marie', grades: { 'Français': '11' } }],
    eleves: ELEVES, matiere: MATHS, valider,
  });
  ok(Object.keys(sansColonne[0].gradeEntries).length === 0, 'colonne absente ⇒ aucune écriture');
}

titre('Une note hors barème est refusée, pas écrite à 20');
{
  const r = lignesPourMatiere({
    lignes: [{ studentName: 'BIYA Paul', grades: { 'Mathématiques': '24' } }],
    eleves: ELEVES, matiere: MATHS, valider,
  });
  ok(Object.keys(r[0].gradeEntries).length === 0, '24/20 est rejetée', r[0].gradeEntries);
}

titre('ABS et la virgule décimale passent, comme à la saisie');
{
  const r = lignesPourMatiere({
    lignes: [
      { studentName: 'ABEGA Marie', grades: { 'Mathématiques': 'ABS' } },
      { studentName: 'BIYA Paul', grades: { 'Mathématiques': '8,5' } },
    ],
    eleves: ELEVES, matiere: MATHS, valider,
  });
  ok(r[0].gradeEntries.m1 === 'ABS', 'ABS est conservée', r[0].gradeEntries);
  ok(r[1].gradeEntries.m1 === '8.5', '« 8,5 » devient 8.5', r[1].gradeEntries);
}

titre('Un élève que la classe ne porte pas reste signalé, jamais écrit');
{
  const r = lignesPourMatiere({ lignes: LIGNES, eleves: ELEVES, matiere: MATHS, valider });
  const inconnu = r.find((l) => l.studentName === 'ÉLÈVE INCONNU');
  ok(inconnu.student === null, 'l’élève est marqué non reconnu', inconnu.student);
  ok(r.filter((l) => l.student).length === 3, 'les trois élèves de la classe sont reconnus');
}

titre('Sans matière choisie, l’import n’écrit RIEN');
{
  ok(lignesPourMatiere({ lignes: LIGNES, eleves: ELEVES, matiere: null, valider }).length === 0,
    'aucune ligne tant que la matière n’est pas choisie');
  ok(lignesPourMatieres({ lignes: LIGNES, eleves: ELEVES, matieres: [], valider }).length === 0,
    'un périmètre vide n’écrit rien non plus');
}

// ── « TOUTES LES MATIÈRES » — consigne du 2026-10-24 ───────────────────────
// « on doit être capable d'importer soit toutes les notes de toutes les
// matières, soit une seule matière ». Les deux usages sont légitimes ; ce qui
// ne l'est pas, c'est d'écrire toutes les colonnes SANS l'avoir demandé.
titre('Le périmètre « toutes les matières » écrit toutes les colonnes demandées');
{
  const r = lignesPourMatieres({ lignes: LIGNES, eleves: ELEVES, matieres: CLASSE, valider });
  const marie = r.find((l) => l.student?.id === 'e1');
  ok(Object.keys(marie.gradeEntries).sort().join(',') === 'm1,m2,m3',
    'les trois notes de la ligne sont écrites', marie.gradeEntries);
  ok(marie.gradeEntries.m1 === '14' && marie.gradeEntries.m2 === '11' && marie.gradeEntries.m3 === '16',
    'chacune dans SA matière — aucune ne glisse dans la voisine', marie.gradeEntries);

  // Les règles de la colonne unique valent encore, colonne par colonne.
  const paul = r.find((l) => l.student?.id === 'e2');
  ok(paul.gradeEntries.m3 === undefined, 'une cellule vide reste ignorée, même en mode « toutes »', paul.gradeEntries);
  ok(paul.gradeEntries.m1 === '8.5', 'la virgule décimale est normalisée partout', paul.gradeEntries);

  const sarah = r.find((l) => l.student?.id === 'e3');
  ok(sarah.gradeEntries.m1 === undefined && sarah.gradeEntries.m2 === '9',
    'une ligne peut être vide pour une matière et pleine pour une autre', sarah.gradeEntries);

  // Le compte que le bouton annonce : des NOTES, pas des lignes.
  const nbNotes = r.filter((l) => l.student).reduce((n, l) => n + Object.keys(l.gradeEntries).length, 0);
  ok(nbNotes === 7, 'sept notes à écrire sur les trois élèves reconnus', nbNotes);
}

titre('Un périmètre partiel ne touche QUE ses matières');
{
  // Le cas du titulaire qui remonte deux matières sur trois.
  const r = lignesPourMatieres({ lignes: LIGNES, eleves: ELEVES, matieres: [MATHS, EPS], valider });
  const toutes = r.flatMap((l) => Object.keys(l.gradeEntries));
  ok(!toutes.includes('m2'), 'Français n’est pas écrit', [...new Set(toutes)]);
  ok(toutes.includes('m1') && toutes.includes('m3'), 'Mathématiques et EPS le sont');
}

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
