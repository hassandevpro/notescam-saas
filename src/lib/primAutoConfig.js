// Auto-configuration des « matières » (compétences nationales) d'une classe
// PRIMAIRE APC depuis le référentiel MINEDUB. Logique de résolution pure ; la
// persistance reste dans schoolStore (offline-first). Pendant de apcAutoConfig.js.

import { resolveClassEngine, primaireNiveauSlug } from '../core/engineResolver';
import { competencesForNiveau, subjectsFromPrimReferentiel } from '../core/primEngine';

// Renvoie les `subjects` (un par compétence 1A…6B) à créer pour `cls`, ou [] si
// non concerné. Les 11 compétences s'associent automatiquement — jamais à la main.
//   referentiel : blob primReferentiel { competences, niveauCompetences }
//   school      : pour bulletin_engine ('minedub' | 'apc_primaire')
//   cls         : { id, school_id, level, name, grade_max?, bulletin_engine? }
//   makeId      : générateur d'id (uuid)
export function buildSubjectsForPrimClass({ referentiel, school, cls, makeId }) {
  if (!referentiel || resolveClassEngine(school, cls) !== 'apc_primaire') return [];
  const niveau = primaireNiveauSlug(cls.level, cls.name);
  if (!niveau) return [];

  const competences = competencesForNiveau(referentiel, niveau);
  if (!competences.length) return [];

  return subjectsFromPrimReferentiel(competences, {
    schoolId: cls.school_id,
    classId: cls.id,
    gradeMax: cls.grade_max || 10, // primaire APC : saisie /10
    makeId,
  });
}
