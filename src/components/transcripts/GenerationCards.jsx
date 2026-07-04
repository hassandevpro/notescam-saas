// ── Cartes de sélection du type de relevé (Section 3) ────────────────────────
// Remplace le segmented control par des cartes visuelles à icônes (Notion/Canva).
const CARDS = [
  { key: 'single', icon: '👤', label: ['Relevé individuel', 'Individual transcript', 'Certificación individual'], desc: ['Un élève, une année', 'One student, one year', 'Un alumno, un año'] },
  { key: 'class',  icon: '👥', label: ["Relevés d'une classe", 'Class transcripts', 'Por clase'],               desc: ['Toute la classe', 'Whole class', 'Toda la clase'] },
  { key: 'level',  icon: '🏫', label: ["Relevés d'un niveau", 'Level transcripts', 'Por nivel'],                desc: ['Toutes les classes du niveau', 'All classes of a level', 'Todas las clases del nivel'] },
  { key: 'multi',  icon: '📚', label: ['Relevés multi-années', 'Multi-year transcripts', 'Plurianual'],          desc: ['Historique complet', 'Full history', 'Historial completo'] },
  { key: 'all',    icon: '🏛️', label: ['Tous les relevés', 'All transcripts', 'Todas'],                         desc: ['Tout l’établissement', 'Whole school', 'Todo el centro'] },
];

export default function GenerationCards({ mode, onChange, t }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {CARDS.map((c) => {
        const active = mode === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            aria-pressed={active}
            className={`relative flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left shadow-sm transition-all hover:shadow-md ${
              active ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-300' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${active ? 'bg-brand-100' : 'bg-slate-100'}`}>{c.icon}</span>
            <span className={`mt-1 text-[13px] font-bold leading-tight ${active ? 'text-brand-800' : 'text-slate-800'}`}>{t(...c.label)}</span>
            <span className="text-[11px] text-slate-400 leading-tight">{t(...c.desc)}</span>
            {active && (
              <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white">✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
