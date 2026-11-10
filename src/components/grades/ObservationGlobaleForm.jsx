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
  creneauObservationUA, lireObservationUA, normaliserObservation,
  LONGUEUR_CONSEILLEE,
} from '../../core/observationGlobale';
import { aEcrire } from '../../core/observationSuggestion';

// ── Une ligne : un élève, un texte ───────────────────────────────────────────
// L'état du texte est LOCAL à la ligne : sinon chaque frappe redessinerait les
// trente-cinq lignes de la classe. Écriture au `blur`, et seulement si le texte
// a changé (cf. `observationAChange` — un `onBlur` se déclenche à chaque
// passage de champ, même sans frappe).
function LigneObservation({ numero, eleve, valeur, onCommit, onSuggerer, placeholder, t }) {
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

  // « Suggérer » : jamais d'écrasement silencieux. Un texte déjà saisi demande l'accord de l'enseignant(e).
  const suggerer = async () => {
    const proposee = onSuggerer ? onSuggerer() : '';
    if (!proposee) { setStatut('vide'); clearTimeout(minuteur.current); minuteur.current = setTimeout(() => setStatut(''), 2500); return; }
    const deja = normaliserObservation(local);
    if (deja && deja !== proposee
      && !window.confirm(t('Remplacer le texte saisi par la suggestion ?', 'Replace the text you entered with the suggestion?'))) return;
    setLocal(proposee);
    setStatut('envoi');
    await onCommit(proposee);
    setStatut('ok');
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setStatut(''), 1800);
  };

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
          <span className="text-[11px] shrink-0 flex items-center gap-3">
            {onSuggerer && (
              <button type="button" onClick={suggerer} className="font-semibold text-brand-600 hover:text-brand-700">
                {t('Suggérer une observation', 'Suggest a remark')}
              </button>
            )}
            {statut === 'vide'  && <span className="text-amber-600">{t('Pas encore de notes à résumer.', 'No marks to summarise yet.')}</span>}
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
// @param parUA       primaire : UNE observation PAR UA (créneaux 11-18), au lieu d'une par trimestre
// @param suggerer    (élève) => texte proposé, calculé hors ligne ; absent = pas de bouton « Suggérer »
export default function ObservationGlobaleForm({
  classId, students = [], trimestre, ua = null, lectureSeule = false, parUA = false, suggerer = null,
}) {
  const t = useT();
  const gradeMap  = useSchoolStore((s) => s.gradeMap);
  const saveGrade = useSchoolStore((s) => s.saveGrade);
  const [ouvert, setOuvert] = useState(false);

  // Par UA : le créneau est celui de l'UA ; sinon celui du trimestre (maternelle, et primaire sans UA connue).
  const modeUA = parUA && creneauObservationUA(ua) !== null;
  const creneau = modeUA ? creneauObservationUA(ua) : creneauObservation(trimestre);
  const lire = (stuId) => (modeUA
    ? lireObservationUA(gradeMap, classId, stuId, ua)
    : lireObservation(gradeMap, classId, stuId, trimestre));

  const etat = useMemo(() => {
    if (!modeUA) return etatObservations(gradeMap, classId, students, trimestre);
    const manquants = [];
    let renseignees = 0;
    for (const e of students) {
      if (normaliserObservation(lireObservationUA(gradeMap, classId, e.id, ua))) renseignees += 1;
      else manquants.push(e.id);
    }
    return { total: students.length, renseignees, manquants };
  }, [gradeMap, classId, students, trimestre, ua, modeUA]);
  const [bilan, setBilan] = useState('');

  // Pas de classe, pas d'élève, ou un trimestre qu'on ne sait pas situer : rien.
  // Un formulaire qui écrirait dans un créneau inventé serait pire que son
  // absence — la saisie partirait là où aucun bulletin ne va la lire.
  if (!classId || !students.length || creneau === null) return null;

  const enregistrer = (studentId) => async (texte) => {
    await saveGrade(classId, studentId, creneau, lotObservation(texte));
  };

  // « Suggérer pour toute la classe » : remplit UNIQUEMENT les observations VIDES — un texte déjà saisi n'est
  // jamais touché. L'enseignant(e) relit ensuite élève par élève et corrige librement.
  const suggererClasse = async () => {
    if (!suggerer) return;
    const lot = [];
    for (const stu of students) {
      const texte = aEcrire(lire(stu.id), suggerer(stu));
      if (texte) lot.push([stu.id, texte]);
    }
    if (!lot.length) { setBilan(t('Rien à remplir : toutes les observations sont déjà saisies, ou aucune note n’est encore entrée.', 'Nothing to fill: every remark is already entered, or no marks have been entered yet.')); return; }
    if (!window.confirm(t(
      `Remplir ${lot.length} observation(s) vide(s) avec une suggestion ? Les textes déjà saisis ne sont pas touchés ; vous pourrez relire et modifier chaque élève.`,
      `Fill ${lot.length} empty remark(s) with a suggestion? Texts already entered are left alone; you can review and edit each student.`))) return;
    for (const [id, texte] of lot) await enregistrer(id)(texte);
    setBilan(t(`${lot.length} suggestion(s) enregistrée(s) — à relire élève par élève.`, `${lot.length} suggestion(s) saved — review them student by student.`));
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
            {modeUA
              ? t(`Observation de l’enseignant(e) — UA${ua}`, `Class teacher’s remarks — UL${ua}`)
              : t(`Observation générale — Trimestre ${trimestre}`, `General remarks — Term ${trimestre}`)}
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
            {modeUA
              ? t(`Une observation PAR UA : celle-ci est propre à l'UA${ua} et s'imprime sur son bulletin. Sans observation d'UA, le bulletin reprend celle du trimestre ${trimestre}.`,
                  `One remark PER learning unit: this one belongs to UL${ua} and prints on its report card. Without a unit remark, the report card uses the term ${trimestre} remark.`)
              : ua
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
              {suggerer && (
                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-sky-50/60 border-b border-sky-100">
                  <span className="text-xs text-sky-800 min-w-0">
                    {bilan || t('Suggestions tirées des résultats de chaque élève — vous restez libre de les modifier.',
                                'Suggestions drawn from each student’s results — you stay free to edit them.')}
                  </span>
                  <button type="button" onClick={suggererClasse}
                    className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700">
                    {t('Suggérer pour toute la classe', 'Suggest for the whole class')}
                  </button>
                </div>
              )}
              {students.map((stu, i) => (
                <LigneObservation
                  key={stu.id}
                  numero={i + 1}
                  eleve={stu}
                  valeur={lire(stu.id)}
                  onCommit={enregistrer(stu.id)}
                  onSuggerer={suggerer ? () => suggerer(stu) : null}
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
