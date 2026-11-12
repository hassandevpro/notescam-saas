// MOYENNE DU PRIMAIRE « PAR POINTS » — règle demandée par THE GENIUS (réglage d'école).
//
//   S = somme des barèmes des matières réellement évaluées
//   T = somme des notes obtenues par l'élève
//   moyenne /20 = T ÷ (S ÷ 20) = T × 20 ÷ S
//
// Exemple de contrôle : barèmes 40 + 20 + 30 (S = 90), notes 30 + 14 + 22 (T = 66)
// → 66 × 20 ÷ 90 = 14,67 / 20.
//
// CE QUI LA DIFFÈRE DE LA RÈGLE PAR DÉFAUT (primEngine.generalAverage) : celle-ci fait la
// moyenne des POURCENTAGES de chaque compétence, pondérée par le coefficient — une matière
// sur 20 pèse autant qu'une matière sur 40. Ici chaque point pèse autant : une matière sur
// 40 pèse deux fois une matière sur 20. Ne s'applique que si `schools.prim_moyenne_points`
// est vrai ; le défaut (faux) laisse tout le reste du code inchangé.
//
// SUR LA PÉRIODE (trimestre, annuel) : ΣT × 20 ÷ ΣS, S couvrant toutes les UA de la période
// — et NON une moyenne des moyennes par UA. Règle à confirmer par l'école : TOUTE la logique
// tient dans `moyennePointsSur20`, appelée avec les cellules de la période. Pour passer à
// « moyenne des UA », il suffirait d'appeler cette fonction UA par UA puis de moyenner.
//
// ARRONDI : 2 décimales, au plus proche, 0,005 vers le haut (13,565 → 13,57). Calculé en
// ENTIERS (centièmes de point), jamais par `Math.round(x * 100) / 100` : en flottants,
// 13,565 est stocké 13,56499999… et tomberait sur 13,56.

const GRADE_MAX_DEFAUT = 20;

// Un nombre de points (≤ 2 décimales) → centièmes entiers. `toFixed` + `Number` plutôt que
// `x * 100` : 1.005 * 100 vaut 100.49999999999999, alors que '1.005' en texte est exact.
function enCentiemes(x) {
  // Number(null) vaut 0 : sans cette garde, une cellule SANS note (achieved null) comptait comme un ZÉRO au lieu
  // d'être exclue — contrairement à ce que documente `moyennePointsSur20`.
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  // « 1.005000e2 » est lu comme 100.5 EXACTEMENT, alors que 1.005 * 100 donne 100.4999…
  return Math.round(Number(`${n.toFixed(6)}e2`));
}

/**
 * @param {Array<{achieved:number|null, possible:number|null}>} cellules
 *   Une entrée par (matière, UA). Une cellule sans note, non évaluée (achieved null) ou
 *   sans barème (possible ≤ 0) est EXCLUE du numérateur ET du dénominateur.
 * @param {number} [gradeMax=20]
 * @returns {{ moyenne:number|null, totalObtenu:number, totalBareme:number, cellules:number }}
 *   `moyenne` est null quand S = 0 (jamais NaN ni Infinity) : l'écran affiche un tiret.
 */
export function moyennePointsSur20(cellules, gradeMax = GRADE_MAX_DEFAUT) {
  let tc = 0, sc = 0, n = 0;
  for (const c of cellules || []) {
    const a = c ? enCentiemes(c.achieved) : null;
    const p = c ? enCentiemes(c.possible) : null;
    if (a === null || p === null || p <= 0) continue;
    tc += a; sc += p; n += 1;
  }
  if (sc <= 0) return { moyenne: null, totalObtenu: 0, totalBareme: 0, cellules: 0 };
  // centièmes de la moyenne = T × gradeMax × 100 ÷ S, arrondi « half up » en entiers :
  // floor((2·num + den) / (2·den)) pour num, den positifs.
  const gm = enCentiemes(gradeMax) / 100;
  const num = tc * gm * 100;
  const centiemes = Math.floor((2 * num + sc) / (2 * sc));
  return { moyenne: centiemes / 100, totalObtenu: tc / 100, totalBareme: sc / 100, cellules: n };
}

/**
 * Les points (obtenus, possibles) d'UNE matière sur les UA demandées — la matière d'entrée de
 * `moyennePointsSur20`. `totalDe(ua)` rend `{achieved, possible}` pour cette UA (typiquement
 * `competencePointsTotal` appliqué aux notes de l'élève).
 */
export function cellulesDeMatiere(uas, totalDe) {
  const out = [];
  for (const ua of uas || []) {
    const t = totalDe(ua);
    if (t && t.achieved != null && t.possible) out.push({ achieved: t.achieved, possible: t.possible });
  }
  return out;
}

// Le réglage d'école, lu de la même façon partout : booléen tantôt 1/0 (SQLite, édition LAN),
// tantôt true/false (Postgres). Absent ou nul = règle par défaut.
export function moyennePointsActive(school, cls = null) {
  // Une classe au format « matières à note unique » a SA règle : total des notes ÷ (total des barèmes ÷ 20), quel que
  // soit le réglage de l'école. Bulletin, PV et rapports passent par ici, donc donnent les mêmes chiffres.
  if (cls?.bulletin_format === 'note_unique') return true;
  const v = school?.prim_moyenne_points;
  return v === true || v === 1 || v === '1';
}
