-- supabase_fix_perimetre_mort_verify.sql
-- LECTURE SEULE — contrôle d'après-correctif. N'écrit rien.
-- À jouer après supabase_fix_perimetre_mort.sql.
-- ============================================================================

-- V1. Plus AUCUN compte aveugle (scope_global=false + trois tableaux vides).
--     Attendu : 0 ligne.
SELECT 'V1 compte aveugle restant' AS controle, s.name AS ecole, su.role, su.full_name
  FROM public.school_users su JOIN public.schools s ON s.id = su.school_id
 WHERE su.scope_global = false
   AND coalesce(array_length(su.scope_cycles,   1), 0) = 0
   AND coalesce(array_length(su.scope_sections, 1), 0) = 0
   AND coalesce(array_length(su.scope_class_ids,1), 0) = 0;

-- V2. Les comptes RÉELLEMENT cloisonnés le sont restés (ex. THE GENIUS).
--     Attendu : les lignes d'avant, inchangées.
SELECT 'V2 cloisonnement conservé' AS controle, s.name AS ecole, su.role, su.full_name,
       su.scope_cycles, su.scope_sections,
       coalesce(array_length(su.scope_class_ids,1),0) AS n_classes
  FROM public.school_users su JOIN public.schools s ON s.id = su.school_id
 WHERE su.scope_global = false
 ORDER BY s.name, su.full_name;

-- V3. Chaque compte enseignant : fiche rattachée + charge réelle.
--     `fiche_teacher = NULL` → l'admin doit créer l'accès depuis Enseignants.
SELECT 'V3 charge enseignant' AS controle, s.name AS ecole, su.full_name,
       t.id AS fiche_teacher,
       (SELECT count(*) FROM public.classes  c  WHERE c.teacher_id  = t.id) AS classes_titulaire,
       (SELECT count(*) FROM public.subjects sj WHERE sj.teacher_id = t.id) AS matieres,
       su.scope_global
  FROM public.school_users su
  JOIN public.schools s ON s.id = su.school_id
  LEFT JOIN public.teachers t ON t.auth_user_id = su.user_id AND t.school_id = su.school_id
 WHERE su.role = 'teacher' AND su.active = true
 ORDER BY s.name, su.full_name;

-- V4. Le prédicat répond bien pour un enseignant donné, sous SES claims JWT.
--     Remplacer les deux UUID, puis exécuter le bloc entier d'un seul tenant.
--     Attendu : autorise = true sur chacune de ses classes.
-- BEGIN;
--   SELECT set_config('request.jwt.claims',
--          json_build_object('sub', '<AUTH_USER_ID_DE_L_ENSEIGNANT>')::text, true);
--   SELECT c.name,
--          public.user_scope_allows_class(c.school_id, c.id) AS autorise,
--          public.user_teaches_class(c.school_id, c.id)      AS assure
--     FROM public.classes c
--    WHERE c.school_id = '<SCHOOL_ID>'
--    ORDER BY c.name;
-- ROLLBACK;

-- V5. Les trois RPC de création posent bien scope_global.
--     Attendu : 3 lignes à true.
SELECT 'V5 rpc pose scope_global' AS controle, p.proname,
       pg_get_functiondef(p.oid) LIKE '%scope_global%' AS pose_scope_global
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('admin_create_teacher_account', 'signup_teacher', 'admin_create_staff_account')
 ORDER BY p.proname;
