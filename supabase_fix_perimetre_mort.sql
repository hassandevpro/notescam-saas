-- supabase_fix_perimetre_mort.sql
-- CORRECTIF — « Aucune classe assignée » chez un enseignant pourtant affecté.
--
-- ── LE DÉFAUT ───────────────────────────────────────────────────────────────
-- `supabase_sector_isolation.sql` a posé sur classes / subjects / students /
-- grades une policy RESTRICTIVE qui délègue à `user_scope_allows_class`. Cette
-- fonction refuse TOUT quand le compte a `scope_global = false` et ses trois
-- tableaux de périmètre vides.
--
-- Or `school_users.scope_global` a pour DÉFAUT `false`, et aucune des trois RPC
-- de création de compte (`admin_create_teacher_account`, `signup_teacher`,
-- `admin_create_staff_account`) ne renseigne cette colonne. La migration
-- d'isolation avait bien remis `scope_global = true` sur les comptes existants
-- — mais une seule fois, à son exécution. Donc :
--
--     TOUT COMPTE CRÉÉ DEPUIS CETTE MIGRATION NAÎT AVEUGLE.
--
-- L'enseignant est correctement affecté à sa classe et à ses matières, l'admin
-- le voit dans Enseignants avec sa charge, mais la RLS lui cache classes,
-- matières, élèves et notes. L'écran Saisie des notes n'a alors plus rien à
-- afficher et montre « Aucune classe assignée ». Constaté sur les comptes créés
-- le 2026-09-01 (Idriss / COLLÈGE LA RETRAITE, Armand Bello / LA RÉUSSITE), et
-- sur un compte ADMIN (Njionhou / Collège saint Michel) qui subit le même sort.
--
-- ── CE QUE CE FICHIER CORRIGE ───────────────────────────────────────────────
--   §1  `user_teaches_class` — nouveau prédicat : l'utilisateur assure-t-il
--       cette classe (titulaire ou matière) ?
--   §2  `user_scope_allows_class` — deux garde-fous :
--         a. « aucun périmètre défini » n'est pas une décision, c'est un compte
--            non configuré : il ne restreint rien (c'est exactement ce que
--            promet encore l'écran Périmètre : « Tout laisser vide = tout
--            l'établissement »). `scope_global` garde son sens de GLOBAL
--            EXPLICITE ; seul un périmètre réellement posé cloisonne.
--         b. un enseignant atteint TOUJOURS les classes qu'il assure. Le
--            cloisonnement par secteur n'a jamais eu pour but d'empêcher un
--            professeur de saisir les notes de sa propre classe.
--   §3  les trois RPC de création posent `scope_global = true` à l'insertion,
--       pour que l'intention soit ÉCRITE et non déduite.
--   §4  `admin_create_teacher_account` ne vole plus la fiche d'un collègue :
--       il ne rattache qu'une fiche libre (ou celle déjà liée à ce compte).
--   §5  réparation des comptes déjà nés aveugles.
--
-- Le cloisonnement reste entier : un compte dont le périmètre est réellement
-- posé (ex. les enseignants de THE GENIUS, cf. supabase_genius_teacher_scope_
-- backfill.sql) continue d'être filtré exactement comme avant.
--
-- IDEMPOTENT — rejouable sans effet de bord. AUCUNE SUPPRESSION.
-- Vérification : supabase_fix_perimetre_mort_verify.sql
-- ============================================================================
BEGIN;

-- ── 1. L'utilisateur assure-t-il cette classe ? ─────────────────────────────
-- SECURITY DEFINER : doit lire teachers / classes / subjects sans être bloqué
-- par la RLS de ces tables (dont la policy qui l'appelle — sinon récursion).
CREATE OR REPLACE FUNCTION public.user_teaches_class(p_school uuid, p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.teachers t
     WHERE t.school_id = p_school
       AND t.auth_user_id = auth.uid()
       AND (
            EXISTS (SELECT 1 FROM public.classes c
                     WHERE c.id = p_class AND c.school_id = p_school AND c.teacher_id = t.id)
         OR EXISTS (SELECT 1 FROM public.subjects s
                     WHERE s.class_id = p_class AND s.school_id = p_school AND s.teacher_id = t.id)
       )
  );
$$;

REVOKE ALL    ON FUNCTION public.user_teaches_class(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.user_teaches_class(uuid, uuid) TO authenticated;


-- ── 2. Le prédicat de cloisonnement, avec ses deux garde-fous ───────────────
CREATE OR REPLACE FUNCTION public.user_scope_allows_class(p_school uuid, p_class uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s text[]; c text[]; k uuid[]; g boolean; f boolean; v_cycle text; v_section text;
BEGIN
  SELECT su.scope_sections, su.scope_cycles, su.scope_class_ids, su.scope_global, true
    INTO s, c, k, g, f
  FROM school_users su
  WHERE su.user_id = auth.uid() AND su.school_id = p_school AND su.active = true
  LIMIT 1;

  IF NOT coalesce(f, false) THEN RETURN false; END IF;   -- non membre de l'école
  IF coalesce(g, false)     THEN RETURN true;  END IF;   -- GLOBAL explicite

  -- GARDE-FOU a — AUCUN périmètre n'a jamais été posé sur ce compte. Ce n'est
  -- pas un cloisonnement voulu : c'est la valeur par défaut de la colonne sur un
  -- compte fraîchement créé. Refuser ici rendrait le compte aveugle, sans aucun
  -- moyen de s'en apercevoir ni de le corriger depuis l'application.
  IF coalesce(array_length(s, 1), 0) = 0
 AND coalesce(array_length(c, 1), 0) = 0
 AND coalesce(array_length(k, 1), 0) = 0 THEN
    RETURN true;
  END IF;

  IF p_class IS NULL THEN RETURN false; END IF;

  IF k IS NOT NULL AND p_class = ANY(k) THEN RETURN true; END IF;

  SELECT cl.cycle, cl.section INTO v_cycle, v_section
  FROM classes cl WHERE cl.id = p_class AND cl.school_id = p_school;
  IF NOT FOUND THEN RETURN false; END IF;

  IF s IS NOT NULL AND v_section IS NOT NULL AND v_section = ANY(s) THEN RETURN true; END IF;

  IF c IS NOT NULL THEN
    -- `classes.cycle` stocke maternelle|primaire|secondaire ; le périmètre
    -- applicatif regroupe en fondamental (maternelle+primaire) et secondaire.
    IF v_cycle = ANY(c) THEN RETURN true; END IF;
    IF v_cycle   IN ('maternelle','primaire')        AND 'fondamental' = ANY(c) THEN RETURN true; END IF;
    IF v_section IN ('maternelle','primaire')        AND 'fondamental' = ANY(c) THEN RETURN true; END IF;
    IF v_section IN ('premier_cycle','second_cycle') AND 'secondaire'  = ANY(c) THEN RETURN true; END IF;
  END IF;

  -- GARDE-FOU b — l'enseignant atteint toujours les classes qu'il assure.
  -- Un professeur affecté à une classe doit pouvoir y saisir ses notes, quel
  -- que soit le périmètre sectoriel posé sur son compte. Cela n'ouvre RIEN
  -- d'autre : hors de ses propres classes, le cloisonnement s'applique.
  IF public.user_teaches_class(p_school, p_class) THEN RETURN true; END IF;

  RETURN false;
END $$;


-- ── 3+4. Les RPC de création écrivent l'intention ───────────────────────────
-- L'admin crée un accès depuis Enseignants. Deux corrections :
--   • `scope_global = true` à l'insertion — sans quoi le compte naît aveugle ;
--   • la fiche enseignant n'est rattachée que si elle est LIBRE. L'ancienne
--     version rattachait la première fiche du même nom, même déjà liée à un
--     autre compte : l'UPDATE se heurtait à l'index unique sur auth_user_id
--     (« duplicate key ») et, quand il passait, privait un collègue de sa fiche.
CREATE OR REPLACE FUNCTION public.admin_create_teacher_account(
  p_target_user_id uuid,
  p_full_name      text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id  uuid;
  v_teacher_id uuid;
BEGIN
  SELECT school_id INTO v_school_id
    FROM school_users
   WHERE user_id = auth.uid() AND active = true
     AND (role = 'admin' OR public.has_page_permission(school_id, '/app/teachers'))
   LIMIT 1;

  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  INSERT INTO school_users (school_id, user_id, role, full_name, active, scope_global)
  VALUES (v_school_id, p_target_user_id, 'teacher', p_full_name, true, true)
  ON CONFLICT DO NOTHING;

  -- Fiche déjà liée à CE compte (rejeu) ?
  SELECT id INTO v_teacher_id
    FROM teachers
   WHERE school_id = v_school_id AND auth_user_id = p_target_user_id
   LIMIT 1;

  -- Sinon, une fiche LIBRE portant ce nom.
  IF v_teacher_id IS NULL THEN
    SELECT id INTO v_teacher_id
      FROM teachers
     WHERE school_id = v_school_id
       AND auth_user_id IS NULL
       AND lower(trim(name)) = lower(trim(p_full_name))
     LIMIT 1;

    IF v_teacher_id IS NOT NULL THEN
      UPDATE teachers SET auth_user_id = p_target_user_id WHERE id = v_teacher_id;
    ELSE
      INSERT INTO teachers (school_id, name, auth_user_id)
      VALUES (v_school_id, p_full_name, p_target_user_id);
    END IF;
  END IF;
END $$;


-- L'enseignant s'inscrit lui-même avec le code de l'établissement.
CREATE OR REPLACE FUNCTION public.signup_teacher(
  p_school_code text,
  p_full_name   text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id  uuid;
  v_user_id    uuid;
  v_teacher_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF EXISTS (SELECT 1 FROM school_users WHERE user_id = v_user_id AND active = true) THEN
    RAISE EXCEPTION 'already linked';
  END IF;

  SELECT id INTO v_school_id
    FROM schools
   WHERE lower(id::text) LIKE lower(p_school_code) || '%'
   LIMIT 1;

  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Code établissement invalide'; END IF;

  INSERT INTO school_users (school_id, user_id, role, full_name, active, scope_global)
  VALUES (v_school_id, v_user_id, 'teacher', p_full_name, true, true);

  SELECT id INTO v_teacher_id
    FROM teachers
   WHERE school_id = v_school_id
     AND auth_user_id IS NULL
     AND lower(trim(name)) = lower(trim(p_full_name))
   LIMIT 1;

  IF v_teacher_id IS NOT NULL THEN
    UPDATE teachers SET auth_user_id = v_user_id WHERE id = v_teacher_id;
  ELSE
    INSERT INTO teachers (school_id, name, auth_user_id)
    VALUES (v_school_id, p_full_name, v_user_id)
    RETURNING id INTO v_teacher_id;
  END IF;

  RETURN jsonb_build_object('school_id', v_school_id, 'teacher_id', v_teacher_id);
END $$;


-- Comptes délégués (censeur / surveillant). StaffManager pose le périmètre juste
-- après la création ; s'il échoue, le compte ne doit pas rester aveugle.
CREATE OR REPLACE FUNCTION public.admin_create_staff_account(
  p_target_user_id uuid,
  p_full_name      text,
  p_role           text,
  p_permissions    text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school_id uuid;
BEGIN
  IF p_role NOT IN ('censeur', 'surveillant') THEN RAISE EXCEPTION 'Rôle invalide'; END IF;

  SELECT school_id INTO v_school_id FROM school_users
   WHERE user_id = auth.uid() AND active = true AND role = 'admin';
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  INSERT INTO school_users (school_id, user_id, role, full_name, active, permissions, scope_global)
  VALUES (v_school_id, p_target_user_id, p_role, p_full_name, true, p_permissions, true)
  ON CONFLICT DO NOTHING;
END $$;


-- Surcharge HISTORIQUE à trois arguments (avant supabase_staff_permissions.sql).
-- Le front ne l'appelle qu'en repli, mais tant qu'elle existe elle peut créer un
-- compte aveugle : elle est corrigée à l'identique.
CREATE OR REPLACE FUNCTION public.admin_create_staff_account(
  p_target_user_id uuid,
  p_full_name      text,
  p_role           text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school_id uuid;
BEGIN
  IF p_role NOT IN ('censeur', 'surveillant') THEN RAISE EXCEPTION 'Rôle invalide'; END IF;

  SELECT school_id INTO v_school_id FROM school_users
   WHERE user_id = auth.uid() AND active = true AND role = 'admin';
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  INSERT INTO school_users (school_id, user_id, role, full_name, active, scope_global)
  VALUES (v_school_id, p_target_user_id, p_role, p_full_name, true, true)
  ON CONFLICT DO NOTHING;
END $$;


-- ── 5. Réparation des comptes déjà nés aveugles ─────────────────────────────
-- Exactement la requête de backfill de supabase_sector_isolation.sql : elle rend
-- explicite le périmètre global des comptes qui n'en ont jamais eu. Ne touche
-- AUCUN compte réellement cloisonné (au moins un tableau non vide).
UPDATE public.school_users
   SET scope_global = true
 WHERE scope_global = false
   AND coalesce(array_length(scope_cycles,   1), 0) = 0
   AND coalesce(array_length(scope_sections, 1), 0) = 0
   AND coalesce(array_length(scope_class_ids,1), 0) = 0;

COMMIT;
