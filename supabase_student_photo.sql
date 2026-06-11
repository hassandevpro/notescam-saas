-- ============================================================
-- Photo d'élève
--
-- Stocke l'URL publique de la photo de l'élève (bucket existant
-- `school-assets`, sous-dossier `<school_id>/students/`). Sert aux
-- listes, fiches élèves, cartes scolaires et bulletins. 100 % additif.
--
-- À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS photo_url text;
