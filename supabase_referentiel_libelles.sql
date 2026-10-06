-- RENOMMER UNE LIGNE OFFICIELLE — surcharge de libellé par école
-- ============================================================================
-- CE QUI MANQUAIT. Les trois migrations `*_par_ecole.sql` laissent une école
-- AJOUTER ses propres lignes et MASQUER celles du national. Mais pas RENOMMER une
-- ligne officielle : l'écran grisait le champ, parce que la table est partagée par
-- les 44 écoles et qu'un UPDATE direct aurait renommé la compétence pour tout le
-- monde.
--
-- Or renommer est le geste le plus demandé, et le plus légitime : « Use
-- appropriate language resources to listen, speak, read and write about national
-- integration » est le libellé du ministère, pas celui qu'une enseignante veut
-- lire vingt fois par jour sur sa grille.
--
-- LA SOLUTION, déjà éprouvée en maternelle (où la ligne `subjects` portant
-- `mat_domaine_id` jouait ce rôle) : on garde l'IDENTITÉ officielle — donc l'id,
-- donc la clé étrangère des notes, donc le bulletin ministériel — et on surcharge
-- le seul AFFICHAGE, école par école.
--
-- POURQUOI PAS UNE COPIE PRIVÉE. L'autre voie était de copier la ligne nationale
-- en ligne maison puis de masquer l'originale. Elle est séduisante — elle ne
-- demande aucune table — mais elle CASSE LES NOTES DÉJÀ SAISIES : la copie a un
-- nouvel id, et `apc_notes.competence_id` continue de pointer vers l'ancien. Une
-- enseignante qui renomme en cours de trimestre verrait son travail disparaître
-- de l'écran. Une surcharge ne touche aucun id : rien ne bouge sous les notes.
--
-- UNE SEULE TABLE pour les trois référentiels : le mécanisme est identique, et
-- trois tables jumelles auraient dérivé l'une de l'autre. `kind` dit laquelle.
--
-- Additif, idempotent, réversible (cf. _rollback). À EXÉCUTER dans Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.referentiel_libelles (
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('mat', 'apc', 'prim')),
  item_id    text NOT NULL,          -- id de la ligne officielle (texte ou uuid rendu)
  intitule   text NOT NULL,
  maj_le     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, kind, item_id)
);

COMMENT ON TABLE public.referentiel_libelles IS
  'Libellé de remplacement d''une ligne de référentiel NATIONALE, pour UNE école. '
  'L''identité officielle (item_id) est conservée : les notes et le bulletin '
  'ministériel ne bougent pas, seul l''affichage change.';

-- Pas de FK sur `item_id` : les trois référentiels ont des clés de types
-- différents (text pour mat/prim, uuid pour apc). Une ligne orpheline est sans
-- effet — elle ne surcharge rien — et le ménage se fait naturellement.

CREATE INDEX IF NOT EXISTS referentiel_libelles_lookup
  ON public.referentiel_libelles (school_id, kind);

-- ── RLS — chacun chez soi ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'member_of_school') THEN
    RAISE EXCEPTION 'public.member_of_school absente — appliquez d''abord supabase_mat_domaines_par_ecole.sql.';
  END IF;
END $$;

ALTER TABLE public.referentiel_libelles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "referentiel_libelles: les siens" ON public.referentiel_libelles;
CREATE POLICY "referentiel_libelles: les siens"
  ON public.referentiel_libelles FOR ALL TO authenticated
  USING      (public.member_of_school(school_id))
  WITH CHECK (public.member_of_school(school_id));

-- ── Vérification ────────────────────────────────────────────────────────────
DO $$
DECLARE v_tab boolean; v_pol boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='referentiel_libelles') INTO v_tab;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='referentiel_libelles') INTO v_pol;
  IF NOT (v_tab AND v_pol) THEN
    RAISE EXCEPTION 'Incomplet — table=% policy=%', v_tab, v_pol;
  END IF;
  RAISE NOTICE 'OK — une ecole peut renommer une ligne officielle CHEZ ELLE, sans toucher son identite.';
END $$;

SELECT count(*) AS surcharges_existantes FROM public.referentiel_libelles;
