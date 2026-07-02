// Auto-configuration des matières d'une classe de SECOND CYCLE depuis le
// référentiel MINESEC (séries/coefficients/groupes). Logique de résolution pure ;
// la persistance reste dans schoolStore (offline-first).

import { resolveClassEngine, secondCycleClasseSlug } from '../core/engineResolver';
import { matieresForSerieClasse, subjectsFromReferentiel } from '../core/scEngine';

// Renvoie les `subjects` à créer pour `cls` (ou [] si non concerné).
//   referentiel : blob scReferentiel
//   school      : pour bulletin_engine
//   cls         : { id, level, name, serie, grade_max }
//   makeId      : générateur d'id (uuid)
export function buildSubjectsForClass({ referentiel, school, cls, makeId }) {
  if (!referentiel || resolveClassEngine(school, cls) !== 'sc') return [];
  const serieId  = (cls.serie || '').toLowerCase();
  const classeId = secondCycleClasseSlug(cls.level, cls.name);
  if (!serieId || !classeId) return [];

  const rows = matieresForSerieClasse(referentiel, { serieId, classeId });
  if (!rows.length) return [];

  return subjectsFromReferentiel(rows, {
    schoolId: cls.school_id,
    classId: cls.id,
    gradeMax: cls.grade_max || 20,
    makeId,
  });
}
