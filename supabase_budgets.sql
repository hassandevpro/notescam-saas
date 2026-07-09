-- ============================================================
-- NotesCam — Module BUDGETS (prévisionnel) — 1re tranche
-- À coller dans : Supabase → SQL Editor → New query → Run
-- Idempotent.
-- ============================================================
--
-- Périmètre livré : cycle de vie des budgets (création / modification /
-- consultation / clôture). PAS de dépenses réelles ni de workflow de validation
-- (itérations suivantes — le modèle est extensible pour les accueillir).
--
-- Modèle :
--   budgets          = enveloppe prévisionnelle d'un établissement, caractérisée
--                      par une PÉRIODE (annuel/trimestriel/mensuel), un SECTEUR
--                      (maternelle, primaire, administration, transport…) et un
--                      STATUT (draft/active/closed).
--   budget_chapters  = chapitres budgétaires + sous-chapitres (parent_id), chacun
--                      avec un montant PRÉVU (recette prévue / dépense prévue).
--
-- Extensibilité future :
--   • dépenses réelles       -> table budget_expenses (FK budget_chapter_id) ;
--   • validation             -> colonnes/table d'approbation sur budgets ;
--   • rapports               -> lecture chapitres + réalisé.

CREATE TABLE IF NOT EXISTS budgets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year  text NOT NULL,                     -- ex. '2025-2026'
  period_type    text NOT NULL DEFAULT 'annuel',    -- 'annuel'|'trimestriel'|'mensuel'
  period_ref     integer,                           -- trimestre 1..3 / mois 1..12 ; NULL en annuel
  sector         text NOT NULL DEFAULT 'general',   -- secteur budgétaire (liste ouverte)
  label          text NOT NULL,
  status         text NOT NULL DEFAULT 'draft',     -- 'draft'|'active'|'closed'
  notes          text,
  closed_at      timestamptz,
  closed_by      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);
CREATE INDEX IF NOT EXISTS budgets_school_idx ON budgets (school_id, academic_year);

CREATE TABLE IF NOT EXISTS budget_chapters (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  budget_id      uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  -- Sous-chapitre : parent_id pointe le chapitre parent (NULL = chapitre racine).
  parent_id      uuid REFERENCES budget_chapters(id) ON DELETE CASCADE,
  code           text,                              -- code comptable/chapitre (facultatif)
  label          text NOT NULL,
  kind           text NOT NULL DEFAULT 'depense',   -- 'recette'|'depense' (prévisionnel)
  planned_amount bigint NOT NULL DEFAULT 0,         -- montant PRÉVU (unité monétaire de l'école)
  position       integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);
CREATE INDEX IF NOT EXISTS budget_chapters_budget_idx ON budget_chapters (budget_id);
CREATE INDEX IF NOT EXISTS budget_chapters_parent_idx ON budget_chapters (parent_id);

-- ── RLS : isolation par établissement (même modèle que les autres tables) ──────
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budgets_rw ON budgets;
CREATE POLICY budgets_rw ON budgets
  FOR ALL
  USING     (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));

ALTER TABLE budget_chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_chapters_rw ON budget_chapters;
CREATE POLICY budget_chapters_rw ON budget_chapters
  FOR ALL
  USING     (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));

-- ── Colonnes + triggers de synchronisation continue (Phase 2) ─────────────────
-- Réutilise les fonctions public.touch_sync_row() / public.log_tombstone()
-- créées par supabase_sync_phase2.sql (à exécuter au préalable).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budgets','budget_chapters'] LOOP
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
