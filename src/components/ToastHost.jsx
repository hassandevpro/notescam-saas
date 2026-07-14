// Pile de toasts globale (bas-droite, empilée). Monté une seule fois dans App.
// S'abonne au toastStore ; auto-disparition gérée par le store.
import { useToastStore } from '../store/toastStore';

const TONE = {
  success: { bar: 'bg-emerald-500', icon: '✓', ring: 'border-emerald-100' },
  error:   { bar: 'bg-rose-500',    icon: '⚠', ring: 'border-rose-100' },
  info:    { bar: 'bg-indigo-500',  icon: 'ℹ', ring: 'border-indigo-100' },
};

export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,22rem)]" role="status" aria-live="polite">
      <style>{`@keyframes toast-in{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
      {toasts.map((tst) => {
        const tone = TONE[tst.type] || TONE.info;
        return (
          <div key={tst.id}
            className={`flex items-start gap-3 bg-white rounded-xl shadow-lg border ${tone.ring} overflow-hidden`}
            style={{ animation: 'toast-in 0.18s ease-out' }}>
            <span className={`w-1.5 self-stretch shrink-0 ${tone.bar}`} />
            <span className={`mt-2.5 text-sm ${tst.type === 'error' ? 'text-rose-600' : tst.type === 'success' ? 'text-emerald-600' : 'text-indigo-600'}`}>{tone.icon}</span>
            <p className="flex-1 py-2.5 text-sm text-gray-700 leading-snug">{tst.message}</p>
            <button onClick={() => remove(tst.id)} aria-label="Fermer"
              className="shrink-0 mt-1.5 mr-1.5 p-1 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 111.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z" clipRule="evenodd" /></svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
