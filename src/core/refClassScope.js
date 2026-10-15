// PÉRIMÈTRE RÉEL D'UNE CLASSE DANS UN RÉFÉRENTIEL NATIONAL
//
// ── LE DÉFAUT QUE CE MODULE FERME ──────────────────────────────────────────
//
// Les bulletins OFFICIELS listent les matières, compétences ou domaines du
// RÉFÉRENTIEL NATIONAL — pas les matières cochées dans la classe :
//   • APC 6e–3e  → `referentiel.matieres` (apcBulletinDoc, assemblePeriod)
//   • Primaire   → `competencesForNiveau(...)`
//   • Maternelle → `domainesForMaternelle(...)`
//
// Décocher une matière dans l'écran Classes n'avait donc AUCUN effet sur ces
// bulletins. Une école retirait « Informatique » de sa 6e, la case restait
// décochée, et la ligne continuait de s'imprimer sur le bulletin officiel. Le
// seul levier existant était le MASQUAGE du référentiel, dans un autre écran
// (la saisie des notes) — personne ne le trouve, et rien, dans Classes, ne
// laissait deviner que la case n'y changeait rien.
//
// Le second cycle (lycée) et le bulletin classique, eux, partent déjà des
// matières de la classe : ils n'ont jamais eu ce défaut.
//
// ── CE QUE FAIT CE MODULE ──────────────────────────────────────────────────
//
// Il répond à une seule question : QUE COUVRE RÉELLEMENT CETTE CLASSE ? Il ne
// réinvente aucun appariement — chaque cycle a déjà le sien, qui connaît son
// identifiant explicite et ses alias de noms, et qui est testé :
//   apcMatiereMatch.matiereIdsForSubject    (« SVT » → SVTEEHB, « Histoire-Géo »
//                                            → histoire ET geographie)
//   primCompetenceMatch.competenceIdForSubject  (`subjects.prim_competence_id`
//                                            d'abord, puis le nom)
//   matDomaineMatch.domaineIdForSubject     (`subjects.mat_domaine_id` d'abord)
//
// ── LE GARDE-FOU, QUI EST LE CŒUR DU SUJET ─────────────────────────────────
//
// Filtrer un bulletin officiel par les matières d'une classe est DANGEREUX. Si
// la résolution échoue — noms inhabituels, classe dont les matières n'ont jamais
// été configurées, référentiel pas encore chargé — il ne faut SURTOUT PAS rendre
// un bulletin vide. Un bulletin qui porte une matière en trop est un défaut ;
// un bulletin qui en oublie une est une faute, et elle se découvre devant un
// parent.
//
// Règle, donc : on ne filtre QUE si la classe a des matières ET qu'au moins une
// se rapproche du référentiel. Sinon `scopeOf` rend `null`, et l'appelant
// n'applique AUCUN filtre — exactement le comportement d'avant ce module.
//
// Conséquence assumée : une classe dont AUCUNE matière n'est reconnue garde son
// bulletin complet. C'est voulu. Le jour où une seule matière est reconnue, le
// filtre s'applique — d'où le `exclus` renvoyé, que l'écran AFFICHE : l'école
// doit voir ce qui a été écarté, et non le découvrir à l'impression.

import { matiereIdsForSubject } from './apcMatiereMatch.js';
import { competenceIdForSubject } from './primCompetenceMatch.js';
import { domaineIdForSubject } from './matDomaineMatch.js';

/**
 * Périmètre d'une classe pour un cycle donné.
 *
 * @param kind          'apc' | 'prim' | 'mat'
 * @param classSubjects lignes `subjects` de LA classe (déjà filtrées sur class_id)
 * @param items         éléments du référentiel : matières (apc), compétences
 *                      (prim) ou domaines (mat) — [{ id, … }]
 * @param label         (item) => libellé affiché, pour reconnaître un nom localisé
 * @returns {null | { ids: Set<string>, exclus: string[] }}
 *          `null` = NE PAS FILTRER (rien de reconnu : on ne prend pas le risque).
 *          Sinon `ids` = ce que la classe couvre, `exclus` = les ids du
 *          référentiel écartés, pour que l'écran puisse les annoncer.
 */
export function scopeOf(kind, classSubjects, items, label) {
  const liste = (items || []).filter((x) => x && x.id != null);
  const matieres = (classSubjects || []).filter((s) => s && s.name);
  if (!liste.length || !matieres.length) return null;

  const ids = new Set();
  for (const sub of matieres) {
    if (kind === 'apc') {
      // Une matière locale peut couvrir PLUSIEURS matières officielles
      // (« Histoire-Géo » → Histoire + Géographie) : d'où un ensemble.
      for (const id of matiereIdsForSubject(sub.name, liste, label) || []) ids.add(id);
    } else if (kind === 'prim') {
      const id = competenceIdForSubject(sub, liste);
      if (id) ids.add(id);
    } else if (kind === 'mat') {
      const id = domaineIdForSubject(sub, liste, label);
      if (id) ids.add(id);
    }
  }

  // LE GARDE-FOU : rien de reconnu ⇒ on ne filtre pas. Un bulletin complet avec
  // une matière en trop vaut infiniment mieux qu'un bulletin vide.
  if (!ids.size) return null;

  const exclus = liste.filter((x) => !ids.has(x.id)).map((x) => x.id);
  return { ids, exclus };
}

/**
 * Applique un périmètre à une liste du référentiel.
 *
 * `scope` à `null` rend la liste INCHANGÉE — c'est le chemin par défaut, et
 * c'est ce qui rend ce module sûr à brancher partout.
 *
 * @param idOf  pour l'APC, l'élément filtré est une COMPÉTENCE alors que le
 *              périmètre porte sur des MATIÈRES : on lit donc `c.matiere_id`.
 */
export function applyScope(scope, items, idOf = (x) => x?.id) {
  if (!scope || !scope.ids) return items || [];
  return (items || []).filter((x) => scope.ids.has(idOf(x)));
}
