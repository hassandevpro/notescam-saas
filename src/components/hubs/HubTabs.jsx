import { useState, useEffect } from 'react';

// Coquille de hub réutilisable : titre + barre d'onglets sticky + panneau actif.
// Utilisée pour casser les méga-pages (Paramètres, Année scolaire, Historique)
// en sections modulaires sans réécrire la logique métier.
//
// Props :
//   title, subtitle   en-tête de la page
//   tabs              [{ id, label, icon?, hidden?, render: () => JSX }]
//   storageKey?       persiste l'onglet actif (localStorage) — mode non contrôlé
//   defaultTab?       id de l'onglet par défaut
//   right?            contenu optionnel aligné à droite de l'en-tête
//   activeTab?        mode CONTRÔLÉ : l'id de l'onglet actif est piloté par le parent
//   onTabChange?      callback (id) lors d'un clic — requis avec activeTab
export default function HubTabs({ title, subtitle, tabs, storageKey, defaultTab, right, activeTab, onTabChange }) {
  const visible = tabs.filter((t) => !t.hidden);
  const controlled = activeTab !== undefined;

  const initial = (() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved && visible.some((t) => t.id === saved)) return saved;
      } catch {}
    }
    return defaultTab && visible.some((t) => t.id === defaultTab) ? defaultTab : visible[0]?.id;
  })();

  const [internalActive, setInternalActive] = useState(initial);
  const active = controlled ? activeTab : internalActive;

  // Si l'onglet actif disparaît (changement de rôle/contexte), retombe sur le 1er.
  useEffect(() => {
    if (!controlled && !visible.some((t) => t.id === active)) setInternalActive(visible[0]?.id);
  }, [visible, active, controlled]);

  const select = (id) => {
    if (controlled) { onTabChange?.(id); }
    else { setInternalActive(id); }
    if (storageKey) { try { localStorage.setItem(storageKey, id); } catch {} }
  };

  const current = visible.find((t) => t.id === active) || visible[0];

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {right}
      </div>

      {/* Barre d'onglets — scrollable horizontalement sur mobile */}
      <div className="sticky top-0 z-10 -mx-4 px-4 md:mx-0 md:px-0 bg-slate-50/95 backdrop-blur-sm mb-6">
        <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-slate-200 pb-px">
          {visible.map((tab) => (
            <button
              key={tab.id}
              onClick={() => select(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                active === tab.id
                  ? 'border-brand-500 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              {tab.icon && <span className="w-4 h-4 shrink-0">{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div>{current?.render()}</div>
    </div>
  );
}
