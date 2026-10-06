// BARÈMES DE SAISIE DU PRIMAIRE, FIXÉS PAR L'ENSEIGNANT — logique pure.
//
// Le primaire APC (MINEDUB) note chaque compétence par CRITÈRES — Oral, Écrit,
// Pratique, Savoir-être — et le référentiel national fixe le total de points de
// chacun. Dans la vraie vie, l'enseignant interroge à l'oral sur 10 et fait sa
// dictée sur 15 : il devait convertir de tête avant de saisir, conversion fausse
// une fois sur trois et invisible ensuite.
//
// Ce module laisse chaque enseignant fixer le barème de saisie DANS l'écran de
// saisie. Rien d'autre à changer en aval : tous les calculs du primaire sont des
// RATIOS (points obtenus / points possibles), si bien que le total et la cote
// suivent le nouveau barème d'eux-mêmes.
//
// LE PREMIER CYCLE APC N'EST PAS ICI. Il a son propre mécanisme, plus fin : le
// barème y est porté par la NOTE (`apc_notes.note_max`, cf. core/apcEngine.js —
// `noteScale`/`noteRatio`), de sorte qu'une même compétence peut être évaluée /3
// sur une séquence et /20 sur une autre. Une surcharge par niveau ne saurait pas
// l'exprimer, et deux mécanismes concurrents sur le même écran finiraient par se
// contredire.
//
// LA SURCHARGE PORTE SUR LE NIVEAU, PAS SUR LA CLASSE. Un barème est une décision
// de niveau (tous les CM2) : deux CM2 parallèles doivent rester comparables sur le
// même bulletin. C'est aussi ce qui la rend SÛRE : elle est appliquée UNE FOIS au
// référentiel, dans le store — donc tout lecteur (saisie, bulletin, PV, rapport de
// classe) la voit, sans qu'aucun appelant n'ait à la faire suivre. Aucun chemin ne
// peut l'oublier.
//
// Forme d'une ligne de surcharge (table `bareme_notes`) :
//   { id, school_id, engine: 'prim', niveau_slug, competence_id, critere_id,
//     points_max }

// Bornes de sûreté d'un barème saisi. En dessous de 1, la note n'exprime plus
// rien ; au-delà de 200, c'est une faute de frappe (2000 pour 20).
export const BAREME_MIN = 1;
export const BAREME_MAX = 200;

// Clé d'index d'une surcharge. Les critères sont GLOBAUX dans le référentiel (un
// seul « Oral » pour tout le primaire) : le barème n'a de sens qu'avec le triplet
// (niveau, compétence, critère).
export const baremeKey = ({ niveauSlug, competenceId, critereId }) =>
  `p:${niveauSlug}:${competenceId}:${critereId}`;

// Index { [clé]: points_max } à partir des lignes de la table. Une valeur illisible
// ou hors bornes est ignorée : mieux vaut le barème officiel qu'une échelle absurde
// héritée d'une ligne corrompue. Les lignes d'un autre moteur sont ignorées.
export function baremeIndex(rows) {
  const out = {};
  for (const r of rows || []) {
    if (r?.engine && r.engine !== 'prim') continue;
    if (!r?.critere_id) continue;
    const max = Number(r?.points_max);
    if (!isFinite(max) || max < BAREME_MIN || max > BAREME_MAX) continue;
    out[baremeKey({
      niveauSlug: r.niveau_slug,
      competenceId: r.competence_id,
      critereId: r.critere_id,
    })] = max;
  }
  return out;
}

// Convertit une note d'un barème vers un autre (changement de barème :
// « convertir les notes déjà saisies »). 'ABS' et le vide ne se convertissent pas.
export function rescaleNote(note, oldMax, newMax) {
  if (note === null || note === undefined || note === '' || note === 'ABS') return note;
  const n = Number(note);
  if (!isFinite(n) || !oldMax || !newMax) return note;
  const v = Math.round((n / oldMax) * newMax * 100) / 100;
  return String(Math.min(v, newMax));
}

// Réécrit `points_max` dans la table de barème du référentiel primaire.
// `criteresForCompetence` la lit, et tout le primaire calcule en ratios — la cote
// et le bulletin suivent donc sans autre changement.
//
// `points_max_officiel` garde la valeur du référentiel : c'est ce qui permet à
// l'écran de saisie de proposer « rétablir le barème officiel » et de distinguer
// une colonne modifiée d'une colonne intacte.
//
// Renvoie le référentiel INCHANGÉ (même référence) quand aucune surcharge ne
// s'applique : les `useMemo` des écrans ne recalculent alors pas.
export function applyPrimBareme(referentiel, index) {
  if (!referentiel?.baremeCriteres?.length || !index) return referentiel;
  let touched = false;
  const baremeCriteres = referentiel.baremeCriteres.map((b) => {
    const max = index[`p:${b.niveau_id}:${b.competence_id}:${b.critere_id}`];
    if (!max || Number(b.points_max) === max) return b;
    touched = true;
    return { ...b, points_max: max, points_max_officiel: Number(b.points_max) };
  });
  return touched ? { ...referentiel, baremeCriteres } : referentiel;
}

// Barème OFFICIEL d'un critère — celui du référentiel, même si l'enseignant a
// surchargé la colonne.
export const primOfficialMax = (critere) =>
  Number(critere?.points_max_officiel ?? critere?.points_max) || 0;
