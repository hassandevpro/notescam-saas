// ── Sélecteur de vue (Classe / Enseignant / Salle / Matière) ─────────────────
// Segmented control façon Linear + sélecteur d'entité contextuel. Le même
// planning est relu sous quatre angles ; chaque vue redéfinit ce que filtre le
// sélecteur de droite.
const VIEW_META = {
  class:   { label: ['Classe', 'Class', 'Clase'],          icon: 'M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z' },
  teacher: { label: ['Enseignant', 'Teacher', 'Profesor'], icon: 'M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z' },
  room:    { label: ['Salle', 'Room', 'Aula'],             icon: 'M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z' },
  subject: { label: ['Matière', 'Subject', 'Asignatura'],  icon: 'M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z' },
};

export default function ViewSwitcher({
  views, view, onViewChange, entities = [], entityId, onEntityChange,
  entityPlaceholder, t,
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Segmented control des vues */}
      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
        {views.map((v) => {
          const meta = VIEW_META[v];
          const activeView = view === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeView ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d={meta.icon} /></svg>
              {t(...meta.label)}
            </button>
          );
        })}
      </div>

      {/* Sélecteur d'entité contextuel */}
      {entities.length > 0 && (
        <select
          className="form-input text-sm"
          style={{ width: 'auto', minWidth: 170 }}
          value={entityId || ''}
          onChange={(e) => onEntityChange(e.target.value)}
        >
          {entityPlaceholder && <option value="">{entityPlaceholder}</option>}
          {entities.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
