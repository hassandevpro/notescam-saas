import { useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import { validateGrade, gradeColor, observationFor } from '../../lib/gradeEntry';

// ── Tableau de saisie « enseignant de matière » ──────────────────────────────
// Colonnes : N° · Matricule · Élève · Note · Observation (auto) · état.
// Réutilise les primitives partagées (validateGrade/gradeColor/observationFor).
// UX : navigation clavier (Entrée/↓ suivant, ↑ précédent, Échap annuler),
// collage d'une colonne Excel, sauvegarde auto, ✓ « enregistré », surlignage
// des saisies non enregistrées et des valeurs invalides.
export default function GradeGrid({
  students, subject, sys, gradeScale, maxScale,
  scoresFor, onCommit, locked,
}) {
  const t = useT();
  const max = subject.max;
  const refs = useRef([]);
  const [errors, setErrors] = useState(() => new Set());
  const [dirty,  setDirty]  = useState(() => new Set());
  const [savedId, setSavedId] = useState(null);

  const focusRow = (i) => {
    const el = refs.current[i];
    if (el) { el.focus(); el.select(); }
  };

  const markDirty = (id, on) => setDirty((prev) => {
    const n = new Set(prev);
    if (on) n.add(id); else n.delete(id);
    return n;
  });

  const commit = (student, el) => {
    const v = validateGrade(el.value, max);
    setErrors((prev) => {
      const n = new Set(prev);
      if (v === null) n.add(student.id); else n.delete(student.id);
      return n;
    });
    if (v === null) return false;
    if (v !== (scoresFor(student.id) ?? '')) {
      onCommit(student.id, v);
      setSavedId(student.id);
      setTimeout(() => setSavedId((s) => (s === student.id ? null : s)), 1400);
    }
    markDirty(student.id, false);
    return true;
  };

  const onKeyDown = (e, i, student) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); commit(student, e.currentTarget); focusRow(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); commit(student, e.currentTarget); focusRow(i - 1); }
    else if (e.key === 'Escape')  { e.currentTarget.value = scoresFor(student.id) ?? ''; markDirty(student.id, false); e.currentTarget.blur(); }
  };

  // Coller une colonne Excel (valeurs séparées par des retours-ligne) remplit
  // les élèves consécutifs à partir de la ligne active.
  const onPaste = (e, startIndex) => {
    const text = e.clipboardData.getData('text');
    if (!text || !/[\r\n\t]/.test(text)) return; // une seule valeur → collage normal
    e.preventDefault();
    const vals = text.split(/\r?\n/).map((l) => l.split('\t')[0].trim());
    let last = startIndex;
    vals.forEach((val, k) => {
      const stu = students[startIndex + k];
      if (!stu) return;
      last = startIndex + k;
      if (val === '') return;
      const v = validateGrade(val, max);
      if (v !== null) {
        onCommit(stu.id, v);
        const el = refs.current[startIndex + k];
        if (el) el.value = v;
        markDirty(stu.id, false);
      }
    });
    focusRow(Math.min(last + 1, students.length - 1));
  };

  const jumpToEmpty = () => {
    const idx = students.findIndex((s) => { const v = scoresFor(s.id); return v === undefined || v === '' || v === null; });
    focusRow(idx >= 0 ? idx : 0);
  };

  return (
    <div
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
      style={locked ? { pointerEvents: 'none', opacity: 0.72 } : null}
      aria-disabled={locked || undefined}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <span className="text-xs font-semibold text-gray-500">{subject.name} · /{max}</span>
        <button type="button" onClick={jumpToEmpty} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
          {t('↳ Aller au 1er vide', '↳ Go to first empty', '↳ Ir al 1.º vacío')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[520px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs">
              <th className="px-3 py-2.5 text-center font-semibold text-gray-400 w-8">N°</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-28">{t('Matricule', 'ID', 'Matrícula')}</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600">{t('Élève', 'Student', 'Alumno')}</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 w-28">{t('Note', 'Grade', 'Nota')}</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-500 w-36">{t('Observation', 'Remark', 'Observación')}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const hasErr  = errors.has(s.id);
              const isDirty = dirty.has(s.id);
              const isSaved = savedId === s.id;
              const val = scoresFor(s.id);
              const obs = observationFor(val, max, sys, gradeScale, maxScale);
              return (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/40">
                  <td className="px-3 py-1.5 text-center text-xs text-gray-300 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-1.5 text-xs font-mono text-gray-400 truncate">{s.matricule || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-800 truncate">{s.name}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <input
                        ref={(el) => { refs.current[i] = el; }}
                        type="text"
                        inputMode="decimal"
                        defaultValue={val ?? ''}
                        onChange={(e) => markDirty(s.id, (e.target.value ?? '') !== (scoresFor(s.id) ?? ''))}
                        onBlur={(e) => commit(s, e.currentTarget)}
                        onKeyDown={(e) => onKeyDown(e, i, s)}
                        onPaste={(e) => onPaste(e, i)}
                        placeholder="—"
                        aria-invalid={hasErr || undefined}
                        className={`w-20 text-center rounded-lg px-2 py-1.5 text-base font-semibold focus:outline-none focus:ring-2 transition-colors ${
                          hasErr
                            ? 'border border-red-400 ring-1 ring-red-300 text-red-600'
                            : isDirty
                              ? 'border border-amber-400 ring-1 ring-amber-200 bg-amber-50'
                              : `border border-gray-200 focus:border-brand-500 focus:ring-brand-300 ${gradeColor(val, max, sys)}`
                        }`}
                      />
                      <span className="w-4 shrink-0 text-center">
                        {hasErr ? <span title={t(`Note invalide (0–${max})`, `Invalid (0–${max})`)} className="text-red-500 text-xs">⚠</span>
                          : isDirty ? <span title={t('Non enregistré', 'Unsaved', 'Sin guardar')} className="text-amber-500 text-xs">●</span>
                          : isSaved ? <span className="text-emerald-500 text-xs">✓</span>
                          : null}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-xs font-medium truncate" style={{ color: obs?.col || '#d1d5db' }}>
                    {obs ? obs.text : '—'}
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr><td colSpan={5} className="text-sm text-gray-400 text-center py-10">{t('Aucun élève dans cette classe.', 'No students in this class.', 'Sin alumnos.')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
        <span><strong>{t('Entrée', 'Enter')}</strong> / <strong>↓</strong> {t('suivant', 'next', 'siguiente')}</span>
        <span><strong>↑</strong> {t('précédent', 'previous', 'anterior')}</span>
        <span className="hidden sm:inline"><strong>{t('Coller', 'Paste')}</strong> {t('une colonne Excel', 'an Excel column', 'columna de Excel')}</span>
        <span><strong>ABS</strong> = {t('Absent', 'Absent')}</span>
        <span className="text-emerald-500">✓ {t('Sauvegarde auto', 'Auto-save', 'Guardado auto')}</span>
      </div>
    </div>
  );
}
