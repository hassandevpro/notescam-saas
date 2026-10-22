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
import { competencesForNiveau } from './primEngine.js';
import { domainesForMaternelle } from './matEngine.js';

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

// ── CE QU'UNE CLASSE TRAITE, PAR CYCLE ─────────────────────────────────────
//
// Les trois fonctions ci-dessous appliquent les DEUX filtres, dans cet ordre :
//   1. le MASQUAGE décidé par l'école (`ref_masques`) ;
//   2. le PÉRIMÈTRE de la classe (ses matières cochées).
//
// Elles existent pour qu'UN SEUL endroit décide. Le bulletin, le procès-verbal
// et le rapport de classe partaient chacun du référentiel brut, et chacun
// appliquait — ou pas — sa propre idée du filtrage : le bulletin appliquait les
// masques, le PV et le rapport n'appliquaient RIEN. Trois documents de la même
// classe pouvaient donc lister trois ensembles de matières différents, et le
// conseil de classe délibérait sur des colonnes que le bulletin n'imprimait pas.
//
// Chacune rend aussi `exclus`, pour que l'écran puisse ANNONCER ce qui a été
// écarté : c'est la contrepartie du garde-fou (une seule matière reconnue suffit
// à déclencher le filtre), et sans cet affichage le filtre serait invisible.

/**
 * Matières de la classe qui ne se rattachent à RIEN dans le référentiel.
 *
 * C'est le DERNIER écart possible entre « ce que j'ai coché dans la classe » et
 * « ce que je vois à la saisie et sur le bulletin ». Une matière maison, ou une
 * faute de frappe (« Allamand »), n'existe pas dans le référentiel officiel :
 * elle ne peut donc ni se saisir dans l'écran du cycle, ni s'imprimer sur le
 * bulletin officiel. C'est une contrainte du référentiel national, pas un
 * défaut — mais tant qu'on ne la NOMME pas, l'école voit une matière cochée qui
 * n'apparaît nulle part et conclut que le logiciel l'a perdue.
 *
 * Rend les LIGNES, pas les noms : l'appelant choisit ce qu'il affiche.
 */
export function unmatchedClassSubjects(kind, classSubjects, items, label) {
  const liste = (items || []).filter((x) => x && x.id != null);
  if (!liste.length) return [];
  return (classSubjects || []).filter((s) => {
    if (!s || !s.name) return false;
    if (kind === 'apc')  return (matiereIdsForSubject(s.name, liste, label)?.size ?? 0) === 0;
    if (kind === 'prim') return !competenceIdForSubject(s, liste);
    if (kind === 'mat')  return !domaineIdForSubject(s, liste, label);
    return false;
  });
}


/**
 * Matières APC du référentiel que la classe traite RÉELLEMENT.
 *
 * L'écran de SAISIE APC est organisé par matière du référentiel, pas par ligne
 * `subjects` : il proposait donc toutes les matières nationales de la classe,
 * alors que le bulletin, lui, n'imprimait que celles couvertes par les matières
 * cochées (`apcForClass`). Une enseignante pouvait saisir un trimestre entier
 * d'Informatique que le bulletin ne portait pas — en silence.
 *
 * Même garde-fou que `scopeOf` : rien de reconnu ⇒ liste INCHANGÉE.
 *
 * @param matieres      matières disponibles pour (classe, trimestre)
 * @param classSubjects lignes `subjects` de LA classe, enseignant non filtré
 * @param label         (m) => libellé affiché, pour reconnaître un nom localisé
 * @returns { matieres, exclus }
 */
export function apcMatieresForClass(matieres, classSubjects, label) {
  const liste = (matieres || []).filter((m) => m && m.id != null);
  const scope = scopeOf('apc', classSubjects, liste, label);
  return { matieres: applyScope(scope, liste), exclus: scope?.exclus || [] };
}

/** APC premier cycle (6e–3e). → { competences, exclus } */
export function apcForClass(referentiel, classSubjects, masques = []) {
  const toutes = (referentiel?.competences || []).filter((c) => !(masques || []).includes(c.id));
  const scope = scopeOf('apc', classSubjects, referentiel?.matieres);
  return { competences: applyScope(scope, toutes, (c) => c.matiere_id), exclus: scope?.exclus || [] };
}

/**
 * Primaire APC (SIL–CM2). → { competences, exclus }
 *
 * ── POURQUOI LE PRIMAIRE NE FILTRE PLUS PAR LES MATIÈRES DE LA CLASSE ───────
 *
 * RELEVÉ LE 2026-10-22, CE1 BIL de THE GENIUS : sur les ONZE compétences
 * nationales MINEDUB du niveau, NEUF étaient saisissables. Les deux écartées :
 *
 *     3A — Pratiquer les valeurs sociales
 *     4A — Démontrer l'autonomie, l'esprit d'initiative, la créativité et
 *          l'entrepreneuriat
 *
 * Ce ne sont pas des oublis de l'école : ce sont des compétences TRANSVERSALES.
 * Aucune matière ne porte leur nom, et aucune école n'aura jamais une matière
 * « Entrepreneuriat » en CE1. Le filtre les écartait donc de la saisie ET du
 * bulletin officiel, dans toutes les écoles du primaire, pour toujours.
 *
 * C'est exactement ce que ce module s'interdit, en haut de ce fichier :
 *
 *     « Un bulletin qui porte une matière en trop est un défaut ; un bulletin
 *       qui en oublie une est une faute, et elle se découvre devant un parent. »
 *
 * Le garde-fou prévu — « on ne filtre que si au moins une matière se rapproche
 * du référentiel » — ne protégeait pas de ce cas : les neuf autres compétences
 * étant reconnues, le filtre s'appliquait et emportait les deux transversales.
 *
 * ── CE QUI REMPLACE LE FILTRE ───────────────────────────────────────────────
 *
 * Le MASQUAGE, qui existait déjà et que l'écran nomme (« Modifier les
 * compétences »). Il dit ce que le filtre voulait dire — « cette école ne
 * traite pas cela » — mais il le dit EXPLICITEMENT, école par école, au lieu de
 * le déduire d'un rapprochement de noms qui ne peut pas réussir pour une
 * compétence sans matière.
 *
 * Le premier cycle (apcForClass) et la maternelle (matForClass) GARDENT leur
 * filtre : leurs référentiels sont faits de matières et de domaines qui portent
 * des noms de matières, donc le rapprochement y a un sens. C'est le primaire,
 * et lui seul, dont le référentiel mêle compétences scolaires et compétences
 * transversales.
 *
 * Le paramètre classSubjects reste dans la signature : les appelants le
 * passent, et la question « cette matière correspond-elle à une compétence ? »
 * continue d'être posée ailleurs, par unmatchedClassSubjects, qui NOMME les
 * matières sans correspondance au lieu de retirer des compétences.
 */
export function primForClass(referentiel, niveauSlug, classSubjects, masques = []) {   // eslint-disable-line no-unused-vars
  if (!referentiel || !niveauSlug) return { competences: [], exclus: [] };
  const duNiveau = competencesForNiveau(referentiel, niveauSlug);
  return { competences: duNiveau.filter((c) => !(masques || []).includes(c.id)), exclus: [] };
}

/** Maternelle (PS/MS/GS). → { domaines, exclus } */
export function matForClass(referentiel, classSubjects, masques = []) {
  const tous = domainesForMaternelle(referentiel);
  const visibles = tous.filter((d) => !(masques || []).includes(d.id));
  const scope = scopeOf('mat', classSubjects, tous);
  return { domaines: applyScope(scope, visibles), exclus: scope?.exclus || [] };
}
