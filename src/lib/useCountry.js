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

// ── Mode de gestion des notes (réglage école) ───────────────────────────────
// 'principal' (défaut, historique) : l'enseignant titulaire saisit toutes les
//   matières de sa classe.
// 'subject' : chaque enseignant ne saisit que les matières qui lui sont
//   affectées (subjects.teacher_id). Tout le reste (calculs, bulletins,
//   classements, conseils…) reste identique.
export function gradeEntryMode(school) {
  return school?.grade_entry_mode === 'subject' ? 'subject' : 'principal';
}

// Barème de sortie effectif d'une classe (moyenne générale + affichages).
// Champ explicite `classes.grade_max` si défini, sinon défaut système :
// FR → /20, EN → /100, ES → réglage école (/10 ou /20). Rétrocompatible : une
// classe sans grade_max retombe exactement sur l'ancien comportement.
export function classScale(cls, school) {
  const explicit = Number(cls?.grade_max);
  if (explicit > 0) return explicit;
  const sys = cls?.system || 'FR';
  if (sys === 'ES') return geGradeMax(school);
  return sys === 'EN' ? 100 : 20;
}
