// « OBSERVATION GÉNÉRALE » — le formulaire de classe, dans la page Notes.
//
// Demandé le 2026-11-02 : « mets un formulaire pour l'observation globale pour
// la maternelle et le primaire directement dans la page notes ».
//
// CE QUI MANQUAIT VRAIMENT. Le bulletin de maternelle imprime depuis toujours la
// ligne « Appréciation générale de l'enseignant(e) » et RIEN ne la remplissait :
// la page Notes n'offrait aucun champ, et l'écran des bulletins ne passait même
// pas la valeur au modèle. Le carnet du primaire, lui, la lisait déjà, mais il
// fallait ouvrir les bulletins et dérouler élève par élève pour l'écrire. Ici,
// toute la classe est à l'écran, dans l'ordre de la liste de classe.
//
// CE N'EST PAS L'OBSERVATION PAR DOMAINE. En maternelle, l'onglet
// « Observations » de la grille porte un texte PAR DOMAINE (motricité,
// langage…) ; celui-ci est l'appréciation d'ensemble, celle du bas du bulletin.
// Deux choses différentes, deux emplacements différents.
//
// L'UNITÉ EST LE TRIMESTRE. La saisie se fait par UA, mais le bulletin se tire
// par trimestre et c'est lui qui porte cette ligne : les UA d'un même trimestre
// partagent donc UNE observation. Le bandeau le dit en clair — sans cela,
// l'enseignante en écrit une par UA et n'en retrouve qu'une.
//
// Stockage, lecture, comptage : `core/observationGlobale.js` (pur, testé).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useT } from '../../lib/i18n';
import {
  lireObservation, observationAChange, lotObservation,
  observationTropLongue, etatObservations, creneauObservation,
  LONGUEUR_CONSEILLEE,
} from '../../core/observationGlobale';

// ── Une ligne : un élève, un texte ───────────────────────────────────────────
// L'état du texte est LOCAL à la ligne : sinon chaque frappe redessinerait les
// trente-cinq lignes de la classe. Écriture au `blur`, et seulement si le texte
// a changé (cf. `observationAChange` — un `onBlur` se déclenche à chaque
// passage de champ, même sans frappe).
function LigneObservation({ numero, eleve, valeur, onCommit, placeholder, t }) {
  const [local, setLocal] = useState(valeur);
  const [statut, setStatut] = useState('');     // '' | 'envoi' | 'ok'
  const minuteur = useRef(null);

  useEffect(() => { setLocal(valeur); }, [valeur, eleve.id]);
  useEffect(() => () => clearTimeout(minuteur.current), []);

  const commit = async () => {
    if (!observationAChange(valeur, local)) return;
    setStatut('envoi');
    await onCommit(local);
    setStatut('ok');
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setStatut(''), 1800);
  };

  const trop = observationTropLongue(local);

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3 px-3 py-2 border-t border-gray-100">
      <div className="flex items-center gap-2 sm:w-56 shrink-0 pt-1">
        <span className="text-xs text-gray-400 tabular-nums w-6 text-right">{numero}</span>
        <span className="text-sm font-medium text-gray-700 truncate" title={eleve.name}>
          {eleve.name}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <textarea
          rows={2}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm resize-y
            focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300
            placeholder:text-gray-300"
        />
        <div className="flex items-center justify-between gap-2 mt-0.5 min-h-[1rem]">
          {/* AVERTIR, JAMAIS TRONQUER. La case du bulletin fait une seule rangée :
              au-delà, le texte déborde à l'impression. C'est l'école qui juge. */}
          <span className={`text-[11px] ${trop ? 'text-amber-600' : 'text-transparent'}`}>
            {t(`Long pour la case du bulletin (${LONGUEUR_CONSEILLEE} caractères conseillés).`,
               `Long for the report-card box (${LONGUEUR_CONSEILLEE} characters advised).`)}
          </span>
          <span className="text-[11px] shrink-0">
            {statut === 'envoi' && <span className="text-gray-400">{t('Enregistrement…', 'Saving…')}</span>}
            {statut === 'ok'    && <span className="text-emerald-600">{t('✓ enregistré', '✓ saved')}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Le formulaire de la classe ───────────────────────────────────────────────
//
// @param classId    classe affichée
// @param students   élèves DANS L'ORDRE DE LA LISTE DE CLASSE (core/ordreClasse)
// @param trimestre  1, 2 ou 3 — dérivé de l'UA choisie (`trimestreOfUA`)
// @param ua         l'UA affichée, seulement pour le dire à l'écran
// @param lectureSeule  true pour un enseignant de matière non titulaire
export default function ObservationGlobaleForm({
  classId, students = [], trimestre, ua = null, lectureSeule = false,
}) {
  const t = useT();
  const gradeMap  = useSchoolStore((s) => s.gradeMap);
  const saveGrade = useSchoolStore((s) => s.saveGrade);
  const [ouvert, setOuvert] = useState(false);

  const etat = useMemo(
    () => etatObservations(gradeMap, classId, students, trimestre),
    [gradeMap, classId, students, trimestre],
  );

  // Pas de classe, pas d'élève, ou un trimestre qu'on ne sait pas situer : rien.
  // Un formulaire qui écrirait dans un créneau inventé serait pire que son
  // absence — la saisie partirait là où aucun bulletin ne va la lire.
  if (!classId || !students.length || creneauObservation(trimestre) === null) return null;

  const enregistrer = (studentId) => async (texte) => {
    await saveGrade(classId, studentId, creneauObservation(trimestre), lotObservation(texte));
  };

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-sky-100/60 transition-colors"
      >
        <span className="text-base leading-none">📝</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-sky-900">
            {t(`Observation générale — Trimestre ${trimestre}`,
               `General remarks — Term ${trimestre}`)}
          </span>
          <span className="block text-xs text-sky-700/80">
            {t(
              `${etat.renseignees} / ${etat.total} élève(s) renseigné(s) · s'imprime en bas du bulletin`,
              `${etat.renseignees} / ${etat.total} student(s) filled in · prints at the foot of the report card`,
            )}
          </span>
        </span>
        <span className="text-xs font-semibold text-sky-700 shrink-0">
          {ouvert ? t('Replier', 'Collapse') : t('Ouvrir', 'Open')}
        </span>
      </button>

      {ouvert && (
        <div className="bg-white border-t border-sky-200">
          {/* CE QUE LE TRIMESTRE IMPLIQUE, DIT AVANT LA SAISIE. Trois UA se
              partagent une observation : il faut le lire avant d'écrire, pas le
              découvrir en changeant d'UA. */}
          <p className="px-3 py-2 text-xs text-sky-800 bg-sky-50 border-b border-sky-100">
            {ua
              ? t(`Une seule observation pour tout le trimestre ${trimestre} : les UA du même trimestre la partagent. Vous saisissez depuis l'UA${ua}.`,
                  `One single remark for the whole of term ${trimestre}: the learning units of that term share it. You are entering it from UL${ua}.`)
              : t(`Une seule observation pour tout le trimestre ${trimestre}.`,
                  `One single remark for the whole of term ${trimestre}.`)}
          </p>

          {lectureSeule ? (
            <p className="px-3 py-4 text-sm text-gray-500">
              {t('L’appréciation d’ensemble revient au titulaire de la classe ou à l’administration — vos matières ne la portent pas.',
                 'The overall remark belongs to the class teacher or the administration — your subjects do not carry it.')}
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              {students.map((stu, i) => (
                <LigneObservation
                  key={stu.id}
                  numero={i + 1}
                  eleve={stu}
                  valeur={lireObservation(gradeMap, classId, stu.id, trimestre)}
                  onCommit={enregistrer(stu.id)}
                  placeholder={t('Comportement, progrès, points à travailler…',
                                 'Behaviour, progress, points to work on…')}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
