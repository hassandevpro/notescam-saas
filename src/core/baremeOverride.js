// BARÈMES DE SAISIE PERSONNALISÉS — logique pure (pas de React, pas de DOM).
//
// Les deux moteurs par compétences arrivent avec un barème OFFICIEL :
//   • APC premier cycle (MINESEC) : chaque compétence se note /20 ;
//   • Primaire APC (MINEDUB)      : chaque critère (Oral, Écrit, Pratique,
//     Savoir-être) porte son propre total de points, variable par compétence.
//
// Dans la vraie vie, l'enseignant évalue sur l'échelle de SON épreuve : une
// dictée sur 15, un oral sur 10. Il reportait donc une note convertie à la main
// — conversion fausse une fois sur trois. Ce module laisse chaque enseignant
// fixer le barème de saisie DANS l'écran de saisie, puis ramène tout à l'échelle
// officielle au moment du calcul : le bulletin reste sur le barème officiel,
// quelle que soit l'échelle de saisie.
//
// LA SURCHARGE PORTE SUR LE NIVEAU, PAS SUR LA CLASSE. Un barème est une
// décision pédagogique de niveau (toutes les 6e, tous les CM2) : deux 6e
// parallèles doivent rester comparables sur le même bulletin. C'est aussi ce qui
// rend la surcharge SÛRE : elle est appliquée UNE FOIS au référentiel, dans le
// store — donc tout lecteur (saisie, bulletin, PV, rapport de classe) la voit,
// sans qu'aucun appelant n'ait à la faire suivre. Aucun chemin ne peut l'oublier.
//
// Forme d'une ligne de surcharge (table `bareme_notes`) :
//   { id, school_id, engine: 'apc'|'prim', niveau_slug, competence_id,
//     critere_id|null, points_max }

// Barème officiel d'une compétence APC (premier cycle) : /20.
export const APC_NOTE_MAX = 20;

// Bornes de sûreté d'un barème saisi. En dessous de 1, la note n'exprime plus
// rien ; au-delà de 200, c'est une faute de frappe (2000 pour 20).
export const BAREME_MIN = 1;
export const BAREME_MAX = 200;

// Clé d'index d'une surcharge.
//   APC  : la compétence porte déjà sa classe (apc_competences.classe_id) — son
//          id suffit.
//   PRIM : les critères sont GLOBAUX (un seul « Oral » pour tout le primaire) ;
//          le barème n'a de sens qu'avec (niveau, compétence, critère).
export const baremeKey = ({ engine, niveauSlug, competenceId, critereId }) =>
  engine === 'prim'
    ? `p:${niveauSlug}:${competenceId}:${critereId}`
    : `a:${competenceId}`;

// Index { [clé]: points_max } à partir des lignes de la table. Une valeur
// illisible ou hors bornes est ignorée : mieux vaut le barème officiel qu'une
// échelle absurde héritée d'une ligne corrompue.
export function baremeIndex(rows) {
  const out = {};
  for (const r of rows || []) {
    const max = Number(r?.points_max);
    if (!isFinite(max) || max < BAREME_MIN || max > BAREME_MAX) continue;
    out[baremeKey({
      engine: r.engine,
      niveauSlug: r.niveau_slug,
      competenceId: r.competence_id,
      critereId: r.critere_id,
    })] = max;
  }
  return out;
}

// Barème de saisie d'une compétence APC : surcharge si elle existe, sinon /20.
export const apcNoteMax = (competence) => {
  const m = Number(competence?.note_max);
  return isFinite(m) && m >= BAREME_MIN && m <= BAREME_MAX ? m : APC_NOTE_MAX;
};

// Ramène une note APC saisie sur son barème vers l'échelle officielle /20.
// Null/'' /'ABS' passent tels quels (ce ne sont pas des nombres).
export function toApc20(note, competence) {
  if (note === null || note === undefined || note === '' || note === 'ABS') return note;
  const n = Number(note);
  if (!isFinite(n)) return note;
  const max = apcNoteMax(competence);
  if (max === APC_NOTE_MAX) return n;
  return Math.round((n / max) * APC_NOTE_MAX * 100) / 100;
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

// --- Application au référentiel -----------------------------------------------
// Les deux fonctions renvoient le référentiel INCHANGÉ (même référence) quand
// aucune surcharge ne s'applique : les `useMemo` des écrans ne recalculent pas.

// APC : décore chaque compétence surchargée d'un `note_max`. `competencesFor` et
// `matiereAverage` lisent ce champ — rien d'autre à propager.
export function applyApcBareme(referentiel, index) {
  if (!referentiel?.competences?.length || !index) return referentiel;
  let touched = false;
  const competences = referentiel.competences.map((c) => {
    const max = index[`a:${c.id}`];
    if (!max || max === APC_NOTE_MAX) return c;
    touched = true;
    return { ...c, note_max: max };
  });
  return touched ? { ...referentiel, competences } : referentiel;
}

// PRIMAIRE : réécrit `points_max` dans la table de barème. `criteresForCompetence`
// la lit, et tous les calculs primaires sont des RATIOS (points obtenus / points
// possibles) — la cote et le bulletin suivent donc sans autre changement.
//
// `points_max_officiel` garde la valeur du référentiel : c'est ce qui permet à
// l'écran de saisie de proposer « rétablir le barème officiel » et de distinguer
// une colonne modifiée d'une colonne intacte.
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

// Barème OFFICIEL d'un critère du primaire — celui du référentiel, même si
// l'enseignant a surchargé la colonne.
export const primOfficialMax = (critere) =>
  Number(critere?.points_max_officiel ?? critere?.points_max) || 0;
