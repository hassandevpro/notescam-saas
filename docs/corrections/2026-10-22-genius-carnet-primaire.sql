-- ACTIVER LE CARNET DÉTAILLÉ DU PRIMAIRE POUR THE GENIUS
--
-- Demande du responsable : « seulement pour l'école Genius, le reste reste
-- comme ça — ou ajoute un bouton pour changer ». Le bouton existe
-- (Paramètres → Bulletin du primaire) et le réglage vit avec l'école, pas avec
-- son nom : `schools.prim_bulletin_mode` (migration
-- `supabase_prim_bulletin_mode.sql`, déjà appliquée en production).
--
-- CE QUI MANQUAIT. La colonne était en place, les cinq blocs étaient codés, le
-- bouton était à l'écran — mais THE GENIUS était restée à NULL, donc à la
-- disposition standard. Seule COLLÈGE LA RETRAITE (école de recette, montée par
-- `scripts/seed-college-la-retraite.mjs`) portait 'carnet' : la vérification
-- avait été faite là, et l'école qui l'avait demandé ne l'avait jamais eu.
--
-- CE QUE CELA CHANGE, et seulement pour cette école : son bulletin du primaire
-- (SIL, CP, CE1, CE2, CM1, CM2, Class 1 à 6 — moteur `apc_primaire`, résolu par
-- `bulletin_engine = 'officiel'`) porte en plus les six regroupements officiels
-- du carnet MINEDUB, la ligne « Travail académique », les stats de performance,
-- la répartition des élèves par tranche de moyenne, et la signature du parent.
--
-- CE QUE CELA NE CHANGE PAS : aucune note, aucune moyenne, aucune cote. Le
-- réglage ne décide que de ce qui s'IMPRIME. Les 43 autres écoles restent à
-- NULL, donc au bulletin d'aujourd'hui, sans rien avoir à faire.
--
-- CIBLAGE PAR IDENTIFIANT, pas par nom : deux écoles portent « Genius » dans
-- leur nom (« The Genius International School », en moteur classique, qui n'est
-- PAS concernée). Un UPDATE sur `name ILIKE '%genius%'` aurait touché les deux.

BEGIN;

-- Garde-fou : l'école visée existe, et c'est bien la bonne.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.schools
   WHERE id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
     AND name = 'THE GENIUS INTERNATIONAL SCHOOL & COLLEGE';
  IF n <> 1 THEN
    RAISE EXCEPTION 'École THE GENIUS introuvable sous cet identifiant (trouvé %) — rien n''a été modifié', n;
  END IF;
END $$;

UPDATE public.schools
   SET prim_bulletin_mode = 'carnet'
 WHERE id = '6b68407b-3d2e-426b-81ff-c4e68e66120a';

-- Contrôle : une seule école basculée, et laquelle.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT name, prim_bulletin_mode FROM public.schools
            WHERE prim_bulletin_mode = 'carnet' ORDER BY name LOOP
    RAISE NOTICE 'carnet actif : %', r.name;
  END LOOP;
END $$;

COMMIT;

-- ── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
-- État relevé avant écriture : `prim_bulletin_mode` était NULL pour cette
-- école. Pour revenir exactement là :
--
--   UPDATE public.schools SET prim_bulletin_mode = NULL
--    WHERE id = '6b68407b-3d2e-426b-81ff-c4e68e66120a';
--
-- Sans perte : la colonne ne porte qu'une préférence d'affichage.
