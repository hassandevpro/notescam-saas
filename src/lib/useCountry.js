// Hook React qui renvoie la config pays de l'école courante.
// Utilisation : const country = useCountry(); puis country.cycles, country.periods…
//
// Centralise l'accès à src/countries pour qu'aucune page n'aie à connaître
// la résolution country_system → fallback language → localStorage.

import { useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import { getCountry, resolveCountryCode, COUNTRIES, defaultLangForCountry } from '../countries';

export function useCountry() {
  const school = useAuthStore((s) => s.school);
  return useMemo(() => {
    const code    = resolveCountryCode(school);
    const config  = getCountry(school) || COUNTRIES.cameroon_fr;
    return { code, ...config };
  }, [school?.id, school?.country_system, school?.language]);
}

// Renvoie le code pays courant sans hook React.
export function getCurrentCountryCode() {
  const school = useAuthStore.getState().school;
  return resolveCountryCode(school);
}

// Pour le système de notation FR / EN / ES par défaut associé à un pays.
// Sert quand on crée une classe sans système explicite.
export function defaultSystemForCountry(code) {
  switch (code) {
    case 'cameroon_en': return 'EN';
    case 'guinea_eq':   return 'ES';
    case 'cameroon_fr':
    default:            return 'FR';
  }
}

export { defaultLangForCountry };

// ── Réglages GE décidés par l'administrateur ─────────────────────────────────
// Échelle de notation : /10 (défaut, modèle espagnol) ou /20.
export function geGradeMax(school) {
  return Number(school?.ge_grade_max) === 20 ? 20 : 10;
}

// Coefficients au primaire : désactivés par défaut (matières à poids égal).
export function gePrimaryUsesCoef(school) {
  return school?.ge_primary_coef === true;
}

// Construit les options moteur (maxScale + useCoef) pour une école/cycle donnés.
// Renvoie {} hors Guinée Équatoriale → comportement FR/EN inchangé.
export function gradingOpts(school, cycle) {
  if (resolveCountryCode(school) !== 'guinea_eq') return {};
  const useCoef = cycle === 'primaire' ? gePrimaryUsesCoef(school) : true;
  return { maxScale: geGradeMax(school), useCoef };
}
