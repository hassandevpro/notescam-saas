-- ============================================================
-- NotesCam — Module REPORTS (Signalements) : commentaires + historique
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_signalement.sql (table signalements) + supabase_sync_phase2.sql.
-- ============================================================
--
-- RÉUTILISE la table `signalements` (PoC socle P0) comme entité « report » :
-- catégorie = domain, gravité = priority, statut = status (machine à états
-- committée). On ajoute : l'affectation automatique (assigned_department), les
-- COMMENTAIRES et l'HISTORIQUE. PAS de notifications (déférées).

-- Affectation automatique (département de traitement dérivé de la catégorie).
ALTER TABLE signalements ADD COLUMN IF NOT EXISTS assigned_department text;

-- Commentaires
CREATE TABLE IF NOT EXISTS signalement_comments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  signalement_id uuid NOT NULL REFERENCES signalements(id) ON DELETE CASCADE,
  author         text,
  author_id      text,
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);

-- Historique (append : une ligne par changement d'état / affectation).
CREATE TABLE IF NOT EXISTS signalement_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  signalement_id uuid NOT NULL REFERENCES signalements(id) ON DELETE CASCADE,
  action         text NOT NULL,            -- created|assigned|status_changed|reassigned|commented
  from_status    text,
  to_status      text,
  detail         text,
  actor          text,
  actor_id       text,
  at             timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);

-- ── RLS (isolation école) + colonnes/triggers de sync, en boucle ──────────────
DO $$
DECLARE t text; tables text[] := ARRAY['signalement_comments','signalement_history'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %1$s_sig_idx ON public.%1$I (signalement_id)', t);
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
