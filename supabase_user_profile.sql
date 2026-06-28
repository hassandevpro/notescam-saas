-- ============================================================================
-- PROFIL UTILISATEUR — comptes du personnel (admin / censeur / surveillant /
-- enseignant)
--
-- Ajoute les champs de profil au pivot `school_users` (le record par-compte que
-- TOUS les rôles partagent) et expose des RPC SECURITY DEFINER permettant à un
-- utilisateur de modifier UNIQUEMENT son propre profil. Indispensable car
-- supabase_security_hardening.sql révoque INSERT/UPDATE/DELETE direct sur
-- `school_users` : toute écriture doit donc passer par une fonction contrôlée.
--
-- 100 % additif et rétro-compatible : les comptes existants reçoivent simplement
-- des colonnes nulles (created_at = date de migration en repli). Aucune donnée
-- n'est modifiée.
--
-- À EXÉCUTER une fois dans l'éditeur SQL Supabase (idempotent).
-- ============================================================================

-- 1. Colonnes de profil ------------------------------------------------------
ALTER TABLE public.school_users
  ADD COLUMN IF NOT EXISTS phone         text,
  ADD COLUMN IF NOT EXISTS photo_url     text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now();

-- 2. RPC : mettre à jour SON propre profil (nom + téléphone) ------------------
-- Met aussi à jour la fiche `teachers` liée (le cas échéant) pour garder le nom
-- et le téléphone cohérents partout (cartes, personnel, bulletins).
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_full_name text,
  p_phone     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  UPDATE public.school_users
     SET full_name = COALESCE(NULLIF(TRIM(p_full_name), ''), full_name),
         phone     = NULLIF(TRIM(p_phone), '')
   WHERE user_id = v_uid AND active = true;

  -- Miroir vers la fiche enseignant (cohérence cartes/personnel).
  UPDATE public.teachers
     SET name  = COALESCE(NULLIF(TRIM(p_full_name), ''), name),
         phone = NULLIF(TRIM(p_phone), '')
   WHERE auth_user_id = v_uid;
END $$;

GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text) TO authenticated;

-- 3. RPC : définir / retirer SA propre photo ---------------------------------
-- Passer NULL (ou chaîne vide) retire la photo. Séparé de update_my_profile
-- pour ne JAMAIS effacer la photo par inadvertance lors d'une simple édition
-- du nom/téléphone.
CREATE OR REPLACE FUNCTION public.set_my_photo(
  p_photo_url text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_url text := NULLIF(TRIM(COALESCE(p_photo_url, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  UPDATE public.school_users
     SET photo_url = v_url
   WHERE user_id = v_uid AND active = true;

  UPDATE public.teachers
     SET photo_url = v_url
   WHERE auth_user_id = v_uid;
END $$;

GRANT EXECUTE ON FUNCTION public.set_my_photo(text) TO authenticated;

-- 4. RPC : horodater la dernière connexion -----------------------------------
-- Appelée par le client juste après une authentification réussie.
CREATE OR REPLACE FUNCTION public.touch_my_last_login()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.school_users
     SET last_login_at = now()
   WHERE user_id = auth.uid() AND active = true;
END $$;

GRANT EXECUTE ON FUNCTION public.touch_my_last_login() TO authenticated;
