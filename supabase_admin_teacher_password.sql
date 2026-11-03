-- admin_set_teacher_password : l'administrateur d'une école redéfinit le mot de
-- passe d'un ENSEIGNANT de son école (mot de passe perdu).
--
-- Additive et idempotente : nouvelle fonction, aucune existante modifiée.
-- admin_set_staff_password reste réservée à censeur/surveillant.
--
-- Garde-fous : appelant = admin actif ; l'enseignant doit appartenir à CETTE
-- école (teachers.school_id) ET avoir un compte (auth_user_id) lié à cette école
-- par school_users avec le rôle 'teacher' — on ne touche jamais au mot de passe
-- d'un compte qui serait aussi admin/censeur ou membre d'une autre école.
-- Renvoie l'e-mail de la cible (le serveur LAN en a besoin pour le miroir).
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_teacher_password(
  p_teacher_id    uuid,
  p_new_password  text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_school uuid;
  v_user   uuid;
  v_email  text;
BEGIN
  SELECT school_id INTO v_school
  FROM public.school_users
  WHERE user_id = auth.uid() AND role = 'admin' AND active = true
  LIMIT 1;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  SELECT t.auth_user_id INTO v_user
  FROM public.teachers t
  WHERE t.id = p_teacher_id AND t.school_id = v_school;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Compte introuvable'; END IF;

  -- Le compte doit être un enseignant de cette école, et rien d'autre ici.
  IF NOT EXISTS (SELECT 1 FROM public.school_users
                  WHERE user_id = v_user AND school_id = v_school AND role = 'teacher') THEN
    RAISE EXCEPTION 'Rôle non autorisé';
  END IF;
  IF EXISTS (SELECT 1 FROM public.school_users
              WHERE user_id = v_user AND role <> 'teacher') THEN
    RAISE EXCEPTION 'Rôle non autorisé';
  END IF;

  IF length(coalesce(p_new_password, '')) < 8 THEN
    RAISE EXCEPTION 'Mot de passe trop court (8 caractères min.)';
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   WHERE id = v_user
   RETURNING email INTO v_email;

  RETURN v_email;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_set_teacher_password(uuid, text) TO authenticated;

COMMIT;
