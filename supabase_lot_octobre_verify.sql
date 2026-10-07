-- VERIFICATION DE SCHEMA — lot octobre 2026. Lecture seule, rejouable.
-- UNE SEULE instruction : la coller dans un onglet de requete VIDE et lancer
-- SANS RIEN SURLIGNER (le SQL Editor n'execute que la selection s'il y en a une).
--
-- DEJA ETABLI le 2026-10-06, avant application :
--   • supabase_apc_anglophone.sql  -> APPLIQUE (form1..form5 = 5/5, matieres = 2/2)
--   • volumetrie de reference : apc_notes 1093 · classes 284 · mat_observations 443
--     prim_notes 1978 · subjects 2183 · sync_tombstones 18254
--     -> aucune de ces valeurs ne doit BAISSER apres application.

WITH checks(domaine, objet, present) AS (VALUES

  -- 1) PRIMAIRE
  ('primaire · prim_note_points_max', 'prim_notes.points_max (colonne)',
   (SELECT count(*) > 0 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='prim_notes' AND column_name='points_max')),
  ('primaire · prim_note_points_max', 'contrainte prim_notes_points_max_sain',
   (SELECT count(*) > 0 FROM pg_constraint
     WHERE conname='prim_notes_points_max_sain' AND conrelid='public.prim_notes'::regclass)),

  -- 2) APC
  ('apc · apc_note_max', 'apc_notes.note_max (colonne)',
   (SELECT count(*) > 0 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='apc_notes' AND column_name='note_max')),
  ('apc · apc_note_max', 'contrainte apc_notes_note_max_chk',
   (SELECT count(*) > 0 FROM pg_constraint
     WHERE conname='apc_notes_note_max_chk' AND conrelid='public.apc_notes'::regclass)),

  -- 3) MATERNELLE
  ('maternelle · mat_observation_sans_cote', 'mat_observations.niveau_acquis NULLABLE',
   (SELECT is_nullable = 'YES' FROM information_schema.columns
     WHERE table_schema='public' AND table_name='mat_observations' AND column_name='niveau_acquis')),
  ('maternelle · mat_observation_sans_cote', 'contrainte mat_observations_niveau_acquis_valide',
   (SELECT count(*) > 0 FROM pg_constraint
     WHERE conname='mat_observations_niveau_acquis_valide'
       AND conrelid='public.mat_observations'::regclass)),

  -- 4) PORTAIL PARENT
  ('parent · parent_portal', 'table parent_accounts',
   (SELECT to_regclass('public.parent_accounts') IS NOT NULL)),
  ('parent · parent_portal', 'table parent_student_links',
   (SELECT to_regclass('public.parent_student_links') IS NOT NULL)),
  ('parent · parent_portal', 'RLS active sur les 2 tables parent',
   (SELECT count(*) = 2 FROM pg_class
     WHERE relname IN ('parent_accounts','parent_student_links') AND relrowsecurity)),
  ('parent · parent_portal', 'les 16 fonctions parent_* / admin_*parent*',
   (SELECT count(DISTINCT proname) = 16 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND proname IN (
       'parent_owns_student','is_parent_account','parent_context','parent_child_grades',
       'parent_child_bulletins','parent_child_attendance','parent_child_fees',
       'parent_child_documents','parent_notifications','parent_dashboard',
       'parent_update_profile','can_manage_parent_links','admin_create_parent_account',
       'admin_link_parent_student','admin_revoke_parent_link','admin_list_parent_links'))),
  ('parent · parent_portal_search', 'fonction admin_search_parent_accounts',
   (SELECT count(*) > 0 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND proname='admin_search_parent_accounts')),

  -- 5) SYNCHRONISATION
  ('sync · sync_phase2', 'table sync_tombstones',
   (SELECT to_regclass('public.sync_tombstones') IS NOT NULL)),
  ('sync · sync_phase2', 'fonction touch_sync_row',
   (SELECT count(*) > 0 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND proname='touch_sync_row')),
  ('sync · tombstone_school_guard', 'log_tombstone() corrige (lit via to_jsonb(OLD))',
   (SELECT count(*) > 0 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND proname='log_tombstone'
       AND pg_get_functiondef(p.oid) ILIKE '%to_jsonb(OLD)%')),

  -- 6) DELEGATION / RLS
  ('rls · fix_classes_delegation', 'policy ecriture classes via has_page_permission',
   (SELECT count(*) > 0 FROM pg_policies
     WHERE schemaname='public' AND tablename='classes'
       AND (qual ILIKE '%has_page_permission%' OR with_check ILIKE '%has_page_permission%'))),
  ('rls · fix_classes_with_check', 'fonctions user_scope_allows_class_row + user_scope_allows_class',
   (SELECT count(DISTINCT proname) = 2 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND proname IN ('user_scope_allows_class_row','user_scope_allows_class'))),
  ('rls · fix_classes_with_check', 'policy classes evalue user_scope_allows_class_row',
   (SELECT count(*) > 0 FROM pg_policies
     WHERE schemaname='public' AND tablename='classes'
       AND with_check ILIKE '%user_scope_allows_class_row%')),
  ('rls · fix_subjects_delegation', 'policy ecriture subjects via has_page_permission',
   (SELECT count(*) > 0 FROM pg_policies
     WHERE schemaname='public' AND tablename='subjects'
       AND (qual ILIKE '%has_page_permission%' OR with_check ILIKE '%has_page_permission%')))
)

-- BLOC 1 — etat objet par objet
SELECT '1-schema' AS bloc, domaine AS sujet, objet AS detail,
       CASE WHEN present THEN 'OK' ELSE 'MANQUANT' END AS etat
  FROM checks

UNION ALL

-- BLOC 2 — colonnes de sync sur les 17 tables repliquees (3/3 attendu partout)
SELECT '2-colonnes-sync', v.t, 'updated_at / version / device_id',
       (SELECT count(*) FROM information_schema.columns c
         WHERE c.table_schema='public' AND c.table_name = v.t
           AND c.column_name IN ('updated_at','version','device_id'))::text || '/3'
  FROM (VALUES ('schools'),('school_users'),('academic_periods'),('classes'),('subjects'),
               ('students'),('teachers'),('grades'),('student_fees'),('fee_payments'),
               ('attendance'),('student_absences'),('student_class_assignments'),
               ('school_messages'),('teacher_notifications'),('sequence_dates'),
               ('timetable_slots')) v(t)
 WHERE to_regclass('public.'||v.t) IS NOT NULL

-- 'MANQUANT' < 'OK' et '0/3' < '3/3' en tri alphabetique : les manques remontent.
ORDER BY 1, 4, 2, 3;
