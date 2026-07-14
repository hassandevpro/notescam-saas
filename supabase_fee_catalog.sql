-- ============================================================
-- NotesCam — CATALOGUE DE FRAIS (obligatoires / optionnels)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_sync_phase2.sql. COMPATIBLE avec fee_payments existant.
-- ============================================================
--
-- 1. fee_catalog       : catalogue CONFIGURABLE par établissement (aucun code).
-- 2. student_fee_items : la liste de frais PROPRE À CHAQUE ÉLÈVE (snapshot).
-- 3. fee_payments      : +colonne student_fee_item_id (nullable) → suivi des
--    paiements PAR FRAIS. Les paiements existants (null) restent des paiements
--    globaux : aucune régression.

CREATE TABLE IF NOT EXISTS fee_catalog (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name          text NOT NULL,
  category      text NOT NULL DEFAULT 'autre',
  amount        bigint NOT NULL DEFAULT 0,
  academic_year text,
  level         text,                              -- niveau concerné (null = tous)
  class_id      uuid REFERENCES classes(id) ON DELETE SET NULL, -- classe concernée (null = niveau/école)
  mandatory     boolean NOT NULL DEFAULT false,    -- obligatoire (Oui/Non)
  optional      boolean NOT NULL DEFAULT true,     -- optionnel (Oui/Non)
  payment_type  text NOT NULL DEFAULT 'unique',    -- unique | echelonne
  start_date    date,
  end_date      date,
  active        boolean NOT NULL DEFAULT true,     -- actif / inactif
  position      integer NOT NULL DEFAULT 0,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz
);
CREATE INDEX IF NOT EXISTS fee_catalog_school_idx ON fee_catalog (school_id, academic_year);

CREATE TABLE IF NOT EXISTS student_fee_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_catalog_id uuid REFERENCES fee_catalog(id) ON DELETE SET NULL,
  academic_year  text,
  name           text NOT NULL,           -- snapshot (indépendant des évolutions du catalogue)
  category       text NOT NULL DEFAULT 'autre',
  amount         bigint NOT NULL DEFAULT 0,   -- montant, surchargeable par élève
  mandatory      boolean NOT NULL DEFAULT false,
  payment_type   text NOT NULL DEFAULT 'unique',
  status         text NOT NULL DEFAULT 'active',  -- active | removed
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz,
  UNIQUE (student_id, fee_catalog_id, academic_year)
);
CREATE INDEX IF NOT EXISTS student_fee_items_student_idx ON student_fee_items (student_id, academic_year);
CREATE INDEX IF NOT EXISTS student_fee_items_school_idx ON student_fee_items (school_id, category);

-- Lien paiement -> frais précis (nullable → compat totale avec l'existant).
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS student_fee_item_id uuid REFERENCES student_fee_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS fee_payments_item_idx ON fee_payments (student_fee_item_id);

-- ── RLS (isolation école) + colonnes/triggers de sync, en boucle ──────────────
DO $$
DECLARE t text; tables text[] := ARRAY['fee_catalog','student_fee_items'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
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
