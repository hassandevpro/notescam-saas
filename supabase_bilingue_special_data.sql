-- ============================================================================
-- DONNÉES RÉFÉRENTIEL BILINGUE SPÉCIAL (généré) — À COLLER dans Supabase SQL Editor.
-- Pré-requis : supabase_bilingue_special.sql exécuté. Idempotent.
-- Version : Arrete n 239-23/MINESEC du 14 juin 2023 - Programme d Education Bilingue Special (premier cycle)
-- 141 ligne(s) coefficient/charge · 35 matière(s).
--
-- Somme des coefficients par classe (contrôle de recopie) :
--   bil_fr/6e      Σcoef = 31
--   bil_fr/5e      Σcoef = 31
--   bil_fr/4e      Σcoef = 32
--   bil_fr/3e      Σcoef = 32
--   bil_en/form1   Σcoef = 32
--   bil_en/form2   Σcoef = 32
--   bil_en/form3   Σcoef = 35
--   bil_en/form4   Σcoef = 46
--   bil_en/form5   Σcoef = 46
-- ============================================================================

-- Séries (sous-systèmes)
INSERT INTO public.bil_series (id, nom, categorie, description, ordre) VALUES
  ('bil_fr', 'Programme d’Éducation Bilingue Spécial — francophone', 'bilingue_special', 'Arrêté 239-23 section I-2. Classes 6e à 3e.', 0),
  ('bil_en', 'Special Bilingual Education Programme — anglophone', 'bilingue_special', 'Arrêté 239-23 section II-2. Forms 1 to 5.', 1)
ON CONFLICT (id) DO UPDATE SET nom=EXCLUDED.nom, categorie=EXCLUDED.categorie, description=EXCLUDED.description, ordre=EXCLUDED.ordre;

-- Domaines d'apprentissage
INSERT INTO public.bil_groupes (id, nom, ordre) VALUES
  ('fr_d1', 'Langues et littératures', 1),
  ('fr_d2', 'Sciences humaines', 2),
  ('fr_d3', 'Sciences et technologies', 3),
  ('fr_d4', 'Arts et cultures nationales', 4),
  ('fr_d5', 'Développement personnel', 5),
  ('en_d1', 'Langues et littératures', 6),
  ('en_d2', 'Sciences humaines et sociales', 7),
  ('en_d3', 'Sciences et technologies', 8),
  ('en_d4', 'Développement personnel', 9),
  ('en_d0', 'Matières obligatoires', 10)
ON CONFLICT (id) DO UPDATE SET nom=EXCLUDED.nom, ordre=EXCLUDED.ordre;

-- Catalogue des matières
INSERT INTO public.bil_matieres (id, nom, code, domaine_apprentissage, ordre) VALUES
  ('intensive_english_language', 'Intensive English (Language)', NULL, 'Langues et littératures', 0),
  ('intensive_english_literature', 'Intensive English (Literature)', NULL, 'Langues et littératures', 1),
  ('francais', 'Français', NULL, 'Langues et littératures', 2),
  ('langue_vivante_2', 'Langue Vivante II (LVII)', NULL, 'Langues et littératures', 3),
  ('lettres_classiques', 'Lettres classiques (Latin/Grec)', NULL, 'Langues et littératures', 4),
  ('citizenship_education', 'Citizenship Education', NULL, 'Sciences humaines', 5),
  ('geographie', 'Géographie', NULL, 'Sciences humaines', 6),
  ('histoire', 'Histoire', NULL, 'Sciences humaines', 7),
  ('informatique', 'Informatique', NULL, 'Sciences et technologies', 8),
  ('mathematiques', 'Mathématiques', NULL, 'Sciences et technologies', 9),
  ('pct', 'Physique-Chimie-Technologie', NULL, 'Sciences et technologies', 10),
  ('sciences', 'Sciences', NULL, 'Sciences et technologies', 11),
  ('svteehb', 'SVTEEHB', NULL, 'Sciences et technologies', 12),
  ('education_artistique', 'Éducation artistique et culturelle', NULL, 'Arts et cultures nationales', 13),
  ('cultures_nationales', 'Cultures Nationales', NULL, 'Arts et cultures nationales', 14),
  ('langues_nationales', 'Langues Nationales', NULL, 'Arts et cultures nationales', 15),
  ('eps', 'Éducation Physique et Sportive', NULL, 'Développement personnel', 16),
  ('travail_manuel', 'Travail Manuel (TM)', NULL, 'Développement personnel', 17),
  ('francais_intensif_langue', 'Français intensif (Langue)', NULL, 'Langues et littératures', 18),
  ('francais_intensif_litterature', 'Français intensif (Littérature)', NULL, 'Langues et littératures', 19),
  ('english_language', 'English Language', NULL, 'Langues et littératures', 20),
  ('economics', 'Economics', NULL, 'Sciences humaines et sociales', 21),
  ('ecm', 'Éducation à la Citoyenneté et à la Morale', NULL, 'Sciences humaines et sociales', 22),
  ('geography', 'Geography', NULL, 'Sciences humaines et sociales', 23),
  ('history', 'History', NULL, 'Sciences humaines et sociales', 24),
  ('computer_sciences', 'Computer Sciences', NULL, 'Sciences et technologies', 25),
  ('biology', 'Biology', NULL, 'Sciences et technologies', 26),
  ('chemistry', 'Chemistry', NULL, 'Sciences et technologies', 27),
  ('food_nutrition', 'Food and Nutrition', NULL, 'Sciences et technologies', 28),
  ('home_economics', 'Home Economics', NULL, 'Sciences et technologies', 29),
  ('mathematics', 'Mathematics', NULL, 'Sciences et technologies', 30),
  ('physics', 'Physics', NULL, 'Sciences et technologies', 31),
  ('manual_labour', 'Manual Labour', NULL, 'Développement personnel', 32),
  ('logic', 'Logic', NULL, 'Sciences humaines et sociales', 33),
  ('geology', 'Geology', NULL, 'Sciences et technologies', 34)
ON CONFLICT (id) DO UPDATE SET nom=EXCLUDED.nom, code=EXCLUDED.code, domaine_apprentissage=EXCLUDED.domaine_apprentissage, ordre=EXCLUDED.ordre;

-- Nouvelle version (désactive les précédentes du SEUL référentiel bilingue)
UPDATE public.bil_referentiel_versions SET actif = false;
INSERT INTO public.bil_referentiel_versions (id, label, source, actif)
VALUES ('01fa3635-57af-45f9-8639-ccc50e8a176e', 'Arrete n 239-23/MINESEC du 14 juin 2023 - Programme d Education Bilingue Special (premier cycle)', 'Arrete n 239-23/MINESEC du 14 juin 2023, sections I-2 (francophone, p.2-3) et II-2 (anglophone, p.5-6). Visa Services du Premier Ministre n 002688 du 06 juin 2023.', true)
ON CONFLICT (id) DO NOTHING;

-- Coefficients + charges horaires par (série, classe, matière)
INSERT INTO public.bil_serie_matieres
  (serie_id, classe_id, matiere_id, groupe_id, coefficient, charge_horaire, obligatoire, actif, referentiel_version_id)
VALUES
  ('bil_fr', '6e', 'intensive_english_language', 'fr_d1', 3, 3, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'intensive_english_language', 'fr_d1', 3, 3, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'intensive_english_language', 'fr_d1', 3, 3, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'intensive_english_language', 'fr_d1', 3, 3, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'intensive_english_literature', 'fr_d1', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'intensive_english_literature', 'fr_d1', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'intensive_english_literature', 'fr_d1', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'intensive_english_literature', 'fr_d1', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'francais', 'fr_d1', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'francais', 'fr_d1', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'francais', 'fr_d1', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'francais', 'fr_d1', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'langue_vivante_2', 'fr_d1', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'langue_vivante_2', 'fr_d1', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'lettres_classiques', 'fr_d1', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'lettres_classiques', 'fr_d1', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'lettres_classiques', 'fr_d1', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'lettres_classiques', 'fr_d1', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'citizenship_education', 'fr_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'citizenship_education', 'fr_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'citizenship_education', 'fr_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'citizenship_education', 'fr_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'geographie', 'fr_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'geographie', 'fr_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'geographie', 'fr_d2', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'geographie', 'fr_d2', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'histoire', 'fr_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'histoire', 'fr_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'histoire', 'fr_d2', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'histoire', 'fr_d2', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'informatique', 'fr_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'informatique', 'fr_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'informatique', 'fr_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'informatique', 'fr_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'mathematiques', 'fr_d3', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'mathematiques', 'fr_d3', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'mathematiques', 'fr_d3', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'mathematiques', 'fr_d3', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'pct', 'fr_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'pct', 'fr_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'sciences', 'fr_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'sciences', 'fr_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'svteehb', 'fr_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'svteehb', 'fr_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'education_artistique', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'education_artistique', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'education_artistique', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'education_artistique', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'cultures_nationales', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'cultures_nationales', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'cultures_nationales', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'cultures_nationales', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'langues_nationales', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'langues_nationales', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'langues_nationales', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'langues_nationales', 'fr_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'eps', 'fr_d5', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'eps', 'fr_d5', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'eps', 'fr_d5', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'eps', 'fr_d5', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '6e', 'travail_manuel', 'fr_d5', 1, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '5e', 'travail_manuel', 'fr_d5', 1, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '4e', 'travail_manuel', 'fr_d5', 1, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_fr', '3e', 'travail_manuel', 'fr_d5', 1, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'francais_intensif_langue', 'en_d1', 3, 3, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'francais_intensif_langue', 'en_d1', 3, 3, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'francais_intensif_langue', 'en_d1', 3, 3, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'francais_intensif_litterature', 'en_d1', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'francais_intensif_litterature', 'en_d1', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'francais_intensif_litterature', 'en_d1', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'english_language', 'en_d1', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'english_language', 'en_d1', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'english_language', 'en_d1', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'economics', 'en_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'ecm', 'en_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'ecm', 'en_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'ecm', 'en_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'geography', 'en_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'geography', 'en_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'geography', 'en_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'history', 'en_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'history', 'en_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'history', 'en_d2', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'computer_sciences', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'computer_sciences', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'computer_sciences', 'en_d3', 3, 3, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'biology', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'biology', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'biology', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'chemistry', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'chemistry', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'chemistry', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'food_nutrition', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'home_economics', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'home_economics', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'mathematics', 'en_d3', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'mathematics', 'en_d3', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'mathematics', 'en_d3', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'physics', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'physics', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'physics', 'en_d3', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'eps', 'en_d4', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'eps', 'en_d4', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'eps', 'en_d4', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form1', 'manual_labour', 'en_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form2', 'manual_labour', 'en_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form3', 'manual_labour', 'en_d4', 1, 1, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'francais_intensif_langue', 'en_d0', 3, 3, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'francais_intensif_langue', 'en_d0', 3, 3, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'francais_intensif_litterature', 'en_d0', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'francais_intensif_litterature', 'en_d0', 2, 2, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'english_language', 'en_d0', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'english_language', 'en_d0', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'mathematics', 'en_d0', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'mathematics', 'en_d0', 4, 4, true, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'economics', 'en_d2', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'economics', 'en_d2', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'ecm', 'en_d2', 2, 2, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'ecm', 'en_d2', 2, 2, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'geography', 'en_d2', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'geography', 'en_d2', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'history', 'en_d2', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'history', 'en_d2', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'logic', 'en_d2', 2, 2, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'logic', 'en_d2', 2, 2, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'computer_sciences', 'en_d3', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'computer_sciences', 'en_d3', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'biology', 'en_d3', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'biology', 'en_d3', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'chemistry', 'en_d3', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'chemistry', 'en_d3', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'geology', 'en_d3', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'geology', 'en_d3', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'food_nutrition', 'en_d3', 2, 2, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'food_nutrition', 'en_d3', 2, 2, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'physics', 'en_d3', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'physics', 'en_d3', 3, 3, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'eps', 'en_d4', 2, 2, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'eps', 'en_d4', 2, 2, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form4', 'manual_labour', 'en_d4', 1, 1, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e'),
  ('bil_en', 'form5', 'manual_labour', 'en_d4', 1, 1, false, true, '01fa3635-57af-45f9-8639-ccc50e8a176e')
ON CONFLICT (serie_id, classe_id, matiere_id) DO UPDATE
  SET groupe_id=EXCLUDED.groupe_id, coefficient=EXCLUDED.coefficient, charge_horaire=EXCLUDED.charge_horaire,
      obligatoire=EXCLUDED.obligatoire, actif=true, referentiel_version_id=EXCLUDED.referentiel_version_id;

-- ============================================================================
-- FIN. Ensuite : UPDATE schools SET bulletin_engine='bilingue_special' WHERE id='...';
--          ou  : UPDATE classes SET bulletin_engine='bilingue_special' WHERE id='...';
-- ============================================================================
