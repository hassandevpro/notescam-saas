-- ============================================================================
-- MOTEUR DE BULLETIN « APC_MINISTERIEL_MINESEC » — Phase 1 (fondations)
-- ============================================================================
-- Modèle pédagogique officiel du premier cycle secondaire camerounais :
--   Cycle → Classe → Trimestre → Séquence → Matière → Compétence → Note
--
-- Une compétence est attachée à (cycle, classe, trimestre, matière). Elle est
-- HÉRITÉE par les DEUX séquences du trimestre (S1+S2→T1, S3+S4→T2, S5+S6→T3)
-- SANS duplication : la note porte le couple (competence_id, sequence_id).
--
-- Deux familles de tables :
--   • RÉFÉRENTIEL (global, partagé, lecture seule pour les écoles) — le contenu
--     officiel MINESEC. Clés textuelles stables (slugs) pour un seed idempotent.
--   • TRANSACTIONNEL (par école, RLS scopée school_id) — notes & bulletins.
--
-- À EXÉCUTER dans Supabase → SQL Editor → New query → Run.
-- Idempotent : rejouable sans risque (IF NOT EXISTS / ON CONFLICT / DROP POLICY).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) TABLES DE RÉFÉRENTIEL (structure pédagogique fixe + contenu officiel)
-- ─────────────────────────────────────────────────────────────────────────────

-- Versions de référentiel : chaque (ré)import = une version ; on désactive
-- l'ancienne. Permet l'historique des réformes ministérielles.
CREATE TABLE IF NOT EXISTS public.apc_referentiel_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label        text NOT NULL,
  source       text,
  imported_at  timestamptz NOT NULL DEFAULT now(),
  imported_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actif        boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.apc_cycles (
  id   text PRIMARY KEY,        -- slug stable, ex. 'premier_cycle'
  nom  text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.apc_classes (
  id        text PRIMARY KEY,   -- slug stable, ex. '6e'
  cycle_id  text NOT NULL REFERENCES public.apc_cycles(id) ON DELETE CASCADE,
  nom       text NOT NULL,
  niveau    integer NOT NULL    -- 6e=6, 5e=5, 4e=4, 3e=3 (ordre d'affichage)
);

CREATE TABLE IF NOT EXISTS public.apc_trimestres (
  id      text PRIMARY KEY,     -- 't1' | 't2' | 't3'
  numero  integer NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.apc_sequences (
  id            text PRIMARY KEY,  -- 's1'..'s6'
  numero        integer NOT NULL UNIQUE,
  trimestre_id  text NOT NULL REFERENCES public.apc_trimestres(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.apc_matieres (
  id           text PRIMARY KEY,  -- slug stable, ex. 'francais'
  nom          text NOT NULL,
  coefficient  numeric NOT NULL DEFAULT 1,
  optionnelle  boolean NOT NULL DEFAULT false,
  ordre        integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.apc_competences (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id               text NOT NULL REFERENCES public.apc_cycles(id)     ON DELETE CASCADE,
  classe_id              text NOT NULL REFERENCES public.apc_classes(id)    ON DELETE CASCADE,
  trimestre_id           text NOT NULL REFERENCES public.apc_trimestres(id) ON DELETE CASCADE,
  matiere_id             text NOT NULL REFERENCES public.apc_matieres(id)   ON DELETE CASCADE,
  ordre                  integer NOT NULL DEFAULT 1,
  intitule               text NOT NULL,
  coefficient            numeric,              -- NULL ⇒ poids 1 (cf. moteur)
  actif                  boolean NOT NULL DEFAULT true,
  referentiel_version_id uuid REFERENCES public.apc_referentiel_versions(id) ON DELETE SET NULL,
  -- Clé pédagogique : une compétence est unique dans (classe, trimestre, matière, ordre).
  -- Jamais réutilisable dans une autre classe / un autre trimestre / une autre matière.
  CONSTRAINT apc_competences_uniq UNIQUE (classe_id, trimestre_id, matiere_id, ordre)
);

CREATE INDEX IF NOT EXISTS apc_competences_lookup
  ON public.apc_competences (classe_id, trimestre_id, matiere_id) WHERE actif = true;

-- Coefficient + ordre d'affichage d'une matière PAR CLASSE (le bulletin officiel
-- fixe le coef par classe : ex. Français = 6 en 6e/5e mais 4 en 4e/3e ; Sciences
-- en 6e/5e devient PCT + SVTEEHB en 4e/3e). Rempli par l'import du référentiel.
CREATE TABLE IF NOT EXISTS public.apc_classe_matieres (
  classe_id     text NOT NULL REFERENCES public.apc_classes(id)  ON DELETE CASCADE,
  matiere_id    text NOT NULL REFERENCES public.apc_matieres(id) ON DELETE CASCADE,
  coefficient   numeric NOT NULL DEFAULT 1,
  ordre         integer NOT NULL DEFAULT 0,
  optionnelle   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (classe_id, matiere_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) SEED DE LA STRUCTURE FIXE (cycle, classes, trimestres, séquences, matières)
--    AUCUNE compétence n'est seedée ici : le contenu officiel arrive par import.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.apc_cycles (id, nom) VALUES
  ('premier_cycle', 'Premier cycle')
ON CONFLICT (id) DO UPDATE SET nom = EXCLUDED.nom;

INSERT INTO public.apc_classes (id, cycle_id, nom, niveau) VALUES
  ('6e', 'premier_cycle', '6ème', 6),
  ('5e', 'premier_cycle', '5ème', 5),
  ('4e', 'premier_cycle', '4ème', 4),
  ('3e', 'premier_cycle', '3ème', 3)
ON CONFLICT (id) DO UPDATE SET nom = EXCLUDED.nom, niveau = EXCLUDED.niveau, cycle_id = EXCLUDED.cycle_id;

INSERT INTO public.apc_trimestres (id, numero) VALUES
  ('t1', 1), ('t2', 2), ('t3', 3)
ON CONFLICT (id) DO UPDATE SET numero = EXCLUDED.numero;

INSERT INTO public.apc_sequences (id, numero, trimestre_id) VALUES
  ('s1', 1, 't1'), ('s2', 2, 't1'),
  ('s3', 3, 't2'), ('s4', 4, 't2'),
  ('s5', 5, 't3'), ('s6', 6, 't3')
ON CONFLICT (id) DO UPDATE SET numero = EXCLUDED.numero, trimestre_id = EXCLUDED.trimestre_id;

-- Matières concernées (coefficients indicatifs, ajustables par import/réforme).
-- `optionnelle = true` ⇒ activée selon l'établissement (langues, latin, grec…).
INSERT INTO public.apc_matieres (id, nom, coefficient, optionnelle, ordre) VALUES
  ('anglais',        'Anglais',                              4, false, 10),
  ('francais',       'Français',                             4, false, 20),
  ('mathematiques',  'Mathématiques',                        4, false, 30),
  ('informatique',   'Informatique',                         2, false, 40),
  ('histoire',       'Histoire',                             1, false, 50),
  ('geographie',     'Géographie',                           1, false, 60),
  ('sciences',       'Sciences',                             2, false, 70),
  ('svteehb',        'SVTEEHB',                              2, false, 80),
  ('pct',            'PCT',                                  2, false, 90),
  ('eps',            'EPS',                                  2, false, 100),
  ('esf',            'ESF',                                  1, true,  110),
  ('travail_manuel', 'Travail Manuel',                       1, false, 120),
  ('eac',            'Education Artistique et Culturelle',   1, false, 130),
  ('ecm',            'Education à la Citoyenneté et à la Morale', 1, false, 140),
  ('cultures_nat',   'Cultures Nationales',                  1, false, 150),
  ('langues_nat',    'Langues Nationales',                   1, true,  160),
  ('latin',          'Latin',                                2, true,  170),
  ('grec',           'Grec',                                 2, true,  180),
  ('allemand',       'Allemand',                             2, true,  190),
  ('arabe',          'Arabe',                                2, true,  200),
  ('espagnol',       'Espagnol',                             2, true,  210),
  ('italien',        'Italien',                              2, true,  220),
  ('chinois',        'Chinois',                              2, true,  230)
ON CONFLICT (id) DO UPDATE
  SET nom = EXCLUDED.nom, coefficient = EXCLUDED.coefficient,
      optionnelle = EXCLUDED.optionnelle, ordre = EXCLUDED.ordre;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) TABLES TRANSACTIONNELLES (par école)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.apc_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  eleve_id       uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  competence_id  uuid NOT NULL REFERENCES public.apc_competences(id) ON DELETE CASCADE,
  sequence_id    text NOT NULL REFERENCES public.apc_sequences(id),
  enseignant_id  uuid,
  note           numeric,
  appreciation   text,
  date_saisie    timestamptz NOT NULL DEFAULT now(),
  -- colonnes de synchronisation continue LAN ↔ Cloud (cf. autres tables)
  updated_at     timestamptz,
  version        integer NOT NULL DEFAULT 1,
  device_id      text,
  CONSTRAINT apc_notes_uniq UNIQUE (eleve_id, competence_id, sequence_id)
);

CREATE INDEX IF NOT EXISTS apc_notes_school  ON public.apc_notes(school_id);
CREATE INDEX IF NOT EXISTS apc_notes_student ON public.apc_notes(eleve_id);

CREATE TABLE IF NOT EXISTS public.apc_bulletins (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id              uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  eleve_id               uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  trimestre_id           text NOT NULL REFERENCES public.apc_trimestres(id),
  moyenne_generale       numeric,
  cote                   text,
  rang                   integer,
  appreciation_generale  text,
  decision_conseil       text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz,
  version                integer NOT NULL DEFAULT 1,
  device_id              text,
  CONSTRAINT apc_bulletins_uniq UNIQUE (eleve_id, trimestre_id)
);

CREATE INDEX IF NOT EXISTS apc_bulletins_school ON public.apc_bulletins(school_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) DRAPEAU D'ÉTABLISSEMENT — quel moteur de bulletin
-- ─────────────────────────────────────────────────────────────────────────────
-- 'classic'     (défaut) : modèle Matière→Note actuel — comportement INCHANGÉ.
-- 'apc_minesec' : modèle par compétences (premier cycle camerounais).
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS bulletin_engine text NOT NULL DEFAULT 'classic';

-- NB : on inclut 'minesec' (second cycle) dès cette migration pour que l'ordre
-- d'exécution avec supabase_sc_minesec.sql n'ait aucune importance — les deux
-- convergent vers le même ensemble autorisé.
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_bulletin_engine_chk;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_bulletin_engine_chk
  CHECK (bulletin_engine IN
    ('classic','officiel','apc_minesec','minesec','minedub','maternelle','apc_primaire'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RLS
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a) Référentiel : LECTURE pour tout utilisateur authentifié, ÉCRITURE réservée
--     au service role (l'import admin passe par une fonction/clé service ; les
--     compétences ministérielles ne sont jamais modifiées depuis le client).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'apc_referentiel_versions','apc_cycles','apc_classes',
    'apc_trimestres','apc_sequences','apc_matieres','apc_competences','apc_classe_matieres'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "apc ref read" ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY "apc ref read" ON public.%I FOR SELECT TO authenticated USING (true);', t);
  END LOOP;
END $$;

-- 5b) Transactionnel : lecture/écriture scopée à l'école (calqué sur `grades`).
ALTER TABLE public.apc_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apc_notes: lecture par membres" ON public.apc_notes;
CREATE POLICY "apc_notes: lecture par membres"
  ON public.apc_notes FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

DROP POLICY IF EXISTS "apc_notes: insert par membres" ON public.apc_notes;
CREATE POLICY "apc_notes: insert par membres"
  ON public.apc_notes FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

DROP POLICY IF EXISTS "apc_notes: update par membres" ON public.apc_notes;
CREATE POLICY "apc_notes: update par membres"
  ON public.apc_notes FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

DROP POLICY IF EXISTS "apc_notes: delete par membres" ON public.apc_notes;
CREATE POLICY "apc_notes: delete par membres"
  ON public.apc_notes FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

ALTER TABLE public.apc_bulletins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apc_bulletins: lecture par membres" ON public.apc_bulletins;
CREATE POLICY "apc_bulletins: lecture par membres"
  ON public.apc_bulletins FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

DROP POLICY IF EXISTS "apc_bulletins: insert par membres" ON public.apc_bulletins;
CREATE POLICY "apc_bulletins: insert par membres"
  ON public.apc_bulletins FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

DROP POLICY IF EXISTS "apc_bulletins: update par membres" ON public.apc_bulletins;
CREATE POLICY "apc_bulletins: update par membres"
  ON public.apc_bulletins FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

DROP POLICY IF EXISTS "apc_bulletins: delete par membres" ON public.apc_bulletins;
CREATE POLICY "apc_bulletins: delete par membres"
  ON public.apc_bulletins FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

-- ============================================================================
-- FIN — Bascule d'une école : UPDATE schools SET bulletin_engine='apc_minesec'
-- WHERE id = '...'; puis importer un référentiel officiel via le script
-- scripts/import-apc-referentiel.mjs (voir docs/APC_REFERENTIEL_FORMAT.md).
-- ============================================================================
