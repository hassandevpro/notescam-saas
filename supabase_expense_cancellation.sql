-- ============================================================
-- NotesCam — Dépenses : ANNULATION TRACÉE (statut `cancelled`)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_expenses.sql.
-- ============================================================
--
-- Remplace la suppression physique d'une dépense (qui a pu compter dans le budget
-- engagé) par une ANNULATION conservée et auditable. Le statut `cancelled` est
-- terminal, verrouillé (lecture seule), et EXCLU des agrégats de « consommé »
-- exactement comme `rejected` (cf. lib/expenseEngine.js — COMMITTING_STATUSES).
--
-- Seule une dépense en `draft` (aucun impact budgétaire) reste supprimable
-- physiquement côté application ; tout autre statut passe par l'annulation.

ALTER TABLE budget_expenses ADD COLUMN IF NOT EXISTS cancel_reason text; -- motif (obligatoire côté UI)
ALTER TABLE budget_expenses ADD COLUMN IF NOT EXISTS cancelled_by  text; -- auteur de l'annulation
ALTER TABLE budget_expenses ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz; -- date de l'annulation

-- Rappel : la colonne `status` reste un simple text (pas de CHECK contraignant),
-- donc la valeur 'cancelled' est acceptée sans migration de contrainte. Les
-- anciennes dépenses ne sont pas modifiées.
