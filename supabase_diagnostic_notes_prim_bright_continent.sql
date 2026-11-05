-- ============================================================================
-- DIAGNOSTIC DES NOTES DU PRIMAIRE — BRIGHT CONTINENT BILINGUAL SCHOOL
-- ============================================================================
-- LECTURE SEULE. Aucun INSERT, UPDATE, DELETE, ALTER. Rejouable sans effet.
--
-- À lancer AVANT tout correctif et AVANT toute récupération, pour chiffrer sur
-- les données réelles ce que le code dit déjà (cf. rapport du 2026-11-05) :
--
--   A. LES NOTES EFFACÉES PAR UN CHANGEMENT DE BARÈME.
--      Signature : une ligne SANS note mais AVEC un barème. Seul
--      `setBareme` (écran de saisie primaire) écrit une telle ligne : il
--      réécrit TOUTE la colonne depuis l'état local de l'onglet, et met
--      `note = NULL` pour chaque élève que cet onglet ne connaît pas.
--      Une ligne « barème sans note » sur un élève qui a été noté ailleurs
--      est une note DÉTRUITE.
--
--   B. LES NOTES INVISIBLES À L'ÉCRAN, MAIS BIEN EN BASE.
--      Signature : une note dont `points_max` est NULL sur un critère que le
--      barème national ignore pour cette compétence. L'écran referme alors la
--      colonne (barème 0) et la note n'a plus où s'afficher. Rien n'est perdu.
--      NB : le bloc B ne filtre pas sur le NIVEAU de la classe — le barème
--      national est par niveau. Une ligne qui en sort est donc un critère que
--      le national ignore PARTOUT : le cas sûr. Les critères ignorés sur le
--      seul niveau de la classe s'y ajoutent, et se lisent à l'écran.
--
--   C. L'ÉTAT D'ENSEMBLE, par classe et par UA, pour mesurer l'ampleur.
--
-- Lancer chaque bloc SÉPARÉMENT (le SQL Editor n'exécute que la sélection s'il
-- y en a une : ne rien surligner, ou surligner un seul bloc).
--
-- ⚠️ SAUVEGARDE D'ABORD : lancer et télécharger
--    supabase_extract_notes_bright_continent.sql (export CSV daté de TOUTES les
--    notes) avant toute écriture corrective ou toute récupération.
-- ============================================================================


-- ── A. NOTES VIDÉES PAR UN CHANGEMENT DE BARÈME ────────────────────────────
-- Lignes « barème posé, note absente ». Le détail, élève par élève.
WITH ecole AS (SELECT id FROM public.schools WHERE name ILIKE '%bright continent%')
SELECT k.name                      AS classe,
       s.name                      AS eleve,
       s.matricule,
       'UA' || n.ua                 AS periode,
       upper(n.competence_id)       AS competence,
       c.nom                        AS critere,
       n.points_max                 AS bareme_pose,
       n.statut,
       n.date_saisie,
       n.updated_at
  FROM public.prim_notes    n
  JOIN ecole                e ON e.id = n.school_id
  JOIN public.students      s ON s.id = n.eleve_id
  JOIN public.classes       k ON k.id = s.class_id
  JOIN public.prim_criteres c ON c.id = n.critere_id
 WHERE n.note IS NULL
   AND n.points_max IS NOT NULL
   AND COALESCE(n.statut, '') <> 'absent'     -- une absence déclarée est normale
 ORDER BY k.name, s.name, n.ua, n.competence_id, c.ordre;


-- ── A bis. LE MÊME, COMPTÉ ─────────────────────────────────────────────────
WITH ecole AS (SELECT id FROM public.schools WHERE name ILIKE '%bright continent%')
SELECT k.name AS classe,
       'UA' || n.ua AS periode,
       upper(n.competence_id) AS competence,
       c.nom AS critere,
       count(*) FILTER (WHERE n.note IS NOT NULL)                       AS notes_presentes,
       count(*) FILTER (WHERE n.note IS NULL
                          AND n.points_max IS NOT NULL
                          AND COALESCE(n.statut,'') <> 'absent')        AS lignes_videes,
       count(*) FILTER (WHERE COALESCE(n.statut,'') = 'absent')         AS absences
  FROM public.prim_notes    n
  JOIN ecole                e ON e.id = n.school_id
  JOIN public.students      s ON s.id = n.eleve_id
  JOIN public.classes       k ON k.id = s.class_id
  JOIN public.prim_criteres c ON c.id = n.critere_id
 GROUP BY k.name, n.ua, n.competence_id, c.nom, c.ordre
HAVING count(*) FILTER (WHERE n.note IS NULL
                          AND n.points_max IS NOT NULL
                          AND COALESCE(n.statut,'') <> 'absent') > 0
 ORDER BY lignes_videes DESC, classe, periode;


-- ── B. NOTES EN BASE MAIS SANS COLONNE POUR LES MONTRER ────────────────────
-- Une note dont le barème est NULL sur un critère que le barème national
-- n'attribue PAS à cette compétence : l'écran referme la colonne, la note
-- devient invisible (elle n'est pas perdue).
WITH ecole AS (SELECT id FROM public.schools WHERE name ILIKE '%bright continent%')
SELECT k.name                 AS classe,
       s.name                 AS eleve,
       s.matricule,
       'UA' || n.ua            AS periode,
       upper(n.competence_id)  AS competence,
       c.nom                   AS critere,
       n.note,
       n.date_saisie
  FROM public.prim_notes    n
  JOIN ecole                e ON e.id = n.school_id
  JOIN public.students      s ON s.id = n.eleve_id
  JOIN public.classes       k ON k.id = s.class_id
  JOIN public.prim_criteres c ON c.id = n.critere_id
 WHERE n.note IS NOT NULL
   AND n.points_max IS NULL
   AND NOT EXISTS (
         SELECT 1 FROM public.prim_bareme_criteres b
          WHERE b.competence_id = n.competence_id
            AND b.critere_id    = n.critere_id
            AND COALESCE(b.points_max, 0) > 0)   -- NB : toutes niveaux confondus (voir en-tete)
 ORDER BY k.name, n.ua, n.competence_id, c.ordre, s.name;


-- ── C. L'ÉTAT D'ENSEMBLE ───────────────────────────────────────────────────
WITH ecole AS (SELECT id FROM public.schools WHERE name ILIKE '%bright continent%')
SELECT k.name AS classe,
       'UA' || n.ua AS periode,
       count(*)                                                   AS lignes,
       count(n.note)                                              AS avec_note,
       count(*) - count(n.note)                                   AS sans_note,
       count(*) FILTER (WHERE n.points_max IS NULL)               AS sans_bareme,
       min(n.date_saisie)                                         AS premiere_saisie,
       max(COALESCE(n.updated_at, n.date_saisie))                 AS derniere_ecriture
  FROM public.prim_notes n
  JOIN ecole             e ON e.id = n.school_id
  JOIN public.students   s ON s.id = n.eleve_id
  JOIN public.classes    k ON k.id = s.class_id
 GROUP BY k.name, n.ua
 ORDER BY k.name, periode;


-- ── D. LES MASQUES DE CRITÈRES EN VIGUEUR ──────────────────────────────────
-- Pour vérifier le second défaut : un critère masqué l'est pour l'école
-- ENTIÈRE — `public.prim_criteres_masques` est la seule table de masquage qui
-- existe en production (vérifié le 2026-11-05 : « relation
-- public.prim_criteres_classe_masques does not exist »). La requête ci-dessous
-- n'interroge donc que celle-là. Après application de
-- supabase_prim_criteres_classe_masques.sql, décommenter le second bloc.
WITH ecole AS (SELECT id FROM public.schools WHERE name ILIKE '%bright continent%')
SELECT 'ecole entiere' AS portee, m.critere_id, c.nom, m.masque_le
  FROM public.prim_criteres_masques m
  JOIN ecole e ON e.id = m.school_id
  JOIN public.prim_criteres c ON c.id = m.critere_id
 ORDER BY m.critere_id;

-- Quand public.prim_criteres_classe_masques existera (portee : classe + competence) :
-- WITH ecole AS (SELECT id FROM public.schools WHERE name ILIKE '%bright continent%')
-- SELECT 'une classe, une competence' AS portee, k.name AS classe,
--        upper(m.competence_id) AS competence, m.critere_id, c.nom, m.masque_le
--   FROM public.prim_criteres_classe_masques m
--   JOIN ecole e ON e.id = m.school_id
--   JOIN public.classes k ON k.id = m.class_id
--   JOIN public.prim_criteres c ON c.id = m.critere_id
--  ORDER BY classe, competence, m.critere_id;
