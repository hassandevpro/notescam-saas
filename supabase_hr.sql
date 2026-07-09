-- ============================================================
-- NotesCam — Module RESSOURCES HUMAINES (RH)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert la table `staff` (module Personnel) + supabase_sync_phase2.sql.
-- ============================================================
--
-- Le RH s'appuie sur le DOSSIER PERSONNEL existant (table `staff`). Il ajoute des
-- entités satellites rattachées à un agent (staff_id) : contrats, congés,
-- évaluations, présences, historique professionnel. AUCUNE paie (déférée).

-- Contrats
CREATE TABLE IF NOT EXISTS hr_contracts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT 'cdi',       -- cdi|cdd|stage|vacation|prestation
  reference   text,
  title       text,                               -- intitulé du poste
  start_date  date,
  end_date    date,
  salary      bigint,                             -- salaire de référence (INDICATIF, pas de paie)
  status      text NOT NULL DEFAULT 'active',     -- active|suspended|ended
  document    text,                               -- lien du contrat signé
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

-- Congés
CREATE TABLE IF NOT EXISTS hr_leaves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT 'annuel',     -- annuel|maladie|maternite|paternite|exceptionnel|sans_solde
  start_date  date,
  end_date    date,
  days        integer,
  reason      text,
  status      text NOT NULL DEFAULT 'pending',    -- pending|approved|refused
  decided_by  text,
  decided_at  timestamptz,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

-- Évaluations
CREATE TABLE IF NOT EXISTS hr_evaluations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id     uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  eval_date    date,
  period       text,
  evaluator    text,
  score        numeric,
  rating       text,
  strengths    text,
  improvements text,
  comments     text,
  status       text NOT NULL DEFAULT 'draft',     -- draft|final
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz
);

-- Présences (pointage quotidien du personnel)
CREATE TABLE IF NOT EXISTS hr_attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  att_date    date,
  status      text NOT NULL DEFAULT 'present',    -- present|absent|retard|conge|mission
  check_in    text,
  check_out   text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

-- Historique professionnel
CREATE TABLE IF NOT EXISTS hr_career_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  event_date  date,
  type        text NOT NULL DEFAULT 'autre',      -- recrutement|promotion|mutation|formation|sanction|distinction|changement_poste|autre
  title       text,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

-- ── RLS (isolation école) + colonnes/triggers de sync, en boucle ──────────────
DO $$
DECLARE t text; tables text[] := ARRAY['hr_contracts','hr_leaves','hr_evaluations','hr_attendance','hr_career_events'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_staff_idx ON public.%1$I (staff_id)', t);
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
