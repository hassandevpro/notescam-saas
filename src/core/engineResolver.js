// Résolution du moteur pédagogique PAR CLASSE (logique pure, sans React).
//
// Un même établissement peut faire tourner les deux moteurs référentiels en même
// temps : APC (premier cycle, 6e–3e) et SC-MINESEC (second cycle, 2nde–Tle). Le
// moteur dépend donc du NIVEAU de la classe, pas seulement du drapeau école.
//
//   school.bulletin_engine : 'classic' | 'apc_minesec' | 'minesec'
//     - 'classic'      : aucun moteur référentiel — comportement historique.
//     - 'apc_minesec'  : APC sur le premier cycle uniquement.
//     - 'minesec'      : APC (1er cycle) ET SC-MINESEC (2nd cycle) selon le niveau.

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Niveau premier cycle (collège) : 6e/5e/4e/3e.
export const isFirstCycle = (level, name = '') => {
  const n = norm(level) + ' ' + norm(name);
  return /\b6e|6eme|sixi|\b5e|5eme|cinqu|\b4e|4eme|quatr|\b3e|3eme|troisi/.test(n.replace(/\s+/g, ''));
};

// Niveau second cycle (lycée général) : Seconde / Première / Terminale.
export const isSecondCycle = (level, name = '') => {
  const n = (norm(level) + ' ' + norm(name)).replace(/\s+/g, '');
  return /2nde|2de|seconde|1ere|1re|premiere|tle|tale|terminale/.test(n);
};

// Slug de classe premier cycle référentiel APC ('6e'|'5e'|'4e'|'3e') ou null.
export const firstCycleClasseSlug = (level, name = '') => {
  const n = (norm(level) + ' ' + norm(name)).replace(/\s+/g, '');
  if (/6e|6eme|sixi/.test(n)) return '6e';
  if (/5e|5eme|cinqu/.test(n)) return '5e';
  if (/4e|4eme|quatr/.test(n)) return '4e';
  if (/3e|3eme|troisi/.test(n)) return '3e';
  return null;
};

// Slug de classe second cycle ('2nde' | '1ere' | 'tle') ou null.
export const secondCycleClasseSlug = (level, name = '') => {
  const n = (norm(level) + ' ' + norm(name)).replace(/\s+/g, '');
  if (/2nde|2de|seconde/.test(n)) return '2nde';
  if (/1ere|1re|premiere/.test(n)) return '1ere';
  if (/tle|tale|terminale/.test(n)) return 'tle';
  return null;
};

// Moteur effectif d'une classe : 'apc' | 'sc' | 'classic'.
export function resolveClassEngine(school, cls) {
  const engine = school?.bulletin_engine || 'classic';
  if (engine === 'classic') return 'classic';
  const level = cls?.level || '';
  const name  = cls?.name || '';
  if (isFirstCycle(level, name) && (engine === 'apc_minesec' || engine === 'minesec')) return 'apc';
  if (engine === 'minesec' && (cls?.serie || isSecondCycle(level, name))) return 'sc';
  return 'classic';
}
