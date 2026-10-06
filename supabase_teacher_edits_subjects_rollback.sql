-- ROLLBACK de supabase_teacher_edits_subjects.sql
-- ============================================================================
-- Referme le droit d'écriture des enseignants sur `subjects`. L'administration
-- garde le sien : la policy « subjects: écriture par admins de l'école » n'est
-- pas touchée ici, elle ne l'a jamais été.
--
-- La COLONNE `schools.teacher_edits_subjects` est conservée par défaut : la
-- supprimer perdrait le choix des écoles qui avaient activé l'option, et une
-- colonne inerte ne nuit pas. La policy retirée, elle ne commande plus rien.
-- Pour l'effacer malgré tout, décommentez le §3.
-- ============================================================================

-- ── 1. La policy ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "subjects: écriture par l'enseignant de la classe" ON public.subjects;

-- ── 2. Le prédicat ──────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.teacher_may_edit_subject(uuid, uuid, uuid);

-- ── 3. La colonne — volontairement COMMENTÉ (voir l'en-tête) ────────────────
-- ALTER TABLE public.schools DROP COLUMN IF EXISTS teacher_edits_subjects;

-- ── 4. Vérification ─────────────────────────────────────────────────────────
DO $$
DECLARE v_pol boolean; v_admin boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'subjects'
                    AND policyname = 'subjects: écriture par l''enseignant de la classe') INTO v_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'subjects'
                    AND policyname = 'subjects: écriture par admins de l''école') INTO v_admin;

  IF v_pol THEN RAISE EXCEPTION 'La policy enseignant est toujours là.'; END IF;
  IF NOT v_admin THEN
    RAISE EXCEPTION 'La policy ADMIN a disparu — plus personne ne peut écrire dans subjects. Rejouez supabase_fix_subjects_delegation.sql.';
  END IF;
  RAISE NOTICE 'OK — droit enseignant referme, droit administration intact.';
END $$;
