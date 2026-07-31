-- supabase_domain_events_sync.sql — H3-a : réplication du journal d'événements.
--
-- Additif et à faible surface : `domain_events` existe déjà (supabase_domain_events.sql)
-- avec `id uuid PRIMARY KEY`, `seq bigserial` et l'index (school_id, seq). H3-a n'a
-- besoin d'AUCUNE nouvelle table ni colonne côté Cloud : les 2 fonctions edge
-- (events-pull / events-push) opèrent en service_role.
--   • events-pull : SELECT par seq > curseur (log shipping ordonné).
--   • events-push : upsert IDEMPOTENT (ON CONFLICT (id) DO NOTHING) en conservant
--     l'actor_id estampillé par le LAN (on NE passe PAS par kernel_emit).
--
-- Cette migration se contente de (re)garantir l'index de pull et de documenter.
-- À coller dans Supabase → SQL Editor → Run, PUIS déployer les fonctions edge :
--   supabase functions deploy events-pull
--   supabase functions deploy events-push

CREATE INDEX IF NOT EXISTS idx_domain_events_pull ON public.domain_events (school_id, seq);

COMMENT ON TABLE public.domain_events IS
  'Journal append-only des Domain Events. Répliqué LAN↔Cloud par log shipping (curseur seq, idempotent par id) — H3-a. Insertion applicative interdite (RLS) : seule voie authentifiée = kernel_emit ; la réplication LAN→Cloud passe par la fonction edge events-push en service_role.';
