// Auto-configuration des matières d'une classe du PROGRAMME D'ÉDUCATION BILINGUE
// SPÉCIAL (premier cycle) depuis le référentiel de l'arrêté 239-23/MINESEC.
// Résolution pure ; la persistance reste dans schoolStore (offline-first).

import { resolveClassEngine, firstCycleClasseSlug, isBilClasseEnService } from '../core/engineResolver';
import { matieresForBilClasse, subjectsFromBilReferentiel, bilSerieForClasseSlug } from '../core/bilEngine';

// (série, classe) du référentiel pour une classe de l'école, ou null.
// Le sous-système se déduit du niveau : 6e–3e → francophone, Form 1–3 →
// anglophone. Rien à saisir à la main, donc rien à saisir de travers.
//
// Renvoie null pour Form 4/5 : elles figurent dans le référentiel, mais ne sont
// PAS en service tant que l'établissement n'a pas arrêté ses orientations (leurs
// matières « au choix » rendraient le total de coefficients faux).
export function bilRefKeyForClass(cls) {
  const classeId = firstCycleClasseSlug(cls?.level || '', cls?.name || '');
  if (!classeId || !isBilClasseEnService(classeId)) return null;
  const serieId = bilSerieForClasseSlug(classeId);
  return serieId ? { serieId, classeId } : null;
}

// Renvoie les `subjects` à créer pour `cls` (ou [] si non concerné).
//
// `includeOptional` reste à false : les matières « au choix selon les
// orientations » (Form 4/5) ne sont JAMAIS créées d'office — l'orientation de
// l'élève n'est pas une donnée que le logiciel peut deviner. Dans le périmètre
// en service (6e–3e, Form 1–3), l'arrêté ne prévoit aucune option : la question
// ne se pose pas.
export function buildBilSubjectsForClass({ referentiel, school, cls, makeId, includeOptional = false }) {
  if (!referentiel || resolveClassEngine(school, cls) !== 'bilingue') return [];
  const key = bilRefKeyForClass(cls);
  if (!key) return [];

  const rows = matieresForBilClasse(referentiel, key);
  if (!rows.length) return [];

  return subjectsFromBilReferentiel(rows, {
    schoolId: cls.school_id,
    classId: cls.id,
    gradeMax: cls.grade_max || 20,
    makeId,
    includeOptional,
  });
}
