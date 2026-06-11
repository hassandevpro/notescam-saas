-- ============================================================
-- Correctif RLS — import de données historiques
--
-- Symptôme : « new row violates row-level security policy for table
-- "students" / "grades" » lors de l'import de masse (années antérieures),
-- alors que la création normale (année courante) fonctionne.
--
-- Cause : les politiques d'écriture de `students` et `grades` (créées dans le
-- dashboard) sont trop restrictives pour des lignes d'années passées.
--
-- Solution : politiques basées UNIQUEMENT sur le `school_id` de la ligne —
-- exactement le schéma déjà éprouvé pour student_fees / student_absences :
--   • students : lecture par tout membre actif ; écriture réservée aux rôles
--                 ADMIN et CENSEUR ;
--   • grades   : lecture + écriture par tout membre actif (les profs saisissent
--                les notes) — toujours limité à SA propre école.
--
-- 100 % idempotent. À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades   ENABLE ROW LEVEL SECURITY;

-- ── STUDENTS ────────────────────────────────────────────────
DROP POLICY IF EXISTS "students: lecture par membres"  ON public.students;
CREATE POLICY "students: lecture par membres"
  ON public.students FOR SELECT
  USING (school_id IN (
    SELECT school_id FROM school_users
    WHERE user_id = auth.uid() AND active = true
  ));

-- Écriture réservée aux rôles direction : admin + censeur.
DROP POLICY IF EXISTS "students: écriture par membres"  ON public.students;
DROP POLICY IF EXISTS "students: écriture par admins"   ON public.students;
DROP POLICY IF EXISTS "students: écriture par direction" ON public.students;
CREATE POLICY "students: écriture par direction"
  ON public.students FOR ALL
  USING (school_id IN (
    SELECT school_id FROM school_users
    WHERE user_id = auth.uid() AND active = true AND role IN ('admin', 'censeur')
  ))
  WITH CHECK (school_id IN (
    SELECT school_id FROM school_users
    WHERE user_id = auth.uid() AND active = true AND role IN ('admin', 'censeur')
  ));

-- ── GRADES ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "grades: lecture par membres"  ON public.grades;
CREATE POLICY "grades: lecture par membres"
  ON public.grades FOR SELECT
  USING (school_id IN (
    SELECT school_id FROM school_users
    WHERE user_id = auth.uid() AND active = true
  ));

DROP POLICY IF EXISTS "grades: écriture par membres" ON public.grades;
CREATE POLICY "grades: écriture par membres"
  ON public.grades FOR ALL
  USING (school_id IN (
    SELECT school_id FROM school_users
    WHERE user_id = auth.uid() AND active = true
  ))
  WITH CHECK (school_id IN (
    SELECT school_id FROM school_users
    WHERE user_id = auth.uid() AND active = true
  ));

-- ── (Optionnel) Inspecter les politiques restantes sur ces tables ──
-- Si d'ANCIENNES politiques restrictives subsistent (créées dans le dashboard
-- sous d'autres noms) et bloquent encore, listez-les puis supprimez-les :
--   SELECT policyname, cmd, qual, with_check
--     FROM pg_policies WHERE tablename IN ('students','grades');
--   -- DROP POLICY "<nom exact>" ON public.students;  -- etc.
-- ============================================================
