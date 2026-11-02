// Barre « Exporter / Importer » générique pour les grilles de saisie PAR
// COMPÉTENCES (collège APC MINESEC, primaire APC MINEDUB, maternelle MINEDUB).
//
// Ces écrans ne stockent pas les notes dans la table `grades` classique : chaque
// valeur vit dans son propre référentiel (compétence × critère × séquence…). Ce
// composant fournit un import/export tabulaire commun, indépendant du stockage :
//   • colonnes = compétences/domaines fournis par l'appelant,
//   • cellules = valeur courante lue via getCell,
//   • à l'import, chaque cellule non vide est normalisée puis renvoyée à onImport.
//
// L'export réutilise gradeCell → notes écrites en texte à virgule ("13,75").

import { useState, useRef, useMemo } from 'react';
import { useT } from '../../lib/i18n';
import { downloadExcel, readSheetAoa, EXCEL_ACCEPT } from '../../lib/exportCsv';
import { gradeCell } from '../../lib/gradeEntry';
// Où se trouve la colonne du NOM dans la feuille lue : la première colonne
// depuis que l'export porte le « N° » de la liste de classe, la zéroième dans
// les classeurs des versions précédentes. Les deux doivent entrer.
import { indexColonneEleve } from '../../lib/colonneEleve';

// Normalisation robuste (casse + accents + espaces) pour apparier noms d'élèves
// et intitulés de colonnes entre le fichier et le référentiel.
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// En-têtes calculés à ignorer à l'import (colonnes de synthèse de l'export).
const SKIP_HEADER = /^(m\s*\/?\s*20|moy|moyenne|cote|note|average|mean|grade)$/i;

export default function CompetenceGradeIO({
  filename,               // base du nom de fichier (sans extension)
  sheetName,              // nom de la feuille Excel
  students,               // [{ id, name }] — DÉJÀ dans l'ordre de la liste de classe
  numeroDe,               // (studentId) => numéro de la liste de classe | undefined
  columns,                // [{ id, label }] compétences/domaines
  getCell,                // (studentId, columnId) => valeur stockée (string) | ''
  computed = [],          // [{ label, get(studentId) }] colonnes de synthèse (export seul)
  normalize,              // (raw:string) => valeur normalisée | '' | null (null = ignorée)
  onImport,               // (studentId, columnId, value) => Promise|void
  disabled = false,       // séquence/trimestre verrouillé → import interdit
  valueHint,              // ex. « /20 », « A / ECA / NA » (aide affichée)
}) {
  const t = useT();
  const [showImport, setShowImport] = useState(false);
  const [preview,   setPreview]   = useState(null);
  const [importing, setImporting] = useState(false);
  const [done,      setDone]      = useState(null);
  const fileRef                   = useRef(null);

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!students.length || !columns.length) return;
    // Le N° de la liste de classe ouvre la feuille : c'est le repère que
    // l'enseignant a sous les yeux à l'écran, et celui qu'il relit sur la liste
    // imprimée. `indexColonneEleve` le reconnaît au retour (import).
    const header = [t('N°', 'No.'), t('Élève', 'Student'), ...columns.map((c) => c.label), ...computed.map((c) => c.label)];
    const rows = [
      header,
      ...students.map((s, i) => [
        numeroDe?.(s.id) ?? i + 1,
        s.name,
        ...columns.map((c) => gradeCell(getCell(s.id, c.id))),
        ...computed.map((c) => gradeCell(c.get(s.id))),
      ]),
    ];
    downloadExcel(`${filename}.xlsx`, rows, sheetName || t('Notes', 'Marks'));
  };

  // ── Import : lecture + correspondance ─────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file) return;
    setDone(null);
    const { raw, error } = await readSheetAoa(file);
    if (error) { setPreview({ error }); return; }

    const fileHeader = raw[0];
    // La colonne du NOM, puis les colonnes de données qui la suivent. Lue de
    // l'en-tête et jamais supposée : un classeur exporté avant la colonne « N° »
    // porte le nom en 0, un classeur exporté depuis le porte en 1.
    const nomIdx = indexColonneEleve(fileHeader);
    // Correspondance en-tête → colonne (par intitulé, insensible casse/accents).
    let colMap = columns
      .map((c) => {
        const idx = fileHeader.findIndex((h, j) => j > nomIdx && norm(h) === norm(c.label));
        return idx > nomIdx ? { colId: c.id, label: c.label, fileIdx: idx } : null;
      })
      .filter(Boolean);

    // Repli positionnel : aucune colonne appariée par intitulé mais le nombre de
    // colonnes de données (hors synthèse) coïncide → on mappe par position.
    if (colMap.length === 0) {
      const dataIdx = [];
      for (let j = nomIdx + 1; j < fileHeader.length; j++) {
        if (!SKIP_HEADER.test(String(fileHeader[j]).trim())) dataIdx.push(j);
      }
      if (dataIdx.length >= columns.length) {
        colMap = columns.map((c, i) => ({ colId: c.id, label: c.label, fileIdx: dataIdx[i] }));
      }
    }

    const studentMap = new Map(students.map((s) => [norm(s.name), s]));
    const rowsOut = raw.slice(1).map((cells) => {
      const name    = String(cells[nomIdx] || '').trim();
      const student = studentMap.get(norm(name));
      const entries = {};
      for (const { colId, fileIdx } of colMap) {
        const rawv = String(cells[fileIdx] ?? '').trim();
        if (!rawv) continue;
        const v = normalize(rawv, colId);
        if (v !== null && v !== '') entries[colId] = v;
      }
      return { student, name, entries };
    }).filter((r) => r.name);

    setPreview({ colMap, rows: rowsOut, error: null });
  };

  const matched   = useMemo(() => (preview?.rows || []).filter((r) => r.student), [preview]);
  const unmatched = useMemo(() => (preview?.rows || []).filter((r) => !r.student), [preview]);

  const runImport = async () => {
    setImporting(true);
    let count = 0;
    for (const { student, entries } of matched) {
      const pairs = Object.entries(entries);
      if (!pairs.length) continue;
      for (const [colId, value] of pairs) await onImport(student.id, colId, value);
      count++;
    }
    setImporting(false);
    setDone({ imported: count, skipped: matched.length - count + unmatched.length });
  };

  const closePanel = () => {
    setShowImport(false); setPreview(null); setDone(null);
    if (fileRef.current) fileRef.current.value = '';
  };
  const resetFile = () => {
    setPreview(null); setDone(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const previewCols = preview?.colMap || [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2 no-print">
        <button onClick={() => setShowImport((v) => !v)} className="btn-secondary" disabled={disabled}
          title={disabled ? t('Verrouillé', 'Locked') : undefined}>
          {t('Importer', 'Import', 'Importar')}
        </button>
        <button onClick={handleExport} className="btn-secondary">{t('Exporter', 'Export', 'Exportar')}</button>
      </div>

      {showImport && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-base font-semibold text-gray-900">
              {t('Importer des notes (Excel)', 'Import grades (Excel)', 'Importar notas (Excel)')}
            </h3>
            <button onClick={closePanel} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>

          {!preview && (
            <div className="text-center py-6">
              <p className="text-sm text-gray-500 mb-1">
                {t('Sélectionnez un fichier exporté depuis cet écran.', 'Select a file exported from this screen.', 'Seleccione un archivo exportado desde esta pantalla.')}
              </p>
              <p className="text-xs text-gray-400 mb-4">
                {t('N° · Élève, puis une colonne par compétence (un fichier sans colonne N° est accepté)',
                   'No. · Student, then one column per competency (a file without the No. column is accepted)',
                   'N.º · Alumno, luego una por competencia (se acepta un archivo sin la columna N.º)')}
                {valueHint ? ` (${valueHint})` : ''}.
              </p>
              <button onClick={() => fileRef.current?.click()} className="btn-primary">{t('Choisir un fichier', 'Choose a file', 'Elegir archivo')}</button>
            </div>
          )}

          {preview?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-3">{preview.error}</div>
          )}

          {preview && !preview.error && !done && (
            <>
              <div className="flex flex-wrap gap-4 mb-3 text-sm">
                <span className="text-gray-600"><strong className="text-gray-900">{matched.length}</strong> {t('élève(s) reconnu(s)', 'student(s) matched', 'alumno(s) reconocido(s)')}</span>
                {unmatched.length > 0 && <span className="text-amber-600"><strong>{unmatched.length}</strong> {t('non trouvé(s)', 'not found', 'no encontrado(s)')}</span>}
                <span className="text-gray-600"><strong className="text-gray-900">{previewCols.length}</strong> {t('colonne(s) reconnue(s)', 'column(s) matched', 'columna(s) reconocida(s)')}</span>
              </div>

              {previewCols.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-xs text-amber-700">
                  {t('Aucune colonne reconnue. Vérifiez que les en-têtes correspondent aux compétences de cet écran.',
                     'No column matched. Check that the headers match the competencies of this screen.',
                     'Ninguna columna reconocida. Verifique que los encabezados coincidan.')}
                </div>
              )}

              {matched.length > 0 && previewCols.length > 0 && (
                <div className="overflow-x-auto mb-3 rounded-lg border border-gray-100 max-h-72">
                  <table className="text-sm w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2 font-semibold text-gray-600 sticky left-0 bg-gray-50">{t('Élève', 'Student')}</th>
                        {previewCols.map((c) => (
                          <th key={c.colId} className="text-center px-2 py-2 font-semibold text-gray-600 text-xs max-w-[10rem] truncate" title={c.label}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {matched.map(({ student, entries }, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-medium text-gray-900 text-sm whitespace-nowrap sticky left-0 bg-white">{student.name}</td>
                          {previewCols.map((c) => (
                            <td key={c.colId} className="text-center px-2 py-1.5 text-sm">
                              {entries[c.colId] !== undefined
                                ? <span className="text-gray-800 font-medium">{entries[c.colId]}</span>
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
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-xs text-amber-700">
                  {t('Élèves non trouvés', 'Students not found', 'Alumnos no encontrados')} : {unmatched.map((r) => r.name).join(', ')}
                </div>
              )}

              <div className="flex gap-3 flex-wrap">
                <button onClick={runImport} disabled={importing || matched.length === 0 || previewCols.length === 0}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                  {importing ? t('Importation…', 'Importing…', 'Importando…') : `${t('Importer', 'Import', 'Importar')} ${matched.length}`}
                </button>
                <button onClick={resetFile} className="btn-secondary">{t('Changer de fichier', 'Change file', 'Cambiar archivo')}</button>
              </div>
            </>
          )}

          {done && (
            <div className="flex flex-col items-center py-5 gap-2 text-center">
              <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xl font-bold">✓</div>
              <p className="text-base font-semibold text-gray-900">
                {done.imported} {done.imported > 1 ? t('élèves importés', 'students imported', 'alumnos importados') : t('élève importé', 'student imported', 'alumno importado')}
              </p>
              {done.skipped > 0 && <p className="text-xs text-gray-400">{done.skipped} {t('ligne(s) ignorée(s)', 'row(s) skipped', 'fila(s) omitida(s)')}</p>}
              <button onClick={closePanel} className="btn-primary mt-1">{t('Fermer', 'Close', 'Cerrar')}</button>
            </div>
          )}

          <input ref={fileRef} type="file" accept={EXCEL_ACCEPT} className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
}
