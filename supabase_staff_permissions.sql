-- ============================================================
-- NotesCam — Permissions GRANULAIRES des comptes délégués
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- ============================================================
--
-- `school_users.permissions` = liste JSON des PAGES autorisées (chemins /app/…)
-- pour un compte censeur/surveillant. NULL = accès par rôle (comportement
-- historique inchangé). Permet de choisir précisément « ce que la personne peut
-- faire » à la création du compte, sans multiplier les rôles de base.

ALTER TABLE school_users ADD COLUMN IF NOT EXISTS permissions text;

-- RPC de création de compte personnel + permissions (rétro-compatible : le
-- paramètre p_permissions est optionnel).
CREATE OR REPLACE FUNCTION public.admin_create_staff_account(
  p_target_user_id uuid,
  p_full_name      text,
  p_role           text,
  p_permissions    text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school_id uuid;
BEGIN
  IF p_role NOT IN ('censeur', 'surveillant') THEN RAISE EXCEPTION 'Rôle invalide'; END IF;

  SELECT school_id INTO v_school_id FROM school_users
  WHERE user_id = auth.uid() AND active = true AND role = 'admin';
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  INSERT INTO school_users (school_id, user_id, role, full_name, active, permissions)
  VALUES (v_school_id, p_target_user_id, p_role, p_full_name, true, p_permissions)
  ON CONFLICT DO NOTHING;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_create_staff_account(uuid, text, text, text) TO authenticated;

-- Mise à jour des permissions d'un compte existant (admin de la même école).
CREATE OR REPLACE FUNCTION public.admin_set_staff_permissions(
  p_school_user_id uuid,
  p_permissions    text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM school_users
  WHERE user_id = auth.uid() AND active = true AND role = 'admin';
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  UPDATE school_users SET permissions = p_permissions
  WHERE id = p_school_user_id AND school_id = v_school_id AND role IN ('censeur', 'surveillant');
END $$;

GRANT EXECUTE ON FUNCTION public.admin_set_staff_permissions(uuid, text) TO authenticated;
