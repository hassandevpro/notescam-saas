-- supabase_governance_decisions.sql — H3-b : décision de gouvernance à distance.
--
-- Le Cloud n'écrit JAMAIS la finance : cette RPC émet uniquement un ÉVÉNEMENT de
-- décision (via kernel_emit → actor_id = auth.uid(), audit atomique, idempotence
-- par id). Le serveur LAN reçoit l'événement (canal H3-a) puis VÉRIFIE et APPLIQUE
-- (server/governanceApply.verifyRemoteDecision) — le LAN est l'unique autorité.
--
-- La vérification de permission ci-dessous est une PREMIÈRE LIGNE de filtre ; le
-- plafond de montant (barème) est ré-imposé AUTORITAIREMENT par le LAN. Aucune
-- application financière n'a lieu côté Cloud.
--
-- Prérequis : supabase_domain_events.sql (kernel_emit), supabase_governance*.sql.
-- À coller dans Supabase → SQL Editor → Run. Aucune nouvelle table.

-- Le décideur détient-il, dans cette école, un rôle de gouvernance ACTIF portant la
-- permission requise ? (admin = toujours.) Le montant est vérifié côté LAN.
CREATE OR REPLACE FUNCTION public.can_decide_expense(p_school uuid, p_uid uuid, p_decision text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.school_users
             WHERE school_id = p_school AND user_id = p_uid AND active = true AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_governance_roles ugr
        JOIN public.governance_roles gr
          ON gr.school_id = ugr.school_id AND gr.code = ugr.role
       WHERE ugr.school_id = p_school AND ugr.user_id = p_uid AND gr.active = true
         AND (gr.permissions)::jsonb ? (CASE p_decision WHEN 'approve' THEN 'expense.approve' ELSE 'expense.reject' END)
    );
$$;
REVOKE ALL ON FUNCTION public.can_decide_expense(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.can_decide_expense(uuid, uuid, text) TO authenticated;

-- Émet la décision (approve|refuse) sur une dépense pour laquelle une DEMANDE
-- (ExpenseRemoteApprovalRequested) est présente dans le journal cloud. Renvoie l'id
-- de l'événement de décision (= idempotency_key).
CREATE OR REPLACE FUNCTION public.submit_governance_decision(
  p_expense_id uuid,
  p_decision text,
  p_expected_version integer,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_req    public.domain_events%ROWTYPE;
  v_school uuid;
  v_amount numeric;
  v_type   text;
  v_id     uuid := gen_random_uuid();
BEGIN
  IF p_decision NOT IN ('approve', 'refuse') THEN
    RAISE EXCEPTION 'décision invalide (approve|refuse attendus)';
  END IF;

  -- Dernière DEMANDE d'approbation connue pour cette dépense (arrivée via H3-a).
  SELECT * INTO v_req FROM public.domain_events
    WHERE aggregate_id = p_expense_id
      AND event_type = 'ExpenseRemoteApprovalRequested'
    ORDER BY seq DESC LIMIT 1;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'aucune demande d''approbation en attente pour cette dépense';
  END IF;
  v_school := v_req.school_id;
  v_amount := COALESCE((v_req.payload->>'amount')::numeric, 0);

  -- Périmètre : le décideur appartient à l'école ciblée.
  IF NOT EXISTS (SELECT 1 FROM public.school_users
                  WHERE user_id = v_uid AND school_id = v_school AND active = true) THEN
    RAISE EXCEPTION 'décideur non membre de l''école';
  END IF;

  -- Permission (première ligne de filtre ; le plafond de montant est ré-imposé au LAN).
  IF NOT public.can_decide_expense(v_school, v_uid, p_decision) THEN
    RAISE EXCEPTION 'permission insuffisante pour cette décision';
  END IF;

  v_type := CASE p_decision WHEN 'approve' THEN 'ExpenseApprovalGranted' ELSE 'ExpenseApprovalRefused' END;

  -- Émission via kernel_emit : actor_id forcé = auth.uid() (non-répudiation), audit
  -- atomique. idempotency_key = id de cet événement. AUCUNE écriture financière.
  PERFORM public.kernel_emit(jsonb_build_object(
    'id',             v_id,
    'school_id',      v_school,
    'aggregate_type', 'expense',
    'aggregate_id',   p_expense_id,
    'event_type',     v_type,
    'payload', jsonb_build_object(
      'expense_id',       p_expense_id,
      'decision',         p_decision,
      'expected_version', p_expected_version,
      'amount',           v_amount,
      'note',             p_note,
      'idempotency_key',  v_id,
      'request_event_id', v_req.id
    )
  ));

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_governance_decision(uuid, text, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_governance_decision(uuid, text, integer, text) TO authenticated;
