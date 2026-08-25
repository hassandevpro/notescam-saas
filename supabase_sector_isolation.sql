-- supabase_sector_isolation.sql
-- ISOLATION DES DONNÉES PAR SECTEUR (Collège / Primaire) — Phase 2.
--
-- ── POURQUOI UNE POLICY « RESTRICTIVE » ─────────────────────────────────────
-- Les 44 policies existantes sur les tables pédagogiques sont TOUTES
-- PERMISSIVE, et aucune ne filtre le secteur. PostgreSQL combine les policies
-- permissives par OU : ajouter une 45ᵉ policy permissive portant le prédicat de
-- périmètre n'aurait donc AUCUN effet — n'importe laquelle des 44 autres
-- laisserait passer la ligne.
--
-- Une policy AS RESTRICTIVE est combinée par ET avec le résultat des
-- permissives. Une seule par table suffit donc à rendre le cloisonnement
-- INCONTOURNABLE, sans toucher aux 44 policies existantes — donc sans risque de
-- casser un droit d'accès légitime déjà en place.
--
--   accès final = (permissive1 OR permissive2 OR …) AND (restrictive_périmètre)
--
-- ── CE QUI N'EST PAS AFFECTÉ ────────────────────────────────────────────────
-- `service_role` contourne la RLS par conception : les fonctions edge de
-- synchronisation (sync-pull, sync-push, events-*, credentials-pull) et donc
-- L'APPAIRAGE LAN/CLOUD NE SONT PAS TOUCHÉS. Le serveur LAN reçoit toujours
-- l'intégralité des données de son école ; le cloisonnement s'y applique à la
-- lecture par utilisateur (cf. server/query.js), pas à la réplication.
--
-- ── PÉRIMÈTRE GLOBAL EXPLICITE ──────────────────────────────────────────────
-- `school_users.scope_global` remplace la règle implicite « trois tableaux
-- vides = tout l'établissement ». Le backfill met scope_global = true pour tous
-- les comptes actuellement dans ce cas : comportement STRICTEMENT préservé.
-- Après migration, un compte sans périmètre ET non global ne voit RIEN — c'est
-- la sémantique explicite demandée.
--
-- ⚠️ CONSÉQUENCE À TRAITER CÔTÉ APPLICATIF : un compte créé après cette
--    migration naît avec scope_global = false et un périmètre vide, donc SANS
--    accès, tant qu'un périmètre (ou le drapeau global) ne lui est pas attribué.
--    L'écran de création de compte doit donc imposer ce choix.
--
-- Rollback : supabase_sector_isolation_rollback.sql
-- ============================================================================
BEGIN;

-- ── 1. Périmètre GLOBAL explicite ───────────────────────────────────────────
ALTER TABLE public.school_users
  ADD COLUMN IF NOT EXISTS scope_global boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.school_users.scope_global IS
  'Périmètre GLOBAL explicite : le compte accède à tous les secteurs de son '
  'école. N''est JAMAIS déduit du rôle. FALSE = accès limité aux secteurs '
  'explicitement attribués (scope_cycles / scope_sections / scope_class_ids).';

-- Backfill : préserve à l'identique le comportement d'avant migration.
UPDATE public.school_users
   SET scope_global = true
 WHERE scope_global = false
   AND coalesce(array_length(scope_cycles, 1), 0) = 0
   AND coalesce(array_length(scope_sections, 1), 0) = 0
   AND coalesce(array_length(scope_class_ids, 1), 0) = 0;

-- ── 2. Prédicats ────────────────────────────────────────────────────────────
-- SECURITY DEFINER : doivent lire school_users et classes sans être bloqués par
-- la RLS de ces tables. STABLE : évalués une fois par requête, pas par ligne.
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
  IF p_class IS NULL        THEN RETURN false; END IF;

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

  RETURN false;
END $$;

-- Élève -> sa classe. Utilisé par les tables rattachées à un élève.
CREATE OR REPLACE FUNCTION public.user_scope_allows_student(p_school uuid, p_student uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class uuid;
BEGIN
  IF p_student IS NULL THEN RETURN public.user_scope_allows_class(p_school, NULL); END IF;
  SELECT st.class_id INTO v_class
  FROM students st WHERE st.id = p_student AND st.school_id = p_school;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN public.user_scope_allows_class(p_school, v_class);
END $$;

CREATE OR REPLACE FUNCTION public.user_scope_is_global(p_school uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE g boolean;
BEGIN
  SELECT su.scope_global INTO g FROM school_users su
  WHERE su.user_id = auth.uid() AND su.school_id = p_school AND su.active = true LIMIT 1;
  RETURN coalesce(g, false);
END $$;

REVOKE ALL ON FUNCTION public.user_scope_allows_class(uuid, uuid)   FROM public;
REVOKE ALL ON FUNCTION public.user_scope_allows_student(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.user_scope_is_global(uuid)            FROM public;
GRANT EXECUTE ON FUNCTION public.user_scope_allows_class(uuid, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_scope_allows_student(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_scope_is_global(uuid)            TO authenticated;

-- ── 3. Cloisonnement RESTRICTIF ─────────────────────────────────────────────
-- Une policy par table, FOR ALL : couvre SELECT / INSERT / UPDATE / DELETE.
-- `to public` : s'applique à tous les rôles clients (authenticated ET anon).
-- service_role garde son BYPASSRLS -> synchronisation intacte.

-- 3a. Tables portant directement class_id (ou id pour classes)
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.classes;
CREATE POLICY "secteur: cloisonnement" ON public.classes AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_class(school_id, id))
  WITH CHECK (public.user_scope_allows_class(school_id, id));

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.students;
CREATE POLICY "secteur: cloisonnement" ON public.students AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_class(school_id, class_id))
  WITH CHECK (public.user_scope_allows_class(school_id, class_id));

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.subjects;
CREATE POLICY "secteur: cloisonnement" ON public.subjects AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_class(school_id, class_id))
  WITH CHECK (public.user_scope_allows_class(school_id, class_id));

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.grades;
CREATE POLICY "secteur: cloisonnement" ON public.grades AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_class(school_id, class_id))
  WITH CHECK (public.user_scope_allows_class(school_id, class_id));

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.student_absences;
CREATE POLICY "secteur: cloisonnement" ON public.student_absences AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_class(school_id, class_id))
  WITH CHECK (public.user_scope_allows_class(school_id, class_id));

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.timetable_slots;
CREATE POLICY "secteur: cloisonnement" ON public.timetable_slots AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_class(school_id, class_id))
  WITH CHECK (public.user_scope_allows_class(school_id, class_id));

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.student_class_assignments;
CREATE POLICY "secteur: cloisonnement" ON public.student_class_assignments AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_class(school_id, class_id))
  WITH CHECK (public.user_scope_allows_class(school_id, class_id));

-- 3b. Carnets non numériques, rattachés à un élève (eleve_id)
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.apc_notes;
CREATE POLICY "secteur: cloisonnement" ON public.apc_notes AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_student(school_id, eleve_id))
  WITH CHECK (public.user_scope_allows_student(school_id, eleve_id));

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.prim_notes;
CREATE POLICY "secteur: cloisonnement" ON public.prim_notes AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_student(school_id, eleve_id))
  WITH CHECK (public.user_scope_allows_student(school_id, eleve_id));

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.mat_observations;
CREATE POLICY "secteur: cloisonnement" ON public.mat_observations AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_student(school_id, eleve_id))
  WITH CHECK (public.user_scope_allows_student(school_id, eleve_id));

-- 3c. FINANCES — même règle unique, aucune exception dans le code.
-- RAF / Caisse / Contrôle traversent les deux secteurs parce que LEUR COMPTE
-- est GLOBAL (scope_global = true), pas parce que la table serait exemptée.
-- Sans ce cloisonnement, un compte sectoriel Collège lirait les lignes de frais
-- des élèves du Primaire — donc leurs identifiants : fuite indirecte.
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.student_fees;
CREATE POLICY "secteur: cloisonnement" ON public.student_fees AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_student(school_id, student_id))
  WITH CHECK (public.user_scope_allows_student(school_id, student_id));

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.fee_payments;
CREATE POLICY "secteur: cloisonnement" ON public.fee_payments AS RESTRICTIVE FOR ALL TO public
  USING (public.user_scope_allows_student(school_id, student_id))
  WITH CHECK (public.user_scope_allows_student(school_id, student_id));

COMMIT;
