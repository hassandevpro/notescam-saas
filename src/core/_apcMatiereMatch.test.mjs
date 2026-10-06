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

console.log(failed ? '\n❌ échecs' : '\n✅ tout passe');
process.exitCode = failed ? 1 : 0;
