-- supabase_sector_isolation_rollback.sql
-- Retour arrière COMPLET de supabase_sector_isolation.sql.
--
-- Retire le cloisonnement : on supprime les 12 policies RESTRICTIVE. Les 44
-- policies permissives d'origine n'ayant jamais été touchées, l'accès revient
-- EXACTEMENT à l'état d'avant migration, immédiatement.
--
-- La colonne `scope_global` est CONSERVÉE par défaut (elle ne restreint rien
-- une fois les policies retirées, et la perdre effacerait le paramétrage déjà
-- saisi). La section 3, commentée, permet de l'effacer si vraiment souhaité —
-- c'est la seule opération destructive du fichier.
-- ============================================================================
BEGIN;

-- ── 1. Retrait du cloisonnement (effet immédiat) ────────────────────────────
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.classes;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.students;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.subjects;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.grades;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.student_absences;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.timetable_slots;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.student_class_assignments;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.apc_notes;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.prim_notes;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.mat_observations;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.student_fees;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.fee_payments;

COMMIT;

-- ── 2. Contrôle : doit renvoyer 0 ───────────────────────────────────────────
-- select count(*) from pg_policies
--  where schemaname='public' and policyname='secteur: cloisonnement';

-- ── 3. OPTIONNEL et DESTRUCTIF — efface le paramétrage de périmètre global.
--      À n'exécuter que si l'on renonce définitivement à la fonctionnalité.
-- ALTER TABLE public.school_users DROP COLUMN IF EXISTS scope_global;
-- DROP FUNCTION IF EXISTS public.user_scope_allows_student(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.user_scope_allows_class(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.user_scope_is_global(uuid);
