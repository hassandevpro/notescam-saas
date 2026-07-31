// Création / édition d'une RUBRIQUE (catégorie d'agrégation) ou d'une LIGNE
// budgétaire (feuille porteuse du montant annuel + portée). Modèle CIBLE v3.
// Aucune règle métier : le serveur (E3) gèle le montant/portée d'une ligne active.
import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';
import { SCOPE_UI } from './budgetUi';

const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
const lbl = 'block text-xs font-semibold text-gray-500 mb-1';

// mode : 'rubrique' (catégorie, scope null) | 'line' (feuille, scope requis).
export default function LineFormModal({ chapter, mode, parentLabel, frozen = false, onSave, onClose }) {
  const t = useT();
  const money = useMoney();
  const isLine = mode === 'line';
  const editing = !!chapter?.id;
  const [label, setLabel] = useState(chapter?.label || '');
  const [amount, setAmount] = useState(chapter?.planned_amount ?? '');
  const [scope, setScope] = useState(chapter?.scope || 'complex');
  const [saving, setSaving] = useState(false);

  const valid = label.trim() && (!isLine || (amount !== '' && Number(amount) >= 0));

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    await onSave({
      ...chapter,
      label: label.trim(),
      kind: 'depense',
      scope: isLine ? scope : null,
      planned_amount: isLine ? Number(amount) : 0,
    });
    setSaving(false);
  };

  const title = isLine
    ? (editing ? t('Modifier la ligne', 'Edit line', 'Editar línea') : t('Nouvelle ligne budgétaire', 'New budget line', 'Nueva línea'))
    : (editing ? t('Modifier la rubrique', 'Edit category', 'Editar rúbrica') : t('Nouvelle rubrique', 'New category', 'Nueva rúbrica'));

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {parentLabel && (
          <p className="text-xs text-gray-500">{t('Dans la rubrique', 'In category', 'En la rúbrica')} <b>{parentLabel}</b></p>
        )}
        <div>
          <label className={lbl}>{isLine ? t('Nom de la ligne', 'Line name', 'Nombre de línea') : t('Nom de la rubrique', 'Category name', 'Nombre de rúbrica')}</label>
          <input className={field} value={label} autoFocus onChange={(e) => setLabel(e.target.value)}
            placeholder={isLine ? t('Carburant', 'Fuel', 'Combustible') : t('Fonctionnement', 'Operations', 'Funcionamiento')} />
        </div>

        {isLine && (
          <>
            <div>
              <label className={lbl}>{t('Montant annuel de la ligne', 'Line annual amount', 'Monto anual de la línea')}</label>
              <input className={field} type="number" min="0" step="1" value={amount} disabled={frozen}
                placeholder="0" onChange={(e) => setAmount(e.target.value)} />
              {frozen && <p className="text-xs text-amber-600 mt-1">{t('Ligne active : montant non modifiable (réallocation/révision).', 'Active line: amount locked (reallocation/revision).', 'Línea activa: monto bloqueado.')}</p>}
            </div>
            <div>
              <label className={lbl}>{t('Portée de la ligne', 'Line scope', 'Alcance de la línea')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {['complex', 'sectors'].map((s) => (
                  <button type="button" key={s} disabled={frozen} onClick={() => setScope(s)}
                    className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${scope === s ? 'border-indigo-500 ring-2 ring-indigo-200 ' + SCOPE_UI[s].color : 'border-gray-200 hover:border-gray-300'} ${frozen ? 'opacity-60' : ''}`}>
                    <div className="font-semibold">{t(...SCOPE_UI[s].label)}</div>
                    <div className="text-xs text-gray-500">
                      {s === 'complex'
                        ? t('Réparti dans les périodes uniquement', 'Split across periods only', 'Solo por períodos')
                        : t('Réparti entre les secteurs concernés (%)', 'Split across concerned sectors (%)', 'Entre sectores concernidos (%)')}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {amount !== '' && Number(amount) > 0 && (
              <p className="text-xs text-gray-400">{t('Montant annuel', 'Annual amount', 'Monto anual')} : <b className="text-gray-600">{money(Number(amount))}</b> — {t('à répartir ensuite par période' + (scope === 'sectors' ? ' et par secteur' : ''), 'to break down by period' + (scope === 'sectors' ? ' and sector' : ''), 'a repartir por período' + (scope === 'sectors' ? ' y sector' : ''))}.</p>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Annuler', 'Cancel', 'Cancelar')}</button>
          <button type="submit" disabled={!valid || saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
