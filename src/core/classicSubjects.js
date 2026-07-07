// Auto-configuration des matières d'une classe du MONDE CLASSIQUE (notes/20 en
// francophone, /100 en anglophone) — l'équivalent, pour le classique, des
// autoConfig officiels ([[apc_minesec_engine]], [[sc_minesec_engine]], MINEDUB…).
//
// Aucune dépendance à un référentiel ministériel : des TRONCS COMMUNS curatés par
// niveau/section (inspirés des modèles Cameroun général/bilingue), que
// l'établissement ajuste ensuite librement (coefficients, ajout/suppression).
//
// Logique PURE (sans React ni I/O) : testable et réutilisable cloud comme LAN.

import {
  resolveClassEngine,
  firstCycleClasseSlug, secondCycleClasseSlug,
  primaireNiveauSlug, maternelleNiveauSlug,
} from './engineResolver.js';

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const S = (rows) => rows.map(([name, coef]) => ({ name, coef }));

// ── Francophone (barème /20) ──────────────────────────────────────────────────
const COLLEGE_FR = S([
  ['Français', 4], ['Anglais', 4], ['Mathématiques', 4], ['SVT', 2],
  ['Sciences Physiques', 2], ['Histoire-Géographie', 2], ['ECM', 1],
  ['Informatique', 2], ['EPS', 2],
]);
// Séries de lycée (coefficients indicatifs, ajustables après génération).
const SERIE_FR = {
  A: [['Français', 4], ['Anglais', 3], ['Langue Vivante 2', 3], ['Histoire-Géographie', 3],
      ['Littérature', 3], ['Mathématiques', 2], ['SVT', 2], ['ECM', 1], ['EPS', 1]],
  C: [['Mathématiques', 6], ['Sciences Physiques', 5], ['SVT', 4], ['Français', 3],
      ['Anglais', 2], ['Histoire-Géographie', 2], ['Informatique', 2], ['ECM', 1], ['EPS', 1]],
  D: [['SVT', 6], ['Sciences Physiques', 4], ['Mathématiques', 4], ['Français', 3],
      ['Anglais', 2], ['Histoire-Géographie', 2], ['Informatique', 2], ['ECM', 1], ['EPS', 1]],
  E: [['Mathématiques', 6], ['Sciences Physiques', 5], ['Technologie', 4], ['Français', 2],
      ['Anglais', 2], ['Informatique', 2], ['ECM', 1], ['EPS', 1]],
};
const LYCEE_GENERIC_FR = [
  ['Français', 3], ['Anglais', 3], ['Mathématiques', 4], ['Sciences Physiques', 3],
  ['SVT', 3], ['Histoire-Géographie', 2], ['Informatique', 2], ['ECM', 1], ['EPS', 1],
];
const PRIMARY_FR = S([
  ['Français', 4], ['Mathématiques', 4], ['Anglais', 2], ['Éveil scientifique / SVT', 2],
  ['Histoire-Géographie', 2], ['Éducation Civique et Morale', 1], ['TIC', 1],
  ['Arts / Dessin', 1], ['EPS', 1],
]);
const MAT_FR = S([
  ['Langage', 1], ['Mathématiques (nombres)', 1], ['Découverte du monde', 1],
  ['Graphisme / Écriture', 1], ['Activités artistiques', 1], ['Motricité / EPS', 1],
]);
const GENERIC_FR = S([
  ['Français', 3], ['Anglais', 3], ['Mathématiques', 4], ['Sciences', 2],
  ['Histoire-Géographie', 2], ['ECM', 1], ['EPS', 1],
]);

// ── Anglophone (barème /100) ──────────────────────────────────────────────────
const FORM_LOWER_EN = S([
  ['English Language', 4], ['French', 3], ['Mathematics', 4], ['Biology', 2],
  ['Physics', 2], ['Chemistry', 2], ['History', 2], ['Geography', 2],
  ['Citizenship', 1], ['Computer Science', 2], ['Physical Education', 1],
]);
const SIXTH_ARTS_EN = S([
  ['English Literature', 4], ['French', 3], ['History', 4], ['Geography', 4],
  ['Philosophy', 3], ['Citizenship', 1], ['Physical Education', 1],
]);
const SIXTH_SCIENCE_EN = S([
  ['Mathematics', 5], ['Physics', 5], ['Chemistry', 4], ['Biology', 4],
  ['Computer Science', 2], ['Citizenship', 1], ['Physical Education', 1],
]);
const PRIMARY_EN = S([
  ['English', 4], ['Mathematics', 4], ['Science', 2], ['Social Studies', 2],
  ['French', 2], ['Citizenship', 1], ['Computer Studies', 1], ['Arts', 1], ['Physical Education', 1],
]);
const GENERIC_EN = S([
  ['English', 4], ['French', 3], ['Mathematics', 4], ['Science', 2],
  ['Social Studies', 2], ['Citizenship', 1], ['Physical Education', 1],
]);

const isSixthForm = (level, name) => /sixth|lower six|upper six|\bl6\b|\bu6\b/.test(norm(`${level} ${name}`));

// Tronc commun (paires { name, coef }) selon niveau + système. [] si non couvert.
export function defaultClassicSubjects(cls) {
  const sys   = String(cls?.system || 'FR').toUpperCase();
  const level = cls?.level || '', name = cls?.name || '';
  const serie = String(cls?.serie || '').toUpperCase();

  if (sys === 'EN') {
    if (maternelleNiveauSlug(level, name)) return PRIMARY_EN;   // pré-primaire → set primaire léger
    if (primaireNiveauSlug(level, name))   return PRIMARY_EN;
    if (isSixthForm(level, name))          return /SCI/.test(serie) ? SIXTH_SCIENCE_EN : SIXTH_ARTS_EN;
    if (firstCycleClasseSlug(level, name) || secondCycleClasseSlug(level, name) || /form/.test(norm(name))) return FORM_LOWER_EN;
    return GENERIC_EN;
  }
  if (sys === 'ES') return [];   // Guinée Éq. : système propre → pas d'auto-config classique.

  // Francophone
  if (maternelleNiveauSlug(level, name)) return MAT_FR;
  if (primaireNiveauSlug(level, name))   return PRIMARY_FR;
  if (firstCycleClasseSlug(level, name)) return COLLEGE_FR;
  const sc = secondCycleClasseSlug(level, name);
  if (sc || serie) {
    let rows = SERIE_FR[serie] || LYCEE_GENERIC_FR;
    if (sc === 'tle') rows = [...rows, ['Philosophie', serie === 'A' ? 4 : 2]];
    return S(rows);
  }
  return GENERIC_FR;
}

// Enregistrements `subjects` complets à créer pour une classe CLASSIQUE, ou [] si
// non concerné (moteur non 'classic', ou système ES). `max` = 100 (EN) sinon 20.
export function buildSubjectsForClassicClass({ school, cls, makeId }) {
  if (!cls || resolveClassEngine(school, cls) !== 'classic') return [];
  const rows = defaultClassicSubjects(cls);
  if (!rows.length) return [];
  const max = (cls.system || 'FR') === 'EN' ? 100 : 20;
  return rows.map((r, i) => ({
    id: makeId(),
    school_id: cls.school_id,
    class_id: cls.id,
    name: r.name,
    coef: r.coef || 1,
    max,
    position: i,
  }));
}
