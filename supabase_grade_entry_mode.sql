-- ============================================================================
-- MODE DE GESTION DES NOTES — « enseignant de matière » (Mode 1)
-- ============================================================================
-- Ajoute le réglage d'établissement `schools.grade_entry_mode` :
--   'principal' (défaut, historique) : l'enseignant titulaire saisit toutes les
--                matières de sa classe — comportement INCHANGÉ.
--   'subject'  : chaque enseignant ne saisit QUE les matières qui lui sont
--                affectées (subjects.teacher_id). Admin/censeur conservent l'accès
--                total. Tout le reste (calculs, bulletins, classements, conseils,
--                relevés…) reste identique.
--
-- À EXÉCUTER dans l'éditeur SQL Supabase (idempotent — rejouable sans risque).
-- ============================================================================

-- ── 1) Colonne de réglage ───────────────────────────────────────────────────
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS grade_entry_mode TEXT NOT NULL DEFAULT 'principal';

-- Garde-fou de valeurs (seulement deux modes pris en charge).
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_grade_entry_mode_chk;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_grade_entry_mode_chk
  CHECK (grade_entry_mode IN ('principal', 'subject'));

-- ── 2) RLS sur grades : lecture ouverte, écriture mode-aware ─────────────────
-- IMPORTANT : on NE restreint PAS la lecture (les bulletins/relevés d'un
-- enseignant doivent afficher TOUTES les matières). Seule l'ÉCRITURE est
-- scopée, et UNIQUEMENT en mode 'subject'. En mode 'principal', on reproduit
-- exactement la permissivité historique (tout membre actif de l'école écrit),
-- pour ne rien casser du Mode 2 existant.

ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

-- Supprime les anciennes politiques d'écriture « FOR ALL » (elles couvraient
-- aussi le SELECT et autorisaient toute écriture sans distinction de matière).
DROP POLICY IF EXISTS "grades: écriture par admins et enseignants" ON public.grades;
DROP POLICY IF EXISTS "grades: écriture par membres"              ON public.grades;
DROP POLICY IF EXISTS "grades: write staff"                       ON public.grades;
DROP POLICY IF EXISTS "grades: write own subjects"                ON public.grades;

-- Lecture : tout membre actif de l'école (inchangé). Recréée pour garantir sa
-- présence après le drop des politiques FOR ALL ci-dessus.
DROP POLICY IF EXISTS "grades: lecture par membres"          ON public.grades;
DROP POLICY IF EXISTS "grades: lecture par membres de l'école" ON public.grades;
CREATE POLICY "grades: lecture par membres"
  ON public.grades FOR SELECT
  USING (school_id IN (
    SELECT school_id FROM public.school_users
    WHERE user_id = auth.uid() AND active = true
  ));

-- Condition d'écriture réutilisée par INSERT / UPDATE / DELETE.
-- (Postgres ne permet pas de factoriser une expression de policy ; elle est
--  donc répétée à l'identique dans les trois politiques ci-dessous.)
--   EXISTS schools s WHERE s.id = grades.school_id AND (
--     -- principal : comportement historique (tout membre actif)
--     COALESCE(s.grade_entry_mode,'principal') = 'principal'
--       AND grades.school_id IN (members actifs)
--     OR
--     -- subject : admin/censeur (tout) OU enseignant de CETTE matière
--     s.grade_entry_mode = 'subject' AND ( staff OR own-subject )
--   )

DROP POLICY IF EXISTS "grades: insert scopé" ON public.grades;
CREATE POLICY "grades: insert scopé"
  ON public.grades FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.schools s WHERE s.id = grades.school_id AND (
      ( COALESCE(s.grade_entry_mode, 'principal') = 'principal'
        AND grades.school_id IN (
          SELECT school_id FROM public.school_users
          WHERE user_id = auth.uid() AND active = true) )
      OR
      ( s.grade_entry_mode = 'subject' AND (
          grades.school_id IN (
            SELECT school_id FROM public.school_users
            WHERE user_id = auth.uid() AND active = true
              AND role IN ('admin', 'censeur'))
          OR EXISTS (
            SELECT 1 FROM public.subjects sub
            JOIN public.teachers t ON t.id = sub.teacher_id
            WHERE sub.id = grades.subject_id
              AND sub.class_id = grades.class_id
              AND t.auth_user_id = auth.uid()) ) )
    )
  ));

DROP POLICY IF EXISTS "grades: update scopé" ON public.grades;
CREATE POLICY "grades: update scopé"
  ON public.grades FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.schools s WHERE s.id = grades.school_id AND (
      ( COALESCE(s.grade_entry_mode, 'principal') = 'principal'
        AND grades.school_id IN (
          SELECT school_id FROM public.school_users
          WHERE user_id = auth.uid() AND active = true) )
      OR
      ( s.grade_entry_mode = 'subject' AND (
          grades.school_id IN (
            SELECT school_id FROM public.school_users
            WHERE user_id = auth.uid() AND active = true
              AND role IN ('admin', 'censeur'))
          OR EXISTS (
            SELECT 1 FROM public.subjects sub
            JOIN public.teachers t ON t.id = sub.teacher_id
            WHERE sub.id = grades.subject_id
              AND sub.class_id = grades.class_id
              AND t.auth_user_id = auth.uid()) ) )
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.schools s WHERE s.id = grades.school_id AND (
      ( COALESCE(s.grade_entry_mode, 'principal') = 'principal'
        AND grades.school_id IN (
          SELECT school_id FROM public.school_users
          WHERE user_id = auth.uid() AND active = true) )
      OR
      ( s.grade_entry_mode = 'subject' AND (
          grades.school_id IN (
            SELECT school_id FROM public.school_users
            WHERE user_id = auth.uid() AND active = true
              AND role IN ('admin', 'censeur'))
          OR EXISTS (
            SELECT 1 FROM public.subjects sub
            JOIN public.teachers t ON t.id = sub.teacher_id
            WHERE sub.id = grades.subject_id
              AND sub.class_id = grades.class_id
              AND t.auth_user_id = auth.uid()) ) )
    )
  ));

DROP POLICY IF EXISTS "grades: delete scopé" ON public.grades;
CREATE POLICY "grades: delete scopé"
  ON public.grades FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.schools s WHERE s.id = grades.school_id AND (
      ( COALESCE(s.grade_entry_mode, 'principal') = 'principal'
        AND grades.school_id IN (
          SELECT school_id FROM public.school_users
          WHERE user_id = auth.uid() AND active = true) )
      OR
      ( s.grade_entry_mode = 'subject' AND (
          grades.school_id IN (
            SELECT school_id FROM public.school_users
            WHERE user_id = auth.uid() AND active = true
              AND role IN ('admin', 'censeur'))
          OR EXISTS (
            SELECT 1 FROM public.subjects sub
            JOIN public.teachers t ON t.id = sub.teacher_id
            WHERE sub.id = grades.subject_id
              AND sub.class_id = grades.class_id
              AND t.auth_user_id = auth.uid()) ) )
    )
  ));

-- ============================================================================
-- FIN — après exécution, basculez le mode dans Paramètres → Établissement.
-- ============================================================================
