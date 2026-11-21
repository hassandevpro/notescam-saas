// MOYENNE D'UN ÉLÈVE AU PRIMAIRE APC — SOURCE UNIQUE.
//
// Avant le 2026-11-20 le calcul existait en DEUX copies : `Bulletins.jsx` (écran, bulletin,
// liste, palmarès, tableaux d'honneur) et `classReportEngine.js` (rapports de classe, export
// des notes). Elles appliquaient la même règle, mais rien ne l'imposait, et l'export oubliait
// en plus le réglage d'école « moyenne en points ». Désormais les deux appellent CE module.
//
// RÈGLE (carnet MINEDUB, une compétence = Oral + Écrit + Pratique + Savoir-être…) :
//   • par UA : points obtenus ÷ points possibles de la compétence (barème PROPRE à chaque note) ;
//   • un critère absent (« A »), non saisi ou masqué sort du total — numérateur ET dénominateur ;
//   • moyenne de la compétence = moyenne des pourcentages des UA notées, ramenée sur /20 ;
//   • moyenne générale = moyenne des compétences pondérée par coefficient (règle par défaut),
//     ou ΣT × 20 ÷ ΣS sur tous les points évalués (réglage `prim_moyenne_points`).
// Cas de contrôle : Oral 11/12 + Écrit 13/15 + Savoir-être 2/3, UA1 → 26/30 → 17,33 ;
// si le Savoir-être est déclaré absent → 24/27 → 17,78 (ce n'est pas une divergence de calcul :
// c'est une donnée qui a changé).
import { competencePointsTotal, celluleDeNote, generalAverage, PRIM_GRADE_MAX } from './primEngine.js';
import { moyennePointsSur20 } from './primMoyennePoints.js';

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Moyenne /20 d'UNE compétence pour UN élève sur les UA demandées.
 * @param criteres        critères applicables [{ id, points_max }] (déjà masqués / de secours)
 * @param noteDe          (critereId, ua) => ligne prim_notes | undefined
 * @param nonEvaluee      (ua) => bool — compétence déclarée non évaluée à cette UA
 * @param cellulesOut     tableau optionnel : reçoit { achieved, possible } par UA (règle en points)
 */
export function moyenneCompetencePrim({ criteres, uas, noteDe, nonEvaluee = () => false, zeroSiManquante = false, cellulesOut = null }) {
  if (!criteres?.length) return null;
  const pcts = [];
  for (const ua of uas) {
    const notesByCritere = {};
    for (const cr of criteres) {
      const c = celluleDeNote(noteDe(cr.id, ua), cr.points_max);
      if (c) notesByCritere[cr.id] = c;
    }
    const { achieved, possible } = competencePointsTotal(notesByCritere, criteres, { nonEvaluee: !!nonEvaluee(ua), zeroSiManquante });
    if (achieved == null || !possible) continue;
    if (cellulesOut) cellulesOut.push({ achieved, possible });
    pcts.push((achieved / possible) * 100);
  }
  if (!pcts.length) return null;
  return round2((pcts.reduce((a, b) => a + b, 0) / pcts.length) / 100 * PRIM_GRADE_MAX);
}

/** Moyenne générale /20 : règle par défaut (coefficients) ou « en points ». */
export function moyenneGeneralePrim({ lignes, cellules, moyennePoints = false }) {
  return moyennePoints
    ? moyennePointsSur20(cellules || []).moyenne
    : generalAverage((lignes || []).map((r) => ({ moyenne: r.moyenne, coef: r.coef })));
}
