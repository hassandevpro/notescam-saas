// Petits éléments d'interface de la page « Saisie des notes » du primaire : infobulle ⓘ, menu « ⋯ Plus »,
// sélecteur segmenté, tiroir d'avertissements. Sobres : filets gris fins, un seul accent, aucun aplat.
import { useEffect, useRef, useState } from 'react';

/** ⓘ — l'aide longue vit ici, pas dans la page. Au survol, au focus clavier et au toucher. */
export function Info({ texte, className = '' }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={texte}
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        onBlur={() => setOuvert(false)}
        onMouseEnter={() => setOuvert(true)}
        onMouseLeave={() => setOuvert(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold leading-none text-gray-500 hover:border-gray-400 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        i
      </button>
      {ouvert && (
        <span role="tooltip" className="absolute left-1/2 top-full z-50 mt-1.5 w-64 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-2.5 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-gray-600 shadow-md">
          {texte}
        </span>
      )}
    </span>
  );
}

/** Sélecteur segmenté : options = [{ valeur, libelle, desactive }]. */
export function Segmente({ valeur, options, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.valeur}
          type="button"
          disabled={o.desactive}
          aria-pressed={valeur === o.valeur}
          onClick={() => onChange(o.valeur)}
          className={`rounded-md px-3 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-40 ${
            valeur === o.valeur ? 'bg-white font-medium text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
        >
          {o.libelle}
        </button>
      ))}
    </div>
  );
}

/** Menu « ⋯ Plus » : items = [{ id, libelle, onClick, cache }]. */
export function MenuPlus({ items, libelle = 'Plus', icone = '⋯' }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (ref.current && !ref.current.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap); };
  }, [ouvert]);
  const visibles = items.filter((i) => !i.cache);
  if (!visibles.length) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <span aria-hidden="true">{icone}</span> {libelle}
      </button>
      {ouvert && (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-60 rounded-lg border border-gray-200 bg-white py-1 shadow-md">
          {visibles.map((i) => (
            <button
              key={i.id}
              type="button"
              role="menuitem"
              onClick={() => { setOuvert(false); i.onClick(); }}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
            >
              {i.libelle}
              {i.note ? <span className="ml-1.5 text-xs text-gray-400">{i.note}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * « ⚠ N avertissements » : un seul indicateur, qui ouvre un tiroir latéral avec le détail et les actions.
 * avertissements = [{ id, titre, detail, actions: [{ libelle, onClick }] }]
 */
export function Avertissements({ avertissements, t }) {
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    if (!ouvert) return undefined;
    const echap = (e) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [ouvert]);
  if (!avertissements.length) return null;
  const n = avertissements.length;
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-800 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <span aria-hidden="true">⚠</span> {n} {n > 1 ? t('avertissements', 'warnings') : t('avertissement', 'warning')}
      </button>
      {ouvert && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/20" onMouseDown={(e) => { if (e.target === e.currentTarget) setOuvert(false); }}>
          <aside role="dialog" aria-label={t('Avertissements', 'Warnings')} className="h-full w-full max-w-md overflow-auto border-l border-gray-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">{t('Avertissements', 'Warnings')}</h2>
              <button type="button" onClick={() => setOuvert(false)} className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100" aria-label={t('Fermer', 'Close')}>✕</button>
            </div>
            <ul className="space-y-4">
              {avertissements.map((a) => (
                <li key={a.id} className="border-b border-gray-100 pb-4 last:border-0">
                  <p className="text-sm font-medium text-gray-800">{a.titre}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{a.detail}</p>
                  {a.actions?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {a.actions.map((ac) => (
                        <button key={ac.libelle} type="button" onClick={() => { setOuvert(false); ac.onClick(); }}
                          className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">
                          {ac.libelle}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </>
  );
}
