-- LE CARNET DÉTAILLÉ DU PRIMAIRE EST UN CHOIX D'ÉCOLE, PAS UN NOM EN DUR
--
-- ── POURQUOI CETTE COLONNE ─────────────────────────────────────────────────
--
-- THE GENIUS remet aux parents un carnet qui porte, en plus de notre bulletin
-- primaire : les six regroupements officiels (« 1) COMMUNIQUER EN FRANÇAIS ET
-- EN ANGLAIS… Total · Moyenne »), la ligne « Travail académique » (avertissement
-- / tableau d'honneur / encouragement), les statistiques de performance, la
-- répartition des élèves par tranche de moyenne, et la signature du parent.
--
-- Demande du responsable : « seulement pour l'école Genius, le reste reste
-- comme ça — ou ajoute un bouton pour changer ».
--
-- Un bouton, donc. Écrire « si l'école s'appelle GENIUS » dans le produit
-- serait un défaut : la prochaine école qui veut la même chose obligerait à
-- modifier le code, et un simple renommage d'établissement casserait son
-- bulletin. Le réglage vit avec l'école, comme `bulletin_subject_mode` et
-- `primary_period_mode` avant lui.
--
-- ── VALEURS ────────────────────────────────────────────────────────────────
--   NULL / 'standard' → le bulletin primaire d'aujourd'hui, INCHANGÉ. C'est le
--                       défaut : aucune des 44 écoles ne voit son bulletin
--                       bouger tant qu'elle n'a rien demandé.
--   'carnet'          → les cinq blocs ci-dessus s'ajoutent.
--
-- Additive et idempotente. Aucune ligne existante n'est modifiée : les écoles
-- restent toutes à NULL, donc au comportement actuel.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS prim_bulletin_mode text;

COMMENT ON COLUMN public.schools.prim_bulletin_mode IS
  'Bulletin du primaire : NULL ou ''standard'' = disposition actuelle ; ''carnet'' = carnet détaillé (6 regroupements, travail académique, stats de performance, répartition, signature du parent). Choix de l''école, jamais déduit de son nom.';

-- Pas de policy à ajouter : `schools` a déjà les siennes, et cette colonne suit
-- le même chemin de lecture et d'écriture que les autres réglages de bulletin.

-- ── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
--   ALTER TABLE public.schools DROP COLUMN IF EXISTS prim_bulletin_mode;
-- Les écoles retombent alors sur la disposition standard, sans perte de notes
-- ni de bulletins : la colonne ne porte qu'une préférence d'affichage.
