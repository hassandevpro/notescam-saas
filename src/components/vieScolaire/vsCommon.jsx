// Briques communes aux écrans VIE SCOLAIRE (surveillant / discipline).
// Objectif : garder chaque page courte et cohérente (mêmes filtres, même style).

import { useMemo, useState } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useT } from '../../lib/i18n';
import SectionFilterSelect, { inSection } from '../SectionFilterSelect';

export function todayISO() { return new Date().toISOString().slice(0, 10); }

export function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString(); } catch { return String(d); }
}

// Contexte partagé (école, année active, données scopées par le store).
export function useVsContext() {
  const school   = useAuthStore((s) => s.school);
  const userId   = useAuthStore((s) => s.user?.id) || null;
  const viewYear = useUiStore((s) => s.viewYear);
  const classes  = useSchoolStore((s) => s.classes);
  const students = useSchoolStore((s) => s.students);
  const yearLabel = viewYear ?? school?.current_year ?? '';
  return { school, schoolId: school?.id, yearLabel, classes, students, userId };
}

// Sélecteur Section → Classe → Élève (contrôlé). Les classes/élèves sont déjà
// restreints au périmètre du surveillant par le store (schoolStore).
export function ClassStudentPicker({ classes, students, value, onChange, required = true }) {
  const t = useT();
  const [sectionF, setSectionF] = useState('');
  const { classId = '', studentId = '' } = value || {};

  const scopedClasses = useMemo(
    () => classes.filter((c) => inSection(c, sectionF))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })),
    [classes, sectionF],
  );
  const classStudents = useMemo(
    () => students.filter((s) => s.class_id === classId).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [students, classId],
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <SectionFilterSelect
        classes={classes}
        value={sectionF}
        onChange={(v) => { setSectionF(v); onChange({ classId: '', studentId: '' }); }}
        label={t('Section', 'Section')}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('Classe', 'Class')}{required ? ' *' : ''}</label>
        <select value={classId} onChange={(e) => onChange({ classId: e.target.value, studentId: '' })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
          <option value="">{t('— Choisir —', '— Select —')}</option>
          {scopedClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t('Élève', 'Student')}{required ? ' *' : ''}</label>
        <select value={studentId} onChange={(e) => onChange({ classId, studentId: e.target.value })}
          disabled={!classId}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:bg-gray-50">
          <option value="">{t('— Choisir —', '— Select —')}</option>
          {classStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    </div>
  );
}

// Entête de page standard vie scolaire.
export function VsHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// Petit champ étiqueté générique.
export function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';
