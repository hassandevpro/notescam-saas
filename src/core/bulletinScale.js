// LE BARÈME D'UN BULLETIN VIENT DE LA CLASSE, PAS DE SA LANGUE.
//
// RELEVÉ EN PRODUCTION (THE GENIUS, 2026-10-26, lecture seule). FORM1 et FORM2
// sont des classes anglophones : leurs matières sont saisies en anglais, elles
// suivent le programme bilingue spécial, et leurs notes sont sur /20. Elles
// portaient pourtant `system = 'FR'` — et leur bulletin sortait donc en
// français, en-têtes de groupes compris (« SCIENCES EXACTES » au lieu
// d'« EXACT SCIENCES »), alors que tout le cadre est déjà bilingue dans le code.
//
// Les basculer en 'EN' aurait corrigé la langue ET cassé les notes : les cinq
// bulletins classiques déduisaient le barème de la LANGUE
// (`maxScale = sys === 'FR' ? 20 : 100`), donc un 10/20 se serait imprimé 50.
// La langue et le barème sont deux choses distinctes : une classe anglophone du
// Cameroun note sur /20 comme sa jumelle francophone, c'est le programme
// bilingue qui le veut.
//
// `classes.grade_max` existe précisément pour porter le barème de sortie — le
// moteur bilingue le lit déjà (cf. core/bilEngine). On le lit ici aussi, et la
// langue ne sert PLUS QUE de valeur par défaut quand la classe n'a rien dit.
//
// CE QUE CELA CHANGE AILLEURS, mesuré sur les 282 classes de la plateforme :
//   • 112 FR + 84 FR/20 + 32 EN + 15 EN/100 : rien ne bouge (la classe ne dit
//     rien, ou dit exactement le défaut de son système) ;
//   • 8 classes EN qui demandent /20 (2 écoles) : leur bulletin passe de /100 à
//     /20 — c'est ce qu'elles avaient réglé et qui n'était pas respecté ;
//   • 6 classes FR qui demandent /10 (4 écoles) : de /20 à /10, même raison ;
//   • 2 classes FR qui demandent /100 (FORM1 et FORM2) : de /20 à /100 — CELLES-CI
//     SONT MAL RÉGLÉES (leurs notes sont /20), leur `grade_max` est à corriger en
//     même temps que leur système ;
//   • 23 classes ES (Guinée Équatoriale) : voir ci-dessous, elles CHANGENT.
//
// UNE SEULE RÈGLE, DEUX PORTES. `classScale(cls, school)` (src/lib/useCountry.js)
// disait déjà la même chose et existait AVANT ce module — elle n'avait pas été vue
// quand il a été écrit. Elle n'est pas supprimée (le moteur du tableau d'honneur
// l'appelle) : elle DÉLÈGUE ici. La règle habite ce module parce qu'il est PUR —
// aucun import React, aucun store — donc testable sous node et lisible des deux
// éditions. Toute nouvelle lecture de barème passe par l'une des deux portes,
// jamais par un « sys === 'FR' ? 20 : 100 » recopié : c'est ce copier-coller,
// présent à HUIT endroits, qui a produit le défaut ci-dessous.
//
// LA GUINÉE ÉQUATORIALE ÉTAIT INCOHÉRENTE, et ce module le répare. Les cinq
// bulletins classiques imprimaient une classe ES sur /100 — alors que la même
// page calculait son SEUIL DE RÉUSSITE avec `geGradeMax(school) / 2`, soit 5.
// Un bulletin qui annonce /100 et déclare admis à 5 ne veut rien dire ; les notes,
// elles, sont saisies sur /10 ou /20 (`SubjectTeacherWorkspace` lit déjà
// `geGradeMax`). Le barème ES devient donc celui du pays : /10 par défaut, /20 si
// l'école l'a réglé. C'est un CHANGEMENT VISIBLE pour ces écoles — à leur
// confirmer avant le déploiement Cloud, et sans effet sur les paquets LAN du
// Cameroun.

/** Barème par défaut d'un système, quand la classe ne dit rien. */
export const BAREME_DEFAUT_EN = 100;
export const BAREME_DEFAUT_FR = 20;
// Modèle espagnol : /10, et l'école peut demander /20 (`schools.ge_grade_max`).
// C'est un RÉGLAGE D'ÉCOLE, que ce module pur ne sait pas lire : les appelants le
// passent en troisième argument, via `geGradeMax(school)`. Sans lui on retombe sur
// le défaut du pays, /10 — jamais sur /100, qui n'a jamais eu de sens là-bas.
export const BAREME_DEFAUT_ES = 10;

/**
 * Barème d'impression et seuil de réussite d'une classe.
 *
 * @param {object} cls        la classe ({ grade_max })
 * @param {string} sys        'FR' | 'EN' | 'ES' — ne sert que de repli
 * @param {number} [defautES] barème d'école pour 'ES' (cf. geGradeMax)
 * @returns {{ maxScale: number, passThreshold: number }}
 *   Le seuil est la moitié du barème : 10/20, 50/100, 5/10 — la règle
 *   camerounaise, la même qu'avant pour les deux barèmes par défaut.
 */
export function bulletinScale(cls, sys, defautES) {
  const demande = Number(cls?.grade_max);
  if (Number.isFinite(demande) && demande > 0) {
    return { maxScale: demande, passThreshold: demande / 2 };
  }
  const s  = String(sys ?? '').toUpperCase();
  const es = Number(defautES);
  const maxScale = s === 'EN' ? BAREME_DEFAUT_EN
    : s === 'ES' ? (Number.isFinite(es) && es > 0 ? es : BAREME_DEFAUT_ES)
    : BAREME_DEFAUT_FR;
  return { maxScale, passThreshold: maxScale / 2 };
}
