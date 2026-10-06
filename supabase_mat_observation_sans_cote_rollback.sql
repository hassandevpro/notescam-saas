-- ROLLBACK de supabase_mat_observation_sans_cote.sql
-- ============================================================================
-- Remet `mat_observations.niveau_acquis` en NOT NULL.
--
-- ATTENTION : le NOT NULL ne peut être rétabli que si AUCUNE ligne n'est sans
-- cote. Relevez-les d'abord — ce sont des commentaires écrits avant la
-- notation, et les supprimer ferait perdre le travail de l'institutrice :
--
--   SELECT eleve_id, domaine_id, trimestre_id, observation
--     FROM public.mat_observations WHERE niveau_acquis IS NULL;
--
-- À n'exécuter que si l'on revient aussi au code d'avant. Sinon la saisie d'une
-- observation sans cote repartira en échec silencieux dans la file hors-ligne,
-- qui est précisément le défaut corrigé.
-- ============================================================================

ALTER TABLE public.mat_observations
  DROP CONSTRAINT IF EXISTS mat_observations_niveau_acquis_valide;

ALTER TABLE public.mat_observations
  ALTER COLUMN niveau_acquis SET NOT NULL;

ALTER TABLE public.mat_observations
  ADD CONSTRAINT mat_observations_niveau_acquis_check
  CHECK (niveau_acquis IN ('A', 'ECA', 'NA'));
