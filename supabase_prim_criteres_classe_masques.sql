-- ============================================================================
-- MASQUER UN CRITÈRE D'ÉVALUATION DU PRIMAIRE POUR UNE CLASSE **ET UNE COMPÉTENCE**
-- ============================================================================
-- Demande de l'école (2026-11-05) : « quand j'enlève les critères, ça ne doit pas le faire pour
-- toutes les classes », puis, après diagnostic : « lorsqu'on masque un critère à une compétence,
-- ça masque pour toute la classe ».
--
-- LA PORTÉE JUSTE EST (classe, compétence, critère), et rien de plus large. Une classe évalue
-- « Pratique » en TIC et pas en Dictée ; le barème national lui-même a pour clé
-- (niveau, COMPÉTENCE, critère). Un masque sans la compétence retirait la colonne des ONZE
-- compétences de la classe — c'est le défaut signalé.
--
-- CE QUE LE MASQUE FAIT, ET CE QU'IL NE FAIT PAS. Le critère masqué quitte la saisie, le
-- bulletin, le PV et le rapport de CETTE classe POUR CETTE COMPÉTENCE — avec ses points au
-- barème. Les notes déjà saisies RESTENT EN BASE : rien n'est supprimé, rien n'est ignoré à
-- l'écriture, et réafficher le critère les remontre intactes. Aucune ligne de `prim_notes`
-- n'est touchée par ce fichier ni par l'écran qui l'utilise.
--
-- CE QUI N'EST PAS TOUCHÉ : `public.prim_criteres_masques` (école entière, D26) continue de
-- valoir pour toutes les classes et toutes les compétences. Les écoles qui n'évaluent qu'à
-- l'écrit gardent leur réglage, qui est le plus large et le plus simple pour elles. Les
-- critères effectivement masqués pour une case de l'écran sont l'UNION des deux.
--
-- NATURE : un réglage d'AFFICHAGE propre à chaque édition, comme les masques de l'école — il ne
-- voyage pas dans la synchronisation (hors SYNCED_TABLES et hors listes des Edge Functions :
-- AUCUNE fonction à redéployer, aucune liste de synchro à modifier).
--
-- ADDITIVE ET IDEMPOTENTE : une table nouvelle, aucune donnée existante touchée.
--
-- ⚠️ SI UNE VERSION SANS `competence_id` A DÉJÀ ÉTÉ APPLIQUÉE quelque part (elle ne l'a PAS été
-- en production au 2026-11-05 : « relation does not exist »), le bloc 2 la remplace si elle est
-- VIDE, et s'arrête en le disant si elle contient des lignes — on ne devine pas à quelle
-- compétence rattacher un masque posé sans elle.
--
-- RETOUR ARRIÈRE (sans perte pour le reste) :
--   DROP TABLE IF EXISTS public.prim_criteres_classe_masques;
-- Les critères masqués réapparaissent alors dans leurs classes. Aucune note n'est concernée.
--
-- ORDRE : appliquer ce fichier AVANT de mettre en ligne l'écran qui l'utilise. Tant qu'il n'est
-- pas appliqué, l'écran REFUSE de masquer (et le dit) au lieu de masquer à l'aveugle — ou, pire,
-- pour toute l'école.
-- ============================================================================

-- ── 1. Le prérequis
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'member_of_school') THEN
    RAISE EXCEPTION 'public.member_of_school absente — appliquez d''abord supabase_mat_domaines_par_ecole.sql.';
  END IF;
END $$;

-- ── 2. L'ancienne forme (sans compétence), si elle existe quelque part
DO $$
DECLARE v_existe boolean; v_a_competence boolean; v_lignes bigint;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='prim_criteres_classe_masques')
    INTO v_existe;
  IF NOT v_existe THEN RETURN; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='prim_criteres_classe_masques'
                    AND column_name='competence_id')
    INTO v_a_competence;
  IF v_a_competence THEN RETURN; END IF;

  EXECUTE 'SELECT count(*) FROM public.prim_criteres_classe_masques' INTO v_lignes;
  IF v_lignes > 0 THEN
    RAISE EXCEPTION 'prim_criteres_classe_masques existe SANS competence_id et porte % ligne(s). '
                    'Un masque pose sans competence ne se rattache a aucune competence : '
                    'notez-les, supprimez-les, puis relancez ce fichier.', v_lignes;
  END IF;
  RAISE NOTICE 'Ancienne table (sans competence_id) vide : remplacee.';
  DROP TABLE public.prim_criteres_classe_masques;
END $$;

-- ── 3. La table
CREATE TABLE IF NOT EXISTS public.prim_criteres_classe_masques (
  school_id     uuid NOT NULL REFERENCES public.schools(id)          ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES public.classes(id)          ON DELETE CASCADE,
  competence_id text NOT NULL REFERENCES public.prim_competences(id) ON DELETE CASCADE,
  critere_id    text NOT NULL REFERENCES public.prim_criteres(id)    ON DELETE CASCADE,
  masque_le     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, class_id, competence_id, critere_id)
);

CREATE INDEX IF NOT EXISTS idx_prim_criteres_classe_masques_school
  ON public.prim_criteres_classe_masques (school_id);

COMMENT ON TABLE public.prim_criteres_classe_masques IS
  'Critères d''évaluation du primaire masqués pour UNE classe ET UNE compétence (réglage '
  'd''affichage, non synchronisé). Ne supprime aucune note. Le masquage de toute l''école est '
  'public.prim_criteres_masques.';

-- ── 4. RLS — chaque école ne voit et n'écrit que les siennes (même forme que prim_criteres_masques)
ALTER TABLE public.prim_criteres_classe_masques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prim criteres classe masques: les siens" ON public.prim_criteres_classe_masques;
CREATE POLICY "prim criteres classe masques: les siens"
  ON public.prim_criteres_classe_masques FOR ALL TO authenticated
  USING      (public.member_of_school(school_id))
  WITH CHECK (public.member_of_school(school_id));

-- ── 5. Vérification : la migration a-t-elle vraiment pris ?
DO $$
DECLARE v_tab boolean; v_col boolean; v_rls boolean; v_pol boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='prim_criteres_classe_masques') INTO v_tab;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='prim_criteres_classe_masques'
                    AND column_name='competence_id') INTO v_col;
  SELECT COALESCE((SELECT relrowsecurity FROM pg_class
                    WHERE oid = 'public.prim_criteres_classe_masques'::regclass), false) INTO v_rls;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='prim_criteres_classe_masques'
                  AND policyname='prim criteres classe masques: les siens') INTO v_pol;
  IF NOT (v_tab AND v_col AND v_rls AND v_pol) THEN
    RAISE EXCEPTION 'Migration incomplète : table=% competence_id=% rls=% policy=%', v_tab, v_col, v_rls, v_pol;
  END IF;
  RAISE NOTICE 'prim_criteres_classe_masques : table (classe + competence), RLS et policy en place.';
END $$;
