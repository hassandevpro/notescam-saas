-- supabase_genius_prevol.sql
-- PRÉ-VOL — les trois seules questions à trancher AVANT de lever le drapeau.
--
-- 100 % LECTURE SEULE : que des SELECT, aucun DDL, aucune écriture. Se colle tel
-- quel dans le SQL Editor de Supabase. Extrait du §A de
-- supabase_genius_role_permissions_verify.sql, réduit à ce qui décide du GO/NO-GO.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1 — QUELLE ÉCOLE ?  (ex-A1)                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Deux écoles portent « genius ». On veut celle qui a ~11 membres, pas
-- « The Genius International School » (1 membre).
--
-- ✅ ATTENDU : la ligne à ~11 membres porte bien l'id
--    6b68407b-3d2e-426b-81ff-c4e68e66120a, et strict_role_enforcement = false
--    (ou la colonne n'existe pas encore — la migration la crée).
-- ⚠️ SI L'ID DIFFÈRE : il faut le reporter dans la §9 de la migration AVANT
--    de l'exécuter, sinon c'est la mauvaise école qui serait durcie.
SELECT s.id,
       s.name,
       (SELECT count(*) FROM school_users su WHERE su.school_id = s.id) AS membres
  FROM schools s
 WHERE s.name ILIKE '%genius%'
 ORDER BY membres DESC;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2 — QUI POURRA ENCORE ENCAISSER ?  (ex-A3, LA question qui décide)       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- C'est le seul risque sérieux de la bascule. Une fois le drapeau levé,
-- encaisser exige la clé `fees.manage`, que la migration attribue aux rôles
-- caissier / raf / coordonnateur_general / fondatrice. Un compte qui ne porte
-- AUCUN de ces rôles ne pourra plus prendre un paiement, quel que soit son
-- rôle de base — c'est précisément le trou qu'on ferme, mais il ne faut pas
-- fermer le guichet avec.
--
-- ✅ ATTENDU : au moins UNE ligne. Idéalement le caissier et le RAF.
-- ⛔ SI VIDE : NE PAS LEVER LE DRAPEAU. Il faut d'abord attribuer le rôle
--    « caissier » à la personne qui tient la caisse (Personnel → Gouvernance),
--    sinon plus personne n'encaisse le lendemain matin.
SELECT ugr.role                             AS role_de_gouvernance,
       su.full_name                          AS titulaire,
       su.role                               AS role_de_base,
       coalesce(ugr.status, 'active')        AS statut,
       ugr.start_date, ugr.end_date,
       CASE WHEN ugr.role IN ('caissier','raf','coordonnateur_general','fondatrice')
            THEN '💰 pourra encaisser'
            WHEN ugr.role = 'controleur'
            THEN '👁 lecture seule'
            ELSE '—' END                     AS effet_apres_bascule
  FROM user_governance_roles ugr
  LEFT JOIN school_users su
         ON su.user_id = ugr.user_id AND su.school_id = ugr.school_id
 WHERE ugr.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY (ugr.role IN ('caissier','raf','coordonnateur_general','fondatrice')) DESC,
          ugr.role;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3 — COMBIEN D'ENSEIGNANTS SONT ENCORE GLOBAUX ?  (ex-A5)                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Le backfill de la Phase 2 a posé scope_global = true pour tout compte aux
-- trois tableaux de périmètre vides — donc, très probablement, pour TOUS les
-- enseignants. Un compte global traverse le cloisonnement par conception :
-- tant que ce chiffre n'est pas ramené à 0, la règle « aucun enseignant du
-- Collège n'accède au Primaire » n'est PAS tenue, quelles que soient les policies.
--
-- ✅ ATTENDU APRÈS le backfill enseignants : enseignants_globaux = 0.
-- ℹ️ AVANT : un chiffre égal au total est normal, c'est l'état hérité.
SELECT count(*) FILTER (WHERE scope_global) AS enseignants_globaux,
       count(*)                             AS enseignants_total
  FROM school_users
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
   AND role = 'teacher';


-- ── Détail, compte par compte (utile pour la reprise) ──────────────────────
SELECT su.full_name, su.role, su.scope_global, su.scope_cycles, su.permissions
  FROM school_users su
 WHERE su.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY su.role, su.full_name;
