-- supabase_genius_teacher_sector_resync.sql
-- REMETTRE LES 11 ENSEIGNANTS DANS LE FLUX DE SYNCHRONISATION.
--
-- ── LE SYMPTÔME ─────────────────────────────────────────────────────────────
-- Constaté le 27/08/2026 : en ligne tout va bien (le Directeur du Primaire ne
-- voit plus les enseignants du Secondaire), mais sur le serveur de l'école
-- SEUL L'ADMINISTRATEUR voit les enseignants — personne d'autre, pas même le
-- Principal du Collège.
--
-- ── LA CAUSE, ET ELLE N'EST PAS DANS LA DONNÉE ──────────────────────────────
-- La donnée cloud est juste : les 11 fiches portent bien `sector = 'college'`.
-- Ce qui a manqué, c'est le VOYAGE.
--
-- `sync-pull` est un keyset sur (updated_at, id) STRICTEMENT supérieur au
-- curseur. Une ligne dont l'horodatage est déjà dépassé n'est PLUS JAMAIS
-- renvoyée. Or les 11 fiches portent toutes `updated_at = 2026-08-26 20:02:44Z`,
-- l'instant de leur affectation — et le serveur de l'école les a tirées ce
-- soir-là, AVANT d'installer la 0.2.3.
--
-- À ce moment, la colonne `sector` n'existait pas encore côté LAN. `rawUpsert`
-- ne recopie que les colonnes présentes localement : il a donc ignoré `sector`
-- EN SILENCE, et le curseur a avancé. La 0.2.3 a ensuite créé la colonne — vide,
-- et plus rien ne renvoyait les valeurs.
--
-- Secteur NULL + rôles durcis = « n'appartient à aucun secteur » : aucun
-- responsable sectoriel ne voit la fiche, seul l'administrateur la voit pour
-- pouvoir la corriger. C'est exactement le comportement observé — le
-- cloisonnement fonctionnait, il cloisonnait juste sur une donnée absente.
--
-- ── CE QUE FAIT CE FICHIER ──────────────────────────────────────────────────
-- Il ne change AUCUNE valeur métier : `sector` vaut déjà 'college' et n'est pas
-- réécrit. Il ne touche QUE `updated_at`, pour replacer les 11 lignes au-delà de
-- tout curseur et les faire repartir au prochain pull.
--
-- La garde du §2 est là parce que ce fichier serait dangereux au mauvais moment :
-- si un secteur était NULL, le renvoyer ne réparerait rien et masquerait le vrai
-- problème.
--
-- ── CE QUI EMPÊCHE QUE ÇA RECOMMENCE ────────────────────────────────────────
-- Ce fichier soigne le cas présent. La cause de fond — une colonne ajoutée
-- localement APRÈS que les lignes soient passées — est traitée dans le code :
-- server/db.js remet le curseur de pull à zéro dès qu'une colonne est ajoutée à
-- une table synchronisée. Sans cela, chaque future colonne rejouerait la même
-- perte silencieuse.
--
-- Idempotent, mais inutile de le rejouer une fois la synchro constatée.
-- ============================================================================

BEGIN;

-- ── 1. AVANT ────────────────────────────────────────────────────────────────
SELECT 'AVANT' AS moment, sector, count(*) AS nb, max(updated_at) AS horodatage
  FROM public.teachers
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 GROUP BY 1, 2;

-- ── 2. GARDE — ne renvoyer que si la donnée est bonne ───────────────────────
-- Renvoyer une fiche NON affectée ne réparerait rien : elle repartirait NULL, le
-- serveur resterait dans le même état, et on croirait avoir agi.
DO $$
DECLARE v_non_affectes int;
BEGIN
  SELECT count(*) INTO v_non_affectes
    FROM public.teachers
   WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
     AND (sector IS NULL OR sector = '');
  IF v_non_affectes > 0 THEN
    RAISE EXCEPTION 'ANNULATION : % fiche(s) sans secteur. Les affecter AVANT de relancer la synchro.', v_non_affectes;
  END IF;
END $$;

-- ── 3. LE RENVOI ────────────────────────────────────────────────────────────
-- `sector` n'est pas dans le SET : on ne réécrit pas une donnée déjà juste.
-- `version` est incrémenté pour que la résolution LWW du LAN (updated_at, puis
-- version, puis device_id) tranche en faveur du cloud même en cas d'égalité
-- d'horodatage à la milliseconde près.
UPDATE public.teachers
   SET updated_at = now(),
       version    = COALESCE(version, 0) + 1
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a';

COMMIT;

-- ── 4. APRÈS ────────────────────────────────────────────────────────────────
-- Attendu : 11 en 'college', horodatage = maintenant.
SELECT 'APRÈS' AS moment, sector, count(*) AS nb, max(updated_at) AS horodatage
  FROM public.teachers
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 GROUP BY 1, 2;
