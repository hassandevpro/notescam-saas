// ── Filtres contextuels (Section 4) ──────────────────────────────────────────
// Le jeu de filtres s'adapte au type de relevé : classe / niveau / élève +
// recherche instantanée. L'année active est affichée en pastille (modèle global
// de l'app ; l'historique est couvert par le mode multi-années).
export default function TranscriptFilters({
  mode, levels = [], level, onLevelChange,
  classOptions = [], classId, onClassChange,
  studentOptions = [], studentId, onStudentChange,
  search, onSearch, year, t,
}) {
  const needsClass   = mode === 'single' || mode === 'class' || mode === 'multi';
  const needsStudent = mode === 'single' || mode === 'multi';
  const needsLevel   = mode === 'level';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-4">
        {needsLevel && (
          <div>
            <label className="form-label">{t('Niveau', 'Level', 'Nivel')}</label>
            <select className="form-input" value={level} onChange={(e) => onLevelChange(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">{t('— Choisir un niveau —', '— Select a level —', '— Elegir nivel —')}</option>
              {levels.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
            </select>
          </div>
        )}

        {needsClass && (
          <div>
            <label className="form-label">{t('Classe', 'Class', 'Clase')}</label>
            <select className="form-input" value={classId} onChange={(e) => onClassChange(e.target.value)} style={{ minWidth: 200 }}>
              <option value="">{t('— Choisir une classe —', '— Select a class —', '— Elegir clase —')}</option>
              {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {needsStudent && (
          <>
            <div className="flex-1 min-w-[180px]">
              <label className="form-label">{t('Recherche instantanée', 'Instant search', 'Búsqueda')}</label>
              <input
                type="search"
                className="form-input"
                placeholder={t('Nom de l’élève…', 'Student name…', 'Nombre del alumno…')}
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                disabled={!classId}
              />
            </div>
            <div>
              <label className="form-label">{t('Élève', 'Student', 'Alumno')}</label>
              <select className="form-input" value={studentId} onChange={(e) => onStudentChange(e.target.value)} style={{ minWidth: 220 }} disabled={!classId}>
                <option value="">{t('— Choisir un élève —', '— Select a student —', '— Elegir alumno —')}</option>
                {studentOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </>
        )}

        {mode === 'all' && (
          <p className="text-sm text-slate-500 py-2">
            {t('Tout l’établissement — aucun filtre requis.', 'Whole school — no filter required.', 'Todo el centro — sin filtros.')}
          </p>
        )}

        <div className="ml-auto self-center">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
            📅 {t('Année', 'Year', 'Año')} {year || '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
