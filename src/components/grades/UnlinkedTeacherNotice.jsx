// « Compte non relié à une fiche enseignant » — la cause RACINE d'un compte vide.
//
// Sans fiche `teachers` rattachée (`teachers.auth_user_id` = son compte auth), le
// store ne lui laisse AUCUNE classe : ni matière, ni élève, ni note. Le tableau de
// bord le disait déjà (TeacherDashboard, `linked`), et l'écran de saisie classique
// aussi (PrincipalGrades) — mais les POSTES DE SAISIE dédiés, eux, répondaient
// « Aucune matière ne vous est affectée. Demandez à l'administration de vous
// affecter vos matières. » Ce conseil ne peut pas marcher : l'administration peut
// affecter autant de matières qu'elle veut, tant que le compte n'est pas relié à la
// fiche, `subjects.teacher_id` ne correspondra jamais à son `teacherId` (null) et
// l'écran restera vide. On envoie donc vers le seul geste qui débloque.
//
// Rendu volontairement identique au tableau de bord : l'enseignante lit deux fois
// la même phrase, pas deux diagnostics concurrents.

import { useT } from '../../lib/i18n';

export default function UnlinkedTeacherNotice() {
  const t = useT();
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-10 text-center">
      <div className="text-4xl mb-3">🔗</div>
      <p className="text-amber-800 font-semibold mb-1">
        {t('Compte non relié à une fiche enseignant', 'Account not linked to a teacher record')}
      </p>
      <p className="text-amber-600 text-sm">
        {t("Demandez à l'administrateur d'ouvrir Enseignants et de créer l'accès depuis votre fiche.",
           'Ask your administrator to open Teachers and create your access from your record.')}
      </p>
    </div>
  );
}
