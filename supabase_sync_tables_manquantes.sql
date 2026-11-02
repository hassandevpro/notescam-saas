-- ════════════════════════════════════════════════════════════════════════════
-- NotesCam — BRANCHER AU SYNC LES TABLES QUI N'Y ÉTAIENT PAS (lot 2b)
-- À coller dans : Supabase → SQL Editor → New query → Run. Idempotent.
-- Requiert : supabase_sync_phase2.sql (fournit `public.touch_sync_row()`),
--            supabase_parent_portal.sql, supabase_student_hard_delete.sql,
--            supabase_vie_scolaire.sql.
-- Miroir LAN : server/schema.sql · contrôle : server/_sync_couverture.test.mjs
--
-- ✅ APPLIQUÉ LE 01/11/2026 par le responsable. La requête de vérification du
--    §3 a rendu 3 colonnes de synchro et 1 trigger pour les trois tables.
--    Les quatre Edge Functions ont été déployées dans la foulée :
--    sync-push v11 · sync-pull v14 · sync-verify v5 · sync-repair v6.
--    RESTE À FAIRE : livrer le paquet LAN à l'école (étape 3 ci-dessous).
-- ════════════════════════════════════════════════════════════════════════════
--
-- CE QUE L'AUDIT A TROUVÉ. Sur les 121 tables du schéma LAN, 34 n'étaient ni
-- répliquées, ni déclarées locales, ni inscrites nulle part. Le contrat de
-- synchronisation (`server/_sync_contract.test.mjs`) recoupe sept listes entre
-- elles, mais il PART de `SYNCED_TABLES` : une table qui n'y figure pas n'est
-- réclamée par aucune comparaison. Elle n'apparaît nulle part, le test passe,
-- et elle ne circule d'aucun côté. C'est par là que `parent_student_links` est
-- passée — les frères et sœurs saisis à l'école ne remontaient jamais, et rien
-- ne le signalait.
--
-- CE QUE L'AUDIT AVAIT DIT DE FAUX, ET QUI EST CORRIGÉ ICI. La première
-- version affirmait que ces tables étaient ABSENTES du Cloud. C'était une
-- erreur de recherche : elle n'avait regardé que `supabase/migrations/`, alors
-- que ce dépôt garde son DDL Cloud dans les `supabase_*.sql` de la RACINE. Les
-- onze tables existent. Ce qui leur manque est bien plus petit :
--
--   1. les colonnes de synchro Phase 2 (updated_at / version / device_id) et
--      leur trigger — c'est l'objet de ce fichier ;
--   2. leur inscription dans les quatre listes des Edge Functions — à faire
--      APRÈS, et séparément, parce que cela se déploie ;
--   3. pour six d'entre elles, une colonne `id` qui n'existe pas (voir plus bas).
--
-- CE FICHIER NE FAIT QUE LE POINT 1, ET POUR QUATRE TABLES. C'est volontaire :
-- une migration qui pose des colonnes ne casse rien et peut être appliquée
-- aujourd'hui ; brancher les listes Edge change le trafic de synchronisation et
-- demande un déploiement. Les deux ne doivent pas voyager ensemble.
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ORDRE D'EXÉCUTION — IL N'EST PAS INDIFFÉRENT                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Depuis le 01/11/2026, `parent_student_links` est inscrite dans les SEPT
-- listes du contrat, Edge Functions comprises. (`parent_accounts` en est
-- RESSORTIE : elle n'a pas de `school_id`, et c'est délibéré — le moteur
-- partitionne tout par école, elle ne peut pas l'être. C'est le lien qui porte
-- la fratrie, et c'est lui qui voyage.) Le code
-- est prêt ; il ne l'est que si le Cloud l'est d'abord. Dans l'ordre :
--
--   1. EXÉCUTER CE FICHIER (colonnes de synchro + index). Sans lui, les
--      lignes poussées n'ont pas d'`updated_at` : le tirage ne les reverra
--      jamais.
--   2. DÉPLOYER LES EDGE FUNCTIONS :
--        supabase functions deploy sync-push sync-pull sync-verify sync-repair
--      Sans ce déploiement, le Cloud ignore ces deux tables et REFUSE les
--      lignes. Elles ne sont plus perdues (elles partent en quarantaine, avec
--      leur motif), mais elles ne montent pas.
--   3. SEULEMENT ENSUITE, livrer le paquet LAN à l'école. Au premier
--      démarrage, `reconcilierIdsParents()` (server/db.js) renomme les liens
--      locaux en identifiants déterminés et les enfile — c'est la décision
--      « le LAN fait foi », prise le 01/11/2026.
--
-- Inverser 2 et 3 n'abîme rien, mais remplit la quarantaine de liens refusés
-- qu'il faudra réenfiler à la main.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. Colonnes et triggers de synchronisation continue (Phase 2)           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Même bloc que `supabase_cash_book.sql`, à l'identique : c'est le motif établi
-- du dépôt, et s'en écarter créerait une table qui se synchronise « presque ».
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'parent_student_links',
    'deleted_fee_payments',
    'discipline_statistics'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'table %.% absente — ignorée (appliquer sa migration d''abord)', 'public', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS device_id text', t);
    IF to_regprocedure('public.touch_sync_row()') IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_sync_row()', t);
    ELSE
      RAISE NOTICE 'public.touch_sync_row() absente : appliquer supabase_sync_phase2.sql, puis rejouer ce fichier.';
    END IF;
  END LOOP;
END $$;

-- Index de tirage : `sync-pull` est un keyset sur (updated_at, id). Sans cet
-- index, chaque cycle refait un tri complet de la table.
CREATE INDEX IF NOT EXISTS parent_student_links_sync_idx ON public.parent_student_links (updated_at, id);
CREATE INDEX IF NOT EXISTS deleted_fee_payments_sync_idx ON public.deleted_fee_payments (updated_at, id);
CREATE INDEX IF NOT EXISTS discipline_statistics_sync_idx ON public.discipline_statistics (updated_at, id);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. CE QUI RESTE À TRANCHER AVANT DE BRANCHER LES LISTES EDGE            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── A. LE PIÈGE DE L'UNIQUE SUR UNE CLÉ NATURELLE ──────────────────────────
--
-- `parent_student_links` porte :
--     CONSTRAINT parent_student_links_unique UNIQUE (parent_user_id, student_id)
-- et `parent_accounts` porte UNIQUE (user_id). Le miroir LAN porte les mêmes.
--
-- C'est exactement le piège documenté dans `supabase_cash_book.sql` : si le
-- MÊME lien est créé des deux côtés — à l'école hors ligne, et en ligne par le
-- secrétariat — les deux lignes portent des `id` DIFFÉRENTS mais la même clé
-- naturelle. Le push bute sur la contrainte, et `sync-push` refuse la ligne.
-- Avec l'ancienne purge, elle disparaissait en silence ; avec la quarantaine,
-- elle est au moins visible — mais elle ne monte toujours pas.
--
-- LA PARADE CONNUE DU DÉPÔT, et il faut la décider avant de brancher :
-- dériver l'`id` de la clé naturelle (UUID v5, cf. `src/lib/sourceKey.js`).
-- Les deux côtés calculent alors le MÊME id, l'upsert écrase au lieu de
-- heurter, et le départage LWW s'applique normalement.
--
-- CE QUE ÇA SUPPOSE, et c'est pour cela que ce fichier ne le fait pas :
--   · côté LAN, `linkParentToStudent()` doit poser `sourceUuid(...)` au lieu
--     d'un `randomUUID()` ;
--   · les liens DÉJÀ créés des deux côtés portent des id aléatoires qui ne se
--     correspondent pas. Il faut les réconcilier une fois, en choisissant quel
--     côté fait foi. Ce choix appartient à l'école, pas au correctif.
--
-- `deleted_fee_payments` et `discipline_statistics` n'ont PAS ce piège : leur
-- `id` est celui de la ligne d'origine (le versement supprimé, l'incident).
-- Elles peuvent être branchées dès que ce fichier est appliqué.
--
-- ── B. LES SIX TABLES SANS COLONNE `id` ────────────────────────────────────
--
--     apc_classe_matieres      PRIMARY KEY (classe_id, matiere_id)
--     referentiel_libelles     PRIMARY KEY (school_id, kind, item_id)
--     prim_competences_masques PRIMARY KEY (school_id, competence_id)
--     apc_competences_masques  PRIMARY KEY (school_id, competence_id)
--     prim_criteres_masques    PRIMARY KEY (school_id, critere_id)
--     mat_domaines_masques     PRIMARY KEY (school_id, domaine_id)
--
-- `rawUpsert()` refuse toute ligne sans `id` (« if (!('id' in rec)) return
-- false »), et l'outbox s'indexe sur `row_id`. Ces six tables ne peuvent pas
-- traverser le moteur actuel. Il leur faut une colonne `id` DÉTERMINÉE par
-- leur clé naturelle, posée des deux côtés — même travail qu'en A, mais sur
-- des tables sans historique de collision, donc sans réconciliation à faire.
--
-- `apc_matieres` A un `id`, mais elle ne sert à rien seule : sans
-- `apc_classe_matieres`, une matière montée au Cloud n'y est rattachée à
-- aucune classe. Les deux voyagent ensemble ou pas du tout.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. VÉRIFICATION — à lancer après le Run, et à relire                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Les quatre tables doivent afficher 3 colonnes de synchro et 1 trigger.
SELECT c.relname AS table_name,
       count(*) FILTER (WHERE a.attname IN ('updated_at', 'version', 'device_id')) AS colonnes_sync,
       (SELECT count(*) FROM pg_trigger g
         WHERE g.tgrelid = c.oid AND g.tgname = 'trg_touch_' || c.relname) AS trigger_pose
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
 WHERE n.nspname = 'public'
   AND c.relname IN ('parent_student_links', 'deleted_fee_payments',
                     'discipline_statistics')
 GROUP BY c.relname, c.oid
 ORDER BY c.relname;
