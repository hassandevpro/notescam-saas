-- ============================================================
-- Ordre des matières sur le bulletin
--
-- Permet à l'administration de choisir l'ordre d'affichage des matières
-- sur tous les modèles de bulletin (colonne `position`, croissante).
-- Les matières sans position conservent le tri par défaut (coef puis nom),
-- placées après les matières ordonnées. 100 % additif, rétrocompatible.
--
-- À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS position integer;
