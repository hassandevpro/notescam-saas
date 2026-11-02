// L'ENSEIGNANTE ET L'ADMIN VOIENT-ILS LES MÊMES COMPÉTENCES AU PRIMAIRE ?
//
// Défaut signalé le 2026-11-02 : « les enseignants ne voient pas exactement les
// mêmes compétences que l'admin, classe 2 comme exemple » — « et au niveau de
// classe c'est différent ».
//
// MESURÉ SUR LES DEUX ÉCRANS DE BRIGHT CONTINENT (captures du responsable) :
//   admin      : 1A 1B 1C 2A 2B 3A 3B 4A 5A 6A 6B  (onze)
//   enseignante: 1B 1C 2A 2B 3A       5A 6A 6B     (huit)
// Manquaient 1A, 3B et 4A. Trois causes distinctes, pas une :
//
//   • 1A — le français de la classe appartient à une COLLÈGUE. Légitime.
//   • 4A — la classe porte « 4A Agro-pastoral / Technologie and Engineering ».
//     L'école a écrit le code elle-même, et il était ignoré : le nom retombait
//     sur le mot « technologie » et atterrissait sur 2B.
//   • 3B — aucune des onze matières ne la réclamait, donc elle n'était offerte à
//     personne… tout en s'imprimant sur le bulletin.
//
// Et un quatrième défaut, latent, trouvé en chemin : la TITULAIRE du primaire
// enseigne toute sa classe, donc aucune matière ne lui est affectée — le filtre
// la traitait quand même en enseignante de matière.
//
//   node src/components/grades/_primCompetencesVisibles.test.mjs
import { readFileSync } from 'node:fs';
import { isSubjectScoped, isSubjectScopedForClass } from '../../lib/teacherScope.js';
import { competenceIdForSubject, competenceIdsForTeacher } from '../../core/primCompetenceMatch.js';

let echecs = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) echecs++; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${a} attendu ${b})`);

const MODE1 = { grade_entry_mode: 'subject' };

// Le référentiel national du primaire, tel que l'écran admin le liste.
const COMPS = [
  ['1A', 'Communiquer en français'], ['1B', 'Communiquer en anglais'],
  ['1C', 'Pratiquer une langue nationale'], ['2A', 'Utiliser les notions de base en mathématiques'],
  ['2B', 'Utiliser les notions de base en sciences et technologie'],
  ['3A', 'Pratiquer les valeurs sociales'], ['3B', 'Pratiquer les valeurs citoyennes'],
  ['4A', "Faire preuve d'autonomie, d'initiative, de créativité et d'esprit d'entreprise"],
  ['5A', 'Utiliser les concepts et outils de base des TIC'],
  ['6A', 'Pratiquer des activités physiques et sportives'],
  ['6B', 'Pratiquer des activités artistiques'],
].map(([code, intitule]) => ({ id: code.toLowerCase(), code, intitule }));

// ── 1. L'APPARIEMENT, SUR LES VRAIS NOMS DE LA CLASSE ──────────────────────
const EDIBE = 'tch-edibe';
const MBOCK = 'tch-mbock';
// Les onze matières cochées, avec leur enseignante — relevées sur la capture.
const SUBJECTS = [
  ['English Language', EDIBE, '1b'], ['French Language', MBOCK, '1a'],
  ['National Language', EDIBE, '1c'], ['Mathematics', EDIBE, '2a'],
  ['Physical Education', EDIBE, '6a'],
  ['4A Agro-pastoral / Technologie and Engineering', EDIBE, '4a'],
  ['Arts', EDIBE, '6b'], ['ICT', EDIBE, '5a'],
  ['Moral Education', EDIBE, '3a'], ['Science & Technology', EDIBE, '2b'],
  ['Social Values', EDIBE, '3a'],
].map(([name, teacher_id, attendu], i) => ({ id: `s${i}`, class_id: 'cls', name, teacher_id, attendu }));

for (const s of SUBJECTS) {
  eq(competenceIdForSubject(s, COMPS), s.attendu, `« ${s.name} »`);
}

// ── 2. LE PÉRIMÈTRE QUI EN DÉCOULE ─────────────────────────────────────────
const mine = competenceIdsForTeacher(SUBJECTS, EDIBE, 'cls', COMPS);
ok(mine.has('4a'), '4A revient à qui enseigne « 4A Agro-pastoral… »');
ok(mine.has('3a'), '3A lui revient aussi (Social Values · Moral Education)');
ok(!mine.has('1a'), '1A ne lui revient PAS : le français est à sa collègue');
ok(!mine.has('3b'), '3B n’est réclamée par aucune des onze matières');

// La règle d'ouverture : les orphelines restent visibles, les autres non.
const reclamees = new Set(SUBJECTS.map((s) => competenceIdForSubject(s, COMPS)).filter(Boolean));
const vues = COMPS.filter((c) => mine.has(c.id) || !reclamees.has(c.id)).map((c) => c.code);
eq(vues.join(' '), '1B 1C 2A 2B 3A 3B 4A 5A 6A 6B',
  'l’enseignante voit les dix compétences qui la concernent, 3B comprise');
ok(!vues.includes('1A'),
  'et toujours pas le français : une orpheline s’ouvre, pas la matière d’une collègue');

// ── 3. LA TITULAIRE DU FONDAMENTAL ─────────────────────────────────────────
const class2 = { id: 'c2', name: 'Class 2', level: 'Class 2', teacher_id: EDIBE };
const sixieme = { id: 'c6', name: '6eme', level: '6ème', teacher_id: EDIBE };
ok(isSubjectScoped('teacher', MODE1), 'le Mode 1 restreint bien les enseignants');
ok(!isSubjectScopedForClass('teacher', MODE1, class2, EDIBE),
  'la titulaire de Class 2 n’est pas restreinte : elle enseigne toute sa classe');
ok(isSubjectScopedForClass('teacher', MODE1, class2, MBOCK),
  'sa collègue sur la même classe reste restreinte à ses matières');
ok(isSubjectScopedForClass('teacher', MODE1, sixieme, EDIBE),
  'au collège le titulariat ne lève rien : chaque matière a son spécialiste');
ok(!isSubjectScopedForClass('admin', MODE1, class2, MBOCK),
  'l’admin n’est jamais restreint — c’est la liste de référence');

// ── 4. LE CÂBLAGE DE L'ÉCRAN ───────────────────────────────────────────────
const ECRAN = readFileSync(new URL('./PrimCompetenceWorkspace.jsx', import.meta.url), 'utf8');
const bloc = ECRAN.slice(
  ECRAN.indexOf('const competences = useMemo('),
  ECRAN.indexOf('const competencesEcartees'),
);
ok(bloc.length > 0, 'le bloc qui construit la liste des compétences est bien là');
ok(/isSubjectScopedForClass\(role, school, selectedClass, teacherId\)/.test(bloc),
  'il interroge le périmètre DE CETTE CLASSE, pas le drapeau global');
ok(!/if \(!isSubjectTeacher\) return all;/.test(bloc),
  'le drapeau global, qui ignorait le titulariat, n’y est plus');
ok(/!reclamees\.has\(c\.id\)/.test(bloc),
  'une compétence que personne ne réclame reste visible');
ok(/competenceIdsForTeacher/.test(bloc),
  'le filtre « Mode 1 » subsiste pour une vraie enseignante de matière');
for (const dep of ['role', 'school', 'selectedClass', 'classSubjects']) {
  ok(new RegExp(`\\b${dep}\\b`).test(bloc.slice(bloc.lastIndexOf('}, ['))),
    `\`${dep}\` figure dans les dépendances du useMemo`);
}
ok(/isFundamentalTitulaire\(c, teacherId\)/.test(ECRAN),
  'le sélecteur de classes retient toujours la titulaire du fondamental');

console.log(echecs ? `\n=== ÉCHEC : ${echecs} contrôle(s) ===` : '\n=== OK ===');
process.exit(echecs ? 1 : 0);
