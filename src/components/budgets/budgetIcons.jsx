// Petit jeu d'icônes SVG inline pour la page Budgets. Remplace les emojis
// (📘 📅 🛰️ ↔ ↕ ⚖ 📡 🗂️), dont le rendu varie selon le système : sur un vieux
// poste Windows ils s'affichent en noir et blanc, en carrés ou pas du tout.
// Aucune dépendance : trait de 2 px hérité de `currentColor`, décoratif (aria-hidden).
const PATHS = {
  book:      <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></>,
  calendar:  <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  satellite: <><circle cx="12" cy="12" r="3" /><path d="M4 12a8 8 0 0 1 8-8M4 12a8 8 0 0 0 8 8M20 12a8 8 0 0 0-8-8M20 12a8 8 0 0 1-8 8" /></>,
  swap:      <><path d="M4 8h14l-3-3M20 16H6l3 3" /></>,
  revise:    <><path d="M12 20V4M6 10l6-6 6 6" /></>,
  scale:     <><path d="M12 4v16M6 20h12M5 8h14" /><path d="M5 8l-2 6a3 3 0 0 0 6 0zM19 8l-2 6a3 3 0 0 0 6 0z" /></>,
  signal:    <><path d="M5 12a10 10 0 0 1 14 0M8 15a6 6 0 0 1 8 0" /><circle cx="12" cy="19" r="1" /></>,
  folder:    <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
};

export default function Icon({ name, className = 'w-4 h-4' }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`inline-block align-[-0.15em] shrink-0 ${className}`}>
      {PATHS[name] || null}
    </svg>
  );
}
