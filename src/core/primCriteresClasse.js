// LES CRITÈRES MASQUÉS QUI VALENT POUR UNE CLASSE ET UNE COMPÉTENCE — fonctions PURES.
//
// ── LA DEMANDE, ET CE QU'ELLE A CORRIGÉ DEUX FOIS ─────────────────────────
//
// 1. 2026-11-05 (matin) — « Quand j'enlève les critères, ça ne doit pas le faire pour toutes
//    les classes. » Retirer « Pratique » en CE1 le retirait en CM2 : le masquage des critères
//    (D26) était par ÉCOLE.
// 2. 2026-11-05 (après le diagnostic) — « lorsqu'on masque un critère à une compétence, ça
//    masque pour toute la classe ». La portée par classe ne suffisait pas : une classe évalue
//    « Pratique » en TIC et pas en Dictée. C'est la compétence qui décide, pas la classe
//    entière. Le référentiel le savait déjà — `prim_bareme_criteres` a pour clé
//    (niveau, COMPÉTENCE, critère) — mais le masque de l'école, lui, l'ignorait.
//
// TROIS LISTES COEXISTENT, de la plus large à la plus fine :
//   • `parEcole`  — `prim_criteres_masques` : (école, critère). Les masques DÉJÀ POSÉS par les
//                   écoles qui n'évaluent qu'à l'écrit. On n'y touche pas : rien ne change pour
//                   elles, et c'est leur réglage le plus large qui reste le plus simple à tenir.
//   • `parClasse` — `prim_criteres_classe_masques` : (école, classe, COMPÉTENCE, critère),
//                   soit `{ [classId]: { [competenceId]: [critereId…] } }`.
//   • rien du tout — le cas de la quasi-totalité des écoles.
//
// Les critères masqués pour UNE case de l'écran (une classe × une compétence) sont l'union des
// deux. Sans masque propre, on rend la liste de l'école TELLE QUELLE (même référence) : les
// mémoïsations des écrans ne se recalculent pas pour rien.
//
// CE QUE LE MASQUAGE NE FAIT PAS : il ne supprime, n'efface ni n'ignore AUCUNE note. La note
// reste en base ; seule la colonne quitte la saisie, le bulletin, le PV et le rapport. La
// réafficher la montre à nouveau, intacte.

const VIDE = [];

// Les critères masqués pour (classe, compétence). `competenceId` omis = on ne retient que les
// masques d'école : c'est le repli sûr, jamais plus large que ce que l'école a demandé.
export function criteresMasquesPourClasse(parEcole, parClasse, classId, competenceId) {
  const base = Array.isArray(parEcole) ? parEcole : VIDE;
  const parCompetence = classId && parClasse ? parClasse[classId] : null;
  const propres = competenceId && parCompetence && Array.isArray(parCompetence[competenceId])
    ? parCompetence[competenceId]
    : VIDE;
  if (!propres.length) return base;
  return [...new Set([...base, ...propres])];
}

/**
 * LE RÉSOLVEUR À DONNER AUX MOTEURS.
 *
 * Le bulletin, le PV et le rapport de classe ne traitent pas UNE compétence mais les onze :
 * leur passer une liste plate rendrait au masque la portée « toute la classe » qu'on vient
 * justement de lui retirer. Ils reçoivent donc une FONCTION, que `criteresForCompetence`
 * appelle avec la compétence qu'il est en train de calculer.
 *
 * La fonction est mémoïsée sur la compétence : un bulletin de classe l'appelle une fois par
 * compétence et par élève, et refabriquer l'union à chaque appel se paierait en impression.
 */
export function resolveurCriteresMasques(parEcole, parClasse, classId) {
  const cache = new Map();
  const resolveur = (competenceId) => {
    if (cache.has(competenceId)) return cache.get(competenceId);
    const v = criteresMasquesPourClasse(parEcole, parClasse, classId, competenceId);
    cache.set(competenceId, v);
    return v;
  };
  // Les anciens appelants qui liraient encore le résultat comme un tableau obtiendraient
  // silencieusement « aucun masque ». On le dit à voix haute plutôt que de masquer à l'aveugle.
  resolveur.estResolveurDeMasques = true;
  return resolveur;
}

// Combien de notes une colonne porte-t-elle, pour CETTE classe et CETTE compétence ? Sert à
// prévenir avant de masquer — « ce critère contient N notes » — et jamais à décider à la place
// de l'école : on l'informe, elle tranche.
export function notesDuCritere(primNotes, eleveIds, competenceId, critereId) {
  const miens = eleveIds instanceof Set ? eleveIds : new Set(eleveIds || []);
  let n = 0;
  for (const r of Object.values(primNotes || {})) {
    if (!r || r.critere_id !== critereId || r.competence_id !== competenceId) continue;
    if (!miens.has(r.eleve_id)) continue;
    if (r.note == null || r.note === '') continue;
    n += 1;
  }
  return n;
}
