-- ════════════════════════════════════════════════════════════════════════════
-- MATIÈRES RESTÉES À /100 ALORS QUE LEURS NOTES SONT SUR /20 (cas Janus, FORM1/FORM2)
-- ════════════════════════════════════════════════════════════════════════════
-- Symptôme : la saisie affiche « /100 » et l'Observation dit « Fail » pour un 17/20.
-- Cause : `subjects.max = 100` (matière créée avec le défaut anglophone). La moyenne divise
-- chaque note par `subjects.max` : 14 ÷ 100 ≠ 14 ÷ 20.
--
-- CE SCRIPT NE TOUCHE JAMAIS À UNE NOTE. Il ne change que `subjects.max`, de 100 à 20.
-- Il est IDEMPOTENT (une matière déjà à 20 n'est plus sélectionnée) et DRY-RUN PAR DÉFAUT :
-- seule la PARTIE A (lecture) s'exécute. La partie B est un bloc à décommenter, après lecture.
--
-- À RENSEIGNER : l'identifiant de l'école (ne JAMAIS viser par le nom) et le barème visé.
--   \set ecole 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'    -- psql
-- Dans l'éditeur SQL de Supabase, remplacer :ecole par l'uuid entre apostrophes.

-- ── PARTIE A — LECTURE SEULE ────────────────────────────────────────────────

-- A1. Les matières à /100, avec la classe et le barème que la classe déclare.
SELECT c.name AS classe, c.system, c.grade_max, s.id AS subject_id, s.name AS matiere, s.max,
       count(g.*) FILTER (WHERE g.value ~ '^[0-9.,]+$') AS notes,
       max(replace(g.value, ',', '.')::numeric) FILTER (WHERE g.value ~ '^[0-9]+([.,][0-9]+)?$') AS note_max_saisie
  FROM public.subjects s
  JOIN public.classes  c ON c.id = s.class_id
  LEFT JOIN public.grades g ON g.subject_id = s.id
 WHERE s.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' AND s.max = 100
 GROUP BY c.name, c.system, c.grade_max, s.id, s.name, s.max
 ORDER BY c.name, s.name;

-- A2. À NE PAS CONVERTIR : une note > 20 prouve que l'enseignant a vraiment saisi sur /100.
--     Ces lignes sont LISTÉES, jamais modifiées.
SELECT c.name AS classe, s.name AS matiere, st.name AS eleve, g.sequence, g.value
  FROM public.grades g
  JOIN public.subjects s  ON s.id = g.subject_id
  JOIN public.classes  c  ON c.id = s.class_id
  JOIN public.students st ON st.id = g.student_id
 WHERE s.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' AND s.max = 100
   AND g.value ~ '^[0-9]+([.,][0-9]+)?$'
   AND replace(g.value, ',', '.')::numeric > 20
 ORDER BY c.name, s.name, st.name;

-- ── PARTIE B — ÉCRITURE (décommenter après lecture de A1 et A2) ─────────────
-- RELEVÉ GENIUS du 2026-11-09 (lecture) : 4 matières seulement — FORM1 et FORM2, History et Citizenship
-- (116 notes, toutes ≤ 20, grade_max = 20). Cible = matières à /100 d'une classe dont `grade_max` vaut 20 (ou, à défaut de grade_max,
-- dont toutes les notes sont ≤ 20) ET dont AUCUNE note n'excède 20.
--
-- B0. Sauvegarde AVANT modification (conserve les valeurs d'origine pour le retour arrière).
-- CREATE TABLE IF NOT EXISTS public.subjects_max_avant_correction (
--   subject_id text PRIMARY KEY, school_id uuid, max_avant integer, sauvegarde_le timestamptz DEFAULT now());
-- INSERT INTO public.subjects_max_avant_correction (subject_id, school_id, max_avant)
-- SELECT s.id, s.school_id, s.max FROM public.subjects s JOIN public.classes c ON c.id = s.class_id
--  WHERE s.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' AND s.max = 100 AND (c.grade_max = 20 OR c.grade_max IS NULL)
--    AND EXISTS (SELECT 1 FROM public.grades g0 WHERE g0.subject_id = s.id)   -- seulement les matières NOTÉES dans `grades` (le primaire APC note dans prim_notes : son `max` sert de barème de repli, ne pas y toucher)
--    AND NOT EXISTS (SELECT 1 FROM public.grades g WHERE g.subject_id = s.id
--          AND g.value ~ '^[0-9]+([.,][0-9]+)?$' AND replace(g.value, ',', '.')::numeric > 20)
-- ON CONFLICT (subject_id) DO NOTHING;
--
-- B1. Le correctif.
-- UPDATE public.subjects s SET max = 20
--  WHERE s.id IN (SELECT subject_id FROM public.subjects_max_avant_correction WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a')
--    AND s.max = 100;
--
-- RETOUR ARRIÈRE :
-- UPDATE public.subjects s SET max = b.max_avant FROM public.subjects_max_avant_correction b WHERE b.subject_id = s.id;
--
-- Les notes déjà saisies (14, 17, 12…) restent INTACTES : l'Observation et les moyennes se
-- recalculent à l'affichage, jamais stockées. Côté poste : un appareil garde l'ancien barème
-- dans son cache jusqu'à sa prochaine synchronisation — se reconnecter, ou vider les données du
-- site si le « /100 » persiste.
