-- supabase_genius_teacher_sector_assign.sql
-- AFFECTATION DES 11 ENSEIGNANTS DE THE GENIUS AU SECTEUR SECONDAIRE.
--
-- ── SUR QUOI REPOSE CETTE AFFECTATION ───────────────────────────────────────
-- Pas sur une déduction : les deux audits du 26/08/2026 ont établi qu'aucun de
-- ces 11 enseignants n'est rattaché à une classe ni à une matière, ni dans le
-- cloud ni sur le serveur de l'école. Rien dans les données ne permettait de
-- conclure.
--
-- Elle repose sur une DÉCLARATION de l'éditeur, qui connaît l'établissement :
-- « tous les enseignants présents sont du secondaire ; les enseignants du
-- primaire ne sont pas encore saisis. » C'est une information, pas une
-- supposition — et c'est ce qui distingue ce fichier du repli automatique que
-- nous avions écarté, lequel aurait classé secondaire des enseignants du
-- primaire déjà en base.
--
-- ── LA VALEUR ───────────────────────────────────────────────────────────────
-- 'college' EST le secondaire. « Secondaire » n'est qu'un libellé d'écran :
-- c'est 'college' que produit `class_sector()` et que compare `user_sectors()`.
-- Écrire 'secondaire' créerait une valeur qu'aucune règle ne reconnaît, et les
-- 11 fiches deviendraient invisibles de tout le monde, sans un mot d'erreur.
--
-- ── CE QUE CE FICHIER NE FAIT PAS ───────────────────────────────────────────
-- Il ne touche que la colonne `sector`, et uniquement sur les fiches encore
-- NULL. Une fiche déjà affectée n'est jamais réécrite — donc les enseignants du
-- primaire, quand ils seront saisis avec leur propre secteur, ne risquent rien
-- si ce fichier est rejoué.
--
-- `updated_at = now()` : sans lui, la ligne ne repart pas dans le pull
-- incrémental et le serveur de l'école ne verrait jamais l'affectation. C'est le
-- piège qui avait empêché `strict_role_enforcement` de descendre du cloud.
--
-- Idempotent. À coller dans Supabase → SQL Editor → Run.

BEGIN;

-- ── AVANT ───────────────────────────────────────────────────────────────────
SELECT 'AVANT' AS moment, COALESCE(sector, '(non défini)') AS secteur, count(*) AS nb
  FROM public.teachers
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 GROUP BY 1, 2;

-- ── AFFECTATION — les fiches ENCORE NULL, et elles seules ───────────────────
UPDATE public.teachers
   SET sector = 'college',
       updated_at = now()
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
   AND (sector IS NULL OR sector = '');

-- ── GARDE-FOU ───────────────────────────────────────────────────────────────
-- Annule tout si une valeur hors vocabulaire subsiste dans l'école. La
-- contrainte `teachers_sector_chk` est posée NOT VALID : elle ne balaie pas
-- l'existant, donc une valeur héritée passerait inaperçue.
DO $$
DECLARE v_mauvais int;
BEGIN
  SELECT count(*) INTO v_mauvais
    FROM public.teachers
   WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
     AND sector IS NOT NULL
     AND sector NOT IN ('maternelle', 'primaire', 'college');
  IF v_mauvais > 0 THEN
    RAISE EXCEPTION 'ANNULATION : % secteur(s) hors vocabulaire. Valeurs acceptées : maternelle, primaire, college.', v_mauvais;
  END IF;
END $$;

COMMIT;

-- ── APRÈS ───────────────────────────────────────────────────────────────────
-- Doit montrer 11 en 'college' et aucune ligne « non défini ».
SELECT 'APRÈS' AS moment, COALESCE(sector, '(non défini)') AS secteur, count(*) AS nb
  FROM public.teachers
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 GROUP BY 1, 2 ORDER BY 3 DESC;
