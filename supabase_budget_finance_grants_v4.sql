-- ============================================================
-- NotesCam — E4 : capacités FINANCIÈRES de Fondatrice & Coordonnateur
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent, re-jouable.
-- Requiert : supabase_governance_catalog.sql (table governance_roles seedée).
-- ============================================================
--
-- Fondatrice et Coordonnateur Général doivent disposer des MÊMES capacités
-- financières que l'Administrateur (créer/gérer budgets, lignes, allocations,
-- dépenses, opérations) — via permissions CONFIGURABLES, jamais un rôle codé en
-- dur. Ce script FUSIONNE (sans doublon) les droits manquants dans leurs lignes de
-- catalogue existantes. Miroir de src/governance/defaultCatalog.js + server/db.js.

WITH add_perms(v) AS (
  VALUES ('governance.manage'),('governance.view'),('budget.view'),('budget.prepare'),
         ('budget.submit'),('expense.view'),('expense.prepare'),('expense.submit'),
         ('budget.unlock.request'),('budget.reallocate.request'),('budget.annual.revise.request')
),
add_wf(v) AS (
  VALUES ('budget.validate.sector'),('budget.validate.finance'),('budget.approve'),
         ('budget.close'),('budget.reopen'),('expense.approve'),('expense.reject'),
         ('expense.pay'),('budget.unlock.decide'),('budget.reallocate.decide'),('budget.annual.revise')
)
UPDATE governance_roles gr SET
  permissions = (
    SELECT to_jsonb(array_agg(DISTINCT val)) FROM (
      SELECT jsonb_array_elements_text(COALESCE(gr.permissions, '[]'::jsonb)) AS val
      UNION SELECT v FROM add_perms
    ) s
  ),
  workflows = (
    SELECT to_jsonb(array_agg(DISTINCT val)) FROM (
      SELECT jsonb_array_elements_text(COALESCE(gr.workflows, '[]'::jsonb)) AS val
      UNION SELECT v FROM add_wf
    ) s
  ),
  updated_at = now()
WHERE gr.code IN ('fondatrice', 'coordonnateur_general');
