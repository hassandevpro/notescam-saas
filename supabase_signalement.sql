-- supabase_signalement.sql — Domaine SIGNALEMENT (PoC transverse du socle P0).
-- Entité générique routable vers n'importe quel domaine (vie scolaire,
-- maintenance, patrimoine, RH, finances…). Colonnes de sync Phase 2 incluses.
-- À coller dans Supabase → SQL Editor → Run. Additif.

CREATE TABLE IF NOT EXISTS public.signalements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  reporter_id    uuid,
  reporter_name  text,
  domain         text NOT NULL,            -- 'maintenance','patrimoine','vie_scolaire'…
  title          text NOT NULL,
  description    text DEFAULT '',
  priority       text NOT NULL DEFAULT 'normal',  -- low|normal|high|critical
  status         text NOT NULL DEFAULT 'new',     -- machine à états (cf. signalement.js)
  assignee_id    uuid,
  resolution     text,
  correlation_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- colonnes de synchronisation (convention Phase 2)
  updated_at     timestamptz NOT NULL DEFAULT now(),
  version        integer NOT NULL DEFAULT 1,
  device_id      text
);
CREATE INDEX IF NOT EXISTS idx_signalements_school ON public.signalements (school_id, status);
CREATE INDEX IF NOT EXISTS idx_signalements_domain ON public.signalements (school_id, domain);

-- Réplication LAN↔Cloud : version++ + updated_at + tombstones (triggers Phase 2).
DROP TRIGGER IF EXISTS trg_signalements_touch ON public.signalements;
CREATE TRIGGER trg_signalements_touch BEFORE UPDATE ON public.signalements
  FOR EACH ROW EXECUTE FUNCTION public.touch_sync_row();
DROP TRIGGER IF EXISTS trg_signalements_tombstone ON public.signalements;
CREATE TRIGGER trg_signalements_tombstone AFTER DELETE ON public.signalements
  FOR EACH ROW EXECUTE FUNCTION public.log_tombstone();

ALTER TABLE public.signalements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signalements_rw ON public.signalements;
CREATE POLICY signalements_rw ON public.signalements FOR ALL
  USING     (school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid()));

-- NB : le contrôle FIN (qui peut trier/affecter/clôturer) est fait par le RBAC
-- applicatif (kernel). La RLS ne garantit ici que l'isolation par école.
