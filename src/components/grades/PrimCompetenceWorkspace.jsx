// Écran de saisie PRIMAIRE APC (moteur MINEDUB — compétences nationales).
//
// L'enseignant choisit Classe + Trimestre + Critère (Oral/Écrit/Pratique/Savoir-
// être). Le système charge AUTOMATIQUEMENT les 11 compétences nationales (non
// modifiables) du niveau. Pour chaque élève × compétence, on saisit une NOTE /10.
// La moyenne (tous critères) et la COTE (A+/A/ECA/NA) sont calculées et affichées.
//
// Monté par Grades.jsx quand la classe est résolue 'apc_primaire'.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useT } from '../../lib/i18n';
import { validateGrade, gradeColor } from '../../lib/gradeEntry';
import { gradeEntryMode } from '../../lib/useCountry';
import { primNkey } from '../../lib/primService';
import { resolveClassEngine, primaireNiveauSlug } from '../../core/engineResolver';
import { competencesForNiveau, competenceAverage, primCote, PRIM_COTE_DEFAULT } from '../../core/primEngine';
import SectionSelect from './SectionSelect';

const PRIM_MAX = 10; // barème officiel de saisie du primaire APC (/10)

// ── Cellule note /10 ────────────────────────────────────────────────────────────
function NoteCell({ value, onCommit }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const commit = () => {
    const v = validateGrade(local, PRIM_MAX);
    if (v === null) { setLocal(value ?? ''); return; }
    if (v !== (value ?? '')) onCommit(v);
  };
  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      placeholder="—"
      className={`w-16 text-center rounded border border-gray-200 px-1 py-1 text-sm
        focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300
        placeholder:text-gray-300 ${gradeColor(local, PRIM_MAX, 'ES')}`}
    />
  );
}

export default function PrimCompetenceWorkspace() {
  const t = useT();
  const navigate = useNavigate();
  const school = useAuthStore((s) => s.school);
  const role      = useAuthStore((s) => s.role);
  const teacherId = useAuthStore((s) => s.teacherId);
  // Mode 1 « enseignant de matière » : l'enseignant ne saisit QUE les compétences
  // qui lui sont affectées (via la matière matérialisée `prim_competence_id`).
  const isSubjectTeacher = role === 'teacher' && gradeEntryMode(school) === 'subject';

  const classes     = useSchoolStore((s) => s.classes);
  const subjects    = useSchoolStore((s) => s.subjects);
  const students    = useSchoolStore((s) => s.students);
  const referentiel = useSchoolStore((s) => s.primReferentiel);
  const primNotes   = useSchoolStore((s) => s.primNotes);
  const loadPrim    = useSchoolStore((s) => s.loadPrim);
  const savePrimNote = useSchoolStore((s) => s.savePrimNote);

  const classId    = useUiStore((s) => s.gradesClassId);
  const setClassId = useUiStore((s) => s.setGradesClassId);
  const [trimestre, setTrimestre] = useState(1);
  const [critereId, setCritereId] = useState('');

  useEffect(() => { loadPrim(); }, [loadPrim]);

  const trimestreId = `t${trimestre}`;
  const criteres = useMemo(
    () => (referentiel?.criteres || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)),
    [referentiel],
  );
  const bareme = referentiel?.bareme?.length ? referentiel.bareme : PRIM_COTE_DEFAULT;

  useEffect(() => {
    if (criteres.length && !criteres.some((c) => c.id === critereId)) setCritereId(criteres[0].id);
  }, [criteres, critereId]);

  // Classes primaire APC. En Mode 1, on restreint aux classes où l'enseignant a
  // au moins une compétence affectée.
  const primClasses = useMemo(() => {
    let list = classes.filter((c) => resolveClassEngine(school, c) === 'apc_primaire');
    if (isSubjectTeacher) {
      const ids = new Set(subjects.filter((s) => s.teacher_id === teacherId && s.prim_competence_id).map((s) => s.class_id));
      list = list.filter((c) => ids.has(c.id));
    }
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
  }, [classes, school, isSubjectTeacher, subjects, teacherId]);
  useEffect(() => {
    if (primClasses.length && !primClasses.some((c) => c.id === classId)) setClassId(primClasses[0].id);
  }, [primClasses, classId]);

  const selectedClass = primClasses.find((c) => c.id === classId) || null;
  const niveauSlug = selectedClass ? primaireNiveauSlug(selectedClass.level, selectedClass.name) : null;

  const competences = useMemo(() => {
    if (!referentiel || !niveauSlug) return [];
    const all = competencesForNiveau(referentiel, niveauSlug);
    if (!isSubjectTeacher) return all;
    // Mode 1 : ne garder que les compétences affectées à l'enseignant sur cette classe.
    const mine = new Set(
      subjects.filter((s) => s.class_id === classId && s.teacher_id === teacherId && s.prim_competence_id)
        .map((s) => s.prim_competence_id),
    );
    return all.filter((c) => mine.has(c.id));
  }, [referentiel, niveauSlug, isSubjectTeacher, subjects, classId, teacherId]);

  const classStudents = useMemo(
    () => students.filter((s) => s.class_id === classId).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [students, classId],
  );

  // Note d'une cellule (compétence × critère courant) ; moyenne compétence (tous critères).
  const noteFor = (eleveId, competenceId) => {
    const r = primNotes[primNkey(eleveId, competenceId, critereId, trimestreId)];
    return r?.note != null ? String(r.note) : '';
  };
  const notesByCritere = (eleveId, competenceId) => {
    const out = {};
    for (const cr of criteres) {
      const r = primNotes[primNkey(eleveId, competenceId, cr.id, trimestreId)];
      if (r?.note != null && r.note !== '') out[cr.id] = r.note;
    }
    return out;
  };
  const competenceAvg = (eleveId, competenceId) => competenceAverage(notesByCritere(eleveId, competenceId), criteres);

  function renderClassPicker() {
    return (
      <select value={classId || ''} onChange={(e) => setClassId(e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
        {primClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    );
  }

  const BackBtn = (
    <button type="button" onClick={() => navigate(-1)}
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 mb-2">
      ← {t('Retour', 'Back')}
    </button>
  );

  if (!referentiel) {
    return <div className="p-4 md:p-6"><div>{BackBtn}</div><div className="p-8 text-center text-gray-500">{t('Chargement du référentiel primaire APC…', 'Loading primary APC framework…')}</div></div>;
  }
  if (!primClasses.length) {
    return <div className="p-4 md:p-6"><div>{BackBtn}</div><div className="p-8 text-center text-gray-500">{t('Aucune classe primaire (SIL–CM2).', 'No primary class (SIL–CM2).')}</div></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        {BackBtn}
        <h1 className="text-xl font-bold text-gray-800">{t('Saisie primaire APC (par compétences)', 'Primary APC entry (by competencies)')}</h1>
        <p className="text-sm text-gray-500">
          {t('Compétences nationales MINEDUB — chargées automatiquement. Saisie /10 par critère ; cote calculée.',
             'National MINEDUB competencies — loaded automatically. Entry /10 per criterion; grade computed.')}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SectionSelect classes={classes} classId={classId} setClassId={setClassId} />
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Classe', 'Class')}</span>
          {renderClassPicker()}
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Trimestre', 'Term')}</span>
          <select value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {[1, 2, 3].map((n) => <option key={n} value={n}>{t('Trimestre', 'Term')} {n}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Critère', 'Criterion')}</span>
          <select value={critereId} onChange={(e) => setCritereId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[10rem]">
            {criteres.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </label>
      </div>

      <div className="text-xs text-gray-500">
        {t('Barème /10 · la note saisie porte sur le critère choisi · la moyenne agrège tous les critères du trimestre.',
           'Scale /10 · the entered mark applies to the chosen criterion · the average aggregates all criteria of the term.')}
      </div>

      {!niveauSlug ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Niveau non reconnu (attendu SIL–CM2).', 'Level not recognized (expected SIL–CM2).')}
        </div>
      ) : competences.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Aucune compétence nationale chargée. Exécutez la migration du référentiel.',
             'No national competency loaded. Run the framework migration.')}
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
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-600">{t('Élève', 'Student')}</th>
                {competences.map((c) => (
                  <th key={c.id} className="px-3 py-2 text-left font-medium text-gray-600 max-w-[14rem]" title={c.intitule}>
                    <span className="block text-[11px] text-gray-400">{c.code}</span>
                    <span className="block truncate">{c.intitule}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classStudents.map((stu) => (
                <tr key={stu.id} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">{stu.name}</td>
                  {competences.map((c) => {
                    const avg = competenceAvg(stu.id, c.id);
                    const cote = primCote(avg, PRIM_MAX, bareme);
                    return (
                      <td key={c.id} className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <NoteCell value={noteFor(stu.id, c.id)}
                            onCommit={(v) => savePrimNote({ eleveId: stu.id, competenceId: c.id, critereId, trimestreId, note: v })} />
                          <span className="text-[11px] text-gray-400 whitespace-nowrap">
                            {avg != null ? `${avg} · ` : ''}{cote ? cote.cote : '—'}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
