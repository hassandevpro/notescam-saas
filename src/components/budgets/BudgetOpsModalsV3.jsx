// Opérations budgétaires V3 : réallocation ENTRE LIGNES (transfert de montant
// annuel, total inchangé) + révision du budget annuel. Aucune règle métier : le
// SERVEUR (RPC SECURITY DEFINER / budgetOps) valide, applique atomiquement et
// historise. Les modales ne font que collecter les champs.
import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';

const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
const lbl = 'block text-xs font-semibold text-gray-500 mb-1';

// Réallocation entre deux lignes actives du même budget annuel.
export function LineReallocationModal({ lines = [], onSubmit, onClose }) {
  const t = useT();
  const money = useMoney();
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const source = lines.find((l) => l.id === sourceId) || null;
  const valid = sourceId && destId && sourceId !== destId && amount !== '' && Number(amount) > 0 && reason.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    await onSubmit({ sourceChapterId: sourceId, destChapterId: destId, amount: Number(amount), reason: reason.trim() });
    setSaving(false);
  };

  return (
    <Modal title={t('Réallouer entre lignes', 'Reallocate between lines', 'Reasignar entre líneas')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-gray-500">{t('Transfère un montant d’une ligne vers une autre — le budget annuel global reste inchangé.', 'Transfers an amount from one line to another — the global annual budget stays unchanged.', 'Transfiere sin cambiar el total anual.')}</p>
        <div>
          <label className={lbl}>{t('Ligne source', 'Source line', 'Línea origen')}</label>
          <select className={field} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">{t('— choisir —', '— choose —', '— elegir —')}</option>
            {lines.map((l) => <option key={l.id} value={l.id}>{l.label} · {money(l.planned_amount)}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>{t('Ligne destination', 'Destination line', 'Línea destino')}</label>
          <select className={field} value={destId} onChange={(e) => setDestId(e.target.value)}>
            <option value="">{t('— choisir —', '— choose —', '— elegir —')}</option>
            {lines.filter((l) => l.id !== sourceId).map((l) => <option key={l.id} value={l.id}>{l.label} · {money(l.planned_amount)}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>{t('Montant à transférer', 'Amount to transfer', 'Monto a transferir')}</label>
          <input className={field} type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          {source && <p className="text-[11px] text-gray-400 mt-1">{t('Montant actuel de la source', 'Current source amount', 'Monto actual origen')} : {money(source.planned_amount)}</p>}
        </div>
        <div>
          <label className={lbl}>{t('Motif (obligatoire)', 'Reason (required)', 'Motivo (obligatorio)')}</label>
          <textarea className={field} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Actions saving={saving} disabled={!valid} onClose={onClose} t={t} />
      </form>
    </Modal>
  );
}

// Révision du budget annuel (modifie le total autorisé).
export function AnnualRevisionModal({ annual, onSubmit, onClose }) {
  const t = useT();
  const money = useMoney();
  const [amount, setAmount] = useState(annual?.envelope_amount ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = amount !== '' && Number(amount) >= 0 && reason.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    await onSubmit({ newAmount: Number(amount), reason: reason.trim() });
    setSaving(false);
  };

  return (
    <Modal title={t('Réviser le budget annuel', 'Revise annual budget', 'Revisar presupuesto anual')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-gray-500">{t('Modifie le montant annuel global autorisé (jamais en dessous des lignes activées ni des engagements).', 'Changes the authorized global annual amount (never below activated lines or commitments).', 'Cambia el monto anual autorizado.')}</p>
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          {t('Enveloppe actuelle', 'Current envelope', 'Envolvente actual')} : <b>{money(annual?.envelope_amount || 0)}</b>
        </div>
        <div>
          <label className={lbl}>{t('Nouveau montant annuel', 'New annual amount', 'Nuevo monto anual')}</label>
          <input className={field} type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
        </div>
        <div>
          <label className={lbl}>{t('Motif (obligatoire)', 'Reason (required)', 'Motivo (obligatorio)')}</label>
          <textarea className={field} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Actions saving={saving} disabled={!valid} onClose={onClose} t={t} />
      </form>
    </Modal>
  );
}

export function OpDecisionModal({ title, onDecide, onClose }) {
  const t = useT();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const decide = async (decision) => {
    if (saving) return;
    setSaving(true);
    await onDecide({ decision, note: note.trim() });
    setSaving(false);
  };
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={lbl}>{t('Note de décision (facultative)', 'Decision note (optional)', 'Nota (opcional)')}</label>
          <textarea className={field} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Fermer', 'Close', 'Cerrar')}</button>
          <button type="button" disabled={saving} onClick={() => decide('refuse')} className="px-4 py-2 text-sm font-semibold text-rose-700 bg-rose-50 rounded-lg hover:bg-rose-100 disabled:opacity-50">{t('Refuser', 'Refuse', 'Rechazar')}</button>
          <button type="button" disabled={saving} onClick={() => decide('approve')} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{t('Approuver', 'Approve', 'Aprobar')}</button>
        </div>
      </div>
    </Modal>
  );
}

function Actions({ saving, disabled, onClose, t }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Annuler', 'Cancel', 'Cancelar')}</button>
      <button type="submit" disabled={disabled || saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
        {saving ? t('Envoi…', 'Sending…', 'Enviando…') : t('Proposer', 'Propose', 'Proponer')}
      </button>
    </div>
  );
}
