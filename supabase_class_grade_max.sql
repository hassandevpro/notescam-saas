-- ============================================================
-- Barème de notation par classe
--
-- Permet de choisir le barème de sortie d'une classe (/10, /20, /30, /100…),
-- indépendamment du système (FR/EN). NULL = défaut système (FR → 20, EN → 100,
-- ES → réglage école). 100 % additif et rétrocompatible : les classes
-- existantes (grade_max NULL) gardent exactement leur comportement actuel.
--
-- À exécuter une fois dans Supabase (SQL Editor).
-- ============================================================

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS grade_max integer;
