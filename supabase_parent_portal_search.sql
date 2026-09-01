-- supabase_parent_portal_search.sql
-- ESPACE PARENT — recherche d'un compte parent EXISTANT, pour rattacher un
-- second enfant sans créer de doublon.
--
-- ⚠️  NON APPLIQUÉ EN PRODUCTION. Complément de supabase_parent_portal.sql.
--
-- ── LE BESOIN ───────────────────────────────────────────────────────────────
-- « Jean Dupont » a Marie en CM2 et Paul en 5e. Le secrétariat crée le compte
-- depuis la fiche de Marie ; arrivé sur celle de Paul, il doit RATTACHER le
-- compte existant, pas en refaire un. Sans cette RPC, l'interface n'a aucun
-- moyen de retrouver le compte : `parent_accounts` n'est lisible que par le
-- parent lui-même (policy « self read »), et `auth.users` n'est pas exposée.
--
-- ── LE PÉRIMÈTRE DE LA RECHERCHE, ET POURQUOI IL EST ÉTROIT ─────────────────
-- On ne rend QUE les parents ayant déjà un rattachement ACTIF à un élève de
-- l'école appelante. Un établissement ne peut donc pas énumérer les parents
-- d'un autre établissement, ni découvrir qu'une adresse existe ailleurs dans
-- NotesCam. C'est volontairement plus restrictif qu'une recherche globale :
-- une recherche globale transformerait ce guichet en annuaire d'utilisateurs.
--
-- Conséquence assumée : un parent inscrit dans l'école B n'est pas trouvable
-- depuis l'école A. L'interface propose alors la création, et `admin_create_
-- parent_account` (idempotent sur user_id) fusionnera les deux si l'adresse
-- est la même et que le mot de passe est connu.
--
-- Idempotent. Aucune donnée touchée, aucune policy modifiée.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_search_parent_accounts(
  p_school uuid,
  p_query  text DEFAULT NULL,
  p_limit  int  DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q text;
BEGIN
  -- Même autorité que le rattachement : membre actif, direction ou secrétariat.
  -- Aucun identifiant d'école n'est codé ici — la fonction reçoit l'école de
  -- l'appelant et vérifie qu'il en est membre.
  IF NOT EXISTS (
    SELECT 1 FROM public.school_users su
     WHERE su.user_id = auth.uid() AND su.school_id = p_school
       AND su.active AND su.role IN ('admin', 'censeur')
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  v_q := nullif(btrim(coalesce(p_query, '')), '');

  RETURN COALESCE((
    SELECT jsonb_agg(p ORDER BY p->>'full_name')
      FROM (
        SELECT jsonb_build_object(
                 'parent_user_id', a.user_id,
                 'full_name',      a.full_name,
                 'email',          a.email,
                 'phone',          a.phone,
                 'active',         a.active,
                 'created_at',     a.created_at,
                 -- Nombre d'enfants DANS CETTE ÉCOLE : de quoi afficher
                 -- « déjà 1 enfant ici » sans divulguer ses autres écoles.
                 'nb_enfants',     (SELECT count(*) FROM public.parent_student_links l2
                                     WHERE l2.parent_user_id = a.user_id
                                       AND l2.school_id = p_school AND l2.active)
               ) AS p
          FROM public.parent_accounts a
         WHERE a.active
           AND EXISTS (SELECT 1 FROM public.parent_student_links l
                        WHERE l.parent_user_id = a.user_id
                          AND l.school_id = p_school AND l.active)
           AND (v_q IS NULL
                OR a.full_name ILIKE '%' || v_q || '%'
                OR a.email     ILIKE '%' || v_q || '%'
                OR a.phone     ILIKE '%' || v_q || '%')
         ORDER BY a.full_name
         LIMIT GREATEST(1, LEAST(coalesce(p_limit, 20), 50))
      ) q
  ), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.admin_search_parent_accounts(uuid, text, int) FROM public;
REVOKE ALL ON FUNCTION public.admin_search_parent_accounts(uuid, text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_search_parent_accounts(uuid, text, int) TO authenticated;

COMMIT;

-- ⚠️ RAPPEL du piège documenté dans supabase_parent_portal_anon_revoke.sql :
-- sur Supabase, un ALTER DEFAULT PRIVILEGES accorde EXECUTE à `anon` NOMMÉMENT
-- sur toute nouvelle fonction. Le REVOKE FROM public ne suffit pas — d'où le
-- REVOKE FROM anon explicite ci-dessus. À vérifier après application :
--   SELECT has_function_privilege('anon', 'public.admin_search_parent_accounts(uuid,text,int)', 'EXECUTE');
--   -- doit rendre false
