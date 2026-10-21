// Tests du rapprochement matière ↔ compétence primaire (module pur) :
//   node src/core/_primCompetenceMatch.test.mjs
import {
  competenceIdForSubject, competenceIdsForTeacher, unresolvedSubjectsForTeacher,
} from './primCompetenceMatch.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${a} attendu ${b})`);

// Les 11 compétences nationales, telles qu'elles sont en base.
const COMP = [
  { id: '1a', code: '1A', intitule: 'Communiquer en français' },
  { id: '1b', code: '1B', intitule: 'Communicate in English' },
  { id: '1c', code: '1C', intitule: 'Pratiquer une langue nationale' },
  { id: '2a', code: '2A', intitule: 'Utiliser les notions de base en mathématiques' },
  { id: '2b', code: '2B', intitule: 'Utiliser les notions de base en sciences et technologies' },
  { id: '3a', code: '3A', intitule: 'Pratiquer les valeurs sociales' },
  { id: '3b', code: '3B', intitule: 'Pratiquer les valeurs citoyennes' },
  { id: '4a', code: '4A', intitule: "Démontrer l'autonomie, l'esprit d'initiative, la créativité et l'entrepreneuriat" },
  { id: '5a', code: '5A', intitule: 'Utiliser les concepts de base et les outils des TIC' },
  { id: '6a', code: '6A', intitule: 'Pratiquer les activités physiques et sportives' },
  { id: '6b', code: '6B', intitule: 'Pratiquer les activités artistiques' },
];
const of = (name, extra = {}) => competenceIdForSubject({ name, ...extra }, COMP);

// ── Le lien explicite fait foi, toujours ────────────────────────────────────
eq(of('Mathématiques', { prim_competence_id: '6a' }), '6a',
  'prim_competence_id prime sur le nom, même s’il le contredit');
eq(competenceIdForSubject({ name: 'X', prim_competence_id: 'zz' }, COMP), null,
  'un lien absent du référentiel chargé n’est pas renvoyé');

// ── Noms réels relevés dans la base ─────────────────────────────────────────
for (const [name, want] of [
  ['French Language', '1a'], ['Français', '1a'], ['Expression écrite', '1a'],
  ['Lecture', '1a'], ['Grammaire', '1a'], ['Orthographe', '1a'], ['Conjugaison', '1a'],
  ['Anglais', '1b'], ['English Language', '1b'],
  ['Langues Nationales', '1c'],
  ['Mathématiques', '2a'], ['Maths', '2a'], ['Calcul', '2a'],
  ['Sciences et Technologie (SET)', '2b'], ['SVT', '2b'], ['SVTEEHB', '2b'],
  ['Histoire-Géographie-EVC', '3b'], ['Éducation Civique', '3b'], ['ECM', '3b'],
  ['TIC', '5a'], ['Informatique', '5a'],
  ['EPS', '6a'], ['Physical Education', '6a'], ['Éducation Physique et Sportive', '6a'],
  ['Arts (Musique & Arts plastiques)', '6b'], ['Dessin', '6b'],
]) eq(of(name), want, `« ${name} »`);

// ── Le piège « physique » : physics vs éducation physique ────────────────────
eq(of('Physique'), '2b', 'une matière « Physique » seule est de la science');
eq(of('Éducation physique'), '6a', '« Éducation physique » est du sport, pas de la science');

// ── Matière qui ne se rattache à rien ───────────────────────────────────────
eq(of('Correction orthographique'), '1a', 'une matière maison du français reste du français');
eq(of('Chorale liturgique'), null, 'une matière hors référentiel ne tombe sur rien');
eq(of(''), null, 'nom vide → rien');
eq(competenceIdForSubject(null, COMP), null, 'matière absente → rien');

// ── Le nom exact du référentiel, et son code ────────────────────────────────
eq(of('Communiquer en français'), '1a', 'le libellé officiel est reconnu');
eq(of('3B'), '3b', 'le code officiel est reconnu');

// ── Périmètre d'un enseignant ───────────────────────────────────────────────
const subjects = [
  { id: 's1', class_id: 'c1', name: 'French Language',    teacher_id: 'p1' },
  { id: 's2', class_id: 'c1', name: 'Mathématiques',      teacher_id: 'p2' },
  { id: 's3', class_id: 'c2', name: 'Physical Education', teacher_id: 'p1' },
  { id: 's4', class_id: 'c1', name: 'Chorale liturgique', teacher_id: 'p1' },
];
const mine = competenceIdsForTeacher(subjects, 'p1', 'c1', COMP);
ok(mine.has('1a'), 'p1 couvre 1A sur c1');
ok(!mine.has('2a'), 'la compétence du collègue reste dehors');
ok(!mine.has('6a'), 'une classe où il enseigne ailleurs ne fuit pas sur c1');
eq(competenceIdsForTeacher(subjects, 'p1', null, COMP).size, 2, 'toutes classes : 1A + 6A');
eq(competenceIdsForTeacher(subjects, null, 'c1', COMP).size, 0,
  'compte sans fiche enseignant → aucune compétence');

const orphelines = unresolvedSubjectsForTeacher(subjects, 'p1', 'c1', COMP);
eq(orphelines.length, 1, 'une matière non rattachée est signalée');
eq(orphelines[0].name, 'Chorale liturgique', 'et on sait laquelle, pour la nommer à l’écran');

// ── LES NOMS RELEVÉS EN PRODUCTION LE 2026-10-21 ───────────────────────────
//
// Mesure faite en appelant ce résolveur sur les matières réelles des 44 écoles :
// 66 matières du primaire sur 621 (10,6 %) ne se rattachaient à rien, donc
// n'apparaissaient ni à la saisie ni sur le bulletin. Noms d'écoles anglophones
// pour l'essentiel, le référentiel étant stocké en français.
for (const [name, want] of [
  ['Social Studies', '3b'],
  ['Citizenship', '3b'],
  ['Civic Education', '3b'],
  ['Moral Education', '3a'],
  ['National Language', '1c'],
  ['Chemistry', '2b'],
  ['Physics & Chemistry', '2b'],
  ['Natural Science', '2b'],
  ['Biology', '2b'],
  ['geo', '3b'],
]) eq(of(name), want, `production : « ${name} »`);

// ── CE QUE LES AJOUTS NE DOIVENT PAS CASSER ────────────────────────────────
// « technology » rejoint 2B (sciences et technologies), mais les TIC restent en
// 5A : « information technology » est posée en EXPRESSION pour passer devant le
// mot simple, car 2B est examinée avant 5A.
eq(of('Information Technology'), '5a', 'régression : les TIC restent en 5A');
eq(of('ICT'), '5a', 'régression : ICT reste en 5A');
eq(of('Computer Studies'), '5a', '« Computer Studies » en 5A');
// « moral » rejoint 3A sans emporter l'éducation civique, qui reste en 3B.
eq(of('Éducation civique'), '3b', 'régression : l’éducation civique reste en 3B');
// « physics » rejoint 2B sans emporter l'éducation physique, qui reste en 6A.
eq(of('Éducation physique'), '6a', 'régression : l’éducation physique reste en 6A');
eq(of('Physical Education'), '6a', 'régression : Physical Education reste en 6A');
// Le français et l'anglais ne se confondent pas.
eq(of('French Language'), '1a', 'régression : French → 1A');
eq(of('English Language'), '1b', 'régression : English → 1B');

// ── CE QUI DOIT RESTER HORS RÉFÉRENTIEL ────────────────────────────────────
// Le référentiel primaire ne connaît qu'une compétence de français (1A) et une
// d'anglais (1B) : aucune d'espagnol, d'allemand, d'arabe ni de chinois. Les
// rattacher à 1A serait un faux. Elles doivent donc rester non rattachées — et
// c'est l'écran qui les nomme, ou la création d'une ligne maison qui les
// accueille, jamais une approximation ici.
for (const name of ['Chinois', 'Espagnol', 'Allemand', 'Arabe', 'Travaux Pratiques', 'Agro-pastoral']) {
  eq(of(name), null, `hors référentiel : « ${name} » reste non rattachée`);
}

console.log(failed ? '\n❌ échecs' : '\n✅ tout passe');
process.exitCode = failed ? 1 : 0;
