-- ════════════════════════════════════════════════════════════════════════════
-- QUOTE-PART D'UN SERVICE, PAR LIGNE DE CATALOGUE ET PAR ANNÉE
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. L'état de cantine de THE GENIUS porte, sous le tableau, une ligne
-- que `fee_catalog` n'a nulle part où ranger :
--
--     2025/2026   « Q P = 2 500 X nbre »
--     2026/2027   « Q P = 3500 X NBRE »
--
-- C'est la part que l'école RETIENT sur le service, par élève facturé et par
-- mois. Ce n'est PAS le tarif payé par la famille (15 000, 7 500 le demi-mois),
-- et ce n'est pas un frais de plus : l'inscrire comme un frais la ferait
-- apparaître sur la fiche du parent et dans les totaux de scolarité, c'est-à-dire
-- qu'elle deviendrait une FAUSSE RECETTE.
--
-- ── CE QU'ELLE EST, ET CE QU'ELLE N'EST PAS ────────────────────────────────
-- La cantine est TENUE PAR L'ÉCOLE (confirmé par le responsable le 31/10/2026).
-- Les 15 000 sont donc la recette, enregistrée en `fee_payments` ; les denrées,
-- le cuisinier, l'eau et la lumière sont des dépenses, en `budget_expenses`.
--
-- La quote-part est la MARGE, et elle est déjà CONTENUE dans les 15 000.
-- Elle reste donc un INDICATEUR CALCULÉ à la lecture — `quote_part × effectif
-- facturé du mois` — et n'entre JAMAIS dans une table d'écritures :
--
--     ni `fee_payments`, ni `cash_movements`, ni `budget_expenses`.
--
-- L'y porter la compterait DEUX FOIS. C'est la règle du § 4 de
-- docs/MODULE_CANTINE.md, et cette colonne ne la contredit pas : elle stocke le
-- TAUX, jamais le montant.
--
-- ── POURQUOI SUR LA LIGNE DE CATALOGUE, ET PAS SUR L'ÉCOLE ─────────────────
-- Parce qu'elle change d'une année à l'autre (2 500 → 3 500) et d'un service à
-- l'autre. Portée par la ligne de catalogue, qui est déjà datée par
-- `academic_year`, les deux années coexistent sans aucune reprise de données.
-- Elle servira à l'identique au transport, aux tenues et à l'internat.
--
-- ── RIEN NE CHANGE POUR LES ÉCOLES EXISTANTES ──────────────────────────────
-- Colonne NULLABLE, NULL partout. `quotePartDuMois()` rend alors 0 et l'écran
-- n'affiche aucune ligne de quote-part. Aucun état financier existant ne bouge.
--
-- ⚠ ORDRE D'APPLICATION — À LIRE AVANT DE DISTRIBUER UN PAQUET LAN
--
-- `fee_catalog` est une table SYNCHRONISÉE, et `sync-push` filtre les TABLES,
-- pas les colonnes : une ligne portant une colonne inconnue du Cloud est
-- rejetée EN ENTIER par PostgREST (PGRST204). Si un serveur LAN acquiert
-- `quote_part` avant que le Cloud ne l'ait, toute remontée des lignes de
-- catalogue de cette école échoue — en silence, et pour TOUS leurs champs, pas
-- seulement la quote-part : l'école cesserait de remonter ses tarifs.
--
-- Donc, dans cet ordre, sans exception :
--   1. exécuter CE FICHIER sur le Cloud ;
--   2. vérifier le SELECT de contrôle en fin de fichier ;
--   3. seulement ensuite, distribuer le paquet LAN.
--
-- C'est la séquence déjà suivie pour `supabase_bulletin_accent.sql`.
--
-- Retour arrière :
--   ALTER TABLE public.fee_catalog DROP COLUMN IF EXISTS quote_part;

-- ── 1. La colonne ───────────────────────────────────────────────────────────
ALTER TABLE public.fee_catalog
  ADD COLUMN IF NOT EXISTS quote_part bigint;

COMMENT ON COLUMN public.fee_catalog.quote_part IS
  'Part retenue par l''ecole sur ce service, par eleve facture et par periode. '
  'NULL = aucune quote-part. INDICATEUR CALCULE a la lecture '
  '(quote_part x effectif) : ne doit jamais etre ecrit dans fee_payments, '
  'cash_movements ni budget_expenses — il serait compte deux fois. '
  'Un demi-mois donne une demi-quote-part (cf. src/lib/cantineEngine.js).';

-- ── 2. Le garde-fou ─────────────────────────────────────────────────────────
-- Une quote-part négative n'a aucun sens : ce serait une somme que l'école
-- VERSE au service, ce qui est une dépense, et les dépenses ont leur table.
-- Zéro reste permis — il dit explicitement « ce service ne dégage aucune part ».
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_catalog_quote_part_positive'
  ) THEN
    ALTER TABLE public.fee_catalog
      ADD CONSTRAINT fee_catalog_quote_part_positive
      CHECK (quote_part IS NULL OR quote_part >= 0);
  END IF;
END $$;

-- ── 3. Vérification ─────────────────────────────────────────────────────────
DO $$
DECLARE
  col_ok boolean;
  ctr_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fee_catalog'
      AND column_name = 'quote_part'
  ) INTO col_ok;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_catalog_quote_part_positive'
  ) INTO ctr_ok;

  IF NOT col_ok THEN
    RAISE EXCEPTION 'fee_catalog.quote_part absente — migration non appliquee';
  END IF;
  IF NOT ctr_ok THEN
    RAISE EXCEPTION 'contrainte fee_catalog_quote_part_positive absente';
  END IF;

  RAISE NOTICE 'OK — fee_catalog.quote_part en place, contrainte posee.';
END $$;

-- ── 4. Contrôle final ───────────────────────────────────────────────────────
-- Attendu JUSTE APRÈS la migration : lignes_total = votre nombre de lignes de
-- catalogue, quote_parts_posees = 0. Personne n'a encore renseigné de
-- quote-part, donc aucun écran ne change et aucun total ne bouge.
SELECT
  (SELECT count(*) FROM public.fee_catalog)                            AS lignes_total,
  (SELECT count(*) FROM public.fee_catalog WHERE quote_part IS NOT NULL) AS quote_parts_posees;
