-- supabase_budget_operations.sql — H3b-2 : émission d'intentions budgétaires (Cloud).
--
-- Le Cloud n'écrit JAMAIS la finance : cette RPC émet uniquement une INTENTION
-- (BudgetOperationRequested) via kernel_emit (actor_id = auth.uid(), non-répudiation,
-- audit atomique, idempotence par id). Le serveur LAN reçoit l'intention (canal H3-a)
-- puis VÉRIFIE — permission + périmètre école + version + cap annuel + idempotence +
-- cohérence — et APPLIQUE ou REJETTE via l'enforcement Budget V3 (H3b-3 :
-- verifyRemoteBudgetOperation). Le LAN est l'UNIQUE autorité de mutation financière.
--
-- « Application directe après re-vérif LAN » (décision Hassan 2026-07-27) : un
-- gestionnaire distant détenant l'autorité (Fondatrice/Coordonnateur général) déclenche
-- l'op SANS second décideur local ; le LAN reste le garde-fou et refuse en cas d'échec
-- d'une vérification (rejet journalisé). La vérification ci-dessous (permission + accès
-- distant + périmètre) n'est qu'une PREMIÈRE LIGNE de filtre.
--
-- Prérequis : supabase_domain_events.sql (kernel_emit), supabase_governance*.sql,
-- supabase_h4_remote_governance.sql (school_users.remote_access_allowed).
-- À coller dans Supabase → SQL Editor → Run. AUCUNE nouvelle table, AUCUNE écriture
-- financière. INERTE tant que le LAN n'applique pas (H3b-3).

-- op budgétaire → permission BUDGET_* requise. MIROIR de src/domains/finance/events.js
-- (BUDGET_OP_PERMISSION) — les deux DOIVENT rester synchronisés.
CREATE OR REPLACE FUNCTION public.budget_op_permission(p_op text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_op
    WHEN 'create'     THEN 'budget.prepare'
    WHEN 'modify'     THEN 'budget.prepare'
    WHEN 'allocate'   THEN 'budget.prepare'
    WHEN 'activate'   THEN 'budget.approve'                 -- activation = approbation finale
    WHEN 'revise'     THEN 'budget.annual.revise.request'
    WHEN 'reallocate' THEN 'budget.reallocate.request'
    ELSE NULL
  END;
$$;

-- Le gestionnaire a-t-il, dans cette école, l'ACCÈS DISTANT + un rôle de gouvernance
-- ACTIF portant la permission requise par l'op ? (admin possible, mais TOUJOURS gated par
-- remote_access_allowed : séparation « droit financier » / « droit d'accès distant » — H4.)
CREATE OR REPLACE FUNCTION public.can_operate_budget(p_school uuid, p_uid uuid, p_op text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.budget_op_permission(p_op) IS NOT NULL
    -- Accès distant OBLIGATOIRE (même pour un admin).
    AND EXISTS (SELECT 1 FROM public.school_users
                 WHERE school_id = p_school AND user_id = p_uid AND active = true AND remote_access_allowed = true)
    AND (
      EXISTS (SELECT 1 FROM public.school_users
               WHERE school_id = p_school AND user_id = p_uid AND active = true AND role = 'admin')
      OR EXISTS (
        SELECT 1 FROM public.user_governance_roles ugr
          JOIN public.governance_roles gr ON gr.school_id = ugr.school_id AND gr.code = ugr.role
         WHERE ugr.school_id = p_school AND ugr.user_id = p_uid AND gr.active = true
           AND (gr.permissions)::jsonb ? public.budget_op_permission(p_op)
      )
    );
$$;
REVOKE ALL ON FUNCTION public.can_operate_budget(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.can_operate_budget(uuid, uuid, text) TO authenticated;

-- Émet une INTENTION d'opération budgétaire. `p_aggregate_id` = identité AUTORITAIRE de
-- la commande (I5 : pour une création, le client génère l'uuid et le réutilise pour les op
-- suivantes ; le LAN matérialise avec CE même id). Renvoie l'id de l'événement émis
-- (= idempotency_key). AUCUNE écriture financière — le LAN décide.
CREATE OR REPLACE FUNCTION public.submit_budget_operation(
  p_school           uuid,
  p_op               text,
  p_target           text,
  p_aggregate_id     uuid,
  p_expected_version integer DEFAULT NULL,
  p_data             jsonb   DEFAULT '{}'::jsonb,
  p_correlation_id   uuid    DEFAULT NULL,
  p_note             text    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_id   uuid := gen_random_uuid();
  v_corr uuid := COALESCE(p_correlation_id, v_id);   -- lie les op d'un même workflow (I6)
BEGIN
  -- Validation des énumérations (op/cible valides ; identité autoritaire requise).
  IF public.budget_op_permission(p_op) IS NULL THEN
    RAISE EXCEPTION 'opération budgétaire invalide: %', p_op;
  END IF;
  IF p_target NOT IN ('budget', 'line', 'allocation') THEN
    RAISE EXCEPTION 'cible budgétaire invalide: %', p_target;
  END IF;
  IF p_aggregate_id IS NULL THEN
    RAISE EXCEPTION 'aggregate_id requis (identité autoritaire de la commande — I5)';
  END IF;

  -- Périmètre : le gestionnaire appartient à l'école ciblée.
  IF NOT EXISTS (SELECT 1 FROM public.school_users
                  WHERE user_id = v_uid AND school_id = p_school AND active = true) THEN
    RAISE EXCEPTION 'gestionnaire non membre de l''école';
  END IF;

  -- Permission + accès distant (première ligne ; le LAN ré-impose TOUT à l'application).
  IF NOT public.can_operate_budget(p_school, v_uid, p_op) THEN
    RAISE EXCEPTION 'permission insuffisante ou accès distant absent pour l''opération %', p_op;
  END IF;

  -- Émission de l'intention. kernel_emit force actor_id = auth.uid() (non-répudiation) et
  -- écrit atomiquement domain_events + audit_events. AUCUNE mutation financière.
  PERFORM public.kernel_emit(jsonb_build_object(
    'id',             v_id,
    'school_id',      p_school,
    'aggregate_type', 'budget',
    'aggregate_id',   p_aggregate_id,
    'event_type',     'BudgetOperationRequested',
    'correlation_id', v_corr,
    'payload', jsonb_build_object(
      'op',               p_op,
      'target',           p_target,
      'aggregate_id',     p_aggregate_id,
      'expected_version', p_expected_version,
      'data',             COALESCE(p_data, '{}'::jsonb),
      'note',             p_note,
      'idempotency_key',  v_id,
      'correlation_id',   v_corr
    )
  ));

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_budget_operation(uuid, text, text, uuid, integer, jsonb, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_budget_operation(uuid, text, text, uuid, integer, jsonb, uuid, text) TO authenticated;
