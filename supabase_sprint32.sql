-- ─── Sprint 32 : Freemium plan gates ────────────────────────────────────────
-- Run in Supabase SQL Editor

-- 1. Colonne plan sur schools
ALTER TABLE public.schools
ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter'
  CHECK (plan IN ('starter', 'ecole', 'pro', 'reseau'));

-- 2. Les écoles déjà actives (license_status = 'active') passent en 'ecole'
--    Commenter cette ligne si tu veux laisser tout le monde sur starter
UPDATE public.schools
SET plan = 'ecole'
WHERE license_status = 'active' AND plan = 'starter';

-- 3. Fonction superadmin pour changer le plan d'une école
CREATE OR REPLACE FUNCTION public.update_school_plan(p_school_id uuid, p_plan text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_plan NOT IN ('starter','ecole','pro','reseau') THEN
    RAISE EXCEPTION 'Invalid plan';
  END IF;
  UPDATE public.schools SET plan = p_plan WHERE id = p_school_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_school_plan(uuid, text) TO authenticated;
