// Modales des opérations tracées P5 : réallocation, révision annuelle, décision.
// Elles ne font que saisir + déléguer aux RPC serveur (autorité finale).
import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';

const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
const lbl = 'block text-xs font-semibold text-gray-500 mb-1';

function Actions({ saving, disabled, onClose, t, label }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Annuler', 'Cancel', 'Cancelar')}</button>
      <button type="submit" disabled={disabled || saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
        {saving ? t('Envoi…', 'Sending…', 'Enviando…') : (label || t('Envoyer', 'Send', 'Enviar'))}
      </button>
    </div>
  );
}

// Réallocation depuis `node` (période ou secteur) vers une enveloppe SŒUR.
export function ReallocationModal({ node, siblings = [], available = 0, onSubmit, onClose }) {
  const t = useT();
  const money = useMoney();
  const [destId, setDestId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const over = amount !== '' && Number(amount) > available;

  const submit = async (e) => {
    e.preventDefault();
    if (!destId || amount === '' || Number(amount) <= 0 || !reason.trim() || saving) return;
    setSaving(true);
    await onSubmit({ destId, amount: Math.trunc(Number(amount)), reason: reason.trim() });
    setSaving(false);
  };

  return (
    <Modal title={t('Proposer une réallocation', 'Propose a reallocation', 'Proponer una reasignación')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          {t('Depuis', 'From', 'Desde')} : <b>{node.label}</b> · {t('disponible', 'available', 'disponible')} <b>{money(available)}</b>
        </div>
        <div>
          <label className={lbl}>{t('Vers (enveloppe sœur)', 'To (sibling envelope)', 'Hacia (sobre hermano)')}</label>
          <select className={field} value={destId} onChange={(e) => setDestId(e.target.value)}>
            <option value="">{t('— choisir —', '— choose —', '— elegir —')}</option>
            {siblings.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>{t('Montant à transférer', 'Amount to transfer', 'Monto a transferir')}</label>
          <input className={field} type="number" min="1" step="1" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} />
          {over && <p className="text-xs text-amber-600 mt-1">{t('Supérieur au disponible — l’application vérifiera les engagements.', 'Above available — application will check commitments.', 'Superior al disponible — se verificarán los compromisos.')}</p>}
        </div>
        <div>
          <label className={lbl}>{t('Motif (obligatoire)', 'Reason (required)', 'Motivo (obligatorio)')}</label>
          <textarea className={field} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Actions saving={saving} disabled={!destId || amount === '' || !reason.trim()} onClose={onClose} t={t}
          label={t('Proposer', 'Propose', 'Proponer')} />
      </form>
    </Modal>
  );
}

// Révision du budget annuel.
export function RevisionModal({ annual, onSubmit, onClose }) {
  const t = useT();
  const money = useMoney();
  const current = Number(annual?.envelope_amount) || 0;
  const [amount, setAmount] = useState(current);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const delta = (amount === '' ? 0 : Number(amount)) - current;

  const submit = async (e) => {
    e.preventDefault();
    if (amount === '' || Number(amount) < 0 || !reason.trim() || saving) return;
    setSaving(true);
    await onSubmit({ newAmount: Math.trunc(Number(amount)), reason: reason.trim() });
    setSaving(false);
  };

  return (
    <Modal title={t('Proposer une révision annuelle', 'Propose an annual revision', 'Proponer una revisión anual')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          {t('Budget annuel actuel', 'Current annual budget', 'Presupuesto anual actual')} : <b>{money(current)}</b>
        </div>
        <div>
          <label className={lbl}>{t('Nouveau montant annuel', 'New annual amount', 'Nuevo monto anual')}</label>
          <input className={field} type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          <p className={`text-xs mt-1 ${delta < 0 ? 'text-rose-600' : delta > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
            {t('Variation', 'Change', 'Variación')} : {delta >= 0 ? '+' : ''}{money(delta)}
          </p>
        </div>
        <div>
          <label className={lbl}>{t('Motif (obligatoire)', 'Reason (required)', 'Motivo (obligatorio)')}</label>
          <textarea className={field} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <p className="text-[11px] text-gray-400">{t('Opération exceptionnelle et tracée ; validée par une autorité habilitée.', 'Exceptional, traced operation; approved by an authorized authority.', 'Operación excepcional y trazada; validada por una autoridad habilitada.')}</p>
        <Actions saving={saving} disabled={amount === '' || !reason.trim()} onClose={onClose} t={t} label={t('Proposer', 'Propose', 'Proponer')} />
      </form>
    </Modal>
  );
}

// Décision (approuver / refuser) d'une opération en attente.
export function OpDecisionModal({ title, onDecide, onClose }) {
  const t = useT();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const go = async (decision) => {
    setSaving(true);
    await onDecide({ decision, note: note.trim() });
    setSaving(false);
  };
  return (
    <Modal title={title || t('Décision', 'Decision', 'Decisión')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={lbl}>{t('Note (facultative)', 'Note (optional)', 'Nota (opcional)')}</label>
          <textarea className={field} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Fermer', 'Close', 'Cerrar')}</button>
          <button type="button" disabled={saving} onClick={() => go('refuse')} className="px-4 py-2 text-sm font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg disabled:opacity-50">{t('Refuser', 'Refuse', 'Rechazar')}</button>
          <button type="button" disabled={saving} onClick={() => go('approve')} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">{t('Approuver & appliquer', 'Approve & apply', 'Aprobar y aplicar')}</button>
        </div>
      </div>
    </Modal>
  );
}
