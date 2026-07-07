// Page CRUD générique, pilotée par un SCHÉMA, pour les modules vie scolaire
// (retards, incidents, sanctions, convocations, sorties, conseil). Chaque module
// se réduit ainsi à une déclaration de champs + colonnes.
//
// Props :
//   entity     : { fetch, upsert, remove } de vieScolaireService
//   title, subtitle
//   withStudent: inclure le sélecteur Section→Classe→Élève (défaut true)
//   fields     : [{ key, label:[fr,en,es], type, optionList?, full?, placeholder }]
//                type ∈ text|textarea|date|time|number|select|checkbox
//   columns    : [{ label:[fr,en,es], render(row, ctx) }]
//   defaults   : valeurs initiales d'un nouvel enregistrement

import { useEffect, useMemo, useState } from 'react';
import Layout from '../Layout';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { localizedOptions } from '../../core/disciplineTerms';
import {
  useVsContext, VsHeader, ClassStudentPicker, Field, fmtDate, todayISO, inputCls,
} from './vsCommon';

export default function RecordsPage({
  entity, title, subtitle, fields, columns, defaults = {}, withStudent = true,
  rowActions = [],
}) {
  const t = useT();
  const { school, schoolId, yearLabel, classes, students, userId } = useVsContext();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const classById   = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const ctx = { t, school, studentById, classById, fmtDate };

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    const data = await entity.fetch(schoolId, { yearLabel });
    // On n'affiche que les lignes dont la classe/élève est dans le périmètre visible.
    const scoped = (data || []).filter((r) => !r.class_id || classById.has(r.class_id) || studentById.has(r.student_id));
    setRows(scoped);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [schoolId, yearLabel, students.length, classes.length]);

  const openNew = () => {
    setForm({ date: todayISO(), ...defaults, classId: '', studentId: '' });
    setEditing('new');
  };
  const openEdit = (row) => {
    setForm({ ...row, classId: row.class_id || '', studentId: row.student_id || '' });
    setEditing(row);
  };

  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const save = async () => {
    setSaving(true);
    const { classId, studentId, ...rest } = form;
    const payload = {
      ...rest,
      school_id:  schoolId,
      year_label: yearLabel,
      recorded_by: form.recorded_by || userId,
    };
    if (withStudent) { payload.student_id = studentId || null; payload.class_id = classId || null; }
    const saved = await entity.upsert(payload);
    setSaving(false);
    if (saved) { setEditing(null); load(); }
  };

  const remove = async (row) => {
    if (!window.confirm(t('Supprimer cet enregistrement ?', 'Delete this record?'))) return;
    await entity.remove(row.id);
    load();
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5">
        <VsHeader
          title={title}
          subtitle={subtitle || yearLabel}
          right={<button onClick={openNew} className="btn-primary" style={{ width: 'auto', paddingInline: '1.25rem' }}>+ {t('Ajouter', 'Add')}</button>}
        />

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-gray-400 text-sm animate-pulse">{t('Chargement…', 'Loading…')}</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3">🗒️</div>
              <p className="text-sm text-gray-500">{t('Aucun enregistrement.', 'No record yet.')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {withStudent && <th className="px-4 py-3 text-left">{t('Élève', 'Student')}</th>}
                    {columns.map((c, i) => <th key={i} className="px-4 py-3 text-left">{t(...c.label)}</th>)}
                    <th className="px-4 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/50">
                      {withStudent && (
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{studentById.get(row.student_id)?.name || '—'}</div>
                          <div className="text-xs text-gray-400">{classById.get(row.class_id)?.name || ''}</div>
                        </td>
                      )}
                      {columns.map((c, i) => <td key={i} className="px-4 py-3 text-gray-700">{c.render(row, ctx)}</td>)}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {rowActions.map((a, i) => (
                          <button key={i} onClick={() => a.onClick(row, ctx)} className="text-xs font-semibold text-gray-600 hover:bg-gray-100 px-2 py-1 rounded mr-1">{t(...a.label)}</button>
                        ))}
                        <button onClick={() => openEdit(row)} className="text-xs font-semibold text-brand-600 hover:bg-brand-50 px-2 py-1 rounded">{t('Modifier', 'Edit')}</button>
                        <button onClick={() => remove(row)} className="text-xs font-semibold text-red-600 hover:bg-red-50 px-2 py-1 rounded ml-1">{t('Suppr.', 'Del.')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? t('Nouvel enregistrement', 'New record') : t('Modifier', 'Edit')} onClose={() => setEditing(null)} size="lg">
          <div className="space-y-4">
            {withStudent && (
              <ClassStudentPicker
                classes={classes} students={students}
                value={{ classId: form.classId, studentId: form.studentId }}
                onChange={(v) => setForm((f) => ({ ...f, ...v }))}
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map((fl) => (
                <div key={fl.key} className={fl.full ? 'sm:col-span-2' : ''}>
                  <FieldInput field={fl} value={form[fl.key]} onChange={(v) => setField(fl.key, v)} t={t} />
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={save} disabled={saving || (withStudent && !form.studentId)} className="btn-primary flex-1">
                {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer', 'Save')}
              </button>
              <button onClick={() => setEditing(null)} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

function FieldInput({ field, value, onChange, t }) {
  const label = t(...field.label);
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="rounded" />
        {label}
      </label>
    );
  }
  if (field.type === 'textarea') {
    return (
      <Field label={label}>
        <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.placeholder}
          className={inputCls} />
      </Field>
    );
  }
  if (field.type === 'select') {
    const opts = localizedOptions(field.optionList || [], t);
    return (
      <Field label={label}>
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {!field.required && <option value="">{t('—', '—')}</option>}
          {opts.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
        </select>
      </Field>
    );
  }
  return (
    <Field label={label}>
      <input type={field.type || 'text'} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder} className={inputCls} />
    </Field>
  );
}
