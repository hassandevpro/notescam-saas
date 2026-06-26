-- ============================================================================
-- ADMIN : redéfinir le mot de passe d'un compte de direction (censeur/surveillant)
-- ============================================================================
-- admin_set_staff_password : permet à l'administrateur d'une école de définir
-- un nouveau mot de passe pour un compte censeur/surveillant DE SON école.
-- SECURITY DEFINER + vérifications strictes (admin, même école, rôle direction).
-- Met à jour le hachage bcrypt utilisé par Supabase Auth (pgcrypto).
--
-- À EXÉCUTER dans l'éditeur SQL Supabase (idempotent).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_staff_password(
  p_school_user_id uuid,
  p_new_password   text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_school uuid;
  v_user   uuid;
  v_role   text;
BEGIN
  -- L'appelant doit être admin actif d'une école.
  SELECT school_id INTO v_school
  FROM public.school_users
  WHERE user_id = auth.uid() AND role = 'admin' AND active = true
  LIMIT 1;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  -- La cible doit appartenir à CETTE école et être un compte de direction.
  SELECT user_id, role INTO v_user, v_role
  FROM public.school_users
  WHERE id = p_school_user_id AND school_id = v_school;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Compte introuvable'; END IF;
  IF v_role NOT IN ('censeur', 'surveillant') THEN RAISE EXCEPTION 'Rôle non autorisé'; END IF;

  IF length(coalesce(p_new_password, '')) < 8 THEN
    RAISE EXCEPTION 'Mot de passe trop court (8 caractères min.)';
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   WHERE id = v_user;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_set_staff_password(uuid, text) TO authenticated;
