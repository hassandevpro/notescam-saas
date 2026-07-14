-- ============================================================
-- NotesCam — DÉBLOCAGE des lignes budgétaires épuisées
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_budgets.sql + supabase_sync_phase2.sql.
-- ============================================================
--
-- Quand une ligne (chapitre) est épuisée, toute nouvelle dépense est bloquée par
-- l'app. Le demandeur crée une DEMANDE DE DÉBLOCAGE. Le Coordonnateur Général ou
-- la Fondatrice décident : refuser | autoriser exceptionnellement | augmenter le
-- budget. Chaque demande PORTE sa décision (qui, quoi, quand) -> historique des
-- décisions (statut ≠ pending = décision prise, ligne conservée = trace).
--
--   status : pending | refused | authorized | increased
--   authorized : allocation EXCEPTIONNELLE (relève le plafond, planifié inchangé)
--   increased  : le planifié du chapitre est augmenté (budget_chapters.planned_amount)

CREATE TABLE IF NOT EXISTS budget_unlock_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  budget_id         uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  budget_chapter_id uuid REFERENCES budget_chapters(id) ON DELETE SET NULL,
  requested_amount  bigint NOT NULL DEFAULT 0,   -- montant de marge demandé
  reason            text,                          -- justification du demandeur
  requester         text,
  requested_by      text,                          -- user_id du demandeur
  status            text NOT NULL DEFAULT 'pending',
  granted_amount    bigint,                        -- marge accordée (authorized/increased)
  decision_note     text,
  decided_by        text,                          -- nom du décideur
  decided_by_id     text,                          -- user_id du décideur
  decided_role      text,                          -- rôle ayant décidé (coordonnateur_general | fondatrice)
  decided_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz
);
CREATE INDEX IF NOT EXISTS bur_budget_idx  ON budget_unlock_requests (budget_id);
CREATE INDEX IF NOT EXISTS bur_school_idx  ON budget_unlock_requests (school_id, status);

-- ── RLS : isolation par établissement ─────────────────────────────────────────
ALTER TABLE budget_unlock_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_unlock_rw ON budget_unlock_requests;
CREATE POLICY budget_unlock_rw ON budget_unlock_requests
  FOR ALL
  USING     (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));

-- ── Colonnes + triggers de synchronisation continue (Phase 2) ─────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_unlock_requests'] LOOP
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
