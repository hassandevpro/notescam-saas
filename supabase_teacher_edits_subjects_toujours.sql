-- L'ENSEIGNANT CONFIGURE SA CLASSE — SANS INTERRUPTEUR
-- ============================================================================
-- SUITE DE supabase_teacher_edits_subjects.sql, qui conditionnait le droit à
-- `schools.teacher_edits_subjects`. Décision de l'éditeur : pas de réglage. Une
-- enseignante ne doit pas dépendre d'une case cochée par quelqu'un d'autre pour
-- nommer les matières de sa propre classe, et un administrateur ne doit pas avoir
-- à découvrir un interrupteur pour que son école fonctionne.
--
-- CE QUI CHANGE : le prédicat ne lit plus la colonne. Le droit s'applique
-- partout, immédiatement.
--
-- CE QUI NE CHANGE PAS — ET C'EST LÀ QUE TIENT LA SÉCURITÉ :
--   • le TITULAIRE ne touche QUE sa classe (`classes.teacher_id` = lui) ;
--   • l'ENSEIGNANT DE MATIÈRE ne touche QUE ses propres lignes
--     (`subjects.teacher_id` = lui) — il ne supprime pas celle d'un collègue ;
--   • la policy RESTRICTIVE « secteur: cloisonnement » s'applique PAR-DESSUS :
--     un compte hors secteur reste bloqué ;
--   • le référentiel national (mat_domaines, prim_competences, apc_matieres)
--     reste en lecture seule pour tous. Il est PARTAGÉ par les 44 écoles : une
--     école renomme ses domaines CHEZ ELLE, par sa ligne `subjects` qui porte
--     `mat_domaine_id`, jamais dans la table nationale.
--
-- Ce n'est donc pas « tout le monde peut tout » : c'est « chacun chez soi, sans
-- demander la permission ».
--
-- LA COLONNE `schools.teacher_edits_subjects` EST CONSERVÉE, mais devient INERTE.
-- La supprimer casserait les clients encore en cache qui la lisent (le réglage a
-- vécu quelques heures en production), et une colonne inutilisée ne nuit pas. Le
-- client ne l'interroge plus.
--
-- Idempotent (CREATE OR REPLACE). Réversible : rejouer
-- supabase_teacher_edits_subjects.sql restaure la version avec interrupteur.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.teacher_may_edit_subject(
  p_school uuid, p_class uuid, p_subject_teacher uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.teachers t
     WHERE t.school_id = p_school
       AND t.auth_user_id = auth.uid()
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

-- La policy posée par la migration précédente appelle déjà cette fonction : rien
-- à recréer. On la vérifie quand même — une policy absente rendrait la fonction
-- sans effet, et le silence serait trompeur.
DO $$
DECLARE v_pol boolean; v_admin boolean; v_restr boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='subjects'
                    AND policyname='subjects: écriture par l''enseignant de la classe') INTO v_pol;
  SELECT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='subjects'
                    AND policyname='subjects: écriture par admins de l''école') INTO v_admin;
  SELECT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='subjects'
                    AND policyname='secteur: cloisonnement') INTO v_restr;

  IF NOT v_pol THEN
    RAISE EXCEPTION 'La policy enseignant est absente — appliquez d''abord supabase_teacher_edits_subjects.sql.';
  END IF;
  IF NOT v_admin THEN
    RAISE WARNING 'La policy ADMIN a disparu de subjects.';
  END IF;
  IF NOT v_restr THEN
    RAISE WARNING 'Le cloisonnement par secteur est absent de subjects.';
  END IF;
  RAISE NOTICE 'OK — le droit s''applique partout, sans interrupteur. Perimetre inchange : sa classe / ses lignes.';
END $$;

COMMENT ON COLUMN public.schools.teacher_edits_subjects IS
  'INERTE depuis supabase_teacher_edits_subjects_toujours.sql : le droit ne '
  'dépend plus d''un réglage. Colonne conservée, plus lue.';

-- Contrôle : la fonction ne doit plus mentionner la colonne.
SELECT CASE WHEN pg_get_functiondef(p.oid) ILIKE '%teacher_edits_subjects%'
            THEN 'KO — le predicat lit encore la colonne'
            ELSE 'OK — predicat sans interrupteur' END AS etat
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'teacher_may_edit_subject';
