-- ============================================================
-- NotesCam — N1 : EXPÉDITEUR des canaux externes (email/SMS/WhatsApp)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_notifications.sql.
-- ============================================================
--
-- POURQUOI AU CLOUD ET PAS AU LAN : `notification_outbox` est une table
-- SYNCHRONISÉE (cf. SYNCED_TABLES de server/db.js + arrays des edge sync-*).
-- Un LAN hors ligne ne peut de toute façon rien envoyer, et deux LAN appairés
-- qui enverraient chacun de leur côté produiraient un DOUBLE ENVOI. L'expéditeur
-- est donc UNIQUE et vit au Cloud (edge `notify-dispatch`) ; le passage à 'sent'
-- redescend au LAN par la synchro normale (LWW), comme n'importe quel état.
--
-- AUCUNE instruction destructive : que des ADD COLUMN IF NOT EXISTS / CREATE.

-- ── 1. Colonnes de réessai + de résolution d'adresse ─────────────────────────
-- next_attempt_at : quand cette ligne redevient éligible (backoff exponentiel).
-- last_attempt_at : sert AUSSI à récupérer les lignes 'sending' orphelines
--                   (worker tué en plein vol) — sans ça elles resteraient bloquées.
-- provider_ref    : id renvoyé par le fournisseur (traçabilité / support).
-- recipient_id / recipient_role : indispensables pour que l'expéditeur puisse
--                   RÉSOUDRE une adresse absente (cf. §3 ci-dessous).
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_ref    text,
  ADD COLUMN IF NOT EXISTS recipient_id    text,
  ADD COLUMN IF NOT EXISTS recipient_role  text;

-- Index de sélection des lignes « dues » (pending échu OU sending orphelin).
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON public.notification_outbox (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'sending');

-- ── 2. CLAIM ATOMIQUE ────────────────────────────────────────────────────────
-- Réserve un lot et le passe à 'sending' DANS LA MÊME transaction. Deux crons qui
-- se chevauchent ne peuvent pas prendre la même ligne (FOR UPDATE SKIP LOCKED) :
-- c'est la garantie anti-double-envoi. `attempts` est incrémenté À LA RÉSERVATION
-- (pas à l'échec) — un worker qui meurt sans répondre consomme donc une tentative,
-- ce qui borne les boucles infinies sur une ligne empoisonnée.
CREATE OR REPLACE FUNCTION public.notification_outbox_claim(
  p_limit         integer DEFAULT 50,
  p_stuck_minutes integer DEFAULT 15
)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_outbox o
     SET status          = 'sending',
         attempts        = o.attempts + 1,
         last_attempt_at = now(),
         updated_at      = now()
   WHERE o.id IN (
     SELECT s.id
       FROM public.notification_outbox s
      WHERE (s.status = 'pending'
             AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= now()))
         OR (s.status = 'sending'
             AND s.last_attempt_at IS NOT NULL
             AND s.last_attempt_at < now() - make_interval(mins => p_stuck_minutes))
      ORDER BY s.created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.*;
END $$;

-- Réservé à l'expéditeur : jamais appelable depuis le client.
REVOKE ALL ON FUNCTION public.notification_outbox_claim(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_outbox_claim(integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_outbox_claim(integer, integer) TO service_role;

-- ── 3. RÉSOLUTION D'ADRESSE (rôle → contacts) ────────────────────────────────
-- `notifyRole()` ne connaît QUE le rôle : sans ce résolveur, une notification
-- ciblée par rôle n'a aucune adresse et ne part JAMAIS en externe.
-- Le client n'a pas le droit de lire les contacts des autres (RLS) → la
-- résolution doit se faire ici, en service_role.
-- Sources, par ordre de préférence : staff (dossier personnel) → teachers → auth.users.
CREATE OR REPLACE FUNCTION public.notification_resolve_contacts(
  p_school_id uuid,
  p_user_id   text DEFAULT NULL,
  p_role      text DEFAULT NULL
)
RETURNS TABLE (user_id text, email text, phone text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH targets AS (
    SELECT su.user_id::text AS uid
      FROM public.school_users su
     WHERE su.school_id = p_school_id
       AND (p_user_id IS NOT NULL AND su.user_id::text = p_user_id
            OR p_user_id IS NULL AND p_role IS NOT NULL AND su.role = p_role)
  )
  SELECT t.uid,
         COALESCE(st.email, tc.email, au.email::text) AS email,
         COALESCE(st.phone, tc.phone)                 AS phone
    FROM targets t
    LEFT JOIN public.staff    st ON st.auth_user_id::text = t.uid AND st.school_id = p_school_id
    LEFT JOIN public.teachers tc ON tc.auth_user_id::text = t.uid AND tc.school_id = p_school_id
    LEFT JOIN auth.users      au ON au.id::text = t.uid;
$$;

REVOKE ALL ON FUNCTION public.notification_resolve_contacts(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_resolve_contacts(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_resolve_contacts(uuid, text, text) TO service_role;
