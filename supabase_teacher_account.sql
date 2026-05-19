-- ============================================================
-- NotesCam — RPC admin_create_teacher_account
-- Permet à l'admin de lier un compte auth existant à son école
-- ============================================================

-- 1. Corriger la contrainte de rôle
ALTER TABLE school_users DROP CONSTRAINT IF EXISTS school_users_role_check;
ALTER TABLE school_users ADD CONSTRAINT school_users_role_check
  CHECK (role IN ('admin', 'teacher'));


-- 2. RPC : l'admin lie un user_id à son école en tant qu'enseignant
CREATE OR REPLACE FUNCTION public.admin_create_teacher_account(
  p_target_user_id uuid,
  p_full_name      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id  uuid;
  v_teacher_id uuid;
BEGIN
  -- Vérifier que l'appelant est admin
  SELECT school_id INTO v_school_id
  FROM school_users
  WHERE user_id = auth.uid() AND active = true AND role = 'admin';

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  -- Vérifier que l'utilisateur cible existe
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- Créer school_users (ignorer si déjà lié)
  INSERT INTO school_users (school_id, user_id, role, full_name, active)
  VALUES (v_school_id, p_target_user_id, 'teacher', p_full_name, true)
  ON CONFLICT DO NOTHING;

  -- Lier au teachers record existant (par nom) ou en créer un nouveau
  SELECT id INTO v_teacher_id
  FROM teachers
  WHERE school_id = v_school_id
    AND lower(trim(name)) = lower(trim(p_full_name))
  LIMIT 1;

  IF v_teacher_id IS NOT NULL THEN
    UPDATE teachers SET auth_user_id = p_target_user_id WHERE id = v_teacher_id;
  ELSE
    INSERT INTO teachers (school_id, name, auth_user_id)
    VALUES (v_school_id, p_full_name, p_target_user_id);
  END IF;
END;
$$;
