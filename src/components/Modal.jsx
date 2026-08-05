import { useEffect } from 'react';

const SIZE_CLASSES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function Modal({ title, onClose, size = 'md', children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-md"
        onClick={onClose}
      />
      {/* Panel — feuille du bas sur mobile (pattern natif, cohérent avec MoreSheet),
          dialogue centré ≥ md. `dvh` (pas `vh`) : évite que le panneau déborde sous
          la barre d'adresse mobile et coince le contenu hors d'atteinte. */}
      <div
        className={`relative bg-white w-full ${SIZE_CLASSES[size] ?? SIZE_CLASSES.md} max-h-[85dvh] md:max-h-[90dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl animate-slide-up md:animate-fade-up`}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 md:hidden" />
        <div className="flex items-center justify-between px-6 pt-3 md:pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:pb-5">{children}</div>
      </div>
    </div>
  );
}
