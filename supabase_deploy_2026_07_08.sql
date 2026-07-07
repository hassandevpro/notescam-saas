-- ============================================================================
-- MISE EN LIGNE 2026-07-08 — migrations regroupées (À COLLER dans Supabase → SQL
-- Editor, en UNE fois, AVANT de déployer le nouveau code).
--
-- 100 % ADDITIF : uniquement des ADD COLUMN IF NOT EXISTS et des INSERT de
-- STRUCTURE (ON CONFLICT DO UPDATE) sur des tables de référence. AUCUNE donnée
-- élève/école n'est supprimée ni modifiée. Rejouable sans risque.
-- ============================================================================

-- 1) En-tête de bulletin bilingue / mono-langue
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS bulletin_bilingual boolean;

-- 2) Appréciation libre du travail de l'élève (conseil de classe)
ALTER TABLE public.student_absences
  ADD COLUMN IF NOT EXISTS appreciation text;

-- 3) Structure APC anglophone (Forms 1–5 + matières anglaises).
--    Cibles de clés étrangères pour l'import du référentiel CBA anglophone.
INSERT INTO public.apc_classes (id, cycle_id, nom, niveau) VALUES
  ('form1', 'premier_cycle', 'Form 1', 1),
  ('form2', 'premier_cycle', 'Form 2', 2),
  ('form3', 'premier_cycle', 'Form 3', 3),
  ('form4', 'premier_cycle', 'Form 4', 4),
  ('form5', 'premier_cycle', 'Form 5', 5)
ON CONFLICT (id) DO UPDATE SET nom = EXCLUDED.nom, niveau = EXCLUDED.niveau, cycle_id = EXCLUDED.cycle_id;

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
-- FIN. Une fois exécuté sans erreur → déployer le code (merge sur main).
-- ============================================================================
