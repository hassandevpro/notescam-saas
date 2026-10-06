-- L'ÉCOLE MAÎTRISE SES COMPÉTENCES APC (premier cycle) — ajouter, masquer, renommer
-- ============================================================================
-- Même demande, même table partagée, même traitement que la maternelle
-- (supabase_mat_domaines_par_ecole.sql) : « Compétences officielles MINESEC —
-- chargées automatiquement, NON MODIFIABLES » devient modifiable, chez soi.
--
-- `apc_competences` est GLOBALE : une seule ligne « Use appropriate language
-- resources… » pour les 44 écoles, et `apc_notes.competence_id` porte une clé
-- étrangère vers elle. On ne peut donc ni l'éditer sans toucher les autres
-- établissements, ni ranger ses compétences ailleurs.
--
-- La table devient PROPRIÉTAIRE :
--   • school_id NULL        → national. Lu par tous, écrit par personne.
--   • school_id = une école → à elle seule : lu, renommé, supprimé par elle.
--
-- ── LE PIÈGE PROPRE À L'APC : LA CONTRAINTE D'UNICITÉ ───────────────────────
-- `apc_competences_uniq UNIQUE (classe_id, trimestre_id, matiere_id, ordre)` est
-- la clé pédagogique du référentiel. Telle quelle, une école qui ajoute une
-- compétence en 3e/T1/Anglais entrerait en collision avec la nationale de même
-- ordre — l'insertion serait refusée sans qu'on comprenne pourquoi.
--
-- Et il ne suffit PAS d'ajouter `school_id` à la contrainte : Postgres considère
-- deux NULL comme distincts, ce qui AFFAIBLIRAIT la règle nationale (deux lignes
-- nationales identiques deviendraient permises). On la scinde donc en deux index
-- partiels, chacun strict sur son domaine.
--
-- Additif, idempotent, réversible (cf. _rollback). À EXÉCUTER dans Supabase.
-- ============================================================================

-- ── 1. La propriété ─────────────────────────────────────────────────────────
ALTER TABLE public.apc_competences
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.apc_competences.school_id IS
  'NULL = compétence NATIONALE (lecture pour tous, écriture service role). '
  'Renseigné = compétence propre à cette école, qu''elle seule voit et modifie.';

CREATE INDEX IF NOT EXISTS apc_competences_school ON public.apc_competences(school_id);

-- ── 2. L'unicité, scindée ───────────────────────────────────────────────────
-- National : la règle d'origine, intacte, mais bornée aux lignes nationales.
-- École    : la même rigueur, chez elle, sans jamais croiser le national.
ALTER TABLE public.apc_competences DROP CONSTRAINT IF EXISTS apc_competences_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS apc_competences_uniq_national
  ON public.apc_competences (classe_id, trimestre_id, matiere_id, ordre)
  WHERE school_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS apc_competences_uniq_ecole
  ON public.apc_competences (school_id, classe_id, trimestre_id, matiere_id, ordre)
  WHERE school_id IS NOT NULL;

-- ── 3. Les compétences masquées par une école ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.apc_competences_masques (
  school_id     uuid NOT NULL REFERENCES public.schools(id)          ON DELETE CASCADE,
  competence_id uuid NOT NULL REFERENCES public.apc_competences(id)  ON DELETE CASCADE,
  masque_le     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, competence_id)
);

-- ── 4. RLS — apc_competences ────────────────────────────────────────────────
-- `member_of_school` vient de supabase_mat_domaines_par_ecole.sql : on la
-- réutilise plutôt que d'en poser une jumelle qui dériverait.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'member_of_school') THEN
    RAISE EXCEPTION 'public.member_of_school absente — appliquez d''abord supabase_mat_domaines_par_ecole.sql.';
  END IF;
END $$;

ALTER TABLE public.apc_competences ENABLE ROW LEVEL SECURITY;

-- La lecture ouverte à tous est remplacée : sinon chaque école verrait les
-- compétences maison de toutes les autres.
DROP POLICY IF EXISTS "apc ref read" ON public.apc_competences;
DROP POLICY IF EXISTS "apc competences: lecture national + le sien" ON public.apc_competences;
CREATE POLICY "apc competences: lecture national + le sien"
  ON public.apc_competences FOR SELECT TO authenticated
  USING (school_id IS NULL OR public.member_of_school(school_id));

DROP POLICY IF EXISTS "apc competences: ecriture des siennes" ON public.apc_competences;
CREATE POLICY "apc competences: ecriture des siennes"
  ON public.apc_competences FOR ALL TO authenticated
  USING      (school_id IS NOT NULL AND public.member_of_school(school_id))
  WITH CHECK (school_id IS NOT NULL AND public.member_of_school(school_id));

-- ── 5. RLS — apc_competences_masques ────────────────────────────────────────
ALTER TABLE public.apc_competences_masques ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "apc masques: les siens" ON public.apc_competences_masques;
CREATE POLICY "apc masques: les siens"
  ON public.apc_competences_masques FOR ALL TO authenticated
  USING      (public.member_of_school(school_id))
  WITH CHECK (public.member_of_school(school_id));

-- ── 6. Vérification ─────────────────────────────────────────────────────────
DO $$
DECLARE v_col boolean; v_tab boolean; v_read boolean; v_write boolean;
        v_un boolean; v_ue boolean; v_old boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='apc_competences'
                    AND column_name='school_id') INTO v_col;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='apc_competences_masques') INTO v_tab;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='apc_competences'
                  AND policyname='apc competences: lecture national + le sien') INTO v_read;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='apc_competences'
                  AND policyname='apc competences: ecriture des siennes') INTO v_write;
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                  AND indexname='apc_competences_uniq_national') INTO v_un;
  SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                  AND indexname='apc_competences_uniq_ecole') INTO v_ue;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='apc_competences' AND policyname='apc ref read') INTO v_old;

  IF NOT (v_col AND v_tab AND v_read AND v_write AND v_un AND v_ue) THEN
    RAISE EXCEPTION 'Incomplet — col=% tab=% lec=% ecr=% uniqNat=% uniqEcole=%',
      v_col, v_tab, v_read, v_write, v_un, v_ue;
  END IF;
  IF v_old THEN
    RAISE WARNING 'L''ancienne policy « apc ref read » survit : chaque ecole verrait les competences maison des autres.';
  END IF;
  RAISE NOTICE 'OK — chaque ecole maitrise ses competences APC, le national reste intact.';
END $$;

-- Contrôle : le national est intact, et personne n'a encore rien ajouté.
SELECT count(*) FILTER (WHERE school_id IS NULL)     AS competences_nationales,
       count(*) FILTER (WHERE school_id IS NOT NULL) AS competences_ecoles,
       (SELECT count(*) FROM public.apc_notes)       AS notes_intactes
  FROM public.apc_competences;
