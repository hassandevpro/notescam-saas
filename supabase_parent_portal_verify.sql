-- supabase_parent_portal_verify.sql
-- CONTRÔLES en LECTURE SEULE autour de supabase_parent_portal.sql.
--
-- Aucune écriture, aucun DDL : que des SELECT. Se joue en TROIS temps, et le §A
-- doit être joué AVANT la migration — c'est lui qui fige l'état de référence
-- contre lequel le §C prouvera la non-régression.
--
--   §A  AVANT  — instantané de référence (policies, fonctions, périmètres)
--   §B  APRÈS  — l'espace parent est-il correctement posé ?
--   §C  APRÈS  — les 96 policies et 8 fonctions existantes sont-elles INTACTES ?
--
-- Le §C est le cœur du dispositif. « Je n'ai touché à rien » n'est pas une
-- affirmation vérifiable ; une comparaison d'empreintes l'est.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §A — À JOUER AVANT LA MIGRATION                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- A1. EMPREINTE DES POLICIES EXISTANTES.
--     Conservez la valeur rendue : le §C1 doit rendre EXACTEMENT la même.
--     Une seule policy modifiée, supprimée ou réécrite change l'empreinte.
SELECT count(*) AS nb_policies,
       md5(string_agg(schemaname||'.'||tablename||'|'||policyname||'|'||permissive||'|'||
                      cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),
                      E'\n' ORDER BY schemaname, tablename, policyname)) AS empreinte
  FROM pg_policies
 WHERE schemaname = 'public';

-- A2. EMPREINTE DES FONCTIONS DE CLOISONNEMENT.
--     Vérifier une migration au NOM d'une policy ne prouve rien : la policy
--     `secteur: cloisonnement` de `teachers` existait déjà alors que la FONCTION
--     qu'elle appelle était restée l'ancienne (constaté le 26/08/2026). On
--     compare donc les CORPS.
SELECT p.proname,
       md5(pg_get_functiondef(p.oid)) AS empreinte
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('user_scope_allows_class','user_scope_allows_student','user_scope_is_global',
                     'fee_scope_allows_class','fee_scope_allows_student',
                     'is_finance_officer','is_finance_reader','is_school_cashier',
                     'is_school_member','school_strict_roles','has_page_permission','can_see_school')
 ORDER BY p.proname;

-- A3. PÉRIMÈTRES RÉELS DES COMPTES (test 21). Aucun ne doit bouger.
SELECT su.school_id, su.role, su.scope_global,
       count(*) AS comptes
  FROM public.school_users su
 WHERE su.active
 GROUP BY su.school_id, su.role, su.scope_global
 ORDER BY su.school_id, su.role;

-- A4. AUTORITÉ FINANCIÈRE EN PLACE (test 22).
SELECT gr.school_id, gr.code, gr.permissions
  FROM public.governance_roles gr
 WHERE gr.permissions::text LIKE '%fees.%'
 ORDER BY gr.school_id, gr.code;

-- A5. L'espace parent n'existe pas encore : ces trois compteurs valent 0.
SELECT
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ('parent_accounts','parent_student_links')) AS tables_parent,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='schools' AND column_name='parent_show_rank') AS colonne_rang,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'parent\_%') AS fonctions_parent;

-- A6. Toutes les colonnes lues par les RPC existent-elles ? Une migration qui
--     échoue à mi-parcours pour un nom de colonne est une migration qu'on
--     n'aurait pas dû lancer.
SELECT c.table_name, count(*) AS colonnes
  FROM information_schema.columns c
 WHERE c.table_schema = 'public'
   AND c.table_name IN ('students','classes','schools','school_units','subjects','grades',
                        'appreciations','conduct','student_absences','attendance','late_arrivals',
                        'student_fees','student_fee_items','fee_payments','parent_meetings',
                        'notifications','apc_bulletins','prim_bulletins','mat_bulletins',
                        'prim_resultats_annuels')
 GROUP BY c.table_name ORDER BY c.table_name;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §B — APRÈS LA MIGRATION : l'espace parent est-il bien posé ?              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- B1. Les deux tables, avec RLS ACTIVÉE. `rls_on` doit valoir true partout.
SELECT c.relname, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('parent_accounts','parent_student_links');

-- B2. ÉCRITURE RÉVOQUÉE. Le résultat attendu est VIDE : ni anon ni authenticated
--     ne doit porter INSERT/UPDATE/DELETE sur ces tables. S'il y a des lignes,
--     un parent pourrait se rattacher lui-même un élève.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema='public'
   AND table_name IN ('parent_accounts','parent_student_links')
   AND grantee IN ('anon','authenticated')
   AND privilege_type IN ('INSERT','UPDATE','DELETE')
 ORDER BY table_name, grantee;

-- B3. Les RPC sont exécutables par `authenticated` et PAS par `anon` (test 20).
--     `anon_peut` doit valoir false sur toutes les lignes.
--
--     ⚠️ C'EST LE CONTRÔLE QUI A SERVI. Au 31/08/2026 il a rendu `anon_peut =
--     true` PARTOUT après la migration : sur Supabase, un ALTER DEFAULT
--     PRIVILEGES accorde EXECUTE sur toute nouvelle fonction à `anon`
--     NOMMÉMENT, si bien que le `REVOKE ALL … FROM public` du §15 ne lui
--     retirait rien. Corrigé par supabase_parent_portal_anon_revoke.sql.
--     Ne jamais supposer qu'un REVOKE FROM public suffit ici.
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authentifie_peut,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_peut
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public'
   AND (p.proname LIKE 'parent\_%' OR p.proname LIKE 'admin\_%parent%')
 ORDER BY p.proname;

-- B4. Toutes les RPC parent sont-elles SECURITY DEFINER avec search_path figé ?
--     Une seule qui ne le serait pas ouvrirait un détournement par search_path.
SELECT p.proname, p.prosecdef AS security_definer,
       coalesce(array_to_string(p.proconfig, ','), '(aucun)') AS config
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'parent\_%'
 ORDER BY p.proname;

-- B5. La policy de la boîte de notifications est bien BORNÉE au destinataire.
SELECT policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname='public' AND tablename='notifications' AND policyname LIKE '%parent%';

-- B6. Le portail PUBLIC par jeton est intact (il doit rester exécutable par anon).
SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_peut_toujours
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname = 'get_parent_portal_data';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §C — APRÈS : NON-RÉGRESSION (tests 21 et 22)                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- C1. EMPREINTE DES POLICIES — hors les 5 créées par la migration.
--     Doit être IDENTIQUE à A1, au caractère près. Une différence = une policy
--     existante a bougé, et la recette échoue.
--
--     ⚠️ Les nouvelles policies sont désignées NOMMÉMENT. Une première version
--     les écartait avec `policyname NOT LIKE '%parent%'` — ce qui excluait aussi
--     cinq policies PRÉEXISTANTES dont le nom contient « parent »
--     (« school members read parent_meetings », etc.). L'empreinte ne portait
--     alors pas sur le même ensemble que le §A et paraissait diverger alors que
--     rien n'avait bougé. Un contrôle de non-régression qui crie au loup est
--     aussi inutile qu'un contrôle qui dort.
WITH nouvelles(tbl, pol) AS (VALUES
  ('parent_accounts',      'parent_accounts: self read'),
  ('parent_student_links', 'parent_links: self read'),
  ('parent_student_links', 'parent_links: staff read'),
  ('notifications',        'notifications: parent inbox read'),
  ('notifications',        'notifications: parent mark read')
)
SELECT count(*) AS nb_policies,
       md5(string_agg(schemaname||'.'||tablename||'|'||policyname||'|'||permissive||'|'||
                      cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''),
                      E'\n' ORDER BY schemaname, tablename, policyname)) AS empreinte
  FROM pg_policies p
 WHERE schemaname = 'public'
   AND NOT EXISTS (SELECT 1 FROM nouvelles n WHERE n.tbl = p.tablename AND n.pol = p.policyname);

-- C2. EMPREINTE DES FONCTIONS DE CLOISONNEMENT — doit être IDENTIQUE à A2.
--     C'est la garantie que le cloisonnement THE GENIUS n'a pas été effleuré.
SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS empreinte
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('user_scope_allows_class','user_scope_allows_student','user_scope_is_global',
                     'fee_scope_allows_class','fee_scope_allows_student',
                     'is_finance_officer','is_finance_reader','is_school_cashier',
                     'is_school_member','school_strict_roles','has_page_permission','can_see_school')
 ORDER BY p.proname;

-- C3. Les policies RESTRICTIVES de cloisonnement sont toujours là, au complet.
SELECT tablename, policyname, permissive, cmd
  FROM pg_policies
 WHERE schemaname='public' AND permissive = 'RESTRICTIVE'
 ORDER BY tablename, policyname;

-- C4. Périmètres des comptes — doit être IDENTIQUE à A3.
SELECT su.school_id, su.role, su.scope_global, count(*) AS comptes
  FROM public.school_users su WHERE su.active
 GROUP BY su.school_id, su.role, su.scope_global
 ORDER BY su.school_id, su.role;

-- C5. Autorité financière — doit être IDENTIQUE à A4.
SELECT gr.school_id, gr.code, gr.permissions
  FROM public.governance_roles gr
 WHERE gr.permissions::text LIKE '%fees.%'
 ORDER BY gr.school_id, gr.code;

-- C6. AUCUN parent n'est entré dans school_users. Doit rendre 0.
--     C'est l'invariant central de toute l'architecture : si ce compteur n'est
--     pas nul, un compte parent a hérité des droits du personnel.
SELECT count(*) AS parents_dans_school_users
  FROM public.parent_accounts pa
  JOIN public.school_users su ON su.user_id = pa.user_id;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §D — TESTS SOUS IDENTITÉ RÉELLE                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Les §A à §C lisent le catalogue. Ils ne prouvent PAS ce qu'un compte donné
-- obtient réellement : les fonctions lisent `auth.uid()`, elles ne répondent
-- donc que pour un utilisateur connecté. La seule preuve est de se mettre à sa
-- place. Remplacez les deux UUID puis jouez le bloc.
--
-- ⚠️ L'API de gestion ne rend que la DERNIÈRE requête, et jamais les
--    RAISE NOTICE : on dépose donc les résultats dans une table TEMP qu'on lit
--    ensuite. (Leçon de l'audit du 26/08/2026.)
/*
BEGIN;
CREATE TEMP TABLE _res(test text, obtenu text) ON COMMIT DROP;

DO $$
DECLARE
  v_parent_a uuid := '<UUID DU PARENT A>';
  v_enfant_a uuid := '<UUID D UN ENFANT DU PARENT A>';
  v_enfant_b uuid := '<UUID D UN ELEVE D UN AUTRE PARENT>';
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_parent_a, 'role', 'authenticated')::text, true);

  INSERT INTO _res VALUES
    ('T1  parent voit son enfant',
     (public.parent_owns_student(v_enfant_a))::text),
    ('T2  parent ne voit PAS l''enfant B',
     (NOT public.parent_owns_student(v_enfant_b))::text),
    ('T3  notes de son enfant',
     (public.parent_child_grades(v_enfant_a) IS NOT NULL)::text),
    ('T4  notes de B refusees',
     (public.parent_child_grades(v_enfant_b) IS NULL)::text),
    ('T5  absences de son enfant',
     (public.parent_child_attendance(v_enfant_a) IS NOT NULL)::text),
    ('T6  absences de B refusees',
     (public.parent_child_attendance(v_enfant_b) IS NULL)::text),
    ('T7  frais de son enfant',
     (public.parent_child_fees(v_enfant_a, NULL::text) IS NOT NULL)::text),
    ('T8  frais de B refuses',
     (public.parent_child_fees(v_enfant_b, NULL::text) IS NULL)::text),
    ('T9  bulletin de son enfant',
     (public.parent_child_bulletins(v_enfant_a) IS NOT NULL)::text),
    ('T10 bulletin de B refuse',
     (public.parent_child_bulletins(v_enfant_b) IS NULL)::text),
    ('T18 acces direct students par ID',
     (SELECT count(*)::text FROM public.students WHERE id = v_enfant_b)),
    ('T18b acces direct a SES PROPRES enfants par table',
     (SELECT count(*)::text FROM public.students WHERE id = v_enfant_a)),
    ('T11 acces direct grades',
     (SELECT count(*)::text FROM public.grades WHERE student_id = v_enfant_b)),
    ('T13 acces direct fee_payments',
     (SELECT count(*)::text FROM public.fee_payments WHERE student_id = v_enfant_b)),
    ('T15 acces direct school_users',
     (SELECT count(*)::text FROM public.school_users)),
    ('T16 acces direct staff',
     (SELECT count(*)::text FROM public.staff)),
    ('T17 acces direct teachers',
     (SELECT count(*)::text FROM public.teachers));
END $$;

-- ATTENDU :
--   T1, T3, T5, T7, T9                  -> true
--   T2, T4, T6, T8, T10                 -> true  (le refus est bien constaté)
--   T11, T13, T15, T16, T17, T18, T18b  -> 0
--
-- T18b vaut 0 lui aussi, et c'est VOULU : même sur ses propres enfants, le
-- parent n'a aucun accès aux TABLES. Il ne lit que par les RPC. La donnée ne
-- transite jamais par un chemin qui pourrait, un jour, être élargi par erreur.
SELECT * FROM _res ORDER BY test;
ROLLBACK;
*/
