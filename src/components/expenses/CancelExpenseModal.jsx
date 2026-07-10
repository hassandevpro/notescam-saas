import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';

// Annulation TRACÉE d'une dépense (Phase A.1) : demande un motif OBLIGATOIRE, puis
// bascule la dépense en statut `cancelled` (conservée en base, exclue des agrégats).
// Remplace la suppression physique pour toute dépense non `draft` / non `paid`.
export default function CancelExpenseModal({ expense, onConfirm, onClose }) {
  const t = useT();
  const money = useMoney();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim() || saving) return;
    setSaving(true);
    await onConfirm({ reason: reason.trim() });
    setSaving(false);
  };

  return (
    <Modal title={t('Annuler la dépense', 'Cancel expense', 'Anular gasto')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t(
            "La dépense sera annulée et conservée dans l'historique (elle n'est pas supprimée). Elle ne comptera plus dans le budget engagé.",
            'The expense will be cancelled and kept in history (it is not deleted). It will no longer count toward the committed budget.',
            'El gasto se anulará y se conservará en el historial (no se elimina). Dejará de contar en el presupuesto comprometido.',
          )}
        </div>

        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <b>{expense.category || t('Dépense', 'Expense', 'Gasto')}</b> · <span className="tabular-nums">{money(expense.amount)}</span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            {t("Motif de l'annulation (obligatoire)", 'Cancellation reason (required)', 'Motivo de la anulación (obligatorio)')}
          </label>
          <textarea
            autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
            placeholder={t('Ex. : doublon, prestation annulée, erreur de saisie…', 'e.g. duplicate, service cancelled, data-entry error…', 'Ej.: duplicado, servicio anulado, error de captura…')}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            {t('Retour', 'Back', 'Volver')}
          </button>
          <button type="submit" disabled={!reason.trim() || saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50">
            {saving ? t('Annulation…', 'Cancelling…', 'Anulando…') : t("Confirmer l'annulation", 'Confirm cancellation', 'Confirmar anulación')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
