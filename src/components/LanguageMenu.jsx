// Sélecteur de langue compact pour l'en-tête (à côté de la date).
// Remplace l'ancien sélecteur du bas de la sidebar. Affiche le drapeau + le code
// de la langue courante ; au clic, déroule la liste des langues disponibles.
import { useState, useRef, useEffect } from 'react';
import { useUiStore } from '../store/uiStore';

// Langues proposées (drapeau + libellé natif).
const LANGS = [
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'tr', flag: '🇹🇷', label: 'Türkçe' },
];

export default function LanguageMenu() {
  const uiLang        = useUiStore((s) => s.uiLang);
  const setLangManual = useUiStore((s) => s.setLangManual);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cur = LANGS.find((l) => l.code === uiLang) || LANGS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Langue · Language · Idioma"
        className="flex items-center gap-1 px-1.5 sm:px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
      >
        <span className="text-base leading-none">{cur.flag}</span>
        <span className="hidden md:inline text-xs font-bold text-slate-600 uppercase tracking-wide">{cur.code}</span>
        <span className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-2 w-44 z-[60] bg-white rounded-xl shadow-card-lg border border-slate-200 overflow-hidden py-1"
        >
          {LANGS.map((l) => {
            const active = uiLang === l.code;
            return (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { setLangManual(l.code); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                    active ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-base leading-none">{l.flag}</span>
                  <span className="flex-1 text-left">{l.label}</span>
                  {active && <span className="text-brand-600 font-bold">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
