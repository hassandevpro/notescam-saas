-- supabase_creche_cycle.sql
-- Classes d'accueil PRÉ-SCOLAIRE (crèche, garderie, nursery, pré-scolaire) :
-- rétablit leur SECTEUR à « maternelle ».
--
-- Miroir cloud de `ensureCrecheSector()` (server/db.js), qui fait la même chose sur
-- chaque serveur LAN au démarrage. Les deux sont nécessaires : les réparations du
-- serveur n'alimentent pas l'outbox de synchronisation, elles ne remontent donc pas
-- d'elles-mêmes ici.
--
-- Le problème corrigé (constaté à THE GENIUS le 26/08/2026) : une classe « CRECHE »
-- sans cycle ni section déclarés n'appartient à AUCUN secteur. `class_sector()` rend
-- NULL, le cloisonnement la refuse à tout compte borné à un secteur, et elle n'est
-- visible que des comptes à périmètre global — la finance. D'où le comptage à 19
-- classes au lieu de 20 sur les comptes du primaire.
--
-- `updated_at` est bousculé volontairement : sans cela, la ligne ne repart pas dans
-- le pull incrémental et les serveurs d'école ne verraient jamais la correction.
--
-- Idempotent : ne réécrit que ce qui diffère. À coller dans SQL Editor → Run.

UPDATE public.classes
   SET cycle      = 'maternelle',
       section    = CASE
                      -- `section` porte tantôt un SECTEUR, tantôt un suffixe de
                      -- groupe (« A »). On ne renseigne que le premier cas : écraser
                      -- un suffixe de groupe perdrait le libellé de la classe.
                      WHEN section IS NULL
                        OR section IN ('maternelle', 'primaire', 'premier_cycle', 'second_cycle')
                      THEN 'maternelle'
                      ELSE section
                    END,
       updated_at = now()
 WHERE (
         name ILIKE '%creche%'  OR name ILIKE '%crèche%'
      OR name ILIKE '%garderie%' OR name ILIKE '%nursery%'
      OR name ILIKE '%prescolaire%' OR name ILIKE '%pré-scolaire%' OR name ILIKE '%prescolar%'
      OR name ILIKE '%preschool%'   OR name ILIKE '%day care%'     OR name ILIKE '%daycare%'
       )
   AND (
         cycle IS DISTINCT FROM 'maternelle'
      OR (section IS NULL
          OR (section IN ('primaire', 'premier_cycle', 'second_cycle')))
       );

-- Contrôle : doit renvoyer 0 ligne.
SELECT id, name, cycle, section
  FROM public.classes
 WHERE (name ILIKE '%creche%' OR name ILIKE '%crèche%' OR name ILIKE '%garderie%' OR name ILIKE '%nursery%')
   AND cycle IS DISTINCT FROM 'maternelle';
