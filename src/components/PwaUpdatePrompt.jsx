import { useRegisterSW } from 'virtual:pwa-register/react';
import { useT } from '../lib/i18n';

export default function PwaUpdatePrompt() {
  const t = useT();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 flex items-center gap-3 no-print">
      <span className="text-sm text-gray-700">{t('Nouvelle version disponible', 'New version available', 'Nueva versión disponible')}</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="btn-primary text-sm"
      >
        {t('Mettre à jour', 'Update', 'Actualizar')}
      </button>
      <button
        onClick={() => updateServiceWorker(false)}
        className="btn-secondary text-sm"
      >
        {t('Plus tard', 'Later', 'Más tarde')}
      </button>
    </div>
  );
}
