-- ============================================================
-- NotesCam — ÉDITEUR du catalogue de rôles (Phase 2)
-- À coller dans : Supabase → SQL Editor → New query → Run
-- Idempotent. Requiert supabase_governance_catalog.sql (table governance_roles).
-- ============================================================
--
-- RPC d'écriture du catalogue (admin uniquement) : créer / modifier / supprimer
-- un rôle. Le `code` est IMMUABLE après création (protège les références du barème
-- de validation). Les rôles système (is_system) ne sont pas supprimables (mais
-- restent modifiables et désactivables).

CREATE OR REPLACE FUNCTION public.admin_upsert_governance_role(
  p_id uuid, p_code text, p_name text, p_description text, p_rank integer,
  p_scope text, p_sector text, p_permissions jsonb, p_pages jsonb,
  p_dashboards jsonb, p_workflows jsonb, p_active boolean
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_school_id uuid; v_id uuid; v_existing governance_roles%ROWTYPE;
BEGIN
  SELECT school_id INTO v_school_id FROM school_users
   WHERE user_id = auth.uid() AND active = true AND role = 'admin';
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  IF p_code IS NULL OR btrim(p_code) = '' THEN RAISE EXCEPTION 'Code requis'; END IF;
  IF p_scope NOT IN ('complex','sector') THEN RAISE EXCEPTION 'Portée invalide'; END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM governance_roles WHERE id = p_id AND school_id = v_school_id;
    IF v_existing.id IS NULL THEN RAISE EXCEPTION 'Rôle introuvable'; END IF;
    -- Mise à jour : le code reste celui d'origine (immuable).
    UPDATE governance_roles SET
      name = p_name, description = p_description, rank = COALESCE(p_rank,0),
      scope = p_scope, sector = p_sector,
      permissions = COALESCE(p_permissions,'[]'::jsonb), pages = COALESCE(p_pages,'[]'::jsonb),
      dashboards = COALESCE(p_dashboards,'[]'::jsonb), workflows = COALESCE(p_workflows,'[]'::jsonb),
      active = COALESCE(p_active,true), updated_at = now()
    WHERE id = p_id AND school_id = v_school_id;
    RETURN p_id;
  END IF;

  -- Création : code unique par école.
  IF EXISTS (SELECT 1 FROM governance_roles WHERE school_id = v_school_id AND code = p_code) THEN
    RAISE EXCEPTION 'Un rôle avec ce code existe déjà : %', p_code;
  END IF;
  INSERT INTO governance_roles (school_id, code, name, description, rank, scope, sector,
    permissions, pages, dashboards, workflows, active, is_system)
  VALUES (v_school_id, p_code, p_name, p_description, COALESCE(p_rank,0), p_scope, p_sector,
    COALESCE(p_permissions,'[]'::jsonb), COALESCE(p_pages,'[]'::jsonb),
    COALESCE(p_dashboards,'[]'::jsonb), COALESCE(p_workflows,'[]'::jsonb),
    COALESCE(p_active,true), false)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_governance_role(p_id uuid)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_school_id uuid; v_row governance_roles%ROWTYPE;
BEGIN
  SELECT school_id INTO v_school_id FROM school_users
   WHERE user_id = auth.uid() AND active = true AND role = 'admin';
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  SELECT * INTO v_row FROM governance_roles WHERE id = p_id AND school_id = v_school_id;
  IF v_row.id IS NULL THEN RETURN; END IF;
  IF v_row.is_system THEN
    RAISE EXCEPTION 'Rôle système : désactivez-le au lieu de le supprimer';
  END IF;
  DELETE FROM governance_roles WHERE id = p_id AND school_id = v_school_id;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_governance_role(uuid, text, text, text, integer, text, text, jsonb, jsonb, jsonb, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_governance_role(uuid) TO authenticated;
