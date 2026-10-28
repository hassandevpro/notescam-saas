-- UNE NOTE MANQUANTE COMPTE ZÉRO, SAUF ABSENCE JUSTIFIÉE OU NON-ÉVALUATION
-- ============================================================================
-- THE GENIUS (Bafoussam) a signalé le 2026-10-27 : « pour les élèves qui n'ont
-- pas assisté à l'évaluation, on [met] automatiquement zéro, sauf si le prof
-- clique sur absent pour une excuse justifiée », puis : « ajoute option
-- compétence non évaluée, donc pas de zéro automatique, mais apparaît sur le
-- bulletin en - - - - ».
--
-- ── CE QUI EXISTE AUJOURD'HUI, ET POURQUOI ÇA NE SUFFIT PAS ─────────────────
--
-- L'application ne connaît QU'UN SEUL état « pas de note » : '', NULL et 'ABS'
-- sont traités identiquement — exclus de la moyenne — dans six moteurs et une
-- vingtaine d'endroits. Un élève qui n'a composé à rien n'a donc pas zéro : il
-- n'a PAS DE MOYENNE, ou une moyenne calculée sur la seule épreuve qu'il a
-- faite. C'est l'inverse d'une sanction.
--
-- Pire, au primaire : prim_notes.note est NUMERIC. « Absent » n'y est pas
-- seulement ignoré, il est IMPOSSIBLE À ÉCRIRE — 'ABS' part vers une colonne
-- numérique et l'upsert est rejeté. C'est le bug que apcService.js:132
-- documente déjà pour apc_notes, où 'ABS' est converti en NULL, donc perdu.
--
-- ── ⚠️  ORDRE D'EXÉCUTION ───────────────────────────────────────────────────
--
--   1. CE FICHIER, dans Supabase.          <- d'abord
--   2. Puis seulement le paquet LAN qui porte les ensureColumn.
--
-- LA RAISON, ET SON PÉRIMÈTRE EXACT. `schools` circule réellement : elle
-- figure dans sync-push ET sync-pull. Une colonne présente côté LAN mais
-- absente du Cloud y déclencherait le piège relevé en B1 — la LIGNE ENTIÈRE
-- refusée, en silence. C'est pour `schools.notes_manquantes_zero` que l'ordre
-- compte.
--
-- `prim_notes`, EN REVANCHE, NE CIRCULE PAS DU TOUT. Vérifié le 2026-10-27 :
-- elle n'apparaît ni dans supabase/functions/sync-push/index.ts ni dans
-- sync-pull (0 occurrence), au même titre qu'apc_notes et mat_observations —
-- seule `grades`, le moteur classique, voyage. Le contrat de synchronisation
-- l'inscrit explicitement aux EXCLUSIONS : « ids de référentiel divergents
-- entre seed local et Cloud ». La colonne `statut` n'y risque donc rien.
--
-- CE QUE CELA VEUT DIRE POUR UNE ÉCOLE EN ÉDITION LAN : les notes du primaire
-- qu'elle saisit RESTENT SUR SON SERVEUR. Elles ne montent pas, et celles du
-- Cloud ne descendent pas. Ce n'est pas introduit par ce fichier — c'est l'état
-- du chantier des ids de référentiel, et il reste ouvert.
--
-- ── CE QUE ÇA NE CHANGE POUR PERSONNE ──────────────────────────────────────
--
-- notes_manquantes_zero naît à FALSE pour toutes les écoles. Compter zéro
-- change la moyenne de tous les bulletins déjà imprimés : une école qui a
-- toujours lu ses moyennes comme « sur ce qui a été évalué » verrait ses rangs
-- bouger sans avoir rien demandé. Tant que le réglage est éteint, le
-- comportement est celui d'aujourd'hui, à l'octet près.
--
-- AUCUNE NOTE N'EST MODIFIÉE PAR CE FICHIER. Il ajoute deux colonnes nullables
-- et une table vide. Additif, idempotent. À EXÉCUTER dans Supabase.
-- ============================================================================

-- ── 1. Le réglage d'école ───────────────────────────────────────────────────
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS notes_manquantes_zero boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schools.notes_manquantes_zero IS
  'FALSE (defaut) = une note manquante est exclue de la moyenne, comportement '
  'historique. TRUE = elle compte 0 AU MOMENT DU BULLETIN uniquement — jamais a '
  'la saisie, sinon un enseignant qui a saisi 5 eleves sur 30 en coulerait 25.';

-- ── 2. L'absence justifiée, au primaire ─────────────────────────────────────
-- `note` est NUMERIC et le reste : on ne touche pas au type d'une colonne qui
-- porte 2 337 notes en production. Le statut vit à côté.
ALTER TABLE public.prim_notes
  ADD COLUMN IF NOT EXISTS statut text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prim_notes_statut_connu') THEN
    ALTER TABLE public.prim_notes
      ADD CONSTRAINT prim_notes_statut_connu
      CHECK (statut IS NULL OR statut IN ('absent'));
  END IF;
END $$;

COMMENT ON COLUMN public.prim_notes.statut IS
  'NULL = note ordinaire (c est le cas de toutes les lignes existantes). '
  'absent = absence justifiee : la cellule reste hors moyenne meme quand '
  'l ecole a demande que les notes manquantes comptent zero.';

-- ── 3. « Compétence non évaluée », par classe et par UA ─────────────────────
-- Le grain est celui du réel : la CM1 peut n'avoir pas évalué les TIC à l'UA 2
-- et les évaluer à l'UA 3, sans que la CM2 soit concernée.
CREATE TABLE IF NOT EXISTS public.prim_competences_non_evaluees (
  school_id     uuid NOT NULL REFERENCES public.schools(id)          ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES public.classes(id)          ON DELETE CASCADE,
  competence_id text NOT NULL REFERENCES public.prim_competences(id) ON DELETE CASCADE,
  ua            integer NOT NULL,
  declare_le    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, class_id, competence_id, ua)
);

COMMENT ON TABLE public.prim_competences_non_evaluees IS
  'Competences qu une classe n a pas evaluees a une UA donnee. Elles '
  's impriment « - - - - » sur le bulletin et ne comptent dans aucun total — '
  'ni au numerateur, ni au denominateur.';

CREATE INDEX IF NOT EXISTS idx_prim_non_eval_school ON public.prim_competences_non_evaluees(school_id);
CREATE INDEX IF NOT EXISTS idx_prim_non_eval_class  ON public.prim_competences_non_evaluees(class_id);

-- ── 4. RLS — chaque école ne voit et n'écrit que les siennes ────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'member_of_school') THEN
    RAISE EXCEPTION 'public.member_of_school absente — appliquez d abord supabase_mat_domaines_par_ecole.sql.';
  END IF;
END $$;

ALTER TABLE public.prim_competences_non_evaluees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prim non evaluees: les siennes" ON public.prim_competences_non_evaluees;
CREATE POLICY "prim non evaluees: les siennes"
  ON public.prim_competences_non_evaluees FOR ALL TO authenticated
  USING      (public.member_of_school(school_id))
  WITH CHECK (public.member_of_school(school_id));

-- ── 5. Vérification ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_reglage boolean; v_statut boolean; v_tab boolean; v_rls boolean; v_pol boolean;
  v_allumees integer; v_statuts integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='schools'
                    AND column_name='notes_manquantes_zero') INTO v_reglage;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='prim_notes'
                    AND column_name='statut') INTO v_statut;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public'
                    AND table_name='prim_competences_non_evaluees') INTO v_tab;
  SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.prim_competences_non_evaluees'::regclass INTO v_rls;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='prim_competences_non_evaluees'
                  AND policyname='prim non evaluees: les siennes') INTO v_pol;

  IF NOT (v_reglage AND v_statut AND v_tab AND v_rls AND v_pol) THEN
    RAISE EXCEPTION 'Incomplet — reglage=% statut=% table=% rls=% policy=%',
      v_reglage, v_statut, v_tab, v_rls, v_pol;
  END IF;

  SELECT count(*) FROM public.schools WHERE notes_manquantes_zero INTO v_allumees;
  SELECT count(*) FROM public.prim_notes WHERE statut IS NOT NULL INTO v_statuts;
  RAISE NOTICE 'OK — % ecole(s) ont le reglage allume, % note(s) portent un statut. Les deux doivent valoir 0 juste apres cette migration.', v_allumees, v_statuts;
END $$;

-- Contrôle à lire : aucune note touchée, aucun réglage allumé, aucune
-- déclaration posée. Si `notes_intactes` ne vaut pas ce qu'il valait avant,
-- quelque chose d'autre a tourné.
SELECT (SELECT count(*) FROM public.prim_notes)                          AS notes_intactes,
       (SELECT count(*) FROM public.prim_notes WHERE statut IS NOT NULL) AS statuts_poses,
       (SELECT count(*) FROM public.schools WHERE notes_manquantes_zero) AS ecoles_reglage_allume,
       (SELECT count(*) FROM public.prim_competences_non_evaluees)       AS non_evaluations_declarees;
