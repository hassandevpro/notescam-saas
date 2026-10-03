-- supabase_fix_subjects_delegation_rollback.sql
-- Annule supabase_fix_subjects_delegation.sql : l'écriture des matières
-- redevient réservée aux comptes `role = 'admin'` de l'école.
--
-- Conséquence assumée d'un retour en arrière : un compte délégué qui crée une
-- classe se verra de nouveau refuser toutes ses matières, et la classe restera
-- vide. Aucune donnée n'est touchée dans un sens comme dans l'autre.
--
-- Idempotent. À exécuter dans Supabase → SQL Editor.
-- ============================================================================

DROP POLICY IF EXISTS "subjects: écriture par admins de l'école" ON public.subjects;
CREATE POLICY "subjects: écriture par admins de l'école"
  ON public.subjects
  FOR ALL
  USING (
    school_id IN (
      SELECT school_users.school_id
      FROM public.school_users
      WHERE school_users.user_id = auth.uid()
        AND school_users.active = true
        AND school_users.role = 'admin'
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.subjects'::regclass
      AND polname = 'subjects: écriture par admins de l''école'
      AND pg_get_expr(polqual, polrelid) LIKE '%has_page_permission%'
  ) THEN
    RAISE EXCEPTION 'le rollback n''a pas retiré la clause de délégation';
  END IF;
  RAISE NOTICE 'subjects : écriture de nouveau réservée aux admins.';
END $$;
