-- ============================================================
-- NotesCam — Module IMMOBILISATIONS (patrimoine)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_sync_phase2.sql.
-- ============================================================
--
-- Registre des actifs (véhicules, bâtiments, ordinateurs, imprimantes, groupes
-- électrogènes, mobilier) + trois journaux satellites : pannes, réparations,
-- dépenses. Chaque actif porte un numéro et une valeur.

CREATE TABLE IF NOT EXISTS assets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  category       text NOT NULL DEFAULT 'mobilier',  -- vehicule|batiment|ordinateur|imprimante|groupe_electrogene|mobilier
  asset_number   text,                              -- numéro d'inventaire
  name           text NOT NULL,
  value          bigint,                            -- valeur (acquisition)
  acquisition_date date,
  status         text NOT NULL DEFAULT 'active',    -- active|maintenance|out_of_service|disposed
  location       text,
  serial_number  text,
  unit_id        uuid REFERENCES school_units(id) ON DELETE SET NULL,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);

CREATE TABLE IF NOT EXISTS asset_breakdowns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id    uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  date        date, description text, severity text, status text NOT NULL DEFAULT 'open', -- open|resolved
  reported_by text, notes text,
  created_at  timestamptz NOT NULL DEFAULT now(), updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS asset_repairs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id    uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  date        date, description text, provider text, cost bigint, status text NOT NULL DEFAULT 'done', -- planned|done
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(), updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS asset_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  asset_id    uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  date        date, category text, amount bigint, supplier text, notes text,
  created_at  timestamptz NOT NULL DEFAULT now(), updated_at timestamptz
);

-- ── RLS (isolation école) + colonnes/triggers de sync, en boucle ──────────────
DO $$
DECLARE t text; tables text[] := ARRAY['assets','asset_breakdowns','asset_repairs','asset_expenses'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF t <> 'assets' THEN EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_asset_idx ON public.%1$I (asset_id)', t); END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_rw ON public.%1$I', t);
    EXECUTE format($p$CREATE POLICY %1$s_rw ON public.%1$I FOR ALL
      USING (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))
      WITH CHECK (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))$p$, t);
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
