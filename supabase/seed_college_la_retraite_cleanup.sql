-- ════════════════════════════════════════════════════════════════════════════
-- NETTOYAGE de l'établissement de démonstration « COLLÈGE LA RETRAITE »
-- École : 8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8
--
-- Supprime TOUT l'établissement de démonstration et ses 16 comptes
-- (@laretraite.demo). N'affecte JAMAIS une autre école : chaque suppression est
-- bornée par le school_id ci-dessus, et les comptes par le domaine de courriel.
--
-- Idempotent, ré-exécutable. À coller dans Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_school uuid := '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8';
  t text;
  -- Ordre FK-safe : enfants d'abord. Ne pas se reposer sur la seule cascade
  -- `schools ON DELETE CASCADE` — plusieurs FK internes sont en ON DELETE
  -- RESTRICT (budget_line_periods → budget_periods, budget_line_sectors →
  -- school_units…) et bloqueraient la suppression de l'école.
  tables text[] := ARRAY[
    'audit_events','domain_events','notification_outbox','notifications',
    'signalement_comments','signalement_history','signalements',
    'asset_expenses','asset_repairs','asset_breakdowns','assets',
    'hr_payroll_items','hr_payroll','hr_payroll_catalog','hr_attendance',
    'hr_career_events','hr_evaluations','hr_leaves','hr_contracts',
    'exit_permissions','parent_meetings','student_detentions','student_warnings',
    'disciplinary_actions','disciplinary_incidents','late_arrivals','discipline_statistics',
    'budget_line_reallocations','budget_unlock_requests','budget_expenses',
    'budget_line_sectors','budget_line_periods','budget_revisions',
    'budget_reallocations','budget_chapters','budgets','budget_periods',
    'cash_sessions','fee_payments','student_fee_items','student_fees',
    'class_fee_grids','fee_catalog',
    'attendance','student_absences','student_class_assignments','timetable_slots',
    'grades','students','subjects','classes',
    'sequence_dates','academic_periods',
    'staff','teachers','school_units',
    'governance_role_history','user_governance_roles','governance_roles',
    'school_messages','teacher_notifications','school_users'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE school_id = %L', t, v_school);
    END IF;
  END LOOP;
END $$;

-- Comptes du jeu de démonstration (tous en @laretraite.demo — aucun compte réel).
DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@laretraite.demo');
DELETE FROM auth.users      WHERE email LIKE '%@laretraite.demo';

-- L'école elle-même (créée par le seed : on la retire aussi).
DELETE FROM schools WHERE id = '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8';

COMMIT;
