// Moteur PRIMAIRE APC — logique métier pure (pas de React, pas de DOM).
// Modèle par COMPÉTENCES NATIONALES du primaire APC camerounais :
//
//   Cycle → Niveau (SIL…CM2) → Compétence (1A…6B) → Critère → Note → Cote
//
// Les 11 compétences sont FIXES du SIL au CM2. Chaque compétence est évaluée sur
// 4 critères (Oral/Écrit/Pratique/Savoir-être). Saisie /10 (grade_max). La cote
// (A+/A/ECA/NA) est DÉRIVÉE, jamais saisie. Pendant de apcEngine.js pour le primaire.
//
// Formes de données (telles que renvoyées par le référentiel) :
//   competence = { id, code, intitule, domaine, coefficient, ordre, actif }
//   critere    = { id, nom, poids, ordre }
//   bareme     = [{ cote, libelle, seuil_min, ordre }]  (seuil en % de grade_max)
//   niveauComp = { niveau_id, competence_id, coefficient|null, actif }  (optionnel)

// Barème de cote par défaut (repli si le référentiel n'en fournit pas). Seuils en %.
export const PRIM_COTE_DEFAULT = [
  { cote: 'A+',  libelle: 'Très bien acquis',        seuil_min: 90, ordre: 1 },
  { cote: 'A',   libelle: 'Acquis',                  seuil_min: 70, ordre: 2 },
  { cote: 'ECA', libelle: 'En cours d’acquisition',  seuil_min: 50, ordre: 3 },
  { cote: 'NA',  libelle: 'Non acquis',              seuil_min: 0,  ordre: 4 },
];

const _num = (v) => {
  if (v === null || v === undefined || v === '' || v === 'ABS') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

// Cote APC d'une moyenne : plus haute bande du barème dont seuil_min ≤ pourcentage.
// avg et gradeMax dans la même échelle (défaut /10). Renvoie { cote, libelle } ou null.
export function primCote(avg, gradeMax = 10, bareme = PRIM_COTE_DEFAULT) {
  if (avg == null || !gradeMax) return null;
  const pct = (avg / gradeMax) * 100;
  const bands = (bareme && bareme.length ? bareme : PRIM_COTE_DEFAULT)
    .slice()
    .sort((a, b) => b.seuil_min - a.seuil_min);
  const hit = bands.find((b) => pct >= b.seuil_min) || bands[bands.length - 1];
  return { cote: hit.cote, libelle: hit.libelle };
}

// UA (Unité d'Apprentissage, 1-8/an) → trimestre (1-3). Fixe, identique à tous les
// niveaux du carnet officiel (UA1-3 = 1er trimestre, UA4-6 = 2e, UA7-8 = 3e).
export const UA_PAR_TRIMESTRE = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8] };
export function trimestreOfUA(ua) {
  const n = Number(ua);
  return n <= 3 ? 1 : n <= 6 ? 2 : 3;
}

// Barème (points) des critères d'UNE sous-compétence, pour un niveau donné. Pour la
// compétence '6a' (sport), le profil dépend de l'aptitude de l'élève ('apte' par
// défaut) — 'inapte' n'a en général pas de critère "pratique". Renvoie
// [{ id: critere_id, nom, points_max, ordre }], triés par ordre.
export function criteresForCompetence(referentiel, niveauSlug, competenceId, aptitude = 'apte') {
  const bareme = referentiel?.baremeCriteres || [];
  const criteresById = new Map((referentiel?.criteres || []).map((c) => [c.id, c]));
  return bareme
    .filter((b) => b.niveau_id === niveauSlug && b.competence_id === competenceId && (b.aptitude || 'apte') === aptitude)
    .map((b) => ({ id: b.critere_id, nom: criteresById.get(b.critere_id)?.nom || b.critere_id, points_max: Number(b.points_max) || 0, ordre: b.ordre || 0 }))
    .sort((a, b) => a.ordre - b.ordre);
}

// Points obtenus pour UNE occurrence (une UA) d'une sous-compétence : SOMME des
// notes déjà saisies pour ses critères (pas une moyenne pondérée — le barème
// officiel note chaque sous-compétence sur un total de points variable, ex. 40 pour
// 1A). Les critères non encore notés sont ignorés. { achieved: null } si rien saisi.
//   notesByCritere : { [critere_id]: note }
//   criteres       : [{ id, points_max }] (criteresForCompetence)
export function competencePointsTotal(notesByCritere, criteres) {
  let achieved = 0, possible = 0, any = false;
  for (const cr of criteres || []) {
    const n = _num(notesByCritere?.[cr.id]);
    if (n === null) continue;
    any = true;
    achieved += n;
    possible += cr.points_max || 0;
  }
  return any ? { achieved: Math.round(achieved * 100) / 100, possible } : { achieved: null, possible: null };
}

// Compétences actives applicables à un niveau, triées par ordre. Par défaut TOUTES
// (les 11 sont fixes) ; `niveauComp` permet des exceptions/surcharges de coef.
export function competencesForNiveau(referentiel, niveauSlug) {
  const all = (referentiel?.competences || []).filter((c) => c.actif !== false);
  const nc  = (referentiel?.niveauCompetences || []).filter((r) => r.niveau_id === niveauSlug);
  if (!nc.length) return all.slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

  const byComp = new Map(nc.map((r) => [r.competence_id, r]));
  return all
    .filter((c) => {
      const r = byComp.get(c.id);
      return !r || r.actif !== false; // absent de la table = applicable par défaut
    })
    .map((c) => {
      const r = byComp.get(c.id);
      return r && r.coefficient != null ? { ...c, coefficient: Number(r.coefficient) || 1 } : c;
    })
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
}

// Moyenne d'une compétence = Σ(note × poids_critère) / Σ(poids des critères NOTÉS).
//   notesByCritere : { [critere_id]: note }
//   criteres       : [{ id, poids }]
// Les critères non notés sont ignorés (pas comptés 0). Null si aucun critère noté.
export function competenceAverage(notesByCritere, criteres) {
  let sw = 0, tp = 0;
  for (const cr of criteres || []) {
    const n = _num(notesByCritere?.[cr.id]);
    if (n === null) continue;
    const poids = cr.poids == null ? 1 : Number(cr.poids) || 1;
    sw += n * poids;
    tp += poids;
  }
  return tp ? Math.round((sw / tp) * 100) / 100 : null;
}

// Moyenne générale = Σ(moyenne_competence × coef) / Σ(coef).
//   rows = [{ moyenne, coef }] ; les compétences non notées (moyenne null) exclues.
export function generalAverage(rows) {
  let sw = 0, tc = 0;
  for (const r of rows || []) {
    if (r.moyenne == null) continue;
    const coef = r.coef == null ? 1 : Number(r.coef) || 1;
    sw += r.moyenne * coef;
    tc += coef;
  }
  return tc ? Math.round((sw / tc) * 100) / 100 : null;
}

// Construit les lignes du bulletin d'un élève (une par compétence).
//   competences   : compétences du niveau (competencesForNiveau)
//   criteres      : critères actifs
//   notes         : { [competence_id]: { [critere_id]: note } }
// Renvoie [{ competence, moyenne, coef, cote }].
export function bulletinRows(competences, criteres, notes, gradeMax = 10, bareme = PRIM_COTE_DEFAULT) {
  return (competences || []).map((c) => {
    const moyenne = competenceAverage(notes?.[c.id], criteres);
    const coef = c.coefficient == null ? 1 : Number(c.coefficient) || 1;
    const cote = primCote(moyenne, gradeMax, bareme);
    return { competence: c, moyenne, coef, cote: cote ? cote.cote : null };
  });
}

// Rangs à partir des moyennes générales (ex æquo partagent le rang ; sans moyenne
// en dernier). Identique à buildApcRanks (apcEngine) pour la cohérence des bulletins.
export const buildPrimRanks = (students, avgById, excl = {}) => {
  const wa = (students || []).map((s) => ({
    ...s,
    excluded: !!excl[s.id],
    av: excl[s.id] ? null : (avgById?.[s.id] ?? null),
  }));
  wa.sort((a, b) => {
    if (a.av === null && b.av === null) return 0;
    if (a.av === null) return 1;
    if (b.av === null) return -1;
    return b.av - a.av;
  });
  let rk = 1;
  wa.forEach((s, i) => {
    if (s.av === null) { s.rang = '—'; return; }
    if (i > 0 && wa[i - 1].av !== null && s.av < wa[i - 1].av) rk = i + 1;
    s.rang = rk;
  });
  return wa;
};

// Convertit les compétences du niveau en `subjects` à créer pour une classe primaire
// APC (matérialisation UI + affectation enseignant). Barème /10 par défaut.
export function subjectsFromPrimReferentiel(competences, { schoolId, classId, gradeMax = 10, makeId }) {
  return (competences || []).map((c, i) => ({
    id: makeId(),
    school_id: schoolId,
    class_id: classId,
    name: `${c.code} — ${c.intitule}`,
    coef: c.coefficient == null ? 1 : Number(c.coefficient) || 1,
    max: gradeMax,
    position: i,
    prim_competence_id: c.id,
  }));
}

// ── Clé locale d'une note du primaire APC ────────────────────────────────────
// Identité d'une note = (élève, compétence, critère, UA). Définie ICI (module
// pur) pour être lisible par les assembleurs de documents sans dépendre de la
// couche Supabase ; `lib/primService` la réexporte.
export const primNkey = (eleveId, competenceId, critereId, ua) =>
  `${eleveId}_${competenceId}_${critereId}_${ua}`;
