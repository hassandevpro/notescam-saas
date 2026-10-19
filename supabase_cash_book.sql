-- ════════════════════════════════════════════════════════════════════════════
-- NotesCam — JOURNAL DE CAISSE (mouvements qui ne sont pas des dépenses)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert : supabase_school_units.sql, supabase_expenses.sql, supabase_sync_phase2.sql.
-- Miroir LAN : server/schema.sql.
-- ════════════════════════════════════════════════════════════════════════════
--
-- CE QUI MANQUAIT, ET POURQUOI. Les cahiers de caisse tenus par les écoles
-- (relevés « ORDRE / REPORT / ENTREES / DATES / SORTIES / MOTIFS / BALANCE »)
-- portent QUATRE natures d'écritures. NotesCam n'en représentait qu'une :
--
--   SORTIES ................. `budget_expenses`                     ✔ existait
--   ENTREES (dotation de la --
--     fondatrice, remise de
--     fonds à l'économe) .... AUCUNE TABLE                          ✘ manquait
--   REPORT de solde ......... AUCUNE TABLE                          ✘ manquait
--   TOTAL mensuel ........... contrôle, rien à stocker              — n/a
--
-- Faute d'un endroit pour les entrées, un solde de caisse était INCALCULABLE :
-- on connaissait les sorties sans connaître ce qui était entré. C'est ce trou
-- que cette table ferme — et RIEN D'AUTRE.
--
-- CE N'EST PAS UNE SECONDE COMPTABILITÉ. Les dépenses restent dans
-- `budget_expenses`, seule source de vérité de l'exécution budgétaire, et ne
-- sont PAS recopiées ici. Le solde de caisse se calcule en lisant les DEUX
-- tables (cf. src/lib/cashBookEngine.js) : une dépense enregistrée une fois est
-- comptée une fois.
--
-- UN REPORT N'EST PAS UNE RECETTE. `kind = 'report'` reprend le solde de la
-- période précédente : il POSITIONNE le solde d'ouverture, il ne l'augmente
-- pas. Le moteur le traite à part ; l'addition des entrées l'exclut. Deux
-- reports successifs sur un même mois ne cumuleraient donc rien.
--
-- SÉPARATION DES CAISSES. `school_unit_id` désigne l'unité pédagogique
-- (collège / primaire / maternelle) dont la caisse est tenue. NULL = caisse du
-- complexe. Les soldes ne se mélangent jamais : le moteur n'additionne que les
-- mouvements d'une même (école, unité).

CREATE TABLE IF NOT EXISTS public.cash_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- Caisse concernée. NULL = caisse du complexe (aucune unité).
  school_unit_id  uuid REFERENCES public.school_units(id) ON DELETE SET NULL,
  academic_year   text,
  date            date NOT NULL,
  -- 'report'               : solde repris de la période précédente (PAS une recette)
  -- 'approvisionnement'    : remise de fonds à la caisse (dotation, avance)
  -- 'recette_diverse'      : encaissement hors scolarité (location, vente…)
  -- 'transfert_entrant' /
  -- 'transfert_sortant'    : déplacement de fonds entre deux caisses de l'école
  -- 'retrait'              : sortie de fonds qui n'est PAS une dépense
  --                          (versement en banque, remise au fondateur)
  kind            text NOT NULL,
  amount          bigint NOT NULL DEFAULT 0,
  label           text,
  -- Référence d'ORIGINE telle qu'inscrite sur la pièce (n° d'ordre du cahier).
  reference       text,
  -- Solde inscrit EN FACE de l'écriture dans le document d'origine. Conservé
  -- tel quel, y compris s'il est faux : c'est la pièce qui fait foi, et un
  -- écart doit rester visible au lieu d'être corrigé en silence.
  source_balance  bigint,
  notes           text,
  -- ── Traçabilité d'import (reprise de documents) ──────────────────────────
  source_file     text,      -- ex. 'SORTIES DU COLLEGE.xlsx'
  source_row      integer,   -- ligne exacte dans la feuille
  import_batch    text,      -- lot d'import, pour savoir ce qui est venu ensemble
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz,
  CONSTRAINT cash_movements_kind_chk CHECK (kind IN (
    'report', 'approvisionnement', 'recette_diverse',
    'transfert_entrant', 'transfert_sortant', 'retrait')),
  CONSTRAINT cash_movements_amount_chk CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS cash_movements_school_idx ON public.cash_movements (school_id, date);
CREATE INDEX IF NOT EXISTS cash_movements_unit_idx   ON public.cash_movements (school_id, school_unit_id, date);
-- Index NON unique, à dessein : il sert à retrouver l'origine d'une écriture.
-- L'unicité, elle, est obtenue par l'IDENTIFIANT (cf. note ci-dessous), pas par
-- une contrainte de table.
CREATE INDEX IF NOT EXISTS cash_movements_source_idx ON public.cash_movements (school_id, source_file, source_row);

COMMENT ON TABLE public.cash_movements IS
  'Journal de caisse : entrées, reports et retraits. Les DÉPENSES restent dans budget_expenses et ne sont pas dupliquées ici.';
COMMENT ON COLUMN public.cash_movements.kind IS
  'report = solde d''ouverture repris, jamais une recette. Voir src/lib/cashBookEngine.js.';

-- ── RLS : même modèle que budget_expenses ────────────────────────────────────
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_movements_rw ON public.cash_movements;
CREATE POLICY cash_movements_rw ON public.cash_movements
  FOR ALL
  USING     (school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid()));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Traçabilité d'import sur les DÉPENSES                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Une dépense reprise d'un document doit dire D'OÙ elle vient : sans cela, on ne
-- peut ni la rapprocher de la pièce, ni distinguer une saisie d'un import, ni
-- relancer un import sans risquer de tout doubler.
ALTER TABLE public.budget_expenses ADD COLUMN IF NOT EXISTS source_file  text;
ALTER TABLE public.budget_expenses ADD COLUMN IF NOT EXISTS source_row   integer;
ALTER TABLE public.budget_expenses ADD COLUMN IF NOT EXISTS import_batch text;
-- Solde inscrit en face de la dépense dans le document d'origine (contrôle).
ALTER TABLE public.budget_expenses ADD COLUMN IF NOT EXISTS source_balance bigint;

CREATE INDEX IF NOT EXISTS budget_expenses_source_idx
  ON public.budget_expenses (school_id, source_file, source_row);

COMMENT ON COLUMN public.budget_expenses.source_file IS
  'Document d''origine d''une dépense reprise. NULL = saisie dans NotesCam.';

-- ── IDEMPOTENCE : PAS d'index unique, mais un identifiant DÉTERMINÉ ─────────
-- Un index unique sur (school_id, source_file, source_row) paraîtrait plus
-- direct. Il serait pourtant un piège : si la même reprise est faite côté LAN
-- et côté Cloud, les deux lignes portent des `id` différents et le push de
-- synchro échoue — pour la table ENTIÈRE, pas seulement pour la ligne fautive
-- (même raison que l'absence d'unique sur fee_payments.receipt_no, cf.
-- supabase_cash_control.sql).
--
-- L'import calcule donc l'`id` à partir de (school_id, source_file, source_row)
-- — UUID v5, cf. src/lib/sourceKey.js. Relancer l'import réécrit la MÊME ligne ;
-- deux côtés qui importent le même fichier produisent le MÊME id, et le
-- départage LWW habituel s'applique sans jamais créer de doublon.


-- ── Colonnes + triggers de synchronisation continue (Phase 2) ───────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cash_movements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS device_id text', t);
    IF to_regprocedure('public.touch_sync_row()') IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_sync_row()', t);
    END IF;
    IF to_regprocedure('public.log_tombstone()') IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_tomb_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER trg_tomb_%1$s AFTER DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.log_tombstone()', t);
    END IF;
  END LOOP;
END $$;


-- ── VÉRIFICATION ────────────────────────────────────────────────────────────
DO $$
DECLARE n_cols int; n_pol int;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'budget_expenses'
     AND column_name IN ('source_file', 'source_row', 'import_batch', 'source_balance');
  RAISE NOTICE 'budget_expenses : % / 4 colonnes de traçabilité présentes', n_cols;

  SELECT count(*) INTO n_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'cash_movements';
  RAISE NOTICE 'cash_movements : % policy RLS (attendu 1)', n_pol;
  IF n_pol = 0 THEN
    RAISE WARNING 'cash_movements sans policy : la table serait inaccessible aux utilisateurs.';
  END IF;
END $$;
