import { useRegisterSW } from 'virtual:pwa-register/react';

export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 flex items-center gap-3 no-print">
      <span className="text-sm text-gray-700">Nouvelle version disponible</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="btn-primary text-sm"
      >
        Mettre à jour
      </button>
      <button
        onClick={() => updateServiceWorker(false)}
        className="btn-secondary text-sm"
      >
        Plus tard
      </button>
    </div>
  );
}
