-- RETOUR ARRIÈRE de supabase_mat_observations_ua.sql
-- ============================================================================
-- Rétablit l'identité (élève, domaine, TRIMESTRE) et retire les colonnes d'UA.
--
-- ⚠️ À LIRE AVANT DE L'EXÉCUTER — ce retour arrière PEUT ÉCHOUER, et c'est
-- voulu. Si des observations ont déjà été rattachées aux UA, deux UA d'un même
-- trimestre coexistent pour un même (élève, domaine) : l'ancienne contrainte
-- d'unicité ne peut alors plus être posée. Le script s'arrête AVANT de rien
-- retirer et dit combien de groupes font obstacle.
--
-- Dans ce cas, l'ordre correct est :
--   1. `node scripts/migrer-maternelle-ua.mjs --retour-arriere` (il remet chaque
--      observation sur son `ancienne_periode` et vide `ua`),
--   2. puis ce fichier.
--
-- Remettre la contrainte de force effacerait du travail d'institutrice : le
-- script ne le fera pas.
-- ============================================================================

-- 1) GARDE-FOU : y a-t-il plus d'une observation par (élève, domaine, trimestre) ?
DO $$
DECLARE
  obstacles integer;
BEGIN
  SELECT count(*) INTO obstacles FROM (
    SELECT 1 FROM public.mat_observations
     GROUP BY eleve_id, domaine_id, trimestre_id
    HAVING count(*) > 1
  ) t;
  IF obstacles > 0 THEN
    RAISE EXCEPTION
      'RETOUR ARRIÈRE REFUSÉ : % groupe(s) (élève, domaine, trimestre) portent plusieurs observations. Lancez d''abord « node scripts/migrer-maternelle-ua.mjs --retour-arriere ».',
      obstacles;
  END IF;
END $$;

-- 2) L'ancienne clé revient.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.mat_observations'::regclass AND contype = 'u'
       AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (eleve_id, domaine_id, trimestre_id)%'
  ) THEN
    ALTER TABLE public.mat_observations
      ADD CONSTRAINT mat_observations_uniq UNIQUE (eleve_id, domaine_id, trimestre_id);
  END IF;
END $$;

-- 3) La clé par UA et son CHECK s'en vont.
ALTER TABLE public.mat_observations
  DROP CONSTRAINT IF EXISTS mat_observations_uniq_ua,
  DROP CONSTRAINT IF EXISTS mat_observations_ua_valide;

-- 4) Les colonnes. `ua` part en dernier : jusqu'ici, tout échec laissait les
--    données intactes.
ALTER TABLE public.mat_observations
  DROP COLUMN IF EXISTS ua_migre_par,
  DROP COLUMN IF EXISTS ua_migre_le,
  DROP COLUMN IF EXISTS ancienne_periode,
  DROP COLUMN IF EXISTS ua;

-- Contrôle : 0 colonne d'UA, 1 clé par trimestre, 0 clé par UA.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mat_observations'
      AND column_name IN ('ua', 'ancienne_periode', 'ua_migre_le', 'ua_migre_par')) AS colonnes_ua,
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.mat_observations'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (eleve_id, domaine_id, trimestre_id)%') AS cle_trimestre,
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.mat_observations'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE 'UNIQUE (eleve_id, domaine_id, ua)%') AS cle_ua;
