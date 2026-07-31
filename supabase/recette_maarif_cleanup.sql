-- ════════════════════════════════════════════════════════════════════════════
-- NETTOYAGE de la recette MAARIF — retire UNIQUEMENT les données [RECETTE].
-- Ne touche AUCUNE donnée historique de MAARIF. À exécuter quand la recette est finie.
--   supabase db query --linked -f supabase/recette_maarif_cleanup.sql
-- Identifiants ciblés : emails @maarif.test, UUID a0000000-…/b0000000-…, école B.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1. Échantillon pédagogique de recette dans MAARIF (notes → élèves → matières → classe).
DELETE FROM grades   WHERE class_id = 'a0000000-0000-4000-9000-000000000c01';
DELETE FROM students WHERE class_id = 'a0000000-0000-4000-9000-000000000c01';
DELETE FROM subjects WHERE class_id = 'a0000000-0000-4000-9000-000000000c01';
DELETE FROM classes  WHERE id       = 'a0000000-0000-4000-9000-000000000c01';

-- 2. Établissement B : on supprime d'abord ses enfants explicitement, puis la
--    ligne `schools`. NB : un trigger cloud `trg_tomb_schools` (log_tombstone) est
--    bogué sur la SUPPRESSION d'une école (il référence OLD.school_id, absent de la
--    table schools) → on le désactive le temps de ce seul DELETE, puis on le rétablit.
DELETE FROM grades      WHERE school_id = 'b0000000-0000-4000-8000-0000000000b1';
DELETE FROM students    WHERE school_id = 'b0000000-0000-4000-8000-0000000000b1';
DELETE FROM subjects    WHERE school_id = 'b0000000-0000-4000-8000-0000000000b1';
DELETE FROM classes     WHERE school_id = 'b0000000-0000-4000-8000-0000000000b1';
DELETE FROM school_users WHERE school_id = 'b0000000-0000-4000-8000-0000000000b1';
ALTER TABLE schools DISABLE TRIGGER trg_tomb_schools;
DELETE FROM schools WHERE id = 'b0000000-0000-4000-8000-0000000000b1';
ALTER TABLE schools ENABLE TRIGGER trg_tomb_schools;

-- 3. Comptes de recette (memberships + rôles gouvernance + auth).
DELETE FROM user_governance_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@maarif.test');
DELETE FROM school_users          WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@maarif.test');
DELETE FROM auth.identities        WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@maarif.test');
DELETE FROM auth.users             WHERE email LIKE '%@maarif.test';

-- 4. (OPTIONNEL — changements de CONFIG, décommenter pour tout restaurer)
-- Retirer l'autorité d'approbation ajoutée au coordonnateur :
-- UPDATE governance_roles SET permissions = permissions - 'expense.approve' - 'expense.reject' - 'budget.approve'
--   WHERE school_id = '369fa0e3-318f-4130-94b3-6f14d007ca85' AND code = 'coordonnateur_general';
-- Ré-activer l'hybride LAN (uniquement si un serveur LAN existe) :
--   supabase db query --linked -f supabase/pilot_activate_maarif.sql

COMMIT;
