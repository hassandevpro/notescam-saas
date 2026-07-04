import { useState, useRef } from 'react';
import { useT } from '../../lib/i18n';
import { parseGradesCSV } from '../../lib/exportCsv';
import { validateGrade, gradeColor } from '../../lib/gradeEntry';

// ── Panneau d'import CSV ──────────────────────────────────────────────────────
// Partagé par l'écran « enseignant principal » (Grades) et le poste
// « enseignant de matière » (SubjectTeacherWorkspace). En mode matière, on lui
// passe uniquement les matières de l'enseignant → seules celles-ci sont importées.
export default function GradeImportPanel({ classStudents, classSubjects, classId, sequence, sys, saveGrade, onClose }) {
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
        <h2 className="text-lg font-semibold text-gray-900">{t('Importer des notes (Excel/CSV)', 'Import grades (Excel/CSV)')}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>

      {!preview && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 mb-4">
            {t('Sélectionnez un fichier Excel ou CSV exporté depuis cette page.', 'Select an Excel or CSV file exported from this page.')}<br />
            <span className="text-xs text-gray-400">{t('Format : Élève, Matière /max, …, Moyenne', 'Format: Student, Subject /max, …, Average')}</span>
          </p>
          <button onClick={() => fileRef.current?.click()} className="btn-primary">{t('Choisir un fichier', 'Choose a file')}</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
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
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
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
