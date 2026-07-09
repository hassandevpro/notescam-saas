import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';

// Décision d'un déblocage par le Coordonnateur Général ou la Fondatrice :
//   refuser | autoriser exceptionnellement | augmenter le budget.
export default function UnlockDecisionModal({ request, onDecide, onClose }) {
  const t = useT();
  const money = useMoney();
  const [granted, setGranted] = useState(request?.requested_amount || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const decide = async (decision) => {
    if (saving) return;
    setSaving(true);
    await onDecide(decision, { grantedAmount: Number(granted) || 0, note: note.trim() });
    setSaving(false);
  };

  const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';

  return (
    <Modal title={t('Décision de déblocage', 'Unlock decision', 'Decisión de desbloqueo')} onClose={onClose} size="sm">
      <div className="space-y-4">
        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-y-1">
          <div className="flex justify-between"><span>{t('Marge demandée', 'Requested margin', 'Margen solicitado')}</span><b>{money(request?.requested_amount || 0)}</b></div>
          {request?.reason && <div className="text-gray-500">{request.reason}</div>}
          {request?.requester && <div className="text-gray-400">{t('Par', 'By', 'Por')} {request.requester}</div>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            {t('Marge accordée', 'Granted margin', 'Margen concedido')}
          </label>
          <input className={field} type="number" min="0" step="1" value={granted} onChange={(e) => setGranted(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">
            {t('Utilisée pour « autoriser » (plafond exceptionnel) ou « augmenter » (planifié).',
               'Used for “authorize” (exceptional cap) or “increase” (planned).',
               'Para “autorizar” (tope excepcional) o “aumentar” (previsto).')}
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Note', 'Note', 'Nota')}</label>
          <textarea className={field} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-2 pt-1">
          <button type="button" disabled={saving} onClick={() => decide('authorized')}
            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {t('Autoriser exceptionnellement', 'Authorize exceptionally', 'Autorizar excepcionalmente')}
          </button>
          <button type="button" disabled={saving} onClick={() => decide('increased')}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {t('Augmenter le budget', 'Increase the budget', 'Aumentar el presupuesto')}
          </button>
          <button type="button" disabled={saving} onClick={() => decide('refused')}
            className="px-4 py-2 text-sm font-semibold text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 disabled:opacity-50">
            {t('Refuser', 'Refuse', 'Rechazar')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
