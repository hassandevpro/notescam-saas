-- L'ÉCOLE MAÎTRISE SON RÉFÉRENTIEL MATERNELLE — ajouter, masquer, renommer
-- ============================================================================
-- LA DEMANDE : que les enseignants puissent modifier les compétences, « même
-- référentiel national ».
--
-- LE PROBLÈME QUE CELA POSE, et qu'il faut regarder en face : `mat_domaines` est
-- une table GLOBALE. Une seule ligne « Psychomotricité », partagée par les 44
-- écoles. Un UPDATE direct depuis le compte d'une enseignante renommerait le
-- domaine pour les 43 autres établissements, sans qu'aucun ne l'ait demandé ni ne
-- s'en aperçoive. Ce n'est pas une précaution théorique : c'est une écriture
-- croisée entre clients d'une même plateforme.
--
-- ET ON NE PEUT PAS CONTOURNER PAR AILLEURS : `mat_observations.domaine_id` porte
-- une clé étrangère vers `mat_domaines(id)`. Une école ne peut donc pas tenir ses
-- domaines ailleurs — la base refuserait l'observation.
--
-- LA SOLUTION : la table devient PROPRIÉTAIRE. Une colonne `school_id` :
--   • NULL          → ligne NATIONALE. Lue par tous, écrite par personne (service
--                     role uniquement). Les 8 domaines officiels ne bougent pas.
--   • = une école   → ligne DE CETTE ÉCOLE. Lue par elle seule, écrite par elle
--                     seule. Elle ajoute les domaines qu'elle veut.
--
-- La FK continue de fonctionner (même table, même colonne), et une observation
-- peut donc pointer vers un domaine maison.
--
-- MASQUER un domaine national qu'une école n'utilise pas : `mat_domaines_masques`.
-- On ne supprime pas la ligne nationale (elle sert aux autres) et on ne la
-- désactive pas globalement — l'école la cache CHEZ ELLE.
--
-- RENOMMER un domaine national : déjà possible sans cette migration, par la ligne
-- `subjects` de la classe qui porte `mat_domaine_id` (cf. domaineLabelOverrides).
-- L'identité officielle est conservée, seul l'affichage change.
--
-- Au total, l'école a bien la main sur SON référentiel — ajouter, masquer,
-- renommer — sans qu'aucune de ses décisions ne sorte de chez elle.
--
-- Additif, idempotent, réversible (cf. _rollback). À EXÉCUTER dans Supabase.
-- ============================================================================

-- ── 1. La propriété ─────────────────────────────────────────────────────────
ALTER TABLE public.mat_domaines
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.mat_domaines.school_id IS
  'NULL = domaine NATIONAL (lecture pour tous, écriture service role). '
  'Renseigné = domaine propre à cette école, qu''elle seule voit et modifie.';

CREATE INDEX IF NOT EXISTS mat_domaines_school ON public.mat_domaines(school_id);

-- ── 2. Les domaines masqués par une école ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mat_domaines_masques (
  school_id  uuid NOT NULL REFERENCES public.schools(id)      ON DELETE CASCADE,
  domaine_id text NOT NULL REFERENCES public.mat_domaines(id) ON DELETE CASCADE,
  masque_le  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, domaine_id)
);

-- ── 3. Qui écrit dans le référentiel de SON école ───────────────────────────
-- Tout membre actif de l'école : l'administration comme les enseignants. C'est
-- la demande — pas de réglage, pas de hiérarchie à franchir pour nommer une
-- compétence. Le périmètre est l'ÉCOLE : on ne touche jamais le national.
CREATE OR REPLACE FUNCTION public.member_of_school(p_school uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_users su
     WHERE su.user_id = auth.uid() AND su.school_id = p_school AND su.active = true
  );
$$;
REVOKE ALL    ON FUNCTION public.member_of_school(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.member_of_school(uuid) TO authenticated;

-- ── 4. RLS — mat_domaines ───────────────────────────────────────────────────
-- Lecture : le national (school_id IS NULL) + le sien. La policy de lecture
-- historique « mat ref read » (USING true) est REMPLACÉE : laissée telle quelle,
-- chaque école verrait les domaines maison de toutes les autres.
DROP POLICY IF EXISTS "mat ref read" ON public.mat_domaines;
CREATE POLICY "mat domaines: lecture national + le sien"
  ON public.mat_domaines FOR SELECT TO authenticated
  USING (school_id IS NULL OR public.member_of_school(school_id));

-- Écriture : UNIQUEMENT ses propres lignes. `USING` protège la ligne existante,
-- `WITH CHECK` la ligne proposée — sans les deux, on pourrait s'approprier une
-- ligne nationale en lui posant son `school_id`, ou pousser la sienne vers NULL.
DROP POLICY IF EXISTS "mat domaines: ecriture de ses propres domaines" ON public.mat_domaines;
CREATE POLICY "mat domaines: ecriture de ses propres domaines"
  ON public.mat_domaines FOR ALL TO authenticated
  USING      (school_id IS NOT NULL AND public.member_of_school(school_id))
  WITH CHECK (school_id IS NOT NULL AND public.member_of_school(school_id));

-- ── 5. RLS — mat_domaines_masques ───────────────────────────────────────────
ALTER TABLE public.mat_domaines_masques ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mat masques: les siens" ON public.mat_domaines_masques;
CREATE POLICY "mat masques: les siens"
  ON public.mat_domaines_masques FOR ALL TO authenticated
  USING      (public.member_of_school(school_id))
  WITH CHECK (public.member_of_school(school_id));

-- ── 6. Vérification ─────────────────────────────────────────────────────────
DO $$
DECLARE v_col boolean; v_tab boolean; v_read boolean; v_write boolean; v_old boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='mat_domaines'
                    AND column_name='school_id') INTO v_col;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='mat_domaines_masques') INTO v_tab;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='mat_domaines'
                  AND policyname='mat domaines: lecture national + le sien') INTO v_read;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='mat_domaines'
                  AND policyname='mat domaines: ecriture de ses propres domaines') INTO v_write;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='mat_domaines' AND policyname='mat ref read') INTO v_old;

  IF NOT (v_col AND v_tab AND v_read AND v_write) THEN
    RAISE EXCEPTION 'Incomplet — colonne=% table=% lecture=% ecriture=%', v_col, v_tab, v_read, v_write;
  END IF;
  IF v_old THEN
    RAISE WARNING 'L''ancienne policy « mat ref read » (USING true) est toujours la : chaque ecole verrait les domaines maison des autres.';
  END IF;
  RAISE NOTICE 'OK — chaque ecole maitrise son referentiel, le national reste intact.';
END $$;

-- Contrôle : les 8 nationaux sont toujours là et sans propriétaire.
SELECT count(*) FILTER (WHERE school_id IS NULL)     AS domaines_nationaux,
       count(*) FILTER (WHERE school_id IS NOT NULL) AS domaines_ecoles
  FROM public.mat_domaines;
