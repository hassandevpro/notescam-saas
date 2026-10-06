-- ROLLBACK de supabase_prim_note_points_max.sql
-- ============================================================================
-- Retire `prim_notes.points_max` et sa contrainte.
--
-- CE QUE CELA PERD : le barème propre des évaluations qui en portaient un. Après
-- ce rollback, une note saisie sur 10 est relue sur le barème officiel du
-- critère — donc FAUSSE, et dans le sens qui défavorise l'élève (8/10 devient
-- 8/20). Avant de l'exécuter, relevez les notes concernées :
--
--   SELECT eleve_id, competence_id, critere_id, ua, note, points_max
--     FROM public.prim_notes WHERE points_max IS NOT NULL;
--
-- À n'exécuter que si l'on revient aussi au code d'avant (le moteur lit
-- `points_max` ; son absence le ramène au barème du référentiel, cf.
-- core/primEngine.js `primNoteScale`).
-- ============================================================================

ALTER TABLE public.prim_notes
  DROP CONSTRAINT IF EXISTS prim_notes_points_max_sain;

ALTER TABLE public.prim_notes
  DROP COLUMN IF EXISTS points_max;
