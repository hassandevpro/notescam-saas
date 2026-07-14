-- ============================================================
-- NotesCam — Budgets : DATES RÉELLES D'EXERCICE + mois de début d'année scolaire
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert supabase_budgets.sql.
-- ============================================================
--
-- Phase D : un budget porte désormais des dates d'exercice explicites
-- (start_date / end_date). NULLABLES → zéro régression : les budgets créés avant
-- cette phase dérivent leurs bornes à la lecture depuis academic_year +
-- period_type + period_ref + le mois de début d'année scolaire (cf.
-- lib/budgetEngine.budgetPeriodBounds). Aucune écriture de masse.
--
-- Le mois de début d'année scolaire est configurable PAR ÉTABLISSEMENT
-- (schools.school_year_start_month, 1..12). NULL ⇒ septembre par défaut côté app.

ALTER TABLE budgets ADD COLUMN IF NOT EXISTS start_date date; -- début réel d'exercice
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS end_date   date; -- fin réelle (inclusive)

ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_year_start_month smallint; -- 1..12 ; NULL = 9 (septembre)
