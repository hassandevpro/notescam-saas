// Tests du rapprochement matière locale ↔ matière du référentiel APC :
//   node src/core/_apcMatiereMatch.test.mjs
import {
  matiereIdsForSubject, matiereIdsForTeacher, unresolvedSubjectsForTeacher,
} from './apcMatiereMatch.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${a} attendu ${b})`);

// Catalogue francophone MINESEC (extrait réel de apc_matieres).
const FR = [
  { id: 'anglais', nom: 'Anglais' }, { id: 'francais', nom: 'Français' },
  { id: 'mathematiques', nom: 'Mathématiques' }, { id: 'informatique', nom: 'Informatique' },
  { id: 'histoire', nom: 'Histoire' }, { id: 'geographie', nom: 'Géographie' },
  { id: 'svteehb', nom: 'SVTEEHB' }, { id: 'pct', nom: 'PCT' }, { id: 'eps', nom: 'EPS' },
  { id: 'ecm', nom: 'Education à la Citoyenneté et à la Morale' },
  { id: 'allemand', nom: 'Allemand' }, { id: 'espagnol', nom: 'Espagnol' },
  { id: 'arabe', nom: 'Arabe' },
];
// Catalogue anglophone CBA.
const EN = [
  { id: 'english', nom: 'English Language' }, { id: 'french', nom: 'French' },
  { id: 'mathematics', nom: 'Mathematics' }, { id: 'history', nom: 'History' },
  { id: 'geography', nom: 'Geography' }, { id: 'citizenship', nom: 'Citizenship Education' },
  { id: 'physical_education', nom: 'Physical Education' },
];
const ids = (name, cat = FR) => [...matiereIdsForSubject(name, cat)].sort().join('+');

// ── Le cas qui motive tout : une matière locale, DEUX officielles ────────────
eq(ids('Histoire-Géographie'), 'geographie+histoire', '« Histoire-Géographie » couvre les deux');
eq(ids('Histoire-Géo'), 'geographie+histoire', '« Histoire-Géo » aussi');
eq(ids('Hist-Géo'), 'geographie+histoire', '« Hist-Géo » aussi');
// …et le motif long ne doit pas être mangé par le motif court « histoire ».
eq(ids('Histoire'), 'histoire', '« Histoire » seule reste seule');
eq(ids('Géographie'), 'geographie', '« Géographie » seule reste seule');

// ── Noms réels relevés dans la base ─────────────────────────────────────────
for (const [name, want] of [
  ['SVT', 'svteehb'], ['SVTEEHB', 'svteehb'],
  ['Éducation Civique', 'ecm'], ['ECM', 'ecm'],
  ['MATh', 'mathematiques'], ['Mathématiques', 'mathematiques'],
  ['PCT', 'pct'], ['EPS', 'eps'], ['Anglais', 'anglais'], ['Français', 'francais'],
  ['Informatique', 'informatique'], ['Espagnol', 'espagnol'], ['Arabe', 'arabe'],
  ['Allemand', 'allemand'],
  ['Correction orthographique', 'francais'],
]) eq(ids(name), want, `« ${name} »`);

// ── Catalogue anglophone ────────────────────────────────────────────────────
eq(ids('French Language', EN), 'french', '« French Language » → French (catalogue CBA)');
eq(ids('English Language', EN), 'english', '« English Language » → English');
eq(ids('Histoire-Géo', EN), 'geography+history', 'les cibles suivent le catalogue chargé');
eq(ids('EPS', EN), 'physical_education', '« EPS » dans une classe anglophone');

// ── Ce qui ne doit PAS être deviné ──────────────────────────────────────────
eq(ids('Allamand'), '', 'une faute de frappe n’est pas apprise — elle se corrige dans Matières');
eq(ids('ff'), '', 'une saisie parasite ne tombe sur rien');
eq(ids(''), '', 'nom vide → rien');
eq(ids('Chorale'), '', 'une matière hors référentiel reste dehors');
// Une cible absente du catalogue chargé n'est jamais renvoyée.
eq(ids('Éducation Civique', [{ id: 'histoire', nom: 'Histoire' }]), '',
  'ECM absent du catalogue → aucune matière inventée');

// ── Libellé localisé ────────────────────────────────────────────────────────
// Une classe anglophone sans référentiel CBA retombe sur le catalogue
// francophone, rendu en anglais : le nom affiché doit être reconnu lui aussi.
const localise = [{ id: 'svteehb', nom: 'Biology', nomOfficiel: 'SVTEEHB' }];
eq(ids('Biology', localise), 'svteehb', 'le libellé localisé est reconnu');
eq(ids('SVTEEHB', localise), 'svteehb', '…et le nom officiel reste reconnu');

// ── Périmètre d'un enseignant ───────────────────────────────────────────────
const subjects = [
  { id: 's1', class_id: 'c1', name: 'Histoire-Géo', teacher_id: 'p1' },
  { id: 's2', class_id: 'c1', name: 'SVT',          teacher_id: 'p2' },
  { id: 's3', class_id: 'c2', name: 'EPS',          teacher_id: 'p1' },
  { id: 's4', class_id: 'c1', name: 'ff',           teacher_id: 'p1' },
];
const mine = matiereIdsForTeacher(subjects, 'p1', 'c1', FR);
eq([...mine].sort().join('+'), 'geographie+histoire', 'p1 couvre Histoire et Géographie sur c1');
ok(!mine.has('svteehb'), 'la matière du collègue reste dehors');
ok(!mine.has('eps'), 'une autre classe ne fuit pas sur c1');
eq(matiereIdsForTeacher(subjects, null, 'c1', FR).size, 0,
  'compte sans fiche enseignant → aucune matière');

const orph = unresolvedSubjectsForTeacher(subjects, 'p1', 'c1', FR);
eq(orph.length, 1, 'une matière non rattachée est signalée');
eq(orph[0].name, 'ff', 'et on sait laquelle, pour la nommer à l’écran');

// ── LES NOMS RELEVÉS EN PRODUCTION LE 2026-10-21 ───────────────────────────
//
// Mesure faite en appelant ce résolveur sur les matières réelles des 44 écoles :
// 23 matières du premier cycle sur 564 n'apparaissaient pas à la saisie.
// « Physique-Chimie » était le nom le plus fréquent — 10 occurrences, 2 écoles.
//
// Le référentiel francophone ne connaît pas Physique et Chimie séparément : il a
// UNE matière, PCT (Physique, Chimie, Technologie). Le nom de l'école en désigne
// donc bien une seule.
eq(ids('Physique-Chimie'), 'pct', '« Physique-Chimie » → PCT');
eq(ids('Physique Chimie'), 'pct', 'sans trait d’union');
eq(ids('Sciences Physiques'), 'pct', '« Sciences Physiques » → PCT');

// La barre oblique devient une espace à la normalisation : c'est « history
// geography », sans « and », qu'il fallait écrire.
eq(ids('History/Geography', EN), 'geography+history', '« History/Geography » → les deux');
eq(ids('Histoire/Géographie'), 'geographie+histoire', 'la barre oblique côté francophone aussi');

// Catalogue anglophone portant Chemistry et Physics séparément, comme en base.
const ENSC = [...EN,
  { id: 'chemistry', nom: 'Chemistry' }, { id: 'physics', nom: 'Physics' },
  { id: 'biology', nom: 'Biology' }, { id: 'ecm', nom: 'ECM' },
];
eq(ids('Chemistry/Physics', ENSC), 'chemistry+physics', '« Chemistry/Physics » → les deux');
eq(ids('Physics & Chemistry', ENSC), 'chemistry+physics', 'l’esperluette aussi');
// « Civics » rend DÉSORMAIS le seul `citizenship`, et non plus
// « citizenship+ecm ». Ce test attendait les deux : il encodait le défaut
// signalé le 2026-10-22 (« les autres matières héritent automatiquement »).
// `ecm` et `citizenship` sont LA MÊME matière, nommée dans les deux langues ;
// ce catalogue d'essai porte les deux, comme une classe bilingue de production.
// En rendre deux faisait qu'une matière locale en revendiquait deux, donc deux
// colonnes à la saisie et deux lignes au bulletin.
eq(ids('Civics', ENSC), 'citizenship', '« Civics » → Citizenship Education, et elle SEULE');

// ── UN SEUL IDENTIFIANT PAR GROUPE DE TRADUCTION ───────────────────────────
//
// RELEVÉ EN PRODUCTION le 2026-10-22, FORM1 de THE GENIUS : « Français
// intensif » et « French Language », tenues par le MÊME enseignant, rendaient
// toutes deux { francais, french }. Les 41 notes saisies sur l'une se
// retrouvaient sur l'autre, à 80 ms près, pour les 41 élèves — et la matière
// sortait deux fois sur le bulletin.
{
  const BIL = [
    { id: 'francais', nom: 'Français' }, { id: 'french', nom: 'French' },
    { id: 'anglais', nom: 'Anglais' },   { id: 'english', nom: 'English' },
    { id: 'histoire', nom: 'Histoire' }, { id: 'geographie', nom: 'Géographie' },
    { id: 'history', nom: 'History' },   { id: 'geography', nom: 'Geography' },
    { id: 'mathematiques', nom: 'Mathématiques' }, { id: 'mathematics', nom: 'Mathematics' },
  ];
  // LE CAS SIGNALÉ : deux matières locales, deux matières du référentiel
  // DISTINCTES. C'est la propriété qui compte — plus aucun recouvrement.
  const fi = ids('Français intensif', BIL);
  const fl = ids('French Language', BIL);
  eq(fi, 'francais', 'classe bilingue : « Français intensif » → une seule matière');
  eq(fl, 'french', 'classe bilingue : « French Language » → une seule matière');
  eq(String(fi !== fl), 'true', 'et surtout : les deux ne se recouvrent plus');

  // Les traductions restent le REPLI quand une seule langue est au catalogue :
  // une école francophone qui écrit « French Language » doit continuer à saisir.
  eq(ids('French Language'), 'francais', 'classe francophone : le repli par traduction tient');
  eq(ids('Français intensif', EN), 'french', 'classe anglophone : idem dans l’autre sens');

  // CE QUE LA CORRECTION NE DOIT PAS CASSER : une matière locale qui couvre
  // VRAIMENT deux matières du référentiel en garde deux — elles relèvent de
  // deux groupes de traduction distincts, pas du même.
  eq(ids('Histoire-Géo', BIL), 'geographie+histoire',
    'bilingue : « Histoire-Géo » couvre toujours DEUX matières');
  eq(ids('Mathématiques', BIL), 'mathematiques', 'bilingue : les maths ne sortent qu’une fois');
}

// ── CE QUE LES AJOUTS NE DOIVENT PAS CASSER ────────────────────────────────
// Le piège de l'ordre : « physique chimie » est posée dans le bloc PCT, donc
// AVANT « education physique ». Un alias pour « physique » SEUL y aurait
// envoyé l'EPS en PCT — d'où son absence, et ce contrôle qui la garde.
eq(ids('Éducation Physique'), 'eps', 'régression : l’éducation physique reste EPS');
eq(ids('Éducation Physique et Sportive'), 'eps', 'régression : EPS en entier');
eq(ids('Physical Education', EN), 'physical_education', 'régression : Physical Education');
eq(ids('EPS'), 'eps', 'régression : le sigle EPS');
// « civic » ne doit pas emporter l'éducation civique vers autre chose qu'ECM.
eq(ids('Éducation Civique'), 'ecm', 'régression : l’éducation civique reste ECM');
// Une faute de frappe RESTE non résolue : elle se corrige dans Matières.
eq(ids('Allamand'), '', 'une faute de frappe reste non résolue');
eq(ids('ff'), '', 'un nom d’essai reste non résolu');

console.log(failed ? '\n❌ échecs' : '\n✅ tout passe');
process.exitCode = failed ? 1 : 0;
