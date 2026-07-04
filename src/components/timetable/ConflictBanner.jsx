import { useState } from 'react';
import { hhmm } from '../../lib/timetableEngine';

// ── Bandeau d'alerte des conflits ────────────────────────────────────────────
// Affiche « ⚠ N conflits détectés » et déplie le détail localisé de chacun.
// Vert (aucun conflit) → rassurant ; rouge (≥1) → appel à corriger.
function describe(conflict, dayLabels, t) {
  const day = dayLabels[conflict.day - 1] || `J${conflict.day}`;
  const a = conflict.a;
  const win = `${hhmm(a.start_time)}–${hhmm(a.end_time)}`;
  switch (conflict.kind) {
    case 'teacher':
      return t(
        `${conflict.entity} a deux cours en même temps — ${day} à ${win}`,
        `${conflict.entity} has two classes at once — ${day} at ${win}`,
      );
    case 'room':
      return t(
        `Salle « ${conflict.entity} » occupée deux fois — ${day} à ${win}`,
        `Room "${conflict.entity}" double-booked — ${day} at ${win}`,
      );
    case 'class':
      return t(
        `Deux cours simultanés pour la classe « ${conflict.entity} » — ${day} à ${win}`,
        `Two overlapping lessons for class "${conflict.entity}" — ${day} at ${win}`,
      );
    case 'overflow':
      return t(
        `Créneau hors plage horaire — ${day} ${win}`,
        `Slot outside school hours — ${day} ${win}`,
      );
    default:
      return `${day} ${win}`;
  }
}

const KIND_TAG = {
  teacher:  ['Enseignant', 'Teacher'],
  room:     ['Salle', 'Room'],
  class:    ['Classe', 'Class'],
  overflow: ['Horaire', 'Time'],
};

export default function ConflictBanner({ conflicts = [], dayLabels, t }) {
  const [open, setOpen] = useState(false);
  const n = conflicts.length;

  if (n === 0) {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
        {t('Aucun conflit détecté — planning cohérent.', 'No conflicts detected — schedule is consistent.')}
      </div>
    );
  }

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-red-300 bg-red-50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-red-700">
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
          {n} {t(n > 1 ? 'conflits détectés' : 'conflit détecté', n > 1 ? 'conflicts detected' : 'conflict detected')}
        </span>
        <span className="text-xs font-medium text-red-500">
          {open ? t('Masquer', 'Hide') : t('Voir le détail', 'View details')}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-red-100 border-t border-red-200 bg-white/60">
          {conflicts.map((c, i) => (
            <li key={i} className="flex items-start gap-2 px-4 py-2 text-[13px] text-slate-700">
              <span className="mt-0.5 shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                {t(...(KIND_TAG[c.kind] || ['?', '?']))}
              </span>
              {describe(c, dayLabels, t)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
