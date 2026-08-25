-- supabase_genius_staff_authority.sql
-- « Le principal et son staff doivent pouvoir gérer le personnel ET les
--   enseignants — sur leur secteur uniquement. Idem pour la directrice du
--   primaire. »
--
-- ── CE QUI MANQUAIT, EXACTEMENT ─────────────────────────────────────────────
-- Le rôle portait DÉJÀ la bonne clé : `principal`, `vice_principal`,
-- `directrice_primaire`, `directrice_adjointe_primaire` et
-- `responsable_maternelle` ont tous `staff.manage.sector`. Deux verrous
-- indépendants les empêchaient malgré tout d'agir :
--
--   1. LE PERSONNEL passait déjà (les policies permissives de `staff` acceptent
--      tout membre de l'école, la restrictive bornant au secteur via
--      `can_manage_staff`). Mais LES ENSEIGNANTS non : les seules policies
--      permissives d'écriture sur `teachers` sont « par admins de l'école » et
--      « par capacité déléguée /app/teachers ». Un chef de secteur, qui est
--      `censeur` et ne porte pas cette capacité, ne passait aucune des deux.
--
--   2. Les pages `/app/personnel` et `/app/teachers` n'étaient ouvertes par
--      AUCUN de ces rôles (leur `pages` ne contient que les trois pages
--      budgétaires), et l'entrée de menu correspondante est réservée au rôle de
--      base `admin`. Le module restait donc invisible et la route fermée.
--
-- ── LE SECTEUR EST DÉJÀ GARANTI ─────────────────────────────────────────────
-- On n'ajoute AUCUNE règle de secteur : la policy RESTRICTIVE
-- « secteur: cloisonnement » de `teachers` appelle `user_scope_allows_teacher`,
-- et les restrictives se combinent en ET. Une permissive ne peut donc jamais
-- élargir le périmètre — elle ne fait qu'accorder le DROIT, que le secteur borne
-- ensuite :
--
--   accès final = (admin OU capacité OU autorité RH) ET (secteur du compte)
--
-- Principal → Collège seulement. Directrice du primaire → Fondamental seulement.
-- Le secteur d'un enseignant reste DÉRIVÉ de ses classes et de ses matières.
--
-- ── CONFINEMENT ─────────────────────────────────────────────────────────────
-- La policy ne s'active que si `school_strict_roles(school_id)` — donc pour
-- THE GENIUS et elle seule. Ailleurs elle est fausse d'emblée et le jeu de
-- policies reste exactement celui d'aujourd'hui. La §2 ne touche que le
-- catalogue de l'école visée.
--
-- Rien n'est supprimé : aucune policy retirée, aucun compte modifié, aucune
-- permission révoquée. `service_role` garde son BYPASSRLS.
-- ============================================================================
BEGIN;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1 — ÉCRITURE SUR `teachers` POUR L'AUTORITÉ RH                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- PERMISSIVE : elle ACCORDE un droit (les permissives se combinent en OU).
-- Le secteur est imposé par la restrictive déjà en place, pas par celle-ci.
DROP POLICY IF EXISTS "personnel: écriture par autorité RH" ON public.teachers;
CREATE POLICY "personnel: écriture par autorité RH" ON public.teachers
  AS PERMISSIVE FOR ALL TO public
  USING (
    public.school_strict_roles(school_id)
    AND ( public.user_has_gov_perm(school_id, 'staff.manage.all')
       OR public.user_has_gov_perm(school_id, 'staff.manage.sector') )
  )
  WITH CHECK (
    public.school_strict_roles(school_id)
    AND ( public.user_has_gov_perm(school_id, 'staff.manage.all')
       OR public.user_has_gov_perm(school_id, 'staff.manage.sector') )
  );

COMMENT ON POLICY "personnel: écriture par autorité RH" ON public.teachers IS
  'Un chef de secteur gère le corps enseignant de SON secteur : la policy accorde '
  'le droit, la restrictive « secteur: cloisonnement » borne le périmètre. '
  'Inerte hors école appliquant les permissions strictes.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2 — OUVRIR LES DEUX PAGES AUX CHEFS DE SECTEUR                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- `governance_roles.pages` alimente `effectivePages()` côté application, qui
-- ouvre l'entrée de menu ET la route — sans toucher au code. La matrice stricte
-- du frontend autorise déjà ces pages à un porteur de `staff.manage.*`.
--
-- Additif : on fusionne dans le tableau existant, sans jamais rien retirer.
CREATE OR REPLACE FUNCTION public.grant_gov_page(p_school uuid, p_code text, p_page text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.governance_roles
     SET pages = (
           SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb)
             FROM jsonb_array_elements_text(pages || to_jsonb(p_page)) AS x
         ),
         updated_at = now()
   WHERE school_id = p_school AND code = p_code
     AND NOT (pages @> to_jsonb(p_page));
END $$;

REVOKE ALL ON FUNCTION public.grant_gov_page(uuid, text, text) FROM public;

DO $$
DECLARE
  v_school uuid := '6b68407b-3d2e-426b-81ff-c4e68e66120a';
  v_name   text;
  c text;
BEGIN
  SELECT name INTO v_name FROM public.schools WHERE id = v_school;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'École % introuvable — rien n''est modifié.', v_school;
  END IF;
  IF NOT public.school_strict_roles(v_school) THEN
    RAISE EXCEPTION 'L''école % n''applique pas les permissions strictes — annulation.', v_name;
  END IF;

  FOREACH c IN ARRAY ARRAY['principal','vice_principal','directrice_primaire',
                           'directrice_adjointe_primaire','responsable_maternelle'] LOOP
    PERFORM public.grant_gov_page(v_school, c, '/app/personnel');
    PERFORM public.grant_gov_page(v_school, c, '/app/teachers');
  END LOOP;

  RAISE NOTICE 'Pages Personnel et Enseignants ouvertes aux chefs de secteur de %', v_name;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — à jouer après
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Les cinq rôles portent bien les deux pages.
-- SELECT code, pages FROM governance_roles
--  WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
--    AND code IN ('principal','vice_principal','directrice_primaire',
--                 'directrice_adjointe_primaire','responsable_maternelle');
--
-- 2. La policy est posée et PERMISSIVE.
-- SELECT policyname, permissive, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='teachers';
--
-- 3. Aucune autre école n'a bougé : la §2 filtre sur l'id, la §1 sur le drapeau.
-- SELECT count(*) FROM governance_roles
--  WHERE pages @> '"/app/teachers"'::jsonb
--    AND school_id <> '6b68407b-3d2e-426b-81ff-c4e68e66120a';   -- attendu : 0

-- ════════════════════════════════════════════════════════════════════════════
-- RETOUR ARRIÈRE
-- ════════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP POLICY IF EXISTS "personnel: écriture par autorité RH" ON public.teachers;
-- UPDATE public.governance_roles
--    SET pages = (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb)
--                   FROM jsonb_array_elements_text(pages) AS x
--                  WHERE x NOT IN ('/app/personnel', '/app/teachers'))
--  WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
--    AND code IN ('principal','vice_principal','directrice_primaire',
--                 'directrice_adjointe_primaire','responsable_maternelle');
-- COMMIT;
