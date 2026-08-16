// Périmètre d'un membre « vie scolaire » (surveillant / censeur) — logique pure.
//
// Un surveillant peut être rattaché à une combinaison de :
//   • SECTIONS  ('maternelle' | 'primaire' | 'premier_cycle' | 'second_cycle')
//   • CYCLES    ('fondamental' | 'secondaire')
//   • CLASSES   (ids précis)
//
// Sémantique : une classe est ACCESSIBLE si elle correspond à AU MOINS UNE des
// dimensions renseignées. Si AUCUNE dimension n'est renseignée (les trois vides
// ou nulles), le périmètre est l'établissement ENTIER — rétro-compatible avec
// les surveillants existants qui voyaient tout.
//
// Réutilise la classification de sections d'engineResolver : aucune notion
// pays/UI ici, uniquement le niveau/nom de la classe.

import { classSectionKey, SECTIONS } from './engineResolver.js';

// Les deux grands cycles regroupent les sections pédagogiques.
export const CYCLES = [
  { key: 'fondamental', fr: 'Fondamental', en: 'Basic education', es: 'Fundamental',
    sections: ['maternelle', 'primaire'] },
  { key: 'secondaire',  fr: 'Secondaire',  en: 'Secondary',       es: 'Secundaria',
    sections: ['premier_cycle', 'second_cycle'] },
];

// Section → cycle ('autre' n'appartient à aucun des deux).
const SECTION_TO_CYCLE = CYCLES.reduce((acc, c) => {
  for (const s of c.sections) acc[s] = c.key;
  return acc;
}, {});

// Cycle pédagogique d'une classe ('fondamental' | 'secondaire' | null).
export function classCycleKey(cls) {
  return SECTION_TO_CYCLE[classSectionKey(cls)] || null;
}

// Une dimension de périmètre, quelle que soit sa provenance :
//   • Postgres (cloud) renvoie un vrai tableau (colonnes text[] / uuid[]) ;
//   • SQLite (édition LAN) n'a pas de type tableau : la colonne est du TEXT
//     contenant du JSON ('["fondamental"]').
// Sans cette tolérance, le périmètre d'un compte LAN était silencieusement lu
// comme vide — donc « tout l'établissement » — alors qu'il était bien enregistré.
function toList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

// Normalise un périmètre potentiellement partiel/nul en tableaux garantis.
export function normalizeScope(scope) {
  return {
    sections: toList(scope?.sections ?? scope?.scope_sections),
    cycles:   toList(scope?.cycles   ?? scope?.scope_cycles),
    classIds: toList(scope?.classIds ?? scope?.scope_class_ids),
  };
}

// Un périmètre est « global » (tout l'établissement) si aucune dimension n'est fixée.
export function isGlobalScope(scope) {
  const s = normalizeScope(scope);
  return s.sections.length === 0 && s.cycles.length === 0 && s.classIds.length === 0;
}

// La classe `cls` est-elle dans le périmètre `scope` ?
export function scopeAllowsClass(scope, cls) {
  if (!cls) return false;
  const s = normalizeScope(scope);
  if (s.sections.length === 0 && s.cycles.length === 0 && s.classIds.length === 0) return true;

  if (s.classIds.length && s.classIds.includes(cls.id)) return true;
  if (s.sections.length && s.sections.includes(classSectionKey(cls))) return true;
  if (s.cycles.length && s.cycles.includes(classCycleKey(cls))) return true;
  return false;
}

// Filtre une liste de classes selon le périmètre.
export function filterClassesByScope(scope, classes = []) {
  if (isGlobalScope(scope)) return classes;
  return classes.filter((c) => scopeAllowsClass(scope, c));
}

// Résumé lisible du périmètre pour l'UI (sidebar/profil), ex. « Primaire · Collège ».
// `t` = fonction i18n t(fr,en,es). Renvoie '' si périmètre global.
export function scopeSummary(scope, t) {
  const s = normalizeScope(scope);
  if (isGlobalScope(s)) return '';
  const parts = [];
  for (const key of s.cycles) {
    const c = CYCLES.find((x) => x.key === key);
    if (c) parts.push(t(c.fr, c.en, c.es));
  }
  for (const key of s.sections) {
    const sec = SECTIONS.find((x) => x.key === key);
    if (sec) parts.push(t(sec.fr, sec.en, sec.es));
  }
  if (s.classIds.length) parts.push(t(`${s.classIds.length} classe(s)`, `${s.classIds.length} class(es)`, `${s.classIds.length} clase(s)`));
  return parts.join(' · ');
}
