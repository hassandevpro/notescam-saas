// ════════════════════════════════════════════════════════════════════════════
// PREMIER CYCLE — PLUSIEURS ÉVALUATIONS D'UNE COMPÉTENCE DANS LE TRIMESTRE
// ════════════════════════════════════════════════════════════════════════════
// Consigne du responsable, 2026-11-01 :
//
//     « Une matière qui n'a qu'UNE compétence doit permettre d'évaluer cette
//       compétence DEUX fois dans le trimestre, chacune sur 20, et la note du
//       trimestre est la moyenne des deux. Si une seule des deux est saisie,
//       afficher la note provisoire sans calculer la moyenne définitive, avec
//       un indicateur "1 évaluation sur 2 saisie".
//       Deux compétences → une évaluation par compétence, combinées selon la
//       règle actuelle (ne pas la changer). Trois compétences → trois
//       évaluations, comportement actuel conservé. »
//
// ── CE QUI EXISTAIT DÉJÀ, ET QU'ON NE REFAIT PAS ───────────────────────────
// Le modèle sait DÉJÀ porter plusieurs notes par compétence et par trimestre :
// la clé d'une note est (élève, compétence, SÉQUENCE), et un trimestre compte
// deux séquences (t1→s1+s2, t2→s3+s4, t3→s5+s6). Le bulletin les moyenne depuis
// toujours (`assemblePeriod.compNote` dans lib/apcBulletinDoc.js), en gérant le
// cas des barèmes différents.
//
// Ce qui manquait n'est donc PAS le calcul : c'est l'écran. Le 2026-10-03, la
// saisie est passée « par trimestre, plus par séquence » (commit 1f3d066) pour
// coller au raisonnement de l'enseignant, et elle écrit depuis sur la PREMIÈRE
// séquence du trimestre. Une seule note par compétence devenait donc saisissable
// — alors que le modèle, lui, en portait deux.
//
// Ce module rouvre la seconde SANS revenir au sélecteur de séquence : le
// trimestre reste le sélecteur principal (c'est la consigne), et les séquences
// deviennent des COLONNES numérotées, « Éval. 1 », « Éval. 2 ».
//
// ── LA CORRESPONDANCE COLONNE → (COMPÉTENCE, SÉQUENCE) ─────────────────────
// Une colonne est un emplacement d'évaluation du trimestre. Avec n compétences
// et les séquences du trimestre dans l'ordre :
//
//     colonne k  →  compétence  (k-1) mod n
//                   séquence    ⌊(k-1) / n⌋
//
// Ce qui donne exactement ce que le responsable a demandé :
//
//   1 compétence, 2 évaluations : Éval.1 = (C1, s1) · Éval.2 = (C1, s2)
//   2 compétences, 2 évaluations : Éval.1 = (C1, s1) · Éval.2 = (C2, s1)
//   3 compétences, 3 évaluations : Éval.1 = (C1, s1) · Éval.2 = (C2, s1) · Éval.3 = (C3, s1)
//
// et se généralise sans cas particulier : 2 compétences et 4 évaluations
// remplissent (C1,s1) (C2,s1) (C1,s2) (C2,s2).
//
// LA CAPACITÉ EST UNE LIMITE DURE : n compétences × 2 séquences. Au-delà, deux
// colonnes désigneraient la MÊME case (même élève, même compétence, même
// séquence) et la seconde écraserait la première — exactement l'incident
// `prim_notes` du 2026-09-28. Le nombre demandé est donc toujours plafonné.
import { noteScale, APC_DEFAULT_MAX } from './apcEngine.js';

// ── LA NOTE D'UNE COMPÉTENCE SUR LE TRIMESTRE ──────────────────────────────
// RÈGLE INCHANGÉE, simplement extraite de `lib/apcBulletinDoc.js` pour que
// l'écran de saisie et le bulletin lisent la MÊME. Deux copies d'une règle de
// moyenne finissent par donner deux moyennes, et c'est le bulletin qui a raison
// devant le parent.
//
//   • barèmes IDENTIQUES → moyenne des valeurs brutes, barème conservé :
//     l'échelle réelle survit jusqu'au bulletin (« 2/3 » reste « 2/3 ») ;
//   • barèmes DIFFÉRENTS → moyenne des PROPORTIONS, exprimée sur /20.
//     Moyenner 2/3 et 14/20 en brut n'aurait aucun sens.
//
// Rend { note, max } ou null si rien n'est saisi.
export function moyenneEvaluations(brutes, defaultMax = APC_DEFAULT_MAX) {
  const evals = (brutes || []).map((b) => noteScale(b, defaultMax)).filter((v) => v !== null);
  if (!evals.length) return null;
  const r2 = (x) => Math.round(x * 100) / 100;
  if (evals.every((v) => v.max === evals[0].max)) {
    return { note: r2(evals.reduce((a, v) => a + v.note, 0) / evals.length), max: evals[0].max };
  }
  const prop = evals.reduce((a, v) => a + v.note / v.max, 0) / evals.length;
  return { note: r2(prop * APC_DEFAULT_MAX), max: APC_DEFAULT_MAX };
}

// Combien de cases le trimestre peut porter sans qu'une colonne en écrase une
// autre. Zéro compétence ou zéro séquence : rien à saisir.
export const capaciteEvaluations = (nbCompetences, nbSequences) =>
  Math.max(0, Number(nbCompetences) || 0) * Math.max(0, Number(nbSequences) || 0);

// LE NOMBRE DÉDUIT, tel que dicté : 1 compétence → 2 évaluations ; au-delà, une
// par compétence. Une matière à une seule compétence est la seule qui a besoin
// d'être évaluée deux fois pour que la note du trimestre soit une moyenne et
// non un unique contrôle.
export function nombreEvaluationsParDefaut(nbCompetences, nbSequences = 2) {
  const n = Math.max(0, Number(nbCompetences) || 0);
  if (!n) return 0;
  return Math.min(n === 1 ? 2 : n, capaciteEvaluations(n, nbSequences));
}

// Le nombre RETENU : la déduction, sauf si l'école a configuré cette matière.
// `config` est une valeur déjà lue (cf. lireConfigEvaluations) — ce module ne
// connaît ni le store ni la base.
export function nombreEvaluations({ nbCompetences, nbSequences = 2, config = null }) {
  const defaut = nombreEvaluationsParDefaut(nbCompetences, nbSequences);
  const voulu = Number(config);
  if (!Number.isFinite(voulu) || voulu < 1) return defaut;
  return Math.min(Math.floor(voulu), capaciteEvaluations(nbCompetences, nbSequences));
}

// ── LES COLONNES DE L'ÉCRAN ────────────────────────────────────────────────
// `competences` : les compétences officielles du trimestre, DANS L'ORDRE.
// `sequences`   : les séquences du trimestre, dans l'ordre (ids).
// Rend [{ rang, competence, sequenceId, repetition, repetitions }] : tout ce
// qu'il faut pour afficher un en-tête et écrire au bon endroit.
//
// `repetitions` > 1 dit à l'écran que la même compétence revient : il peut
// alors numéroter l'évaluation DANS la compétence (« Éval. 1 » et « Éval. 2 »
// portent le même intitulé, comme demandé).
export function colonnesEvaluations({ competences = [], sequences = [], nombre = null } = {}) {
  const comps = (competences || []).filter(Boolean);
  const seqs = (sequences || []).filter(Boolean);
  if (!comps.length || !seqs.length) return [];
  const total = nombre == null
    ? nombreEvaluationsParDefaut(comps.length, seqs.length)
    : Math.min(Math.max(1, Math.floor(nombre)), capaciteEvaluations(comps.length, seqs.length));

  const parComp = new Map();
  const colonnes = [];
  for (let k = 0; k < total; k++) {
    const competence = comps[k % comps.length];
    const sequenceId = seqs[Math.floor(k / comps.length)];
    if (!sequenceId) break;                       // capacité atteinte : on s'arrête
    const repetition = (parComp.get(competence.id) || 0) + 1;
    parComp.set(competence.id, repetition);
    colonnes.push({ rang: k + 1, competence, sequenceId, repetition });
  }
  return colonnes.map((c) => ({ ...c, repetitions: parComp.get(c.competence.id) }));
}

// ── OÙ EN EST LA SAISIE ────────────────────────────────────────────────────
// `noteDe(competenceId, sequenceId)` rend la note brute (ou rien). L'appelant
// la branche sur son magasin : l'écran sur `apcNotes`, le bulletin sur le sien.
//
// `provisoire` est le cœur de la demande : une compétence évaluée une fois sur
// deux a une note AFFICHABLE, qui n'est pas encore sa note du trimestre. La
// confondre avec la note définitive, c'est annoncer au parent une moyenne qui
// va bouger.
export function etatSaisie({ colonnes = [], noteDe = () => null } = {}) {
  const cols = colonnes || [];
  const brutes = cols.map((c) => noteDe(c.competence.id, c.sequenceId));
  const saisies = brutes.filter((b) => noteScale(b) !== null).length;
  const attendues = cols.length;
  return {
    attendues,
    saisies,
    manquantes: Math.max(0, attendues - saisies),
    complet: attendues > 0 && saisies === attendues,
    vide: saisies === 0,
    provisoire: saisies > 0 && saisies < attendues,
    valeur: moyenneEvaluations(brutes),
    brutes,
  };
}

// L'indicateur demandé, mot pour mot : « 1 évaluation sur 2 saisie ». Rendu ici
// plutôt que dans l'écran parce que la même phrase doit apparaître à la saisie
// et sur le relevé — et parce qu'une phrase se relit dans un banc d'essai.
export function indicateurSaisie(etat, { en = false } = {}) {
  if (!etat || !etat.provisoire) return '';
  const { saisies, attendues } = etat;
  return en
    ? `${saisies} of ${attendues} assessments entered`
    : `${saisies} évaluation${saisies > 1 ? 's' : ''} sur ${attendues} saisie${saisies > 1 ? 's' : ''}`;
}

// ── LA CONFIGURATION PAR MATIÈRE ───────────────────────────────────────────
// « Le nombre d'évaluations doit être déduit du nombre de compétences […] mais
// configurable par matière si besoin. » Rangé en JSON sur l'école, comme
// `apc_bulletin_cols` et `validation_rules` : une liste d'EXCEPTIONS, vide par
// défaut, donc aucune école n'a rien à configurer pour que la déduction
// s'applique. Pas de table nouvelle pour une préférence d'affichage — et pas de
// fonction Edge à redéployer.
//
// Clé : « <classe>|<matière> ». La même matière peut légitimement demander deux
// évaluations en 6e et trois en 3e.
export const cleConfigEvaluations = (classeSlug, matiereId) => `${classeSlug || ''}|${matiereId || ''}`;

export function lireConfigEvaluations(brut) {
  if (!brut) return {};
  if (typeof brut === 'object' && !Array.isArray(brut)) return brut;
  try {
    const j = JSON.parse(String(brut));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch { return {}; }
}

export function configEvaluationsPour(brut, classeSlug, matiereId) {
  const map = lireConfigEvaluations(brut);
  const v = map[cleConfigEvaluations(classeSlug, matiereId)] ?? map[matiereId];
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

// Écrit la configuration d'une matière, et RETIRE la clé quand elle retombe sur
// la déduction : une exception qui vaut la règle n'est pas une exception, et une
// liste qui enfle finit par cacher ce qu'elle contient.
export function ecrireConfigEvaluations(brut, classeSlug, matiereId, nombre, { nbCompetences, nbSequences = 2 } = {}) {
  const map = { ...lireConfigEvaluations(brut) };
  const cle = cleConfigEvaluations(classeSlug, matiereId);
  const defaut = nombreEvaluationsParDefaut(nbCompetences, nbSequences);
  const n = Number(nombre);
  if (!Number.isFinite(n) || n < 1 || Math.floor(n) === defaut) delete map[cle];
  else map[cle] = Math.min(Math.floor(n), capaciteEvaluations(nbCompetences, nbSequences));
  delete map[matiereId];                       // ancienne clé sans classe, si elle traîne
  return Object.keys(map).length ? JSON.stringify(map) : null;
}
