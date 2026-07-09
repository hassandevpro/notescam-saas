-- ============================================================
-- NotesCam — Module DÉPENSES (exécution budgétaire)
-- À coller dans : Supabase → SQL Editor → New query → Run
-- Idempotent. Requiert supabase_budgets.sql + supabase_sync_phase2.sql.
-- ============================================================
--
-- Chaque dépense est TOUJOURS rattachée à un budget (budget_id NOT NULL, dérivé
-- du chapitre budgétaire choisi). Le « budget restant » n'est PAS stocké ici :
-- il est recalculé à la lecture (planifié − engagé) — cf. lib/expenseEngine.js.
--
-- Champs métier : catégorie, sous-catégorie, chapitre budgétaire, secteur,
-- fournisseur, montant, demandeur, justificatif, statut.

CREATE TABLE IF NOT EXISTS budget_expenses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  -- Rattachement automatique au budget (via le chapitre). budget_id NOT NULL :
  -- une dépense sans budget n'existe pas. Le chapitre peut être détaché (SET NULL)
  -- sans perdre la dépense ni son imputation au budget.
  budget_id         uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  budget_chapter_id uuid REFERENCES budget_chapters(id) ON DELETE SET NULL,
  category          text,
  subcategory       text,
  sector            text,                          -- hérité du budget (dénormalisé pour le reporting)
  supplier          text,                          -- fournisseur
  amount            bigint NOT NULL DEFAULT 0,
  requester         text,                          -- demandeur
  receipt           text,                          -- justificatif (référence / lien)
  status            text NOT NULL DEFAULT 'draft', -- draft|submitted|approved|paid|rejected
  expense_date      date,
  notes             text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz
);
CREATE INDEX IF NOT EXISTS budget_expenses_budget_idx  ON budget_expenses (budget_id);
CREATE INDEX IF NOT EXISTS budget_expenses_chapter_idx ON budget_expenses (budget_chapter_id);
CREATE INDEX IF NOT EXISTS budget_expenses_school_idx  ON budget_expenses (school_id, status);

-- ── RLS : isolation par établissement ─────────────────────────────────────────
ALTER TABLE budget_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_expenses_rw ON budget_expenses;
CREATE POLICY budget_expenses_rw ON budget_expenses
  FOR ALL
  USING     (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));

-- ── Colonnes + triggers de synchronisation continue (Phase 2) ─────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_expenses'] LOOP
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
