import { useMemo, useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';
import { resolvePayrollItems, resolvePayrollItemAmount, isActiveRow, HR_PAYROLL_STATUSES } from '../../lib/hrEngine';

// Bulletin de paie — remplace HrRecordModal pour l'onglet Paie : primes et
// retenues ne sont plus tapées à la main mais COCHÉES depuis le catalogue de
// l'école (configuré une fois, cf. PayrollCatalogModal), avec net recalculé en
// direct. `items` = lignes hr_payroll_items déjà attachées à CE bulletin
// (vide pour un nouveau bulletin) — sert à précocher + à garder visibles les
// lignes dont l'entrée catalogue a depuis été désactivée/supprimée (« hors
// catalogue », toujours incluses, jamais perdues silencieusement).
export default function PayrollRecordModal({ record, items = [], catalog = [], onSave, onClose }) {
  const t = useT();
  const money = useMoney();
  const editing = !!record?.id;

  const [period, setPeriod] = useState(record?.period || '');
  const [baseSalary, setBaseSalary] = useState(record?.base_salary ?? '');
  const [status, setStatus] = useState(record?.status || 'draft');
  const [paidDate, setPaidDate] = useState(record?.paid_date || '');
  const [notes, setNotes] = useState(record?.notes || '');
  const [saving, setSaving] = useState(false);

  // Lignes ACTIVES du catalogue + lignes déjà attachées au bulletin dont
  // l'entrée catalogue a depuis été supprimée OU désactivée : ces dernières
  // sont réinjectées telles quelles (snapshot) pour ne jamais perdre en
  // silence une donnée déjà émise.
  const rows = useMemo(() => {
    const active = catalog.filter(isActiveRow).map((c) => ({ ...c, catalogId: c.id }));
    const activeIds = new Set(active.map((c) => c.id));
    const detached = items
      .filter((it) => !it.catalog_id || !activeIds.has(it.catalog_id))
      .map((it) => ({
        id: it.catalog_id || `detached-${it.id}`, catalogId: it.catalog_id || null,
        code: it.code, name: it.name, kind: it.kind,
        calc_type: it.calc_type, rate: it.rate, base_ref: it.base_ref, amount: it.amount, detached: true,
      }));
    return [...active, ...detached];
  }, [catalog, items]);

  const [checked, setChecked] = useState(() => new Set(rows
    .filter((r) => r.detached || items.some((it) => it.catalog_id === r.id))
    .map((r) => r.id)));
  const toggle = (id) => setChecked((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const checkedRows = rows.filter((r) => checked.has(r.id));
  const resolved = useMemo(() => resolvePayrollItems(checkedRows, Number(baseSalary) || 0),
    [checkedRows, baseSalary]);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const resolvedItems = [...resolved.primes, ...resolved.retenues, ...resolved.patronales].map((r) => ({
      catalog_id: r.catalogId ?? null, code: r.code || null, kind: r.kind, name: r.name,
      calc_type: r.calc_type || null, rate: r.rate ?? null, base_ref: r.base_ref || null, resolved: r.resolved,
    }));
    await onSave({
      id: record?.id, period, base_salary: Number(baseSalary) || 0, status, paid_date: paidDate || null,
      notes: notes || null, bonuses: resolved.bonuses, deductions: resolved.deductions, net_salary: resolved.net,
    }, resolvedItems);
    setSaving(false);
  };

  const fld = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
  const lbl = 'block text-xs font-semibold text-gray-500 mb-1';

  // Fonction, PAS un composant déclaré dans le rendu : un composant recréé à
  // chaque rendu est un nouveau type pour React, qui démonte puis remonte toute
  // la liste à chaque frappe dans « Salaire de base ».
  const itemGroup = (kind, label) => {
    const list = rows.filter((r) => r.kind === kind);
    if (!list.length) return null;
    return (
      <div key={kind}>
        <p className={lbl}>{label}</p>
        <div className="space-y-1 border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto">
          {list.map((r) => {
            // Aperçu indicatif par ligne (brut approximé au seul salaire de base tant
            // que la sélection n'est pas connue) — le total exact reste le bloc du bas.
            const preview = resolvePayrollItemAmount(r, { baseSalary: Number(baseSalary) || 0, brut: Number(baseSalary) || 0 });
            const live = [...resolved.primes, ...resolved.retenues, ...resolved.patronales].find((x) => x.id === r.id)?.resolved;
            return (
              <label key={r.id} className="flex items-center justify-between gap-2 text-sm px-1 py-0.5 rounded hover:bg-gray-50">
                <span className="flex items-center gap-2 min-w-0">
                  <input type="checkbox" className="w-4 h-4 shrink-0" checked={checked.has(r.id)} onChange={() => toggle(r.id)} />
                  <span className={`truncate ${r.detached ? 'text-gray-400 italic' : 'text-gray-700'}`}>
                    {r.code ? `${r.code} — ` : ''}{r.name}
                    {r.detached && ` (${t('hors catalogue', 'not in catalog', 'fuera del catálogo')})`}
                    {!r.detached && r.calc_type === 'percent' && ` (${r.rate}%)`}
                  </span>
                </span>
                <span className="text-xs text-gray-500 shrink-0">{money(live ?? preview)}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Modal title={editing ? t('Modifier — Paie', 'Edit — Payroll', 'Editar — Nómina') : t('Ajouter — Paie', 'Add — Payroll', 'Añadir — Nómina')} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{t('Période', 'Period', 'Período')}</label>
            <input className={fld} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div>
            <label className={lbl}>{t('Salaire de base', 'Base salary', 'Salario base')}</label>
            <input className={fld} type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} />
          </div>
        </div>

        {itemGroup('prime', t('Primes', 'Bonuses', 'Primas'))}
        {itemGroup('retenue', t('Retenues', 'Deductions', 'Retenciones'))}
        {itemGroup('patronale', t('Charges patronales (info — hors net)', 'Employer charges (info — excluded from net)', 'Cargas patronales (info — fuera del neto)'))}
        {!rows.length && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t('Catalogue vide — ouvrez « ⚙ Catalogue » pour configurer vos primes/retenues.',
              'Empty catalog — open “⚙ Catalog” to configure your bonuses/deductions.',
              'Catálogo vacío — abra «⚙ Catálogo» para configurar sus primas/retenciones.')}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{t('Statut', 'Status', 'Estado')}</label>
            <select className={fld} value={status} onChange={(e) => setStatus(e.target.value)}>
              {HR_PAYROLL_STATUSES.map((s) => (
                <option key={s} value={s}>{s === 'draft' ? t('Brouillon', 'Draft', 'Borrador') : t('Payé', 'Paid', 'Pagado')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>{t('Date de paiement', 'Payment date', 'Fecha de pago')}</label>
            <input className={fld} type="date" value={paidDate || ''} onChange={(e) => setPaidDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={lbl}>{t('Notes', 'Notes', 'Notas')}</label>
          <textarea className={fld} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 grid grid-cols-3 gap-2 text-center">
          <div><div className="text-sm font-bold text-gray-800">{money(resolved.brut)}</div><div className="text-[10px] font-semibold text-gray-400 uppercase">{t('Brut', 'Gross', 'Bruto')}</div></div>
          <div><div className="text-sm font-bold text-gray-800">{money(resolved.deductions)}</div><div className="text-[10px] font-semibold text-gray-400 uppercase">{t('Retenues', 'Deductions', 'Retenciones')}</div></div>
          <div><div className="text-sm font-bold text-indigo-600">{money(resolved.net)}</div><div className="text-[10px] font-semibold text-gray-400 uppercase">{t('Net', 'Net', 'Neto')}</div></div>
          {resolved.employerTotal > 0 && (
            <div className="col-span-3 pt-2 mt-1 border-t border-gray-200 text-[11px] text-gray-500">
              {t('Charges patronales', 'Employer charges', 'Cargas patronales')} : {money(resolved.employerTotal)}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Annuler', 'Cancel', 'Cancelar')}</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
