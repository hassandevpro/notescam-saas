// Écran de saisie APC (moteur APC_MINISTERIEL_MINESEC).
//
// L'enseignant choisit Séquence + Classe + Matière. Le système charge
// AUTOMATIQUEMENT les compétences officielles du trimestre correspondant
// (S1/S2→T1, S3/S4→T2, S5/S6→T3). L'enseignant ne peut NI ajouter, NI supprimer,
// NI modifier les compétences : il saisit uniquement la NOTE /20 de chaque élève
// pour chaque compétence. L'appréciation (cote A+/A/ECA/NA) est DÉRIVÉE, jamais
// saisie — d'où l'absence de bouton « Appréciations ».
//
// Monté à la place de l'écran classique quand school.bulletin_engine='apc_minesec'.

import { useEffect, useMemo, useState } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useT } from '../../lib/i18n';
import { validateGrade, gradeColor } from '../../lib/gradeEntry';
import { isSequenceLocked } from '../../lib/lockService';
import { noteNkey } from '../../lib/apcService';
import { firstCycleClasseSlug, resolveClassEngine } from '../../core/engineResolver';
// Une classe anglophone qui n'a pas encore importé son référentiel CBA retombe
// sur le catalogue francophone : ses noms de matières sont alors rendus en
// anglais, comme sur son bulletin.
import { apcMatiereLabel } from '../../core/referentielI18n';
import { isSubjectScoped, myClassIds } from '../../lib/teacherScope';
import {
  matiereIdsForTeacher, unresolvedSubjectsForTeacher,
} from '../../core/apcMatiereMatch';
import SectionSelect from './SectionSelect';
import CompetenceGradeIO from './CompetenceGradeIO';
import {
  competencesFor, matiereAverage, apcCote, coefFor,
  noteScale, APC_DEFAULT_MAX,
} from '../../core/apcEngine';
import {
  apcSeqIdOfSeqNum, apcTrimestreOfSeqNum, apcSeqNumsForTrimestre, APC_TRIMESTRE_IDS,
} from '../../core/apcPeriods';

const APC_MAX = APC_DEFAULT_MAX; // barème par défaut des notes APC (/20)

// ── Cellule note ──────────────────────────────────────────────────────────────
// `max` = barème de CETTE évaluation (compétence × séquence). La saisie est
// bornée à [0, max] : sur une évaluation /3, taper 14 est refusé à la frappe.
function NoteCell({ value, max = APC_MAX, disabled, onCommit }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const commit = () => {
    const v = validateGrade(local, max);
    if (v === null) { setLocal(value ?? ''); return; }
    if (v !== (value ?? '')) onCommit(v);
  };
  return (
    <input
      type="text"
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      placeholder="—"
      title={`/${max}`}
      className={`w-16 text-center rounded border border-gray-200 px-1 py-1 text-sm
        focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300
        disabled:bg-gray-50 disabled:text-gray-400 placeholder:text-gray-300
        ${gradeColor(local, max, 'FR')}`}
    />
  );
}

// ── Barème d'une colonne (une évaluation) ────────────────────────────────────
// Le barème appartient à l'évaluation, pas à la compétence : la même compétence
// peut être notée /3 en séquence 1 et /20 en séquence 2. Il est donc stocké sur
// chaque note (`apc_notes.note_max`) et relu depuis elles.
function BaremeCell({ value, disabled, onCommit }) {
  const [local, setLocal] = useState(String(value ?? APC_MAX));
  useEffect(() => { setLocal(String(value ?? APC_MAX)); }, [value]);
  const commit = () => {
    const n = parseFloat(String(local).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) { setLocal(String(value ?? APC_MAX)); return; }
    if (n !== value) onCommit(n);
  };
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-normal text-gray-500">
      /
      <input
        type="text"
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        className="w-9 text-center rounded border border-gray-200 px-0.5 py-0.5 text-[11px]
          focus:outline-none focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
      />
    </span>
  );
}

export default function ApcCompetenceWorkspace() {
  const t = useT();
  const school   = useAuthStore((s) => s.school);
  const schoolId = school?.id;
  const role      = useAuthStore((s) => s.role);
  const teacherId = useAuthStore((s) => s.teacherId);
  // Mode 1 « enseignant de matière » : l'enseignant ne voit QUE les matières qui
  // lui sont affectées — et donc que les classes où il en assure au moins une.
  const subjectScoped = isSubjectScoped(role, school);

  const classes        = useSchoolStore((s) => s.classes);
  const subjects       = useSchoolStore((s) => s.subjects);
  const students       = useSchoolStore((s) => s.students);
  const referentiel    = useSchoolStore((s) => s.apcReferentiel);
  const apcNotes       = useSchoolStore((s) => s.apcNotes);
  const loadApc        = useSchoolStore((s) => s.loadApc);
  const saveApcNote    = useSchoolStore((s) => s.saveApcNote);

  // Classe partagée avec l'écran classique (uiStore) : le choix de la classe
  // pilote automatiquement le moteur affiché (APC vs classique/second cycle).
  const classId    = useUiStore((s) => s.gradesClassId);
  const setClassId = useUiStore((s) => s.setGradesClassId);
  const [sequence, setSequence] = useState(1);
  const [matiereId, setMatiereId] = useState('');
  // Barème choisi pour une colonne encore vide (rien à relire en base tant
  // qu'aucune note n'y est saisie) + message de refus d'un changement.
  const [pendingBareme, setPendingBareme] = useState({});
  const [baremeMsg, setBaremeMsg] = useState(null);

  useEffect(() => { loadApc(); }, [loadApc]);

  // Séquences de SAISIE, lues du référentiel (`apc_sequences`) : leur nombre et
  // leur rattachement au trimestre sont des DONNÉES, pas une constante — un
  // trimestre peut en compter deux, trois, ou un nombre différent d'un autre.
  // Repli sur le rythme MINESEC courant tant que le référentiel n'est pas chargé.
  const SEQUENCES = useMemo(() => {
    const nums = (referentiel?.sequences || [])
      .map((s) => Number(s.numero))
      .filter((n) => Number.isFinite(n));
    return nums.length ? [...new Set(nums)].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6];
  }, [referentiel]);

  // Si le référentiel chargé ne porte pas la séquence sélectionnée, on revient à
  // la première : mieux vaut une saisie sur une séquence réelle qu'un écran vide.
  useEffect(() => {
    if (SEQUENCES.length && !SEQUENCES.includes(sequence)) setSequence(SEQUENCES[0]);
  }, [SEQUENCES, sequence]);

  const sequenceId  = apcSeqIdOfSeqNum(referentiel, sequence) || `s${sequence}`;
  const trimestreId = apcTrimestreOfSeqNum(referentiel, sequence);

  // ── Choix du TRIMESTRE, puis de la séquence qui lui appartient ──────────────
  // Les compétences officielles sont définies PAR TRIMESTRE : c'est donc par là
  // qu'un enseignant raisonne. Jusqu'ici l'écran n'offrait que les séquences et
  // affichait le trimestre en lecture seule — pour saisir le T2 il fallait
  // deviner que c'était la séquence 3. Le trimestre devient un choix explicite.
  //
  // `sequence` reste l'unique source de vérité : choisir un trimestre
  // sélectionne sa première séquence. Aucun état parallèle, donc rien à
  // resynchroniser. Les trimestres proposés sont ceux auxquels le référentiel
  // rattache réellement des séquences.
  const TRIMESTRES = useMemo(
    () => APC_TRIMESTRE_IDS
      .map((tid) => ({ id: tid, seqs: apcSeqNumsForTrimestre(referentiel, tid) }))
      .filter((x) => x.seqs.length),
    [referentiel],
  );
  const seqsDuTrimestre = TRIMESTRES.find((x) => x.id === trimestreId)?.seqs || SEQUENCES;
  const choisirTrimestre = (tid) => {
    const first = TRIMESTRES.find((x) => x.id === tid)?.seqs?.[0];
    if (first != null) setSequence(first);
  };

  // Classe sélectionnée + slug référentiel. On ne liste QUE les classes du premier
  // cycle (moteur 'apc') : l'établissement peut aussi contenir du fondamental ou du
  // second cycle, qui n'ont rien à faire dans ce sélecteur.
  const sortedClasses = useMemo(() => {
    let list = classes.filter((c) => resolveClassEngine(school, c) === 'apc');
    if (subjectScoped) {
      const mine = myClassIds(subjects, teacherId);
      list = list.filter((c) => mine.has(c.id));
    }
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
  }, [classes, school, subjectScoped, subjects, teacherId]);
  useEffect(() => {
    if (sortedClasses.length && !sortedClasses.some((c) => c.id === classId)) setClassId(sortedClasses[0].id);
  }, [sortedClasses, classId]);

  const selectedClass = sortedClasses.find((c) => c.id === classId) || null;
  const classeSlug = selectedClass ? firstCycleClasseSlug(selectedClass.level, selectedClass.name) : null;

  // Matières du référentiel ayant au moins une compétence pour (classe, trimestre),
  // avec leur coefficient officiel POUR cette classe (Français = 6 en 6e/5e, 4 en 4e/3e).
  const sys = selectedClass?.system || 'FR';

  // Matières du référentiel réellement disponibles pour (classe, trimestre),
  // avant tout filtrage par enseignant.
  const matieresDisponibles = useMemo(() => {
    if (!referentiel || !classeSlug || !trimestreId) return [];
    return referentiel.matieres
      .map((m) => ({
        ...m,
        nom: apcMatiereLabel(m, sys),
        nomOfficiel: m.nom,
        coef: coefFor(referentiel.classeMatieres, classeSlug, m),
        nbComp: competencesFor(referentiel.competences, { classeId: classeSlug, trimestreId, matiereId: m.id }).length,
      }))
      .filter((m) => m.nbComp > 0)
      .sort((a, b) => {
        const oa = (referentiel.classeMatieres || []).find((r) => r.classe_id === classeSlug && r.matiere_id === a.id)?.ordre ?? a.ordre ?? 0;
        const ob = (referentiel.classeMatieres || []).find((r) => r.classe_id === classeSlug && r.matiere_id === b.id)?.ordre ?? b.ordre ?? 0;
        return oa - ob;
      });
  }, [referentiel, classeSlug, trimestreId, sys]);

  // Mode 1 : ne garder que les matières couvertes par MES matières affectées.
  // Le rapprochement est délégué à apcMatiereMatch (noms officiels, sigles,
  // alias) — une matière locale pouvant en couvrir plusieurs.
  const matieres = useMemo(() => {
    if (!subjectScoped) return matieresDisponibles;
    const mine = matiereIdsForTeacher(subjects, teacherId, classId, matieresDisponibles);
    return matieresDisponibles.filter((m) => mine.has(m.id));
  }, [subjectScoped, matieresDisponibles, subjects, teacherId, classId]);

  // Mes matières de cette classe qui ne se rattachent à RIEN : on les nomme,
  // plutôt que de laisser l'enseignant devant un écran vide sans explication.
  const matieresOrphelines = useMemo(
    () => (subjectScoped
      ? unresolvedSubjectsForTeacher(subjects, teacherId, classId, matieresDisponibles)
      : []),
    [subjectScoped, subjects, teacherId, classId, matieresDisponibles],
  );

  const matiereCoef = matieres.find((m) => m.id === matiereId)?.coef ?? 1;

  useEffect(() => {
    if (matieres.length && !matieres.some((m) => m.id === matiereId)) setMatiereId(matieres[0].id);
  }, [matieres, matiereId]);

  // Compétences officielles (verrouillées) de (classe, trimestre, matière).
  const competences = useMemo(
    () => (referentiel && classeSlug && trimestreId && matiereId)
      ? competencesFor(referentiel.competences, { classeId: classeSlug, trimestreId, matiereId })
      : [],
    [referentiel, classeSlug, trimestreId, matiereId],
  );

  const classStudents = useMemo(
    () => students.filter((s) => s.class_id === classId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [students, classId],
  );

  const locked = schoolId && classId ? isSequenceLocked(schoolId, classId, sequence) : false;

  // Lecture/écriture d'une cellule (note ou appréciation) en préservant l'autre champ.
  const recordFor = (eleveId, competenceId) => apcNotes[noteNkey(eleveId, competenceId, sequenceId)] || null;

  // Barème de l'évaluation (compétence × séquence) : relu de la première note
  // déjà saisie dans la colonne, /20 par défaut. La même compétence peut donc
  // être notée /3 sur une séquence et /20 sur une autre.
  const baremeFor = (competenceId) => {
    for (const stu of classStudents) {
      const r = recordFor(stu.id, competenceId);
      if (r?.note_max != null) return Number(r.note_max);
      if (r?.note != null && r.note !== '') return APC_DEFAULT_MAX; // note sans barème = historique /20
    }
    return pendingBareme[competenceId] ?? APC_DEFAULT_MAX;
  };

  const saveCell = (eleveId, competenceId, patch) => {
    const rec = recordFor(eleveId, competenceId);
    saveApcNote({
      eleveId, competenceId, sequenceId,
      note: 'note' in patch ? patch.note : (rec?.note ?? ''),
      noteMax: 'noteMax' in patch ? patch.noteMax : baremeFor(competenceId),
      appreciation: 'appreciation' in patch ? patch.appreciation : (rec?.appreciation ?? ''),
    });
  };

  // Changement du barème d'une colonne. REFUSÉ si une note déjà saisie le
  // dépasse : on ne transforme pas en silence un 14/20 en 14/3. L'enseignant
  // corrige d'abord les notes concernées.
  const setBareme = (competenceId, nouveau) => {
    const trop = classStudents.filter((stu) => {
      const r = recordFor(stu.id, competenceId);
      const n = r?.note == null || r.note === '' ? null : Number(r.note);
      return n != null && !Number.isNaN(n) && n > nouveau;
    });
    if (trop.length) {
      setBaremeMsg({
        competenceId,
        text: t(
          `Barème /${nouveau} refusé : ${trop.length} note(s) le dépassent (${trop.slice(0, 3).map((s) => s.name).join(', ')}${trop.length > 3 ? '…' : ''}). Corrigez-les d'abord.`,
          `Scale /${nouveau} refused: ${trop.length} grade(s) exceed it (${trop.slice(0, 3).map((s) => s.name).join(', ')}${trop.length > 3 ? '…' : ''}). Fix them first.`,
        ),
      });
      return;
    }
    setBaremeMsg(null);
    setPendingBareme((p) => ({ ...p, [competenceId]: nouveau }));
    // Les notes déjà saisies suivent le nouveau barème de l'évaluation.
    for (const stu of classStudents) {
      const r = recordFor(stu.id, competenceId);
      if (r?.note != null && r.note !== '') saveCell(stu.id, competenceId, { noteMax: nouveau });
    }
  };

  // Moyenne matière d'un élève (sur les compétences de la séquence). Chaque note
  // est fournie AVEC son barème : `matiereAverage` normalise avant d'agréger, de
  // sorte qu'un 2/3 et un 14/20 ne soient jamais additionnés tels quels.
  const studentAvg = (eleveId) => {
    const notes = {};
    for (const c of competences) {
      const v = noteScale(recordFor(eleveId, c.id));
      if (v !== null) notes[c.id] = v;
    }
    return matiereAverage(notes, competences);
  };

  // ── Rendus d'états vides ─────────────────────────────────────────────────────
  if (!referentiel) {
    return (
      <div className="p-8 text-center text-gray-500">
        {t('Chargement du référentiel APC…', 'Loading APC framework…')}
      </div>
    );
  }
  if (subjectScoped && sortedClasses.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        {t(
          'Aucune matière du premier cycle (6e–3e) ne vous est affectée. Demandez à l’administration de vous affecter vos matières dans Matières.',
          'No first-cycle (6e–3e) subject is assigned to you. Ask the administration to assign your subjects in Subjects.',
        )}
      </div>
    );
  }
  if (!classeSlug) {
    return (
      <div className="p-8 text-center text-gray-500">
        {t(
          'La classe sélectionnée n’est pas reconnue comme une classe du premier cycle (6e–3e).',
          'The selected class is not recognized as a first-cycle class (6e–3e).',
        )}
        <div className="mt-4">{renderClassPicker()}</div>
      </div>
    );
  }

  function renderClassPicker() {
    return (
      <select value={classId} onChange={(e) => setClassId(e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
        {sortedClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">
          {t('Saisie par compétences (APC)', 'Competency entry (APC)')}
        </h1>
        <p className="text-sm text-gray-500">
          {t(
            'Compétences officielles MINESEC — chargées automatiquement, non modifiables.',
            'Official MINESEC competencies — loaded automatically, read-only.',
          )}
        </p>
      </div>

      {/* Sélecteurs */}
      <div className="flex flex-wrap items-end gap-3">
        <SectionSelect classes={classes} classId={classId} setClassId={setClassId} />
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Classe', 'Class')}</span>
          {renderClassPicker()}
        </label>
        {/* Trimestre d'abord : c'est l'unité des compétences officielles. */}
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Trimestre', 'Term')}</span>
          <select value={trimestreId || ''} onChange={(e) => choisirTrimestre(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {TRIMESTRES.map((x) => (
              <option key={x.id} value={x.id}>
                {t('Trimestre', 'Term')} {x.id.replace('t', '')}
              </option>
            ))}
          </select>
        </label>
        {/* Puis la séquence — mais seulement celles de ce trimestre. */}
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Séquence', 'Sequence')}</span>
          <select value={sequence} onChange={(e) => setSequence(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {seqsDuTrimestre.map((n) => <option key={n} value={n}>{t('Séquence', 'Sequence')} {n}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Matière', 'Subject')}</span>
          <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[12rem]">
            {matieres.length === 0 && <option value="">{t('Aucune (importer un référentiel)', 'None (import a framework)')}</option>}
            {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom} (coef {m.coef})</option>)}
          </select>
        </label>
      </div>

      {/* Bandeau trimestre / héritage */}
      <div className="text-xs text-gray-500">
        {t('Coef matière', 'Subject coef')} {matiereCoef} · {' '}
        {t(`les ${seqsDuTrimestre.length} séquence(s) de ce trimestre partagent les mêmes compétences`,
           `the ${seqsDuTrimestre.length} sequence(s) of this term share the same competencies`)}
        {locked && <span className="ml-2 text-amber-600 font-medium">· {t('Séquence verrouillée (lecture seule)', 'Sequence locked (read-only)')}</span>}
      </div>

      {/* Refus d'un changement de barème qui invaliderait des notes déjà saisies. */}
      {baremeMsg && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {baremeMsg.text}
        </div>
      )}

      {competences.length > 0 && classStudents.length > 0 && (
        <CompetenceGradeIO
          filename={`notes_${(matieres.find((m) => m.id === matiereId)?.nom || 'matiere').replace(/[\\/:*?"<>|]/g, '-')}_${selectedClass?.name || ''}_S${sequence}`}
          sheetName={`${t('Séquence', 'Sequence')} ${sequence}`}
          students={classStudents}
          columns={competences.map((c) => ({ id: c.id, label: c.intitule }))}
          getCell={(sid, cid) => { const r = recordFor(sid, cid); return r?.note != null ? String(r.note) : ''; }}
          computed={[
            { label: 'M/20', get: (sid) => studentAvg(sid) ?? '' },
            { label: t('Cote', 'Grade'), get: (sid) => apcCote(studentAvg(sid)).code },
          ]}
          normalize={(raw) => validateGrade(raw, APC_MAX)}
          onImport={(sid, cid, v) => saveCell(sid, cid, { note: v })}
          disabled={locked}
          valueHint="/20"
        />
      )}

      {matieres.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {matieresOrphelines.length > 0
            ? (
              <>
                {t(
                  'Ces matières qui vous sont affectées ne correspondent à aucune matière du référentiel officiel : ',
                  'These subjects assigned to you match no subject of the official framework: ',
                )}
                <span className="font-medium text-gray-700">
                  {[...new Set(matieresOrphelines.map((m) => m.name))].join(', ')}
                </span>
                {t(
                  '. Vérifiez leur orthographe dans Matières — le rapprochement se fait sur le nom.',
                  '. Check their spelling in Subjects — the match is made on the name.',
                )}
              </>
            )
            : subjectScoped
            ? t(
              'Aucune de vos matières n’a de compétence officielle pour cette classe et ce trimestre.',
              'None of your subjects has an official competency for this class and term.',
            )
            : t(
              'Aucune compétence officielle pour cette classe et ce trimestre. Importez un référentiel MINESEC.',
              'No official competency for this class and term. Import a MINESEC framework.',
            )}
        </div>
      ) : competences.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Aucune compétence pour cette matière.', 'No competency for this subject.')}
        </div>
      ) : classStudents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Aucun élève dans cette classe.', 'No student in this class.')}
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-600">
                  {t('Élève', 'Student')}
                </th>
                {competences.map((c) => (
                  <th key={c.id} className="px-3 py-2 text-left font-medium text-gray-600 max-w-[16rem]" title={c.intitule}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-gray-400">{t('Comp.', 'Comp.')} {c.ordre}</span>
                      {/* Barème de CETTE évaluation : /20 par défaut, modifiable. */}
                      <BaremeCell value={baremeFor(c.id)} disabled={locked}
                        onCommit={(n) => setBareme(c.id, n)} />
                    </span>
                    <span className="block truncate">{c.intitule}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-medium text-gray-600">{t('M/20', 'M/20')}</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">{t('Cote', 'Grade')}</th>
              </tr>
            </thead>
            <tbody>
              {classStudents.map((stu) => (
                <tr key={stu.id} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">
                    {stu.name}
                  </td>
                  {competences.map((c) => {
                    const rec = recordFor(stu.id, c.id);
                    return (
                      <td key={c.id} className="px-3 py-1.5">
                        <NoteCell value={rec?.note != null ? String(rec.note) : ''}
                          max={baremeFor(c.id)} disabled={locked}
                          onCommit={(v) => saveCell(stu.id, c.id, { note: v })} />
                      </td>
                    );
                  })}
                  {(() => {
                    const avg = studentAvg(stu.id);
                    const cote = apcCote(avg);
                    return (
                      <>
                        <td className="px-3 py-1.5 text-center font-semibold text-gray-700">{avg ?? '—'}</td>
                        <td className="px-3 py-1.5 text-center font-semibold" style={{ color: cote.col }}>{cote.code}</td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
