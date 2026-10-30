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
 * PRIMAIRE — matières de la classe qui ont besoin de LEUR PROPRE compétence.
 *
 * ── LE DÉFAUT QUE CECI CORRIGE ─────────────────────────────────────────────
 * Le rapprochement par mots-clés est VOLONTAIREMENT large : « Lecture » et
 * « Grammaire » tombent toutes deux sur 1A, et c'est fidèle au référentiel —
 * il n'existe qu'une compétence de français. Mais la même largeur fait tomber
 * `Français`, `French` ET `French Language` sur 1A, et `Mathématiques` avec
 * `Mathematics` sur 2A. Sur une classe BILINGUE, qui porte les deux programmes
 * avec deux barèmes (/20 et /100), le second programme disparaît donc entièrement
 * du bulletin et de la saisie — alors que l'écran de la classe promet le
 * contraire : « Les compétences et les unités d'apprentissage de ces matières
 * apparaissent alors à la saisie et sur le bulletin ».
 *
 * MESURÉ le 2026-10-29 sur CE2 BIL (37 matières cochées) : 9 compétences
 * nationales atteintes, 3 matières sans compétence, et 25 matières noyées dans
 * une fusion — dont 8 compétences mélangeant /20 et /100 dans une seule ligne.
 *
 * ── LA RÈGLE ───────────────────────────────────────────────────────────────
 * La PREMIÈRE matière (dans l'ordre de la classe) qui réclame une compétence la
 * garde : le squelette ministériel et son barème de niveau sont préservés.
 * Chaque matière SUIVANTE qui réclamerait la même reçoit sa propre compétence
 * maison — exactement le sort déjà réservé à une matière qui ne tombe sur rien
 * (Chinois, Practical Work…), par le même chemin et le même écran.
 *
 * Idempotent par construction : une fois la compétence maison créée, elle PORTE
 * le nom de la matière, et `competenceIdForSubject` teste le libellé (étape 2)
 * AVANT les mots-clés (étape 3). La matière cesse donc d'être en collision au
 * cycle suivant, et rien n'est créé deux fois.
 *
 * @param classSubjects lignes `subjects` de LA classe, dans l'ordre d'affichage
 * @param competences   compétences du référentiel pour le niveau
 * @returns les matières à matérialiser (jamais la première d'une compétence)
 */
export function primSubjectsNeedingOwnCompetence(classSubjects, competences) {
  const liste = (competences || []).filter((c) => c && c.id != null);
  const prises = new Set();
  const besoin = [];
  for (const s of (classSubjects || [])) {
    if (!s || !s.name) continue;
    const id = competenceIdForSubject(s, liste);
    if (!id) { besoin.push(s); continue; }        // ne se rattache à rien
    if (prises.has(id)) { besoin.push(s); continue; } // compétence déjà prise
    prises.add(id);
  }
  return besoin;
}

/**
 * MATERNELLE — même règle, sur les DOMAINES.
 *
 * La maternelle n'avait AUCUN rattrapage : une matière cochée qui ne tombait sur
 * aucun domaine était seulement NOMMÉE dans un bandeau, et restait absente de la
 * saisie comme du bulletin. Et `scopeOf` écarte les domaines non couverts dès
 * qu'une seule matière est reconnue — donc deux matières sur le même domaine en
 * faisaient disparaître une.
 */
export function matSubjectsNeedingOwnDomaine(classSubjects, domaines, label) {
  const liste = (domaines || []).filter((d) => d && d.id != null);
  const prises = new Set();
  const besoin = [];
  for (const s of (classSubjects || [])) {
    if (!s || !s.name) continue;
    const id = domaineIdForSubject(s, liste, label);
    if (!id) { besoin.push(s); continue; }
    if (prises.has(id)) { besoin.push(s); continue; }
    prises.add(id);
  }
  return besoin;
}

// Le PREMIER CYCLE APC a déjà son point de décision unique, qui connaît en plus
// les rattachements de niveau : `core/apcRattrapage.manquesPourClasse`. La même
// règle y vit, et elle n'est pas dupliquée ici.


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
 * ── DEUX RÈGLES, PARCE QU'IL Y A DEUX SORTES DE COMPÉTENCES ─────────────────
 *
 * NATIONALE (school_id nul) : TOUJOURS retenue, sauf si l'école la masque.
 *
 *   RELEVÉ LE 2026-10-22, CE1 BIL de THE GENIUS : sur les ONZE compétences
 *   nationales MINEDUB du niveau, NEUF étaient saisissables. Les deux écartées :
 *
 *       3A — Pratiquer les valeurs sociales
 *       4A — Démontrer l'autonomie, l'esprit d'initiative, la créativité et
 *            l'entrepreneuriat
 *
 *   Ce ne sont pas des oublis de l'école : ce sont des compétences
 *   TRANSVERSALES. Aucune matière ne porte leur nom, et aucune école n'aura
 *   jamais une matière « Entrepreneuriat » en CE1. Le filtre par matières
 *   cochées ne pouvait donc PAS les retenir — jamais, nulle part — et il les
 *   retirait de la saisie ET du bulletin officiel, dans toutes les écoles.
 *
 *   C'est exactement ce que ce module s'interdit, en haut de ce fichier :
 *   « un bulletin qui en oublie une est une faute, et elle se découvre devant
 *   un parent ». Le levier de l'école reste le MASQUAGE, qui dit la même chose
 *   explicitement au lieu de la déduire d'un rapprochement impossible.
 *
 * MAISON (school_id posé) : retenue seulement si une matière de CETTE classe la
 * couvre.
 *
 *   Une compétence maison n'existe que parce qu'une matière de l'école l'a fait
 *   naître — « Travaux Pratiques », « Economics ». Elle n'a donc de sens que
 *   dans les classes où cette matière est cochée. Sans cette règle elle
 *   apparaîtrait dans TOUTES les classes du primaire de l'école, puisque
 *   `prim_niveau_competences` est vide en base (donc « applicable partout ») et
 *   qu'aucune école ne peut y écrire : la table est GLOBALE, sans school_id.
 *
 *   Le rapprochement par nom suffit ici, et il ne peut pas échouer comme pour
 *   les transversales : la compétence maison PORTE le nom de la matière, parce
 *   que c'est elle qui l'a créée.
 *
 * Le premier cycle (apcForClass) et la maternelle (matForClass) gardent leur
 * filtre d'origine : leurs référentiels sont faits de matières et de domaines
 * qui portent des noms de matières, donc le rapprochement y a un sens partout.
 */
export function primForClass(referentiel, niveauSlug, classSubjects, masques = []) {
  if (!referentiel || !niveauSlug) return { competences: [], exclus: [] };
  const duNiveau = competencesForNiveau(referentiel, niveauSlug);
  const visibles = duNiveau.filter((c) => !(masques || []).includes(c.id));

  // Ce que les matières de la classe couvrent réellement. Sert UNIQUEMENT à
  // décider du sort des compétences maison.
  const couvertes = new Set();
  for (const s of (classSubjects || [])) {
    const id = competenceIdForSubject(s, duNiveau);
    if (id) couvertes.add(id);
  }

  const retenues = visibles.filter((c) => !c.school_id || couvertes.has(c.id));
  return {
    // Les compétences MAISON repartent avec leur FAMILLE (voir ci-dessous) :
    // sans elle, le carnet les imprimait sous aucun regroupement.
    competences: avecFamilleDeduite(retenues),
    exclus: [],
  };
}

/**
 * LA FAMILLE D'UNE COMPÉTENCE MAISON, DÉDUITE DE CELLE QU'ELLE DOUBLE.
 *
 * ── LE DÉFAUT, RELEVÉ SUR LA VRAIE BASE LE 2026-10-29 ─────────────────────
 *
 * THE GENIUS porte 38 compétences d'école (`prim_competences.school_id` posé),
 * nées du rattrapage « une matière cochée a sa ligne » : English, Mathematics,
 * Science, Social Studies, French, Arts, Citizenship, Physical Education,
 * Computer Studies, French Language, Music… Mesuré en base :
 *
 *     select count(*) from prim_competences where school_id = '6b68407b-…'
 *       and domaine is not null;   →  0
 *
 * Or `groupesDe` range une ligne par le NUMÉRO de son code, sinon par son
 * DOMAINE. Une maison n'a ni l'un (son code est « EN », « MA2 », « SC » — jamais
 * un code du ministère) ni l'autre : elle restait donc HORS de tout
 * regroupement. Sur le carnet de CE2 BIL, cela donne six bandeaux officiels
 * suivis de trente lignes orphelines, alors que le carnet papier de l'école
 * range chaque matière sous sa famille.
 *
 * ── D'OÙ VIENT LA FAMILLE, ET POURQUOI ELLE N'EST PAS INVENTÉE ────────────
 *
 * Une compétence maison existe précisément PARCE QUE son nom tombait déjà sur
 * une compétence nationale (« English » sur 1B, « Mathematics » sur 2A) et que
 * celle-ci était prise par une autre matière — c'est la règle du 2026-10-29.
 * Sa famille est donc connue : c'est celle de la nationale qu'elle double. On la
 * relit avec le MÊME rapprochement que celui qui l'a fait naître, restreint aux
 * compétences nationales.
 *
 * Ce qui ne tombe sur rien (« Chinois ») reste sans famille, et donc hors
 * regroupement. C'est voulu : mieux vaut une ligne visiblement à part qu'une
 * matière rangée de force dans une famille qui n'est pas la sienne.
 *
 * ── POURQUOI À LA LECTURE, ET NON EN BASE ─────────────────────────────────
 *
 * Les 38 lignes existent déjà en production. Les corriger demanderait un UPDATE
 * sur la base de l'école, que je n'ai pas l'autorisation de faire. Déduire à la
 * lecture donne le même résultat, sans écriture, et vaut aussi pour les écoles
 * qui créeront la leur demain. Un `domaine` RÉELLEMENT posé par l'école (écran
 * des référentiels) fait toujours foi : on ne complète que les vides.
 */
export function avecFamilleDeduite(competences) {
  const liste = (competences || []).filter((c) => c && c.id != null);
  const nationales = liste.filter((c) => !c.school_id);
  if (!nationales.length) return competences;
  return (competences || []).map((c) => {
    if (!c || !c.school_id || c.domaine) return c;
    const natId = competenceIdForSubject({ name: c.intitule }, nationales);
    const nat = natId ? nationales.find((n) => n.id === natId) : null;
    return nat?.domaine ? { ...c, domaine: nat.domaine } : c;
  });
}


/** Maternelle (PS/MS/GS). → { domaines, exclus } */
export function matForClass(referentiel, classSubjects, masques = []) {
  const tous = domainesForMaternelle(referentiel);
  const visibles = tous.filter((d) => !(masques || []).includes(d.id));
  const scope = scopeOf('mat', classSubjects, tous);
  return { domaines: applyScope(scope, visibles), exclus: scope?.exclus || [] };
}
