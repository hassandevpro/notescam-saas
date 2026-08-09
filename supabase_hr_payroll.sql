-- ============================================================
-- NotesCam — Module RH : PAIE (registre indicatif)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_hr.sql (module RH) + supabase_sync_phase2.sql.
-- ============================================================
--
-- Registre INDICATIF par bulletin, rattaché à un agent (staff_id) : net
-- calculé côté app (base + primes − retenues). AUCUN calcul fiscal/CNPS —
-- même logique que le salaire déjà présent sur hr_contracts. Fichier séparé
-- de supabase_hr.sql (déjà exécuté en prod) pour ne pas retoucher un script
-- déployé, sur le modèle de supabase_budget_hierarchy_v2.sql.

CREATE TABLE IF NOT EXISTS hr_payroll (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id      uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  period        text,                             -- 'AAAA-MM'
  base_salary   bigint,
  bonuses       bigint NOT NULL DEFAULT 0,         -- primes
  deductions    bigint NOT NULL DEFAULT 0,         -- retenues
  net_salary    bigint,                            -- calculé (base + primes − retenues)
  status        text NOT NULL DEFAULT 'draft',     -- draft|paid
  paid_date     date,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz
);

-- ── RLS (isolation école) + colonnes/triggers de sync ─────────────────────────
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS hr_payroll_staff_idx ON public.hr_payroll (staff_id);
  ALTER TABLE public.hr_payroll ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS hr_payroll_rw ON public.hr_payroll;
  CREATE POLICY hr_payroll_rw ON public.hr_payroll FOR ALL
    USING (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()))
    WITH CHECK (school_id IN (SELECT school_id FROM school_users WHERE user_id = auth.uid()));
  ALTER TABLE public.hr_payroll ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
  ALTER TABLE public.hr_payroll ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
  ALTER TABLE public.hr_payroll ADD COLUMN IF NOT EXISTS device_id text;
  IF to_regprocedure('public.touch_sync_row()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_touch_hr_payroll ON public.hr_payroll;
    CREATE TRIGGER trg_touch_hr_payroll BEFORE UPDATE ON public.hr_payroll FOR EACH ROW EXECUTE FUNCTION public.touch_sync_row();
  END IF;
  IF to_regprocedure('public.log_tombstone()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_tomb_hr_payroll ON public.hr_payroll;
    CREATE TRIGGER trg_tomb_hr_payroll AFTER DELETE ON public.hr_payroll FOR EACH ROW EXECUTE FUNCTION public.log_tombstone();
  END IF;
END $$;
