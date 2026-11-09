-- ════════════════════════════════════════════════════════════════════════════
-- MASQUE DES CRITÈRES DU PRIMAIRE : PAR (CLASSE, COMPÉTENCE, CRITÈRE)
-- ════════════════════════════════════════════════════════════════════════════
-- Symptôme : décocher « Oral » pour la compétence 1A le retirait de 1B, 2A… et de TOUTES les classes de
-- l'école. Cause (confirmée dans le code) : `prim_criteres_masques` a pour clé (école, critère).
--
-- CE FICHIER NE CHANGE AUCUN BULLETIN. Il ajoute deux tables vides. Tant qu'une classe n'est pas
-- « initialisée » (table `_init`), l'application lit encore la liste de l'école : comportement historique.
--
-- ⚠ ORDRE : Cloud AVANT toute distribution d'un paquet LAN qui lit ces tables. Ce sont des tables de
-- RÉGLAGE, hors synchronisation (comme `prim_competences_classe_masquees`) : aucune ligne `schools` n'est
-- rejetée si elles manquent, mais le réglage serait refusé hors connexion tant qu'elles n'existent pas.
--
-- Trois parties :
--   PARTIE 1 — création (additive, idempotente)                          → à exécuter
--   PARTIE 2 — LECTURE SEULE : ce que la recopie écrirait               → à exécuter, puis lire
--   PARTIE 3 — recopie du masque d'école sur chaque classe (ÉCRITURE)   → décommentée par vous, après lecture
-- Retour arrière : voir la fin du fichier.

-- ── PARTIE 1 — CRÉATION ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'member_of_school') THEN
    RAISE EXCEPTION 'public.member_of_school absente — appliquez d''abord supabase_mat_domaines_par_ecole.sql.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.prim_criteres_masques_classe (
  school_id     uuid NOT NULL REFERENCES public.schools(id)          ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES public.classes(id)          ON DELETE CASCADE,
  competence_id text NOT NULL REFERENCES public.prim_competences(id) ON DELETE CASCADE,
  critere_id    text NOT NULL REFERENCES public.prim_criteres(id)    ON DELETE CASCADE,
  masque_le     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, class_id, competence_id, critere_id)
);
CREATE INDEX IF NOT EXISTS idx_prim_crit_masques_classe
  ON public.prim_criteres_masques_classe (school_id, class_id);

CREATE TABLE IF NOT EXISTS public.prim_criteres_masques_init (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id  uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  init_le   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, class_id)
);

COMMENT ON TABLE public.prim_criteres_masques_classe IS
  'Critères du primaire masqués pour UNE compétence d''UNE classe (réglage d''affichage, non synchronisé). '
  'Remplace, pour les classes initialisées, public.prim_criteres_masques (clé école, critère).';
COMMENT ON TABLE public.prim_criteres_masques_init IS
  'Classes dont le masque des critères est géré par (classe, compétence, critère). Une classe absente d''ici '
  'lit encore la liste de l''école.';

ALTER TABLE public.prim_criteres_masques_classe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prim_criteres_masques_init   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prim crit masques classe: les siens" ON public.prim_criteres_masques_classe;
CREATE POLICY "prim crit masques classe: les siens"
  ON public.prim_criteres_masques_classe FOR ALL TO authenticated
  USING (public.member_of_school(school_id)) WITH CHECK (public.member_of_school(school_id));

DROP POLICY IF EXISTS "prim crit masques init: les siens" ON public.prim_criteres_masques_init;
CREATE POLICY "prim crit masques init: les siens"
  ON public.prim_criteres_masques_init FOR ALL TO authenticated
  USING (public.member_of_school(school_id)) WITH CHECK (public.member_of_school(school_id));

DO $$
DECLARE v_ok boolean;
BEGIN
  SELECT (SELECT count(*) FROM pg_class WHERE oid IN ('public.prim_criteres_masques_classe'::regclass,
                                                     'public.prim_criteres_masques_init'::regclass)
                                       AND relrowsecurity) = 2
     AND (SELECT count(*) FROM pg_policies WHERE schemaname='public'
            AND tablename IN ('prim_criteres_masques_classe','prim_criteres_masques_init')) = 2 INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'Incomplet — RLS ou policies manquantes'; END IF;
  RAISE NOTICE 'prim_criteres_masques_classe / _init : tables, RLS et policies en place.';
END $$;

-- ── PARTIE 2 — LECTURE SEULE : ce que la recopie écrirait ────────────────────
-- « Classe du primaire » = classes.cycle = 'primaire'. ATTENTION : l'application décide d'après le NIVEAU et
-- le NOM de la classe (core/engineResolver.isPrimaire). Comparez ces deux nombres ; s'ils diffèrent, dites-le
-- avant la partie 3.
-- 2a. Critères masqués par école (le nombre de lignes à recopier = ce chiffre × classes × compétences).
SELECT m.school_id, count(DISTINCT m.critere_id) AS criteres_masques,
       count(DISTINCT c.id) FILTER (WHERE c.cycle = 'primaire') AS classes_cycle_primaire,
       count(DISTINCT c.id) AS classes_total
  FROM public.prim_criteres_masques m
  JOIN public.classes c ON c.school_id = m.school_id
 GROUP BY m.school_id ORDER BY criteres_masques DESC;

-- 2b. Total de lignes que la partie 3 insérerait.
SELECT count(*) AS lignes_a_inserer,
       count(DISTINCT cl.id) AS classes_a_initialiser
  FROM public.prim_criteres_masques m
  JOIN public.classes cl ON cl.school_id = m.school_id AND cl.cycle = 'primaire'
  JOIN public.prim_competences pc ON pc.actif AND (pc.school_id IS NULL OR pc.school_id = m.school_id)
 WHERE NOT EXISTS (SELECT 1 FROM public.prim_criteres_masques_init i WHERE i.class_id = cl.id);

-- ── PARTIE 3 — RECOPIE (ÉCRITURE) — à décommenter après lecture de la partie 2 ───────────────────────
-- Une classe déjà initialisée est SAUTÉE. Les deux INSERT sont dans la même transaction.
-- BEGIN;
--   INSERT INTO public.prim_criteres_masques_classe (school_id, class_id, competence_id, critere_id)
--   SELECT m.school_id, cl.id, pc.id, m.critere_id
--     FROM public.prim_criteres_masques m
--     JOIN public.classes cl ON cl.school_id = m.school_id AND cl.cycle = 'primaire'
--     JOIN public.prim_competences pc ON pc.actif AND (pc.school_id IS NULL OR pc.school_id = m.school_id)
--    WHERE NOT EXISTS (SELECT 1 FROM public.prim_criteres_masques_init i WHERE i.class_id = cl.id)
--   ON CONFLICT DO NOTHING;
--   -- le marqueur PART EN DERNIER : tant qu'il manque, la classe lit encore la liste de l'école
--   INSERT INTO public.prim_criteres_masques_init (school_id, class_id)
--   SELECT DISTINCT cl.school_id, cl.id
--     FROM public.classes cl
--     WHERE cl.cycle = 'primaire'
--       AND EXISTS (SELECT 1 FROM public.prim_criteres_masques m WHERE m.school_id = cl.school_id)
--       AND NOT EXISTS (SELECT 1 FROM public.prim_criteres_masques_init i WHERE i.class_id = cl.id)
--   ON CONFLICT DO NOTHING;
-- COMMIT;
--
-- Contrôle après : chaque classe initialisée doit porter (critères masqués de l'école × compétences) lignes.
-- SELECT i.class_id, count(l.*) AS lignes FROM public.prim_criteres_masques_init i
--   LEFT JOIN public.prim_criteres_masques_classe l ON l.class_id = i.class_id GROUP BY i.class_id;
--
-- RETOUR ARRIÈRE (la liste de l'école redevient lue, aucune note ni liste d'école n'a été touchée) :
-- DELETE FROM public.prim_criteres_masques_classe;
-- DELETE FROM public.prim_criteres_masques_init;
-- Retrait complet : DROP TABLE public.prim_criteres_masques_classe, public.prim_criteres_masques_init;
