-- ============================================================
-- NotesCam — BUDGETS : modèle hiérarchique CIBLE (annual → period → sector)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert : supabase_budgets.sql, supabase_active_period.sql (academic_periods),
--            supabase_school_units.sql (school_units), supabase_sync_phase2.sql.
-- ============================================================
--
-- Un budget devient un NŒUD arborescent typé par `tier` :
--   annual  → racine UNIQUE par (école, année). Porte `envelope_amount` (plafond).
--   period  → enfant d'un `annual`, rattaché à une `academic_periods` (même école +
--             même année). Porte `envelope_amount`. Σ enveloppes de période ≤ annuel.
--   sector  → enfant d'un `period`, rattaché à une `school_units` (même école).
--             Porte `allocation_pct` (+ `sector_amount` résolu, montant ET %).
--             Σ allocations sectorielles d'une période = 100 % avant activation.
--
-- `tier` NULL = ancien budget « à plat » (transitoire). Les contraintes de forme
-- et de cohérence ne s'appliquent QUE lorsque `tier` est renseigné → zéro
-- régression pour les lignes héritées (l'app migre en P4, colonnes retirées en P7).

-- ── 1) Colonnes de hiérarchie (nullables → transitoires) ──────────────────────
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS tier               text;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS parent_budget_id   uuid REFERENCES budgets(id) ON DELETE CASCADE;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS academic_period_id uuid REFERENCES academic_periods(id) ON DELETE RESTRICT;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS school_unit_id     uuid REFERENCES school_units(id) ON DELETE RESTRICT;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS envelope_amount    bigint;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS allocation_pct     numeric;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS sector_amount      bigint;

-- Le modèle à plat n'est plus obligatoire (les nœuds typés ne remplissent pas ces colonnes).
ALTER TABLE budgets ALTER COLUMN period_type DROP NOT NULL;
ALTER TABLE budgets ALTER COLUMN sector      DROP NOT NULL;

CREATE INDEX IF NOT EXISTS budgets_parent_idx ON budgets(parent_budget_id);

-- ── 2) Contraintes de FORME par niveau (CHECK — idempotentes) ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budgets_tier_shape_chk') THEN
    ALTER TABLE budgets ADD CONSTRAINT budgets_tier_shape_chk CHECK (
      tier IS NULL OR (
        tier IN ('annual','period','sector')
        AND (allocation_pct IS NULL OR (allocation_pct >= 0 AND allocation_pct <= 100))
        AND (envelope_amount IS NULL OR envelope_amount >= 0)
        AND (sector_amount   IS NULL OR sector_amount   >= 0)
        AND (tier <> 'annual' OR (parent_budget_id IS NULL AND academic_period_id IS NULL AND school_unit_id IS NULL
             AND envelope_amount IS NOT NULL AND allocation_pct IS NULL AND sector_amount IS NULL))
        AND (tier <> 'period' OR (parent_budget_id IS NOT NULL AND academic_period_id IS NOT NULL AND school_unit_id IS NULL
             AND envelope_amount IS NOT NULL AND allocation_pct IS NULL AND sector_amount IS NULL))
        AND (tier <> 'sector' OR (parent_budget_id IS NOT NULL AND school_unit_id IS NOT NULL AND academic_period_id IS NULL
             AND allocation_pct IS NOT NULL AND envelope_amount IS NULL))
      )
    );
  END IF;
END $$;

-- ── 3) Unicité LOGIQUE des enveloppes (index partiels — n'affectent pas tier NULL) ─
CREATE UNIQUE INDEX IF NOT EXISTS budgets_annual_unique ON budgets(school_id, academic_year)      WHERE tier='annual';
CREATE UNIQUE INDEX IF NOT EXISTS budgets_period_unique ON budgets(parent_budget_id, academic_period_id) WHERE tier='period';
CREATE UNIQUE INDEX IF NOT EXISTS budgets_sector_unique ON budgets(parent_budget_id, school_unit_id)     WHERE tier='sector';

-- ── 4) Cohérence inter-lignes + garde d'activation (triggers) ─────────────────
CREATE OR REPLACE FUNCTION public.budgets_hierarchy_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.tier IS NULL THEN RETURN NEW; END IF;              -- lignes héritées : non contraintes

  IF NEW.parent_budget_id IS NOT NULL AND NEW.parent_budget_id = NEW.id THEN
    RAISE EXCEPTION 'budget: un budget ne peut être son propre parent';
  END IF;

  IF NEW.tier = 'period' THEN
    IF NOT EXISTS (SELECT 1 FROM budgets p WHERE p.id = NEW.parent_budget_id AND p.tier='annual'
                     AND p.school_id = NEW.school_id AND p.academic_year = NEW.academic_year) THEN
      RAISE EXCEPTION 'budget période: le parent doit être un budget annuel du même établissement et de la même année';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM academic_periods ap WHERE ap.id = NEW.academic_period_id
                     AND ap.school_id = NEW.school_id AND ap.school_year = NEW.academic_year) THEN
      RAISE EXCEPTION 'budget période: la période académique doit appartenir au même établissement et à la même année';
    END IF;
  ELSIF NEW.tier = 'sector' THEN
    IF NOT EXISTS (SELECT 1 FROM budgets p WHERE p.id = NEW.parent_budget_id AND p.tier='period'
                     AND p.school_id = NEW.school_id AND p.academic_year = NEW.academic_year) THEN
      RAISE EXCEPTION 'budget secteur: le parent doit être une enveloppe de période du même établissement et de la même année';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM school_units u WHERE u.id = NEW.school_unit_id AND u.school_id = NEW.school_id) THEN
      RAISE EXCEPTION 'budget secteur: l''unité doit appartenir au même établissement';
    END IF;
  END IF;

  -- Garde d'ACTIVATION : Σ des enfants contrôlée avant de passer `active`.
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    IF NEW.tier = 'period' THEN
      IF ABS(COALESCE((SELECT SUM(allocation_pct) FROM budgets s WHERE s.parent_budget_id = NEW.id AND s.tier='sector'), 0) - 100) > 0.01 THEN
        RAISE EXCEPTION 'activation période: la somme des allocations sectorielles doit être égale à 100%%';
      END IF;
      IF COALESCE((SELECT SUM(envelope_amount) FROM budgets pr WHERE pr.parent_budget_id = NEW.parent_budget_id AND pr.tier='period'), 0)
         > COALESCE((SELECT envelope_amount FROM budgets a WHERE a.id = NEW.parent_budget_id), 0) THEN
        RAISE EXCEPTION 'activation période: la somme des enveloppes de période dépasse le budget annuel';
      END IF;
    ELSIF NEW.tier = 'annual' THEN
      IF COALESCE((SELECT SUM(envelope_amount) FROM budgets pr WHERE pr.parent_budget_id = NEW.id AND pr.tier='period'), 0)
         > COALESCE(NEW.envelope_amount, 0) THEN
        RAISE EXCEPTION 'activation annuel: la somme des enveloppes de période dépasse le budget annuel';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_budgets_hierarchy_guard ON budgets;
CREATE TRIGGER trg_budgets_hierarchy_guard
  BEFORE INSERT OR UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION public.budgets_hierarchy_guard();

-- ── 5) Nouvelles tables : réallocation + révision annuelle ────────────────────
CREATE TABLE IF NOT EXISTS budget_reallocations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year     text NOT NULL,
  source_budget_id  uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  dest_budget_id    uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  amount            bigint NOT NULL DEFAULT 0,
  reason            text,
  receipt           text,
  requester         text,
  requested_by      text,
  status            text NOT NULL DEFAULT 'pending',  -- pending|approved|refused|applied
  source_before     bigint, source_after bigint,
  dest_before       bigint, dest_after   bigint,
  decision_note     text,
  decided_by        text, decided_by_id text, decided_role text, decided_at timestamptz,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz,
  CHECK (amount > 0),
  CHECK (source_budget_id <> dest_budget_id),
  CHECK (status IN ('pending','approved','refused','applied'))
);
CREATE INDEX IF NOT EXISTS budget_realloc_school_idx ON budget_reallocations(school_id, academic_year);
CREATE INDEX IF NOT EXISTS budget_realloc_source_idx ON budget_reallocations(source_budget_id);
CREATE INDEX IF NOT EXISTS budget_realloc_dest_idx   ON budget_reallocations(dest_budget_id);

CREATE TABLE IF NOT EXISTS budget_revisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year     text NOT NULL,
  annual_budget_id  uuid NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  initial_amount    bigint,
  old_amount        bigint,
  new_amount        bigint,
  reason            text,
  receipt           text,
  requester         text,
  requested_by      text,
  status            text NOT NULL DEFAULT 'pending',  -- pending|approved|refused|applied
  decision_note     text,
  decided_by        text, decided_by_id text, decided_role text, decided_at timestamptz,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz,
  CHECK (new_amount IS NULL OR new_amount >= 0),
  CHECK (status IN ('pending','approved','refused','applied'))
);
CREATE INDEX IF NOT EXISTS budget_revision_annual_idx ON budget_revisions(annual_budget_id);

-- ── 6) RLS : isolation par établissement (même modèle que les autres tables) ──
ALTER TABLE budget_reallocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_reallocations_rw ON budget_reallocations;
CREATE POLICY budget_reallocations_rw ON budget_reallocations
  FOR ALL
  USING     (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));

ALTER TABLE budget_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_revisions_rw ON budget_revisions;
CREATE POLICY budget_revisions_rw ON budget_revisions
  FOR ALL
  USING     (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));

-- ── 7) Colonnes + triggers de synchronisation continue (Phase 2) ──────────────
-- Réutilise public.touch_sync_row() / public.log_tombstone() (supabase_sync_phase2.sql).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_reallocations','budget_revisions'] LOOP
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
