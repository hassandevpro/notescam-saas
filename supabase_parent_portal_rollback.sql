-- supabase_parent_portal_rollback.sql
-- RETOUR ARRIÈRE de supabase_parent_portal.sql.
--
-- ⚠️  LA SUPPRESSION DES DEUX TABLES DÉTRUIT LES RATTACHEMENTS PARENT↔ENFANT.
--     Si des comptes parents ont déjà été créés et distribués aux familles, il
--     faudra tout refaire. Le §1 ci-dessous suffit dans la quasi-totalité des
--     cas : il FERME l'espace parent sans rien perdre. Ne jouez le §2 que si la
--     fonctionnalité est abandonnée.
--
-- Ce que ce fichier NE FAIT PAS, et ne doit jamais faire : toucher à une policy
-- ou à une fonction préexistante. La migration n'en a modifié aucune ; le retour
-- arrière n'a donc rien à y restaurer.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §1 — FERMETURE SANS PERTE (à privilégier)                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Retire l'exécution des RPC à `authenticated` : l'espace parent devient
-- inaccessible immédiatement, les données de rattachement restent en place, et
-- un simple GRANT le rouvre. C'est le geste d'urgence.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.parent_context()                  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.parent_dashboard()                FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.parent_child_grades(uuid)         FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.parent_child_bulletins(uuid)      FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.parent_child_attendance(uuid)     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.parent_child_fees(uuid, text)     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.parent_child_documents(uuid)      FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.parent_notifications(int)         FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.parent_update_profile(text, text) FROM authenticated;

COMMIT;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §2 — SUPPRESSION COMPLÈTE (destructif — décommenter sciemment)           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Avant de jouer ce bloc, SAUVEGARDEZ les rattachements :
--
--   SELECT * FROM public.parent_student_links;
--   SELECT * FROM public.parent_accounts;
--
-- L'ordre compte : les fonctions d'abord (elles référencent les tables), la
-- policy de notifications ensuite, les tables en dernier.
/*
BEGIN;

DROP FUNCTION IF EXISTS public.parent_dashboard();
DROP FUNCTION IF EXISTS public.parent_context();
DROP FUNCTION IF EXISTS public.parent_child_grades(uuid);
DROP FUNCTION IF EXISTS public.parent_child_bulletins(uuid);
DROP FUNCTION IF EXISTS public.parent_child_attendance(uuid);
DROP FUNCTION IF EXISTS public.parent_child_fees(uuid, text);
DROP FUNCTION IF EXISTS public.parent_child_documents(uuid);
DROP FUNCTION IF EXISTS public.parent_notifications(int);
DROP FUNCTION IF EXISTS public.parent_update_profile(text, text);

DROP FUNCTION IF EXISTS public.admin_list_parent_links(uuid);
DROP FUNCTION IF EXISTS public.admin_revoke_parent_link(uuid);
DROP FUNCTION IF EXISTS public.admin_link_parent_student(uuid, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.admin_create_parent_account(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.can_manage_parent_links(uuid, uuid);

DROP FUNCTION IF EXISTS public.parent_owns_student(uuid);
DROP FUNCTION IF EXISTS public.is_parent_account();

-- La SEULE policy posée sur une table préexistante. La retirer rend
-- `notifications` exactement à son état d'avant.
DROP POLICY IF EXISTS "notifications: parent inbox read" ON public.notifications;
DROP POLICY IF EXISTS "notifications: parent mark read" ON public.notifications;

DROP TABLE IF EXISTS public.parent_student_links;
DROP TABLE IF EXISTS public.parent_accounts;

-- La colonne de publication du rang. Sa valeur par défaut est false : la
-- conserver n'a aucun effet, et la supprimer est le seul geste vraiment
-- irréversible pour les écoles qui l'auraient activée. À vous de choisir.
-- ALTER TABLE public.schools DROP COLUMN IF EXISTS parent_show_rank;

COMMIT;
*/

-- ── CÔTÉ APPLICATION ────────────────────────────────────────────────────────
-- Le retour arrière du frontend et du serveur LAN se fait par le dépôt (git),
-- pas par ce fichier. Deux points méritent d'être connus :
--
--  • `src/lib/auth.js` appelle `parent_context()` UNIQUEMENT quand aucune ligne
--    school_users n'a été trouvée, et l'appel est enveloppé dans un try/catch.
--    Après le §2, la RPC n'existe plus : l'appel échoue silencieusement et
--    l'écran « Compte non configuré » revient — le comportement d'avant.
--
--  • `server/scopeGuard.js` interroge `parent_accounts` dans un try/catch et
--    rend false si la table n'existe pas. Un serveur LAN à jour continue donc
--    de fonctionner face à une base d'où l'espace parent a été retiré.
