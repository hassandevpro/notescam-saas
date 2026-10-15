-- EXTRACTION DE TOUTES LES NOTES — BRIGHT CONTINENT BILINGUAL SCHOOL
-- ============================================================================
-- LECTURE SEULE. Aucun INSERT, UPDATE, DELETE, ALTER. Rejouable sans effet.
--
-- Couvre les QUATRE tables de notes du produit, pour ne rien laisser derrière :
--   prim_notes       primaire APC   (compétence × critère × UA)
--   apc_notes        secondaire APC (compétence × séquence)
--   mat_observations maternelle     (domaine × trimestre, cote A/ECA/NA)
--   grades           classique      (matière × séquence, note /max)
--
-- UNE SEULE instruction : la coller dans un onglet de requête VIDE et lancer
-- SANS RIEN SURLIGNER (le SQL Editor n'exécute que la sélection s'il y en a une).
-- Puis « Download CSV » pour récupérer le tout.
--
-- ── SI POSTGRES REFUSE « column points_max does not exist » ─────────────────
-- C'est que supabase_prim_note_points_max.sql n'est pas encore appliqué.
-- Remplacer alors `n.points_max` par `NULL::numeric` dans le bloc 1 (une ligne).
--
-- ── LECTURE DU RÉSULTAT ─────────────────────────────────────────────────────
-- `bareme` à NULL sur une ligne de primaire = barème OFFICIEL du référentiel
-- pour ce critère (cf. supabase_prim_bareme_bright_continent.sql). Ce n'est pas
-- une donnée manquante : c'est le cas normal.
-- ============================================================================

WITH ecole AS (
  SELECT id FROM public.schools WHERE name ILIKE '%bright continent%'
)

-- ── 1) PRIMAIRE APC ────────────────────────────────────────────────────────
SELECT 'primaire'                   AS domaine,
       k.name                       AS classe,
       s.name                       AS eleve,
       s.matricule,
       'UA' || n.ua                  AS periode,
       upper(n.competence_id)        AS item,
       c.nom                         AS critere,
       n.note,
       n.points_max                  AS bareme,
       NULL::text                    AS cote,
       NULL::text                    AS commentaire,
       n.date_saisie::text           AS saisie
  FROM public.prim_notes     n
  JOIN ecole                 e ON e.id = n.school_id
  JOIN public.students       s ON s.id = n.eleve_id
  JOIN public.classes        k ON k.id = s.class_id
  JOIN public.prim_criteres  c ON c.id = n.critere_id

UNION ALL

-- ── 2) SECONDAIRE APC ──────────────────────────────────────────────────────
SELECT 'secondaire APC',
       k.name, s.name, s.matricule,
       n.sequence_id,
       cp.intitule,
       NULL,
       n.note,
       n.note_max,
       NULL,
       n.appreciation,
       n.date_saisie::text
  FROM public.apc_notes        n
  JOIN ecole                   e  ON e.id = n.school_id
  JOIN public.students         s  ON s.id = n.eleve_id
  JOIN public.classes          k  ON k.id = s.class_id
  LEFT JOIN public.apc_competences cp ON cp.id = n.competence_id

UNION ALL

-- ── 3) MATERNELLE ──────────────────────────────────────────────────────────
SELECT 'maternelle',
       k.name, s.name, s.matricule,
       o.trimestre_id,
       d.intitule,
       NULL,
       NULL::numeric,
       NULL::numeric,
       o.niveau_acquis,
       o.observation,
       o.date_saisie::text
  FROM public.mat_observations o
  JOIN ecole                   e ON e.id = o.school_id
  JOIN public.students         s ON s.id = o.eleve_id
  JOIN public.classes          k ON k.id = s.class_id
  LEFT JOIN public.mat_domaines d ON d.id = o.domaine_id

UNION ALL

-- ── 4) CLASSIQUE ───────────────────────────────────────────────────────────
-- `grades.value` est du TEXTE : il peut porter 'ABS'. On ne convertit en nombre
-- que ce qui en est un, et on garde la valeur brute dans `commentaire`.
SELECT 'classique',
       k.name, s.name, s.matricule,
       'Seq' || g.sequence,
       m.name,
       NULL,
       CASE WHEN btrim(g.value) ~ '^[0-9]+([.,][0-9]+)?$'
            THEN replace(btrim(g.value), ',', '.')::numeric END,
       m.max::numeric,
       NULL,
       CASE WHEN btrim(coalesce(g.value, '')) !~ '^[0-9]+([.,][0-9]+)?$'
            THEN g.value END,
       g.updated_at::text
  FROM public.grades    g
  JOIN ecole            e ON e.id = g.school_id
  JOIN public.students  s ON s.id = g.student_id
  JOIN public.classes   k ON k.id = g.class_id
  JOIN public.subjects  m ON m.id = g.subject_id

 ORDER BY 1, 2, 3, 5, 6, 7;


-- ============================================================================
-- VOLUMÉTRIE — à lancer SÉPARÉMENT (le SQL Editor n'affiche que le dernier
-- résultat). Donne en un coup d'œil ce que l'école a réellement saisi, et dans
-- quels domaines, AVANT de télécharger le détail.
-- ============================================================================
-- WITH ecole AS (SELECT id FROM public.schools WHERE name ILIKE '%bright continent%')
-- SELECT 'primaire' AS domaine, 'UA' || n.ua AS periode, count(*) AS notes,
--        count(DISTINCT n.eleve_id) AS eleves
--   FROM public.prim_notes n JOIN ecole e ON e.id = n.school_id
--  GROUP BY 1, 2
-- UNION ALL
-- SELECT 'secondaire APC', n.sequence_id, count(*), count(DISTINCT n.eleve_id)
--   FROM public.apc_notes n JOIN ecole e ON e.id = n.school_id
--  GROUP BY 1, 2
-- UNION ALL
-- SELECT 'maternelle', o.trimestre_id, count(*), count(DISTINCT o.eleve_id)
--   FROM public.mat_observations o JOIN ecole e ON e.id = o.school_id
--  GROUP BY 1, 2
-- UNION ALL
-- SELECT 'classique', 'Seq' || g.sequence, count(*), count(DISTINCT g.student_id)
--   FROM public.grades g JOIN ecole e ON e.id = g.school_id
--  GROUP BY 1, 2
--  ORDER BY 1, 2;
