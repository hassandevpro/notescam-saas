-- ============================================================================
-- PROGRAMME D'ÉDUCATION BILINGUE SPÉCIAL — premier cycle (fondations)
-- ============================================================================
-- Arrêté n°239-23/MINESEC du 14 juin 2023 — nature, durée et coefficients des
-- matières des classes du premier cycle de l'Enseignement Secondaire Général.
--   • section I-2 : sous-système francophone  → 6e, 5e, 4e, 3e
--   • section II-2 : sous-système anglophone  → Form 1 … Form 5
--
--   Classe → Série (sous-système) → Domaine → Matière → Coefficient → Charge → Note
--
-- TABLES DÉDIÉES, PAS DE RÉUTILISATION DES TABLES sc_* : l'import du référentiel
-- second cycle désactive la version précédente (sc_referentiel_versions.actif).
-- Loger le bilingue dans les mêmes tables ferait donc disparaître le référentiel
-- de l'arrêté 092/22 au premier import — et réciproquement. Les deux arrêtés sont
-- distincts et vivent leur vie séparément.
--
-- Le coefficient dépend de (série, classe, matière) et n'est JAMAIS stocké sur la
-- matière. La CHARGE HORAIRE est conservée pour l'affichage seul : elle ne sert
-- jamais de coefficient (l'arrêté lui-même les sépare — Travail Manuel : 2 h, coef 1).
--
-- Aucune valeur n'est codée en dur ici : tout vient de l'IMPORT de l'arrêté.
--
-- À EXÉCUTER dans Supabase → SQL Editor. Idempotent (rejouable sans effet de bord).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) RÉFÉRENTIEL (global, lecture authentifiée, écriture service role)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bil_referentiel_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label        text NOT NULL,
  source       text,
  imported_at  timestamptz NOT NULL DEFAULT now(),
  imported_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actif        boolean NOT NULL DEFAULT true
);

-- Séries = sous-systèmes du programme : 'bil_fr' et 'bil_en'.
CREATE TABLE IF NOT EXISTS public.bil_series (
  id           text PRIMARY KEY,
  nom          text NOT NULL,
  categorie    text NOT NULL DEFAULT 'bilingue_special',
  description  text,
  ordre        integer NOT NULL DEFAULT 0
);

-- Domaines d'apprentissage de l'arrêté (Langues et littératures, Sciences
-- humaines, Sciences et technologies, Arts et cultures nationales,
-- Développement personnel…). Libellés distincts par sous-système : l'arrêté dit
-- « Sciences humaines » côté francophone et « Sciences humaines et sociales »
-- côté anglophone — on ne les uniformise pas.
CREATE TABLE IF NOT EXISTS public.bil_groupes (
  id     text PRIMARY KEY,
  nom    text NOT NULL,
  ordre  integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.bil_matieres (
  id                    text PRIMARY KEY,
  nom                   text NOT NULL,
  code                  text,
  domaine_apprentissage text,
  ordre                 integer NOT NULL DEFAULT 0
);

-- Matrice (série × classe × matière) → coefficient, charge horaire, obligatoire.
-- `classe_id` : '6e'|'5e'|'4e'|'3e' (francophone) · 'form1'…'form5' (anglophone).
-- `obligatoire = false` → matière « au choix selon les orientations » (Form 4/5) :
-- jamais créée automatiquement sur une classe.
CREATE TABLE IF NOT EXISTS public.bil_serie_matieres (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serie_id               text NOT NULL REFERENCES public.bil_series(id)   ON DELETE CASCADE,
  classe_id              text NOT NULL,
  matiere_id             text NOT NULL REFERENCES public.bil_matieres(id) ON DELETE CASCADE,
  groupe_id              text NOT NULL REFERENCES public.bil_groupes(id),
  coefficient            numeric NOT NULL,
  charge_horaire         numeric,
  obligatoire            boolean NOT NULL DEFAULT true,
  actif                  boolean NOT NULL DEFAULT true,
  referentiel_version_id uuid REFERENCES public.bil_referentiel_versions(id) ON DELETE SET NULL,
  CONSTRAINT bil_serie_matieres_uniq UNIQUE (serie_id, classe_id, matiere_id)
);

CREATE INDEX IF NOT EXISTS bil_serie_matieres_lookup
  ON public.bil_serie_matieres (serie_id, classe_id) WHERE actif = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) DRAPEAU D'ÉTABLISSEMENT — ajout ADDITIF de 'bilingue_special'
-- ─────────────────────────────────────────────────────────────────────────────
-- La contrainte est reconstruite avec la liste COMPLÈTE des valeurs déjà admises
-- plus la nouvelle : aucune configuration existante n'est invalidée. Rejouable.
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_bulletin_engine_chk;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_bulletin_engine_chk
  CHECK (bulletin_engine IN
    ('classic','officiel','apc_minesec','minesec','minedub','maternelle','apc_primaire',
     'bilingue_special'));

-- Surcharge PAR CLASSE (une école ordinaire qui n'ouvre qu'une section bilingue).
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS bulletin_engine text;

-- Domaine + caractère obligatoire portés par la matière de classe, pour que le
-- bulletin se regroupe sans relire le référentiel.
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS bil_domaine       text;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS bil_domaine_ordre integer;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS bil_obligatoire   boolean;
-- `charge_horaire` existe déjà (créée par supabase_sc_minesec.sql) — on la
-- rajoute au cas où cette migration serait jouée en premier.
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS charge_horaire    numeric;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS — référentiel en lecture pour tout utilisateur authentifié
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bil_referentiel_versions','bil_series','bil_groupes','bil_matieres','bil_serie_matieres'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "bil ref read" ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY "bil ref read" ON public.%I FOR SELECT TO authenticated USING (true);', t);
  END LOOP;
END $$;

-- ============================================================================
-- FIN — Ensuite : importer l'arrêté
--   node scripts/bil-referentiel-to-sql.mjs \
--     examples/bilingue/referentiel-bilingue-special-premier-cycle.json \
--     supabase_bilingue_special_data.sql
-- puis, pour une école entièrement bilingue spéciale :
--   UPDATE schools SET bulletin_engine='bilingue_special' WHERE id='...';
-- ou, pour une seule section :
--   UPDATE classes SET bulletin_engine='bilingue_special' WHERE id='...';
-- ============================================================================
