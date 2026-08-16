-- ============================================================
-- NotesCam — Maîtrise des coûts SMS : priorité, budget, anti-doublon
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_sms_config.sql (school_sms_settings) et
-- supabase_notification_dispatch.sql (notification_outbox_claim).
-- ============================================================
--
-- RÈGLE : le SMS est un canal RARE et COÛTEUX (cible de référence : ~20 000
-- FCFA/an pour une école de ~500 élèves, soit quelques SMS par élève sur toute
-- l'année). L'infrastructure ne se contente donc pas de mettre en file — elle
-- REFUSE par défaut, et l'edge notify-dispatch applique ces règles en dernier
-- ressort (seule autorité qui connaît la dépense réelle) :
--   • priorité 'normal'    → jamais envoyé par SMS (in-app uniquement) ;
--   • priorité 'important' → envoyé sauf si le budget approche sa limite ;
--   • priorité 'urgent'    → envoyé tant qu'il reste du budget.

-- ── 1. Priorité de la notification (propage jusqu'au canal SMS) ─────────────
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE public.notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_priority_check;
ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_priority_check CHECK (priority IN ('normal', 'important', 'urgent'));

-- ── 2. Budget par école ───────────────────────────────────────────────────────
ALTER TABLE public.school_sms_settings
  ADD COLUMN IF NOT EXISTS budget_fcfa        numeric NOT NULL DEFAULT 20000,
  ADD COLUMN IF NOT EXISTS spent_fcfa         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_sms_fcfa  numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS soft_threshold_pct numeric NOT NULL DEFAULT 85;
COMMENT ON COLUMN public.school_sms_settings.soft_threshold_pct IS
  'Pourcentage du budget consommé au-delà duquel seule la priorité ''urgent'' part encore par SMS (''important'' est dégradé en interne uniquement).';

-- ── 3. Incrément atomique de la dépense ──────────────────────────────────────
-- Appelé par l'expéditeur (edge notify-dispatch) après un envoi réel. Atomique
-- pour rester correct si deux passes de dispatch se chevauchent — même
-- précaution que notification_outbox_claim (FOR UPDATE SKIP LOCKED).
CREATE OR REPLACE FUNCTION public.sms_record_spend(p_school_id uuid, p_amount numeric)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.school_sms_settings
     SET spent_fcfa = spent_fcfa + p_amount, updated_at = now()
   WHERE school_id = p_school_id;
$$;

REVOKE ALL ON FUNCTION public.sms_record_spend(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sms_record_spend(uuid, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_record_spend(uuid, numeric) TO service_role;
