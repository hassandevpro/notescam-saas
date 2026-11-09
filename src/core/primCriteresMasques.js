// CRITÈRES MASQUÉS DU PRIMAIRE — PAR (CLASSE, COMPÉTENCE, CRITÈRE).
//
// LE DÉFAUT QUE CECI CORRIGE. `prim_criteres_masques` a pour clé (école, critère) : décocher
// « Oral » pour la compétence 1A le retirait de 1B, 2A… et de TOUTES les classes de l'école.
// La clé est désormais (classe, compétence, critère) — table `prim_criteres_masques_classe`.
//
// COMMENT L'ANCIEN RÉGLAGE SURVIT, SANS CHANGER UN BULLETIN.
// Une classe est « initialisée » (table `prim_criteres_masques_init`) quand son masque a été
// recopié sur chacune de ses compétences — par la migration, ou à la première modification de
// l'enseignant. Tant qu'elle ne l'est pas, on lit encore la liste de l'école : une classe jamais
// touchée se comporte donc EXACTEMENT comme avant. Une fois initialisée, la liste de l'école
// n'est plus lue pour elle — c'est ce qui permet de ré-afficher « Oral » sur 1B seule.
//
// FORME DE LA DONNÉE (celle que le store garde en mémoire) :
//   parClasse = { [classId]: { init: true, parCompetence: { [competenceId]: [critereId…] } } }

/**
 * La fonction que `criteresForCompetence` accepte à la place d'une liste : (competenceId) → ids masqués.
 * @param ecole     liste de l'école (`prim_criteres_masques`), repli des classes non initialisées
 * @param parClasse cf. ci-dessus
 * @param classId   la classe dont on calcule l'affichage
 */
export function masquesCriteresPour(ecole, parClasse, classId) {
  const c = classId ? (parClasse || {})[classId] : null;
  if (!c || !c.init) {
    const liste = Array.isArray(ecole) ? ecole : [];
    return () => liste;
  }
  const par = c.parCompetence || {};
  return (competenceId) => par[competenceId] || [];
}

// Une liste de masques, quelle que soit sa forme (tableau historique ou fonction), pour UNE compétence.
export function masquesDe(masques, competenceId) {
  if (typeof masques === 'function') return masques(competenceId) || [];
  return Array.isArray(masques) ? masques : [];
}

/**
 * Les lignes à écrire pour qu'une classe passe de la liste de l'école au masque par compétence,
 * SANS changer ce qu'elle affiche : chaque critère masqué par l'école l'est sur chaque compétence.
 * @returns {{ init: boolean, lignes: Array<{competence_id, critere_id}> }}
 */
export function recopierMasqueEcole(ecole, competenceIds) {
  const lignes = [];
  for (const critere_id of ecole || []) {
    for (const competence_id of competenceIds || []) lignes.push({ competence_id, critere_id });
  }
  return { init: true, lignes };
}

/**
 * Plan de migration pour toute une école (ce que le script et le SQL Cloud doivent reproduire).
 * Idempotent par construction : une classe déjà initialisée est SAUTÉE, jamais réécrite.
 *
 * @param ecole          critères masqués par l'école
 * @param classes        [{ id }] classes du primaire de l'école
 * @param competenceIds  compétences visibles de l'école
 * @param dejaInit       Set des classes déjà initialisées
 * @param dejaLignes     Set de clés `${classe}|${compétence}|${critère}` déjà présentes
 */
export function planMigration({ ecole, classes, competenceIds, dejaInit = new Set(), dejaLignes = new Set() }) {
  const aInitialiser = [];
  const lignes = [];
  for (const cl of classes || []) {
    if (dejaInit.has(cl.id)) continue;
    aInitialiser.push(cl.id);
    for (const { competence_id, critere_id } of recopierMasqueEcole(ecole, competenceIds).lignes) {
      const k = `${cl.id}|${competence_id}|${critere_id}`;
      if (!dejaLignes.has(k)) lignes.push({ class_id: cl.id, competence_id, critere_id });
    }
  }
  return { aInitialiser, lignes };
}

/**
 * Le nouvel état d'une classe après un geste de l'enseignant (fonction pure, le store l'applique).
 * @param etat       l'entrée actuelle de parClasse pour la classe (ou undefined)
 * @param ecole      repli : recopié à la première modification d'une classe non initialisée
 * @param toutesComp toutes les compétences, pour la recopie initiale et « appliquer à toutes »
 * @param geste      { competenceId, critereId, masque:boolean, partout?:boolean }
 */
export function appliquerGeste(etat, ecole, toutesComp, { competenceId, critereId, masque, partout = false }) {
  const base = etat?.init
    ? Object.fromEntries(Object.entries(etat.parCompetence || {}).map(([k, v]) => [k, [...v]]))
    : Object.fromEntries((toutesComp || []).map((c) => [c, [...(ecole || [])]]));
  const cibles = partout ? (toutesComp || []) : [competenceId];
  for (const comp of cibles) {
    const cur = new Set(base[comp] || []);
    if (masque) cur.add(critereId); else cur.delete(critereId);
    base[comp] = [...cur];
  }
  for (const k of Object.keys(base)) if (!base[k].length) delete base[k];
  return { init: true, parCompetence: base };
}
