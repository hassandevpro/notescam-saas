// Auto-configuration des matières d'une classe de SECOND CYCLE depuis le
// référentiel MINESEC (séries/coefficients/groupes). Logique de résolution pure ;
// la persistance reste dans schoolStore (offline-first).

import { resolveClassEngine, secondCycleClasseSlug } from '../core/engineResolver';
import { matieresForSerieClasse, subjectsFromReferentiel } from '../core/scEngine';
import { buildBilSubjectsForClass } from './bilAutoConfig';

// Renvoie les `subjects` à créer pour `cls` (ou [] si non concerné).
//   referentiel    : blob scReferentiel
//   bilReferentiel : blob bilReferentiel (Programme Bilingue Spécial, 1er cycle)
//   school         : pour bulletin_engine
//   cls            : { id, level, name, serie, grade_max }
//   makeId         : générateur d'id (uuid)
export function buildSubjectsForClass({ referentiel, bilReferentiel, school, cls, makeId }) {
  const engine = resolveClassEngine(school, cls);

  // Premier cycle bilingue spécial : résolu par son moteur dédié AVANT tout
  // repli à vide. Sans ce branchement, une classe de 6e bilingue repartait sans
  // aucune matière — `secondCycleClasseSlug` ne connaît pas le premier cycle.
  if (engine === 'bilingue') {
    return buildBilSubjectsForClass({ referentiel: bilReferentiel, school, cls, makeId });
  }

  if (!referentiel || engine !== 'sc') return [];
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
