-- supabase_fix_subjects_delegation.sql
-- CORRECTIF — « new row violates row-level security policy for table "subjects" »
-- à la création d'une classe par un compte DÉLÉGUÉ (non-admin).
--
-- ── LE DÉFAUT ───────────────────────────────────────────────────────────────
-- Les deux policies d'écriture de `classes` acceptent, depuis la délégation
-- avancée, un compte non-admin à qui la page Classes a été confiée :
--
--     USING ( … role = 'admin' … OR has_page_permission(school_id, '/app/classes') )
--
-- Celles de `subjects` n'ont jamais reçu la même clause : elles exigent
-- `role = 'admin'`, et rien d'autre.
--
-- Or créer une classe CRÉE SES MATIÈRES dans la foulée : `schoolStore.addClass`
-- enchaîne les auto-configurations (second cycle, APC, maternelle, primaire,
-- tronc commun classique) et pousse un `upsert` PAR MATIÈRE. Le compte délégué
-- obtient donc sa classe, puis se fait refuser chacune de ses matières, une par
-- une. La file de synchronisation les rejoue puis abandonne — d'où les
-- « N opérations en échec · subjects · upsert ».
--
-- Mesuré avant correctif : 13 comptes non-admin disposent de `/app/classes`
-- (9 chez THE GENIUS, 4 chez BRIGHT CONTINENT — les deux seules écoles en
-- `advanced_delegation = true`). Dégât déjà constaté : 6 classes de maternelle
-- chez BRIGHT CONTINENT sans AUCUNE matière, alors que le référentiel MINEDUB
-- en compte 8.
--
-- ── CE QUE CE FICHIER FAIT ──────────────────────────────────────────────────
-- Il aligne l'écriture de `subjects` sur celle de `classes`, et rien de plus :
-- une classe et ses matières relèvent de la même autorisation, puisqu'elles
-- naissent du même geste.
--
-- ── CE QU'IL NE FAIT PAS, VOLONTAIREMENT ────────────────────────────────────
--   • Il ne touche PAS la policy héritée « Admins write subjects », qui repose
--     sur `user_role()` / `user_school_id()`. Ces deux fonctions lisent
--     `school_users` avec un `LIMIT 1` sans filtrer l'école : les corriger est
--     un autre sujet, traité à part. Inutile ici : les policies PERMISSIVES se
--     combinent en OU, il suffit qu'UNE seule accepte.
--   • Il ne touche à AUCUNE donnée. Aucune matière n'est créée, modifiée ni
--     supprimée : les classes déjà privées de leurs matières se réparent par
--     « Configurer les matières » (Classes.jsx), geste explicite et idempotent.
--   • Il ne modifie PAS la policy RESTRICTIVE « secteur: cloisonnement ».
--
-- ── POURQUOI AUCUNE FUITE INTER-ÉCOLES ──────────────────────────────────────
--   1. `has_page_permission(p_school, p_path)` commence par exiger
--      `schools.advanced_delegation = true` POUR L'ÉCOLE DE LA LIGNE, puis lit
--      les permissions du compte avec `su.school_id = p_school AND su.active`.
--      Appelée avec le `school_id` de la ligne proposée, elle ne peut donc
--      ouvrir que l'école de cette ligne. Les écoles hors délégation avancée
--      conservent au caractère près le comportement « admin seul ».
--   2. La policy RESTRICTIVE `user_scope_allows_class(school_id, class_id)`
--      reste appliquée en USING ET en WITH CHECK. Les policies restrictives se
--      combinent en ET : un compte délégué n'écrit que dans le périmètre
--      (secteur / cycle / classes) que son compte porte déjà.
--
-- Accès final = (admin de l'école OU page Classes déléguée) ET (périmètre).
--
-- À EXÉCUTER dans Supabase → SQL Editor. Idempotent : rejouable sans risque.
-- Rollback : supabase_fix_subjects_delegation_rollback.sql
-- ============================================================================

-- §1. Garde-fou : la fonction de délégation doit exister. Sans elle, la policy
--     serait créée avec une référence morte et TOUTE écriture échouerait.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_page_permission'
  ) THEN
    RAISE EXCEPTION 'has_page_permission() absente : appliquer d''abord supabase_genius_role_permissions.sql';
  END IF;
END $$;

-- §2. Écriture des matières : admin de l'école, OU page Classes déléguée.
--     Mêmes termes que `classes`, à la table près.
--     `FOR ALL` sans WITH CHECK explicite : PostgreSQL réutilise alors
--     l'expression USING pour contrôler la ligne proposée (INSERT/UPDATE) —
--     c'est exactement le fonctionnement actuel de la policy `classes`, qu'on
--     se garde de faire diverger.
DROP POLICY IF EXISTS "subjects: écriture par admins de l'école" ON public.subjects;
CREATE POLICY "subjects: écriture par admins de l'école"
  ON public.subjects
  FOR ALL
  USING (
    school_id IN (
      SELECT su.school_id
      FROM public.school_users su
      WHERE su.user_id = auth.uid()
        AND su.active = true
        AND su.role = 'admin'
    )
    OR public.has_page_permission(school_id, '/app/classes')
  );

-- §3. Vérification — à lire après exécution.
--     Attendu : la policy porte bien la clause de délégation, et la policy
--     RESTRICTIVE de cloisonnement est toujours là.
DO $$
DECLARE v_deleg boolean; v_restr boolean;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) LIKE '%has_page_permission%'
    INTO v_deleg
  FROM pg_policy
  WHERE polrelid = 'public.subjects'::regclass
    AND polname = 'subjects: écriture par admins de l''école';

  SELECT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.subjects'::regclass
      AND polname = 'secteur: cloisonnement'
      AND NOT polpermissive
  ) INTO v_restr;

  IF NOT coalesce(v_deleg, false) THEN
    RAISE EXCEPTION 'la clause de délégation n''a pas été posée sur subjects';
  END IF;
  IF NOT v_restr THEN
    RAISE EXCEPTION 'le cloisonnement RESTRICTIF de subjects a disparu — ne pas laisser la base dans cet état';
  END IF;

  RAISE NOTICE 'subjects : écriture déléguée posée, cloisonnement par secteur intact.';
END $$;
