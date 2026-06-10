import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { getAvg } from '../core/bulletinEngine';
import { downloadCSV, parseGradesCSV } from '../lib/exportCsv';
import Layout from '../components/Layout';
import { useT, localeForLang } from '../lib/i18n';
import { isSequenceLocked, lockSequence, unlockSequence, getLockInfo } from '../lib/lockService';
import { useCountry, gradingOpts, geGradeMax } from '../lib/useCountry';

const TERMS_EN = [
  { value: 1, label: 'Term 1' },
  { value: 2, label: 'Term 2' },
  { value: 3, label: 'Term 3' },
];

const COMPETENCES  = ['A', 'EA', 'NA'];
const COMP_COLORS  = { A: '#059669', EA: '#d97706', NA: '#dc2626' };

const CONDUITES       = ['TB', 'B', 'AB', 'P', 'M'];
const CONDUITE_COLORS = { TB: '#7c3aed', B: '#059669', AB: '#0284c7', P: '#d97706', M: '#dc2626' };

function validateGrade(raw, max) {
  const v = String(raw).trim().toUpperCase();
  if (v === '' || v === '-') return '';
  if (v === 'ABS') return 'ABS';
  const n = parseFloat(v.replace(',', '.'));
  if (isNaN(n) || n < 0 || n > max) return null;
  return String(Math.round(n * 100) / 100);
}

function gradeColor(val, max, sys) {
  if (!val || val === '') return 'text-gray-300';
  if (val === 'ABS') return 'text-gray-400 italic';
  const n = parseFloat(val);
  // Seuil de réussite : ES = 5/10, FR = 10/20, EN = 50/100.
  const pass =
    sys === 'ES' ? (5 / 10) * max
    : sys === 'FR' ? (10 / 20) * max
    : 50;
  return n >= pass ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold';
}

// ── GradeCell ─────────────────────────────────────────────────────────────────
function GradeCell({ initialValue, max, sys, onCommit }) {
  const [local, setLocal] = useState(initialValue ?? '');
  useEffect(() => { setLocal(initialValue ?? ''); }, [initialValue]);

  const handleBlur = () => {
    const validated = validateGrade(local, max);
    if (validated === null) { setLocal(initialValue ?? ''); return; }
    if (validated !== (initialValue ?? '')) onCommit(validated);
  };

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      placeholder="—"
      className={`w-20 text-center rounded border border-gray-200 px-1 py-1.5 text-sm
        focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300
        placeholder:text-gray-200 transition-colors ${gradeColor(local, max, sys)}`}
    />
  );
}

// ── CompetenceCell ────────────────────────────────────────────────────────────
function CompetenceCell({ initialValue, onCommit }) {
  const t = useT();
  const COMP_LABELS = {
    A:  t('Acquis', 'Achieved'),
    EA: t("En cours d'acquisition", 'In progress'),
    NA: t('Non acquis', 'Not achieved'),
  };

  return (
    <div className="flex gap-1 justify-center">
      {COMPETENCES.map((c) => (
        <button
          key={c}
          type="button"
          title={COMP_LABELS[c]}
          onClick={() => onCommit(initialValue === c ? '' : c)}
          className={`w-9 py-0.5 rounded text-xs font-bold transition-colors border ${
            initialValue === c
              ? 'text-white border-transparent'
              : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
          }`}
          style={initialValue === c ? { background: COMP_COLORS[c], borderColor: COMP_COLORS[c] } : {}}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

// ── AbsCell ───────────────────────────────────────────────────────────────────
function AbsCell({ value, onCommit }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);

  const handleBlur = () => {
    const n = parseInt(local, 10);
    const val = local === '' ? '' : (isNaN(n) || n < 0) ? null : String(n);
    if (val === null) { setLocal(value ?? ''); return; }
    if (val !== (value ?? '')) onCommit(val);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      placeholder="0"
      className="w-12 text-center rounded border border-gray-200 px-1 py-1 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300 placeholder:text-gray-200"
    />
  );
}

// ── ConduiteCell ──────────────────────────────────────────────────────────────
function ConduiteCell({ value, onCommit }) {
  const t = useT();
  const CONDUITE_LABELS = {
    TB: t('Très Bien', 'Very Good'),
    B:  t('Bien', 'Good'),
    AB: t('Assez Bien', 'Fairly Good'),
    P:  t('Passable', 'Pass'),
    M:  t('Mauvaise', 'Poor'),
  };

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onCommit(e.target.value)}
      className="rounded border border-gray-200 px-1 py-1 text-xs focus:outline-none focus:border-brand-500"
      style={{ color: value ? CONDUITE_COLORS[value] : '#9ca3af', fontWeight: value ? 700 : 400, minWidth: 60 }}
    >
      <option value="">—</option>
      {CONDUITES.map((c) => (
        <option key={c} value={c} style={{ color: CONDUITE_COLORS[c], fontWeight: 700 }}>
          {c} — {CONDUITE_LABELS[c]}
        </option>
      ))}
    </select>
  );
}

// ── Ligne élève — une matière ─────────────────────────────────────────────────
function StudentRowSingle({ index, student, subject, scores, sys, onSave }) {
  const t = useT();
  const score = scores[subject.id] ?? '';

  return (
    <tr className="hover:bg-gray-50 transition-colors group">
      <td className="px-3 py-2 text-center text-xs text-gray-400 w-8">{index}</td>
      <td className="px-4 py-2 font-medium text-gray-900 text-sm whitespace-nowrap">
        <div className="flex items-center justify-between gap-2">
          <div>
            {student.name}
            {student.matricule && (
              <span className="block text-xs text-gray-400 font-normal font-mono">{student.matricule}</span>
            )}
          </div>
          <button
            onClick={() => { if (!score) onSave(student.id, subject.id, 'ABS'); }}
            title={t('Marquer absent', 'Mark absent')}
            className="opacity-0 group-hover:opacity-100 shrink-0 text-[10px] font-bold text-gray-400 hover:text-amber-600 hover:bg-amber-50 px-1.5 py-0.5 rounded border border-transparent hover:border-amber-200 transition-all"
          >
            ABS
          </button>
        </div>
      </td>
      <td className="px-3 py-2 text-center">
        <GradeCell
          initialValue={score}
          max={subject.max}
          sys={sys}
          onCommit={(val) => onSave(student.id, subject.id, val)}
        />
      </td>
      <td className="px-2 py-2 text-center">
        <AbsCell value={scores['__abs_j__']} onCommit={(v) => onSave(student.id, '__abs_j__', v)} />
      </td>
      <td className="px-2 py-2 text-center">
        <AbsCell value={scores['__abs_nj__']} onCommit={(v) => onSave(student.id, '__abs_nj__', v)} />
      </td>
      <td className="px-2 py-2 text-center">
        <ConduiteCell value={scores['__conduite__']} onCommit={(v) => onSave(student.id, '__conduite__', v)} />
      </td>
    </tr>
  );
}

// ── Ligne élève maternelle — une matière ──────────────────────────────────────
function StudentRowSingleMaternelle({ index, student, subject, scores, onSave }) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-3 py-2 text-center text-xs text-gray-400 w-8">{index}</td>
      <td className="px-4 py-2 font-medium text-gray-900 text-sm whitespace-nowrap">
        {student.name}
        {student.matricule && (
          <span className="block text-xs text-gray-400 font-normal font-mono">{student.matricule}</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <CompetenceCell
          initialValue={scores[subject.id] ?? ''}
          onCommit={(val) => onSave(student.id, subject.id, val)}
        />
      </td>
    </tr>
  );
}

// ── Onglets matières ──────────────────────────────────────────────────────────
function SubjectTabs({ subjects, activeId, onSelect, gradeMap, classId, sequence, students }) {
  return (
    <div className="flex gap-2 flex-wrap mb-5">
      {subjects.map((sub) => {
        const filled = students.filter((s) => {
          const v = (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[sub.id];
          return v && v !== '';
        }).length;
        const pct      = students.length > 0 ? filled / students.length : 0;
        const isActive = sub.id === activeId;
        return (
          <button
            key={sub.id}
            onClick={() => onSelect(sub.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
              isActive
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300 hover:bg-brand-50'
            }`}
          >
            <span className="truncate max-w-[120px]">{sub.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-semibold shrink-0 ${
              isActive
                ? 'bg-white/20 text-white'
                : pct >= 1 ? 'bg-emerald-100 text-emerald-700'
                : pct > 0  ? 'bg-amber-100 text-amber-700'
                :            'bg-gray-100 text-gray-400'
            }`}>
              {filled}/{students.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Stats matière courante ────────────────────────────────────────────────────
function SubjectStatsBar({ students, subject, gradeMap, classId, sequence, sys }) {
  const t = useT();
  if (!subject || !students.length) return null;
  const pass =
    sys === 'ES' ? (5 / 10) * subject.max
    : sys === 'FR' ? (10 / 20) * subject.max
    : 50;

  const vals = students
    .map((s) => {
      const v = (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[subject.id];
      if (!v || v === 'ABS' || v === '') return null;
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    })
    .filter((x) => x !== null);

  const absCount = students.filter(
    (s) => (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[subject.id] === 'ABS'
  ).length;

  if (!vals.length && !absCount) return null;

  const subAvg   = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  const passRate = vals.length ? Math.round((vals.filter((v) => v >= pass).length / vals.length) * 100) : null;

  return (
    <div className="flex flex-wrap gap-4 bg-brand-50 border border-brand-100 rounded-xl px-5 py-3 text-sm mb-5">
      <span className="text-gray-600">
        <strong className="text-gray-900">{vals.length}</strong>/{students.length} {t('notés', 'graded')}
      </span>
      {absCount > 0 && (
        <span className="text-gray-600">
          <strong className="text-amber-600">{absCount}</strong> {absCount > 1 ? t('absents', 'absent') : t('absent', 'absent')}
        </span>
      )}
      {subAvg !== null && (
        <span className="text-gray-600">
          {t('Moy.', 'Avg.')} : <strong className="text-gray-900">{subAvg}/{subject.max}</strong>
        </span>
      )}
      {passRate !== null && (
        <span className="text-gray-600">
          {t('Réussite', 'Pass rate')} : <strong style={{ color: passRate >= 50 ? '#059669' : '#ef4444' }}>{passRate}%</strong>
        </span>
      )}
    </div>
  );
}

// ── Panneau d'import CSV ──────────────────────────────────────────────────────
function GradeImportPanel({ classStudents, classSubjects, classId, sequence, sys, saveGrade, onClose }) {
  const t = useT();
  const [preview,   setPreview]   = useState(null);
  const [importing, setImporting] = useState(false);
  const [done,      setDone]      = useState(null);
  const fileRef                   = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setPreview(await parseGradesCSV(file));
    setDone(null);
  };

  const resolveRows = () => {
    if (!preview || preview.error) return [];
    const studentMap = new Map(classStudents.map((s) => [s.name.toLowerCase(), s]));
    const subjectMap = new Map(classSubjects.map((s) => [s.name.toLowerCase(), s]));
    return preview.rows.map((row) => {
      const student = studentMap.get(row.studentName.toLowerCase());
      const gradeEntries = {};
      for (const [subName, val] of Object.entries(row.grades)) {
        const subject = subjectMap.get(subName.toLowerCase());
        if (!subject) continue;
        const validated = validateGrade(val, subject.max);
        if (validated !== null) gradeEntries[subject.id] = validated;
      }
      return { student, studentName: row.studentName, gradeEntries };
    });
  };

  const resolved  = resolveRows();
  const matched   = resolved.filter((r) => r.student);
  const unmatched = resolved.filter((r) => !r.student);

  const displaySubjects = preview
    ? preview.subjectNames
        .map((n) => classSubjects.find((s) => s.name.toLowerCase() === n.toLowerCase()))
        .filter(Boolean)
    : [];

  const handleImport = async () => {
    setImporting(true);
    let imported = 0;
    for (const { student, gradeEntries } of matched) {
      if (Object.keys(gradeEntries).length > 0) {
        await saveGrade(classId, student.id, sequence, gradeEntries);
        imported++;
      }
    }
    setImporting(false);
    setDone({ imported, skipped: matched.length - imported + unmatched.length });
  };

  const resetFile = () => {
    setPreview(null); setDone(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{t('Importer des notes depuis CSV', 'Import grades from CSV')}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>

      {!preview && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 mb-4">
            {t('Sélectionnez un fichier CSV exporté depuis cette page.', 'Select a CSV file exported from this page.')}<br />
            <span className="text-xs text-gray-400">{t('Format : Élève, Matière /max, …, Moyenne', 'Format: Student, Subject /max, …, Average')}</span>
          </p>
          <button onClick={() => fileRef.current?.click()} className="btn-primary">{t('Choisir un fichier CSV', 'Choose a CSV file')}</button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
      )}

      {preview?.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-4">{preview.error}</div>
      )}

      {preview && !preview.error && !done && (
        <>
          <div className="flex flex-wrap gap-4 mb-4 text-sm">
            <span className="text-gray-600"><strong className="text-gray-900">{matched.length}</strong> {t('élève(s) reconnu(s)', 'student(s) matched')}</span>
            {unmatched.length > 0 && <span className="text-amber-600"><strong>{unmatched.length}</strong> {t('non trouvé(s)', 'not found')}</span>}
            <span className="text-gray-600"><strong className="text-gray-900">{displaySubjects.length}</strong> {t('matière(s) correspondante(s)', 'subject(s) matched')}</span>
          </div>

          {matched.length > 0 && (
            <div className="overflow-x-auto mb-4 rounded-lg border border-gray-100">
              <table className="text-sm w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">{t('Élève', 'Student')}</th>
                    {displaySubjects.map((s) => (
                      <th key={s.id} className="text-center px-2 py-2 font-semibold text-gray-600 text-xs">{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {matched.map(({ student, gradeEntries }, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900 text-sm">{student.name}</td>
                      {displaySubjects.map((s) => (
                        <td key={s.id} className="text-center px-2 py-2 text-sm">
                          {gradeEntries[s.id] !== undefined
                            ? <span className={gradeColor(gradeEntries[s.id], s.max, sys)}>{gradeEntries[s.id]}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-700">
              {t('Élèves non trouvés', 'Students not found')} : {unmatched.map((r) => r.studentName).join(', ')}
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <button onClick={handleImport} disabled={importing || matched.length === 0} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {importing ? t('Importation…', 'Importing…') : `${t('Importer', 'Import')} ${matched.length} ${matched.length > 1 ? t('élèves', 'students') : t('élève', 'student')}`}
            </button>
            <button onClick={resetFile} className="btn-secondary">{t('Changer de fichier', 'Change file')}</button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
        </>
      )}

      {done && (
        <div className="flex flex-col items-center py-6 gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-2xl font-bold">✓</div>
          <p className="text-lg font-semibold text-gray-900">{done.imported} {done.imported > 1 ? t('élèves importés avec succès', 'students imported successfully') : t('élève importé avec succès', 'student imported successfully')}</p>
          {done.skipped > 0 && <p className="text-sm text-gray-400">{done.skipped} {t('ligne(s) ignorée(s)', 'row(s) skipped')}</p>}
          <button onClick={onClose} className="btn-primary mt-2">{t('Fermer', 'Close')}</button>
        </div>
      )}
    </div>
  );
}

// ── Conseil de Classe ─────────────────────────────────────────────────────────
const HONOR_KEYS = ['__th__', '__encouragement__', '__felicitation__'];

function ConseillDeClasse({ classStudents, gradeMap, classId, sequence, onSaveMultiple, sys }) {
  const t = useT();
  const HONOR_LABELS = {
    '__th__':            t('T.H', 'H.R.'),
    '__encouragement__': t('T.H + Encour.', 'H.R. + Encour.'),
    '__felicitation__':  t('T.H + Félic.', 'H.R. + Congrat.'),
  };
  const isEN = sys === 'EN';
  const periodLabel = isEN ? `Term ${sequence}` : `${t('Séquence', 'Sequence')} ${sequence}`;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mt-6">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-800">{t('Conseil de Classe', 'Class Council')}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{t('Décisions et sanctions', 'Decisions and sanctions')} — {periodLabel}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              <th className="px-4 py-2 text-left font-semibold text-gray-600 min-w-[160px]">{t('Élève', 'Student')}</th>
              {HONOR_KEYS.map((k) => (
                <th key={k} className="px-2 py-2 text-center font-semibold text-emerald-700 min-w-[56px]">{HONOR_LABELS[k]}</th>
              ))}
              <th className="px-2 py-2 text-center font-semibold text-amber-700 min-w-[60px]">{t('Aver.', 'Warn.')}<br/>{t('Trav.', 'Work')}</th>
              <th className="px-2 py-2 text-center font-semibold text-red-700 min-w-[60px]">{t('Blâme', 'Reprim.')}<br/>{t('Trav.', 'Work')}</th>
              <th className="px-2 py-2 text-center font-semibold text-gray-500 min-w-[56px]">Abs. Tot.<br/>(H)</th>
              <th className="px-2 py-2 text-center font-semibold text-gray-500 min-w-[56px]">Abs. {t('NJ', 'Unex.')}<br/>(H)</th>
              <th className="px-2 py-2 text-center font-semibold text-orange-700 min-w-[60px]">{t('Exclus.', 'Excl.')}<br/>({t('Jrs', 'Days')})</th>
              <th className="px-2 py-2 text-center font-semibold text-amber-700 min-w-[60px]">{t('Aver.', 'Warn.')}<br/>{t('Cond.', 'Cond.')}</th>
              <th className="px-2 py-2 text-center font-semibold text-red-700 min-w-[60px]">{t('Blâme', 'Reprim.')}<br/>{t('Cond.', 'Cond.')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {classStudents.map((student) => {
              const scores  = gradeMap[`${classId}_${student.id}_${sequence}`] || {};
              const absJ    = parseInt(scores['__abs_j__']  || '0', 10) || 0;
              const absNJ   = parseInt(scores['__abs_nj__'] || '0', 10) || 0;

              const handleHonor = (honorKey) => {
                const isActive = scores[honorKey] === 'true';
                const fields = {};
                HONOR_KEYS.forEach((k) => { fields[k] = (!isActive && k === honorKey) ? 'true' : 'false'; });
                onSaveMultiple(student.id, fields);
              };

              return (
                <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap text-sm">
                    {student.name}
                    {student.matricule && <span className="block text-xs text-gray-400 font-mono font-normal">{student.matricule}</span>}
                  </td>

                  {HONOR_KEYS.map((honorKey) => {
                    const active = scores[honorKey] === 'true';
                    return (
                      <td key={honorKey} className="px-2 py-2 text-center">
                        <button
                          onClick={() => handleHonor(honorKey)}
                          className={`w-6 h-6 rounded border-2 flex items-center justify-center mx-auto text-xs font-bold transition-colors ${
                            active ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 text-gray-300 hover:border-emerald-400 hover:text-emerald-400'
                          }`}
                        >
                          {active ? '✓' : ''}
                        </button>
                      </td>
                    );
                  })}

                  <td className="px-2 py-2 text-center">
                    <AbsCell value={scores['__aver_travail__']} onCommit={(v) => onSaveMultiple(student.id, { '__aver_travail__': v })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <AbsCell value={scores['__blame_travail__']} onCommit={(v) => onSaveMultiple(student.id, { '__blame_travail__': v })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="font-medium text-gray-700">{absJ + absNJ} h</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="font-medium text-gray-700">{absNJ} h</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <AbsCell value={scores['__exclusions__']} onCommit={(v) => onSaveMultiple(student.id, { '__exclusions__': v })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <AbsCell value={scores['__aver_conduite__']} onCommit={(v) => onSaveMultiple(student.id, { '__aver_conduite__': v })} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <AbsCell value={scores['__blame_conduite__']} onCommit={(v) => onSaveMultiple(student.id, { '__blame_conduite__': v })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Grades() {
  const t = useT();
  const classes   = useSchoolStore((s) => s.classes);
  const subjects  = useSchoolStore((s) => s.subjects);
  const students  = useSchoolStore((s) => s.students);
  const gradeMap  = useSchoolStore((s) => s.gradeMap);
  const saveGrade = useSchoolStore((s) => s.saveGrade);

  const role           = useAuthStore((s) => s.role);
  const myClassId      = useAuthStore((s) => s.classId);
  const school         = useAuthStore((s) => s.school);
  const schoolLanguage = school?.language || 'francophone';
  const isTeacher = role === 'teacher';
  const country   = useCountry();
  const isGE      = country.code === 'guinea_eq';

  const SEQUENCES = [
    { value: 1, label: t('Séquence 1', 'Sequence 1'), term: t('Trimestre 1', 'Quarter 1') },
    { value: 2, label: t('Séquence 2', 'Sequence 2'), term: t('Trimestre 1', 'Quarter 1') },
    { value: 3, label: t('Séquence 3', 'Sequence 3'), term: t('Trimestre 2', 'Quarter 2') },
    { value: 4, label: t('Séquence 4', 'Sequence 4'), term: t('Trimestre 2', 'Quarter 2') },
    { value: 5, label: t('Séquence 5', 'Sequence 5'), term: t('Trimestre 3', 'Quarter 3') },
    { value: 6, label: t('Séquence 6', 'Sequence 6'), term: t('Trimestre 3', 'Quarter 3') },
  ];

  // Guinea Ecuatorial : 3 trimestres officiels en espagnol.
  const TRIMESTRES_GE = [
    { value: 1, label: 'Primer Trimestre' },
    { value: 2, label: 'Segundo Trimestre' },
    { value: 3, label: 'Tercer Trimestre' },
  ];

  const TRIMESTRES = [
    { value: 1, label: t('Trimestre 1', 'Quarter 1') },
    { value: 2, label: t('Trimestre 2', 'Quarter 2') },
    { value: 3, label: t('Trimestre 3', 'Quarter 3') },
  ];

  const classId    = useUiStore((s) => s.gradesClassId);
  const setClassId    = useUiStore((s) => s.setGradesClassId);
  const sequence   = useUiStore((s) => s.gradesSequence);
  const setSequence   = useUiStore((s) => s.setGradesSequence);
  const subjectId  = useUiStore((s) => s.gradesSubjectId);
  const setSubjectId  = useUiStore((s) => s.setGradesSubjectId);

  const [showImport,    setShowImport]    = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [gradePage,     setGradePage]     = useState(1);

  const GRADE_PAGE_SIZE = 20;

  useEffect(() => {
    if (!isTeacher) return;
    const target = myClassId || classes[0]?.id;
    if (target && !classId) setClassId(target);
  }, [isTeacher, myClassId, classes, classId]);

  const selectedClass = classes.find((c) => c.id === classId) || null;
  const cycle         = selectedClass?.cycle || 'secondaire';
  const isMaternelle  = cycle === 'maternelle';
  const isPrimaire    = cycle === 'primaire';
  const sys           = selectedClass?.system || 'FR';
  // Options de notation GE (échelle /10 ou /20, coef primaire) — {} hors GE.
  const gOpts         = gradingOpts(school, cycle);
  const geMax         = geGradeMax(school);
  const isEN          = sys === 'EN';
  // Pour les écoles Guinea Ecuatorial : 3 trimestres en espagnol, quel que soit le cycle.
  const periods = isGE
    ? TRIMESTRES_GE
    : (isMaternelle || isPrimaire) ? TRIMESTRES
    : isEN ? TERMS_EN
    : SEQUENCES;

  const classSubjects = useMemo(() =>
    subjects.filter((s) => s.class_id === classId).sort((a, b) => b.coef - a.coef || a.name.localeCompare(b.name)),
    [subjects, classId]
  );
  const classStudents = useMemo(() =>
    students.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name)),
    [students, classId]
  );

  const prevClassIdRef = useRef(null);
  useEffect(() => {
    if (prevClassIdRef.current === null) { prevClassIdRef.current = classId; return; }
    if (prevClassIdRef.current === classId) return;
    prevClassIdRef.current = classId;
    setSequence(1); setStudentSearch(''); setGradePage(1); setSubjectId('');
  }, [classId]);

  useEffect(() => {
    if (classSubjects.length > 0 && (!subjectId || !classSubjects.find((s) => s.id === subjectId))) {
      setSubjectId(classSubjects[0].id);
    }
  }, [classSubjects, subjectId]);

  useEffect(() => { setGradePage(1); }, [studentSearch]);

  const currentSubject = classSubjects.find((s) => s.id === subjectId) || null;

  // Verrou de séquence — validation des notes par l'admin. Quand le verrou
  // est posé, la saisie devient impossible (admin doit déverrouiller d'abord).
  const schoolId = school?.id;
  const [, _setLockTick] = useState(0); // pour forcer un rerender après toggle
  const locked = classId && schoolId
    ? isSequenceLocked(schoolId, classId, sequence)
    : false;
  const lockInfo = classId && schoolId
    ? getLockInfo(schoolId, 'seq', classId, sequence)
    : null;
  const toggleLock = async () => {
    if (!schoolId || !classId) return;
    if (locked) {
      if (!window.confirm(t('Déverrouiller la saisie de cette séquence ?', 'Unlock entry for this sequence?', '¿Desbloquear la captura?'))) return;
      await unlockSequence(schoolId, classId, sequence);
    } else {
      if (!window.confirm(t('Valider et verrouiller les notes ? Aucune modification ne sera possible ensuite (sauf déverrouillage admin).', 'Validate and lock the grades? No further edits allowed (admin can unlock).', '¿Validar y bloquear las notas?'))) return;
      await lockSequence(schoolId, classId, sequence, useAuthStore.getState().fullName);
    }
    _setLockTick((n) => n + 1);
  };

  // Recherche instantanée : nom complet, prénom isolé, matricule.
  // Insensible à la casse et aux accents.
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return classStudents;
    const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qn = norm(q);
    return classStudents.filter((s) => {
      const name = norm(s.name);
      const mat  = norm(s.matricule);
      // Matching mot par mot pour gérer prénom + nom dans n'importe quel ordre
      const words = qn.split(/\s+/).filter(Boolean);
      return words.every((w) => name.includes(w) || mat.includes(w));
    });
  }, [classStudents, studentSearch]);

  const totalGradePages = Math.max(1, Math.ceil(filteredStudents.length / GRADE_PAGE_SIZE));
  const pagedStudents   = filteredStudents.slice(
    (gradePage - 1) * GRADE_PAGE_SIZE,
    gradePage * GRADE_PAGE_SIZE
  );

  const handleSave = useCallback(async (studentId, fieldId, value) => {
    if (locked) return; // sécurité réseau : la séquence est verrouillée
    await saveGrade(classId, studentId, sequence, { [fieldId]: value });
  }, [classId, sequence, saveGrade, locked]);

  const handleSaveMultiple = useCallback(async (studentId, fields) => {
    if (locked) return;
    await saveGrade(classId, studentId, sequence, fields);
  }, [classId, sequence, saveGrade, locked]);

  const getScores = (studentId) => gradeMap[`${classId}_${studentId}_${sequence}`] || {};

  const noSubjects = classId && classSubjects.length === 0;
  const noStudents = classId && classStudents.length === 0;

  const subjectClassAvg = useMemo(() => {
    if (!currentSubject) return null;
    const vals = classStudents
      .map((s) => {
        const v = (gradeMap[`${classId}_${s.id}_${sequence}`] || {})[currentSubject.id];
        if (!v || v === 'ABS' || v === '') return null;
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
      })
      .filter((x) => x !== null);
    return vals.length
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
      : null;
  }, [classStudents, gradeMap, classId, sequence, currentSubject]);

  const handleExport = () => {
    if (!classId || !classStudents.length || !classSubjects.length || isMaternelle) return;
    const seqLabel = periods.find((s) => s.value === sequence)?.label || `Seq${sequence}`;
    const header   = [t('Élève', 'Student'), ...classSubjects.map((s) => `${s.name} /${s.max}`), t('Moyenne', 'Average')];
    const rows = [
      header,
      ...classStudents.map((student) => {
        const scores = getScores(student.id);
        const avg    = getAvg(scores, classSubjects, sys, gOpts);
        return [student.name, ...classSubjects.map((sub) => scores[sub.id] ?? ''), avg != null ? avg.toFixed(2) : ''];
      }),
    ];
    downloadCSV(`notes_${selectedClass?.name || 'classe'}_${seqLabel}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const selectSubject = (id) => { setSubjectId(id); setStudentSearch(''); setGradePage(1); };

  const periodLabel =
    isGE                              ? t('Trimestre', 'Quarter') /* auto-traduit ES */
    : (isMaternelle || isPrimaire)    ? t('Trimestre', 'Quarter')
    : isEN                            ? 'Term'
                                      : t('Séquence', 'Sequence');

  return (
    <Layout>
      <div>

        {/* ── Vue enseignant ─────────────────────────────────────────────────── */}
        {isTeacher ? (
          <>
            <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {selectedClass ? selectedClass.name : t('Saisie des notes', 'Grade entry')}
                </h1>
                {selectedClass ? (
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-sm text-gray-500">{classStudents.length} {classStudents.length !== 1 ? t('élèves', 'students') : t('élève', 'student')}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm text-gray-500">{classSubjects.length} {classSubjects.length !== 1 ? t('matières', 'subjects') : t('matière', 'subject')}</span>
                    <span className="text-gray-300">·</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      sys === 'EN' ? 'bg-blue-100 text-blue-700'
                      : sys === 'ES' ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-purple-100 text-purple-700'
                    }`}>
                      {sys === 'FR' ? 'FR /20' : sys === 'EN' ? 'EN /100' : `ES /${geMax}`}
                    </span>
                    {isMaternelle && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700">{t('Maternelle', 'Nursery')}</span>}
                    {isPrimaire   && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">{t('Primaire', 'Primary')}</span>}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">{t('Notes sauvegardées automatiquement', 'Grades saved automatically')}</p>
                )}
              </div>
              {classId && classStudents.length > 0 && classSubjects.length > 0 && !isMaternelle && (
                <div className="flex flex-wrap gap-2 no-print">
                  <button onClick={() => setShowImport((v) => !v)} className="btn-secondary">{t('Importer CSV', 'Import CSV')}</button>
                  <button onClick={handleExport} className="btn-secondary">{t('Exporter CSV', 'Export CSV')}</button>
                </div>
              )}
            </div>

            {classes.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
                <p className="text-amber-800 font-semibold mb-1">{t('Aucune classe assignée', 'No class assigned')}</p>
                <p className="text-amber-600 text-sm mt-1">{t("Contactez l'administrateur de l'établissement.", 'Contact your school administrator.')}</p>
              </div>
            )}

            {classId && (
              <div className="flex flex-wrap gap-3 mb-6">
                <div className="w-full sm:flex-1 sm:max-w-xs">
                  <label className="form-label">{periodLabel}</label>
                  <select className="form-input" value={sequence} onChange={(e) => setSequence(Number(e.target.value))}>
                    {periods.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}{'term' in p ? ` (${p.term})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── Vue administrateur ─────────────────────────────────────────────── */
          <>
            <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('Saisie des notes', 'Grade entry')}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {isMaternelle
                    ? t('Évaluation par compétences — A / EA / NA.', 'Competency assessment — A / EA / NA.')
                    : t('Notes sauvegardées automatiquement à chaque saisie.', 'Grades are saved automatically with each entry.')}
                </p>
              </div>
              {classId && classStudents.length > 0 && classSubjects.length > 0 && !isMaternelle && (
                <div className="flex flex-wrap gap-2 no-print">
                  <button onClick={() => setShowImport((v) => !v)} className="btn-secondary">{t('Importer CSV', 'Import CSV')}</button>
                  <button onClick={handleExport} className="btn-secondary">{t('Exporter CSV', 'Export CSV')}</button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 mb-6">
              <div className="w-full sm:flex-1 sm:max-w-xs">
                <label className="form-label">{t('Classe', 'Class')}</label>
                <select className="form-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">{t('Choisir une classe…', 'Choose a class…')}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{schoolLanguage === 'bilingue' && !isGE ? ` [${c.system === 'EN' ? 'EN /100' : 'FR /20'}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {classId && (
                <div className="w-full sm:flex-1 sm:max-w-xs">
                  <label className="form-label">{periodLabel}</label>
                  <select className="form-input" value={sequence} onChange={(e) => setSequence(Number(e.target.value))}>
                    {periods.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}{'term' in p ? ` (${p.term})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {selectedClass && (
                <div className="flex flex-wrap items-center gap-2 pt-1 sm:items-end">
                  <span className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                    sys === 'EN' ? 'bg-blue-100 text-blue-700'
                    : sys === 'ES' ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-purple-100 text-purple-700'
                  }`}>
                    {sys === 'FR' ? 'FR /20' : sys === 'EN' ? 'EN /100' : 'ES /10'}
                  </span>
                  {isMaternelle && <span className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700">{t('Maternelle', 'Nursery')}</span>}
                  {isPrimaire   && <span className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700">{t('Primaire', 'Primary')}</span>}
                </div>
              )}
            </div>

            {!classId && (
              <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
                <div className="text-4xl mb-3">✏️</div>
                <p className="text-gray-500 text-sm">{t('Sélectionnez une classe pour commencer la saisie.', 'Select a class to start entering grades.')}</p>
              </div>
            )}
          </>
        )}

        {noSubjects && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
            {t(
              `Cette classe n'a pas encore de ${isMaternelle ? 'domaines de compétences' : 'matières'} configurés.`,
              `This class has no ${isMaternelle ? 'competency domains' : 'subjects'} configured yet.`,
            )}{' '}
            <a href="/app/subjects" className="font-semibold underline">
              {t(isMaternelle ? 'Ajouter des domaines' : 'Ajouter des matières', isMaternelle ? 'Add domains' : 'Add subjects')}
            </a>
          </div>
        )}
        {noStudents && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
            {t("Cette classe n'a pas encore d'élèves inscrits.", 'This class has no enrolled students yet.')}{' '}
            <a href="/app/students" className="font-semibold underline">{t('Ajouter des élèves', 'Add students')}</a>
          </div>
        )}

        {showImport && classId && !isMaternelle && (
          <GradeImportPanel
            classStudents={classStudents}
            classSubjects={classSubjects}
            classId={classId}
            sequence={sequence}
            sys={sys}
            saveGrade={saveGrade}
            onClose={() => setShowImport(false)}
          />
        )}

        {/* ── Bandeau verrouillage de séquence ──────────────────────────────── */}
        {classId && classStudents.length > 0 && (
          <div className={`flex items-center justify-between gap-3 mb-4 p-3 rounded-xl border ${
            locked
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-lg">{locked ? '🔒' : '✏️'}</span>
              <div>
                <div className="font-semibold">
                  {locked
                    ? t('Notes validées — saisie verrouillée', 'Grades validated — entry locked', 'Notas validadas — captura bloqueada')
                    : t('Notes en cours de saisie', 'Grades being entered', 'Notas en captura')}
                </div>
                {lockInfo?.by && (
                  <div className="text-xs opacity-80">
                    {t('Verrouillé par', 'Locked by', 'Bloqueado por')} {lockInfo.by} —{' '}
                    {new Date(lockInfo.at).toLocaleString(localeForLang())}
                  </div>
                )}
              </div>
            </div>
            {!isTeacher && (
              <button onClick={toggleLock} className={`text-sm px-3 py-1.5 rounded-lg font-semibold ${
                locked ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-amber-600 text-white hover:bg-amber-700'
              }`}>
                {locked
                  ? t('Déverrouiller', 'Unlock', 'Desbloquear')
                  : t('Valider et verrouiller', 'Validate & lock', 'Validar y bloquear')}
              </button>
            )}
          </div>
        )}

        {/* ── Contenu principal ─────────────────────────────────────────────── */}
        {classId && classSubjects.length > 0 && classStudents.length > 0 && currentSubject && (
          <>
            {/* Onglets matières */}
            <SubjectTabs
              subjects={classSubjects}
              activeId={subjectId}
              onSelect={selectSubject}
              gradeMap={gradeMap}
              classId={classId}
              sequence={sequence}
              students={classStudents}
            />

            {/* Stats matière */}
            {!isMaternelle && (
              <SubjectStatsBar
                students={classStudents}
                subject={currentSubject}
                gradeMap={gradeMap}
                classId={classId}
                sequence={sequence}
                sys={sys}
              />
            )}

            {/* Tableau — verrou physique des inputs quand séquence verrouillée */}
            <div
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              style={locked ? { pointerEvents: 'none', opacity: 0.72 } : null}
              aria-disabled={locked || undefined}
            >

              {/* Barre de recherche */}
              {classStudents.length > 5 && (
                <div className="px-3 py-3 border-b border-gray-100 flex items-center gap-2">
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z"/>
                    </svg>
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder={t('Rechercher un élève…', 'Search a student…')}
                      className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-300"
                    />
                    {studentSearch && (
                      <button onClick={() => setStudentSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {studentSearch
                      ? (filteredStudents.length === 0
                          ? t('Aucun', 'None')
                          : `${filteredStudents.length}`)
                      : `${classStudents.length} ${t('élèves', 'students')}`}
                  </span>
                </div>
              )}

              {/* Scroll horizontal sur mobile */}
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse w-full min-w-[340px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-2 py-3 text-center font-semibold text-gray-400 w-8 text-xs">N°</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-600">{t('Élève', 'Student')}</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700 min-w-[90px]">
                        <div className="truncate max-w-[120px] mx-auto text-xs sm:text-sm">{currentSubject.name}</div>
                        {!isMaternelle && (
                          <div className="text-gray-400 font-normal text-xs mt-0.5">
                            c{currentSubject.coef} · /{currentSubject.max}
                          </div>
                        )}
                      </th>
                      {!isMaternelle && (
                        <>
                          <th className="px-2 py-3 text-center font-semibold text-gray-600 min-w-[52px]">
                            <div className="text-xs leading-tight">Abs.</div>
                            <div className="text-gray-400 font-normal text-xs">{t('J.', 'Exc.')}</div>
                          </th>
                          <th className="px-2 py-3 text-center font-semibold text-gray-600 min-w-[52px]">
                            <div className="text-xs leading-tight">Abs.</div>
                            <div className="text-gray-400 font-normal text-xs">{t('NJ.', 'Unex.')}</div>
                          </th>
                          <th className="px-2 py-3 text-center font-semibold text-gray-600 min-w-[72px]">
                            <div className="text-xs">{t('Conduite', 'Conduct')}</div>
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>

                  <tbody key={`${classId}-${sequence}-${subjectId}`} className="divide-y divide-gray-50">
                    {pagedStudents.map((student, i) => (
                      isMaternelle ? (
                        <StudentRowSingleMaternelle
                          key={student.id}
                          index={(gradePage - 1) * GRADE_PAGE_SIZE + i + 1}
                          student={student}
                          subject={currentSubject}
                          scores={getScores(student.id)}
                          onSave={handleSave}
                        />
                      ) : (
                        <StudentRowSingle
                          key={student.id}
                          index={(gradePage - 1) * GRADE_PAGE_SIZE + i + 1}
                          student={student}
                          subject={currentSubject}
                          scores={getScores(student.id)}
                          sys={sys}
                          onSave={handleSave}
                        />
                      )
                    ))}
                  </tbody>

                  {!isMaternelle && subjectClassAvg !== null && (
                    <tfoot>
                      <tr className="bg-gray-50/80 border-t-2 border-gray-200">
                        <td />
                        <td className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                          {t('Moy. classe', 'Class avg.')}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-sm font-bold ${
                            subjectClassAvg >= (sys === 'ES' ? (5 / 10) * currentSubject.max : sys === 'FR' ? (10 / 20) * currentSubject.max : 50)
                              ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            {subjectClassAvg}/{currentSubject.max}
                          </span>
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Pagination */}
              {totalGradePages > 1 && (
                <div className="px-3 py-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-gray-400">
                    {gradePage}/{totalGradePages} — {(gradePage - 1) * GRADE_PAGE_SIZE + 1}–{Math.min(gradePage * GRADE_PAGE_SIZE, filteredStudents.length)}/{filteredStudents.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setGradePage((p) => Math.max(1, p - 1))} disabled={gradePage === 1}
                      className="px-2.5 py-1 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      ←
                    </button>
                    {Array.from({ length: totalGradePages }, (_, i) => i + 1).map((p) => (
                      <button key={p} onClick={() => setGradePage(p)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === gradePage ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                        {p}
                      </button>
                    ))}
                    <button onClick={() => setGradePage((p) => Math.min(totalGradePages, p + 1))} disabled={gradePage === totalGradePages}
                      className="px-2.5 py-1 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      →
                    </button>
                  </div>
                </div>
              )}

              <div className="px-3 py-3 border-t border-gray-100 text-xs text-gray-400 flex flex-wrap gap-3">
                {isMaternelle ? (
                  <>
                    <span><strong>A</strong> = {t('Acquis', 'Achieved')} · <strong>EA</strong> = {t("En cours", 'In progress')} · <strong>NA</strong> = {t('Non acquis', 'Not achieved')}</span>
                  </>
                ) : (
                  <>
                    <span><strong>ABS</strong> = {t('Absent', 'Absent')}</span>
                    <span className="hidden sm:inline"><strong>{t('Entrée', 'Enter')}</strong> / <strong>Tab</strong> {t('pour valider', 'to confirm')}</span>
                    <span>{t('Sauvegarde auto', 'Auto-save')}</span>
                  </>
                )}
              </div>
            </div>

            {/* Conseil de classe = tableau d'honneur / blâmes (concepts camerounais).
                Masqué pour la Guinée Équatoriale, qui n'utilise pas ce dispositif. */}
            {!isMaternelle && !isGE && (
              <ConseillDeClasse
                classStudents={classStudents}
                gradeMap={gradeMap}
                classId={classId}
                sequence={sequence}
                onSaveMultiple={handleSaveMultiple}
                sys={sys}
              />
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
