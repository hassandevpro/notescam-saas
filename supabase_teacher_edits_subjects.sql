-- L'ENSEIGNANT PEUT CONFIGURER LES MATIÈRES DE SA CLASSE — tous les secteurs
-- ============================================================================
-- CE QUI MANQUAIT. L'écriture dans `subjects` était réservée à l'administration
-- (policy « subjects: écriture par admins de l'école », cf.
-- supabase_fix_subjects_delegation.sql) : un admin, ou un compte délégué portant
-- /app/classes. Un enseignant ne pouvait donc RIEN configurer, même sur sa propre
-- classe — y compris quand la classe n'avait aucune matière et que lui seul
-- savait lesquelles créer.
--
-- Relevé à BRIGHT CONTINENT : la classe « Nursery 1 » avait 12 élèves, 0 matière,
-- aucun titulaire. L'institutrice voyait un écran vide sans pouvoir y remédier.
--
-- CE QUE CECI OUVRE, et à qui exactement :
--   • le TITULAIRE d'une classe (classes.teacher_id) gère LES matières de cette
--     classe : créer, renommer, changer coef/barème, supprimer. C'est le sens du
--     titulariat — il répond de la classe entière, en maternelle comme en
--     Terminale.
--   • un enseignant de matière ne touche QUE SES propres lignes (subjects.
--     teacher_id = lui). Il ajuste le barème de son cours ; il ne peut pas
--     supprimer la matière d'un collègue dans la même classe.
--
-- INTERRUPTEUR D'ÉTABLISSEMENT, FERMÉ PAR DÉFAUT. `schools.teacher_edits_subjects`
-- naît à false : AUCUNE école ne change de comportement tant qu'elle ne l'a pas
-- activé. La plateforme est multi-établissements — on n'élargit pas les droits de
-- tout le monde par un ALTER. Même principe que `advanced_delegation`
-- (supabase_delegated_write_access.sql §2) : un interrupteur explicite, jamais une
-- déduction.
--
-- CE QUI N'EST PAS TOUCHÉ :
--   • la policy admin reste entière — ceci est une policy PERMISSIVE de plus,
--     donc un OU : rien n'est retiré à personne ;
--   • la policy RESTRICTIVE « secteur: cloisonnement » (supabase_sector_
--     isolation.sql) continue de s'appliquer PAR-DESSUS : un enseignant hors
--     secteur reste bloqué, l'interrupteur n'y change rien ;
--   • le référentiel national (mat_domaines, prim_competences, apc_matieres)
--     reste en lecture seule pour tous. Il est PARTAGÉ par toutes les écoles du
--     pays : une école n'a pas à renommer les domaines officiels des autres. Ce
--     qu'on ouvre ici, ce sont les matières PROPRES à la classe.
--
-- Additif, idempotent, réversible (cf. _rollback). À EXÉCUTER dans Supabase.
-- ============================================================================

-- ── 1. L'interrupteur d'établissement ───────────────────────────────────────
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS teacher_edits_subjects boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schools.teacher_edits_subjects IS
  'Quand true, le titulaire d''une classe gère les matières de sa classe, et un '
  'enseignant de matière ajuste ses propres lignes. false (défaut) = '
  'configuration réservée à l''administration.';

-- ── 2. Le prédicat ──────────────────────────────────────────────────────────
-- Trois conditions, dans cet ordre : l'école a ouvert le droit ; le compte est
-- un enseignant de cette école ; il est titulaire de la classe OU la ligne est la
-- sienne.
--
-- SECURITY DEFINER parce que la fonction lit `teachers` et `classes`, que
-- l'appelant ne voit pas forcément en entier. `search_path` figé : une fonction
-- SECURITY DEFINER sans search_path explicite est détournable.
CREATE OR REPLACE FUNCTION public.teacher_may_edit_subject(
  p_school uuid, p_class uuid, p_subject_teacher uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.schools sc
      JOIN public.teachers t
        ON t.school_id = sc.id
       AND t.auth_user_id = auth.uid()
     WHERE sc.id = p_school
       AND sc.teacher_edits_subjects = true
       AND (
            -- Titulaire : toute la classe lui répond.
            EXISTS (SELECT 1 FROM public.classes c
                     WHERE c.id = p_class
                       AND c.school_id = p_school
                       AND c.teacher_id = t.id)
            -- Sinon : seulement ses propres lignes.
         OR p_subject_teacher = t.id
       )
  );
$$;

REVOKE ALL    ON FUNCTION public.teacher_may_edit_subject(uuid, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.teacher_may_edit_subject(uuid, uuid, uuid) TO authenticated;

-- ── 3. La policy ────────────────────────────────────────────────────────────
-- PERMISSIVE (donc en OU avec celle de l'administration). `USING` contrôle la
-- ligne existante (UPDATE/DELETE), `WITH CHECK` la ligne proposée (INSERT/UPDATE) :
-- les deux sont nécessaires, sinon un enseignant pourrait réaffecter une matière
-- à un collègue en la faisant sortir de son propre périmètre.
DROP POLICY IF EXISTS "subjects: écriture par l'enseignant de la classe" ON public.subjects;
CREATE POLICY "subjects: écriture par l'enseignant de la classe"
  ON public.subjects
  FOR ALL
  TO authenticated
  USING      (public.teacher_may_edit_subject(school_id, class_id, teacher_id))
  WITH CHECK (public.teacher_may_edit_subject(school_id, class_id, teacher_id));

-- ── 4. Vérification — à lire après exécution ────────────────────────────────
DO $$
DECLARE v_col boolean; v_fn boolean; v_pol boolean; v_restr boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'schools'
                    AND column_name = 'teacher_edits_subjects') INTO v_col;
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'teacher_may_edit_subject') INTO v_fn;
  SELECT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'subjects'
                    AND policyname = 'subjects: écriture par l''enseignant de la classe') INTO v_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'subjects'
                    AND policyname = 'secteur: cloisonnement') INTO v_restr;

  IF NOT (v_col AND v_fn AND v_pol) THEN
    RAISE EXCEPTION 'Migration incomplète — colonne=% fonction=% policy=%', v_col, v_fn, v_pol;
  END IF;
  IF NOT v_restr THEN
    RAISE WARNING 'La policy RESTRICTIVE « secteur: cloisonnement » est absente de subjects : le cloisonnement par secteur ne s''applique plus.';
  END IF;
  RAISE NOTICE 'OK — interrupteur, prédicat et policy en place. Aucune école activée (défaut false).';
END $$;

-- Combien d'écoles ont ouvert le droit ? (0 attendu juste après la migration.)
SELECT count(*) FILTER (WHERE teacher_edits_subjects) AS ecoles_ouvertes,
       count(*)                                        AS ecoles_total
  FROM public.schools;
