-- ─────────────────────────────────────────────────────────────────────────────
-- Vie scolaire — rattachement à une séquence (supabase_vie_scolaire.sql)
-- ─────────────────────────────────────────────────────────────────────────────
-- Permet de dater un retard/incident/sanction par SÉQUENCE (1-6, même convention
-- que grades.sequence / academic_periods.sequence_order / ConseilDeClasse.jsx),
-- afin de :
--   • rattacher automatiquement les sanctions aux compteurs de conduite du
--     bulletin (voir scEngine.vieScolaireAutoConduite) ;
--   • filtrer le rapport « Discipline » (/app/reports) par période.
-- Nullable : les enregistrements déjà saisis restent valides (regroupés en
-- « non classé » côté rapport).
--
-- À exécuter une fois dans l'éditeur SQL Supabase.

ALTER TABLE public.disciplinary_incidents ADD COLUMN IF NOT EXISTS sequence_order integer;
ALTER TABLE public.disciplinary_actions   ADD COLUMN IF NOT EXISTS sequence_order integer;
ALTER TABLE public.late_arrivals          ADD COLUMN IF NOT EXISTS sequence_order integer;

COMMENT ON COLUMN public.disciplinary_incidents.sequence_order IS
  'Séquence (1-6) à laquelle rattacher l''incident — null = non classé.';
COMMENT ON COLUMN public.disciplinary_actions.sequence_order IS
  'Séquence (1-6) à laquelle rattacher la sanction — alimente les compteurs de conduite du bulletin.';
COMMENT ON COLUMN public.late_arrivals.sequence_order IS
  'Séquence (1-6) à laquelle rattacher le retard — null = non classé.';
