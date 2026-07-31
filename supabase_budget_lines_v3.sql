-- ============================================================
-- NotesCam — BUDGETS modèle CIBLE v3 (client 2026-07-24)
-- Annuel global → RUBRIQUES → LIGNES (montant annuel) réparties par PÉRIODE (%)
-- et par SECTEUR (%). Périodes budgétaires = table DÉDIÉE (découplée du calendrier
-- de notes / academic_periods).
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert : supabase_budgets.sql, supabase_school_units.sql, supabase_sync_phase2.sql.
-- Miroir LAN : server/schema.sql + server/budget-lines.sql.
-- ============================================================

-- ── 1) Colonnes ajoutées aux tables existantes ───────────────────────────────
ALTER TABLE budget_chapters ADD COLUMN IF NOT EXISTS scope  text;
ALTER TABLE budget_chapters ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

ALTER TABLE budget_expenses ADD COLUMN IF NOT EXISTS budget_period_id uuid;  -- FK ajoutée après création de budget_periods (cf. §5)
ALTER TABLE budget_expenses ADD COLUMN IF NOT EXISTS school_unit_id   uuid REFERENCES school_units(id) ON DELETE SET NULL; -- NULL = Complexe/Global

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_chapters_scope_chk') THEN
    ALTER TABLE budget_chapters ADD CONSTRAINT budget_chapters_scope_chk
      CHECK (scope IS NULL OR scope IN ('complex','sectors'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_chapters_status_chk') THEN
    ALTER TABLE budget_chapters ADD CONSTRAINT budget_chapters_status_chk
      CHECK (status IN ('draft','active','closed'));
  END IF;
END $$;

-- ── 2) Périodes budgétaires (configurées une fois par année) ─────────────────
CREATE TABLE IF NOT EXISTS budget_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year text NOT NULL,
  name          text NOT NULL,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  description   text,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  CHECK (end_date > start_date)
);
CREATE INDEX  IF NOT EXISTS idx_budget_periods_school ON budget_periods(school_id, academic_year);
CREATE UNIQUE INDEX IF NOT EXISTS budget_periods_name_unique ON budget_periods(school_id, academic_year, name);

-- ── 3) Répartition temporelle d'une ligne (% par période) ────────────────────
CREATE TABLE IF NOT EXISTS budget_line_periods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  budget_chapter_id uuid NOT NULL REFERENCES budget_chapters(id) ON DELETE CASCADE,
  budget_period_id  uuid NOT NULL REFERENCES budget_periods(id) ON DELETE RESTRICT,
  pct               numeric NOT NULL DEFAULT 0,
  amount            bigint,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz,
  CHECK (pct >= 0 AND pct <= 100),
  CHECK (amount IS NULL OR amount >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS budget_line_periods_unique ON budget_line_periods(budget_chapter_id, budget_period_id);
CREATE INDEX IF NOT EXISTS idx_blp_chapter ON budget_line_periods(budget_chapter_id);
CREATE INDEX IF NOT EXISTS idx_blp_period  ON budget_line_periods(budget_period_id);

-- ── 4) Répartition sectorielle d'une ligne (portée 'sectors') ────────────────
CREATE TABLE IF NOT EXISTS budget_line_sectors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  budget_chapter_id uuid NOT NULL REFERENCES budget_chapters(id) ON DELETE CASCADE,
  school_unit_id    uuid NOT NULL REFERENCES school_units(id) ON DELETE RESTRICT,
  pct               numeric NOT NULL DEFAULT 0,
  amount            bigint,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz,
  CHECK (pct >= 0 AND pct <= 100),
  CHECK (amount IS NULL OR amount >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS budget_line_sectors_unique ON budget_line_sectors(budget_chapter_id, school_unit_id);
CREATE INDEX IF NOT EXISTS idx_bls_chapter ON budget_line_sectors(budget_chapter_id);

-- ── 5) FK différée budget_expenses.budget_period_id (après création de la table) ─
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_expenses_period_fk') THEN
    ALTER TABLE budget_expenses ADD CONSTRAINT budget_expenses_period_fk
      FOREIGN KEY (budget_period_id) REFERENCES budget_periods(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ── 6) Gardes d'intégrité (triggers) — miroir de server/budget-lines.sql ─────
-- 6a) Chevauchement de périodes interdit dans une même (école, année).
CREATE OR REPLACE FUNCTION public.budget_periods_no_overlap() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM budget_periods p
     WHERE p.school_id = NEW.school_id AND p.academic_year = NEW.academic_year AND p.id <> NEW.id
       AND NEW.start_date < p.end_date AND NEW.end_date > p.start_date
  ) THEN
    RAISE EXCEPTION 'période budgétaire: chevauchement de dates avec une période existante';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_budget_periods_no_overlap ON budget_periods;
CREATE TRIGGER trg_budget_periods_no_overlap
  BEFORE INSERT OR UPDATE ON budget_periods
  FOR EACH ROW EXECUTE FUNCTION public.budget_periods_no_overlap();

-- 6b) Allocation sectorielle réservée aux lignes de portée 'sectors' + unité de l'école.
CREATE OR REPLACE FUNCTION public.budget_line_sectors_guard() RETURNS trigger AS $$
BEGIN
  IF (SELECT scope FROM budget_chapters WHERE id = NEW.budget_chapter_id) IS DISTINCT FROM 'sectors' THEN
    RAISE EXCEPTION 'allocation sectorielle: la ligne doit avoir la portée secteurs';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM school_units u WHERE u.id = NEW.school_unit_id AND u.school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'allocation sectorielle: unité hors établissement';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_budget_line_sectors_guard ON budget_line_sectors;
CREATE TRIGGER trg_budget_line_sectors_guard
  BEFORE INSERT OR UPDATE ON budget_line_sectors
  FOR EACH ROW EXECUTE FUNCTION public.budget_line_sectors_guard();

-- 6c) Allocation temporelle : période de la même école + même année que le budget.
CREATE OR REPLACE FUNCTION public.budget_line_periods_guard() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM budget_periods p
      JOIN budget_chapters c ON c.id = NEW.budget_chapter_id
      JOIN budgets b        ON b.id = c.budget_id
     WHERE p.id = NEW.budget_period_id
       AND p.school_id = NEW.school_id
       AND p.academic_year = b.academic_year
  ) THEN
    RAISE EXCEPTION 'allocation temporelle: période hors établissement ou hors année du budget';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_budget_line_periods_guard ON budget_line_periods;
CREATE TRIGGER trg_budget_line_periods_guard
  BEFORE INSERT OR UPDATE ON budget_line_periods
  FOR EACH ROW EXECUTE FUNCTION public.budget_line_periods_guard();

-- 6d) Activation d'une ligne : Σ % temporel = 100 (+ Σ % sectoriel = 100 si 'sectors').
-- SKIP en synchro service_role (auth.uid() NULL) : la vérité activée à l'origine est
-- déjà validée et les allocations peuvent arriver dans un autre ordre (anti-blocage sync).
CREATE OR REPLACE FUNCTION public.budget_chapter_activate_guard() RETURNS trigger AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    IF ABS(COALESCE((SELECT SUM(pct) FROM budget_line_periods WHERE budget_chapter_id = NEW.id), 0) - 100) > 0.01 THEN
      RAISE EXCEPTION 'activation ligne: la somme des allocations temporelles doit être égale à 100%%';
    END IF;
    IF NEW.scope = 'sectors'
       AND ABS(COALESCE((SELECT SUM(pct) FROM budget_line_sectors WHERE budget_chapter_id = NEW.id), 0) - 100) > 0.01 THEN
      RAISE EXCEPTION 'activation ligne: la somme des allocations sectorielles doit être égale à 100%%';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_budget_chapter_activate_guard ON budget_chapters;
CREATE TRIGGER trg_budget_chapter_activate_guard
  BEFORE INSERT OR UPDATE ON budget_chapters
  FOR EACH ROW EXECUTE FUNCTION public.budget_chapter_activate_guard();

-- ── 7) RLS : isolation par établissement (même modèle que les autres tables) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_periods','budget_line_periods','budget_line_sectors'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_rw ON public.%I', t, t);
    EXECUTE format($f$CREATE POLICY %I_rw ON public.%I FOR ALL
      USING     (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))
      WITH CHECK (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))$f$, t, t);
  END LOOP;
END $$;

-- ── 8) Colonnes + triggers de synchronisation continue (Phase 2) ─────────────
-- Réutilise public.touch_sync_row() / public.log_tombstone() (supabase_sync_phase2.sql).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_periods','budget_line_periods','budget_line_sectors'] LOOP
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
