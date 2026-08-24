-- supabase_scope_global_rpc.sql
-- Permet à l'administrateur de définir le périmètre GLOBAL EXPLICITE d'un compte.
--
-- `admin_set_staff_scope` ne savait écrire que les trois tableaux de périmètre.
-- Depuis supabase_sector_isolation.sql, « tableaux vides » ne vaut plus « tout
-- l'établissement » : il faut donc pouvoir poser scope_global = true de façon
-- explicite, sans quoi un compte transversal (RAF, Caisse, Contrôle) créé après
-- la migration n'aurait accès à rien.
--
-- Le paramètre est ajouté avec une valeur par défaut : les appels existants
-- (front non encore déployé) continuent de fonctionner et posent
-- scope_global = false — c'est-à-dire la règle stricte, jamais un élargissement
-- implicite.
--
-- AUCUNE POLICY N'EST TOUCHÉE.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_staff_scope(
  p_school_user_id uuid,
  p_sections       text[],
  p_cycles         text[],
  p_class_ids      uuid[],
  p_global         boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id uuid;
BEGIN
  -- L'appelant doit être administrateur actif d'une école.
  SELECT school_id INTO v_school_id
  FROM school_users
  WHERE user_id = auth.uid() AND active = true AND role = 'admin';

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  -- La cible doit appartenir à CETTE école.
  IF NOT EXISTS (
    SELECT 1 FROM school_users
     WHERE id = p_school_user_id AND school_id = v_school_id
  ) THEN
    RAISE EXCEPTION 'Compte introuvable';
  END IF;

  -- GLOBAL et périmètre sectoriel s'excluent : un compte global n'a pas de
  -- restriction, la garder serait ambigu à la relecture.
  UPDATE school_users
     SET scope_sections  = CASE WHEN coalesce(p_global, false) THEN '{}'::text[] ELSE coalesce(p_sections, '{}') END,
         scope_cycles    = CASE WHEN coalesce(p_global, false) THEN '{}'::text[] ELSE coalesce(p_cycles, '{}') END,
         scope_class_ids = CASE WHEN coalesce(p_global, false) THEN '{}'::uuid[] ELSE coalesce(p_class_ids, '{}') END,
         scope_global    = coalesce(p_global, false)
   WHERE id = p_school_user_id AND school_id = v_school_id;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_set_staff_scope(uuid, text[], text[], uuid[], boolean) TO authenticated;

COMMIT;
