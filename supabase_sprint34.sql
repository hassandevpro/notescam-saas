-- ============================================================
-- Sprint 34 — Migration vers système freemium
-- Starter = gratuit à vie, plus d'essai
-- Exécuter dans : Supabase → SQL Editor → New query → Run
-- ============================================================

-- 1. S'assurer que la colonne plan existe (idempotent)
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter';

-- 2. Supprimer l'éventuelle contrainte CHECK sur license_status
--    (elle bloquait les valeurs hors trial/active/expired)
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_license_status_check;

-- 3. Migrer les écoles en essai → active + starter
UPDATE public.schools
SET license_status    = 'active',
    plan              = COALESCE(NULLIF(plan, ''), 'starter'),
    license_expires_at = NULL
WHERE license_status = 'trial';

-- 4. Migrer les écoles expirées → blocked
UPDATE public.schools
SET license_status    = 'blocked',
    license_expires_at = NULL
WHERE license_status = 'expired';

-- 5. Mettre à jour la valeur par défaut de license_status
ALTER TABLE public.schools ALTER COLUMN license_status SET DEFAULT 'active';

-- 6. Mettre à jour signup_school_and_admin — plus de trial, starter par défaut
CREATE OR REPLACE FUNCTION public.signup_school_and_admin(
  p_school_name    text,
  p_school_type    text,
  p_region         text,
  p_director       text,
  p_email          text,
  p_academic_year  text,
  p_full_name      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_user_id   uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM school_users
    WHERE user_id = v_user_id AND active = true
  ) THEN
    RAISE EXCEPTION 'already linked';
  END IF;

  INSERT INTO schools (name, type, region, director, email, current_year,
                       license_status, plan, license_expires_at)
  VALUES (
    p_school_name, p_school_type, p_region, p_director, p_email, p_academic_year,
    'active', 'starter', NULL
  )
  RETURNING id INTO v_school_id;

  INSERT INTO school_users (school_id, user_id, role, full_name, active)
  VALUES (v_school_id, v_user_id, 'admin', p_full_name, true);
END;
$$;

-- 7. Recréer fetch_all_schools_superadmin avec colonne plan
--    (DROP obligatoire car le type de retour change)
DROP FUNCTION IF EXISTS public.fetch_all_schools_superadmin();
CREATE FUNCTION public.fetch_all_schools_superadmin()
RETURNS TABLE (
  id                 uuid,
  name               text,
  type               text,
  region             text,
  director           text,
  email              text,
  language           text,
  current_year       text,
  license_status     text,
  license_expires_at timestamptz,
  plan               text,
  created_at         timestamptz,
  nb_admins          bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM superadmins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT
      s.id, s.name, s.type, s.region, s.director, s.email,
      s.language, s.current_year,
      s.license_status, s.license_expires_at, s.plan, s.created_at,
      COUNT(su.id) FILTER (WHERE su.role = 'admin' AND su.active = true)
    FROM schools s
    LEFT JOIN school_users su ON su.school_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC;
END;
$$;

-- 8. Mettre à jour update_school_license avec paramètre p_plan
CREATE OR REPLACE FUNCTION public.update_school_license(
  p_school_id  uuid,
  p_status     text,
  p_expires_at timestamptz DEFAULT NULL,
  p_plan       text        DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM superadmins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE schools
  SET license_status     = p_status,
      license_expires_at = p_expires_at,
      plan               = COALESCE(p_plan, plan)
  WHERE id = p_school_id;
END;
$$;
