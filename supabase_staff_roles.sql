-- ============================================================
-- NotesCam — Personnel de direction : rôles « censeur » & « surveillant »
--   censeur     (Jefe de Estudios)    : supervision pédagogique + surveillance + frais
--   surveillant (Jefe de Disciplina)  : discipline, assiduité (absences), élèves
-- Aucun des deux n'accède aux paramètres de l'école, à l'année scolaire
-- ni à la création d'autres comptes (réservés à l'admin / proviseur).
-- ============================================================

-- 1. Autoriser les nouveaux rôles sur school_users
ALTER TABLE school_users DROP CONSTRAINT IF EXISTS school_users_role_check;
ALTER TABLE school_users ADD CONSTRAINT school_users_role_check
  CHECK (role IN ('admin', 'teacher', 'censeur', 'surveillant'));

-- Nettoyage d'éventuelles fonctions censeur-spécifiques (remplacées par génériques)
DROP FUNCTION IF EXISTS public.admin_create_censeur_account(uuid, text);
DROP FUNCTION IF EXISTS public.admin_list_censeurs();
DROP FUNCTION IF EXISTS public.admin_set_censeur_active(uuid, boolean);


-- 2. RPC générique : l'admin crée un compte personnel (censeur | surveillant)
CREATE OR REPLACE FUNCTION public.admin_create_staff_account(
  p_target_user_id uuid,
  p_full_name      text,
  p_role           text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  IF p_role NOT IN ('censeur', 'surveillant') THEN
    RAISE EXCEPTION 'Rôle invalide';
  END IF;

  SELECT school_id INTO v_school_id
  FROM school_users
  WHERE user_id = auth.uid() AND active = true AND role = 'admin';

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  INSERT INTO school_users (school_id, user_id, role, full_name, active)
  VALUES (v_school_id, p_target_user_id, p_role, p_full_name, true)
  ON CONFLICT DO NOTHING;
END;
$$;


-- 3. RPC : lister le personnel d'un rôle donné pour l'école de l'appelant
CREATE OR REPLACE FUNCTION public.admin_list_staff(p_role text)
RETURNS TABLE (id uuid, user_id uuid, full_name text, active boolean)
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

  RETURN QUERY
    SELECT su.id, su.user_id, su.full_name, su.active
    FROM school_users su
    WHERE su.school_id = v_school_id AND su.role = p_role
    ORDER BY su.full_name;
END;
$$;


-- 4. RPC : activer / désactiver un compte personnel (censeur | surveillant)
CREATE OR REPLACE FUNCTION public.admin_set_staff_active(
  p_school_user_id uuid,
  p_active         boolean
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
  SET active = p_active
  WHERE id = p_school_user_id
    AND school_id = v_school_id
    AND role IN ('censeur', 'surveillant');
END;
$$;


-- 5. Droits d'exécution
GRANT EXECUTE ON FUNCTION public.admin_create_staff_account(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_staff(text)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_staff_active(uuid, boolean)        TO authenticated;
