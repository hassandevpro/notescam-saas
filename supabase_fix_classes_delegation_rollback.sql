-- supabase_fix_classes_delegation_rollback.sql
-- RETOUR ARRIÈRE de supabase_fix_classes_delegation.sql.
-- Rétablit à l'identique les deux policies d'écriture de `classes` telles
-- qu'elles étaient avant le correctif : rôle de base `admin` uniquement.
-- Après exécution, un compte délégué ne peut plus écrire les classes et la
-- synchronisation échouera de nouveau pour lui.
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS "Admins write classes" ON public.classes;
CREATE POLICY "Admins write classes" ON public.classes FOR ALL TO public
  USING (school_id = public.user_school_id() AND public.user_role() = 'admin');

DROP POLICY IF EXISTS "classes: écriture par admins de l'école" ON public.classes;
CREATE POLICY "classes: écriture par admins de l'école" ON public.classes FOR ALL TO public
  USING (
    school_id IN (
      SELECT su.school_id FROM public.school_users su
       WHERE su.user_id = auth.uid() AND su.active = true AND su.role = 'admin'
    )
  );

COMMIT;
