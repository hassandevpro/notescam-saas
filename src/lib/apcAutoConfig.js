// Auto-configuration des matières d'une classe de PREMIER CYCLE (APC) depuis le
// référentiel MINESEC (matières/coefficients par classe). Logique de résolution
// pure ; la persistance reste dans schoolStore (offline-first). Pendant de
// scAutoConfig.js pour le second cycle.

import { resolveClassEngine, firstCycleClasseSlug } from '../core/engineResolver';
import { matieresForApcClasse, subjectsFromApcReferentiel } from '../core/apcEngine';

// Renvoie les `subjects` à créer pour `cls` (ou [] si non concerné).
//   referentiel : blob apcReferentiel
//   school      : pour bulletin_engine ('apc_minesec' | 'minesec')
//   cls         : { id, level, name, grade_max }
//   makeId      : générateur d'id (uuid)
export function buildSubjectsForApcClass({ referentiel, school, cls, makeId }) {
  if (!referentiel || resolveClassEngine(school, cls) !== 'apc') return [];
  const classeId = firstCycleClasseSlug(cls.level, cls.name);
  if (!classeId) return [];

  const rows = matieresForApcClasse(referentiel, classeId);
  if (!rows.length) return [];

  return subjectsFromApcReferentiel(rows, {
    schoolId: cls.school_id,
    classId: cls.id,
    gradeMax: cls.grade_max || 20,
    makeId,
  });
}
