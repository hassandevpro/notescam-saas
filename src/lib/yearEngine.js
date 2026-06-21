// Academic year utilities.
//
// La progression des niveaux est dérivée de la configuration pays
// (src/countries) et non plus d'une liste codée en dur : ainsi tous les niveaux
// réellement proposés à la création d'une classe sont promus/diplômés
// correctement — séries du lycée (1ère/Terminale A·C·D, technique TI/TG),
// primaire anglophone (Class 1…6, Form…, Sixth) et système espagnol (Guinée Éq.).

import { COUNTRIES } from '../countries';

// ── Redoublement ─────────────────────────────────────────────────────────────
// La décision de fin d'année est stockée dans le slot de notes `__decision__`
// (saisie via le Conseil de classe), valeurs 'admis' | 'redoublant'. On lit la
// dernière séquence de l'année selon le système/cycle de la classe.

// Dernière séquence d'évaluation de l'année pour une classe.
// FR secondaire = 6 séquences ; EN / ES / primaire = 3 périodes.
export function lastSequenceFor(cls) {
  const sys = cls?.system || 'FR';
  const cycle = cls?.cycle || 'secondaire';
  if (cycle !== 'secondaire') return 3;
  if (sys === 'EN' || sys === 'ES') return 3;
  return 6;
}

// Valeur de décision annuelle d'un élève : on balaie de la dernière séquence
// vers la première et on retient la 1re décision saisie (tolérant à l'endroit
// où le conseil l'a posée).
export function annualDecisionValue(student, classes, gradeMap) {
  const cls = (classes || []).find((c) => c.id === student.class_id);
  if (!cls) return null;
  const maxSeq = lastSequenceFor(cls);
  for (let s = maxSeq; s >= 1; s--) {
    const dec = (gradeMap?.[`${student.class_id}_${student.id}_${s}`] || {})['__decision__'];
    if (dec) return dec;
  }
  return null;
}

// Un élève redouble si sa décision annuelle est 'redoublant' (ou 'redouble').
export function isRepeater(student, classes, gradeMap) {
  const d = annualDecisionValue(student, classes, gradeMap);
  return d === 'redoublant' || d === 'redouble';
}

// "2024-2025" → "2025-2026"
export function computeNextYear(current) {
  if (!current) return '';
  const match = current.match(/^(\d{4})-(\d{4})$/);
  if (!match) return current;
  const start = parseInt(match[1], 10);
  return `${start + 1}-${start + 2}`;
}

// Le `system` de notation d'une classe ('FR' | 'EN' | 'ES') désigne le système
// éducatif dont proviennent ses niveaux. C'est lui qui choisit la bonne échelle
// de progression (une école camerounaise bilingue mélange classes FR et EN).
const SYSTEM_TO_COUNTRY = { FR: 'cameroon_fr', EN: 'cameroon_en', ES: 'guinea_eq' };

// Échelle linéaire des niveaux d'un pays : maternelle → primaire → secondaire,
// dans l'ordre déclaré. Les séries parallèles du lycée FR sont traitées à part.
function linearLadder(country) {
  const out = [];
  for (const cyc of country?.cycles || []) {
    for (const g of cyc.levelGroups || []) {
      for (const item of g.items || []) out.push(item);
    }
  }
  return out;
}

const eqLevel = (a, b) => a?.trim().toLowerCase() === b?.trim().toLowerCase();

// Détecte une variante de série du lycée FR. Pistes parallèles que l'échelle
// linéaire ne peut pas exprimer :
//   "1ère <série>"      → "Terminale <série>"   (ex. 1ère D → Terminale D, 1ère TI → Terminale TI)
//   "Terminale <série>" → null (diplômé)
// Renvoie undefined si ce n'est pas un niveau à série.
const SERIES_RE = /^(1[èe]re|Terminale|Tle)\s+(\S.*)$/i;
function frSeriesNext(level) {
  const m = level.trim().match(SERIES_RE);
  if (!m) return undefined;
  const base = m[1];
  const series = m[2];
  if (/^1[èe]re$/i.test(base)) return `Terminale ${series}`;
  return null; // Terminale <série> → fin de cycle
}

const isFrSeries = (level) => SERIES_RE.test(level?.trim() || '');

// Renvoie le niveau suivant, `null` si la classe est diplômante (fin de cycle),
// ou `undefined` si le niveau est inconnu / la progression ambiguë (→ on garde
// le niveau tel quel, sans promotion automatique).
export function getNextLevel(level, system) {
  if (!level) return undefined;
  const country = COUNTRIES[SYSTEM_TO_COUNTRY[system] || 'cameroon_fr'] || COUNTRIES.cameroon_fr;
  const lv = level.trim();

  // 1. Séries du lycée FR (pistes parallèles A/C/D, technique TI/TG).
  const series = frSeriesNext(lv);
  if (series !== undefined) return series; // "Terminale <série>" ou null (diplômé)

  // 2. Progression linéaire issue de la config pays.
  const ladder = linearLadder(country);
  const idx = ladder.findIndex((l) => eqLevel(l, lv));
  if (idx === -1) return undefined;            // niveau inconnu → inchangé
  if (idx === ladder.length - 1) return null;  // dernier niveau du pays → diplômé

  const next = ladder[idx + 1];
  // On évite de promouvoir vers un choix de série ambigu (ex. 2nde → 1ère A/C/D) :
  // l'orientation est une décision humaine, on laisse l'admin trancher.
  if (isFrSeries(next) && !isFrSeries(lv)) return undefined;
  return next;
}
