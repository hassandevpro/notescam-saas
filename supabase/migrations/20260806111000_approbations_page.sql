-- ============================================================================
-- NotesCam — /app/approbations dans les pages des rôles APPROBATEURS
--
-- POURQUOI
--   En gouvernance financière distante (deployment_policy finance.governance=cloud),
--   /app/depenses est en LECTURE SEULE côté Cloud : l'approbation d'une dépense se
--   fait sur /app/approbations (le Cloud émet une intention, le serveur LAN
--   revalide et applique).
--
--   Or la route /app/approbations est gardée `allow={['admin','censeur']}` et
--   n'appartenait aux `pages` d'AUCUN rôle de gouvernance. Un porteur de rôle
--   dont le rôle de base n'est ni admin ni censeur (cas courant : RAF, Fondatrice
--   ou Coordonnateur rattachés comme `teacher`) voyait donc la file « Dépenses à
--   approuver » sur son tableau de bord et se faisait REDIRIGER en cliquant.
--
--   Constat en base avant correction : 3 codes de rôle portent `expense.approve`
--   (fondatrice, coordonnateur_general, raf) sur 37 écoles — aucun n'avait la page.
--
-- CIBLAGE
--   Seuls les rôles qui portent réellement le workflow d'approbation de dépense
--   reçoivent la page. Le caissier (workflow `expense.pay` uniquement) n'y touche
--   pas : il ne décide rien, il décaisse.
--
-- IDEMPOTENT — un rôle qui a déjà la page n'est pas modifié.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 0 — NORMALISATION jsonb (prérequis technique)                      ║
-- ║                                                                          ║
-- ║ 10 lignes (école LA RÉUSSITE) stockent `pages`/`workflows` comme une      ║
-- ║ CHAÎNE JSON au lieu d'un TABLEAU jsonb — un double encodage à l'écriture. ║
-- ║ Sans effet à l'exécution (le client fait `asArray()` qui reparse), mais   ║
-- ║ les opérateurs jsonb (`@>`, `||`) ne fonctionnent pas dessus.             ║
-- ║ On remet donc tout le catalogue en tableaux avant d'y toucher.            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UPDATE public.governance_roles
   SET pages       = CASE WHEN jsonb_typeof(pages)       = 'string'
                          THEN COALESCE((pages       #>> '{}')::jsonb, '[]'::jsonb) ELSE pages       END,
       workflows   = CASE WHEN jsonb_typeof(workflows)   = 'string'
                          THEN COALESCE((workflows   #>> '{}')::jsonb, '[]'::jsonb) ELSE workflows   END,
       permissions = CASE WHEN jsonb_typeof(permissions) = 'string'
                          THEN COALESCE((permissions #>> '{}')::jsonb, '[]'::jsonb) ELSE permissions END,
       dashboards  = CASE WHEN jsonb_typeof(dashboards)  = 'string'
                          THEN COALESCE((dashboards  #>> '{}')::jsonb, '[]'::jsonb) ELSE dashboards  END
 WHERE jsonb_typeof(pages)       = 'string'
    OR jsonb_typeof(workflows)   = 'string'
    OR jsonb_typeof(permissions) = 'string'
    OR jsonb_typeof(dashboards)  = 'string';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 1 — Ajout de la page aux rôles approbateurs                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

UPDATE public.governance_roles
   SET pages = pages || '["/app/approbations"]'::jsonb
 WHERE jsonb_typeof(pages) = 'array'
   AND jsonb_typeof(workflows) = 'array'
   AND workflows @> '["expense.approve"]'::jsonb
   AND NOT (pages @> '["/app/approbations"]'::jsonb);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 2 — VÉRIFICATION                                                   ║
-- ║ Doit renvoyer manquants = 0 et aucune ligne de type 'string'.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT
  count(*) FILTER (WHERE workflows @> '["expense.approve"]'::jsonb
                     AND NOT (pages @> '["/app/approbations"]'::jsonb)) AS manquants,
  count(*) FILTER (WHERE workflows @> '["expense.approve"]'::jsonb)     AS roles_approbateurs,
  count(*) FILTER (WHERE jsonb_typeof(pages) <> 'array')                AS pages_mal_typees
FROM public.governance_roles;

-- Vérification en NOTICE (la sortie de `db push` n'affiche pas les SELECT).
DO $$
DECLARE m int; r int; t int; s int;
BEGIN
  SELECT count(*) FILTER (WHERE workflows @> '["expense.approve"]'::jsonb
                            AND NOT (pages @> '["/app/approbations"]'::jsonb)),
         count(*) FILTER (WHERE workflows @> '["expense.approve"]'::jsonb),
         count(*) FILTER (WHERE jsonb_typeof(pages) <> 'array'),
         count(*)
    INTO m, r, t, s FROM public.governance_roles;
  RAISE NOTICE 'rôles approbateurs = % | sans la page = % (attendu 0) | pages mal typées = % (attendu 0) | total rôles = %', r, m, t, s;
  IF m > 0 OR t > 0 THEN RAISE EXCEPTION 'Correction incomplète.'; END IF;
END $$;
