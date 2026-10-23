import { useState, useRef } from 'react';
import { useT } from '../../lib/i18n';
import { parseGradesSheet, EXCEL_ACCEPT } from '../../lib/exportCsv';
import { validateGrade, gradeColor } from '../../lib/gradeEntry';
import { lignesPourMatiere, matieresDuClasseur } from '../../core/importUneMatiere';

// ── Panneau d'import Excel ────────────────────────────────────────────────────
// Partagé par l'écran « enseignant principal » (Grades) et le poste
// « enseignant de matière » (SubjectTeacherWorkspace). En mode matière, on lui
// passe uniquement les matières de l'enseignant → seules celles-ci sont importées.
//
// ── UNE MATIÈRE À LA FOIS ───────────────────────────────────────────────────
// Consigne du responsable, 2026-10-23. Le classeur porte une colonne par
// matière de la classe ; cet écran les prenait TOUTES. Un enseignant qui
// réimportait son fichier réécrivait donc les colonnes de ses collègues avec
// l'état qu'elles avaient au moment de l'EXPORT. La matière est maintenant
// CHOISIE, et c'est la seule colonne lue. La règle est pure et vérifiée seule :
// core/importUneMatiere.js.
export default function GradeImportPanel({ classStudents, classSubjects, classId, sequence, sys, saveGrade, onClose }) {
  const t = useT();
  const [preview,   setPreview]   = useState(null);
  const [matiereId, setMatiereId] = useState('');
  const [importing, setImporting] = useState(false);
  const [done,      setDone]      = useState(null);
  const fileRef                   = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    const lu = await parseGradesSheet(file);
    setPreview(lu);
    setDone(null);
    // Le classeur ne porte qu'une matière de cette classe : la choisir pour
    // l'enseignant est sans ambiguïté. Au-delà, c'est à lui de dire laquelle.
    const trouvees = lu && !lu.error ? matieresDuClasseur(lu.subjectNames, classSubjects) : [];
    setMatiereId(trouvees.length === 1 ? trouvees[0].id : '');
  };

  const matieresDuFichier = preview && !preview.error
    ? matieresDuClasseur(preview.subjectNames, classSubjects)
    : [];
  const matiere = matieresDuFichier.find((m) => m.id === matiereId) || null;

  // Hors barème : refusée. CELLULE VIDE : on ne touche à rien — c'est la
  // moitié du piège fermée en 0.3.19 (`validateGrade('')` rend `''`, pas
  // `null`, et `saveGrade` fusionnait ces vides, EFFAÇANT les notes des
  // collègues). Le choix de la matière ferme l'autre moitié : une cellule
  // pleine mais périmée dans une colonne voisine n'est plus lue du tout.
  const resolved  = lignesPourMatiere({
    lignes: preview && !preview.error ? preview.rows : [],
    eleves: classStudents,
    matiere,
    valider: validateGrade,
  });
  const matched   = resolved.filter((r) => r.student);
  const unmatched = resolved.filter((r) => !r.student);
  const aEcrire   = matched.filter((r) => Object.keys(r.gradeEntries).length > 0);

  const handleImport = async () => {
    setImporting(true);
    let imported = 0, locked = 0;
    for (const { student, gradeEntries } of aEcrire) {
      // saveGrade refuse et renvoie { locked } si la séquence est verrouillée.
      // silent : on agrège (done.locked), pas un toast par élève.
      const res = await saveGrade(classId, student.id, sequence, gradeEntries, { silent: true });
      if (res?.locked) locked++;
      else imported++;
    }
    setImporting(false);
    setDone({
      imported, locked, matiere: matiere?.name || '',
      skipped: matched.length - imported - locked + unmatched.length,
    });
  };

  const resetFile = () => {
    setPreview(null); setDone(null); setMatiereId('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{t('Importer des notes (Excel)', 'Import grades (Excel)')}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>

      {!preview && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 mb-4">
            {t('Sélectionnez le classeur Excel exporté depuis cette page.', 'Select the Excel workbook exported from this page.')}<br />
            <span className="text-xs text-gray-400">{t('Format : Élève, Matière /max, …, Moyenne', 'Format: Student, Subject /max, …, Average')}</span>
          </p>
          <button onClick={() => fileRef.current?.click()} className="btn-primary">{t('Choisir un fichier', 'Choose a file')}</button>
          <input ref={fileRef} type="file" accept={EXCEL_ACCEPT} className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
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
            <span className="text-gray-600"><strong className="text-gray-900">{matieresDuFichier.length}</strong> {t('matière(s) correspondante(s)', 'subject(s) matched')}</span>
          </div>

          {/* UNE MATIÈRE À LA FOIS : tant qu'elle n'est pas choisie, rien n'est
              écrit. Les autres colonnes du classeur ne sont pas lues. */}
          {matieresDuFichier.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-700">
              {t('Aucune colonne de ce classeur ne correspond à une matière de cette classe.',
                'No column in this workbook matches a subject of this class.')}
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('Matière à importer', 'Subject to import')}
              </label>
              <select
                value={matiereId}
                onChange={(e) => setMatiereId(e.target.value)}
                className="w-full md:w-80 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">{t('— Choisir la matière —', '— Choose the subject —')}</option>
                {matieresDuFichier.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {t('Une matière à la fois : seules les notes de la matière choisie sont enregistrées. Les autres colonnes du classeur sont ignorées, même si elles portent des notes.',
                  'One subject at a time: only the chosen subject’s marks are saved. The workbook’s other columns are ignored, even if they hold marks.')}
              </p>
            </div>
          )}

          {matiere && matched.length > 0 && (
            <div className="overflow-x-auto mb-4 rounded-lg border border-gray-100">
              <table className="text-sm w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2 font-semibold text-gray-600">{t('Élève', 'Student')}</th>
                    <th className="text-center px-2 py-2 font-semibold text-gray-600 text-xs">
                      {matiere.name}{matiere.max ? ` /${matiere.max}` : ''}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {matched.map(({ student, gradeEntries }, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900 text-sm">{student.name}</td>
                      <td className="text-center px-2 py-2 text-sm">
                        {gradeEntries[matiere.id] !== undefined
                          ? <span className={gradeColor(gradeEntries[matiere.id], matiere.max, sys)}>{gradeEntries[matiere.id]}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
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
            {/* Le bouton annonce CE QUI SERA ÉCRIT : le nombre de notes de la
                matière choisie, pas le nombre d'élèves reconnus. Un classeur
                dont la colonne est vide ne doit pas promettre un import. */}
            <button onClick={handleImport} disabled={importing || !matiere || aEcrire.length === 0} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {importing
                ? t('Importation…', 'Importing…')
                : !matiere
                  ? t('Choisissez la matière', 'Choose the subject')
                  : `${t('Importer', 'Import')} ${aEcrire.length} ${aEcrire.length > 1 ? t('notes', 'marks') : t('note', 'mark')} — ${matiere.name}`}
            </button>
            <button onClick={resetFile} className="btn-secondary">{t('Changer de fichier', 'Change file')}</button>
            <input ref={fileRef} type="file" accept={EXCEL_ACCEPT} className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
        </>
      )}

      {done && (
        <div className="flex flex-col items-center py-6 gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-2xl font-bold">✓</div>
          <p className="text-lg font-semibold text-gray-900">
            {done.imported} {done.imported > 1 ? t('notes importées', 'marks imported') : t('note importée', 'mark imported')}
            {done.matiere ? ` — ${done.matiere}` : ''}
          </p>
          <p className="text-xs text-gray-400">
            {t('Seule cette matière a été écrite. Pour une autre matière, relancez l’import et choisissez-la.',
              'Only this subject was written. For another subject, run the import again and choose it.')}
          </p>
          {done.skipped > 0 && <p className="text-sm text-gray-400">{done.skipped} {t('ligne(s) ignorée(s)', 'row(s) skipped')}</p>}
          {done.locked > 0 && <p className="text-sm font-medium text-amber-600">🔒 {done.locked} {t('note(s) refusée(s) : séquence verrouillée', 'grade(s) refused: sequence locked', 'nota(s) rechazada(s): secuencia bloqueada')}</p>}
          <button onClick={onClose} className="btn-primary mt-2">{t('Fermer', 'Close')}</button>
        </div>
      )}
    </div>
  );
}
