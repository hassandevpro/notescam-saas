-- ROLLBACK de supabase_mat_domaines_par_ecole.sql
-- ============================================================================
-- Rend `mat_domaines` à son état national : lecture pour tous, écriture service
-- role uniquement.
--
-- ATTENTION — LES DOMAINES MAISON. Si des écoles ont créé leurs propres domaines,
-- ce rollback les laisse en base mais les rend visibles de TOUTES les écoles (la
-- policy de lecture redevient `USING true`). Pire, des observations peuvent déjà
-- pointer vers eux : les supprimer casserait la clé étrangère.
--
-- Le §3 les liste AVANT de rien faire. S'il en existe, décidez d'abord de leur
-- sort — ce fichier ne tranche pas à votre place.
-- ============================================================================

-- ── 1. Les policies de l'école ──────────────────────────────────────────────
DROP POLICY IF EXISTS "mat domaines: lecture national + le sien"        ON public.mat_domaines;
DROP POLICY IF EXISTS "mat domaines: ecriture de ses propres domaines"  ON public.mat_domaines;

-- ── 2. La lecture historique ────────────────────────────────────────────────
DROP POLICY IF EXISTS "mat ref read" ON public.mat_domaines;
CREATE POLICY "mat ref read" ON public.mat_domaines
  FOR SELECT TO authenticated USING (true);

-- ── 3. Que reste-t-il de propre aux écoles ? (à lire AVANT d'aller plus loin) ─
SELECT d.id, d.code, d.intitule, d.school_id, s.name AS ecole,
       (SELECT count(*) FROM public.mat_observations o WHERE o.domaine_id = d.id) AS observations
  FROM public.mat_domaines d
  LEFT JOIN public.schools s ON s.id = d.school_id
 WHERE d.school_id IS NOT NULL
 ORDER BY s.name, d.ordre;

-- ── 4. Les masques — sans effet une fois la lecture rouverte ────────────────
-- DROP TABLE IF EXISTS public.mat_domaines_masques;   -- décommenter si assumé

-- ── 5. La colonne — volontairement COMMENTÉ ────────────────────────────────
-- La retirer effacerait l'appartenance des domaines maison, donc toute chance de
-- les retrouver. À ne faire qu'après avoir traité le §3.
-- ALTER TABLE public.mat_domaines DROP COLUMN IF EXISTS school_id;

DO $$
BEGIN
  RAISE NOTICE 'Lecture nationale retablie. Lisez le §3 : les domaines maison sont desormais visibles de toutes les ecoles.';
END $$;
