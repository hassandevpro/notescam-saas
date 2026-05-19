-- Sprint 29 : Super-Admin licence management
-- Executer dans Supabase SQL Editor

-- 1. Table des super-admins (allowlist par user_id)
CREATE TABLE IF NOT EXISTS public.superadmins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. RPC : lecture de tous les etablissements (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.fetch_all_schools_superadmin()
RETURNS TABLE (
  id               uuid,
  name             text,
  type             text,
  region           text,
  director         text,
  email            text,
  language         text,
  current_year     text,
  license_status   text,
  license_expires_at timestamptz,
  created_at       timestamptz,
  nb_admins        bigint
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
      s.license_status, s.license_expires_at, s.created_at,
      COUNT(su.id) FILTER (WHERE su.role = 'admin' AND su.active = true)
    FROM schools s
    LEFT JOIN school_users su ON su.school_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC;
END;
$$;

-- 3. RPC : mise a jour de la licence d'un etablissement
CREATE OR REPLACE FUNCTION public.update_school_license(
  p_school_id        uuid,
  p_status           text,
  p_expires_at       timestamptz
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
  SET license_status = p_status, license_expires_at = p_expires_at
  WHERE id = p_school_id;
END;
$$;
