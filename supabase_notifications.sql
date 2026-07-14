-- ============================================================
-- NotesCam — Moteur de NOTIFICATIONS (multi-canaux)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_sync_phase2.sql.
-- ============================================================
--
-- Canal INTERNE implémenté (table `notifications` = notifications in-app).
-- Canaux email / sms / whatsapp PRÉVUS : chaque envoi externe est mis en file
-- dans `notification_outbox` (statut 'pending'), MAIS N'EST PAS ENVOYÉ (aucun
-- expéditeur branché dans cette itération). Ne casse pas `teacher_notifications`
-- (notifications de notes existantes), qui reste séparé.

-- Notifications internes (in-app)
CREATE TABLE IF NOT EXISTS notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  recipient_id   text,        -- user ciblé (null = diffusion)
  recipient_role text,        -- rôle ciblé (null = tous)
  type           text NOT NULL DEFAULT 'info',
  title          text NOT NULL,
  body           text,
  link           text,        -- lien profond dans l'app
  read           boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_school_idx ON notifications (school_id, recipient_id);

-- File d'envoi des canaux EXTERNES (prévu, non envoyé)
CREATE TABLE IF NOT EXISTS notification_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES notifications(id) ON DELETE CASCADE,
  channel         text NOT NULL,             -- email | sms | whatsapp
  address         text,                      -- email / numéro
  status          text NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  error           text,
  attempts        integer NOT NULL DEFAULT 0,
  payload         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz
);
CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx ON notification_outbox (school_id, status);

-- ── RLS (isolation école) + colonnes/triggers de sync, en boucle ──────────────
DO $$
DECLARE t text; tables text[] := ARRAY['notifications','notification_outbox'];
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
