-- ============================================================================
-- STRUCTURE APC ANGLOPHONE (CBA) — premier cycle sous-système anglais du Cameroun
--
-- Le sous-système anglophone (Forms 1–5) suit la Competency-Based Approach (CBA),
-- pendant de l'APC francophone. Ses compétences sont DISTINCTES (rédigées en
-- anglais) : on les range sous des clés de classe propres — `form1`…`form5` — pour
-- qu'elles COEXISTENT avec le référentiel francophone (`6e`…`3e`) sans collision.
--
-- Ce fichier ne fait que SEEDER LA STRUCTURE (classes + matières anglophones) —
-- les cibles de clés étrangères exigées par `apc_competences` /
-- `apc_classe_matieres`. Le CONTENU (intitulés de compétences + coefficients) est
-- ensuite importé par l'établissement via son pivot JSON anglophone :
--   node scripts/apc-referentiel-to-sql.mjs <pivot_en.json>  → coller le SQL généré.
--
-- Pré-requis : avoir exécuté supabase_apc_minesec.sql (tables + structure FR).
-- Idempotent : rejouable. À COLLER dans Supabase → SQL Editor.
-- ============================================================================

-- 1) Classes anglophones du premier cycle (Forms 1–5).
INSERT INTO public.apc_classes (id, cycle_id, nom, niveau) VALUES
  ('form1', 'premier_cycle', 'Form 1', 1),
  ('form2', 'premier_cycle', 'Form 2', 2),
  ('form3', 'premier_cycle', 'Form 3', 3),
  ('form4', 'premier_cycle', 'Form 4', 4),
  ('form5', 'premier_cycle', 'Form 5', 5)
ON CONFLICT (id) DO UPDATE SET nom = EXCLUDED.nom, niveau = EXCLUDED.niveau, cycle_id = EXCLUDED.cycle_id;

-- 2) Matières anglophones (slugs DISTINCTS des matières francophones : 'english'
--    vs 'anglais'…). Coefficients indicatifs, ajustables via l'import de l'école.
--    `optionnelle = true` ⇒ activée selon l'établissement (langues, matières de
--    spécialité). Réutilise le même barème/logique que le seed francophone.
INSERT INTO public.apc_matieres (id, nom, coefficient, optionnelle, ordre) VALUES
  ('english',            'English Language',        4, false, 1010),
  ('french',             'French',                  3, false, 1020),
  ('mathematics',        'Mathematics',             4, false, 1030),
  ('biology',            'Biology',                 2, false, 1040),
  ('chemistry',          'Chemistry',               2, false, 1050),
  ('physics',            'Physics',                 2, false, 1060),
  ('computer_science',   'Computer Science',        2, false, 1070),
  ('history',            'History',                 1, false, 1080),
  ('geography',          'Geography',               1, false, 1090),
  ('citizenship',        'Citizenship Education',   1, false, 1100),
  ('physical_education', 'Physical Education',       2, false, 1110),
  ('literature',         'Literature in English',   2, true,  1120),
  ('economics',          'Economics',               2, true,  1130),
  ('commerce',           'Commerce',                2, true,  1140),
  ('food_science',       'Food Science & Nutrition', 1, true, 1150),
  ('manual_labour',      'Manual Labour',           1, false, 1160),
  ('religious_studies',  'Religious Studies',       1, true,  1170),
  ('national_languages', 'National Languages & Cultures', 1, true, 1180),
  ('german',             'German',                  2, true,  1190),
  ('spanish',            'Spanish',                 2, true,  1200),
  ('latin',              'Latin (EN)',              2, true,  1210)
ON CONFLICT (id) DO UPDATE
  SET nom = EXCLUDED.nom, coefficient = EXCLUDED.coefficient,
      optionnelle = EXCLUDED.optionnelle, ordre = EXCLUDED.ordre;

-- ============================================================================
-- FIN de la structure anglophone. Étapes suivantes pour l'établissement :
--   1. Remplir un pivot JSON anglophone (classe = form1…form5, matiere = english,
--      mathematics… ; voir examples/apc/anglophone_example.json).
--   2. node scripts/apc-referentiel-to-sql.mjs pivot_en.json → coller le SQL.
--   3. Régler les classes anglophones sur le moteur officiel + Système = EN.
-- ============================================================================
