-- ============================================================================
-- MOTEUR UNIFIÉ « officiel » — MINEDUB (fondamental) + MINESEC (secondaire)
-- ============================================================================
-- Ajoute la valeur 'officiel' au drapeau schools.bulletin_engine. Ce mode unique
-- couvre TOUT le système officiel camerounais, résolu PAR CLASSE selon le niveau :
--   • maternelle (PS/MS/GS)   → domaines MINEDUB (A/ECA/NA)
--   • primaire   (SIL…CM2)    → compétences nationales APC (MINEDUB)
--   • collège    (6e–3e)      → APC par compétences (MINESEC)
--   • lycée      (2nde–Tle)   → Second Cycle par séries (MINESEC)
-- Les niveaux non reconnus retombent sur 'classic'.
--
-- C'est le pendant « tout officiel » du mode 'classic'. Les drapeaux fragmentés
-- historiques (apc_minesec / minesec / minedub / maternelle / apc_primaire) restent
-- acceptés (rétro-compat) mais l'interface ne propose plus que Classique / Officiel.
--
-- À EXÉCUTER dans Supabase → SQL Editor. Idempotent.
-- ============================================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS bulletin_engine text NOT NULL DEFAULT 'classic';

ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_bulletin_engine_chk;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_bulletin_engine_chk
  CHECK (bulletin_engine IN
    ('classic','officiel','apc_minesec','minesec','minedub','maternelle','apc_primaire'));

-- La surcharge par classe accepte les mêmes valeurs (nullable = hérite de l'école).
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS bulletin_engine text;
