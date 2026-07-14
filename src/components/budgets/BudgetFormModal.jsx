import { useState, useEffect, useRef, useMemo } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import {
  BUDGET_PERIOD_TYPES, BUDGET_SECTORS, periodRefOptions,
  budgetPeriodBounds, findOverlappingBudget, DEFAULT_SCHOOL_YEAR_START_MONTH,
} from '../../lib/budgetEngine';
import { PERIOD_TYPE_LABELS, SECTOR_LABELS } from './budgetUi';

const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');

// Création / modification de l'ENTÊTE d'un budget (période + secteur + DATES + libellé).
// Les dates d'exercice (Phase D) sont pré-remplies depuis la période + le mois de début
// d'année scolaire, et restent modifiables. La gestion des chapitres se fait ensuite.
export default function BudgetFormModal({
  budget, academicYear, startMonth = DEFAULT_SCHOOL_YEAR_START_MONTH, budgets = [], onSave, onClose,
}) {
  const t = useT();
  const editing = !!budget?.id;

  const [label, setLabel]           = useState(budget?.label || '');
  const [periodType, setPeriodType] = useState(budget?.period_type || 'annuel');
  const [periodRef, setPeriodRef]   = useState(budget?.period_ref || '');
  const [sector, setSector]         = useState(budget?.sector || 'general');
  const [startDate, setStartDate]   = useState(budget?.start_date || '');
  const [endDate, setEndDate]       = useState(budget?.end_date || '');
  const [notes, setNotes]           = useState(budget?.notes || '');
  const [saving, setSaving]         = useState(false);

  const refOptions = periodRefOptions(periodType);

  // Dates proposées à partir de la période + mois de début d'année scolaire.
  const proposed = useMemo(() => {
    const b = budgetPeriodBounds({
      academic_year: budget?.academic_year || academicYear,
      period_type: periodType,
      period_ref: refOptions.length ? (Number(periodRef) || refOptions[0]) : null,
    }, startMonth);
    return b ? { start: iso(b.start), end: iso(b.endInclusive) } : { start: '', end: '' };
  }, [periodType, periodRef, academicYear, budget, startMonth, refOptions.length]);

  // Tant que le RAF n'a pas édité les dates à la main, elles suivent la proposition.
  const datesTouched = useRef(!!(budget?.start_date && budget?.end_date));
  useEffect(() => {
    if (!datesTouched.current) { setStartDate(proposed.start); setEndDate(proposed.end); }
  }, [proposed]);

  const datesValid = startDate && endDate && startDate < endDate;

  // Avertissement (non bloquant) : budget de MÊME SECTEUR chevauchant la période.
  const overlap = useMemo(() => {
    if (!datesValid) return null;
    return findOverlappingBudget(
      { id: budget?.id, sector, academic_year: budget?.academic_year || academicYear, start_date: startDate, end_date: endDate },
      budgets, startMonth,
    );
  }, [datesValid, sector, startDate, endDate, budget, academicYear, budgets, startMonth]);

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim() || !datesValid || saving) return;
    setSaving(true);
    await onSave({
      ...budget,
      academic_year: budget?.academic_year || academicYear,
      label: label.trim(),
      period_type: periodType,
      period_ref: refOptions.length ? Number(periodRef) || refOptions[0] : null,
      sector,
      start_date: startDate,
      end_date: endDate,
      notes: notes.trim(),
    });
    setSaving(false);
  };

  const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const lbl = 'block text-xs font-semibold text-gray-500 mb-1';

  return (
    <Modal
      title={editing ? t('Modifier le budget', 'Edit budget', 'Editar presupuesto')
                     : t('Nouveau budget', 'New budget', 'Nuevo presupuesto')}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={lbl}>{t('Libellé', 'Label', 'Etiqueta')}</label>
          <input className={field} value={label} autoFocus
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('Budget prévisionnel', 'Forecast budget', 'Presupuesto previsional')} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{t('Période', 'Period', 'Período')}</label>
            <select className={field} value={periodType}
              onChange={(e) => { setPeriodType(e.target.value); setPeriodRef(''); }}>
              {BUDGET_PERIOD_TYPES.map((p) => (
                <option key={p} value={p}>{t(...PERIOD_TYPE_LABELS[p])}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>
              {periodType === 'trimestriel' ? t('Trimestre', 'Quarter', 'Trimestre')
                : periodType === 'mensuel' ? t('Mois', 'Month', 'Mes')
                : t('Rang', 'Rank', 'Rango')}
            </label>
            <select className={field} value={periodRef} disabled={!refOptions.length}
              onChange={(e) => setPeriodRef(e.target.value)}>
              {!refOptions.length && <option value="">—</option>}
              {refOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Dates réelles d'exercice (Phase D) — pré-remplies, modifiables. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{t('Début d’exercice', 'Exercise start', 'Inicio del ejercicio')}</label>
            <input type="date" className={field} value={startDate}
              onChange={(e) => { datesTouched.current = true; setStartDate(e.target.value); }} />
          </div>
          <div>
            <label className={lbl}>{t('Fin d’exercice', 'Exercise end', 'Fin del ejercicio')}</label>
            <input type="date" className={field} value={endDate}
              onChange={(e) => { datesTouched.current = true; setEndDate(e.target.value); }} />
          </div>
        </div>
        {!datesValid && (startDate || endDate) && (
          <p className="text-xs text-rose-600">{t('La date de fin doit être postérieure au début.', 'End date must be after the start.', 'La fecha de fin debe ser posterior al inicio.')}</p>
        )}
        {!datesTouched.current && datesValid && (
          <p className="text-[11px] text-gray-400">{t('Dates proposées depuis la période — ajustez si besoin.', 'Dates suggested from the period — adjust if needed.', 'Fechas propuestas — ajuste si es necesario.')}</p>
        )}
        {overlap && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠ {t('Un budget du même secteur chevauche cette période', 'A budget in the same sector overlaps this period', 'Un presupuesto del mismo sector se solapa')} : <b>{overlap.label}</b>. {t('Vérifiez les dates (non bloquant).', 'Check the dates (not blocking).', 'Verifique las fechas (no bloqueante).')}
          </p>
        )}

        <div>
          <label className={lbl}>{t('Secteur', 'Sector', 'Sector')}</label>
          <select className={field} value={sector} onChange={(e) => setSector(e.target.value)}>
            {BUDGET_SECTORS.map((s) => (
              <option key={s} value={s}>{t(...(SECTOR_LABELS[s] || [s]))}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={lbl}>{t('Notes', 'Notes', 'Notas')}</label>
          <textarea className={field} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            {t('Annuler', 'Cancel', 'Cancelar')}
          </button>
          <button type="submit" disabled={!label.trim() || !datesValid || saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…')
                    : t('Enregistrer', 'Save', 'Guardar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
