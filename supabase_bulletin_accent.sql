-- ════════════════════════════════════════════════════════════════════════════
-- COULEUR D'ACCENT DU BULLETIN, PAR ÉCOLE
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. Le carnet primaire APC portait son vert en dur dans le gabarit
-- (`ACCENT '#047857'`). Ce vert est celui de THE GENIUS, l'école sur le modèle
-- de laquelle le carnet a été dessiné — ni une couleur du ministère, ni une
-- couleur de NotesCam. Les quarante-trois autres établissements l'imprimaient
-- sans l'avoir choisi.
--
-- L'école choisit désormais UNE couleur ; les quatre teintes du bulletin s'en
-- déduisent (`src/core/bulletinAccent.js`), avec un contrôle de contraste pour
-- qu'aucun choix ne produise un en-tête illisible.
--
-- ── RIEN NE CHANGE POUR LES ÉCOLES EXISTANTES ──────────────────────────────
-- La colonne est NULLABLE et reste NULL partout. `accentDeLEcole` retombe alors
-- sur `ACCENT_DEFAUT` = '#047857', c'est-à-dire EXACTEMENT le vert actuel. Un
-- bulletin déjà imprimé ne change pas d'aspect tant qu'une école n'a rien
-- choisi.
--
-- ⚠ ORDRE D'APPLICATION — À LIRE AVANT DE DISTRIBUER UN PAQUET LAN
--
-- `schools` est une table SYNCHRONISÉE, et `sync-push` filtre les TABLES, pas
-- les colonnes : une ligne portant une colonne inconnue du Cloud est rejetée
-- EN ENTIER par PostgREST. Si un serveur LAN acquiert `bulletin_accent` avant
-- que le Cloud ne l'ait, toute remontée de la ligne `schools` de cette école
-- échoue — en silence, et pour tous ses champs, pas seulement la couleur.
--
-- Donc, dans cet ordre, sans exception :
--   1. exécuter CE FICHIER sur le Cloud ;
--   2. vérifier le SELECT de contrôle en fin de fichier ;
--   3. seulement ensuite, distribuer le paquet LAN.
--
-- C'est la séquence déjà suivie pour `supabase_notes_manquantes_et_non_evaluees.sql`.

-- ── 1. La colonne ───────────────────────────────────────────────────────────
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS bulletin_accent text;

COMMENT ON COLUMN public.schools.bulletin_accent IS
  'Couleur d''accent des bulletins, en #rrggbb. NULL = vert MINEDUB par defaut '
  '(#047857). Les teintes derivees sont calculees par src/core/bulletinAccent.js.';

-- ── 2. Le garde-fou ─────────────────────────────────────────────────────────
-- On REFUSE en base ce que le moteur refuserait de toute façon : une valeur qui
-- n'est pas un hex. Sans cette contrainte, une saisie fautive (« vert ») serait
-- stockée, ignorée à l'affichage, et l'école conclurait que le réglage ne marche
-- pas. Mieux vaut l'écran qui refuse tout de suite.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_bulletin_accent_hex'
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_bulletin_accent_hex
      CHECK (bulletin_accent IS NULL OR bulletin_accent ~* '^#[0-9a-f]{6}$');
  END IF;
END $$;

-- ── 3. Vérification ─────────────────────────────────────────────────────────
DO $$
DECLARE
  col_ok  boolean;
  ctr_ok  boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schools'
      AND column_name = 'bulletin_accent'
  ) INTO col_ok;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_bulletin_accent_hex'
  ) INTO ctr_ok;

  IF NOT col_ok THEN
    RAISE EXCEPTION 'schools.bulletin_accent absente — migration non appliquee';
  END IF;
  IF NOT ctr_ok THEN
    RAISE EXCEPTION 'contrainte schools_bulletin_accent_hex absente';
  END IF;

  RAISE NOTICE 'OK — schools.bulletin_accent en place, contrainte posee.';
END $$;

-- ── 4. Contrôle final ───────────────────────────────────────────────────────
-- Attendu juste après la migration : ecoles_total = votre nombre d'ecoles,
-- accents_choisis = 0 (personne n'a encore rien choisi, donc aucun bulletin ne
-- change d'aspect).
SELECT
  (SELECT count(*) FROM public.schools)                                  AS ecoles_total,
  (SELECT count(*) FROM public.schools WHERE bulletin_accent IS NOT NULL) AS accents_choisis;
