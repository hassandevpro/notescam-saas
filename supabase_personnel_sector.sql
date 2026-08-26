-- supabase_personnel_sector.sql
-- SECTEUR DU PERSONNEL — colonne `sector` sur `teachers`, contrainte de valeurs
-- sur `teachers` ET `staff`. Miroir cloud de la migration LAN (server/db.js).
--
-- ── POURQUOI ────────────────────────────────────────────────────────────────
-- Le secteur d'un enseignant était DÉRIVÉ de ses classes et de ses matières.
-- L'audit de THE GENIUS du 26/08/2026 a montré la limite : 11 enseignants, aucun
-- rattaché à une classe ni à une matière. Rien à dériver, donc aucun
-- cloisonnement possible. Le secteur devient une donnée DÉCLARÉE, la dérivation
-- restant le repli lorsqu'elle est possible.
--
-- ── AUCUN BACKFILL, ET C'EST DÉLIBÉRÉ ───────────────────────────────────────
-- Ce fichier n'écrit AUCUNE valeur. Les 11 enseignants restent à NULL jusqu'à ce
-- qu'un administrateur les affecte un par un.
--
-- NULL n'est pas un secteur : c'est « secteur non défini ». Ni « transverse »,
-- ni « secondaire ». Classer d'office ces 11 fiches en `college` aurait produit
-- une donnée fausse ayant l'apparence d'une donnée officielle — et aurait rendu
-- invisibles du Primaire des enseignants qui en relèvent peut-être.
--
-- ── VOCABULAIRE ─────────────────────────────────────────────────────────────
-- Les valeurs sont celles que `class_sector()` produit déjà et que
-- `user_sectors()` compare : 'maternelle' | 'primaire' | 'college'.
-- « Secondaire » est un LIBELLÉ d'écran ; la valeur stockée est 'college'.
-- Écrire 'secondaire' créerait une quatrième valeur qu'aucune comparaison
-- existante ne reconnaît : la fiche deviendrait invisible de tout le monde.
--
-- Idempotent. À coller dans Supabase → SQL Editor → Run.

BEGIN;

-- ── 1. La colonne ───────────────────────────────────────────────────────────
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS sector text;

COMMENT ON COLUMN public.teachers.sector IS
  'Secteur de rattachement DÉCLARÉ : maternelle | primaire | college. '
  'NULL = non défini (ni transverse, ni secondaire) — la fiche n''appartient alors '
  'à aucun périmètre sectoriel et n''est visible que de qui peut la corriger.';

-- ── 2. Les valeurs autorisées, en base ──────────────────────────────────────
-- NOT VALID : la contrainte s'applique aux écritures À VENIR sans exiger un
-- balayage de l'existant, qui pourrait échouer sur une valeur héritée d'une
-- autre école. La validation se fait ensuite, à froid (§4).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teachers_sector_chk') THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_sector_chk
      CHECK (sector IS NULL OR sector IN ('maternelle', 'primaire', 'college')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_sector_chk') THEN
    ALTER TABLE public.staff ADD CONSTRAINT staff_sector_chk
      CHECK (sector IS NULL OR sector IN ('maternelle', 'primaire', 'college')) NOT VALID;
  END IF;
END $$;

-- ── 3. Contrôle : ce que la migration laisse derrière elle ──────────────────
-- Doit montrer les 11 enseignants de THE GENIUS à NULL, et aucune valeur écrite.
SELECT COALESCE(sector, '(non défini)') AS secteur, count(*) AS nb
  FROM public.teachers
 WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 GROUP BY 1 ORDER BY 2 DESC;

COMMIT;

-- ── 4. À exécuter PLUS TARD, une fois les fiches affectées ──────────────────
-- Valide la contrainte sur les lignes existantes. Échoue s'il reste une valeur
-- hors vocabulaire — c'est précisément ce qu'on veut savoir.
--
--   ALTER TABLE public.teachers VALIDATE CONSTRAINT teachers_sector_chk;
--   ALTER TABLE public.staff    VALIDATE CONSTRAINT staff_sector_chk;

-- ── 5. RETOUR ARRIÈRE ───────────────────────────────────────────────────────
-- La colonne ne contient aucune donnée écrite par ce fichier ; la retirer ne
-- perd donc rien de ce qu'il a fait, mais effacerait les affectations saisies
-- depuis. À n'utiliser que juste après application.
--
--   ALTER TABLE public.teachers DROP CONSTRAINT IF EXISTS teachers_sector_chk;
--   ALTER TABLE public.staff    DROP CONSTRAINT IF EXISTS staff_sector_chk;
--   ALTER TABLE public.teachers DROP COLUMN IF EXISTS sector;
