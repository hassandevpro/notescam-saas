-- ============================================================================
-- RYTHME D'ÉVALUATION DU PRIMAIRE CLASSIQUE
-- ============================================================================
-- Ajoute le réglage d'établissement `schools.primary_period_mode` :
--   'trimestres' (défaut, historique) : 3 périodes, une note par trimestre.
--   'sequences'                       : 6 séquences, 2 par trimestre — le
--                                       rythme du collège/lycée.
--
-- Ne concerne QUE le primaire classique. Le primaire APC/MINEDUB (compétences
-- par Unité d'Apprentissage) et la maternelle (domaines) gardent leurs propres
-- écrans et restent trimestriels.
--
-- POURQUOI UN RÉGLAGE ET PAS UNE BASCULE GLOBALE
-- Les notes vivent dans `grades.sequence`. En trimestres, le primaire y écrit
-- 1, 2, 3 ; en séquences, le Trimestre 1 agrège les séquences 1 ET 2. Basculer
-- une école qui a déjà saisi ferait donc glisser son ancien « Trimestre 2 »
-- (=2) dans le Trimestre 1, sans rien signaler. Le défaut reste donc
-- 'trimestres' : une école existante ne bouge pas tant qu'elle ne choisit pas.
--
-- Pour une école qui a DÉJÀ saisi en trimestres et veut passer aux séquences,
-- il faut d'abord redistribuer ses notes (1→1, 2→3, 3→5) pour qu'elles
-- retombent dans le bon trimestre. Ce script ne le fait pas : il n'y a pas de
-- migration silencieuse des notes ici.
--
-- À EXÉCUTER dans l'éditeur SQL Supabase (idempotent — rejouable sans risque).
-- ============================================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS primary_period_mode TEXT NOT NULL DEFAULT 'trimestres';

-- Garde-fou de valeurs (seulement deux rythmes pris en charge).
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_primary_period_mode_chk;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_primary_period_mode_chk
  CHECK (primary_period_mode IN ('trimestres', 'sequences'));

COMMENT ON COLUMN public.schools.primary_period_mode IS
  'Rythme d''évaluation du primaire classique : trimestres (3) ou sequences (6). Ne touche ni le primaire APC ni la maternelle.';
