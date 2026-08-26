-- supabase_genius_teacher_sector_verify.sql
-- LECTURE SEULE — aucune écriture, aucun DDL. À jouer AVANT puis APRÈS
-- supabase_genius_teacher_sector_assign.sql.
--
-- ── LA QUESTION À LAQUELLE CE FICHIER RÉPOND ────────────────────────────────
-- Affecter les 11 enseignants au secteur 'college' ne suffit pas à ce que la
-- Directrice du Primaire cesse de les voir. `user_scope_allows_teacher` sort par
-- le haut, AVANT même de regarder le secteur de la fiche, dans quatre cas :
--
--     l'école n'est pas en rôles stricts · le compte est GLOBAL ·
--     le compte est administrateur · le compte porte `staff.manage.all`
--
-- Un seul de ces quatre suffit à rendre l'affectation sans effet POUR CE COMPTE.
-- Le §B les met à plat, compte par compte, avant qu'on ne constate un échec en
-- production.
--
-- ── COMMENT CE FICHIER CALCULE ──────────────────────────────────────────────
-- Les fonctions du cloisonnement lisent `auth.uid()` : elles ne répondent que
-- pour le compte connecté, donc jamais pour la Directrice depuis l'éditeur SQL.
-- Le §B rejoue donc leur logique en clair, pour CHAQUE compte — mêmes colonnes,
-- mêmes règles de traduction que `user_scope_allows_class` et `class_sector`.
-- C'est une transcription, pas une seconde règle : si l'une change, ce fichier
-- ment. Il porte la date de sa transcription : 26/08/2026.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §A — LES FICHES : que déclare chaque enseignant aujourd'hui ?            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- AVANT : attendu 11 en « (non défini) ». APRÈS : attendu 11 en 'college'.
SELECT COALESCE(t.sector, '(non défini)') AS secteur, count(*) AS nb
  FROM public.teachers t
 WHERE t.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 GROUP BY 1 ORDER BY 2 DESC;

SELECT t.name AS enseignant, COALESCE(t.sector, '(non défini)') AS secteur, t.updated_at
  FROM public.teachers t
 WHERE t.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 ORDER BY t.sector NULLS FIRST, t.name;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §B — QUI VERRA ENCORE UN ENSEIGNANT DÉCLARÉ 'college' ?                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Lire la colonne `verdict`. Attendu après affectation :
--   • les comptes du Collège            → « voit (secteur college) »
--   • la Directrice du Primaire         → « ne voit pas »
--   • l'administrateur                  → « voit (administrateur) », c'est voulu :
--     sans lui, une fiche mal affectée ne serait plus corrigeable par personne.
-- Tout autre compte du Primaire en « voit (…) » est un défaut à traiter : la
-- colonne `raison` dit alors PAR OÙ il passe.
WITH ecole AS (
  SELECT '6b68407b-3d2e-426b-81ff-c4e68e66120a'::uuid AS id
),
strict AS (
  SELECT COALESCE(s.strict_role_enforcement, false) AS on_
    FROM public.schools s JOIN ecole e ON e.id = s.id
),
-- Secteurs réellement couverts par le périmètre de CHAQUE compte : transcription
-- de user_scope_allows_class() + class_sector(), sans auth.uid().
secteurs AS (
  SELECT su.id AS su_id,
         COALESCE(array_agg(DISTINCT sec.s) FILTER (WHERE sec.s IS NOT NULL), '{}'::text[]) AS secteurs
    FROM public.school_users su
    JOIN ecole e ON e.id = su.school_id
    LEFT JOIN public.classes cl
           ON cl.school_id = su.school_id
          AND ( su.scope_global
             OR (su.scope_class_ids IS NOT NULL AND cl.id = ANY (su.scope_class_ids))
             OR (su.scope_sections  IS NOT NULL AND cl.section IS NOT NULL AND cl.section = ANY (su.scope_sections))
             OR (su.scope_cycles    IS NOT NULL AND (
                    cl.cycle = ANY (su.scope_cycles)
                 OR (cl.cycle   IN ('maternelle','primaire')        AND 'fondamental' = ANY (su.scope_cycles))
                 OR (cl.section IN ('maternelle','primaire')        AND 'fondamental' = ANY (su.scope_cycles))
                 OR (cl.section IN ('premier_cycle','second_cycle') AND 'secondaire'  = ANY (su.scope_cycles))
                )) )
    LEFT JOIN LATERAL (SELECT public.class_sector(cl.id) AS s) sec ON cl.id IS NOT NULL
   WHERE su.active = true
   GROUP BY su.id
),
-- Permissions apportées par les rôles de gouvernance ACTIFS — transcription de
-- user_gov_perms(), pour un compte donné au lieu du compte connecté.
perms AS (
  SELECT ugr.user_id,
         bool_or(q.p = 'staff.manage.all') AS staff_manage_all
    FROM public.user_governance_roles ugr
    JOIN ecole e ON e.id = ugr.school_id
    JOIN public.governance_roles gr
      ON gr.school_id = ugr.school_id AND gr.code = ugr.role AND gr.active = true
   CROSS JOIN LATERAL (
         SELECT jsonb_array_elements_text(gr.permissions) AS p
          UNION ALL
         SELECT jsonb_array_elements_text(gr.workflows)
        ) q
   WHERE COALESCE(ugr.status, 'active') = 'active'
     AND (ugr.start_date IS NULL OR ugr.start_date <= CURRENT_DATE)
     AND (ugr.end_date   IS NULL OR ugr.end_date   >= CURRENT_DATE)
   GROUP BY ugr.user_id
)
SELECT su.full_name                                   AS compte,
       su.role,
       su.scope_global,
       su.scope_cycles,
       su.scope_sections,
       sec.secteurs                                   AS secteurs_couverts,
       COALESCE(p.staff_manage_all, false)             AS staff_manage_all,
       CASE
         WHEN NOT (SELECT on_ FROM strict)            THEN 'voit (rôles stricts DÉSACTIVÉS sur l''école)'
         WHEN su.scope_global                         THEN 'voit (périmètre GLOBAL)'
         WHEN su.role = 'admin'                       THEN 'voit (administrateur)'
         WHEN COALESCE(p.staff_manage_all, false)     THEN 'voit (staff.manage.all)'
         WHEN 'college' = ANY (sec.secteurs)          THEN 'voit (secteur college)'
         ELSE                                              'ne voit pas'
       END                                            AS verdict
  FROM public.school_users su
  JOIN ecole e ON e.id = su.school_id
  JOIN secteurs sec ON sec.su_id = su.id
  LEFT JOIN perms p ON p.user_id = su.user_id
 WHERE su.active = true
 ORDER BY (CASE WHEN su.scope_global THEN 0 WHEN su.role = 'admin' THEN 1 ELSE 2 END), su.full_name;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §C — LE PIÈGE INVERSE : y a-t-il seulement des classes 'college' ?       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- `user_sectors()` ne dérive PAS du rôle : elle dérive des CLASSES que le
-- périmètre du compte atteint. Si aucune classe de l'école ne rend 'college',
-- alors personne — hors administrateur et comptes globaux — ne verra les 11
-- fiches après affectation. Ce ne serait pas le cloisonnement demandé, mais une
-- disparition. Attendu : au moins une classe en 'college'.
SELECT COALESCE(public.class_sector(c.id), '(secteur illisible)') AS secteur_de_la_classe,
       count(*) AS nb_classes
  FROM public.classes c
 WHERE c.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
 GROUP BY 1 ORDER BY 2 DESC;
