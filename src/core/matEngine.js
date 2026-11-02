// Moteur MATERNELLE — logique métier pure (pas de React, pas de DOM).
// Modèle par DOMAINES pédagogiques du préscolaire camerounais :
//
//   Niveau (PS/MS/GS) → Domaine → Observation (niveau d'acquisition A/ECA/NA)
//
// AUCUNE note numérique, AUCUNE moyenne, AUCUN rang. Une observation porte le
// triplet (élève, domaine, UA). Pendant de apcEngine.js pour le préscolaire.
//
// ── L'UNITÉ D'OBSERVATION EST L'UA, PLUS LE TRIMESTRE (2026-11-01) ──────────
// La maternelle cotait par Trimestre 1/2/3. Le carnet du fondamental, lui,
// découpe l'année en huit unités d'apprentissage, et le PRIMAIRE les utilise
// depuis l'origine (`prim_notes.ua`). Consigne du responsable : « elle doit
// utiliser les mêmes critères que le primaire : UA1 à UA8 », regroupées en
// trimestres UA1-3 / UA4-6 / UA7-8.
//
// On a donc repris, à la lettre, ce que le primaire avait déjà fait : une
// colonne `ua`, un trimestre DÉRIVÉ (jamais stocké à part, jamais ressaisi), et
// le découpage tenu en un seul endroit (`core/uaMinedub.js`). L'observation d'un
// domaine existe maintenant jusqu'à trois fois par trimestre — une par UA — et
// la synthèse trimestrielle du bulletin se calcule à partir d'elles.

// Niveaux d'acquisition officiels (source unique pour la saisie et le bulletin).
export const MAT_ACQUIS = [
  { code: 'A',   libelle: 'Acquis',                 col: '#059669', ordre: 1 },
  { code: 'ECA', libelle: 'En cours d’acquisition', col: '#f59e0b', ordre: 2 },
  { code: 'NA',  libelle: 'Non acquis',             col: '#ef4444', ordre: 3 },
];
export const MAT_ACQUIS_CODES  = MAT_ACQUIS.map((a) => a.code);
export const MAT_ACQUIS_COLORS = Object.fromEntries(MAT_ACQUIS.map((a) => [a.code, a.col]));
export const MAT_ACQUIS_LABELS = Object.fromEntries(MAT_ACQUIS.map((a) => [a.code, a.libelle]));

export const isValidAcquis = (code) => MAT_ACQUIS_CODES.includes(code);

// Domaines actifs du référentiel, triés par ordre. Liste verrouillée chargée à
// l'ouverture de la saisie (aucun domaine créé manuellement).
export function domainesForMaternelle(referentiel) {
  return (referentiel?.domaines || [])
    .filter((d) => d.actif !== false)
    .slice()
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
}

// Tendance d'acquisition d'un élève sur un trimestre (indicatif pour la synthèse
// du bulletin) : le niveau MAJORITAIRE parmi ses observations. Départage : le plus
// favorable (A > ECA > NA) en cas d'égalité. Renvoie un code ou null.
export function dominantAcquis(observations) {
  const tally = { A: 0, ECA: 0, NA: 0 };
  for (const o of observations || []) {
    if (isValidAcquis(o?.niveau_acquis)) tally[o.niveau_acquis] += 1;
  }
  const total = tally.A + tally.ECA + tally.NA;
  if (!total) return null;
  const max = Math.max(tally.A, tally.ECA, tally.NA);
  return ['A', 'ECA', 'NA'].find((c) => tally[c] === max) || null;
}

// Convertit les domaines du référentiel en `subjects` à créer pour une classe
// maternelle (matérialisation UI : « GS A → Langage / Pré-numération / … »).
// Le préscolaire ne note PAS : l'évaluation se fait par COTES (A / ECA / NA) dans
// `mat_observations`, jamais par une note numérique liée à la matière. Le `max`
// n'est donc qu'un placeholder — la colonne `subjects.max` est NOT NULL côté base,
// on met la valeur par défaut FR (20). Cette valeur n'est jamais lue en maternelle.
export const MAT_SUBJECT_MAX = 20;
export function subjectsFromMatReferentiel(domaines, { schoolId, classId, makeId }) {
  return (domaines || []).map((d, i) => ({
    id: makeId(d.intitule),
    school_id: schoolId,
    class_id: classId,
    name: d.intitule,
    coef: 1,
    max: MAT_SUBJECT_MAX,
    position: i,
    mat_domaine_id: d.id,
  }));
}

// ── Clé locale d'une observation de maternelle ───────────────────────────────
// Identité d'une observation = (élève, domaine, UA). Définie ICI (module pur),
// comme primNkey et noteNkey le sont dans leur moteur : l'échange de notes
// entre postes doit pouvoir la construire sans traîner la couche Supabase, et il
// n'existe qu'UNE définition — deux divergeraient un jour, et l'import ne
// retrouverait plus les observations déjà saisies.
// `lib/matService` la réexporte.
//
// LA TROISIÈME COMPOSANTE EST L'UA (1-8), plus le trimestre ('t1'…). Un appel
// qui passerait encore un identifiant de trimestre produirait une clé que plus
// aucune observation ne porte : `nkeyEstUA` sert à le détecter dans les données
// reçues d'un autre poste, et la migration (scripts/migrer-maternelle-ua.mjs)
// réécrit les lignes d'avant.
export const obsNkey = (eleveId, domaineId, ua) =>
  `${eleveId}_${domaineId}_${ua}`;

// La clé porte-t-elle bien une UA en dernière composante ? Sert aux lectures de
// données venues d'ailleurs (lot de notes exporté par un poste plus ancien).
export const nkeyEstUA = (nkey) => /_(?:[1-8])$/.test(String(nkey ?? ''));

// ── Les UA de la maternelle ──────────────────────────────────────────────────
// Mêmes unités, même regroupement et mêmes libellés que le primaire : le module
// ne fait que les ré-exposer sous le toit de ce moteur, pour que l'écran de
// saisie et le bulletin de maternelle n'aient pas à connaître le primaire.
export { UAS_DE_L_ANNEE as MAT_UAS, UA_PAR_TRIMESTRE, uasDuTrimestre, trimestreOfUA, trimestreIdOfUA, estUAValide, uaLabels } from './uaMinedub.js';

// ── Synthèse d'un domaine sur un TRIMESTRE ───────────────────────────────────
// Le bulletin trimestriel montre les UA du trimestre ET une synthèse. La
// synthèse est la cote DOMINANTE des UA cotées (cf. dominantAcquis, qui
// départage au plus favorable) — jamais une moyenne : A/ECA/NA ne s'additionnent
// pas. Une UA non cotée ne compte pas ; aucune UA cotée ⇒ null, et le bulletin
// laisse la case vide au lieu d'afficher « non acquis » à un enfant qu'on n'a
// pas encore observé.
//
// `observations` : les enregistrements du domaine pour ce trimestre, dans
// n'importe quel ordre. `observation` (le texte) revient de l'UA la PLUS
// AVANCÉE qui en porte un : c'est le commentaire le plus récent de la période.
export function syntheseTrimestre(observations) {
  const cotees = (observations || []).filter((o) => o && isValidAcquis(o.niveau_acquis));
  const avecTexte = (observations || [])
    .filter((o) => o && String(o.observation ?? '').trim())
    .sort((a, b) => Number(a.ua ?? 0) - Number(b.ua ?? 0));
  return {
    niveau: dominantAcquis(cotees),
    observation: avecTexte.length ? String(avecTexte[avecTexte.length - 1].observation).trim() : '',
    cotees: cotees.length,
  };
}
