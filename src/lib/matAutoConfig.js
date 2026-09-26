// Auto-configuration des « matières » (domaines) d'une classe MATERNELLE depuis le
// référentiel MINEDUB. Logique de résolution pure ; la persistance reste dans
// schoolStore (offline-first). Pendant de apcAutoConfig.js pour le préscolaire.

import { resolveClassEngine, maternelleNiveauSlug } from '../core/engineResolver';
import { domainesForMaternelle, subjectsFromMatReferentiel } from '../core/matEngine';
import { matDomaineLabel } from '../core/referentielI18n';

// Renvoie les `subjects` (un par domaine officiel) à créer pour `cls`, ou [] si
// non concerné. Les 8 domaines s'associent automatiquement — jamais manuellement.
//   referentiel : blob matReferentiel { domaines: [...] }
//   school      : pour bulletin_engine ('minedub' | 'maternelle')
//   cls         : { id, school_id, level, name, bulletin_engine? }
//   makeId      : générateur d'id (uuid)
export function buildSubjectsForMatClass({ referentiel, school, cls, makeId }) {
  if (!referentiel || resolveClassEngine(school, cls) !== 'maternelle') return [];
  if (!maternelleNiveauSlug(cls.level, cls.name)) return [];

  // Le référentiel est stocké en français ; une classe du secteur anglophone
  // (Nursery) naît avec ses domaines nommés en anglais. `mat_domaine_id` reste
  // porté par chaque matière, donc le rattachement au référentiel est intact.
  const sys = cls?.system || 'FR';
  const domaines = domainesForMaternelle(referentiel)
    .map((d) => ({ ...d, intitule: matDomaineLabel(d, sys) }));
  if (!domaines.length) return [];

  return subjectsFromMatReferentiel(domaines, {
    schoolId: cls.school_id,
    classId: cls.id,
    makeId,
  });
}
