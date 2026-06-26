import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useT, localeForLang } from '../../lib/i18n';
import { useCountry, geGradeMax } from '../../lib/useCountry';
import { downloadCSV } from '../../lib/exportCsv';
import { isSequenceLocked, getLockInfo } from '../../lib/lockService';
import GradeGrid from './GradeGrid';
import GradeImportPanel from './GradeImportPanel';

// Ordre pédagogique des classes pour le rail (maternelle → Terminale, FR + EN).
// Heuristique sur le nom : tout nom non reconnu retombe après, trié par libellé.
function classRank(name = '') {
  const n = name.toLowerCase().replace(/\s+/g, '');
  const table = [
    [/petitesection|ps\b/, 1], [/moyennesection|ms\b/, 2], [/grandesection|gs\b/, 3], [/maternelle/, 4],
    [/\bsil\b/, 10], [/\bcp\b/, 11], [/ce1/, 12], [/ce2/, 13], [/cm1/, 14], [/cm2/, 15],
    [/6e|6è|sixi/, 20], [/5e|5è|cinqu/, 21], [/4e|4è|quatr/, 22], [/3e|3è|troisi/, 23],
    [/2nd|2de|seconde/, 24], [/1è|1re|1ere|premi/, 25], [/tle|tale|terminale|term/, 26],
    [/form1/, 30], [/form2/, 31], [/form3/, 32], [/form4/, 33], [/form5/, 34],
    [/lowersixth|l6/, 35], [/uppersixth|u6/, 36],
  ];
  for (const [re, rank] of table) if (re.test(n)) return rank;
  return 99;
}

const TERMS_EN  = [{ value: 1, label: 'Term 1' }, { value: 2, label: 'Term 2' }, { value: 3, label: 'Term 3' }];

export default function SubjectTeacherWorkspace() {
  const t = useT();
  const country = useCountry();
  const isGE = country.code === 'guinea_eq';

  const classes   = useSchoolStore((s) => s.classes);
  const subjects  = useSchoolStore((s) => s.subjects);
  const students  = useSchoolStore((s) => s.students);
  const gradeMap  = useSchoolStore((s) => s.gradeMap);
  const saveGrade = useSchoolStore((s) => s.saveGrade);

  const school    = useAuthStore((s) => s.school);
  const teacherId = useAuthStore((s) => s.teacherId);
  const schoolId  = school?.id;
  const geMax     = geGradeMax(school);

  const classId   = useUiStore((s) => s.gradesClassId);
  const setClassId = useUiStore((s) => s.setGradesClassId);
  const sequence  = useUiStore((s) => s.gradesSequence);
  const setSequence = useUiStore((s) => s.setGradesSequence);
  const subjectId = useUiStore((s) => s.gradesSubjectId);
  const setSubjectId = useUiStore((s) => s.setGradesSubjectId);

  const [showImport, setShowImport] = useState(false);

  // ── Plein écran focalisé : on replie le menu global pendant la durée de
  //    l'écran (sans toucher la préférence persistée de l'utilisateur). ──────
  useEffect(() => {
    const ui = useUiStore.getState();
    const prev = ui.sidebarHidden;
    ui.setSidebarHidden(true);
    return () => useUiStore.getState().setSidebarHidden(prev);
  }, []);

  // Classes où l'enseignant a une matière affectée (le titulaire ne compte PAS).
  const teacherClasses = useMemo(() => {
    const ids = new Set(subjects.filter((s) => s.teacher_id === teacherId).map((s) => s.class_id));
    return classes
      .filter((c) => ids.has(c.id))
      .sort((a, b) => classRank(a.name) - classRank(b.name) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [subjects, classes, teacherId]);

  // Sélection par défaut de la classe (1re du rail).
  useEffect(() => {
    if (teacherClasses.length === 0) return;
    if (!classId || !teacherClasses.some((c) => c.id === classId)) {
      setClassId(teacherClasses[0].id);
    }
  }, [teacherClasses, classId, setClassId]);

  const selectedClass = teacherClasses.find((c) => c.id === classId) || null;
  const sys   = selectedClass?.system || 'FR';
  const cycle = selectedClass?.cycle || 'secondaire';
  const isEN  = sys === 'EN';

  // Matières de cet enseignant DANS la classe sélectionnée (souvent une seule).
  const mySubjects = useMemo(() => {
    const inClass = subjects.filter((s) => s.class_id === classId);
    // Matières composites : on saisit les feuilles, pas les parents (calculés).
    const parentIds = new Set(inClass.filter((s) => s.parent_id).map((s) => s.parent_id));
    return inClass
      .filter((s) => s.teacher_id === teacherId && !parentIds.has(s.id))
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.name.localeCompare(b.name));
  }, [subjects, classId, teacherId]);
  const currentSubject = mySubjects.find((s) => s.id === subjectId) || mySubjects[0] || null;

  useEffect(() => {
    if (mySubjects.length && (!subjectId || !mySubjects.some((s) => s.id === subjectId))) {
      setSubjectId(mySubjects[0].id);
    }
  }, [mySubjects, subjectId, setSubjectId]);

  const classStudents = useMemo(() =>
    students.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name)),
    [students, classId]
  );

  // Périodes selon le contexte (mêmes règles que l'écran admin).
  const periods = useMemo(() => {
    if (isGE) return [
      { value: 1, label: 'Primer Trimestre' }, { value: 2, label: 'Segundo Trimestre' }, { value: 3, label: 'Tercer Trimestre' },
    ];
    if (cycle === 'maternelle' || cycle === 'primaire') return [
      { value: 1, label: t('Trimestre 1', 'Quarter 1') }, { value: 2, label: t('Trimestre 2', 'Quarter 2') }, { value: 3, label: t('Trimestre 3', 'Quarter 3') },
    ];
    if (isEN) return TERMS_EN;
    return [1, 2, 3, 4, 5, 6].map((v) => ({ value: v, label: t(`Séquence ${v}`, `Sequence ${v}`) }));
  }, [isGE, cycle, isEN, t]);

  const periodLabel = isGE ? t('Trimestre', 'Quarter')
    : (cycle === 'maternelle' || cycle === 'primaire') ? t('Trimestre', 'Quarter')
    : isEN ? 'Term' : t('Séquence', 'Sequence');

  // Verrou de séquence (admin) — lecture seule côté enseignant.
  const locked = classId && schoolId ? isSequenceLocked(schoolId, classId, sequence) : false;
  const lockInfo = classId && schoolId ? getLockInfo(schoolId, 'seq', classId, sequence) : null;

  const scoresFor = useCallback(
    (studentId) => (gradeMap[`${classId}_${studentId}_${sequence}`] || {})[currentSubject?.id],
    [gradeMap, classId, sequence, currentSubject]
  );

  const handleCommit = useCallback(async (studentId, value) => {
    if (locked || !currentSubject) return;
    // Garde-fou : on n'écrit QUE la matière affichée (matière de l'enseignant).
    await saveGrade(classId, studentId, sequence, { [currentSubject.id]: value });
  }, [locked, currentSubject, saveGrade, classId, sequence]);

  // Progression de saisie de la matière courante.
  const progress = useMemo(() => {
    if (!currentSubject) return { entered: 0, total: 0 };
    let entered = 0;
    classStudents.forEach((s) => {
      const v = (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[currentSubject.id];
      if (v !== undefined && v !== '' && v !== null) entered++;
    });
    return { entered, total: classStudents.length };
  }, [currentSubject, classStudents, gradeMap, classId, sequence]);
  const pct = progress.total ? Math.round((progress.entered / progress.total) * 100) : 0;

  const handleExport = () => {
    if (!currentSubject || !classStudents.length) return;
    const seqLabel = periods.find((p) => p.value === sequence)?.label || `Seq${sequence}`;
    const header = [t('Matricule', 'ID'), t('Élève', 'Student'), `${currentSubject.name} /${currentSubject.max}`];
    const rows = [header, ...classStudents.map((s) => [
      s.matricule || '', s.name, (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[currentSubject.id] ?? '',
    ])];
    downloadCSV(`notes_${currentSubject.name}_${selectedClass?.name || ''}_${seqLabel}.csv`, rows);
  };

  // ── Rail des classes (réutilisé desktop + mobile) ──────────────────────────
  const ClassRailItems = ({ onPick }) => (
    <>
      {teacherClasses.map((c) => {
        const active = c.id === classId;
        return (
          <button
            key={c.id}
            onClick={() => { setClassId(c.id); onPick?.(); }}
            className={`shrink-0 md:w-full text-left rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors border ${
              active
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : 'bg-white md:bg-transparent text-gray-600 border-gray-200 md:border-transparent hover:bg-brand-50 hover:text-brand-700'
            }`}
          >
            {c.name}
          </button>
        );
      })}
    </>
  );

  return (
    <div className="flex h-full">
      {/* Rail des classes — menu latéral (desktop / tablette) */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 border-r border-gray-100 bg-gray-50/60 h-full overflow-y-auto">
        <div className="px-4 pt-5 pb-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{t('Mes classes', 'My classes', 'Mis clases')}</p>
        </div>
        <div className="flex flex-col gap-1 px-3 pb-6">
          {teacherClasses.length === 0
            ? <p className="text-xs text-gray-400 px-1 py-4">{t('Aucune classe attribuée.', 'No class assigned.', 'Sin clase.')}</p>
            : <ClassRailItems />}
        </div>
      </aside>

      {/* Zone centrale */}
      <main className="flex-1 min-w-0 h-full overflow-y-auto">
        <div className="px-4 md:px-8 py-5 md:py-7 max-w-5xl mx-auto">

          {/* Rail mobile — barre horizontale scrollable */}
          <div className="md:hidden -mx-4 px-4 mb-4 overflow-x-auto">
            <div className="flex gap-2 w-max">
              <ClassRailItems />
            </div>
          </div>

          {!currentSubject ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="text-4xl mb-3">📚</div>
              <p className="text-gray-500 text-sm">
                {teacherClasses.length === 0
                  ? t("Aucune matière ne vous est attribuée. Contactez l'administration.", 'No subject is assigned to you. Contact the administration.', 'No tiene asignaturas asignadas.')
                  : t('Sélectionnez une classe.', 'Select a class.', 'Seleccione una clase.')}
              </p>
            </div>
          ) : (
            <>
              {/* En-tête : titre matière + sélecteurs + actions */}
              <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <div className="min-w-0">
                  <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-gray-900 uppercase truncate">
                    {currentSubject.name}
                  </h1>
                  <p className="text-sm text-gray-400 mt-1">
                    {selectedClass?.name} · {classStudents.length} {classStudents.length !== 1 ? t('élèves', 'students') : t('élève', 'student')} · /{currentSubject.max}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 no-print">
                  <button onClick={() => setShowImport((v) => !v)} className="btn-secondary">{t('Importer', 'Import', 'Importar')}</button>
                  <button onClick={handleExport} className="btn-secondary">{t('Exporter', 'Export', 'Exportar')}</button>
                </div>
              </div>

              {/* Sélecteurs : (matière si plusieurs) · séquence/période */}
              <div className="flex flex-wrap gap-3 mb-5">
                {mySubjects.length > 1 && (
                  <div className="w-full sm:w-auto sm:min-w-[200px]">
                    <label className="form-label">{t('Matière', 'Subject', 'Asignatura')}</label>
                    <select className="form-input" value={currentSubject.id} onChange={(e) => setSubjectId(e.target.value)}>
                      {mySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="w-full sm:w-auto sm:min-w-[200px]">
                  <label className="form-label">{periodLabel}</label>
                  <select className="form-input" value={sequence} onChange={(e) => setSequence(Number(e.target.value))}>
                    {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Progression */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-gray-600">{t('Progression', 'Progress', 'Progreso')} — {pct}%</span>
                  <span className="text-gray-400">{progress.entered}/{progress.total} {t('saisis', 'entered', 'capturadas')}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-brand-500' : 'bg-gray-200'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* Bandeau verrouillage (lecture seule pour l'enseignant) */}
              {locked && (
                <div className="flex items-center gap-2 mb-4 p-3 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-800 text-sm">
                  <span className="text-lg">🔒</span>
                  <div>
                    <div className="font-semibold">{t('Notes validées — saisie verrouillée', 'Grades validated — entry locked', 'Notas validadas — bloqueado')}</div>
                    {lockInfo?.by && (
                      <div className="text-xs opacity-80">
                        {t('Verrouillé par', 'Locked by', 'Bloqueado por')} {lockInfo.by} — {new Date(lockInfo.at).toLocaleDateString(localeForLang())}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {showImport && (
                <div className="mb-5">
                  <GradeImportPanel
                    classStudents={classStudents}
                    classSubjects={mySubjects}
                    classId={classId}
                    sequence={sequence}
                    sys={sys}
                    saveGrade={saveGrade}
                    onClose={() => setShowImport(false)}
                  />
                </div>
              )}

              {/* Tableau de saisie */}
              <GradeGrid
                students={classStudents}
                subject={currentSubject}
                sys={sys}
                gradeScale={school?.grade_scale}
                maxScale={geMax}
                scoresFor={scoresFor}
                onCommit={handleCommit}
                locked={locked}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
