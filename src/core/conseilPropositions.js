// ─────────────────────────────────────────────────────────────────────────────
// PROPOSITIONS DU CONSEIL DE CLASSE — « en fonction du travail de l'élève »
// ─────────────────────────────────────────────────────────────────────────────
// Le bas du carnet que l'école remet aux parents (modèle THE GENIUS, Class 2/CP)
// porte CINQ champs, et ils varient d'un élève à l'autre :
//
//     Appréciation : Very good
//     Avertissement conditionnel : No
//     Tableau d'honneur : Yes
//     Encouragement : Yes
//     Félicitations : Yes
//
// Ce module les DÉRIVE du travail de l'élève — sa moyenne, ramenée en
// POURCENTAGE de son barème, pour qu'une seule règle serve au /20 francophone,
// au /100 anglophone et au /10 ou /20 de Guinée équatoriale. C'est la même
// normalisation que le moteur des tableaux d'honneur (`score = moyenne / barème`).
//
// IL NE DÉCIDE RIEN ET N'ÉCRIT RIEN : il PROPOSE. L'écran de saisie affiche la
// proposition à côté du champ, et le conseil l'applique d'un clic — exactement
// la convention de `AutoHint` pour les sanctions de Vie scolaire : « jamais
// d'écrasement silencieux ». Sans ce clic, le bulletin n'imprime que ce que
// l'école a saisi, et la règle du dépôt tient : « ne jamais inventer de notes,
// moyennes, cotes, rangs ou mentions ».
//
// LES QUATRE SEUILS NE SONT PAS DES NOMBRES CHOISIS ICI. Chacun reprend une
// borne que le produit utilise déjà, pour qu'un élève ne soit pas « Très Bien »
// sur son bulletin et hors des félicitations au conseil :
//   50 % — seuil de réussite du produit (`clsStat` : barème / 2) ;
//   60 % — borne « Assez Bien » de `frApp` (12/20) ;
//   70 % — borne « Bien » de `frApp` (14/20), et `minAvgPct` du tableau
//          « Élèves méritants » (honorRollTemplates) ;
//   80 % — borne « Très Bien » de `frApp` (16/20), `minAvgPct` du tableau
//          d'excellence, et le `scale * 0.8` de l'analyse du conseil.
// Une école qui veut d'autres bornes les passe en `seuils` ; rien n'est figé.

import { getAppreciation } from './bulletinEngine.js';

// Pourcentages du barème. Hiérarchie du carnet camerounais : le tableau
// d'honneur est le socle, l'encouragement s'y ajoute, la félicitation couronne.
export const SEUILS_CONSEIL = {
  avertissement: 50,
  tableauHonneur: 60,
  encouragement: 70,
  felicitation: 80,
};

// Clés spéciales du `gradeMap` où chaque champ se range déjà (cf. `getAbsCond`
// et `absenceEntryToRow`). Aucune colonne nouvelle : `student_absences` porte
// `appreciation`, `th`, `encouragement`, `felicitation` et `aver_travail`.
export const CLES_CONSEIL = {
  appreciation: '__appreciation__',
  avertissement: '__aver_travail__',
  tableauHonneur: '__th__',
  encouragement: '__encouragement__',
  felicitation: '__felicitation__',
};

// Moyenne ramenée au barème qu'attend `getAppreciation` pour ce système.
// `enGrade` lit un pourcentage, `frApp` et l'échelle de l'école un /20, GE son
// propre maximum. Le carnet du primaire, lui, est toujours sur `bareme` (20) :
// sans cette conversion, un 17,29/20 anglophone ressortait « Fail ».
function ramenerAuSysteme(moyenne, bareme, sys, maxScale) {
  const cible = sys === 'EN' ? 100 : sys === 'ES' ? (Number(maxScale) || 20) : 20;
  const v = (Number(moyenne) / Number(bareme)) * cible;
  return Math.round(v * 100) / 100;
}

// L'appréciation proposée = la mention de l'échelle de l'école (`grade_scale`),
// ou l'échelle par défaut de son système. C'est le mot que le papier porte :
// « Excellent », « Very good », « Très Bien ».
export function appreciationProposee(moyenne, bareme, opts = {}) {
  if (moyenne == null || !Number(bareme)) return '';
  const sys = String(opts.sys || 'FR').toUpperCase();
  const a = getAppreciation(
    ramenerAuSysteme(moyenne, bareme, sys, opts.maxScale),
    opts.gradeScale,
    sys,
    opts.maxScale,
  );
  const mot = a?.text || a?.txt || '';
  return mot === '—' ? '' : mot;
}

// Les cinq champs, proposés. `null` quand l'élève n'a pas encore de moyenne :
// un carnet vierge ne propose rien, il attend les notes.
export function propositionsConseil(moyenne, bareme, opts = {}) {
  if (moyenne == null || !Number(bareme)) return null;
  const pct = (Number(moyenne) / Number(bareme)) * 100;
  if (!Number.isFinite(pct)) return null;
  const seuils = { ...SEUILS_CONSEIL, ...(opts.seuils || {}) };
  return {
    pct: Math.round(pct * 100) / 100,
    appreciation: appreciationProposee(moyenne, bareme, opts),
    avertissement: pct < seuils.avertissement ? 1 : 0,
    tableauHonneur: pct >= seuils.tableauHonneur,
    encouragement: pct >= seuils.encouragement,
    felicitation: pct >= seuils.felicitation,
  };
}

// Valeur TEXTE à écrire dans le `gradeMap` pour un champ proposé — mêmes
// conventions de lecture que `getAbsCond` : 'true'/'false' pour les trois
// distinctions, un entier pour l'avertissement, la mention telle quelle pour
// l'appréciation.
export function valeurAEcrire(champ, prop) {
  if (!prop) return null;
  if (champ === 'appreciation') return prop.appreciation || '';
  if (champ === 'avertissement') return String(prop.avertissement);
  return prop[champ] ? 'true' : 'false';
}

// Ce que la saisie porte aujourd'hui, dans la même forme que la proposition —
// pour pouvoir dire si les deux diffèrent sans dupliquer les conventions.
export function valeurSaisie(champ, scores = {}) {
  const brut = scores[CLES_CONSEIL[champ]];
  if (champ === 'appreciation') return String(brut || '');
  if (champ === 'avertissement') return String(parseInt(brut || '0', 10) || 0);
  return brut === 'true' ? 'true' : 'false';
}

// Les champs où la saisie diffère de la proposition. L'écran n'affiche un
// bouton « Appliquer » que pour ceux-là ; une proposition déjà en place ne
// réclame rien. Une appréciation proposée VIDE n'est jamais un écart : elle
// n'effacerait qu'un texte que l'école a écrit.
export function ecartsConseil(prop, scores = {}) {
  if (!prop) return [];
  return Object.keys(CLES_CONSEIL).filter((champ) => {
    const proposee = valeurAEcrire(champ, prop);
    if (champ === 'appreciation' && !proposee) return false;
    return proposee !== valeurSaisie(champ, scores);
  });
}

// Le lot prêt pour `saveGrade` : { '__th__': 'true', … }. Vide quand il n'y a
// rien à changer, afin qu'un clic sans écart n'écrive pas en base.
export function lotConseil(prop, scores = {}, champs = null) {
  const liste = champs || ecartsConseil(prop, scores);
  const lot = {};
  for (const champ of liste) {
    if (!CLES_CONSEIL[champ]) continue;
    const v = valeurAEcrire(champ, prop);
    if (v == null) continue;
    lot[CLES_CONSEIL[champ]] = v;
  }
  return lot;
}
