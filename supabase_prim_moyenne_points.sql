-- ════════════════════════════════════════════════════════════════════════════
-- MOYENNE DU PRIMAIRE « EN POINTS » — réglage par école
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. À THE GENIUS, les matières du primaire n'ont pas le même barème (40, 20,
-- 30…). L'école calcule : S = somme des barèmes évalués ; T = somme des notes ; moyenne /20
-- = T × 20 ÷ S. La règle historique de NotesCam (moyenne des pourcentages par compétence,
-- pondérée par coefficient) donne un autre chiffre : sur un bulletin BCBS, 190/280 s'affichait
-- 13,2 là où l'école attend 13,57.
--
-- ── RIEN NE CHANGE POUR LES ÉCOLES EXISTANTES ──────────────────────────────
-- La colonne naît à FALSE pour toutes les écoles : c'est la règle historique, au centième près.
-- Elle ne s'allume que pour une école nommée, à la main, après validation sur un vrai bulletin.
--
-- ⚠ ORDRE D'APPLICATION — À LIRE AVANT DE DISTRIBUER UN PAQUET LAN
-- `schools` est synchronisée et `sync-push` filtre les TABLES, pas les colonnes : une ligne
-- portant une colonne inconnue du Cloud est rejetée EN ENTIER. Donc, dans cet ordre :
--   1. exécuter CE FICHIER sur le Cloud ;
--   2. vérifier le SELECT de contrôle en fin de fichier ;
--   3. seulement ensuite, distribuer le paquet LAN.
--
-- ── ACTIVER POUR GENIUS (après feu vert, JAMAIS dans ce fichier) ──────────
--   UPDATE public.schools SET prim_moyenne_points = true
--    WHERE id = '6b68407b-3d2e-426b-81ff-c4e68e66120a';
-- Retour arrière : la même requête avec false. Aucune note n'est modifiée ; aucun bulletin
-- n'est stocké (prim_bulletins et prim_resultats_annuels sont vides, les moyennes sont
-- calculées à l'affichage), donc rien à recalculer.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS prim_moyenne_points boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schools.prim_moyenne_points IS
  'FALSE (defaut) = moyenne du primaire historique (moyenne des pourcentages par competence, '
  'ponderee par coefficient). TRUE = somme des notes x 20 / somme des baremes evalues, sur '
  'toute la periode. Les matieres non evaluees ou masquees sortent des deux sommes.';

-- ── Vérification (doit renvoyer 1 ligne, et 0 école allumée) ─────────────────
SELECT count(*) AS ecoles_allumees,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'schools'
           AND column_name = 'prim_moyenne_points') AS colonne_presente
  FROM public.schools WHERE prim_moyenne_points;
