import { useState, useCallback, useRef } from 'react';
import Modal from './Modal';
import { useT } from '../lib/i18n';

// Dialogue de confirmation cohérent avec le design system (basé sur Modal) —
// remplace `window.confirm` (bloquant, natif, incohérent). Voir `useConfirm`.
export default function ConfirmDialog({
  title, message, confirmLabel, cancelLabel, tone = 'default', onConfirm, onCancel,
}) {
  const t = useT();
  const toneBtn = tone === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700'
    : 'bg-indigo-600 hover:bg-indigo-700';
  return (
    <Modal title={title || t('Confirmer', 'Confirm', 'Confirmar')} onClose={onCancel} size="sm">
      <div className="space-y-5">
        {message && <p className="text-sm text-gray-600 leading-relaxed">{message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            {cancelLabel || t('Annuler', 'Cancel', 'Cancelar')}
          </button>
          <button type="button" autoFocus onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg ${toneBtn}`}>
            {confirmLabel || t('Confirmer', 'Confirm', 'Confirmar')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Hook promise-based : `const { confirm, dialog } = useConfirm();`
//   if (!(await confirm({ message, tone: 'danger', confirmLabel }))) return;
//   { /* … */ dialog /* rendu dans le JSX */ }
// Remplacement quasi-identique de `window.confirm`, sans provider global.
export function useConfirm() {
  const [options, setOptions] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    resolver.current = resolve;
    setOptions(opts);
  }), []);

  const settle = useCallback((result) => {
    setOptions(null);
    if (resolver.current) { resolver.current(result); resolver.current = null; }
  }, []);

  const dialog = options
    ? <ConfirmDialog {...options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
    : null;

  return { confirm, dialog };
}
