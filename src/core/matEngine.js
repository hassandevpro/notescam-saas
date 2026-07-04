// Moteur MATERNELLE — logique métier pure (pas de React, pas de DOM).
// Modèle par DOMAINES pédagogiques du préscolaire camerounais :
//
//   Niveau (PS/MS/GS) → Domaine → Observation (niveau d'acquisition A/ECA/NA)
//
// AUCUNE note numérique, AUCUNE moyenne, AUCUN rang. Une observation porte le
// triplet (élève, domaine, trimestre). Pendant de apcEngine.js pour le préscolaire.

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
    id: makeId(),
    school_id: schoolId,
    class_id: classId,
    name: d.intitule,
    coef: 1,
    max: MAT_SUBJECT_MAX,
    position: i,
    mat_domaine_id: d.id,
  }));
}
