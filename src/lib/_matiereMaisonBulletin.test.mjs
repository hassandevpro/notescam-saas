// UNE MATIÈRE MAISON ARRIVE-T-ELLE JUSQU'AU BULLETIN ?
//
// Demande du responsable, après la mise en ligne de la création de matières
// maison : « maintenant affiche-les sur le bulletin ».
//
// Le bulletin APC ne part PAS des lignes `subjects` : il boucle sur
// `referentiel.matieres` et ne garde que celles ayant des compétences pour
// (classe, trimestre). Une matière maison en a — mais elle doit encore survivre
// au PÉRIMÈTRE (`apcForClass`), qui restreint les compétences imprimées à ce que
// couvrent les matières cochées de la classe. Deux filtres successifs, donc deux
// occasions de la perdre en silence.
//
// Ce test fait traverser les DEUX, exactement comme l'écran :
//   1. `apcForClass` restreint les compétences au périmètre de la classe ;
//   2. `assemblePeriod` reçoit `{ ...referentiel, competences: <filtrées> }`
//      — c'est ce que construit `apcReferentielEcole` dans Bulletins.jsx —
//      et doit faire figurer la matière maison, avec sa note et son coefficient.
//
// Lancer :
//   node src/lib/_matiereMaisonBulletin.test.mjs
import { assemblePeriod } from './apcBulletinDoc.js';
import { apcForClass } from '../core/refClassScope.js';
import { noteNkey } from '../core/apcEngine.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}` + (got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`)); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

const ECOLE = 'ecole-1';
const CLASSE = '6e';
const TRIM = 't1';

// Référentiel : deux matières NATIONALES et une MAISON, telle que la pose
// `addMatiereMaisonApc` (school_id renseigné, une compétence par trimestre).
const REF = {
  matieres: [
    { id: 'mathematiques', nom: 'Mathématiques', ordre: 1 },
    { id: 'francais', nom: 'Français', ordre: 2 },
    { id: 'maison-1', nom: 'Langue Turc', ordre: 90, school_id: ECOLE },
  ],
  classeMatieres: [
    { classe_id: CLASSE, matiere_id: 'mathematiques', coefficient: 4, ordre: 1 },
    { classe_id: CLASSE, matiere_id: 'francais', coefficient: 5, ordre: 2 },
    { classe_id: CLASSE, matiere_id: 'maison-1', coefficient: 2, ordre: 90, school_id: ECOLE },
  ],
  competences: [
    { id: 'c-math', classe_id: CLASSE, trimestre_id: TRIM, matiere_id: 'mathematiques', intitule: 'Calculer', ordre: 1 },
    { id: 'c-fr', classe_id: CLASSE, trimestre_id: TRIM, matiere_id: 'francais', intitule: 'Lire', ordre: 1 },
    { id: 'c-maison', classe_id: CLASSE, trimestre_id: TRIM, matiere_id: 'maison-1', intitule: 'Langue Turc', ordre: 1, school_id: ECOLE },
  ],
  classes: [{ id: CLASSE, cycle_id: 'premier_cycle' }],
};

// Les matières COCHÉES de la classe — dont la maison, au nom identique.
const CLASS_SUBJECTS = [
  { id: 's1', name: 'Mathématiques' },
  { id: 's2', name: 'Français' },
  { id: 's3', name: 'Langue Turc' },
];

const SEQ = 's1';
const notes = {
  [noteNkey('e1', 'c-math', SEQ)]: { note: 12, note_max: 20 },
  [noteNkey('e1', 'c-fr', SEQ)]: { note: 14, note_max: 20 },
  [noteNkey('e1', 'c-maison', SEQ)]: { note: 16, note_max: 20 },
};

// Ce que Bulletins.jsx construit : le référentiel ENTIER, dont les compétences
// sont restreintes au périmètre de la classe.
const refEcole = (subjects) => ({
  ...REF,
  competences: apcForClass(REF, subjects, []).competences,
});
const bulletin = (subjects) => assemblePeriod(refEcole(subjects), notes, {
  classeSlug: CLASSE, trimestreId: TRIM, seqIds: [SEQ],
  student: { id: 'e1', name: 'Élève 1' }, teacherByMatiere: {}, sys: 'FR',
});

titre('LA DEMANDE : la matiere maison figure sur le bulletin');
{
  const d = bulletin(CLASS_SUBJECTS);
  const noms = d.matieres.map((m) => m.nom);
  ok(noms.includes('Langue Turc'), 'la matiere maison est imprimee', noms);
  const m = d.matieres.find((x) => x.nom === 'Langue Turc');
  ok(m.moyenne === 16, 'avec sa note', m?.moyenne);
  ok(m.coef === 2, 'et son coefficient maison, pas un coefficient national', m?.coef);
  ok(m.competences.length === 1, 'sa competence apparait aussi', m?.competences);
  ok(noms.length === 3, 'les matieres nationales ne sont pas perdues pour autant', noms);
}

titre('Elle compte dans la moyenne generale, comme les autres');
{
  const d = bulletin(CLASS_SUBJECTS);
  // (12x4 + 14x5 + 16x2) / 11 = 150 / 11
  const attendu = Math.round(((12 * 4 + 14 * 5 + 16 * 2) / 11) * 100) / 100;
  ok(d.coefSum === 11, 'son coefficient entre dans la somme', d.coefSum);
  ok(Math.abs(d.moyenneGenerale - attendu) < 0.01,
    `la moyenne generale la prend en compte (${attendu})`, d.moyenneGenerale);
}

titre('LE PIEGE : decochee de la classe, elle ne doit PLUS s imprimer');
{
  // Le perimetre reste le perimetre : retirer la matiere de la classe doit la
  // retirer du bulletin. Sinon on aurait repare un trou en en creusant un autre.
  const sansMaison = CLASS_SUBJECTS.filter((s) => s.name !== 'Langue Turc');
  const noms = bulletin(sansMaison).matieres.map((m) => m.nom);
  ok(!noms.includes('Langue Turc'), 'decochee -> absente du bulletin', noms);
  ok(noms.length === 2, 'et les deux autres restent', noms);
}

titre('Une classe dont RIEN n est reconnu garde son bulletin complet');
{
  // Le garde-fou de `scopeOf` : plutot une matiere en trop qu'un bulletin vide.
  const noms = bulletin([{ id: 'x', name: 'Zzz Inconnue' }]).matieres.map((m) => m.nom);
  ok(noms.length === 3, 'aucun filtre applique, les trois matieres restent', noms);
}

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Matière maison jusqu'au bulletin : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
