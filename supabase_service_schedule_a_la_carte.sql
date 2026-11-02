-- ════════════════════════════════════════════════════════════════════════════
-- SERVICES À LA CARTE — reprise des abonnements facturés d'office sur l'année
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠ CE FICHIER NE MODIFIE RIEN TEL QUEL. Seule la section 1 s'exécute : elle
-- LISTE ce qui serait touché. Les sections 2 à 4 sont commentées et doivent
-- être décommentées une par une, après lecture du dry-run. C'est de la donnée
-- financière : une dette effacée par erreur ne se remarque pas, elle se
-- constate au moment où le parent dit « j'ai déjà payé ».
--
-- CE QUI A CHANGÉ. Abonner un élève à un service posait l'échéancier COMPLET —
-- dix mois dus dès la souscription. Le registre réel de l'école dit l'inverse :
-- ses effectifs de cantine vont de 22 à 37 d'un mois à l'autre. Désormais la
-- secrétaire coche les mois, et eux seuls existent. Restent les abonnements
-- créés sous l'ancien modèle, qui portent des mois que personne n'a demandés.
--
-- ON NE SUPPRIME RIEN. Les lignes ne sont pas effacées mais passées en
-- `status = 'not_applicable'` — le statut qui existe déjà pour « ce mois n'est
-- pas dû », celui de la convention « / » du cahier de l'école. Trois raisons :
--   1. le moteur l'exclut déjà de l'attendu et de l'impayé, donc rien d'autre
--      n'a besoin de changer ;
--   2. la ligne reste visible, avec son historique et son `updated_at` : un
--      DELETE, lui, ne laisse rien à montrer à qui demanderait des comptes ;
--   3. le retour arrière est une seule requête (section 4).
--
-- CE QUI N'EST JAMAIS TOUCHÉ, et c'est la règle qui compte :
--   • toute échéance portant un VERSEMENT, même partiel, même contre-passé ;
--   • toute échéance déjà DÉCIDÉE par l'école (`exempted`, `abandoned`,
--     `not_applicable`) — une exemption accordée est une décision, pas un
--     reliquat de génération ;
--   • tout ce qui ne relève pas d'un SERVICE : la scolarité échelonnée garde
--     ses dix tranches, qui sont bien dues dès l'inscription.
--
-- ORDRE : ce fichier s'applique au Cloud. L'édition LAN n'a rien à migrer tant
-- qu'elle n'a pas reçu le paquet correspondant ; si un poste LAN a déjà des
-- abonnements, rejouer les mêmes sections sur sa base SQLite (la syntaxe des
-- sections 1, 3 et 4 y est valable telle quelle, sauf `string_agg`).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. DRY-RUN — ce qui serait touché, et rien d'autre ────────────────────
-- À exécuter SEUL d'abord, et à conserver : c'est la pièce qui justifiera, plus
-- tard, pourquoi tel mois a cessé d'être dû.
WITH services AS (
  SELECT id FROM public.fee_catalog
   WHERE category IN ('cantine', 'transport', 'tenue', 'internat', 'soutien',
                      'activites', 'bibliotheque', 'assurance', 'sortie')
),
candidates AS (
  SELECT s.id, s.school_id, s.student_id, s.period_key, s.amount_due, s.status,
         i.fee_catalog_id
    FROM public.fee_schedule_items s
    JOIN public.student_fee_items i ON i.id = s.student_fee_item_id
   WHERE i.fee_catalog_id IN (SELECT id FROM services)
     -- Jamais une décision de l'école.
     AND s.status = 'due'
     -- Jamais une échéance qui porte de l'argent. `NOT EXISTS` et non un LEFT
     -- JOIN avec somme : une contre-passation (montant négatif) ramènerait la
     -- somme à zéro et ferait passer pour « non payé » un mois qui a une
     -- histoire. Ce qui compte est qu'une écriture EXISTE.
     AND NOT EXISTS (
       SELECT 1 FROM public.fee_payments p
        WHERE p.fee_schedule_item_id = s.id
     )
)
SELECT
  sc.name                       AS ecole,
  fc.name                       AS service,
  count(*)                      AS mois_concernes,
  count(DISTINCT c.student_id)  AS eleves_concernes,
  sum(c.amount_due)             AS dette_annulee,
  min(c.period_key)             AS du_mois,
  max(c.period_key)             AS au_mois
FROM candidates c
JOIN public.schools sc    ON sc.id = c.school_id
JOIN public.fee_catalog fc ON fc.id = c.fee_catalog_id
GROUP BY sc.name, fc.name
ORDER BY dette_annulee DESC;

-- ── 2. FILET — copie de l'état AVANT, à créer avant toute écriture ────────
-- Sans cette table, la section 4 n'a rien à restaurer.
--
-- CREATE TABLE IF NOT EXISTS public.fee_schedule_items_backup_alacarte (
--   id          TEXT PRIMARY KEY,
--   old_status  TEXT NOT NULL,
--   school_id   TEXT,
--   period_key  TEXT,
--   amount_due  BIGINT,
--   saved_at    TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
--
-- INSERT INTO public.fee_schedule_items_backup_alacarte (id, old_status, school_id, period_key, amount_due)
-- SELECT s.id, s.status, s.school_id, s.period_key, s.amount_due
--   FROM public.fee_schedule_items s
--   JOIN public.student_fee_items i ON i.id = s.student_fee_item_id
--  WHERE i.fee_catalog_id IN (SELECT id FROM public.fee_catalog
--                              WHERE category IN ('cantine','transport','tenue','internat',
--                                                 'soutien','activites','bibliotheque','assurance','sortie'))
--    AND s.status = 'due'
--    AND NOT EXISTS (SELECT 1 FROM public.fee_payments p WHERE p.fee_schedule_item_id = s.id)
-- ON CONFLICT (id) DO NOTHING;

-- ── 3. APPLICATION — à ne décommenter qu'après 1 ET 2 ─────────────────────
-- `UPDATE … FROM backup` : on ne retouche QUE les lignes dont l'état d'avant a
-- été sauvegardé. Rejouer la section est donc sans effet supplémentaire, et
-- aucune ligne ne peut être modifiée sans filet.
--
-- UPDATE public.fee_schedule_items s
--    SET status = 'not_applicable',
--        updated_at = now(),
--        version = COALESCE(s.version, 0) + 1
--   FROM public.fee_schedule_items_backup_alacarte b
--  WHERE b.id = s.id
--    AND s.status = 'due';
--
-- Contrôle à recopier après exécution — les deux nombres doivent être égaux :
-- SELECT
--   (SELECT count(*) FROM public.fee_schedule_items_backup_alacarte)           AS sauvegardees,
--   (SELECT count(*) FROM public.fee_schedule_items s
--      JOIN public.fee_schedule_items_backup_alacarte b ON b.id = s.id
--     WHERE s.status = 'not_applicable')                                        AS passees;

-- ── 4. RETOUR ARRIÈRE — remet exactement l'état d'avant ───────────────────
-- UPDATE public.fee_schedule_items s
--    SET status = b.old_status,
--        updated_at = now(),
--        version = COALESCE(s.version, 0) + 1
--   FROM public.fee_schedule_items_backup_alacarte b
--  WHERE b.id = s.id
--    AND s.status = 'not_applicable';
--
-- La table de filet se garde : elle est la trace de l'opération. Ne la
-- supprimer qu'une fois l'année scolaire close et le registre imprimé.
