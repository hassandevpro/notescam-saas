// « LES ÉCRANS DES ENSEIGNANTS : ILS DOIVENT ENTRER LES NOTES SANS BLOCAGE »
//
// Le mur, reproduit le 2026-10-29 sur l'édition LAN montée. École en mode
// « enseignant de matière ». Une enseignante d'« Espagnol » en CE1 — matière
// absente des onze compétences nationales — n'est pas titulaire de la classe.
// Son écran de saisie ne portait qu'une phrase :
//
//   « Aucune de vos matières ne se rattache à une compétence nationale (1A–6B) :
//     Espagnol. Demandez à l'administration de les renommer selon le
//     référentiel, ou de vous affecter les matières que vous enseignez
//     réellement. »
//
// Pas un élève, pas une case. DEUX causes, toutes deux dans l'écran, aucune
// dans la base :
//   1. le filtre des classes exigeait une compétence DÉJÀ résolue — impasse
//      fermée sur elle-même, puisque c'est l'ouverture de la classe qui
//      déclenche le rattrapage qui la résoudrait ;
//   2. le rattrapage était gardé par `canManageClassSubjects`, qui est la policy
//      de `subjects` (titulariat exigé) et non celle des tables de référentiel
//      (`prim_competences`, `mat_domaines`, `apc_matieres`), lesquelles
//      autorisent TOUT membre de l'école.
//
// CE QUE CE TEST PROTÈGE SURTOUT, c'est le PÉRIMÈTRE : ouvrir la porte ne doit
// pas laisser un enseignant de matière nommer les lignes d'un collègue. Les cas
// « il ne doit PAS pouvoir » sont donc aussi nombreux ici que les cas positifs.
import { readFileSync } from 'node:fs';
import { refLineScope, canManageClassSubjects } from './teacherScope.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

const ECOLE = { id: 'e1', grade_entry_mode: 'subject' };
const CLASSE = { id: 'c1', name: 'CE1', level: 'CE1', cycle: 'primaire', teacher_id: 'titulaire' };

titre('l administration et la titulaire : tout le perimetre de la classe');
{
  const admin = refLineScope({ role: 'admin', school: ECOLE, cls: CLASSE, teacherId: null });
  ok(admin && !admin.onlyTeacherId, 'admin → tout, sans restriction', admin);
  const delegue = refLineScope({ role: 'censeur', school: ECOLE, cls: CLASSE, teacherId: null, isDelegate: true });
  ok(delegue && !delegue.onlyTeacherId, 'delegue /app/classes → tout', delegue);
  const titu = refLineScope({ role: 'teacher', school: ECOLE, cls: CLASSE, teacherId: 'titulaire' });
  ok(titu && !titu.onlyTeacherId, 'la titulaire de la classe → tout, comme avant', titu);
}

titre('l enseignant de matiere : SES matieres, et rien de plus');
{
  const prof = refLineScope({ role: 'teacher', school: ECOLE, cls: CLASSE, teacherId: 'p-espagnol' });
  ok(prof?.onlyTeacherId === 'p-espagnol', 'il obtient un perimetre restreint', prof);
  ok(!canManageClassSubjects({ role: 'teacher', school: ECOLE, cls: CLASSE, teacherId: 'p-espagnol' }),
    'alors que la garde d avant lui refusait tout — c est elle qui l enfermait');
}

titre('et personne d autre ne nomme de ligne de son propre chef');
{
  ok(refLineScope({ role: 'censeur', school: ECOLE, cls: CLASSE, teacherId: null }) === null,
    'un censeur non delegue : inchange, il ne rattrape rien');
  ok(refLineScope({ role: 'surveillant', school: ECOLE, cls: CLASSE, teacherId: null }) === null,
    'un surveillant non plus');
  ok(refLineScope({ role: 'teacher', school: ECOLE, cls: CLASSE, teacherId: null }) === null,
    'un compte enseignant SANS fiche rattachee : rien — sinon « teacher_id === null » '
    + 'lui ouvrirait les matieres que personne ne s est vu affecter');
  ok(refLineScope({ role: 'teacher', school: ECOLE, cls: null, teacherId: 'p-espagnol' })?.onlyTeacherId === 'p-espagnol',
    'sans classe chargee, le perimetre reste le sien (le magasin filtrera)');
}

titre('le mode « titulaire » (Mode 2) ne change pas de reponse');
{
  const MODE2 = { id: 'e1', grade_entry_mode: 'principal' };
  const prof = refLineScope({ role: 'teacher', school: MODE2, cls: CLASSE, teacherId: 'p-espagnol' });
  ok(prof?.onlyTeacherId === 'p-espagnol',
    'le droit d ecrire le referentiel ne depend pas du mode de saisie', prof);
}

// ── LE CÂBLAGE — une règle juste que personne n'applique ne débloque rien ───
titre('les trois ecrans officiels lisent bien ce perimetre-la');
{
  for (const [f, nom] of [
    ['../components/grades/PrimCompetenceWorkspace.jsx', 'primaire'],
    ['../components/grades/ApcCompetenceWorkspace.jsx', 'premier cycle'],
    ['../components/grades/MatObservationWorkspace.jsx', 'maternelle'],
  ]) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    ok(/refLineScope\(/.test(src), `${nom} : appelle refLineScope`);
    ok(!/if \(!canManageClassSubjects\(\{ role, school, cls: selectedClass, teacherId, isDelegate \}\)\) return;/.test(src),
      `${nom} : la garde trop stricte a bien disparu du rattrapage`);
  }
}

titre('le magasin sait restreindre la creation, pas seulement l arbitrage');
{
  const store = readFileSync(new URL('../store/schoolStore.js', import.meta.url), 'utf8');
  for (const nom of [
    'materialiserCompetencesPrimManquantes',
    'materialiserDomainesMatManquants',
    'materialiserMatieresManquantes',
  ]) {
    const re = new RegExp(`${nom}: async \\(cls(, niveauSlug)?, opts = \\{\\}\\)`);
    ok(re.test(store), `${nom} accepte un perimetre`);
  }
  ok((store.match(/opts\.onlyTeacherId/g) || []).length >= 4,
    'et les trois s en servent pour filtrer ce qu elles creent',
    (store.match(/opts\.onlyTeacherId/g) || []).length);
  // L'arbitrage « la première matière qui réclame garde » doit rester calculé
  // sur TOUTE la classe : sinon l'ordre du bulletin dépendrait de qui a ouvert
  // l'écran en premier.
  ok(/const toutes = primSubjectsNeedingOwnCompetence\(deLaClasse, duNiveau\);/.test(store),
    'le calcul porte sur toute la classe, le filtre vient APRES');
}

titre('la classe se garde sur « j y enseigne », pas sur « ca se rattache »');
{
  const prim = readFileSync(new URL('../components/grades/PrimCompetenceWorkspace.jsx', import.meta.url), 'utf8');
  ok(/mySubjects\(subjects, teacherId, c\.id\)\.length > 0/.test(prim),
    'primaire : la classe reste listee des qu il y enseigne');
  ok(!/competenceIdsForTeacher\(subjects, teacherId, c\.id, comps\)\.size > 0/.test(prim),
    'et l impasse d avant a disparu');
  const mat = readFileSync(new URL('../components/grades/MatObservationWorkspace.jsx', import.meta.url), 'utf8');
  ok(/mySubjects\(subjects, teacherId, c\.id\)\.length > 0/.test(mat),
    'maternelle : meme regle — les deux ecrans ne doivent pas diverger');
}

titre('une note refusee le DIT, au lieu de revenir en silence');
{
  const prim = readFileSync(new URL('../components/grades/PrimCompetenceWorkspace.jsx', import.meta.url), 'utf8');
  ok(/onRefus\?\.\(local, max\)/.test(prim), 'la cellule previent quand elle refuse');
  ok((prim.match(/onRefus=\{noteRefusee\}/g) || []).length === 2,
    'et les DEUX dispositions (tablette et ordinateur) le font',
    (prim.match(/onRefus=\{noteRefusee\}/g) || []).length);
  ok(/dépasse le barème de la colonne/.test(prim),
    'en nommant la vraie raison : le bareme de la colonne');
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\nECHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
