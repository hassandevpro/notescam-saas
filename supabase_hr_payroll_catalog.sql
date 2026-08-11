-- ============================================================
-- NotesCam — Module RH : CATALOGUE Paie (primes/retenues) + identité légale
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_hr.sql + supabase_hr_payroll.sql + supabase_sync_phase2.sql.
-- ============================================================
--
-- Catalogue configuré UNE FOIS par l'école (primes/retenues), avec calcul fixe
-- ou en pourcentage d'une base (salaire de base ou brut) — résolu côté app
-- (hrEngine.resolvePayrollItemAmount). AUCUN taux fiscal/CNPS supposé ici :
-- le catalogue est livré vide, l'école (ou son comptable) le configure.
-- `hr_payroll_items` fige (snapshot) les lignes cochées sur CHAQUE bulletin,
-- indépendant des évolutions futures du catalogue — même principe que
-- `student_fee_items` pour le catalogue de frais.

CREATE TABLE IF NOT EXISTS hr_payroll_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code        text,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'prime',      -- prime|retenue
  calc_type   text NOT NULL DEFAULT 'fixed',       -- fixed|percent
  amount      bigint,                              -- calc_type='fixed'
  rate        numeric,                             -- calc_type='percent' (ex. 4.2)
  base_ref    text NOT NULL DEFAULT 'brut',        -- salaire_base|brut
  active      boolean NOT NULL DEFAULT true,
  position    integer NOT NULL DEFAULT 0,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

CREATE TABLE IF NOT EXISTS hr_payroll_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  payroll_id  uuid NOT NULL REFERENCES hr_payroll(id) ON DELETE CASCADE,
  catalog_id  uuid REFERENCES hr_payroll_catalog(id) ON DELETE SET NULL,
  code        text,
  kind        text NOT NULL,
  name        text NOT NULL,
  calc_type   text,
  rate        numeric,
  base_ref    text,
  amount      bigint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

-- ── Identité légale (bulletin de paie) — toutes optionnelles ─────────────────
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS niu text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS cnps_number text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS convention_collective text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS categorie_echelon text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS situation_familiale text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS cnps_number text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS niu text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS cni_number text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS bank_account text;

-- ── RLS (isolation école) + colonnes/triggers de sync, en boucle ──────────────
DO $$
DECLARE t text; tables text[] := ARRAY['hr_payroll_catalog','hr_payroll_items'];
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

CREATE INDEX IF NOT EXISTS hr_payroll_catalog_school_idx ON public.hr_payroll_catalog (school_id);
CREATE INDEX IF NOT EXISTS hr_payroll_items_payroll_idx ON public.hr_payroll_items (payroll_id);
