-- supabase_genius_role_permissions_verify.sql
-- CONTRÔLES en LECTURE SEULE autour de supabase_genius_role_permissions.sql.
--
-- Aucune écriture, aucun DDL : ce fichier ne fait que des SELECT. Il se joue en
-- DEUX temps, et le §A doit être joué AVANT la migration — c'est lui qui
-- confirme l'identifiant de l'école et fige l'état de référence du retour arrière.
--
--   §A  AVANT  — inventaire et instantané de référence
--   §B  APRÈS  — la matrice d'autorité est-elle bien posée ?
--   §C  APRÈS  — non-régression des AUTRES écoles
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §A — À JOUER AVANT LA MIGRATION                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- A1. Quelle est la bonne école ? Deux portent « genius » : on veut celle qui a
--     ~11 membres, pas « The Genius International School » (1 membre).
--     👉 REPORTEZ l'id obtenu dans la §9 de la migration s'il diffère.
SELECT s.id, s.name, s.strict_role_enforcement,
       (SELECT count(*) FROM school_users su WHERE su.school_id = s.id) AS membres
  FROM schools s
 WHERE s.name ILIKE '%genius%'
 ORDER BY membres DESC;

-- A2. Rôles, capacités et périmètres réels des comptes (état de référence).
SELECT su.full_name, su.role, su.scope_global, su.scope_cycles, su.scope_sections,
       coalesce(array_length(su.scope_class_ids, 1), 0) AS nb_classes,
       su.permissions
  FROM school_users su
 WHERE su.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY su.role, su.full_name;

-- A3. Rôles de gouvernance déjà attribués.
SELECT ugr.user_id, ugr.role, ugr.sector, ugr.status, ugr.start_date, ugr.end_date
  FROM user_governance_roles ugr
 WHERE ugr.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY ugr.role;

-- A4. Le catalogue de gouvernance est-il amorcé pour cette école ?
--     Vide ⇒ la migration l'amorcera elle-même (apply_strict_role_matrix).
SELECT gr.code, gr.name, gr.scope, gr.sector, gr.rank, gr.permissions, gr.workflows
  FROM governance_roles gr
 WHERE gr.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY gr.rank DESC;

-- A5. ⚠️ COMBIEN D'ENSEIGNANTS SONT AUJOURD'HUI GLOBAUX ?
--     Le backfill de la Phase 2 a posé scope_global = true pour tout compte aux
--     trois tableaux vides — donc, très probablement, pour TOUS les enseignants.
--     Tant que ce chiffre n'est pas ramené à 0, la règle « aucun enseignant du
--     Collège n'accède au Primaire » N'EST PAS TENUE, quelles que soient les
--     policies : un compte global les traverse toutes.
SELECT count(*) FILTER (WHERE scope_global) AS enseignants_globaux,
       count(*)                             AS enseignants_total
  FROM school_users
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' AND role = 'teacher';

-- A6. Enseignants dont le secteur ne pourra PAS être dérivé (aucune classe, aucune
--     matière). Ils resteront visibles de tous — c'est voulu, mais il faut savoir
--     lesquels. Idéalement : liste vide.
SELECT t.id, t.name
  FROM teachers t
 WHERE t.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
   AND NOT EXISTS (SELECT 1 FROM classes  c WHERE c.school_id = t.school_id AND c.teacher_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM subjects s
                    JOIN classes c2 ON c2.id = s.class_id
                   WHERE c2.school_id = t.school_id AND s.teacher_id = t.id)
 ORDER BY t.name;

-- A7. Classes dont le secteur est INDÉTERMINÉ (ni cycle ni section exploitables).
--     Une telle classe ne compte dans aucun secteur : ses enseignants seraient
--     traités comme « sans secteur ». Idéalement : liste vide.
SELECT c.id, c.name, c.cycle, c.section
  FROM classes c
 WHERE c.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
   AND coalesce(c.section, '') NOT IN ('maternelle','primaire','premier_cycle','second_cycle')
   AND coalesce(c.cycle,   '') NOT IN ('maternelle','primaire','secondaire')
 ORDER BY c.name;

-- A9. ⚠️ ANGLE MORT DE A6 — comptes enseignants NON RELIÉS à une fiche `teachers`.
--     Le backfill de périmètre joint `school_users.user_id` à `teachers.auth_user_id` :
--     un compte dont la fiche enseignant n'est pas reliée N'EST PAS TOUCHÉ et
--     resterait donc `scope_global = true`, c'est-à-dire capable de traverser le
--     cloisonnement. A6 ne les voit pas (elle part des fiches, pas des comptes).
--     Idéalement : liste vide. Sinon, relier la fiche AVANT le backfill.
SELECT su.id AS school_user_id, su.full_name, su.user_id, su.scope_global
  FROM school_users su
 WHERE su.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
   AND su.role = 'teacher' AND su.active = true
   AND NOT EXISTS (SELECT 1 FROM teachers t
                    WHERE t.school_id = su.school_id AND t.auth_user_id = su.user_id)
 ORDER BY su.full_name;

-- A8. INSTANTANÉ DE RÉFÉRENCE des policies — à conserver hors base (copier le
--     résultat). C'est la pièce qui prouve, après coup, que rien d'autre n'a bougé.
SELECT tablename, policyname, permissive, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('classes','students','subjects','grades','student_absences',
                     'timetable_slots','student_class_assignments','apc_notes',
                     'prim_notes','mat_observations','student_fees','fee_payments',
                     'class_fee_grids','teachers','staff','attendance','late_arrivals',
                     'student_warnings','student_detentions','disciplinary_incidents',
                     'disciplinary_actions','exit_permissions','parent_meetings',
                     'student_fee_items')
 ORDER BY tablename, policyname;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §B — À JOUER APRÈS LA MIGRATION                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- B1. Le drapeau n'est levé QUE sur THE GENIUS. Attendu : une seule ligne.
SELECT id, name, strict_role_enforcement
  FROM schools WHERE strict_role_enforcement = true;

-- B2. La matrice d'autorité est-elle posée ? Attendu :
--       fees.manage         → caissier, raf, coordonnateur_general, fondatrice
--       fees.view           → controleur (ET AUCUNE clé d'écriture)
--       staff.manage.sector → principal, vice_principal, directrice_primaire,
--                             directrice_adjointe_primaire, responsable_maternelle
--       staff.manage.all    → fondatrice, coordonnateur_general, raf
SELECT gr.code,
       gr.permissions @> '["fees.manage"]'         AS peut_gerer_frais,
       gr.permissions @> '["fees.view"]'           AS peut_lire_frais,
       gr.permissions @> '["staff.manage.sector"]' AS gere_personnel_secteur,
       gr.permissions @> '["staff.manage.all"]'    AS gere_personnel_tout
  FROM governance_roles gr
 WHERE gr.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY gr.rank DESC;

-- B3. ⚠️ LE CONTRÔLEUR EST-IL BIEN EN LECTURE SEULE ?
--     Attendu : peut_lire = true, peut_ecrire = false. Si peut_ecrire ressort
--     true, la décision « Contrôleur en lecture seule » n'est PAS tenue.
SELECT gr.code,
       gr.permissions @> '["fees.view"]'   AS peut_lire,
       gr.permissions @> '["fees.manage"]' AS peut_ecrire,
       gr.workflows                        AS workflows_detenus
  FROM governance_roles gr
 WHERE gr.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
   AND gr.code = 'controleur';

-- B4. Le cloisonnement couvre-t-il bien les 24 tables attendues ?
--     12 de la Phase 2, + 12 ajoutées ici : les 9 tables de vie scolaire,
--     class_fee_grids, teachers et staff. (Vérifié en production : 24.)
SELECT count(*) AS tables_cloisonnees
  FROM pg_policies
 WHERE schemaname = 'public' AND policyname = 'secteur: cloisonnement';

SELECT tablename FROM pg_policies
 WHERE schemaname = 'public' AND policyname = 'secteur: cloisonnement'
 ORDER BY tablename;

-- B5. `fee_payments` reste-t-il inviolable ? Attendu : UPDATE/DELETE/ALL = 0.
SELECT count(*) FILTER (WHERE cmd IN ('UPDATE','DELETE')) AS effacements_possibles,
       count(*) FILTER (WHERE cmd = 'INSERT')             AS encaissements
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'fee_payments' AND permissive = 'PERMISSIVE';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §C — NON-RÉGRESSION DES AUTRES ÉCOLES                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- C1. Aucune autre école ne doit avoir reçu les clés d'autorité de la Phase 3.
--     Attendu : 0 ligne.
SELECT gr.school_id, s.name, gr.code, gr.permissions
  FROM governance_roles gr JOIN schools s ON s.id = gr.school_id
 WHERE gr.school_id <> '6b68407b-3d2e-426b-81ff-c4e68e66120a'
   AND (gr.permissions @> '["fees.manage"]'
     OR gr.permissions @> '["fees.view"]'
     OR gr.permissions @> '["staff.manage.sector"]'
     OR gr.permissions @> '["staff.manage.all"]');

-- C2. Aucun membre d'une autre école ne doit voir son secteur changer : la
--     colonne `staff.sector` doit être NULL partout ailleurs. Attendu : 0.
SELECT count(*) AS personnel_sectorise_hors_genius
  FROM staff
 WHERE sector IS NOT NULL
   AND school_id <> '6b68407b-3d2e-426b-81ff-c4e68e66120a';

-- C3. Pour une école non stricte, les prédicats financiers doivent être
--     rigoureusement neutres. Attendu : strict = false pour toutes.
SELECT s.id, s.name, public.school_strict_roles(s.id) AS strict
  FROM schools s
 WHERE s.id <> '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY s.name;
