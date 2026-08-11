import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { HR_PAYROLL_ITEM_KINDS, HR_PAYROLL_CALC_TYPES, HR_PAYROLL_BASE_REFS, isActiveRow } from '../../lib/hrEngine';
import { PAYROLL_KIND_LABELS, PAYROLL_KIND_BADGE } from './hrEntities';

// Lignes de DÉPART reprenant les libellés/codes/taux visibles sur un bulletin
// camerounais réel (capture fournie par l'utilisateur) — PAS des taux garantis
// à jour : chargées à la demande, jamais imposées, toujours modifiables/
// supprimables ensuite. I.R.P.P. et Centimes Additionnels (CAC) sont VOLONTAIREMENT
// absents : ce sont des barèmes progressifs (pas un simple % d'une seule base),
// donc hors de portée du modèle fixe/pourcentage de ce catalogue.
const STARTER_ITEMS = [
  { code: '205', name: "Prime d'Ancienneté", kind: 'prime', calc_type: 'fixed', amount: 0 },
  // Retenues salariales
  { code: '651', name: 'CNPS Pension Vieillesse', kind: 'retenue', calc_type: 'percent', rate: 4.2, base_ref: 'brut' },
  { code: '670', name: 'Taxe de Développement Local', kind: 'retenue', calc_type: 'fixed', amount: 0 },
  { code: '671', name: 'Participation C.F.C. (Part Salariale)', kind: 'retenue', calc_type: 'percent', rate: 1.0, base_ref: 'brut' },
  { code: '672', name: 'Redevance Audio-Visuelle', kind: 'retenue', calc_type: 'fixed', amount: 0 },
  { code: '684', name: 'I.R.P.P.', kind: 'retenue', calc_type: 'fixed', amount: 0 },
  { code: '685', name: 'Centimes Additionnels (CAC)', kind: 'retenue', calc_type: 'fixed', amount: 0 },
  // Charges patronales (bloc informatif du bulletin — n'entrent pas dans le net)
  { name: 'Crédit Foncier Patronal', kind: 'patronale', calc_type: 'percent', rate: 1.5, base_ref: 'brut' },
  { name: "Fonds National de l'Emploi", kind: 'patronale', calc_type: 'percent', rate: 1.0, base_ref: 'brut' },
  { name: 'Accident de Travail', kind: 'patronale', calc_type: 'percent', rate: 1.75, base_ref: 'brut' },
  { name: 'Allocations Familiales', kind: 'patronale', calc_type: 'percent', rate: 7.0, base_ref: 'brut' },
  { name: 'CNPS Patronale (PVID)', kind: 'patronale', calc_type: 'percent', rate: 4.2, base_ref: 'brut' },
];

const calcLabel = (t, item) => (item.calc_type === 'percent'
  ? `${item.rate ?? 0}% (${t(...(item.base_ref === 'salaire_base' ? ['salaire de base', 'base salary', 'salario base'] : ['brut', 'gross', 'bruto']))})`
  : `${item.amount ?? 0}`);

const EMPTY_ITEM = { code: '', name: '', kind: 'prime', calc_type: 'fixed', amount: '', rate: '', base_ref: 'brut', active: true };

export default function PayrollCatalogModal({ catalog = [], loadError = false, onSave, onDelete, onLoadStarters, confirm, onClose }) {
  const t = useT();
  const [editing, setEditing] = useState(null); // null = liste | objet = formulaire
  const [saving, setSaving] = useState(false);
  const [loadingStarters, setLoadingStarters] = useState(false);

  const fld = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
  const lbl = 'block text-xs font-semibold text-gray-500 mb-1';
  const set = (k, v) => setEditing((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!editing.name?.trim() || saving) return;
    setSaving(true);
    const ok = await onSave({
      ...editing, name: editing.name.trim(),
      amount: editing.calc_type === 'fixed' ? (Number(editing.amount) || 0) : null,
      rate: editing.calc_type === 'percent' ? (Number(editing.rate) || 0) : null,
    });
    setSaving(false);
    if (ok) setEditing(null);
  };

  const remove = async (item) => {
    if (!(await confirm({
      tone: 'danger',
      title: t('Supprimer la ligne', 'Delete line', 'Eliminar línea'),
      message: t('Supprimer cette ligne du catalogue ?', 'Delete this catalog line?', '¿Eliminar esta línea del catálogo?'),
      confirmLabel: t('Supprimer', 'Delete', 'Eliminar'),
    }))) return;
    await onDelete(item.id);
  };

  const loadStarters = async () => {
    if (!(await confirm({
      title: t('Charger les valeurs indicatives', 'Load indicative values', 'Cargar valores indicativos'),
      message: t(
        'Ajoute des lignes reprenant les libellés/taux d’un bulletin camerounais type (CNPS, CFC…). À VÉRIFIER avec votre comptable — non garanties à jour, entièrement modifiables ensuite.',
        'Adds lines based on a typical Cameroon payslip (CNPS, CFC…). CHECK with your accountant — not guaranteed up to date, fully editable afterwards.',
        'Añade líneas basadas en una nómina camerunesa típica (CNPS, CFC…). VERIFIQUE con su contador — no garantizadas, editables después.',
      ),
      confirmLabel: t('Charger', 'Load', 'Cargar'),
    }))) return;
    setLoadingStarters(true);
    await onLoadStarters(STARTER_ITEMS);
    setLoadingStarters(false);
  };

  return (
    <Modal title={t('Catalogue primes / retenues', 'Bonus / deduction catalog', 'Catálogo primas / retenciones')} onClose={onClose} size="lg">
      {!editing ? (
        <>
          <p className="text-xs text-gray-500 mb-3">
            {t('Configurez une fois vos primes et retenues (montant fixe ou % du salaire) : elles seront cochables sur chaque bulletin.',
              'Configure your bonuses and deductions once (fixed amount or % of salary): they become checkboxes on every payslip.',
              'Configure una vez sus primas y retenciones (monto fijo o % del salario): estarán disponibles como casillas en cada nómina.')}
          </p>
          <div className="flex justify-between items-center mb-2">
            <button onClick={loadStarters} disabled={loadingStarters}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
              {loadingStarters ? t('Chargement…', 'Loading…', 'Cargando…') : `+ ${t('Valeurs indicatives (Cameroun)', 'Indicative values (Cameroon)', 'Valores indicativos (Camerún)')}`}
            </button>
            <button onClick={() => setEditing({ ...EMPTY_ITEM })}
              className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg">
              + {t('Ajouter', 'Add', 'Añadir')}
            </button>
          </div>
          {loadError ? (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-3">
              <p className="font-semibold">{t('Catalogue inaccessible.', 'Catalog unavailable.', 'Catálogo no disponible.')}</p>
              <p className="text-xs mt-1">{t(
                'La table du catalogue n’a pas répondu. En édition Cloud, vérifiez que la migration « supabase_hr_payroll_catalog.sql » a bien été exécutée dans Supabase (SQL Editor). Sinon, vérifiez votre connexion.',
                'The catalog table did not respond. On Cloud, check that the “supabase_hr_payroll_catalog.sql” migration has been run in Supabase (SQL Editor). Otherwise check your connection.',
                'La tabla del catálogo no respondió. En Cloud, compruebe que la migración «supabase_hr_payroll_catalog.sql» se ejecutó en Supabase (SQL Editor). Si no, revise su conexión.')}</p>
            </div>
          ) : catalog.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">{t('Catalogue vide.', 'Empty catalog.', 'Catálogo vacío.')}</p>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">{t('Nom', 'Name', 'Nombre')}</th>
                    <th className="text-left px-3 py-2 font-semibold">{t('Type', 'Type', 'Tipo')}</th>
                    <th className="text-left px-3 py-2 font-semibold">{t('Calcul', 'Calc.', 'Cálculo')}</th>
                    <th className="text-center px-3 py-2 font-semibold">{t('Actif', 'Active', 'Activo')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((item) => (
                    <tr key={item.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-700">{item.code ? `${item.code} — ` : ''}{item.name}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PAYROLL_KIND_BADGE[item.kind] || PAYROLL_KIND_BADGE.retenue}`}>
                          {t(...(PAYROLL_KIND_LABELS[item.kind] || [item.kind]))}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{calcLabel(t, item)}</td>
                      <td className="px-3 py-2 text-center">{isActiveRow(item) ? '✓' : '—'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => setEditing({ ...item, amount: item.amount ?? '', rate: item.rate ?? '' })} className="text-xs text-gray-400 hover:text-gray-700 mr-2">✎</button>
                        <button onClick={() => remove(item)} className="text-xs text-rose-400 hover:text-rose-600">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end pt-4">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Fermer', 'Close', 'Cerrar')}</button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{t('Code (optionnel)', 'Code (optional)', 'Código (opcional)')}</label>
            <input className={fld} value={editing.code || ''} onChange={(e) => set('code', e.target.value)} placeholder="651" />
          </div>
          <div>
            <label className={lbl}>{t('Type', 'Type', 'Tipo')}</label>
            <select className={fld} value={editing.kind} onChange={(e) => set('kind', e.target.value)}>
              {HR_PAYROLL_ITEM_KINDS.map((k) => (
                <option key={k} value={k}>{t(...PAYROLL_KIND_LABELS[k])}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={lbl}>{t('Nom', 'Name', 'Nombre')}</label>
            <input className={fld} autoFocus value={editing.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className={lbl}>{t('Mode de calcul', 'Calculation', 'Modo de cálculo')}</label>
            <select className={fld} value={editing.calc_type} onChange={(e) => set('calc_type', e.target.value)}>
              {HR_PAYROLL_CALC_TYPES.map((c) => (
                <option key={c} value={c}>{c === 'fixed' ? t('Montant fixe', 'Fixed amount', 'Monto fijo') : t('Pourcentage', 'Percentage', 'Porcentaje')}</option>
              ))}
            </select>
          </div>
          {editing.calc_type === 'percent' ? (
            <>
              <div>
                <label className={lbl}>{t('Taux (%)', 'Rate (%)', 'Tasa (%)')}</label>
                <input className={fld} type="number" step="0.01" value={editing.rate} onChange={(e) => set('rate', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={lbl}>{t('Base de calcul', 'Calculation base', 'Base de cálculo')}</label>
                <select className={fld} value={editing.base_ref} onChange={(e) => set('base_ref', e.target.value)}>
                  {HR_PAYROLL_BASE_REFS.map((b) => (
                    <option key={b} value={b}>{b === 'salaire_base' ? t('Salaire de base', 'Base salary', 'Salario base') : t('Salaire brut (base + primes)', 'Gross salary (base + bonuses)', 'Salario bruto (base + primas)')}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div>
              <label className={lbl}>{t('Montant', 'Amount', 'Importe')}</label>
              <input className={fld} type="number" value={editing.amount} onChange={(e) => set('amount', e.target.value)} />
            </div>
          )}
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isActiveRow(editing)} onChange={(e) => set('active', e.target.checked)} className="w-4 h-4" />
              {t('Actif', 'Active', 'Activo')}
            </label>
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Annuler', 'Cancel', 'Cancelar')}</button>
            <button type="submit" disabled={!editing.name?.trim() || saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
