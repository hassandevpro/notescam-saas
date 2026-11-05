-- LE RANG SUR LE BULLETIN DU PRIMAIRE EST UN CHOIX D'ÉCOLE
--
-- ── POURQUOI CETTE COLONNE ─────────────────────────────────────────────────
--
-- Demande de BRIGHT CONTINENT BILINGUAL SCHOOL, le 2026-11-05 : pouvoir ne pas
-- faire apparaître le rang sur le bulletin du primaire.
--
-- Ce n'est pas une préférence de mise en page. L'approche par compétences du
-- MINEDUB décrit ce qu'un enfant SAIT FAIRE ; un rang, lui, le compare aux
-- autres et ne dit rien de ses acquis. Une école de cycle primaire peut tenir
-- qu'un parent de CM1 n'a pas à lire « 23e / 41 » à côté du travail de son
-- enfant. D'autres écoles y tiennent au contraire : le choix leur revient.
--
-- Écrire « si l'école s'appelle BRIGHT CONTINENT » serait un défaut, pour la
-- raison déjà posée dans supabase_prim_bulletin_mode.sql : la prochaine école
-- qui veut la même chose obligerait à modifier le code, et un simple
-- renommage d'établissement casserait son bulletin.
--
-- ── CE QUI DISPARAÎT, ET CE QUI RESTE ──────────────────────────────────────
--
-- Masqué : la case « Rang » du bandeau de synthèse, et elle seule. La cote
-- reprend la largeur libérée ; le bandeau garde ses huit colonnes, sur
-- lesquelles les lignes suivantes comptent leurs `colSpan`.
--
-- Ce qui reste, et qui répond à la même question sans classer personne : la
-- moyenne de la classe, le taux de réussite, et la répartition des élèves par
-- tranche de moyenne. Un parent y lit où se situe son enfant ; aucun nom, aucun
-- numéro d'ordre n'y paraît.
--
-- Le RANG lui-même continue d'être CALCULÉ et reste visible dans l'application
-- (écrans de classe, procès-verbaux, conseil de classe) : seule son impression
-- sur le bulletin de l'élève s'arrête. Rien n'est effacé.
--
-- ── VALEURS ────────────────────────────────────────────────────────────────
--   NULL / false → le bulletin d'aujourd'hui, INCHANGÉ. C'est le défaut :
--                  aucune école ne voit son bulletin bouger.
--   true         → la case « Rang » ne s'imprime plus.
--
-- Additive et idempotente. Aucune ligne existante n'est modifiée.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS prim_masquer_rang boolean;

COMMENT ON COLUMN public.schools.prim_masquer_rang IS
  'Bulletin du primaire : true = la case « Rang » ne s''imprime pas (la moyenne de classe, le taux de réussite et la répartition par tranche la remplacent). NULL/false = rang imprimé, comportement d''origine. Choix de l''école, jamais déduit de son nom.';

-- Pas de policy à ajouter : `schools` a déjà les siennes, et cette colonne suit
-- la ligne de son école.
--
-- RETOUR ARRIÈRE :
--   ALTER TABLE public.schools DROP COLUMN IF EXISTS prim_masquer_rang;
