-- L'ÉCOLE MAÎTRISE SES COMPÉTENCES PRIMAIRES (MINEDUB) — ajouter, masquer, renommer
-- ============================================================================
-- Troisième et dernier référentiel traité, après la maternelle
-- (supabase_mat_domaines_par_ecole.sql) et le premier cycle
-- (supabase_apc_competences_par_ecole.sql). Même constat, même remède.
--
-- « Compétences nationales MINEDUB — chargées automatiquement » : les 11
-- compétences (1A…6B) vivent dans UNE table globale, partagée par les 44 écoles,
-- et `prim_notes.competence_id` porte une clé étrangère vers elle. Une école ne
-- peut donc ni les modifier sans toucher les autres, ni tenir les siennes
-- ailleurs.
--
-- La table devient PROPRIÉTAIRE :
--   • school_id NULL        → national. Lu par tous, écrit par personne.
--   • school_id = une école → à elle seule : lu, renommé, supprimé par elle.
--
-- `prim_competences.id` est un slug TEXTE ('1a', '2b'…), clé primaire partagée :
-- une compétence maison prend un id préfixé par l'école (cf. le client), jamais
-- en collision avec un slug national ni avec celui d'un autre établissement.
--
-- `prim_niveau_competences` (exceptions par niveau) et `prim_criteres` (Oral,
-- Écrit, Savoir-être) ne sont PAS ouverts ici : les critères structurent le
-- barème officiel et le calcul de la cote. Les rendre modifiables demanderait de
-- revoir primEngine, pas seulement une policy — à traiter à froid si le besoin
-- se confirme.
--
-- Additif, idempotent, réversible (cf. _rollback). À EXÉCUTER dans Supabase.
-- ============================================================================

-- ── 1. La propriété ─────────────────────────────────────────────────────────
ALTER TABLE public.prim_competences
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.prim_competences.school_id IS
  'NULL = compétence NATIONALE (lecture pour tous, écriture service role). '
  'Renseigné = compétence propre à cette école, qu''elle seule voit et modifie.';

CREATE INDEX IF NOT EXISTS prim_competences_school ON public.prim_competences(school_id);

-- ── 2. Les compétences masquées par une école ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.prim_competences_masques (
  school_id     uuid NOT NULL REFERENCES public.schools(id)           ON DELETE CASCADE,
  competence_id text NOT NULL REFERENCES public.prim_competences(id)  ON DELETE CASCADE,
  masque_le     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, competence_id)
);

-- ── 3. RLS — prim_competences ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'member_of_school') THEN
    RAISE EXCEPTION 'public.member_of_school absente — appliquez d''abord supabase_mat_domaines_par_ecole.sql.';
  END IF;
END $$;

ALTER TABLE public.prim_competences ENABLE ROW LEVEL SECURITY;

-- Remplace la lecture ouverte : sinon chaque école verrait les compétences
-- maison de toutes les autres.
DROP POLICY IF EXISTS "prim ref read" ON public.prim_competences;
DROP POLICY IF EXISTS "prim competences: lecture national + le sien" ON public.prim_competences;
CREATE POLICY "prim competences: lecture national + le sien"
  ON public.prim_competences FOR SELECT TO authenticated
  USING (school_id IS NULL OR public.member_of_school(school_id));

DROP POLICY IF EXISTS "prim competences: ecriture des siennes" ON public.prim_competences;
CREATE POLICY "prim competences: ecriture des siennes"
  ON public.prim_competences FOR ALL TO authenticated
  USING      (school_id IS NOT NULL AND public.member_of_school(school_id))
  WITH CHECK (school_id IS NOT NULL AND public.member_of_school(school_id));

-- ── 4. RLS — prim_competences_masques ───────────────────────────────────────
ALTER TABLE public.prim_competences_masques ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prim masques: les siens" ON public.prim_competences_masques;
CREATE POLICY "prim masques: les siens"
  ON public.prim_competences_masques FOR ALL TO authenticated
  USING      (public.member_of_school(school_id))
  WITH CHECK (public.member_of_school(school_id));

-- ── 5. Vérification ─────────────────────────────────────────────────────────
DO $$
DECLARE v_col boolean; v_tab boolean; v_read boolean; v_write boolean; v_old boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='prim_competences'
                    AND column_name='school_id') INTO v_col;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='prim_competences_masques') INTO v_tab;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='prim_competences'
                  AND policyname='prim competences: lecture national + le sien') INTO v_read;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='prim_competences'
                  AND policyname='prim competences: ecriture des siennes') INTO v_write;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='prim_competences' AND policyname='prim ref read') INTO v_old;

  IF NOT (v_col AND v_tab AND v_read AND v_write) THEN
    RAISE EXCEPTION 'Incomplet — col=% tab=% lec=% ecr=%', v_col, v_tab, v_read, v_write;
  END IF;
  IF v_old THEN
    RAISE WARNING 'L''ancienne policy « prim ref read » survit sur prim_competences.';
  END IF;
  RAISE NOTICE 'OK — chaque ecole maitrise ses competences primaires, le national reste intact.';
END $$;

-- Contrôle : le national est intact, personne n'a encore rien ajouté.
SELECT count(*) FILTER (WHERE school_id IS NULL)     AS competences_nationales,
       count(*) FILTER (WHERE school_id IS NOT NULL) AS competences_ecoles,
       (SELECT count(*) FROM public.prim_notes)      AS notes_intactes
  FROM public.prim_competences;
