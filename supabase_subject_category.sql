-- MATIÈRE : CLASSEMENT EXPLICITE (langues, sciences, littéraire…)
-- ============================================================================
-- Ajoute `subjects.category` : la famille à laquelle l'école rattache la
-- matière.
--
-- ── LE DÉFAUT QUE CECI CORRIGE ──────────────────────────────────────────────
-- La catégorie d'une matière n'existait nulle part : elle était DÉDUITE de son
-- nom à chaque affichage, par une liste de mots-clés (src/config/
-- timetableConfig.js). Cette liste ne connaît que des libellés français et
-- anglais courants. Une école qui ajoute « LMC », « EFPS », « Travaux
-- Pratiques », « Langue Nationale » ou une matière locale voit donc sa matière
-- tomber dans « Autre » : grise dans l'emploi du temps, indistinguable d'une
-- récréation ou d'un libellé libre — et SANS AUCUN MOYEN DE CORRIGER, puisque
-- rien n'était stocké.
--
-- Le classement devient une donnée de la matière, posée à la création. La
-- déduction par mots-clés reste le DÉFAUT proposé dans le formulaire, plus le
-- verdict final.
--
-- ── VALEURS ─────────────────────────────────────────────────────────────────
--   'sciences' | 'informatique' | 'langues' | 'litteraire' | 'eps' | 'autre'
--
-- NULL = « non classée » : le produit retombe alors sur la déduction par le
-- nom, exactement comme avant. Aucune matière existante ne change donc de
-- comportement du fait de cette migration — c'est voulu, une école de 40
-- matières n'a pas à les reclasser pour installer une mise à jour.
--
-- PAS DE CONTRAINTE CHECK sur la liste. Le référentiel des catégories vit dans
-- le code (`CATEGORIES` + `DEFAULT_CATEGORY`) et peut gagner une famille ; une
-- contrainte en base ferait alors échouer l'écriture d'une valeur pourtant
-- légitime, au guichet, sans message exploitable. Le code retombe sur la
-- déduction si la valeur lue lui est inconnue (`categoryForSubject`).
--
-- Additif et idempotent. Ne touche aucune donnée existante.
-- À EXÉCUTER dans Supabase, dans un onglet VIDE, SANS RIEN SURLIGNER.
--
-- Côté édition LAN, la même colonne est posée par `server/db.js`
-- (`ensureColumn('subjects', 'category', …)`) : les deux éditions doivent
-- l'avoir, sinon `pickColumns()`/`rawUpsert()` jettent la valeur EN SILENCE.
-- ============================================================================

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS category TEXT;

COMMENT ON COLUMN public.subjects.category IS
  'Famille de la matière : sciences|informatique|langues|litteraire|eps|autre. '
  'NULL = non classée, le produit déduit alors la famille du nom.';

-- ── Contrôle ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'subjects'
       AND column_name = 'category'
  ) THEN
    RAISE EXCEPTION 'subjects.category absente apres migration.';
  END IF;
  RAISE NOTICE 'subjects.category OK.';
END $$;

-- ── Après exécution : matières non classées, par école ──────────────────────
-- Celles qui dependent encore de la deduction par mots-cles.
-- SELECT e.name                                   AS ecole,
--        count(*)                                 AS matieres,
--        count(s.category)                        AS classees,
--        count(*) - count(s.category)             AS non_classees
--   FROM public.subjects s
--   JOIN public.schools  e ON e.id = s.school_id
--  GROUP BY e.name
--  ORDER BY e.name;

-- ── Les libellés qui tombaient dans « Autre » faute de mot-clé ──────────────
-- Utile pour savoir quoi reclasser en priorite dans une ecole donnee.
-- SELECT DISTINCT s.name
--   FROM public.subjects s
--   JOIN public.schools  e ON e.id = s.school_id
--  WHERE e.name ILIKE '%genius%' AND s.category IS NULL
--  ORDER BY s.name;
