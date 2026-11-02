-- ════════════════════════════════════════════════════════════════════════════
-- ENCAISSEMENT — mode de paiement, payeur, référence sur `fee_payments`
-- ════════════════════════════════════════════════════════════════════════════
-- Le guichet encaisse aujourd'hui un montant, une date et une note libre. Le
-- reçu ne peut donc pas dire COMMENT l'argent est entré, et la note sert de
-- fourre-tout : « MoMo 677… », « virement BICEC », « papa de Marie » y tiennent
-- tous les trois, mélangés, non cherchables, non totalisables. Un arrêté de
-- caisse qui distingue les espèces du Mobile Money ne peut pas se lire ainsi.
--
-- TROIS COLONNES, PAS UNE TABLE. La tentation serait d'ouvrir `service_payments`
-- pour la cantine, avec ses propres imputations et sa propre numérotation. Ce
-- serait scinder la caisse : l'arrêté, le journal et `cashBookEngine` ne
-- verraient plus l'argent des services, et il faudrait un SECOND compteur de
-- reçus — donc deux séries, donc le trou que la numérotation continue sert
-- précisément à rendre visible. `fee_payments` porte déjà
-- `fee_schedule_item_id`, c'est-à-dire l'imputation AU MOIS, ainsi que le
-- caissier figé, la contre-passation et le numéro attribué par le serveur. Il
-- lui manquait trois champs, pas une table.
--
-- ADDITIVE ET SANS EFFET SUR L'EXISTANT. Les trois colonnes sont NULLABLES et
-- valent NULL sur toutes les lignes déjà encaissées. Aucun montant n'est
-- retouché, aucun reçu n'est renuméroté, aucune année passée n'est réécrite.
-- Un reçu déjà imprimé reste exact : il ne portait pas le mode, il ne le
-- portera pas davantage.
--
-- POURQUOI `method` EST DU TEXTE LIBRE CONTRAINT ET NON UN ENUM POSTGRES. Un
-- type énuméré se modifie par migration ; or la liste des modes varie d'une
-- école à l'autre (telle école encaisse en Orange Money, telle autre pas) et
-- l'édition LAN tourne sur SQLite, qui n'a pas ce type. Un CHECK sur une liste
-- fermée aurait la même rigidité. La contrainte vit donc dans l'interface, et
-- la base accepte la valeur qu'on lui donne — comme pour `category` ailleurs.
--
-- RETOUR ARRIÈRE :
--   ALTER TABLE public.fee_payments DROP COLUMN IF EXISTS method;
--   ALTER TABLE public.fee_payments DROP COLUMN IF EXISTS payer_name;
--   ALTER TABLE public.fee_payments DROP COLUMN IF EXISTS reference;
-- Aucune donnée d'avant cette migration n'est perdue : elles sont toutes NULL.
--
-- ORDRE D'APPLICATION : LE CLOUD D'ABORD, le paquet LAN ensuite. `fee_payments`
-- est synchronisée ; une ligne portant une colonne que le Cloud ignore est
-- rejetée EN ENTIER par sync-push (PGRST204), pas seulement amputée de ce
-- champ. Un versement de cantine encaissé hors ligne serait alors perdu.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Les colonnes ────────────────────────────────────────────────────────
ALTER TABLE public.fee_payments
  ADD COLUMN IF NOT EXISTS method     TEXT,
  ADD COLUMN IF NOT EXISTS payer_name TEXT,
  ADD COLUMN IF NOT EXISTS reference  TEXT;

COMMENT ON COLUMN public.fee_payments.method IS
  'Mode d''encaissement : especes | mobile_money | virement | cheque | autre. '
  'NULL = versement antérieur à cette migration, mode inconnu — ce qui est la '
  'vérité, et non « espèces » par défaut : un défaut inventé fausserait tout '
  'arrêté de caisse qui distinguerait les modes.';

COMMENT ON COLUMN public.fee_payments.payer_name IS
  'Nom de la personne qui remet l''argent, quand elle n''est pas l''élève. Figé '
  'à l''encaissement et reporté sur le reçu.';

COMMENT ON COLUMN public.fee_payments.reference IS
  'Référence externe : numéro de transaction Mobile Money, numéro de chèque, '
  'avis de virement. C''est elle qui permet de rapprocher une ligne de caisse '
  'd''un relevé bancaire.';

-- ── 2. Index de lecture ────────────────────────────────────────────────────
-- L'arrêté de caisse totalise par mode sur une journée et une école. Sans cet
-- index il balaie toute la table des versements de l'établissement.
CREATE INDEX IF NOT EXISTS fee_payments_school_method_idx
  ON public.fee_payments (school_id, method);

-- ── 3. Garde-fou : la migration a-t-elle vraiment pris ? ───────────────────
-- Sans ce bloc, une migration partiellement appliquée passe inaperçue jusqu'au
-- premier encaissement refusé, c'est-à-dire devant un parent, au guichet.
DO $$
DECLARE
  manquantes TEXT;
BEGIN
  SELECT string_agg(c, ', ') INTO manquantes
  FROM unnest(ARRAY['method', 'payer_name', 'reference']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fee_payments'
      AND column_name = c
  );
  IF manquantes IS NOT NULL THEN
    RAISE EXCEPTION 'fee_payments : colonne(s) manquante(s) apres migration : %', manquantes;
  END IF;
END $$;

-- ── 4. Contrôle à recopier après exécution ─────────────────────────────────
-- Attendu : trois lignes, et `versements_avec_mode` = 0 avant le premier
-- encaissement fait depuis la nouvelle interface.
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'fee_payments'
       AND column_name IN ('method', 'payer_name', 'reference'))  AS colonnes_posees,
  (SELECT count(*) FROM public.fee_payments)                      AS versements_total,
  (SELECT count(*) FROM public.fee_payments WHERE method IS NOT NULL)
                                                                  AS versements_avec_mode;
