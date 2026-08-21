-- ============================================================
-- NotesCam — DÉLÉGATION AVANCÉE, activée école par école
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_staff_permissions.sql (colonne school_users.permissions).
-- ============================================================
--
-- POURQUOI. Un compte délégué (censeur/surveillant porteur de `permissions`)
-- reçoit des PAGES : c'est le modèle de l'app, où la liste de pages prime sur le
-- rôle de base (config/capabilities.js, ProtectedRoute). Mais les politiques RLS
-- historiques, elles, ne connaissent que le RÔLE : un surveillant à qui l'admin
-- confie « Élèves » voyait le formulaire d'inscription… et se faisait refuser
-- l'écriture par Postgres. La page devenait une vitrine.
--
-- PORTÉE. Ce comportement ne convient pas à tous les établissements : dans la
-- plupart, l'inscription et la gestion du corps enseignant doivent rester à la
-- direction. Il est donc placé derrière un interrupteur PAR ÉCOLE,
-- `schools.advanced_delegation`, à FALSE par défaut — aucune école existante ne
-- change de comportement tant que son administrateur ne l'active pas.
--
-- Ce que l'interrupteur ouvre, une fois activé :
--   • écriture des élèves et des enseignants pour un compte porteur de la page ;
--   • création des accès de connexion enseignants par ce même compte ;
--   • journal d'audit visible par tous les rôles (front) ;
--   • périmètre (sections/cycles/classes) appliqué aussi aux comptes censeur,
--     et plus seulement surveillant (front).

-- ── 1. L'interrupteur ────────────────────────────────────────────────────────
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS advanced_delegation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schools.advanced_delegation IS
  'Délégation avancée : les pages confiées à un compte délégué ouvrent l''écriture '
  '(élèves, enseignants), le journal d''audit est visible par tous les rôles et le '
  'périmètre s''applique aussi aux censeurs. FALSE = comportement historique.';

-- ── 2. Le compte porte-t-il explicitement cette page, dans une école qui a
--       activé la délégation avancée ? ──────────────────────────────────────
-- SECURITY DEFINER : la fonction doit lire school_users sans être bloquée par la
-- RLS de cette table. STABLE : évaluable une fois par requête.
CREATE OR REPLACE FUNCTION public.has_page_permission(p_school uuid, p_path text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_perms text;
BEGIN
  -- Interrupteur école : fermé par défaut, donc aucun élargissement implicite.
  IF NOT EXISTS (
    SELECT 1 FROM public.schools s
     WHERE s.id = p_school AND s.advanced_delegation = true
  ) THEN
    RETURN false;
  END IF;

  SELECT su.permissions INTO v_perms
    FROM public.school_users su
   WHERE su.user_id = auth.uid() AND su.active = true AND su.school_id = p_school
   LIMIT 1;

  IF v_perms IS NULL THEN RETURN false; END IF;   -- compte non délégué → par rôle

  -- `permissions` est du TEXTE contenant un tableau JSON. Un contenu illisible ne
  -- doit jamais faire échouer une requête métier : on refuse, simplement.
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_perms::jsonb) AS x WHERE x = p_path
    );
  EXCEPTION WHEN others THEN RETURN false;
  END;
END $$;

GRANT EXECUTE ON FUNCTION public.has_page_permission(uuid, text) TO authenticated;

-- ── 3. Élèves : inscription/modification par capacité ────────────────────────
-- Politiques AJOUTÉES (permissives, donc en OU) : rien n'est retiré aux rôles.
DROP POLICY IF EXISTS "students: écriture par capacité déléguée" ON public.students;
CREATE POLICY "students: écriture par capacité déléguée"
  ON public.students FOR ALL
  USING      (public.has_page_permission(school_id, '/app/students'))
  WITH CHECK (public.has_page_permission(school_id, '/app/students'));

-- ── 4. Enseignants : gestion du corps enseignant par capacité ────────────────
DROP POLICY IF EXISTS "teachers: écriture par capacité déléguée" ON public.teachers;
CREATE POLICY "teachers: écriture par capacité déléguée"
  ON public.teachers FOR ALL
  USING      (public.has_page_permission(school_id, '/app/teachers'))
  WITH CHECK (public.has_page_permission(school_id, '/app/teachers'));

-- ── 5. Création du compte de connexion d'un enseignant ───────────────────────
-- Même logique pour la RPC : l'admin, OU le délégué porteur de « Enseignants »
-- dans une école où la délégation avancée est active. Corps inchangé par ailleurs.
CREATE OR REPLACE FUNCTION public.admin_create_teacher_account(
  p_target_user_id uuid,
  p_full_name      text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id  uuid;
  v_teacher_id uuid;
BEGIN
  SELECT school_id INTO v_school_id
    FROM school_users
   WHERE user_id = auth.uid() AND active = true
     AND (role = 'admin' OR public.has_page_permission(school_id, '/app/teachers'))
   LIMIT 1;

  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  INSERT INTO school_users (school_id, user_id, role, full_name, active)
  VALUES (v_school_id, p_target_user_id, 'teacher', p_full_name, true)
  ON CONFLICT DO NOTHING;

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
END $$;

GRANT EXECUTE ON FUNCTION public.admin_create_teacher_account(uuid, text) TO authenticated;
