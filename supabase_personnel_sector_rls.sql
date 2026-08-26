-- supabase_personnel_sector_rls.sql
-- CLOISONNEMENT DU PERSONNEL — le secteur DÉCLARÉ fait foi, et NULL n'est plus
-- un laissez-passer. Miroir cloud de server/scopeGuard.js.
--
-- ── LE DÉFAUT CORRIGÉ ───────────────────────────────────────────────────────
-- Constaté en production le 26/08/2026 : la Directrice du Primaire voyait les
-- enseignants du Secondaire. Ce n'était pas une policy manquante — c'était cette
-- ligne de `user_scope_allows_teacher` :
--
--     IF array_length(v_sectors, 1) IS NULL THEN RETURN true; END IF;
--
-- Le secteur d'un enseignant était DÉRIVÉ de ses classes et de ses matières.
-- Aucun des 11 enseignants de THE GENIUS n'étant rattaché à une classe ni à une
-- matière, la dérivation rendait un tableau vide pour chacun — et cette ligne les
-- rendait visibles de TOUT LE MONDE. Le même trou existait pour le personnel :
-- `p_sector IS NULL` valait « agent transverse, visible de tous ».
--
-- ── LA RÈGLE POSÉE ICI ──────────────────────────────────────────────────────
--   1. secteur DÉCLARÉ sur la fiche  → il fait foi, seul ;
--   2. sinon, secteur DÉRIVÉ des classes et matières ;
--   3. sinon, SECTEUR NON DÉFINI     → aucun périmètre sectoriel ne l'atteint.
--
-- NULL n'est pas un secteur : c'est l'absence de secteur. La fiche reste
-- accessible à qui peut la CORRIGER — l'administrateur, un compte global, le
-- porteur de `staff.manage.all`, et l'intéressé sur sa propre fiche.
--
-- ── CONSÉQUENCE IMMÉDIATE, À CONNAÎTRE AVANT D'EXÉCUTER ─────────────────────
-- Les 11 enseignants de THE GENIUS sont tous à NULL. Après ce fichier, AUCUN
-- responsable sectoriel ne verra d'enseignant tant qu'ils n'auront pas été
-- affectés un par un. Seul l'administrateur les verra — pour pouvoir les
-- affecter. C'est le comportement voulu, pas une panne.
--
-- Prérequis : supabase_personnel_sector.sql (colonne teachers.sector).
-- Idempotent. À coller dans Supabase → SQL Editor → Run.

BEGIN;

-- ── 1. LECTURE : un enseignant est-il dans mon périmètre ? ──────────────────
CREATE OR REPLACE FUNCTION public.user_scope_allows_teacher(p_school uuid, p_teacher uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_declared text; v_sectors text[]; v_mine text[];
BEGIN
  IF NOT public.school_strict_roles(p_school) THEN RETURN true; END IF;  -- autres écoles : inchangé
  IF p_teacher IS NULL THEN RETURN true; END IF;
  IF public.user_scope_is_global(p_school) THEN RETURN true; END IF;
  -- L'administrateur voit tout le corps enseignant même si un périmètre lui a
  -- été posé par erreur : sans cela, une fausse manœuvre de paramétrage rendrait
  -- l'école ingérable pour son propre administrateur.
  IF public.is_school_admin(p_school) THEN RETURN true; END IF;

  -- Un enseignant voit TOUJOURS sa propre fiche (profil, mot de passe, photo).
  IF EXISTS (SELECT 1 FROM public.teachers t
              WHERE t.id = p_teacher AND t.school_id = p_school
                AND t.auth_user_id = (SELECT auth.uid())) THEN
    RETURN true;
  END IF;

  -- RH TRANSVERSE. Le serveur LAN portait déjà cette exception pour le corps
  -- enseignant, pas le cloud : le RAF gérait les agents des deux secteurs mais
  -- pas leurs enseignants. Les deux disent désormais la même chose.
  IF public.user_has_gov_perm(p_school, 'staff.manage.all') THEN RETURN true; END IF;

  v_mine := public.user_sectors(p_school);

  -- 1. DÉCLARÉ — il fait foi, et il est seul à décider.
  SELECT NULLIF(t.sector, '') INTO v_declared
    FROM public.teachers t WHERE t.id = p_teacher AND t.school_id = p_school;
  IF v_declared IS NOT NULL THEN
    RETURN v_declared = ANY (v_mine);
  END IF;

  -- 2. DÉRIVÉ — repli, quand la fiche ne déclare rien.
  v_sectors := public.teacher_sectors(p_school, p_teacher);

  -- 3. NON DÉFINI — n'appartient à aucun secteur. Cette ligne rendait
  --    auparavant la fiche visible de tous ; c'est le défaut corrigé ici.
  IF array_length(v_sectors, 1) IS NULL THEN RETURN false; END IF;

  RETURN v_sectors && v_mine;   -- intersection non vide
END $$;

-- ── 2. LECTURE : un membre du personnel est-il dans mon périmètre ? ─────────
CREATE OR REPLACE FUNCTION public.user_scope_allows_staff(p_school uuid, p_sector text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.school_strict_roles(p_school)
      OR public.user_scope_is_global(p_school)
      OR public.is_school_admin(p_school)
      OR public.user_has_gov_perm(p_school, 'staff.manage.all')
      -- `p_sector IS NULL` RETIRÉ : une fiche sans secteur n'est pas un agent
      -- transverse, c'est une fiche non affectée. La laisser passer revenait à
      -- ce qu'oublier le champ ouvre la fiche à tout le monde.
      OR p_sector = ANY (public.user_sectors(p_school));
$$;

-- ── 3. ÉCRITURE : sur quel secteur puis-je écrire une fiche de personnel ? ──
CREATE OR REPLACE FUNCTION public.can_manage_staff(p_school uuid, p_sector text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.school_strict_roles(p_school)
      OR public.is_school_admin(p_school)
      OR public.user_has_gov_perm(p_school, 'staff.manage.all')
      -- Chef de secteur : borné à SON secteur. Le « OU transverse » a disparu —
      -- sans quoi il créerait des fiches sans secteur, que lui-même ne verrait
      -- plus ensuite, et qui échapperaient à tout cloisonnement.
      OR ( (public.user_has_gov_perm(p_school, 'staff.manage.sector')
            OR public.user_has_page(p_school, '/app/personnel'))
           AND p_sector = ANY (public.user_sectors(p_school)) );
$$;

-- ── 4. ÉCRITURE : la même règle pour une fiche ENSEIGNANT ───────────────────
-- Nécessaire parce qu'en `WITH CHECK`, la ligne insérée n'est pas encore lisible
-- par une fonction STABLE : interroger `teachers` par son id rendrait toujours
-- « aucun secteur », donc refuserait toute création. On lit donc la colonne de la
-- nouvelle ligne directement, comme le fait déjà `staff`.
CREATE OR REPLACE FUNCTION public.can_manage_teacher_sector(p_school uuid, p_sector text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.school_strict_roles(p_school)
      OR public.user_scope_is_global(p_school)
      OR public.is_school_admin(p_school)
      OR public.user_has_gov_perm(p_school, 'staff.manage.all')
      OR ( (public.user_has_gov_perm(p_school, 'staff.manage.sector')
            OR public.user_has_page(p_school, '/app/teachers'))
           AND p_sector = ANY (public.user_sectors(p_school)) );
$$;

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.teachers;
CREATE POLICY "secteur: cloisonnement" ON public.teachers AS RESTRICTIVE FOR ALL TO public
  USING      (public.user_scope_allows_teacher(school_id, id))
  WITH CHECK (public.can_manage_teacher_sector(school_id, sector));

COMMIT;

-- ── CONTRÔLE ────────────────────────────────────────────────────────────────
-- Doit montrer les 11 enseignants à NULL : après ce fichier, aucun responsable
-- sectoriel ne les voit, seul l'administrateur.
SELECT COALESCE(sector, '(non défini)') AS secteur, count(*) AS nb
  FROM public.teachers
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 GROUP BY 1 ORDER BY 2 DESC;
