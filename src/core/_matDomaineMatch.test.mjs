// Tests du rapprochement matière ↔ domaine maternelle (module pur) :
//   node src/core/_matDomaineMatch.test.mjs
import {
  domaineIdForSubject, domaineIdsForTeacher, unresolvedSubjectsForTeacher, isClassTitulaire,
} from './matDomaineMatch.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${a} attendu ${b})`);

// Les 8 domaines officiels, tels qu'ils sont en base.
const D = [
  { id: 'langage_communication', code: 'D1', intitule: 'Langage et communication' },
  { id: 'prelecture_preecriture', code: 'D2', intitule: 'Prélecture et préécriture' },
  { id: 'prenumeration_logique', code: 'D3', intitule: 'Pré-numération et raisonnement logique' },
  { id: 'psychomotricite', code: 'D4', intitule: 'Psychomotricité' },
  { id: 'decouverte_monde', code: 'D5', intitule: 'Découverte du monde' },
  { id: 'vie_sociale_affective', code: 'D6', intitule: 'Vie sociale et affective' },
  { id: 'activites_artistiques', code: 'D7', intitule: 'Activités artistiques' },
  { id: 'autonomie_personnelle', code: 'D8', intitule: 'Autonomie personnelle' },
];
const of = (name, extra = {}) => domaineIdForSubject({ name, ...extra }, D);

// ── Le lien explicite fait foi ──────────────────────────────────────────────
eq(of('Motricité', { mat_domaine_id: 'decouverte_monde' }), 'decouverte_monde',
  'mat_domaine_id prime sur le nom');
eq(domaineIdForSubject({ name: 'X', mat_domaine_id: 'zz' }, D), null,
  'un lien absent du référentiel chargé n’est pas renvoyé');

// ── Les 6 noms réels de COLLÈGE LA RETRAITE ─────────────────────────────────
for (const [name, want] of [
  ['Langage oral', 'langage_communication'],
  ['Graphisme & Écriture', 'prelecture_preecriture'],
  ['Mathématiques', 'prenumeration_logique'],
  ['Découverte du monde', 'decouverte_monde'],
  ['Éveil artistique', 'activites_artistiques'],
  ['Motricité', 'psychomotricite'],
]) eq(of(name), want, `« ${name} »`);

// ── Autres écritures plausibles ─────────────────────────────────────────────
for (const [name, want] of [
  ['Communication', 'langage_communication'],
  ['Pré-lecture', 'prelecture_preecriture'],
  ['Lecture', 'prelecture_preecriture'],
  ['Logique', 'prenumeration_logique'],
  ['Calcul', 'prenumeration_logique'],
  ['Psychomotricité', 'psychomotricite'],
  ['EPS', 'psychomotricite'],
  ['Éducation physique', 'psychomotricite'],
  ['Sciences', 'decouverte_monde'],
  ['Vivre ensemble', 'vie_sociale_affective'],
  ['Musique', 'activites_artistiques'],
  ['Arts plastiques', 'activites_artistiques'],
  ['Hygiène', 'autonomie_personnelle'],
  ['Autonomie', 'autonomie_personnelle'],
]) eq(of(name), want, `« ${name} »`);

// ── Intitulé, code et id officiels ──────────────────────────────────────────
eq(of('Vie sociale et affective'), 'vie_sociale_affective', 'l’intitulé officiel est reconnu');
eq(of('D6'), 'vie_sociale_affective', 'le code officiel est reconnu');
eq(of('autonomie_personnelle'), 'autonomie_personnelle', 'l’id est reconnu');

// ── Ce qui ne doit pas être deviné ──────────────────────────────────────────
eq(of('Catéchèse'), null, 'une matière hors référentiel reste dehors');
eq(of(''), null, 'nom vide → rien');
eq(domaineIdForSubject(null, D), null, 'matière absente → rien');

// ── Le piège « éducation physique » vs « sciences » ─────────────────────────
eq(of('Éveil scientifique'), 'decouverte_monde', '« Éveil scientifique » est de la découverte');
eq(of('Motricité fine'), 'psychomotricite', '« Motricité fine » reste de la psychomotricité');

// ── Périmètre d'un enseignant ───────────────────────────────────────────────
const subjects = [
  { id: 's1', class_id: 'c1', name: 'Langage oral',  teacher_id: 'p1' },
  { id: 's2', class_id: 'c1', name: 'Mathématiques', teacher_id: 'p2' },
  { id: 's3', class_id: 'c1', name: 'Catéchèse',     teacher_id: 'p1' },
  { id: 's4', class_id: 'c2', name: 'Motricité',     teacher_id: 'p1' },
];
const mine = domaineIdsForTeacher(subjects, 'p1', 'c1', D);
eq([...mine].join('+'), 'langage_communication', 'p1 couvre D1 sur c1');
ok(!mine.has('prenumeration_logique'), 'le domaine du collègue reste dehors');
ok(!mine.has('psychomotricite'), 'une autre classe ne fuit pas sur c1');
eq(domaineIdsForTeacher(subjects, null, 'c1', D).size, 0,
  'compte sans fiche enseignant → aucun domaine');

const orph = unresolvedSubjectsForTeacher(subjects, 'p1', 'c1', D);
eq(orph.length, 1, 'une matière non rattachée est signalée');
eq(orph[0].name, 'Catéchèse', 'et on sait laquelle');

// ── Le titulaire garde tout ─────────────────────────────────────────────────
ok(isClassTitulaire({ id: 'c1', teacher_id: 'p1' }, 'p1'), 'titulaire reconnu');
ok(!isClassTitulaire({ id: 'c1', teacher_id: 'p2' }, 'p1'), 'non-titulaire reconnu');
ok(!isClassTitulaire({ id: 'c1', teacher_id: null }, 'p1'), 'classe sans titulaire');
ok(!isClassTitulaire(null, 'p1'), 'classe absente');
ok(!isClassTitulaire({ id: 'c1', teacher_id: null }, null),
  'ni fiche ni titulaire : jamais vrai par coïncidence de null');

// ── LES 13 NOMS RELEVÉS EN PRODUCTION LE 2026-10-21 ─────────────────────────
//
// Mesurés en appelant ce résolveur sur les matières réelles des 44 écoles : 33
// matières maternelle sur 128 (25,8 %) ne se rattachaient à rien, donc
// n'apparaissaient ni à la saisie ni au bulletin. Ce sont les noms ci-dessous.
// Chacun est ici pour qu'il ne redevienne jamais invisible en silence.
for (const [name, want] of [
  // Une école bilingue nomme ses matières en anglais ; le référentiel est
  // stocké en français.
  ['English', 'langage_communication'],
  ['French', 'langage_communication'],
  ['Mathematics', 'prenumeration_logique'],
  ['Science', 'decouverte_monde'],
  ['Physical Education', 'psychomotricite'],
  ['Social Studies', 'vie_sociale_affective'],
  ['Citizenship', 'vie_sociale_affective'],
  // La maternelle n'a pas de domaine TIC : l'informatique est observée dans la
  // découverte du monde. Choix assumé, documenté dans matDomaineMatch.js.
  ['Computer Studies', 'decouverte_monde'],
  // Ni de domaine histoire-géographie : découvrir l'espace et le temps.
  ['Histoire-Géographie', 'decouverte_monde'],
  ['geo', 'decouverte_monde'],
  // Et « Français »/« Anglais » manquaient aussi : D1 connaissait « langage »
  // et « oral », mais pas le nom des deux langues.
  ['Français', 'langage_communication'],
  ['Anglais', 'langage_communication'],
  ['ECM', 'vie_sociale_affective'],
]) eq(of(name), want, `production : « ${name} »`);

// ── CE QUE LES AJOUTS NE DOIVENT PAS CASSER ────────────────────────────────
// « physical » est désormais un mot-clé de D4. Il ne doit pas détourner les
// noms où « education » porte le sens, ni les domaines voisins.
eq(of('Éducation physique'), 'psychomotricite', 'régression : l’éducation physique reste en D4');
eq(of('Activités physiques'), 'psychomotricite', 'régression : les activités physiques restent en D4');
// « social » est un mot-clé de D6 : « vie sociale » doit toujours y aller.
eq(of('Vie sociale et affective'), 'vie_sociale_affective', 'régression : l’intitulé exact de D6');
// « science » (singulier) rejoint D5 sans emporter les sciences du langage.
eq(of('Langage oral'), 'langage_communication', 'régression : le langage oral reste en D1');
// Les mots anglais des arts ne doivent pas capter la musique d'un autre domaine.
eq(of('Music'), 'activites_artistiques', '« Music » en D7');
eq(of('Drawing'), 'activites_artistiques', '« Drawing » en D7');
// Une matière qui n'existe nulle part RESTE non rattachée : on la nomme à
// l'école, on ne lui invente pas un domaine.
eq(of('Catéchèse'), null, 'une matière hors référentiel reste non rattachée');
eq(of('Zzzz'), null, 'un nom inconnu reste non rattaché');

console.log(failed ? '\n❌ échecs' : '\n✅ tout passe');
process.exitCode = failed ? 1 : 0;
