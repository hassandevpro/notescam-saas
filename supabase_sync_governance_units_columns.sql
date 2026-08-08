-- supabase_sync_governance_units_columns.sql
-- Complète supabase_sync_phase2.sql pour 3 tables branchées sur la synchro
-- APRÈS coup (school_units, governance_roles, user_governance_roles) mais
-- jamais migrées avec les colonnes de sync — d'où l'échec permanent de
-- l'étape « integrity » à l'appairage (sync_integrity plante sur `version`
-- inexistante, l'erreur est comptée comme une divergence).
--
-- Idempotent (IF NOT EXISTS partout) — sans risque à ré-exécuter. Couvre aussi
-- les écoles créées APRÈS ce script : colonnes + triggers deviennent partie du
-- schéma, donc toute nouvelle ligne (nouvelle école) en hérite automatiquement.
-- À coller dans Supabase → SQL Editor → Run.

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY['school_units', 'governance_roles', 'user_governance_roles'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;

    -- updated_at existe déjà (nullable) sur ces 3 tables : on comble les NULL
    -- historiques puis on aligne sur le même contrat que les autres tables
    -- répliquées (NOT NULL DEFAULT now()).
    EXECUTE format('UPDATE public.%I SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_at SET DEFAULT now()', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_at SET NOT NULL', t);

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS device_id text', t);

    -- Mêmes triggers (touch_sync_row / log_tombstone) que les tables déjà
    -- couvertes par phase2 — fonctions existantes, réutilisées telles quelles.
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_sync_row()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_tomb_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_tomb_%1$s AFTER DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.log_tombstone()', t);
  END LOOP;
END $$;
