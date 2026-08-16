-- ============================================================
-- NotesCam SaaS — Périmètre de responsabilité des ADMINISTRATEURS
-- À coller dans : Supabase → SQL Editor → New query → Run
--
-- Contexte
-- --------
-- Dans un COMPLEXE SCOLAIRE, le directeur du fondamental (MINEDUB : maternelle +
-- primaire) et le proviseur du secondaire (MINESEC : collège + lycée) ne pilotent
-- pas la même partie de l'établissement. Chacun règle SA part du calendrier
-- scolaire (dates d'examen, limites de saisie, conseils de classe).
--
-- Le périmètre existe déjà (`school_users.scope_sections / scope_cycles /
-- scope_class_ids`, migration supabase_vie_scolaire.sql) mais n'était attribuable
-- qu'aux rôles 'censeur' et 'surveillant'. Cette migration l'ouvre à 'admin'.
--
-- Deux corrections, additives et idempotentes :
--   1. admin_set_staff_scope accepte désormais une cible 'admin'.
--   2. admin_list_staff renvoie de nouveau les colonnes de périmètre. Elles
--      avaient disparu de son type de retour lors de l'ajout des permissions
--      (supabase_staff_permissions.sql) : l'éditeur de périmètre se rouvrait donc
--      toujours vide, et l'enregistrer effaçait le périmètre existant.
--
-- Sûreté — aucun risque de verrouillage :
--   • l'autorisation de admin_set_staff_scope ne dépend QUE du rôle de l'appelant
--     (admin actif de l'école), jamais de son périmètre : un administrateur
--     restreint peut toujours se redonner un périmètre global ;
--   • côté application, le périmètre ne FILTRE les données que pour un
--     surveillant (cf. src/store/schoolStore.js). Pour un administrateur il
--     n'attribue qu'une responsabilité de configuration.
-- ============================================================


-- ============================================================
-- 1. admin_set_staff_scope — cibles 'admin', 'censeur', 'surveillant'
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_staff_scope(
  p_school_user_id uuid,
  p_sections       text[],
  p_cycles         text[],
  p_class_ids      uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id
  FROM school_users
  WHERE user_id = auth.uid() AND active = true AND role = 'admin';

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  UPDATE school_users
  SET scope_sections  = p_sections,
      scope_cycles    = p_cycles,
      scope_class_ids = p_class_ids
  WHERE id = p_school_user_id
    AND school_id = v_school_id
    AND role IN ('admin', 'censeur', 'surveillant');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_staff_scope(uuid, text[], text[], uuid[]) TO authenticated;


-- ============================================================
-- 2. admin_list_staff — rôle + permissions + PÉRIMÈTRE
-- ============================================================
-- Le type de retour change (3 colonnes ajoutées) : CREATE OR REPLACE ne suffit
-- pas, il faut supprimer la fonction d'abord.
DROP FUNCTION IF EXISTS public.admin_list_staff(text);

CREATE OR REPLACE FUNCTION public.admin_list_staff(p_role text)
RETURNS TABLE (
  id uuid, user_id uuid, full_name text, active boolean, role text, permissions text,
  scope_sections text[], scope_cycles text[], scope_class_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  -- `su.` qualifie chaque colonne : RETURNS TABLE déclare des variables de sortie
  -- homonymes, un nom nu serait ambigu (42702).
  SELECT su.school_id INTO v_school_id
  FROM school_users su
  WHERE su.user_id = auth.uid() AND su.active = true AND su.role = 'admin';

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  RETURN QUERY
    SELECT su.id, su.user_id, su.full_name, su.active, su.role, su.permissions,
           su.scope_sections, su.scope_cycles, su.scope_class_ids
    FROM school_users su
    WHERE su.school_id = v_school_id AND su.role = p_role
    ORDER BY su.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_staff(text) TO authenticated;


-- ============================================================
-- FIN
-- ============================================================
