-- ============================================================
-- NotesCam — Configuration fournisseur SMS par école + suivi de statut
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_notification_dispatch.sql (notification_outbox_claim,
-- colonnes next_attempt_at/provider_ref/...).
-- ============================================================
--
-- POURQUOI UNE TABLE À PART, HORS SYNCHRO : school_sms_settings contient des
-- IDENTIFIANTS (clé API du fournisseur). Elle est délibérément absente du
-- tableau TABLES de supabase/functions/sync-pull/index.ts : ces identifiants
-- ne doivent JAMAIS se répliquer vers un poste LAN (SQLite, disque local
-- d'une école). Seul l'edge `notify-dispatch` (service_role) et l'admin de
-- l'école (via RLS, authentifié) y accèdent — jamais le LAN.

-- ── 1. Table de config ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_sms_settings (
  school_id   uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  provider    text,               -- null tant qu'aucun fournisseur n'est choisi
  sender_id   text,
  api_key     text,
  api_secret  text,
  enabled     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_sms_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_settings: lecture admin" ON public.school_sms_settings;
CREATE POLICY "sms_settings: lecture admin"
  ON public.school_sms_settings FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM public.school_users
      WHERE user_id = auth.uid() AND active = true AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "sms_settings: insertion admin" ON public.school_sms_settings;
CREATE POLICY "sms_settings: insertion admin"
  ON public.school_sms_settings FOR INSERT
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM public.school_users
      WHERE user_id = auth.uid() AND active = true AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "sms_settings: update admin" ON public.school_sms_settings;
CREATE POLICY "sms_settings: update admin"
  ON public.school_sms_settings FOR UPDATE
  USING (
    school_id IN (
      SELECT school_id FROM public.school_users
      WHERE user_id = auth.uid() AND active = true AND role = 'admin'
    )
  );

-- ── 2. Déclenchement périodique (À ACTIVER une fois le fournisseur branché) ──
-- pg_cron / pg_net disponibles sur ce projet mais non installés à ce jour.
-- Une fois DISPATCH_SECRET connu (cf. `supabase secrets set DISPATCH_SECRET=...`
-- au déploiement de l'edge notify-dispatch), décommenter et remplacer
-- <project-ref> / <DISPATCH_SECRET> ci-dessous :
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
-- SELECT cron.schedule('notify-dispatch-sweep', '*/2 * * * *', $$
--   SELECT net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/notify-dispatch',
--     headers := jsonb_build_object('x-dispatch-secret', '<DISPATCH_SECRET>', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb
--   );
-- $$);
--
-- En attendant : invocation manuelle possible (curl / `supabase functions invoke
-- notify-dispatch`) — suffisant pour valider le chemin bout en bout.
