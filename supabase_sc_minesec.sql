-- ============================================================================
-- MOTEUR SECOND CYCLE MINESEC (sous-système francophone) — Phase 1 (fondations)
-- ============================================================================
-- Arrêté MINESEC du 07 mars 2022 — nature, durée et coefficients des matières
-- des séries et classes du second cycle de l'enseignement secondaire général.
--
--   Classe → Série → Groupe de matières → Matière → Coefficient → Charge horaire → Note
--
-- Le coefficient et la charge horaire dépendent de (série, classe, matière) :
-- ils ne sont JAMAIS stockés sur la matière. Aucune valeur n'est codée en dur ;
-- coefficients/charges viennent de l'IMPORT de l'arrêté (table sc_serie_matieres).
--
-- Le second cycle réutilise le moteur de notes CLASSIQUE (subjects/grades) : le
-- référentiel auto-configure les `subjects` d'une classe (nom, coef, groupe,
-- charge). Indépendant du moteur APC (premier cycle) — aucune compétence ici.
--
-- À EXÉCUTER dans Supabase → SQL Editor. Idempotent (rejouable).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) RÉFÉRENTIEL (global, lecture authentifiée, écriture service role)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sc_referentiel_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label        text NOT NULL,
  source       text,
  imported_at  timestamptz NOT NULL DEFAULT now(),
  imported_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actif        boolean NOT NULL DEFAULT true
);

-- Catalogue des séries officielles (structure ; pas de coefficients).
CREATE TABLE IF NOT EXISTS public.sc_series (
  id           text PRIMARY KEY,          -- slug stable : 'a1','c','ti','sh','ac'…
  nom          text NOT NULL,
  categorie    text NOT NULL,             -- 'litteraire' | 'scientifique' | 'sciences_humaines' | 'arts'
  description  text,
  ordre        integer NOT NULL DEFAULT 0
);

-- Groupes de matières du bulletin (Groupe 1 = principales, Groupe 2 = complémentaires).
CREATE TABLE IF NOT EXISTS public.sc_groupes (
  id     text PRIMARY KEY,                -- 'g1' | 'g2'
  nom    text NOT NULL,
  ordre  integer NOT NULL DEFAULT 0
);

-- Catalogue des matières (structure : nom/code/domaine ; PAS de coefficient).
CREATE TABLE IF NOT EXISTS public.sc_matieres (
  id                   text PRIMARY KEY,  -- slug stable : 'mathematiques','svteehb','philosophie'…
  nom                  text NOT NULL,
  code                 text,
  domaine_apprentissage text,
  ordre                integer NOT NULL DEFAULT 0
);

-- CŒUR : coefficient + charge horaire PAR (série, classe, matière). Alimenté par
-- l'import de l'arrêté (aucune ligne seedée ici).
CREATE TABLE IF NOT EXISTS public.sc_serie_matieres (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serie_id               text NOT NULL REFERENCES public.sc_series(id)  ON DELETE CASCADE,
  classe_id              text NOT NULL,            -- '2nde' | '1ere' | 'tle'
  matiere_id             text NOT NULL REFERENCES public.sc_matieres(id) ON DELETE CASCADE,
  groupe_id              text NOT NULL REFERENCES public.sc_groupes(id),
  coefficient            numeric NOT NULL,
  charge_horaire         numeric,
  obligatoire            boolean NOT NULL DEFAULT true,
  actif                  boolean NOT NULL DEFAULT true,
  referentiel_version_id uuid REFERENCES public.sc_referentiel_versions(id) ON DELETE SET NULL,
  CONSTRAINT sc_serie_matieres_uniq UNIQUE (serie_id, classe_id, matiere_id)
);

CREATE INDEX IF NOT EXISTS sc_serie_matieres_lookup
  ON public.sc_serie_matieres (serie_id, classe_id) WHERE actif = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) SEED DE LA STRUCTURE FIXE (séries + groupes). Coefficients exclus.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.sc_groupes (id, nom, ordre) VALUES
  ('g1', 'Groupe 1', 1),
  ('g2', 'Groupe 2', 2)
ON CONFLICT (id) DO UPDATE SET nom = EXCLUDED.nom, ordre = EXCLUDED.ordre;

INSERT INTO public.sc_series (id, nom, categorie, description, ordre) VALUES
  ('a1',  'A1',  'litteraire',        'Dominante Latin · Grec · Littérature',                 10),
  ('a2',  'A2',  'litteraire',        'Dominante Latin · Langue vivante II · Littérature',     20),
  ('a3',  'A3',  'litteraire',        'Dominante Latin · Littérature',                         30),
  ('a4',  'A4',  'litteraire',        'Dominante Langue vivante II · Philosophie · Littérature',40),
  ('a5',  'A5',  'litteraire',        'Dominante LV II · LV III · Littérature',                50),
  ('abi', 'ABI', 'litteraire',        'Dominante Intensive English · Littérature · LV II',     60),
  ('c',   'C',   'scientifique',      'Dominante Mathématiques · Physique · Chimie · Informatique', 70),
  ('d',   'D',   'scientifique',      'Dominante SVTEEHB · Mathématiques · Chimie · Informatique',  80),
  ('e',   'E',   'scientifique',      'Dominante Mathématiques · Technologie mécanique',       90),
  ('ti',  'TI',  'scientifique',      'Dominante Informatique (algo, SI, réseaux, maintenance)',100),
  ('sh',  'SH',  'sciences_humaines', 'Dominante Géographie · Histoire · Littérature · Philosophie', 110),
  ('ac',  'AC',  'arts',              'Dominante Arts cinématographiques',                     120)
ON CONFLICT (id) DO UPDATE
  SET nom = EXCLUDED.nom, categorie = EXCLUDED.categorie,
      description = EXCLUDED.description, ordre = EXCLUDED.ordre;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) COLONNES SUR LES TABLES EXISTANTES
-- ─────────────────────────────────────────────────────────────────────────────

-- subjects : métadonnées du second cycle (NULL = comportement classique inchangé)
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS sc_groupe       text;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS sc_groupe_ordre integer;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS charge_horaire  numeric;

-- classes : code série de la classe (alimente l'auto-configuration)
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS serie text;

-- schools.bulletin_engine : ajoute 'minesec' (moteurs référentiels résolus par
-- niveau : APC en 1er cycle, SC-MINESEC en 2nd cycle).
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS bulletin_engine text NOT NULL DEFAULT 'classic';
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_bulletin_engine_chk;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_bulletin_engine_chk
  CHECK (bulletin_engine IN ('classic', 'apc_minesec', 'minesec'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RLS — référentiel en lecture pour tout utilisateur authentifié
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sc_referentiel_versions','sc_series','sc_groupes','sc_matieres','sc_serie_matieres'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "sc ref read" ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY "sc ref read" ON public.%I FOR SELECT TO authenticated USING (true);', t);
  END LOOP;
END $$;

-- ============================================================================
-- FIN — Ensuite : importer l'arrêté (scripts/import-sc-referentiel.mjs ou le
-- .sql généré), puis UPDATE schools SET bulletin_engine='minesec' WHERE id='...'.
-- ============================================================================
