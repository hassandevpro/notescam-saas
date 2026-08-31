-- supabase_parent_portal_anon_revoke.sql
-- CORRECTIF de supabase_parent_portal.sql — retire `anon` des RPC de l'espace parent.
--
-- ── LE DÉFAUT ───────────────────────────────────────────────────────────────
-- Le §15 de la migration écrivait `REVOKE ALL ON FUNCTION … FROM public` avant
-- de donner l'exécution à `authenticated`. C'est le geste habituel, et il est
-- INSUFFISANT sur Supabase : le projet porte un ALTER DEFAULT PRIVILEGES qui
-- accorde EXECUTE sur toute nouvelle fonction à `anon`, `authenticated` et
-- `service_role` NOMMÉMENT. Révoquer `PUBLIC` ne retire donc rien à `anon`,
-- qui tient son droit d'une attribution explicite.
--
-- Constaté par le §B3 du verify, qui existait précisément pour ça :
--   anon_exclu_partout = false
--
-- ── CE QUE CE DÉFAUT NE FAISAIT PAS ─────────────────────────────────────────
-- Aucune fuite de données. Chaque RPC est gardée par `auth.uid()`, qui vaut
-- NULL pour un appelant anonyme :
--   • parent_owns_student  -> false            -> les parent_child_* rendent NULL
--   • is_parent_account    -> false            -> parent_context/dashboard NULL
--   • parent_update_profile-> RAISE 'Non autorisé'
--   • admin_*              -> RAISE 'Non autorisé' (aucune ligne school_users)
-- Le test 20 tenait donc sur le fond. Mais la défense en profondeur annoncée —
-- « aucune RPC parent n'est même APPELABLE sans session » — n'était pas en
-- place, et une surface d'appel inutile reste une surface d'appel.
--
-- Idempotent. Aucune donnée touchée, aucune policy touchée : ce fichier ne fait
-- que RETIRER un droit.
-- ============================================================================

BEGIN;

DO $$
DECLARE r record; n int := 0;
BEGIN
  -- On révoque sur la SIGNATURE réelle lue dans le catalogue, plutôt que sur une
  -- liste écrite à la main : une liste se désynchronise dès qu'une RPC est
  -- ajoutée, et c'est exactement ainsi que le trou d'origine est passé.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
     WHERE n2.nspname = 'public'
       AND (p.proname LIKE 'parent\_%'
            OR p.proname IN ('is_parent_account', 'can_manage_parent_links',
                             'admin_create_parent_account', 'admin_link_parent_student',
                             'admin_revoke_parent_link', 'admin_list_parent_links'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'anon révoqué sur % fonction(s) de l''espace parent', n;
END $$;

-- Le portail PUBLIC par jeton garde son accès anonyme : c'est sa raison d'être
-- (un lien par élève, sans compte, pour les familles non équipées). On le
-- réaffirme ici pour qu'aucune relecture du fichier ne croie à un oubli.
GRANT EXECUTE ON FUNCTION public.get_parent_portal_data(uuid) TO anon;

COMMIT;

-- Contrôle attendu après application — les deux colonnes doivent valoir true :
--
--   SELECT bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE')) AS anon_exclu,
--          bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS authentifie_ok
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND (p.proname LIKE 'parent\_%' OR p.proname IN ('is_parent_account',
--           'can_manage_parent_links','admin_create_parent_account',
--           'admin_link_parent_student','admin_revoke_parent_link','admin_list_parent_links'));
