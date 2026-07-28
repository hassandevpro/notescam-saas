-- supabase_lan_pairing.sql
-- Parcours industrialisé « Cloud → Hybride » : préparation de l'hybridation depuis
-- les Paramètres de l'école EN LIGNE + code d'appairage pour rattacher un serveur
-- LAN, SANS saisir de school_id et SANS exposer de secret privilégié au LAN.
--
-- Ne DUPLIQUE aucune architecture H1-H7 : réutilise deployment_policy (policyEngine),
-- remote_access_allowed + finance_lan_mode (H4), le référentiel de gouvernance
-- (governance_roles.permissions) et le patron RPC SECURITY DEFINER déjà en place
-- (submit_governance_decision / submit_budget_operation).
--
-- Ce fichier NE modifie AUCUNE donnée d'une école : il crée seulement des fonctions,
-- une table de codes éphémères, et les politiques RLS associées. La bascule d'une
-- école en hybride se fait ENSUITE, à l'appel explicite de prepare_hybrid(school).
--
-- Prérequis : supabase_h4_remote_governance.sql (remote_access_allowed, finance_lan_mode),
-- supabase_governance_catalog.sql (governance_roles.permissions). pgcrypto (extensions).
-- À coller dans Supabase → SQL Editor → Run. Aucune Edge Function ici (voir plan).

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Helpers d'autorisation (mêmes conventions que can_decide_expense / has_remote_access)
-- ════════════════════════════════════════════════════════════════════════════

-- Le compte courant est-il ADMINISTRATEUR de cette école ? (school_users, actif)
CREATE OR REPLACE FUNCTION public.is_school_admin(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_users
     WHERE school_id = p_school AND user_id = auth.uid()
       AND active = true AND role = 'admin');
$$;

-- Décideurs ÉLIGIBLES à l'accès distant = comptes dont un rôle de gouvernance
-- DÉTIENT DÉJÀ un droit de décision dans le RÉFÉRENTIEL EXISTANT. On n'accorde
-- aucun droit ; on ne présume rien d'un simple statut « admin ». Si aucun rôle ne
-- porte de droit de décision, l'ensemble est VIDE (la gouvernance distante restera
-- inactive tant que l'établissement n'aura pas configuré un rôle décideur).
CREATE OR REPLACE FUNCTION public.eligible_remote_deciders(p_school uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ugr.user_id
    FROM user_governance_roles ugr
    JOIN governance_roles gr
      ON gr.school_id = ugr.school_id AND gr.code = ugr.role AND gr.active = true
   WHERE ugr.school_id = p_school
     AND (gr.permissions)::jsonb ?| ARRAY[
       'expense.approve','expense.reject',
       'budget.approve','budget.annual.revise','budget.reallocate.decide'
     ];
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Codes d'appairage LAN (éphémères, aléatoires, usage unique, révocables)
--    On ne stocke JAMAIS le code en clair : seulement son empreinte SHA-256.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lan_pairing_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code_hash     text NOT NULL,                 -- sha256(code) en hex ; jamais le clair
  code_hint     text NOT NULL,                 -- 4 premiers caractères, pour l'UI
  created_by    uuid NOT NULL,                 -- auth.uid() de l'admin émetteur
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,                   -- posé à la 1re consommation (usage unique)
  used_by_device text,                         -- empreinte machine LAN (traçabilité)
  revoked_at    timestamptz                    -- révocation manuelle
);
CREATE INDEX IF NOT EXISTS lan_pairing_codes_school_idx ON public.lan_pairing_codes (school_id);
CREATE UNIQUE INDEX IF NOT EXISTS lan_pairing_codes_hash_idx ON public.lan_pairing_codes (code_hash);

-- RLS : un ADMIN ne voit/gère QUE les codes de SON école. Les RPC ci-dessous sont
-- SECURITY DEFINER (contournent la RLS) ; la RLS protège l'accès DIRECT à la table
-- (ex. l'app en ligne qui liste les codes émis). Le code en clair n'y figure jamais.
ALTER TABLE public.lan_pairing_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lan_pairing_admin_read  ON public.lan_pairing_codes;
DROP POLICY IF EXISTS lan_pairing_admin_write ON public.lan_pairing_codes;
CREATE POLICY lan_pairing_admin_read ON public.lan_pairing_codes FOR SELECT
  USING (public.is_school_admin(school_id));
-- Aucune policy d'écriture pour les clients : émission/révocation passent par les RPC.

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Émission d'un code d'appairage (admin de l'école uniquement)
--    Renvoie le code EN CLAIR UNE SEULE FOIS (comme une clé d'API) + son expiration.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.issue_pairing_code(p_school uuid, p_ttl_minutes int DEFAULT 30)
RETURNS TABLE (code text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_code text;
  v_exp  timestamptz := now() + make_interval(mins => GREATEST(5, LEAST(p_ttl_minutes, 120)));
BEGIN
  IF NOT public.is_school_admin(p_school) THEN
    RAISE EXCEPTION 'Accès refusé : administrateur de l''école requis.' USING ERRCODE = '42501';
  END IF;
  -- Code aléatoire lisible : 2 groupes de 5 caractères base32-ish (64 bits d'entropie).
  v_code := upper(
    substr(encode(gen_random_bytes(8), 'hex'), 1, 5) || '-' ||
    substr(encode(gen_random_bytes(8), 'hex'), 6, 5));
  INSERT INTO public.lan_pairing_codes (school_id, code_hash, code_hint, created_by, expires_at)
  VALUES (p_school, encode(digest(v_code, 'sha256'), 'hex'), substr(v_code, 1, 4), auth.uid(), v_exp);
  code := v_code; expires_at := v_exp; RETURN NEXT;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) PRÉPARER L'HYBRIDATION (admin) — pose la politique + décideurs + émet un code.
--    N'ACCORDE AUCUN DROIT. Active remote_access_allowed UNIQUEMENT sur les décideurs
--    déjà autorisés par le référentiel (eligible_remote_deciders). Idempotent.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.prepare_hybrid(p_school uuid, p_ttl_minutes int DEFAULT 30)
RETURNS TABLE (code text, expires_at timestamptz, deciders_enabled int, warning text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_n int;
  v_code text;
  v_exp  timestamptz;
BEGIN
  IF NOT public.is_school_admin(p_school) THEN
    RAISE EXCEPTION 'Accès refusé : administrateur de l''école requis.' USING ERRCODE = '42501';
  END IF;

  -- (a) Politique de déploiement : finance LAN-first + gouvernance distante.
  --     MERGE (préserve les autres clés éventuelles : notes, frais…). Réutilise le
  --     schéma lu par policyEngine / finance_lan_mode. Aucune autre donnée touchée.
  UPDATE public.schools
     SET deployment_policy = COALESCE(deployment_policy, '{}'::jsonb)
         || '{"finance":{"execution":"lan","governance":"cloud"}}'::jsonb
   WHERE id = p_school;

  -- (b) Accès distant : UNIQUEMENT les décideurs déjà habilités par le référentiel.
  --     On n'ajoute aucun droit, on ne présume rien d'un statut admin.
  UPDATE public.school_users su
     SET remote_access_allowed = true
   WHERE su.school_id = p_school
     AND su.user_id IN (SELECT user_id FROM public.eligible_remote_deciders(p_school));
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- (c) Code d'appairage éphémère à remettre à l'installateur du serveur LAN.
  SELECT ic.code, ic.expires_at INTO v_code, v_exp
    FROM public.issue_pairing_code(p_school, p_ttl_minutes) ic;

  code := v_code;
  expires_at := v_exp;
  deciders_enabled := v_n;
  warning := CASE WHEN v_n = 0
    THEN 'Aucun rôle du référentiel ne détient de droit de décision : la gouvernance distante restera inactive tant qu''un rôle décideur ne sera pas configuré. Aucun droit n''a été ajouté automatiquement.'
    ELSE NULL END;
  RETURN NEXT;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5) RÉVOCATION (admin) — invalide tous les codes non consommés de l'école.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.revoke_pairing_codes(p_school uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF NOT public.is_school_admin(p_school) THEN
    RAISE EXCEPTION 'Accès refusé : administrateur de l''école requis.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.lan_pairing_codes
     SET revoked_at = now()
   WHERE school_id = p_school AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6) CONSOMMATION (côté serveur seulement — Edge Function avec service_role).
--    Valide + marque USAGE UNIQUE de façon ATOMIQUE, renvoie le school_id. N'expose
--    JAMAIS ce school_id ni de secret à un client authentifié : EXECUTE réservé au
--    service_role (l'Edge). Le LAN n'appelle PAS cette fonction directement.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.consume_pairing_code(p_code text, p_device text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_school uuid;
BEGIN
  -- Claim atomique : la 1re consommation gagne (used_at posé), les suivantes échouent.
  UPDATE public.lan_pairing_codes
     SET used_at = now(), used_by_device = p_device
   WHERE code_hash = encode(digest(p_code, 'sha256'), 'hex')
     AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
  RETURNING school_id INTO v_school;

  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Code d''appairage invalide, expiré, déjà utilisé ou révoqué.' USING ERRCODE = '22023';
  END IF;
  RETURN v_school;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7) GRANTS — principe du moindre privilège
-- ════════════════════════════════════════════════════════════════════════════
-- Admin (client authentifié) : préparer / émettre / révoquer.
GRANT EXECUTE ON FUNCTION public.prepare_hybrid(uuid, int)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_pairing_code(uuid, int)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_pairing_codes(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid)           TO authenticated;
-- Consommation : Edge Function uniquement (service_role). JAMAIS aux clients.
REVOKE EXECUTE ON FUNCTION public.consume_pairing_code(text, text) FROM PUBLIC, authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.consume_pairing_code(text, text) TO service_role;
-- eligible_remote_deciders sert prepare_hybrid (definer) ; pas d'appel client requis.
REVOKE EXECUTE ON FUNCTION public.eligible_remote_deciders(uuid) FROM PUBLIC, anon;
