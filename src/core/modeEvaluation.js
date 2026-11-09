// MODE D'ÉVALUATION D'UNE CLASSE : garde-fou du changement.
//
// Le « mode d'évaluation » n'est PAS un champ séparé : c'est le moteur résolu de la classe
// (`resolveClassEngine`, qui lit `classes.bulletin_engine`). Pour une classe du primaire :
//   'apc_primaire' = COMPÉTENCES (saisie par critères, bulletin par compétences) ;
//   'classic'      = MATIÈRES (matières de la classe, barème libre, bulletin classique).
// Saisie, calculs et bulletin lisent la MÊME valeur, donc le mode et le gabarit sont liés par construction.
//
// POURQUOI UN GARDE-FOU. Les notes d'un mode ne se lisent pas dans l'autre : des notes de compétences
// (`prim_notes`) sont invisibles pour l'écran des matières (`grades`), et réciproquement. Basculer une
// classe qui a déjà des notes les ferait « disparaître » de l'écran — alors qu'elles sont toujours en base.
// On NE CONVERTIT et on NE SUPPRIME jamais : on refuse, et on dit pourquoi.
import { resolveClassEngine } from './engineResolver.js';

/** Le mode, en clair, d'un moteur résolu. */
export function modeDeMoteur(moteur) {
  if (moteur === 'apc_primaire') return 'competences';
  if (moteur === 'classic') return 'matieres';
  return moteur || 'inconnu';
}

/** Le mode effectif d'une classe, pour une école donnée. */
export function modeDeClasse(school, cls) {
  return modeDeMoteur(resolveClassEngine(school, cls));
}

/**
 * Le changement de réglage change-t-il le MODE effectif ? (null → 'classic' dans une école déjà classique
 * ne change rien et n'a donc pas à être bloqué.)
 */
export function modeChange(school, cls, nouveauReglage) {
  const avant = resolveClassEngine(school, cls);
  const apres = resolveClassEngine(school, { ...cls, bulletin_engine: nouveauReglage || null });
  return avant !== apres;
}

/**
 * @param aDesNotes true | false | null  (null = vérification impossible : hors connexion, lecture refusée)
 * @returns {{ bloque: boolean, raison: null|'notes'|'inverifiable' }}
 */
export function garde({ change, aDesNotes }) {
  if (!change) return { bloque: false, raison: null };
  if (aDesNotes === true) return { bloque: true, raison: 'notes' };
  if (aDesNotes === null || aDesNotes === undefined) return { bloque: true, raison: 'inverifiable' };
  return { bloque: false, raison: null };
}
