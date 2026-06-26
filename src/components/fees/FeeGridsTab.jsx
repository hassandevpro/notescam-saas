import { useState, useMemo } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useT } from '../../lib/i18n';
import { uuid } from '../../lib/uuid';
import { sumTranches } from '../../lib/feeEngine';
import Modal from '../Modal';
import { useMoney } from '../../lib/useMoney';

// ── Hook : état d'un formulaire de grille (partagé mono-classe / multi-classes) ─
function useGridForm(grid) {
  const [comptant,  setComptant]  = useState(String(grid?.amount_comptant  ?? ''));
  const [echelonne, setEchelonne] = useState(String(grid?.amount_echelonne ?? ''));
  const [tranches,  setTranches]  = useState(
    (grid?.tranches ?? []).map((x) => ({ ...x, id: x.id || uuid() }))
  );

  const echelonneNum  = parseInt(echelonne, 10) || 0;
  const totalTranches = sumTranches(tranches);
  const mismatch = echelonneNum > 0 && totalTranches > 0 && totalTranches !== echelonneNum;

  const updateTranche = (id, field, value) =>
    setTranches((arr) => arr.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  const addTranche = () =>
    setTranches((arr) => [...arr, { id: uuid(), label: arr.length === 0 ? 'Inscription' : `Tranche ${arr.length}`, amount: 0, due_date: '' }]);
  const removeTranche = (id) => setTranches((arr) => arr.filter((x) => x.id !== id));

  const quickFill = () => {
    const total = echelonneNum || parseInt(comptant, 10) || 0;
    if (!total) return;
    const insc = Math.round(total * 0.2);
    const rest = total - insc;
    const t1 = Math.round(rest / 3);
    setTranches([
      { id: uuid(), label: 'Inscription', amount: insc, due_date: '' },
      { id: uuid(), label: 'Tranche 1',   amount: t1,   due_date: '' },
      { id: uuid(), label: 'Tranche 2',   amount: t1,   due_date: '' },
      { id: uuid(), label: 'Tranche 3',   amount: rest - 2 * t1, due_date: '' },
    ]);
  };

  // Payload normalisé prêt à enregistrer.
  const toPayload = () => ({
    amount_comptant:  parseInt(comptant, 10)  || 0,
    amount_echelonne: echelonneNum,
    tranches: tranches
      .map((x) => ({ id: x.id, label: x.label?.trim() || 'Tranche', amount: parseInt(x.amount, 10) || 0, due_date: x.due_date || null }))
      .filter((x) => x.amount > 0 || x.label),
  });

  return {
    comptant, setComptant, echelonne, setEchelonne, tranches,
    echelonneNum, totalTranches, mismatch,
    updateTranche, addTranche, removeTranche, quickFill, toPayload,
  };
}

// ── Champs réutilisables d'édition d'une grille ─────────────────────────────
function GridFormFields({ form }) {
  const t = useT();
  const money = useMoney();
  return (
    <div className="space-y-5">
      {/* Tarifs globaux */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4">
          <label className="block text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">
            {t('Paiement comptant', 'Lump sum', 'Al contado')}
          </label>
          <p className="text-[11px] text-emerald-700/70 mb-2">{t('Tarif réduit, payé en une fois', 'Reduced price, paid at once', 'Precio reducido, pago único')}</p>
          <div className="flex items-center gap-2">
            <input type="number" min="0" step="500" className="form-input" placeholder="Ex : 600 000"
              value={form.comptant} onChange={(e) => form.setComptant(e.target.value)} />
            <span className="text-sm text-gray-400">{money.code}</span>
          </div>
        </div>
        <div className="bg-brand-50/60 border border-brand-200 rounded-xl p-4">
          <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1">
            {t('Paiement échelonné', 'Installments', 'A plazos')}
          </label>
          <p className="text-[11px] text-brand-700/70 mb-2">{t('Montant total réparti en tranches', 'Total split into installments', 'Total repartido en plazos')}</p>
          <div className="flex items-center gap-2">
            <input type="number" min="0" step="500" className="form-input" placeholder="Ex : 650 000"
              value={form.echelonne} onChange={(e) => form.setEchelonne(e.target.value)} />
            <span className="text-sm text-gray-400">{money.code}</span>
          </div>
        </div>
      </div>

      {/* Tranches */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700">{t('Tranches & échéances', 'Installments & due dates', 'Plazos y vencimientos')}</h4>
          <div className="flex gap-2">
            {form.tranches.length === 0 && (
              <button onClick={form.quickFill} className="text-xs font-semibold text-brand-600 hover:text-brand-700 px-2 py-1 rounded hover:bg-brand-50">
                {t('Pré-remplir', 'Quick fill', 'Autollenar')}
              </button>
            )}
            <button onClick={form.addTranche} className="text-xs font-semibold text-brand-600 hover:text-brand-700 px-2 py-1 rounded hover:bg-brand-50">
              + {t('Ajouter une tranche', 'Add installment', 'Añadir plazo')}
            </button>
          </div>
        </div>

        {form.tranches.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-lg">
            {t('Aucune tranche. Ajoutez-en pour le paiement échelonné.', 'No installments yet.', 'Sin plazos todavía.')}
          </p>
        ) : (
          <div className="space-y-2">
            {form.tranches.map((tr) => (
              <div key={tr.id} className="flex flex-wrap items-end gap-2 bg-white border border-gray-100 rounded-lg p-2.5">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">{t('Libellé', 'Label', 'Etiqueta')}</label>
                  <input type="text" className="form-input !py-1.5 text-sm" value={tr.label}
                    onChange={(e) => form.updateTranche(tr.id, 'label', e.target.value)} />
                </div>
                <div className="w-32">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">{t('Montant', 'Amount', 'Importe')}</label>
                  <input type="number" min="0" step="500" className="form-input !py-1.5 text-sm" value={tr.amount}
                    onChange={(e) => form.updateTranche(tr.id, 'amount', e.target.value)} />
                </div>
                <div className="w-40">
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-0.5">{t('Échéance', 'Due date', 'Vencimiento')}</label>
                  <input type="date" className="form-input !py-1.5 text-sm" value={tr.due_date || ''}
                    onChange={(e) => form.updateTranche(tr.id, 'due_date', e.target.value)} />
                </div>
                <button onClick={() => form.removeTranche(tr.id)} title={t('Supprimer', 'Delete', 'Eliminar')}
                  className="text-red-400 hover:text-red-600 px-2 py-2 rounded hover:bg-red-50">✕</button>
              </div>
            ))}
            <div className={`flex items-center justify-between px-1 text-xs ${form.mismatch ? 'text-amber-600' : 'text-gray-400'}`}>
              <span>{t('Total des tranches', 'Installments total', 'Total plazos')} : <strong>{money(form.totalTranches)}</strong></span>
              {form.mismatch && <span>⚠️ ≠ {money(form.echelonneNum)} ({t('échelonné', 'installment total', 'a plazos')})</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Éditeur d'une grille pour UNE classe ────────────────────────────────────
function ClassFeeGridModal({ cls, grid, students, onClose }) {
  const t = useT();
  const saveClassFeeGrid = useSchoolStore((s) => s.saveClassFeeGrid);
  const form = useGridForm(grid);
  const [saving, setSaving] = useState(false);
  const nbStudents = students.filter((s) => s.class_id === cls.id).length;

  const handleSave = async () => {
    setSaving(true);
    await saveClassFeeGrid({ class_id: cls.id, ...form.toPayload() });
    setSaving(false);
    onClose();
  };

  return (
    <Modal title={<>{t('Grille tarifaire', 'Fee grid', 'Tarifa')} — <span className="text-brand-700">{cls.name}</span></>} onClose={onClose} size="lg">
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          {t(
            `Définissez le tarif de cette classe (${nbStudents} élèves). Le comptable choisira ensuite, à l'inscription de chaque élève, le mode comptant ou échelonné.`,
            `Set this class fee (${nbStudents} students). The accountant then picks lump-sum or installments per student at enrollment.`,
            `Defina la tarifa de esta clase (${nbStudents} alumnos). El cajero elegirá luego al contado o a plazos por alumno.`
          )}
        </p>
        <GridFormFields form={form} />
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel', 'Cancelar')}</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer la grille', 'Save grid', 'Guardar tarifa')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Éditeur d'une grille pour PLUSIEURS classes à la fois ───────────────────
function BulkFeeGridModal({ classes, students, gridByClass, onClose }) {
  const t = useT();
  const saveClassFeeGrid = useSchoolStore((s) => s.saveClassFeeGrid);
  const form = useGridForm(null);
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(0);

  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const allSelected = selected.size === classes.length && classes.length > 0;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(classes.map((c) => c.id)));

  const handleApply = async () => {
    if (!selected.size) return;
    setSaving(true);
    const payload = form.toPayload();
    let n = 0;
    for (const id of selected) {
      await saveClassFeeGrid({ class_id: id, ...payload });
      setDone(++n);
    }
    setSaving(false);
    onClose();
  };

  return (
    <Modal title={t('Définir pour plusieurs classes', 'Set for multiple classes', 'Definir para varias clases')} onClose={onClose} size="lg">
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          {t(
            'Définissez une grille unique et appliquez-la à toutes les classes sélectionnées. Idéal pour les classes au même tarif (un seul niveau, par ex.).',
            'Define one grid and apply it to all selected classes — ideal for classes sharing the same fee.',
            'Defina una tarifa única y aplíquela a todas las clases seleccionadas.'
          )}
        </p>

        {/* Sélection des classes */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/70 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('Classes ciblées', 'Target classes', 'Clases destino')} · {selected.size}/{classes.length}
            </span>
            <button onClick={toggleAll} className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              {allSelected ? t('Tout désélectionner', 'Unselect all', 'Quitar todo') : t('Tout sélectionner', 'Select all', 'Seleccionar todo')}
            </button>
          </div>
          <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
            {classes.map((c) => {
              const has = !!gridByClass[c.id];
              const checked = selected.has(c.id);
              return (
                <label key={c.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50/60 cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} className="w-4 h-4 accent-brand-600" />
                  <span className="flex-1 text-sm text-gray-800">{c.name}</span>
                  <span className="text-xs text-gray-400">{students.filter((s) => s.class_id === c.id).length} {t('élèves', 'students', 'alumnos')}</span>
                  {has && <span className="text-[10px] text-amber-600" title={t('Une grille existe déjà — elle sera remplacée', 'A grid already exists — it will be replaced', 'Ya existe una tarifa — se reemplazará')}>⚠️ {t('existe', 'exists', 'existe')}</span>}
                </label>
              );
            })}
          </div>
        </div>

        {selected.size > 0 && Object.keys(gridByClass).some((id) => selected.has(id)) && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            {t(
              'Certaines classes sélectionnées ont déjà une grille : elle sera remplacée. Les paiements déjà enregistrés ne sont pas affectés.',
              'Some selected classes already have a grid: it will be replaced. Existing payments are not affected.',
              'Algunas clases ya tienen tarifa: será reemplazada. Los pagos registrados no se ven afectados.'
            )}
          </div>
        )}

        <GridFormFields form={form} />

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel', 'Cancelar')}</button>
          <button onClick={handleApply} disabled={saving || !selected.size} className="btn-primary" style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
            {saving
              ? `${t('Application…', 'Applying…', 'Aplicando…')} ${done}/${selected.size}`
              : `${t('Appliquer à', 'Apply to', 'Aplicar a')} ${selected.size} ${selected.size > 1 ? t('classes', 'classes', 'clases') : t('classe', 'class', 'clase')}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Onglet « Grilles tarifaires » ───────────────────────────────────────────
export default function FeeGridsTab({ classes, students }) {
  const t = useT();
  const money = useMoney();
  const classFeeGrids = useSchoolStore((s) => s.classFeeGrids);
  const deleteClassFeeGrid = useSchoolStore((s) => s.deleteClassFeeGrid);
  const [editing, setEditing] = useState(null);
  const [bulk, setBulk] = useState(false);

  const gridByClass = useMemo(() => {
    const m = {};
    classFeeGrids.forEach((g) => { m[g.class_id] = g; });
    return m;
  }, [classFeeGrids]);

  if (!classes.length) {
    return (
      <div className="bg-white rounded-xl p-10 text-center shadow-sm border border-gray-100">
        <div className="text-4xl mb-3">🏷️</div>
        <p className="text-gray-500 text-sm">{t('Créez des classes pour définir leurs tarifs.', 'Create classes to set their fees.', 'Cree clases para definir tarifas.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setBulk(true)} className="btn-secondary">
          {t('Définir pour plusieurs classes', 'Set for multiple classes', 'Definir para varias clases')}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 text-left">{t('Classe', 'Class', 'Clase')}</th>
                <th className="px-4 py-3 text-right">{t('Comptant', 'Lump sum', 'Contado')}</th>
                <th className="px-4 py-3 text-right">{t('Échelonné', 'Installments', 'A plazos')}</th>
                <th className="px-4 py-3 text-center">{t('Tranches', 'Installments', 'Plazos')}</th>
                <th className="px-4 py-3 text-center">{t('Action', 'Action', 'Acción')}</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((cls) => {
                const grid = gridByClass[cls.id];
                const nb = students.filter((s) => s.class_id === cls.id).length;
                return (
                  <tr key={cls.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-gray-900">{cls.name}</div>
                      <div className="text-xs text-gray-400">{nb} {t('élèves', 'students', 'alumnos')}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700">
                      {grid?.amount_comptant ? money(grid.amount_comptant) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-brand-700">
                      {grid?.amount_echelonne ? money(grid.amount_echelonne) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      {grid?.tranches?.length ? grid.tranches.length : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button onClick={() => setEditing(cls)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
                        {grid ? t('Modifier', 'Edit', 'Editar') : t('Définir', 'Set', 'Definir')}
                      </button>
                      {grid && (
                        <button onClick={() => { if (confirm(t('Supprimer la grille de cette classe ?', 'Delete this class grid?', '¿Eliminar la tarifa de esta clase?'))) deleteClassFeeGrid(grid.id); }}
                          className="ml-1 text-xs text-gray-300 hover:text-red-500 px-2 py-1.5">✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ClassFeeGridModal cls={editing} grid={gridByClass[editing.id]} students={students} onClose={() => setEditing(null)} />
      )}
      {bulk && (
        <BulkFeeGridModal classes={classes} students={students} gridByClass={gridByClass} onClose={() => setBulk(false)} />
      )}
    </div>
  );
}
