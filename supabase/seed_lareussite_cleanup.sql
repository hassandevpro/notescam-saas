-- ════════════════════════════════════════════════════════════════════════════
-- NETTOYAGE du jeu de données E2E « COMPLEXE SCOLAIRE BILINGUE LA RÉUSSITE »
-- École de test hybride : 31c70a36-065e-4933-a40c-1e9c051d1afc
-- Supprime EXACTEMENT les lignes marquées device_id='seed-lareussite-v1'
-- (+ unités/gouvernance/comptes du seed). N'affecte JAMAIS MAARIF ni une autre
-- école. Le compte fondateur hfiwdsjfci@gmail.com (login réel) est CONSERVÉ ;
-- seule son adhésion/rôle de seed est retirée.
-- Idempotent, ré-exécutable.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
DELETE FROM audit_events            WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND payload->>'seed'='seed-lareussite-v1';
DELETE FROM domain_events           WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM notifications           WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM budget_unlock_requests  WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM budget_expenses         WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM budget_chapters         WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM budgets                 WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM fee_payments            WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM student_fee_items       WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM student_fees            WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM class_fee_grids         WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM fee_catalog             WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM exit_permissions        WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM parent_meetings         WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM student_detentions      WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM student_warnings        WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM disciplinary_actions    WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM disciplinary_incidents  WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM late_arrivals           WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM absences                WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc';
DELETE FROM grades                  WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM student_class_assignments WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM students                WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM subjects                WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM classes                 WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM sequence_dates          WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM academic_periods        WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM staff                   WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM teachers                WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM school_units            WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc';
DELETE FROM user_governance_roles   WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM school_users            WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
-- Comptes de seed uniquement (la fondatrice hfiwdsjfci@gmail.com est préservée)
DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@lareussite.test');
DELETE FROM auth.users      WHERE email LIKE '%@lareussite.test';
COMMIT;
