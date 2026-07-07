// Résolution du moteur pédagogique PAR CLASSE (logique pure, sans React).
//
// Un même établissement peut faire tourner PLUSIEURS moteurs référentiels en même
// temps selon le NIVEAU de la classe (pas seulement le drapeau école) :
//   • maternelle    (PS/MS/GS)                    → domaines pédagogiques (A/ECA/NA)
//   • apc_primaire  (SIL…CM2)                      → compétences nationales APC
//   • apc           (6e–3e, premier cycle sec.)    → compétences MINESEC
//   • sc            (2nde–Tle, second cycle sec.)  → matières/séries MINESEC
//   • classic       (tout le reste)                → notes/20 historiques
//
//   school.bulletin_engine :
//     - 'classic'      : aucun moteur référentiel — comportement historique.
//     - 'maternelle'   : maternelle par domaines (niveaux PS/MS/GS uniquement).
//     - 'apc_primaire' : primaire APC par compétences (SIL…CM2 uniquement).
//     - 'minedub'      : PARAPLUIE fondamental — maternelle SUR PS/MS/GS + APC
//                        primaire SUR SIL…CM2 selon le niveau de la classe.
//     - 'apc_minesec'  : APC sur le premier cycle secondaire uniquement.
//     - 'minesec'      : APC (1er cycle) ET SC-MINESEC (2nd cycle) selon le niveau.
//
// SURCHARGE PAR CLASSE : `classes.bulletin_engine` (nullable) prime sur le drapeau
// école. Permet à une école privée « classique » d'exposer une classe APC, ou à
// une école MINEDUB de forcer une classe en notes/20 classiques.

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Jetons alphanumériques normalisés d'un (niveau, nom) — évite les collisions des
// codes courts (ps, cp, ce1…) qu'un simple `includes` sur chaîne provoquerait.
const tokens = (level, name = '') =>
  (norm(level) + ' ' + norm(name)).split(/[^a-z0-9]+/).filter(Boolean);

// Niveau premier cycle (collège) : 6e/5e/4e/3e. Sous-système anglophone (Cameroun
// bilingue) : Form 1–5 (fin O-Level) sont aussi du premier cycle.
export const isFirstCycle = (level, name = '') => firstCycleClasseSlug(level, name) !== null;

// Niveau second cycle (lycée général) : Seconde / Première / Terminale, ou
// anglophone Lower/Upper Sixth (A-Level).
export const isSecondCycle = (level, name = '') => secondCycleClasseSlug(level, name) !== null;

// Slug de classe premier cycle référentiel :
//   • francophone → '6e'|'5e'|'4e'|'3e' (référentiel APC MINESEC français) ;
//   • anglophone  → 'form1'…'form5' (référentiel CBA anglophone DÉDIÉ, clés
//     distinctes → les deux référentiels coexistent sans collision).
// null si le niveau n'est pas un premier cycle.
export const firstCycleClasseSlug = (level, name = '') => {
  const n = (norm(level) + ' ' + norm(name)).replace(/\s+/g, '');
  if (/6e|6eme|sixi/.test(n)) return '6e';
  if (/5e|5eme|cinqu/.test(n)) return '5e';
  if (/4e|4eme|quatr/.test(n)) return '4e';
  if (/3e|3eme|troisi/.test(n)) return '3e';
  const f = n.match(/form([1-5])/);
  if (f) return `form${f[1]}`;
  return null;
};

// Slug de classe second cycle ('2nde' | '1ere' | 'tle') ou null.
// Anglophone : Lower Sixth → 1ere, Upper Sixth → tle (A-Level = Première+Terminale).
export const secondCycleClasseSlug = (level, name = '') => {
  const n = (norm(level) + ' ' + norm(name)).replace(/\s+/g, '');
  if (/2nde|2de|seconde/.test(n)) return '2nde';
  if (/1ere|1re|premiere/.test(n)) return '1ere';
  if (/tle|tale|terminale/.test(n)) return 'tle';
  if (/lowersixth|lower6|\bl6\b|1stsixth/.test(n)) return '1ere';
  if (/uppersixth|upper6|\bu6\b|2ndsixth/.test(n)) return 'tle';
  return null;
};

// ── FONDAMENTAL : maternelle (PS/MS/GS) et primaire APC (SIL…CM2) ─────────────

// Niveau maternelle → slug référentiel 'ps' | 'ms' | 'gs', sinon null.
// Anglophone : Nursery 1→PS, 2→MS, 3→GS ; Kindergarten / KG → GS.
export const maternelleNiveauSlug = (level, name = '') => {
  const t = tokens(level, name);
  const s = t.join(' ');
  if (t.includes('ps') || /petite section/.test(s)) return 'ps';
  if (t.includes('ms') || /moyenne section/.test(s)) return 'ms';
  if (t.includes('gs') || /grande section/.test(s)) return 'gs';
  const n = (norm(level) + ' ' + norm(name)).replace(/\s+/g, '');
  // Pré-maternelle (« Pre-Nursery » / « Pré-nursery ») → PS (niveau le plus jeune
  // du référentiel MINEDUB, qui ne compte que 3 niveaux PS/MS/GS).
  if (/pre-?nursery|prenursery|prematernelle/.test(n)) return 'ps';
  const ny = n.match(/nursery([1-3])/);
  if (ny) return { 1: 'ps', 2: 'ms', 3: 'gs' }[ny[1]];
  if (t.includes('kg') || /kindergarten/.test(s)) return 'gs';
  return null;
};

// Niveau primaire → slug référentiel 'sil'|'cp'|'ce1'|'ce2'|'cm1'|'cm2', sinon null.
// Anglophone : Class / Standard / Primary 1–6 → SIL/CP/CE1/CE2/CM1/CM2.
export const primaireNiveauSlug = (level, name = '') => {
  const t = tokens(level, name);
  for (const code of ['sil', 'cp', 'ce1', 'ce2', 'cm1', 'cm2']) {
    if (t.includes(code)) return code;
  }
  const s = t.join(' ');
  if (/section d initiation|cours d initiation|initiation au langage/.test(s)) return 'sil';
  const n = (norm(level) + ' ' + norm(name)).replace(/\s+/g, '');
  const c = n.match(/(?:class|standard|std|primary|pry)([1-6])/);
  if (c) return { 1: 'sil', 2: 'cp', 3: 'ce1', 4: 'ce2', 5: 'cm1', 6: 'cm2' }[c[1]];
  return null;
};

export const isMaternelle = (level, name = '') => maternelleNiveauSlug(level, name) !== null;
export const isPrimaire   = (level, name = '') => primaireNiveauSlug(level, name) !== null;

// ── SECTION pédagogique d'une classe (regroupement pour les sélecteurs) ──────
// Sert à filtrer les longues listes de classes : on choisit d'abord la section,
// puis la classe. Labels FR/EN/ES fournis comme données (pas de dépendance UI).
export const SECTIONS = [
  { key: 'maternelle',    fr: 'Maternelle',    en: 'Nursery',      es: 'Preescolar' },
  { key: 'primaire',      fr: 'Primaire',      en: 'Primary',      es: 'Primaria' },
  { key: 'premier_cycle', fr: 'Premier cycle', en: 'First cycle',  es: 'Primer ciclo' },
  { key: 'second_cycle',  fr: 'Second cycle',  en: 'Second cycle', es: 'Segundo ciclo' },
  { key: 'autre',         fr: 'Autre',         en: 'Other',        es: 'Otro' },
];

export function classSectionKey(cls) {
  const level = cls?.level || '', name = cls?.name || '';
  if (isMaternelle(level, name))  return 'maternelle';
  if (isPrimaire(level, name))    return 'primaire';
  if (isFirstCycle(level, name))  return 'premier_cycle';
  if (isSecondCycle(level, name)) return 'second_cycle';
  return 'autre';
}

// Mappe un drapeau (école ou surcharge classe) + une classe vers le moteur concret,
// ou null si le drapeau ne s'applique pas à ce niveau (⇒ repli 'classic').
function engineFromFlag(flag, cls) {
  const level = cls?.level || '';
  const name  = cls?.name || '';
  switch (flag) {
    case 'classic':
      return 'classic';
    case 'maternelle':
      return isMaternelle(level, name) ? 'maternelle' : null;
    case 'apc_primaire':
      return isPrimaire(level, name) ? 'apc_primaire' : null;
    case 'minedub':
      if (isMaternelle(level, name)) return 'maternelle';
      if (isPrimaire(level, name))   return 'apc_primaire';
      return null;
    case 'apc_minesec':
      return isFirstCycle(level, name) ? 'apc' : null;
    case 'minesec':
      if (isFirstCycle(level, name)) return 'apc';
      if (cls?.serie || isSecondCycle(level, name)) return 'sc';
      return null;
    case 'officiel':
      // Système officiel camerounais COMPLET : MINEDUB (fondamental) + MINESEC
      // (secondaire). Chaque classe est résolue selon son niveau, du préscolaire
      // à la Terminale. C'est le pendant « tout officiel » du mode 'classic'.
      if (isMaternelle(level, name))  return 'maternelle';
      if (isPrimaire(level, name))    return 'apc_primaire';
      if (isFirstCycle(level, name))  return 'apc';
      if (cls?.serie || isSecondCycle(level, name)) return 'sc';
      return null;
    default:
      return null;
  }
}

// Moteur effectif d'une classe :
//   'maternelle' | 'apc_primaire' | 'apc' | 'sc' | 'classic'.
// La surcharge `classes.bulletin_engine` prime sur `school.bulletin_engine`.
export function resolveClassEngine(school, cls) {
  const override = cls?.bulletin_engine;
  if (override) return engineFromFlag(override, cls) || 'classic';
  return engineFromFlag(school?.bulletin_engine || 'classic', cls) || 'classic';
}

// Drapeaux d'établissement de la FAMILLE OFFICIELLE (par opposition à 'classic').
// 'officiel' est le drapeau unifié (fondamental + secondaire) ; les autres restent
// acceptés pour rétro-compatibilité et se comportent comme des sous-ensembles.
export const OFFICIAL_ENGINE_FLAGS = ['officiel', 'minesec', 'apc_minesec', 'minedub', 'maternelle', 'apc_primaire'];
export const isOfficialEngine = (flag) => OFFICIAL_ENGINE_FLAGS.includes(flag);
