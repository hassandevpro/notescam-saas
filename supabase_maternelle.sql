-- ============================================================================
-- MOTEUR « MATERNELLE » (MINEDUB Cameroun) — Phase 1 (fondations)
-- ============================================================================
-- Modèle pédagogique officiel de la maternelle camerounaise :
--   Niveau (PS/MS/GS) → Domaine pédagogique → Observation (A / ECA / NA)
--
-- PAS de note numérique, PAS de moyenne, PAS de rang. L'évaluation est un NIVEAU
-- D'ACQUISITION (A = Acquis, ECA = En cours d'acquisition, NA = Non acquis) saisi
-- par (élève, domaine, trimestre), assorti d'une observation pédagogique.
--
-- Deux familles de tables (patron identique à supabase_apc_minesec.sql) :
--   • RÉFÉRENTIEL (global, lecture authentifiée, écriture service role) — les 8
--     domaines officiels + niveaux. Slugs stables, seed idempotent.
--   • TRANSACTIONNEL (par école, RLS scopée school_id) — observations & bulletins.
--
-- Réutilise public.apc_trimestres (t1/t2/t3) — table canonique des trimestres.
-- À EXÉCUTER dans Supabase → SQL Editor. Idempotent (rejouable sans risque).
-- Prérequis : supabase_apc_minesec.sql (pour apc_trimestres). Sinon décommenter :
--   CREATE TABLE IF NOT EXISTS public.apc_trimestres (id text PRIMARY KEY, numero int NOT NULL UNIQUE);
--   INSERT INTO public.apc_trimestres (id,numero) VALUES ('t1',1),('t2',2),('t3',3)
--     ON CONFLICT (id) DO UPDATE SET numero=EXCLUDED.numero;
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) DRAPEAUX D'ÉTABLISSEMENT & SURCHARGE PAR CLASSE
-- ─────────────────────────────────────────────────────────────────────────────
-- 'minedub' résout maternelle (PS/MS/GS) + APC primaire (SIL…CM2) selon le niveau.
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_bulletin_engine_chk;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_bulletin_engine_chk
  CHECK (bulletin_engine IN
    ('classic','officiel','apc_minesec','minesec','minedub','maternelle','apc_primaire'));

-- Surcharge de moteur PAR CLASSE (null = hérite de schools.bulletin_engine).
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS bulletin_engine text;

-- Lien optionnel matière↔domaine maternelle (matérialisation UI ; cf. matAutoConfig).
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS mat_domaine_id text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) RÉFÉRENTIEL (global)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mat_referentiel_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL DEFAULT 'CM',
  label        text NOT NULL,
  source       text,
  imported_at  timestamptz NOT NULL DEFAULT now(),
  imported_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actif        boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.mat_niveaux (
  id           text PRIMARY KEY,        -- 'ps' | 'ms' | 'gs'
  country_code text NOT NULL DEFAULT 'CM',
  nom          text NOT NULL,
  ordre        integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.mat_domaines (
  id           text PRIMARY KEY,        -- slug stable
  country_code text NOT NULL DEFAULT 'CM',
  code         text,                    -- 'D1'..'D8'
  intitule     text NOT NULL,
  ordre        integer NOT NULL,
  actif        boolean NOT NULL DEFAULT true
);

-- Sous-objectifs observables (extensibilité). Vide ⇒ observation au niveau domaine.
CREATE TABLE IF NOT EXISTS public.mat_objectifs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domaine_id             text NOT NULL REFERENCES public.mat_domaines(id) ON DELETE CASCADE,
  niveau_id              text REFERENCES public.mat_niveaux(id) ON DELETE CASCADE, -- null = tous niveaux
  ordre                  integer NOT NULL DEFAULT 1,
  intitule               text NOT NULL,
  actif                  boolean NOT NULL DEFAULT true,
  referentiel_version_id uuid REFERENCES public.mat_referentiel_versions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS mat_objectifs_lookup
  ON public.mat_objectifs (domaine_id, niveau_id) WHERE actif = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) SEED DE LA STRUCTURE FIXE (niveaux + 8 domaines officiels)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.mat_niveaux (id, nom, ordre) VALUES
  ('ps','Petite Section',1), ('ms','Moyenne Section',2), ('gs','Grande Section',3)
ON CONFLICT (id) DO UPDATE SET nom = EXCLUDED.nom, ordre = EXCLUDED.ordre;

INSERT INTO public.mat_domaines (id, code, intitule, ordre) VALUES
  ('langage_communication','D1','Langage et communication',1),
  ('prelecture_preecriture','D2','Prélecture et préécriture',2),
  ('prenumeration_logique','D3','Pré-numération et raisonnement logique',3),
  ('psychomotricite','D4','Psychomotricité',4),
  ('decouverte_monde','D5','Découverte du monde',5),
  ('vie_sociale_affective','D6','Vie sociale et affective',6),
  ('activites_artistiques','D7','Activités artistiques',7),
  ('autonomie_personnelle','D8','Autonomie personnelle',8)
ON CONFLICT (id) DO UPDATE
  SET code = EXCLUDED.code, intitule = EXCLUDED.intitule, ordre = EXCLUDED.ordre;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) TRANSACTIONNEL (par école)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mat_observations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id)  ON DELETE CASCADE,
  eleve_id        uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  domaine_id      text NOT NULL REFERENCES public.mat_domaines(id),
  trimestre_id    text NOT NULL REFERENCES public.apc_trimestres(id),
  niveau_acquis   text NOT NULL CHECK (niveau_acquis IN ('A','ECA','NA')),
  observation     text,
  enseignant_id   uuid,
  date_saisie     timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz,
  version         integer NOT NULL DEFAULT 1,
  device_id       text,
  CONSTRAINT mat_observations_uniq UNIQUE (eleve_id, domaine_id, trimestre_id)
);
CREATE INDEX IF NOT EXISTS mat_observations_school  ON public.mat_observations(school_id);
CREATE INDEX IF NOT EXISTS mat_observations_student ON public.mat_observations(eleve_id);

CREATE TABLE IF NOT EXISTS public.mat_bulletins (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             uuid NOT NULL REFERENCES public.schools(id)  ON DELETE CASCADE,
  eleve_id              uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  trimestre_id          text NOT NULL REFERENCES public.apc_trimestres(id),
  appreciation_generale text,
  decision              text,           -- ex. 'Passe en GS' | 'Admis au SIL'
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz,
  version               integer NOT NULL DEFAULT 1,
  device_id             text,
  CONSTRAINT mat_bulletins_uniq UNIQUE (eleve_id, trimestre_id)
);
CREATE INDEX IF NOT EXISTS mat_bulletins_school ON public.mat_bulletins(school_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- 4a) Référentiel : lecture authentifiée, écriture service role uniquement.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mat_referentiel_versions','mat_niveaux','mat_domaines','mat_objectifs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "mat ref read" ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY "mat ref read" ON public.%I FOR SELECT TO authenticated USING (true);', t);
  END LOOP;
END $$;

-- 4b) Transactionnel : lecture/écriture scopée à l'école (calqué sur apc_notes).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mat_observations','mat_bulletins'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "mat sel" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "mat ins" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "mat upd" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "mat del" ON public.%I;', t);
    EXECUTE format($p$CREATE POLICY "mat sel" ON public.%I FOR SELECT USING (
      school_id IN (SELECT school_id FROM public.school_users WHERE user_id=auth.uid() AND active=true));$p$, t);
    EXECUTE format($p$CREATE POLICY "mat ins" ON public.%I FOR INSERT WITH CHECK (
      school_id IN (SELECT school_id FROM public.school_users WHERE user_id=auth.uid() AND active=true));$p$, t);
    EXECUTE format($p$CREATE POLICY "mat upd" ON public.%I FOR UPDATE USING (
      school_id IN (SELECT school_id FROM public.school_users WHERE user_id=auth.uid() AND active=true));$p$, t);
    EXECUTE format($p$CREATE POLICY "mat del" ON public.%I FOR DELETE USING (
      school_id IN (SELECT school_id FROM public.school_users WHERE user_id=auth.uid() AND active=true));$p$, t);
  END LOOP;
END $$;

-- ============================================================================
-- FIN — Bascule d'une école : UPDATE schools SET bulletin_engine='minedub'
-- (ou 'maternelle') WHERE id='...'. Les domaines s'associent automatiquement à
-- la création d'une classe PS/MS/GS (src/lib/matAutoConfig.js).
-- ============================================================================
