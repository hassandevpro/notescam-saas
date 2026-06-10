// Champ de date natif (<input type="date">).
// Valeur échangée : chaîne ISO 'YYYY-MM-DD' (ou '' si vide) — format natif
// des inputs date, donc aucune conversion nécessaire.
import { localeForLang } from '../lib/i18n';

export default function DateField({ value, onChange, disabled = false, locale, className = '' }) {
  return (
    <input
      type="date"
      lang={locale || localeForLang()}
      disabled={disabled}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className={`form-input py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500 ${className}`}
    />
  );
}
