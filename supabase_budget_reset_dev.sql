-- ============================================================
-- NotesCam — RESET des données budgétaires de DÉVELOPPEMENT (Cloud / Supabase)
-- À N'EXÉCUTER QUE sur un environnement de test/dev (aucune école en production).
-- Ne touche AUCUN autre module. À coller dans Supabase → SQL Editor → Run.
-- ============================================================
--
-- Contexte : cutover vers le modèle budgétaire hiérarchique (annual → period →
-- sector). Aucune donnée budgétaire client réelle à préserver. On vide uniquement
-- le domaine budgétaire ; TRUNCATE … CASCADE reste confiné à ces tables (leurs FK
-- ne pointent que d'autres tables budgétaires vers budgets/chapters).
--
-- ⚠️ Ne PAS exécuter en production.

BEGIN;

TRUNCATE TABLE
  budget_reallocations,
  budget_revisions,
  budget_unlock_requests,
  budget_expenses,
  budget_chapters,
  budgets
RESTART IDENTITY CASCADE;

COMMIT;
