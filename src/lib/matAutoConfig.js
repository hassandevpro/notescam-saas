// Auto-configuration des « matières » (domaines) d'une classe MATERNELLE depuis le
// référentiel MINEDUB. Logique de résolution pure ; la persistance reste dans
// schoolStore (offline-first). Pendant de apcAutoConfig.js pour le préscolaire.

import { resolveClassEngine, maternelleNiveauSlug } from '../core/engineResolver';
import { domainesForMaternelle, subjectsFromMatReferentiel } from '../core/matEngine';

// Renvoie les `subjects` (un par domaine officiel) à créer pour `cls`, ou [] si
// non concerné. Les 8 domaines s'associent automatiquement — jamais manuellement.
//   referentiel : blob matReferentiel { domaines: [...] }
//   school      : pour bulletin_engine ('minedub' | 'maternelle')
//   cls         : { id, school_id, level, name, bulletin_engine? }
//   makeId      : générateur d'id (uuid)
export function buildSubjectsForMatClass({ referentiel, school, cls, makeId }) {
  if (!referentiel || resolveClassEngine(school, cls) !== 'maternelle') return [];
  if (!maternelleNiveauSlug(cls.level, cls.name)) return [];

  const domaines = domainesForMaternelle(referentiel);
  if (!domaines.length) return [];

  return subjectsFromMatReferentiel(domaines, {
    schoolId: cls.school_id,
    classId: cls.id,
    makeId,
  });
}
