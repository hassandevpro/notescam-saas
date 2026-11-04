-- ============================================================================
-- MASQUER UNE COMPÉTENCE NATIONALE DU PRIMAIRE POUR UNE SEULE CLASSE
-- ============================================================================
-- Demande de l'école (2026-11-04) : « décocher 3B la masque pour toutes les classes de l'école —
-- pas toute l'école, juste la classe en cours ».
--
-- Le masquage du référentiel est par ÉCOLE (public.prim_competences_masques). Cette table porte le
-- masquage PAR CLASSE : (école, classe, compétence). Une compétence nationale masquée ici disparaît de
-- la saisie des notes, du bulletin, du PV et du rapport de CETTE classe, et d'aucune autre.
--
-- NATURE : un réglage d'AFFICHAGE propre à chaque édition, comme les masques de l'école — il ne voyage
-- pas dans la synchronisation (hors SYNCED_TABLES et hors listes des Edge Functions : AUCUNE fonction à
-- redéployer, aucune liste de synchro à modifier).
--
-- ADDITIVE ET IDEMPOTENTE : une table nouvelle, aucune donnée existante touchée. Rien n'est masqué tant
-- qu'une école ne décoche pas une compétence dans une classe.
--
-- RETOUR ARRIÈRE (sans perte pour le reste) :
--   DROP TABLE IF EXISTS public.prim_competences_classe_masquees;
-- Les compétences masquées par classe réapparaissent alors dans leurs classes.
--
-- ORDRE : appliquer ce fichier AVANT de mettre en ligne l'écran qui l'utilise. Tant qu'il n'est pas
-- appliqué, l'écran refuse de masquer (« la mise à jour du Cloud doit d'abord être appliquée ») au lieu de
-- masquer à l'aveugle.
-- ============================================================================

-- ── 1. Le prérequis
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'member_of_school') THEN
    RAISE EXCEPTION 'public.member_of_school absente — appliquez d''abord supabase_mat_domaines_par_ecole.sql.';
  END IF;
END $$;

-- ── 2. La table
CREATE TABLE IF NOT EXISTS public.prim_competences_classe_masquees (
  school_id     uuid NOT NULL REFERENCES public.schools(id)          ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES public.classes(id)          ON DELETE CASCADE,
  competence_id text NOT NULL REFERENCES public.prim_competences(id) ON DELETE CASCADE,
  masque_le     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, class_id, competence_id)
);

CREATE INDEX IF NOT EXISTS idx_prim_classe_masquees_school
  ON public.prim_competences_classe_masquees (school_id);

COMMENT ON TABLE public.prim_competences_classe_masquees IS
  'Compétences nationales du primaire masquées pour UNE classe (réglage d''affichage, non synchronisé). '
  'Le masquage de toute l''école est public.prim_competences_masques.';

-- ── 3. RLS — chaque école ne voit et n'écrit que les siennes (même forme que prim_competences_masques)
ALTER TABLE public.prim_competences_classe_masquees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prim classe masquees: les siennes" ON public.prim_competences_classe_masquees;
CREATE POLICY "prim classe masquees: les siennes"
  ON public.prim_competences_classe_masquees FOR ALL TO authenticated
  USING      (public.member_of_school(school_id))
  WITH CHECK (public.member_of_school(school_id));

-- ── 4. Vérification : la migration a-t-elle vraiment pris ?
DO $$
DECLARE v_tab boolean; v_rls boolean; v_pol boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='prim_competences_classe_masquees') INTO v_tab;
  SELECT COALESCE((SELECT relrowsecurity FROM pg_class
                    WHERE oid = 'public.prim_competences_classe_masquees'::regclass), false) INTO v_rls;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='prim_competences_classe_masquees'
                  AND policyname='prim classe masquees: les siennes') INTO v_pol;
  IF NOT (v_tab AND v_rls AND v_pol) THEN
    RAISE EXCEPTION 'Incomplet — table=% rls=% policy=%', v_tab, v_rls, v_pol;
  END IF;
  RAISE NOTICE 'prim_competences_classe_masquees : table, RLS et policy en place.';
END $$;
