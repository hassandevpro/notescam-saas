-- supabase_genius_role_permissions_rollback.sql
-- Retour arrière COMPLET de supabase_genius_role_permissions.sql.
--
-- ── LE RETOUR ARRIÈRE IMMÉDIAT TIENT EN UNE LIGNE ───────────────────────────
-- Tout le durcissement est gardé par `schools.strict_role_enforcement`. Baisser
-- ce drapeau suffit à revenir INSTANTANÉMENT au comportement d'avant : les
-- fonctions retombent toutes sur leur branche historique, et les policies
-- restrictives laissent alors tout passer. C'est la §1, et c'est le geste à
-- faire en premier si quoi que ce soit se comporte mal en production.
--
-- Les §2 et §3 ne servent qu'à effacer les objets eux-mêmes, ce qui n'est utile
-- que si l'on renonce définitivement à la fonctionnalité.
--
-- AUCUNE section de ce fichier ne supprime de donnée métier : ni élève, ni
-- versement, ni compte, ni mot de passe. La colonne `staff.sector` est
-- CONSERVÉE (l'effacer perdrait le rattachement déjà saisi) ; la §3, commentée,
-- permet de la retirer si on le souhaite vraiment.
-- ============================================================================

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1 — RETOUR ARRIÈRE IMMÉDIAT (effet instantané, rien n'est détruit)      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
BEGIN;

UPDATE public.schools
   SET strict_role_enforcement = false
 WHERE id = '6b68407b-3d2e-426b-81ff-c4e68e66120a';

COMMIT;

-- Contrôle : doit renvoyer 0.
-- select count(*) from schools where strict_role_enforcement = true;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2 — RETRAIT DES POLICIES AJOUTÉES                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- À n'exécuter que si l'on renonce à la fonctionnalité. Les 12 policies de la
-- Phase 2 sont RESTAURÉES à l'identique (§2b) : ce fichier ne doit jamais
-- laisser la base moins protégée qu'avant la Phase 3.
BEGIN;

-- 2a. Les tables de vie scolaire ajoutées par la Phase 3 (elles n'avaient
--     AUCUNE policy de secteur auparavant : on retire, sans rien restaurer).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance', 'late_arrivals', 'student_warnings', 'student_detentions',
    'disciplinary_incidents', 'disciplinary_actions', 'exit_permissions',
    'parent_meetings', 'student_fee_items', 'class_fee_grids',
    'teachers', 'staff'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "finance: écriture réservée" ON public.%I', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "finance: écriture réservée" ON public.fee_payments;
DROP POLICY IF EXISTS "finance: écriture réservée" ON public.student_fees;

-- 2b. RESTAURATION des deux policies de la Phase 2 dans leur forme d'origine
--     (prédicat `user_scope_allows_student`, sans le volet financier).
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.student_fees;
CREATE POLICY "secteur: cloisonnement" ON public.student_fees AS RESTRICTIVE FOR ALL TO public
  USING      (public.user_scope_allows_student(school_id, student_id))
  WITH CHECK (public.user_scope_allows_student(school_id, student_id));

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.fee_payments;
CREATE POLICY "secteur: cloisonnement" ON public.fee_payments AS RESTRICTIVE FOR ALL TO public
  USING      (public.user_scope_allows_student(school_id, student_id))
  WITH CHECK (public.user_scope_allows_student(school_id, student_id));

-- 2c. RESTAURATION de `is_school_cashier` dans son corps d'origine
--     (supabase_fee_integrity.sql:116) — sans la branche « stricte ».
CREATE OR REPLACE FUNCTION public.is_school_cashier(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_users
    WHERE user_id = (SELECT auth.uid())
      AND school_id = p_school_id
      AND active = true
      AND (role IN ('admin', 'censeur')
           OR permissions::text LIKE '%/app/fees%')
  );
$$;

COMMIT;

-- Contrôle : doit renvoyer 12 (les policies de la Phase 2, ni plus ni moins).
-- select count(*) from pg_policies
--  where schemaname='public' and policyname='secteur: cloisonnement';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3 — OPTIONNEL ET DESTRUCTIF — efface le paramétrage saisi                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Perd le rattachement sectoriel du personnel et les clés d'autorité posées dans
-- le catalogue. À n'exécuter que si l'on abandonne définitivement la Phase 3.
--
-- ALTER TABLE public.schools DROP COLUMN IF EXISTS strict_role_enforcement;
-- ALTER TABLE public.staff   DROP COLUMN IF EXISTS sector;
--
-- DROP FUNCTION IF EXISTS public.apply_strict_role_matrix(uuid);
-- DROP FUNCTION IF EXISTS public.grant_gov_perm(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.fee_scope_allows_class(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.fee_scope_allows_student(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.can_manage_staff(uuid, text);
-- DROP FUNCTION IF EXISTS public.user_scope_allows_staff(uuid, text);
-- DROP FUNCTION IF EXISTS public.user_scope_allows_teacher(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.is_finance_reader(uuid);
-- DROP FUNCTION IF EXISTS public.is_finance_officer(uuid);
-- DROP FUNCTION IF EXISTS public.teacher_sectors(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.user_sectors(uuid);
-- DROP FUNCTION IF EXISTS public.class_sector(uuid);
-- DROP FUNCTION IF EXISTS public.user_has_page(uuid, text);
-- DROP FUNCTION IF EXISTS public.user_has_gov_perm(uuid, text);
-- DROP FUNCTION IF EXISTS public.user_gov_perms(uuid);
-- DROP FUNCTION IF EXISTS public.is_school_admin(uuid);
-- DROP FUNCTION IF EXISTS public.school_strict_roles(uuid);
