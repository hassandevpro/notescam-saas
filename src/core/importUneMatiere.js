// IMPORT DE NOTES : UNE MATIÈRE À LA FOIS.
//
// ── POURQUOI CETTE RÈGLE ────────────────────────────────────────────────────
//
// Consigne du responsable, 2026-10-23 : « il faut aussi que l'import de note se
// fasse une matière à la fois ».
//
// Le classeur exporté depuis l'écran de saisie porte UNE COLONNE PAR MATIÈRE de
// la classe. L'import lisait donc TOUTES les colonnes reconnues d'un coup :
// l'enseignant de mathématiques qui réimportait son fichier écrivait aussi, sans
// le vouloir, dans les colonnes de ses collègues — celles qu'il avait sous les
// yeux dans le classeur, à l'état où elles étaient lors de l'export, c'est-à-dire
// périmées dès qu'un collègue avait saisi entre-temps.
//
// La 0.3.19 avait déjà fermé la moitié du piège : une cellule VIDE n'efface plus
// la note en place. Mais une cellule PLEINE et périmée, elle, écrasait toujours.
// Choisir la matière ferme l'autre moitié : ce qui est écrit est ce qui a été
// demandé, et une seule colonne du fichier est lue.
//
// Module PUR (aucun React, aucun Supabase) pour que la règle soit vérifiable
// seule : cf. _importUneMatiere.test.mjs.

// Appariement des noms : même règle que l'écran historique — casse ignorée,
// rien d'autre. Volontairement conservée à l'identique : changer la façon
// d'apparier les élèves n'est pas ce qui a été demandé.
const cle = (s) => String(s ?? '').toLowerCase();

// Matières de la CLASSE que le classeur porte, dans l'ordre du fichier. Une
// colonne que la classe ne connaît pas est ignorée (matière d'une autre classe,
// colonne de synthèse…), exactement comme avant.
export function matieresDuClasseur(nomsDeColonnes, matieresDeLaClasse) {
  return (nomsDeColonnes || [])
    .map((n) => (matieresDeLaClasse || []).find((m) => cle(m.name) === cle(n)))
    .filter(Boolean);
}

// Lignes à écrire pour LA SEULE matière choisie.
//
//   lignes  : [{ studentName, grades: { <nom de colonne>: <valeur brute> } }]
//   eleves  : [{ id, name }] élèves de la classe
//   matiere : { id, name, max } matière choisie — sans elle, on n'écrit RIEN
//   valider : (brut, max) => '' | 'ABS' | '12.5' | null  (lib/gradeEntry)
//
// Rend, pour chaque ligne du fichier : l'élève reconnu (ou null) et les notes à
// enregistrer. `gradeEntries` est VIDE quand la cellule est vide (on ne touche
// à rien) ou hors barème (refusée) — c'est ce qui distingue « ignorée » de
// « effacée ».
export function lignesPourMatiere({ lignes, eleves, matiere, valider }) {
  if (!matiere) return [];
  const parNom = new Map((eleves || []).map((e) => [cle(e.name), e]));
  return (lignes || []).map((ligne) => {
    const eleve = parNom.get(cle(ligne.studentName)) || null;
    // UNE SEULE COLONNE EST LUE. Les autres colonnes du classeur peuvent porter
    // des valeurs : elles ne sont pas regardées.
    const entree = Object.entries(ligne.grades || {}).find(([nom]) => cle(nom) === cle(matiere.name));
    const brut = entree ? entree[1] : undefined;
    const valide = brut === undefined ? '' : valider(brut, matiere.max);
    const gradeEntries = (valide === null || valide === '') ? {} : { [matiere.id]: valide };
    return { student: eleve, studentName: ligne.studentName, gradeEntries };
  });
}
