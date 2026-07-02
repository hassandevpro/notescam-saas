// Écran de saisie APC (moteur APC_MINISTERIEL_MINESEC).
//
// L'enseignant choisit Séquence + Classe + Matière. Le système charge
// AUTOMATIQUEMENT les compétences officielles du trimestre correspondant
// (S1/S2→T1, S3/S4→T2, S5/S6→T3). L'enseignant ne peut NI ajouter, NI supprimer,
// NI modifier les compétences : il saisit uniquement la NOTE et l'APPRÉCIATION
// (A / EA / NA) de chaque élève pour chaque compétence.
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
import { firstCycleClasseSlug } from '../../core/engineResolver';
import {
  competencesFor, trimestreOfSequence, matiereAverage, apcCote, coefFor,
} from '../../core/apcEngine';

const APC_MAX = 20; // barème officiel des notes APC (premier cycle, /20)

// ── Cellule note ──────────────────────────────────────────────────────────────
function NoteCell({ value, disabled, onCommit }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const commit = () => {
    const v = validateGrade(local, APC_MAX);
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
      className={`w-16 text-center rounded border border-gray-200 px-1 py-1 text-sm
        focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300
        disabled:bg-gray-50 disabled:text-gray-400 placeholder:text-gray-300
        ${gradeColor(local, APC_MAX, 'FR')}`}
    />
  );
}

// ── Cellule appréciation (texte libre — « Appréciations et Visa de l'enseignant »)
function ApprCell({ value, disabled, onCommit }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const commit = () => { if (local !== (value ?? '')) onCommit(local); };
  return (
    <input
      type="text"
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      placeholder="—"
      className="w-44 rounded border border-gray-200 px-2 py-1 text-sm
        focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300
        disabled:bg-gray-50 placeholder:text-gray-300"
    />
  );
}

export default function ApcCompetenceWorkspace() {
  const t = useT();
  const school   = useAuthStore((s) => s.school);
  const schoolId = school?.id;

  const classes        = useSchoolStore((s) => s.classes);
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
  const [view, setView] = useState('notes'); // 'notes' | 'appreciations'

  useEffect(() => { loadApc(); }, [loadApc]);

  const SEQUENCES = [1, 2, 3, 4, 5, 6];
  const sequenceId = `s${sequence}`;
  const trimestreId = trimestreOfSequence(referentiel?.sequences, sequenceId);

  // Classe sélectionnée + slug référentiel
  const sortedClasses = useMemo(
    () => [...classes].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })),
    [classes],
  );
  useEffect(() => {
    if (!classId && sortedClasses.length) setClassId(sortedClasses[0].id);
  }, [sortedClasses, classId]);

  const selectedClass = sortedClasses.find((c) => c.id === classId) || null;
  const classeSlug = selectedClass ? firstCycleClasseSlug(selectedClass.level, selectedClass.name) : null;

  // Matières du référentiel ayant au moins une compétence pour (classe, trimestre),
  // avec leur coefficient officiel POUR cette classe (Français = 6 en 6e/5e, 4 en 4e/3e).
  const matieres = useMemo(() => {
    if (!referentiel || !classeSlug || !trimestreId) return [];
    return referentiel.matieres
      .map((m) => ({
        ...m,
        coef: coefFor(referentiel.classeMatieres, classeSlug, m),
        nbComp: competencesFor(referentiel.competences, { classeId: classeSlug, trimestreId, matiereId: m.id }).length,
      }))
      .filter((m) => m.nbComp > 0)
      .sort((a, b) => {
        const oa = (referentiel.classeMatieres || []).find((r) => r.classe_id === classeSlug && r.matiere_id === a.id)?.ordre ?? a.ordre ?? 0;
        const ob = (referentiel.classeMatieres || []).find((r) => r.classe_id === classeSlug && r.matiere_id === b.id)?.ordre ?? b.ordre ?? 0;
        return oa - ob;
      });
  }, [referentiel, classeSlug, trimestreId]);

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
  const saveCell = (eleveId, competenceId, patch) => {
    const rec = recordFor(eleveId, competenceId);
    saveApcNote({
      eleveId, competenceId, sequenceId,
      note: 'note' in patch ? patch.note : (rec?.note ?? ''),
      appreciation: 'appreciation' in patch ? patch.appreciation : (rec?.appreciation ?? ''),
    });
  };

  // Moyenne matière d'un élève (sur les compétences de la séquence).
  const studentAvg = (eleveId) => {
    const notes = {};
    for (const c of competences) {
      const r = recordFor(eleveId, c.id);
      if (r && r.note != null && r.note !== '') notes[c.id] = r.note;
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
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Classe', 'Class')}</span>
          {renderClassPicker()}
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Séquence', 'Sequence')}</span>
          <select value={sequence} onChange={(e) => setSequence(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {SEQUENCES.map((n) => <option key={n} value={n}>{t('Séquence', 'Sequence')} {n}</option>)}
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
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button onClick={() => setView('notes')}
              className={`px-3 py-2 ${view === 'notes' ? 'bg-brand-500 text-white' : 'bg-white text-gray-600'}`}>
              {t('Notes', 'Marks')}
            </button>
            <button onClick={() => setView('appreciations')}
              className={`px-3 py-2 ${view === 'appreciations' ? 'bg-brand-500 text-white' : 'bg-white text-gray-600'}`}>
              {t('Appréciations', 'Appreciations')}
            </button>
          </div>
        </div>
      </div>

      {/* Bandeau trimestre / héritage */}
      <div className="text-xs text-gray-500">
        {t('Trimestre', 'Term')} {trimestreId?.replace('t', '')} · {t('Coef matière', 'Subject coef')} {matiereCoef} · {' '}
        {t('compétences héritées par les deux séquences du trimestre', 'competencies shared by both sequences of the term')}
        {locked && <span className="ml-2 text-amber-600 font-medium">· {t('Séquence verrouillée (lecture seule)', 'Sequence locked (read-only)')}</span>}
      </div>

      {matieres.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t(
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
                    <span className="block text-[11px] text-gray-400">{t('Comp.', 'Comp.')} {c.ordre}</span>
                    <span className="block truncate">{c.intitule}</span>
                  </th>
                ))}
                {view === 'notes' && (
                  <>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">{t('M/20', 'M/20')}</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">{t('Cote', 'Grade')}</th>
                  </>
                )}
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
                        {view === 'notes' ? (
                          <NoteCell value={rec?.note != null ? String(rec.note) : ''} disabled={locked}
                            onCommit={(v) => saveCell(stu.id, c.id, { note: v })} />
                        ) : (
                          <ApprCell value={rec?.appreciation || ''} disabled={locked}
                            onCommit={(v) => saveCell(stu.id, c.id, { appreciation: v })} />
                        )}
                      </td>
                    );
                  })}
                  {view === 'notes' && (() => {
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
