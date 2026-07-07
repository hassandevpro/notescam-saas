-- ============================================================================
-- Appréciation libre du travail de l'élève (points forts / à améliorer)
--
-- Champ texte personnalisable PAR ÉLÈVE et PAR PÉRIODE, saisi depuis la page
-- Bulletins et affiché dans la case « Appréciation du travail de l'élève » des
-- bulletins APC (officiel 1er cycle, APC annuel et APC classique).
--
-- Stocké comme les autres champs du conseil de classe (décision, tableau
-- d'honneur…) dans `student_absences`, clé (student_id, sequence).
--
-- 100 % additif, rétrocompatible. À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================================

ALTER TABLE public.student_absences
  ADD COLUMN IF NOT EXISTS appreciation text;
