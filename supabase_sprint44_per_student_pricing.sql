-- ============================================================
-- Sprint 44 — Tarification par élève (négociée par le SuperAdmin)
--
-- Le logiciel se vend « par élève » (ex. 1000 FCFA/élève). Le SuperAdmin
-- négocie et fixe le prix unitaire pour chaque établissement. La facture =
-- prix unitaire × nombre d'élèves (année courante).
--
-- À exécuter une fois dans Supabase (SQL Editor). 100 % additif.
-- ============================================================

-- 1. Prix par élève (FCFA), négocié par le SuperAdmin. 0 = non défini.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS price_per_student numeric NOT NULL DEFAULT 0;

-- 2. Recréer fetch_all_schools_superadmin avec price_per_student + nb_students.
--    (DROP obligatoire : le type de retour change.)
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
  price_per_student  numeric,
  created_at         timestamptz,
  nb_admins          bigint,
  nb_students        bigint
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
      s.license_status, s.license_expires_at, s.plan, s.price_per_student, s.created_at,
      COUNT(DISTINCT su.id) FILTER (WHERE su.role = 'admin' AND su.active = true),
      -- Élèves facturables = élèves inscrits dans une classe de l'année courante.
      COUNT(DISTINCT st.id) FILTER (WHERE cl.current_year = s.current_year)
    FROM schools s
    LEFT JOIN school_users su ON su.school_id = s.id
    LEFT JOIN students     st ON st.school_id = s.id
    LEFT JOIN classes      cl ON cl.id = st.class_id
    GROUP BY s.id
    ORDER BY s.created_at DESC;
END;
$$;

-- 3. RPC dédiée : fixer le prix par élève négocié (SuperAdmin uniquement).
CREATE OR REPLACE FUNCTION public.update_school_price_per_student(
  p_school_id uuid,
  p_price     numeric
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
  SET price_per_student = GREATEST(0, COALESCE(p_price, 0))
  WHERE id = p_school_id;
END;
$$;
