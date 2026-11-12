-- ════════════════════════════════════════════════════════════════════════════
-- SAISIE RAPIDE ADMINISTRATEUR (primaire) — réglage par école
-- ════════════════════════════════════════════════════════════════════════════
--
-- Sur la page « Saisie des notes » du primaire, l'administrateur voit plusieurs matières côte à côte
-- (une colonne par matière) pour les classes dont les matières n'ont qu'UNE note. Les enseignants gardent
-- leur écran habituel.
--
-- DÉFAUT : activé pour les écoles existantes ET nouvelles, SAUF deux écoles qui gardent leur écran actuel :
-- THE GENIUS et BRIGHT CONTINENT BILINGUAL SCHOOL. Aucun nom d'école n'est écrit dans le code de l'application :
-- l'exception vit ici, dans les données, et se change d'un UPDATE.
--
-- ⚠ ORDRE D'APPLICATION — À LIRE AVANT DE DISTRIBUER UN PAQUET LAN
-- `schools` est synchronisée : une ligne portant une colonne inconnue du Cloud est rejetée EN ENTIER.
--   1. exécuter CE FICHIER sur le Cloud ;
--   2. exécuter le SELECT de contrôle en fin de fichier : Genius et Bright doivent sortir à FALSE ;
--   3. seulement ensuite, distribuer un paquet LAN.
-- Tant que ce fichier n'est pas appliqué, l'application traite la colonne absente comme « désactivé » :
-- AUCUNE école ne voit la nouvelle grille. Rien à craindre d'un déploiement qui le précède.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS saisie_rapide_admin boolean NOT NULL DEFAULT true;

-- Les deux écoles qui gardent leur écran actuel. Genius par identifiant, Bright Continent par nom
-- (vérifier le SELECT ci-dessous AVANT d'exécuter l'UPDATE, pour ne retenir que la bonne ligne).
UPDATE public.schools SET saisie_rapide_admin = false
 WHERE id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
    OR name ILIKE '%bright continent%';

-- Contrôle : exactement ces deux écoles à false, toutes les autres à true.
SELECT id, name, saisie_rapide_admin
  FROM public.schools
 WHERE saisie_rapide_admin = false
    OR name ILIKE '%genius%' OR name ILIKE '%bright%'
 ORDER BY name;

-- Retour arrière pour une école : UPDATE public.schools SET saisie_rapide_admin = false WHERE id = '…';
-- Aucune note n'est modifiée par ce réglage.
