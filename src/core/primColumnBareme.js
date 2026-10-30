// BARÈME D'UNE COLONNE DE SAISIE DU PRIMAIRE — logique pure.
//
// Le barème est porté par la NOTE (`prim_notes.points_max`). Une COLONNE de
// l'écran de saisie — un critère sur une unité d'apprentissage — n'a donc pas de
// barème à elle : elle le DÉDUIT de ses notes. Ces deux règles vivaient dans le
// composant, où rien ne pouvait les éprouver ; elles sont ici pour être testées.
//
// Pendant de `baremeFor` / `setBareme` côté premier cycle (ApcCompetenceWorkspace).

// Barème EN VIGUEUR pour une colonne.
//
// Ordre de lecture, et chaque cran a sa raison :
//   1. une note qui porte un barème explicite → c'est lui qui fait foi ;
//   2. une note SANS barème explicite → elle date d'avant la fonction, donc du
//      barème officiel du référentiel ;
//   3. aucune note → le barème que l'enseignant vient de poser sur une colonne
//      encore vide (`pending`), sinon l'officiel.
//
// LE CRAN 3 EST CELUI QUI MANQUAIT. Sans lui, poser un barème sur une colonne
// vide ne se voyait nulle part : la colonne réaffichait l'officiel, et il fallait
// le reposer une deuxième fois une fois les notes saisies.
//
//   notes : [{ note, points_max }] — les notes de la colonne, élève par élève
//           (une entrée absente/nulle = élève non noté)
export function baremeEnVigueur(notes, officiel, pending) {
  for (const r of notes || []) {
    if (r?.points_max != null) {
      const m = Number(r.points_max);
      if (Number.isFinite(m) && m > 0) return m;
    }
    if (r?.note != null && r.note !== '') return Number(officiel);
  }
  const p = Number(pending);
  return Number.isFinite(p) && p > 0 ? p : Number(officiel);
}

// Notes qui DÉPASSERAIENT un nouveau barème. Tant qu'il y en a, le changement
// est refusé : on ne transforme pas en silence un 18/20 en 18/10. L'enseignant
// corrige d'abord, et sait qui corriger — d'où le renvoi des porteurs et non d'un
// simple décompte.
//
//   porteurs : [{ id, name, note }] — un par élève noté
export function notesHorsBareme(porteurs, nouveau) {
  const max = Number(nouveau);
  if (!Number.isFinite(max) || max <= 0) return [];
  return (porteurs || []).filter((p) => {
    if (p?.note == null || p.note === '' || p.note === 'ABS') return false;
    const n = Number(p.note);
    return Number.isFinite(n) && n > max;
  });
}

// Notes SAISIES dans une colonne, quelle qu'en soit la valeur — 'ABS' comprise.
//
// Sert au seul cas de la REMISE À ZÉRO. Zéro n'est pas un barème : il dit « cette
// école ne pose aucun barème ici », donc retour au barème officiel du référentiel
// — et colonne FERMÉE quand le national n'en a pas (« Pratique » sur 1A, 1B, 2A).
// Fermer une colonne ne rend pas une note fausse comme le ferait une baisse de
// barème : elle la rend INVISIBLE, puisque la colonne quitte l'écran et les
// totaux. On refuse donc tant qu'il y a quoi que ce soit dedans, une absence
// saisie étant une saisie — ce filtre est pour cela plus large que
// `notesHorsBareme`, qui ne regarde que les nombres.
//
//   porteurs : [{ id, name, note }] — un par élève de la colonne
export function notesSaisies(porteurs) {
  return (porteurs || []).filter((p) => p?.note != null && p.note !== '');
}

// Un barème saisi est-il recevable ? Zéro ou négatif ne veut rien dire, et
// au-delà de 200 c'est une faute de frappe (2000 pour 20).
export const baremeRecevable = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 200;
};

// ── LE BARÈME D'OUVERTURE D'UNE COMPÉTENCE QUE L'ÉCOLE A AJOUTÉE ────────────
//
// LE DÉFAUT QUE CECI CORRIGE, mesuré le 2026-10-29. `prim_bareme_criteres` est
// une table NATIONALE : clé (`niveau_id`, `competence_id`), aucun `school_id`,
// aucune école n'y écrit. Une compétence qu'une école ajoute — « CHINESE »,
// « Espagnol », « Dictée », « Maths paper 1 » — n'y a donc AUCUNE ligne. Ses
// quatre colonnes naissaient à zéro, et une colonne à zéro a ses cases
// DÉSACTIVÉES (une note qui n'entre dans aucun total serait pire qu'une case
// fermée). L'enseignant arrivait donc devant un tableau entièrement grisé :
//
//     Élève | Oral à définir | Écrit à définir | Pratique à définir | …
//     ELEVE PROF 01    —        —        —        —      (toutes inactives)
//
// Il devait deviner qu'il fallait d'abord taper un chiffre dans la petite case
// du barème, en en-tête, avant que l'écran ne serve à quelque chose.
//
// ── LE BARÈME N'EST PAS INVENTÉ : IL EST REPRIS DE L'ÉCOLE, PUIS DU NATIONAL ─
//
// Sept bulletins réels de THE GENIUS (2025/2026, SIL à CM1) montrent que le
// barème n'est PAS une constante nationale :
//
//     SIL    1A français 40 · 2A maths 30 · 3A/3B/4/5/5A/5B 20 · CHINOIS 20
//     CE1    A/B/C 40 · 2A/2B 30 · 3A/3B/4/5/5A/5B 20
//     CM1    1B anglais 50 · Dictée 40 · Problèmes 50 · Calcul rapide 20
//     CLASS V  Maths paper 1 70 · English 1/2 50 · ICT 20 · EPS 20
//
// Et l'école s'écarte du national quand elle le juge bon : le MINEDUB donne
// 1A=30 en CE1, GENIUS écrit 40. D'où l'ordre de lecture ci-dessous — le plus
// proche de l'école d'abord, et JAMAIS une valeur sortie de nulle part :
//
//   1. CE QUE L'ÉCOLE FAIT DÉJÀ dans cette classe : le barème le plus fréquent
//      parmi les colonnes du même critère déjà en vigueur sur ses autres
//      compétences. Si ses matières sont sur /40 écrit, la nouvelle s'ouvre
//      sur /40 écrit.
//   2. LE GABARIT OFFICIEL LE PLUS FRÉQUENT DU NIVEAU : on prend le total
//      national modal des compétences de ce niveau (20 en SIL comme en CE1) —
//      une valeur du référentiel, pas une invention.
//   3. À défaut de tout référentiel chargé, 20 — l'échelle du carnet primaire.
//
// ── UNE SEULE COLONNE S'OUVRE, ET ELLE SE MODIFIE ───────────────────────────
//
// Seul « Écrit » reçoit ce barème. Dans les sept bulletins, CHAQUE matière
// ajoutée par l'école est évaluée « Written / Écrite » — CHINESE, Art and
// Crafts, ICT, EPS, English 1 et 2, French, Maths paper 1, Dictée, Problèmes.
// Les trois autres colonnes restent « à définir » : l'enseignant les ouvre s'il
// en veut, par la même petite case d'en-tête, et peut refermer celle-ci avec un
// zéro. Ouvrir les quatre d'office lui imposerait quatre notes par élève pour
// une matière qu'il évalue sur une seule épreuve.

const CRITERE_OUVERT = 'ecrit';
const BAREME_DERNIER_RECOURS = 20;

// La valeur la plus fréquente d'une liste ; à égalité, la plus GRANDE — un
// barème plus large ne refuse aucune note déjà saisie, l'inverse si.
function valeurModale(valeurs) {
  const compte = new Map();
  for (const v of valeurs || []) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    compte.set(n, (compte.get(n) || 0) + 1);
  }
  if (!compte.size) return null;
  return [...compte.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

// Le total national modal des compétences d'un niveau.
//   baremeCriteres : les lignes de `prim_bareme_criteres` (toutes)
export function totalNationalModal(baremeCriteres, niveauSlug) {
  const totaux = new Map();
  for (const b of baremeCriteres || []) {
    if (b?.niveau_id !== niveauSlug) continue;
    const cle = `${b.competence_id}_${b.aptitude || 'apte'}`;
    totaux.set(cle, (totaux.get(cle) || 0) + (Number(b.points_max) || 0));
  }
  return valeurModale([...totaux.values()]);
}

// Le barème d'ouverture, colonne par colonne.
//
//   critereIds   : les critères affichés pour cette compétence
//   officielPour : (critereId) => le barème NATIONAL de ce critère (0 si aucun)
//   baremesEcole : (critereId) => [barèmes en vigueur sur les AUTRES compétences
//                  de la classe pour ce critère]
//
// Renvoie { [critereId]: barème } — uniquement pour les colonnes à ouvrir. Une
// compétence qui a son barème national n'y figure pas : on ne touche jamais à ce
// que le référentiel a déjà dit.
export function baremeOuverture({ critereIds, officielPour, baremesEcole, baremeCriteres, niveauSlug }) {
  const officiel = (id) => Number(officielPour?.(id)) || 0;
  // Une compétence NATIONALE a déjà tout ce qu'il faut : on ne propose rien.
  if ((critereIds || []).some((id) => officiel(id) > 0)) return {};
  if (!(critereIds || []).includes(CRITERE_OUVERT)) return {};

  const valeur = valeurModale(baremesEcole?.(CRITERE_OUVERT))
    || totalNationalModal(baremeCriteres, niveauSlug)
    || BAREME_DERNIER_RECOURS;
  return { [CRITERE_OUVERT]: valeur };
}
