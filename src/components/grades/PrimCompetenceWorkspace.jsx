// Écran de saisie PRIMAIRE APC (moteur MINEDUB — compétences nationales).
//
// L'enseignant choisit Classe + Unité d'Apprentissage (UA 1-8/an) + Compétence
// (parmi les 11 nationales, chargées automatiquement). La grille affiche alors UN
// ÉLÈVE PAR LIGNE et UNE COLONNE PAR CRITÈRE applicable à cette compétence (barème
// officiel : chaque sous-compétence a son propre total de points par critère —
// ex. 1A = Oral/20 + Écrit/15 + Savoir-être/5). Le TOTAL et la COTE (A+/A/ECA/NA)
// sont calculés et affichés par élève.
//
// Cas particulier '6a' (activités physiques/sportives) : le barème dépend de
// l'aptitude sportive de l'élève (students.sport_aptitude) — la colonne "Pratique"
// est grisée pour un élève inapte (son barème n'en a pas).
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
import {
  competencesForNiveau, criteresForCompetence, competencePointsTotal, primCote,
  trimestreOfUA, PRIM_COTE_DEFAULT,
} from '../../core/primEngine';
import SectionSelect from './SectionSelect';
import CompetenceGradeIO from './CompetenceGradeIO';

// ── Cellule note (bornée au barème /points_max du critère) ─────────────────────
function NoteCell({ value, max, disabled, onCommit }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const commit = () => {
    const v = validateGrade(local, max);
    if (v === null) { setLocal(value ?? ''); return; }
    if (v !== (value ?? '')) onCommit(v);
  };
  if (disabled) {
    return <input type="text" value="—" disabled className="w-16 text-center rounded border border-gray-100 px-1 py-1 text-sm text-gray-300 bg-gray-50" />;
  }
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
        placeholder:text-gray-300 ${gradeColor(local, max, 'ES')}`}
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
  const [ua, setUa] = useState(1);
  const [competenceId, setCompetenceId] = useState('');

  useEffect(() => { loadPrim(); }, [loadPrim]);

  const bareme = referentiel?.bareme?.length ? referentiel.bareme : PRIM_COTE_DEFAULT;

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

  useEffect(() => {
    if (competences.length && !competences.some((c) => c.id === competenceId)) setCompetenceId(competences[0].id);
  }, [competences, competenceId]);

  const classStudents = useMemo(
    () => students.filter((s) => s.class_id === classId).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [students, classId],
  );

  // Colonnes de critères pour la compétence sélectionnée. Pour '6a' (sport), le
  // barème dépend de l'aptitude — on affiche l'UNION apte/inapte (la colonne
  // "Pratique" sera grisée ligne par ligne pour un élève inapte, cf. criteresForStudent).
  const criteresApte   = niveauSlug ? criteresForCompetence(referentiel, niveauSlug, competenceId, 'apte')   : [];
  const criteresInapte = niveauSlug ? criteresForCompetence(referentiel, niveauSlug, competenceId, 'inapte') : [];
  const criteres = useMemo(() => {
    if (competenceId !== '6a') return criteresApte;
    const byId = new Map(criteresApte.map((c) => [c.id, c]));
    for (const c of criteresInapte) if (!byId.has(c.id)) byId.set(c.id, c);
    return [...byId.values()].sort((a, b) => a.ordre - b.ordre);
  }, [competenceId, criteresApte, criteresInapte]);
  // Barème réellement applicable à UN élève (dépend de son aptitude pour '6a').
  const criteresForStudent = (stu) =>
    competenceId === '6a' ? (stu.sport_aptitude === 'inapte' ? criteresInapte : criteresApte) : criteresApte;

  // Note d'une cellule (compétence × critère × UA courante).
  const noteFor = (eleveId, critereId) => {
    const r = primNotes[primNkey(eleveId, competenceId, critereId, ua)];
    return r?.note != null ? String(r.note) : '';
  };
  const notesByCritereFor = (eleveId) => {
    const out = {};
    for (const cr of criteres) {
      const r = primNotes[primNkey(eleveId, competenceId, cr.id, ua)];
      if (r?.note != null && r.note !== '') out[cr.id] = r.note;
    }
    return out;
  };
  const competenceTotal = (stu) => competencePointsTotal(notesByCritereFor(stu.id), criteresForStudent(stu));

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
          {t('Compétences nationales MINEDUB — chargées automatiquement. Saisie par Unité d’Apprentissage (UA) ; barème et cote calculés.',
             'National MINEDUB competencies — loaded automatically. Entry per Learning Unit (UA); scale and grade computed.')}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SectionSelect classes={classes} classId={classId} setClassId={setClassId} />
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Classe', 'Class')}</span>
          {renderClassPicker()}
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Unité d’apprentissage', 'Learning unit')}</span>
          <select value={ua} onChange={(e) => setUa(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>UA{n} ({t('Trim.', 'Term')} {trimestreOfUA(n)})</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">{t('Compétence', 'Competency')}</span>
          <select value={competenceId} onChange={(e) => setCompetenceId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[16rem]">
            {competences.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.intitule}</option>)}
          </select>
        </label>
      </div>

      <div className="text-xs text-gray-500">
        {t('Barème officiel par critère (points) — variable selon la compétence · le total et la cote se calculent sur les critères déjà saisis.',
           'Official per-criterion scale (points) — varies by competency · total and grade are computed from criteria already entered.')}
      </div>

      {niveauSlug && criteres.length > 0 && classStudents.length > 0 && (
        <CompetenceGradeIO
          filename={`notes_primaire_${selectedClass?.name || ''}_${(competences.find((c) => c.id === competenceId)?.code || 'competence')}_UA${ua}`}
          sheetName={`UA${ua}`}
          students={classStudents}
          columns={criteres.map((c) => ({ id: c.id, label: `${c.nom} /${c.points_max}` }))}
          getCell={(sid, cid) => noteFor(sid, cid)}
          normalize={(raw, cid) => validateGrade(raw, criteres.find((c) => c.id === cid)?.points_max ?? 20)}
          onImport={(sid, cid, v) => savePrimNote({ eleveId: sid, competenceId, critereId: cid, ua, note: v })}
          valueHint={t('barème variable par critère (voir en-tête)', 'scale varies by criterion (see header)')}
        />
      )}

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
      ) : criteres.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
          {t('Barème non chargé pour cette compétence à ce niveau.', 'Scale not loaded for this competency at this level.')}
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium text-gray-600">{t('Élève', 'Student')}</th>
                {criteres.map((c) => (
                  <th key={c.id} className="px-3 py-2 text-left font-medium text-gray-600">
                    <span className="block truncate">{c.nom}</span>
                    <span className="block text-[11px] text-gray-400">/{c.points_max}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('Total · Cote', 'Total · Grade')}</th>
              </tr>
            </thead>
            <tbody>
              {classStudents.map((stu) => {
                const studentCriteres = criteresForStudent(stu);
                const studentCritereIds = new Set(studentCriteres.map((c) => c.id));
                const { achieved, possible } = competenceTotal(stu);
                const cote = achieved != null ? primCote(achieved, possible, bareme) : null;
                return (
                  <tr key={stu.id} className="border-t border-gray-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">
                      {stu.name}
                      {competenceId === '6a' && stu.sport_aptitude === 'inapte' && (
                        <span className="ml-1.5 text-[10px] text-amber-600 font-normal">({t('inapte', 'unfit')})</span>
                      )}
                    </td>
                    {criteres.map((c) => (
                      <td key={c.id} className="px-3 py-1.5">
                        <NoteCell
                          value={noteFor(stu.id, c.id)}
                          max={c.points_max}
                          disabled={!studentCritereIds.has(c.id)}
                          onCommit={(v) => savePrimNote({ eleveId: stu.id, competenceId, critereId: c.id, ua, note: v })}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-[11px] text-gray-500 whitespace-nowrap">
                      {achieved != null ? `${achieved}/${possible} · ` : '—'}{cote ? cote.cote : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
