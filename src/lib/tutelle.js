// QUELLE TUTELLE MINISTÉRIELLE PORTE CE DOCUMENT ?
//
// Au Cameroun, deux ministères se partagent la scolarité :
//   • MINEDUB — Éducation de Base : maternelle et primaire (le « fondamental ») ;
//   • MINESEC — Enseignements Secondaires : collège et lycée.
// Les deux blocs d'en-tête existent déjà par pays (`ministry` / `ministryBasic`,
// src/countries/*.js). Ce qui manquait, c'est la RÈGLE : qui choisit, et pour
// quel document.
//
// Jusqu'ici la règle vivait dans src/pages/Bulletins.jsx et ne servait QU'AUX
// bulletins. Tous les autres documents officiels — procès-verbaux, tableau
// d'honneur, convocations, emploi du temps, listes — portaient le MINESEC sans
// condition, y compris pour une classe de maternelle. Demande de THE GENIUS
// (23/09/2026), école qui tient les deux ordres d'enseignement : MINEDUB au
// fondamental, MINESEC au secondaire, sur TOUS les documents.
//
// PUR : aucune dépendance à la base ni au store, donc testable tel quel.
import { classSectionKey } from '../core/engineResolver';

// La classe relève-t-elle du FONDAMENTAL (MINEDUB) ?
//
// RÈGLE REPRISE À L'IDENTIQUE de src/pages/Bulletins.jsx, volontairement : elle
// décide de la tutelle imprimée sur des bulletins déjà distribués dans 43
// établissements. La déplacer ne devait RIEN changer à ce qui sort aujourd'hui ;
// la resserrer aurait modifié en silence des documents officiels existants.
//
// Elle reconnaît le fondamental par la section déduite du nom (`maternelle`,
// `primaire`) OU par `cycle` en base dès qu'il vaut autre chose que
// « secondaire ». Le OU a une conséquence qu'il faut connaître : une classe
// NOMMÉE « 6eme » mais dont l'import a laissé `cycle = 'primaire'` passe au
// MINEDUB. Vérifié le 23/09/2026 sur THE GENIUS, l'école qui a motivé ce
// travail : ses 24 classes ont un `cycle` cohérent avec leur nom (les 4 classes
// du secondaire portent bien `secondaire`), donc aucune ne bascule à tort.
export function isBasicClass(cls) {
  if (!cls) return false;
  const sec = classSectionKey(cls);
  return sec === 'maternelle' || sec === 'primaire'
    || (!!cls.cycle && cls.cycle !== 'secondaire');
}

// Documents qui ne visent AUCUNE classe en particulier (liste du personnel,
// liste des souscripteurs d'un frais, tableau d'honneur de tout l'établissement).
// La tutelle ne peut alors se déduire que de la composition de l'école : on ne
// met MINEDUB que si elle n'a QUE du fondamental. Une école mixte — comme celle
// qui a motivé ce travail — garde donc le MINESEC sur ses documents d'ensemble,
// seul choix qui ne rende faux aucun des deux ordres.
export function isBasicSchool(classes = []) {
  const liste = (classes || []).filter(Boolean);
  if (!liste.length) return false;
  return liste.every((c) => isBasicClass(c));
}

// Entrée unique pour les générateurs de documents : une classe si on en a une,
// sinon la composition de l'école. `basic` explicite (rare) court-circuite tout.
export function tutelleBasic({ cls = null, classes = null, basic = null } = {}) {
  if (typeof basic === 'boolean') return basic;
  if (cls) return isBasicClass(cls);
  if (classes) return isBasicSchool(classes);
  return false;
}
