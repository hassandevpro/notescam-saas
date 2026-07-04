-- ─────────────────────────────────────────────────────────────────────────────
-- Bulletin APC (premier cycle) — colonnes optionnelles
-- ─────────────────────────────────────────────────────────────────────────────
-- Chaque établissement peut activer / désactiver les colonnes de fin du bulletin
-- par compétences : COTE, [Min–Max], Appréciation. La COTE et l'Appréciation sont
-- alignées sur le barème configurable (schools.grade_scale) ; ces bascules ne
-- pilotent QUE l'affichage des colonnes. Par défaut : toutes affichées.
--
-- À exécuter une fois dans l'éditeur SQL Supabase.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS apc_bulletin_cols jsonb NOT NULL
    DEFAULT '{"cote":true,"minmax":true,"appreciation":true}'::jsonb;
