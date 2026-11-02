// LES UNITÉS D'APPRENTISSAGE DU FONDAMENTAL (MINEDUB) — source unique.
//
// Le carnet officiel du fondamental découpe l'année en HUIT unités
// d'apprentissage, regroupées en trois trimestres :
//
//     Trimestre 1 = UA1 · UA2 · UA3
//     Trimestre 2 = UA4 · UA5 · UA6
//     Trimestre 3 = UA7 · UA8
//
// Le découpage est FIXE et identique à tous les niveaux du carnet — il ne
// dépend ni de l'école ni du cycle. Il vivait dans `core/primEngine.js`, qui le
// tient depuis l'origine ; il est extrait ici parce que la MATERNELLE l'adopte
// (demande du 2026-11-01 : « elle doit utiliser les mêmes critères que le
// primaire : UA1 à UA8 »), et qu'un découpage recopié dans deux moteurs finit
// par diverger dans l'un des deux.
//
// `primEngine` le ré-exporte sous ses noms historiques (`UA_PAR_TRIMESTRE`,
// `trimestreOfUA`) : aucun appelant n'a eu à changer.
//
// Les deux moteurs du fondamental sont bien deux moteurs distincts — le primaire
// note des points par critère, la maternelle cote A/ECA/NA par domaine — et ils
// le restent. Ce module ne partage QUE le calendrier, qui est national.

// UA (1-8) → numéro de trimestre (1-3).
export const UA_PAR_TRIMESTRE = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8] };

// Toutes les UA de l'année, dans l'ordre.
export const UAS_DE_L_ANNEE = [1, 2, 3, 4, 5, 6, 7, 8];

// Le trimestre (1-3) qui contient une UA. Une valeur hors bornes se range au
// trimestre le plus proche plutôt que de renvoyer null : les appelants
// historiques (bulletins, rapports) attendent toujours un trimestre.
export function trimestreOfUA(ua) {
  const n = Number(ua);
  return n <= 3 ? 1 : n <= 6 ? 2 : 3;
}

// Les UA d'un trimestre (1-3). Repli sur le premier trimestre, comme le faisait
// déjà chaque appelant à coups de `|| [1, 2, 3]`.
export const uasDuTrimestre = (trimestre) => UA_PAR_TRIMESTRE[Number(trimestre)] || UA_PAR_TRIMESTRE[1];

// Identifiant de trimestre du référentiel ('t1'|'t2'|'t3') porté par une UA.
// `mat_observations.trimestre_id` reste renseigné avec cette valeur DÉRIVÉE :
// la colonne porte une clé étrangère vers `apc_trimestres` (trois lignes) et
// elle est NOT NULL, donc on ne peut ni y écrire « ua5 » ni la vider. C'est
// aussi ce qui laisse les lecteurs par trimestre continuer de fonctionner.
export const trimestreIdOfUA = (ua) => `t${trimestreOfUA(ua)}`;

// Une UA exploitable ? (1 à 8, entier). Tout le reste est refusé À L'ÉCRITURE :
// une observation rattachée à « UA 9 » n'apparaîtrait sur aucun bulletin.
export const estUAValide = (ua) => Number.isInteger(Number(ua)) && Number(ua) >= 1 && Number(ua) <= 8;

// Libellés fournis comme DONNÉES (le module reste pur, aucune dépendance i18n).
export const uaLabels = (ua) => ({
  fr: `UA${ua}`, en: `LU${ua}`, es: `UA${ua}`, short: `UA${ua}`,
  long_fr: `Unité d'apprentissage ${ua}`, long_en: `Learning unit ${ua}`,
});
