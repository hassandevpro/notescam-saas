-- supabase_domain_events.sql — Socle P0 : Event Store (outbox) + Audit Log.
-- Deux tables APPEND-ONLY, transverses à tous les domaines de l'ERP.
--   - domain_events : outbox durable des Domain Events (se réplique via sync).
--   - audit_events  : journal d'audit alimenté automatiquement par l'abonné « * ».
-- À coller dans Supabase → SQL Editor → Run. Additif : ne touche à rien d'existant.

-- 1. OUTBOX des Domain Events -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.domain_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  aggregate_type text NOT NULL,           -- 'signalement','grade','fee'…
  aggregate_id   uuid,
  event_type     text NOT NULL,           -- 'SignalementRaised'… (au passé)
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id       uuid,
  actor_name     text,
  correlation_id uuid,                     -- relie les events d'un même workflow
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  seq            bigserial,                -- ordre total = curseur de pull
  device_id      text                      -- provenance (convention Phase 2)
);
CREATE INDEX IF NOT EXISTS idx_domain_events_pull ON public.domain_events (school_id, seq);
CREATE INDEX IF NOT EXISTS idx_domain_events_agg  ON public.domain_events (school_id, aggregate_type, aggregate_id);

ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
-- Lecture : membres de l'école uniquement (isolation tenant, cf. audit sécu C1).
DROP POLICY IF EXISTS domain_events_read ON public.domain_events;
CREATE POLICY domain_events_read ON public.domain_events FOR SELECT
  USING (school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid()));
-- Écriture : AUCUNE policy INSERT pour les rôles applicatifs -> un client
-- authentifié ne peut PAS écrire (donc pas forger) un event directement. La
-- seule voie d'écriture est la fonction kernel_emit() (SECURITY DEFINER, plus
-- bas), qui estampille l'acteur depuis auth.uid() côté serveur. C'est la vraie
-- non-répudiation (corrige la faille H1 ; la revue P0 #8 avait relevé que la
-- policy précédente autorisait en fait tout membre de l'école à forger).
DROP POLICY IF EXISTS domain_events_insert ON public.domain_events;
-- (Append-only : aucune policy UPDATE/DELETE -> immuable côté rôles applicatifs.)

-- 2. AUDIT LOG (dérivé des events, mais table dédiée requêtable) -------------
CREATE TABLE IF NOT EXISTS public.audit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  action         text NOT NULL,            -- = event_type
  aggregate_type text,
  target_id      uuid,
  actor_id       uuid,
  actor_name     text,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid,
  event_id       uuid,                      -- idempotence -> outbox
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_school ON public.audit_events (school_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_target ON public.audit_events (school_id, aggregate_type, target_id);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_events_read ON public.audit_events;
CREATE POLICY audit_events_read ON public.audit_events FOR SELECT
  USING (school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid()));
-- Idem : l'audit est dérivé des events par kernel_emit (service). Aucune policy
-- INSERT applicative -> le journal d'audit n'est pas falsifiable par un client.
DROP POLICY IF EXISTS audit_events_insert ON public.audit_events;

-- ============================================================
-- 3. kernel_emit() — SEULE voie d'écriture des events (non-répudiation)
-- ============================================================
-- SECURITY DEFINER : s'exécute avec les droits du propriétaire (contourne la
-- RLS d'INSERT absente) mais VÉRIFIE que l'appelant est bien membre de l'école
-- ciblée, et FORCE actor_id = auth.uid() (le client ne choisit pas son acteur).
-- Écrit l'event ET sa ligne d'audit dérivée dans la MÊME transaction (une
-- fonction plpgsql est atomique) -> donne aussi au Cloud l'outbox atomique.
-- Idempotent : id de l'audit = id de l'event (ON CONFLICT DO NOTHING).
CREATE OR REPLACE FUNCTION public.kernel_emit(p_event jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid := NULLIF(p_event->>'school_id','')::uuid;
  v_uid    uuid := auth.uid();
  v_id     uuid := COALESCE(NULLIF(p_event->>'id','')::uuid, gen_random_uuid());
  v_at     timestamptz := COALESCE((p_event->>'occurred_at')::timestamptz, now());
  v_name   text := p_event->>'actor_name';   -- affichage seul (non probant)
BEGIN
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'kernel_emit: school_id requis' USING ERRCODE = '22004';
  END IF;
  -- Isolation tenant : l'appelant doit appartenir à l'école ciblée.
  IF NOT EXISTS (SELECT 1 FROM public.school_users WHERE user_id = v_uid AND school_id = v_school) THEN
    RAISE EXCEPTION 'kernel_emit: acteur non membre de l''école %', v_school USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.domain_events
    (id, school_id, aggregate_type, aggregate_id, event_type, payload,
     actor_id, actor_name, correlation_id, occurred_at, device_id)
  VALUES
    (v_id, v_school, p_event->>'aggregate_type', NULLIF(p_event->>'aggregate_id','')::uuid,
     p_event->>'event_type', COALESCE(p_event->'payload','{}'::jsonb),
     v_uid, v_name, NULLIF(p_event->>'correlation_id','')::uuid, v_at, p_event->>'device_id')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.audit_events
    (id, school_id, action, aggregate_type, target_id,
     actor_id, actor_name, payload, correlation_id, event_id, at)
  VALUES
    (v_id, v_school, p_event->>'event_type', p_event->>'aggregate_type', NULLIF(p_event->>'aggregate_id','')::uuid,
     v_uid, v_name, COALESCE(p_event->'payload','{}'::jsonb),
     NULLIF(p_event->>'correlation_id','')::uuid, v_id, v_at)
  ON CONFLICT (id) DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.kernel_emit(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.kernel_emit(jsonb) TO authenticated;
