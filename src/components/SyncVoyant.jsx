// src/components/SyncVoyant.jsx
// L'AFFICHAGE du voyant de synchronisation, commun aux deux éditions : un bouton
// (pastille + glyphe + mot) et un petit panneau de détail. Il ne décide de rien —
// le verdict vient de src/lib/syncStatus.js (SyncBadge côté LAN, CloudSyncBadge
// côté Cloud).
//
// Le niveau est écrit EN TOUTES LETTRES à côté de la couleur : un voyant qu'on ne
// distingue qu'à sa teinte est illisible pour un daltonien et sur un projecteur.
// Le mot reste visible sur petit écran (seul le détail est replié dans le panneau).
import { useEffect, useRef, useState } from 'react';
import { NIVEAUX } from '../lib/syncStatus';

const LOOK = {
  [NIVEAUX.OK]:      { court: 'Sync OK',    glyphe: '✓', pastille: 'bg-green-500', bouton: 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100' },
  [NIVEAUX.ATTENTE]: { court: 'En attente', glyphe: '⏳', pastille: 'bg-amber-500', bouton: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' },
  [NIVEAUX.ECHEC]:   { court: 'Échec',      glyphe: '✕', pastille: 'bg-red-500',   bouton: 'bg-red-50 text-red-800 border-red-200 hover:bg-red-100' },
  [NIVEAUX.INACTIF]: { court: 'Sync off',   glyphe: '○', pastille: 'bg-slate-400', bouton: 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100' },
};

export default function SyncVoyant({ verdict, actionLabel, onAction, origine }) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef(null);

  // Ferme le panneau au clic ailleurs.
  useEffect(() => {
    if (!ouvert) return undefined;
    const hors = (e) => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    document.addEventListener('mousedown', hors);
    return () => document.removeEventListener('mousedown', hors);
  }, [ouvert]);

  if (!verdict) return null;
  const look = LOOK[verdict.niveau] || LOOK[NIVEAUX.INACTIF];

  return (
    <div className="relative" ref={boite}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${look.bouton}`}
        aria-label={`Synchronisation ${origine} : ${verdict.libelle}`}
        aria-expanded={ouvert}
        title={verdict.libelle}
        data-testid="sync-voyant"
        data-niveau={verdict.niveau}
        data-origine={origine}
      >
        <span className={`h-2 w-2 rounded-full ${look.pastille}`} aria-hidden="true" />
        <span aria-hidden="true">{look.glyphe}</span>
        <span>{look.court}</span>
      </button>

      {ouvert && (
        <div role="status" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
          <p className="font-bold text-slate-800">{verdict.libelle}</p>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
            {verdict.details.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
          {onAction && (
            <button
              type="button"
              className="mt-3 w-full rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              onClick={() => { setOuvert(false); onAction(); }}
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
