-- ============================================================
-- NotesCam — Sprint 25 : langue d'etablissement
-- Ajoute la colonne `language` sur schools
-- (francophone / anglophone / bilingue)
-- Met a jour le RPC signup_school_and_admin pour accepter p_language
-- A executer dans : Supabase SQL Editor
-- ============================================================

-- 1. Ajoute la colonne language sur schools (safe if already exists)
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS language TEXT
  DEFAULT 'francophone'
  CHECK (language IN ('francophone', 'anglophone', 'bilingue'));

-- 2. Supprimer l'ancienne surcharge a 7 parametres (cause le conflit d'ambiguite)
DROP FUNCTION IF EXISTS public.signup_school_and_admin(text, text, text, text, text, text, text);

-- 3. Recreer le RPC avec p_language (8 parametres, defaut = 'francophone')
CREATE OR REPLACE FUNCTION public.signup_school_and_admin(
  p_school_name    TEXT,
  p_school_type    TEXT,
  p_region         TEXT,
  p_director       TEXT,
  p_email          TEXT,
  p_academic_year  TEXT,
  p_full_name      TEXT,
  p_language       TEXT DEFAULT 'francophone'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id UUID;
  v_user_id   UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM school_users
    WHERE user_id = v_user_id AND active = TRUE
  ) THEN
    RAISE EXCEPTION 'already linked';
  END IF;

  INSERT INTO schools (name, type, region, director, email, current_year,
                       license_status, license_expires_at, language)
  VALUES (
    p_school_name, p_school_type, p_region, p_director, p_email, p_academic_year,
    'trial', NOW() + INTERVAL '30 days',
    COALESCE(p_language, 'francophone')
  )
  RETURNING id INTO v_school_id;

  INSERT INTO school_users (school_id, user_id, role, full_name, active)
  VALUES (v_school_id, v_user_id, 'admin', p_full_name, TRUE);
END;
$$;
