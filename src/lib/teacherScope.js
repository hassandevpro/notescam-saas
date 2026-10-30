// Mode 1 « enseignant de matière » : périmètre des matières d'un enseignant.
//
// Le store ne restreint que les CLASSES (schoolStore.init) : la lecture des
// matières reste complète, parce que bulletins, relevés et classements doivent
// afficher TOUTE la classe, quel que soit l'enseignant connecté. Limiter la vue
// à « mes matières » est donc une décision d'ÉCRAN, prise poste de saisie par
// poste de saisie — ce module la centralise pour que tous l'appliquent pareil.
//
// Module PUR (aucun hook, aucun store) : testable par `node`.

import { normName } from './teacherNames.js';
import { classSectionKey } from '../core/engineResolver.js';

// ── EXCEPTION FONDAMENTALE : la titulaire de maternelle / primaire enseigne TOUT ─
//
// Au collège et au lycée, le titulariat ne donne rien à saisir : chaque matière a
// son spécialiste, et `subjects.teacher_id` dit qui saisit quoi. Le fondamental est
// l'inverse — une institutrice de PS ou de CE1 tient sa classe entière. Le
// référentiel maternelle le codifie déjà (voir matDomaineMatch : « le TITULAIRE
// garde les 8 domaines »), et l'écran maternelle officiel l'applique.
//
// LE DÉFAUT MESURÉ : les écrans du monde CLASSIQUE ne l'appliquaient pas. En mode
// « enseignant de matière », `SubjectTeacherWorkspace` excluait explicitement le
// titulariat, et `PrincipalGrades` filtrait les matières sur `teacher_id`. Une
// institutrice titulaire d'une classe de maternelle à qui aucune ligne `subjects`
// n'est nominativement affectée — le cas NORMAL, puisqu'elle les enseigne toutes —
// se retrouvait devant « Aucune classe attribuée » et « Aucune matière ne vous est
// attribuée », sans un élève ni une cote, alors que le store lui donnait bien sa
// classe (il compte le titulariat, lui).
//
// On remonte donc la règle ici, pour que les trois écrans la partagent.
export function isFundamentalTitulaire(cls, teacherId) {
  if (!teacherId || !cls || cls.teacher_id !== teacherId) return false;
  const section = classSectionKey(cls);
  return section === 'maternelle' || section === 'primaire';
}

// Vrai quand l'écran doit se limiter aux matières affectées POUR CETTE CLASSE.
// Même réponse que `isSubjectScoped`, sauf pour la titulaire du fondamental.
export function isSubjectScopedForClass(role, school, cls, teacherId) {
  if (!isSubjectScoped(role, school)) return false;
  return !isFundamentalTitulaire(cls, teacherId);
}

// Les matières saisissables sur une classe : les siennes, ou TOUTES celles de la
// classe quand elle en est la titulaire au fondamental.
//
// MÊME GARDE QUE `mySubjects`, et pour la même raison : un compte sans fiche
// enseignant (`teacherId` null) n'a aucune affectation, et le filtre
// `s.teacher_id === teacherId` devient alors `=== null` — c'est-à-dire qu'il
// lui OUVRE exactement les matières que personne ne s'est vu affecter, au lieu
// de ne rien lui ouvrir. `mySubjects` écarte ce cas depuis l'origine ; ici il
// manquait. Les deux fonctions répondent à la même question et doivent dire la
// même chose, sinon le périmètre dépend de laquelle l'écran a appelée.
export function subjectsForClass(subjects, teacherId, cls, role, school) {
  const inClass = (subjects || []).filter((s) => s.class_id === cls?.id);
  if (!isSubjectScopedForClass(role, school, cls, teacherId)) return inClass;
  if (!teacherId) return [];
  return inClass.filter((s) => s.teacher_id === teacherId);
}

// Réglage d'établissement `schools.grade_entry_mode` :
// 'principal' (défaut historique) : le titulaire saisit toutes les matières de
//   sa classe — rien n'est filtré.
// 'subject' : chaque enseignant ne voit et ne saisit que les matières qui lui
//   sont affectées (subjects.teacher_id).
export function gradeEntryMode(school) {
  return school?.grade_entry_mode === 'subject' ? 'subject' : 'principal';
}

// Vrai quand l'écran doit se limiter aux matières affectées à l'enseignant.
// Admin, censeur et surveillant gardent toujours la vue complète.
export function isSubjectScoped(role, school) {
  return role === 'teacher' && gradeEntryMode(school) === 'subject';
}

// Les lignes `subjects` affectées à l'enseignant — toutes classes, ou une seule.
// Un compte sans fiche enseignant (`teacherId` null) n'a aucune affectation : on
// renvoie [] plutôt que de laisser `teacher_id === null` lui ouvrir les matières
// non affectées.
export function mySubjects(subjects, teacherId, classId = null) {
  if (!teacherId) return [];
  return (subjects || []).filter(
    (s) => s.teacher_id === teacherId && (!classId || s.class_id === classId),
  );
}

// Ids des classes où l'enseignant assure au moins une matière.
export function myClassIds(subjects, teacherId) {
  return new Set(mySubjects(subjects, teacherId).map((s) => s.class_id));
}

// Noms normalisés de mes matières sur une classe. C'est le SEUL lien disponible
// entre une matière du référentiel APC (premier cycle) et la ligne `subjects`
// locale, qui n'en porte pas l'id (voir subjectsFromApcReferentiel) — même
// correspondance que celle utilisée par les bulletins (teacherByMatiere).
export function mySubjectNames(subjects, teacherId, classId) {
  return new Set(mySubjects(subjects, teacherId, classId).map((s) => normName(s.name)));
}

// ── QUI PEUT CONFIGURER LES MATIÈRES D'UNE CLASSE ────────────────────────────
//
// Miroir EXACT de la policy RLS `subjects: écriture par l'enseignant de la classe`
// (supabase_teacher_edits_subjects_toujours.sql). Les deux doivent dire la même
// chose : si l'écran propose un bouton que la base refusera, l'écriture part en
// file hors-ligne et y tourne en boucle — le défaut corrigé en cd04fd9 pour
// `mat_observations`, qu'on ne recrée pas ici.
//
// AUCUN RÉGLAGE. Le droit ne dépend pas d'une case cochée : une enseignante ne
// doit pas attendre qu'on l'autorise à nommer les matières de sa propre classe.
// La sécurité ne tient pas à un interrupteur, elle tient au PÉRIMÈTRE :
//   • l'ADMINISTRATION (admin, ou délégué /app/classes) : tout, partout ;
//   • le TITULAIRE : toutes les matières de SA classe — créer, renommer,
//     supprimer. Tous les cycles, de la maternelle à la Terminale ;
//   • l'ENSEIGNANT DE MATIÈRE : SES propres lignes seulement. Il ajuste le barème
//     de son cours, il ne supprime pas celui d'un collègue.
//
// Chacun chez soi, sans demander la permission — et le cloisonnement par secteur
// s'applique par-dessus, côté base.

// Gérer LA LISTE : ajouter et supprimer des matières de cette classe.
export function canManageClassSubjects({ role, school, cls, teacherId, isDelegate = false }) {
  if (role === 'admin' || isDelegate) return true;
  return !!teacherId && !!cls && cls.teacher_id === teacherId;
}

// Modifier UNE ligne (nom, coef, barème, enseignant affecté).
export function canEditSubjectRow({ role, school, cls, teacherId, subject, isDelegate = false }) {
  if (canManageClassSubjects({ role, school, cls, teacherId, isDelegate })) return true;
  return !!teacherId && subject?.teacher_id === teacherId;
}

// ── QUI PEUT NOMMER UNE LIGNE DE RÉFÉRENTIEL, ET POUR QUELLES MATIÈRES ───────
//
// Les trois écrans officiels (primaire, premier cycle, maternelle) rattrapent à
// l'ouverture les matières qui ne tombent sur aucune ligne du référentiel : ils
// créent une ligne MAISON qui porte le nom de la matière. Sans elle, la matière
// n'a aucune colonne — donc aucune note saisissable.
//
// CE RATTRAPAGE ÉTAIT GARDÉ PAR `canManageClassSubjects`, QUI EST LA POLICY DE
// LA MAUVAISE TABLE. Les tables de référentiel (`prim_competences`,
// `mat_domaines`, `apc_matieres`) portent toutes la même règle :
//     USING / WITH CHECK (school_id IS NOT NULL AND member_of_school(school_id))
// — tout membre de l'école écrit les lignes de SON école. `subjects`, elle,
// exige le titulariat. L'écran était donc PLUS STRICT que la base, et pour
// rien : aucune écriture n'aurait été refusée, aucune file n'aurait bouclé.
//
// LE DÉFAUT MESURÉ (2026-10-29, édition LAN montée). École en mode « enseignant
// de matière ». Une enseignante d'« Espagnol » en CE1 — matière qui ne tombe sur
// aucune des onze compétences nationales — n'est pas titulaire de la classe. Le
// rattrapage ne partait donc jamais, et son écran de saisie ne portait qu'une
// phrase : « Aucune de vos matières ne se rattache à une compétence nationale
// (1A–6B) : Espagnol. Demandez à l'administration de les renommer selon le
// référentiel. » Pas un élève, pas une cellule — une impasse, pour un geste que
// le produit sait faire seul et que la base l'autorisait à faire.
//
// LE PÉRIMÈTRE RESTE. Elle ne nomme que les lignes de SES matières ; celles d'un
// collègue restent au titulaire ou à l'administration. D'où trois réponses :
//   • `{}`                    — tout le périmètre de la classe (admin, délégué,
//                               titulaire) : le comportement d'avant, inchangé ;
//   • `{ onlyTeacherId }`     — ses propres matières seulement ;
//   • `null`                  — rien à rattraper de son propre chef.
export function refLineScope({ role, school, cls, teacherId, isDelegate = false }) {
  if (canManageClassSubjects({ role, school, cls, teacherId, isDelegate })) return {};
  if (role === 'teacher' && teacherId) return { onlyTeacherId: teacherId };
  return null;
}
