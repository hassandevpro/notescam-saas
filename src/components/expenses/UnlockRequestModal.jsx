import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';

// Création d'une demande de déblocage pour une ligne épuisée/dépassée.
export default function UnlockRequestModal({ chapter, defaultAmount = 0, onSubmit, onClose }) {
  const t = useT();
  const money = useMoney();
  const [amount, setAmount] = useState(defaultAmount || '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!amount || saving) return;
    setSaving(true);
    await onSubmit({ requested_amount: Number(amount) || 0, reason: reason.trim(), budget_chapter_id: chapter?.id || null });
    setSaving(false);
  };

  const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <Modal title={t('Demande de déblocage', 'Unlock request', 'Solicitud de desbloqueo')} onClose={onClose} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {chapter && (
          <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            {t('Ligne', 'Line', 'Línea')} : <b>{chapter.label}</b>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            {t('Marge demandée', 'Requested margin', 'Margen solicitado')}
          </label>
          <input className={field} type="number" min="1" step="1" value={amount} autoFocus
            onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          {amount ? <p className="text-xs text-gray-400 mt-1">{money(Number(amount) || 0)}</p> : null}
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            {t('Motif', 'Reason', 'Motivo')}
          </label>
          <textarea className={field} rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={t('Justification de la demande…', 'Justification…', 'Justificación…')} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            {t('Annuler', 'Cancel', 'Cancelar')}
          </button>
          <button type="submit" disabled={!amount || saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? t('Envoi…', 'Sending…', 'Enviando…') : t('Envoyer la demande', 'Send request', 'Enviar solicitud')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
