-- RETOUR ARRIÈRE — MATIÈRES DE CLASSE EN DOUBLE
-- Défait, ligne pour ligne, 2026-10-22-matieres-doublons.sql (généré le 2026-10-22).
--
-- Remet les 34 copies supprimées avec TOUTES leurs colonnes, réinsère les
-- notes retirées, défait les reprises posées sur les lignes gardées, et retire
-- les tombstones — sans quoi la synchronisation supprimerait à nouveau les
-- lignes à peine rétablies.
--
-- À n'exécuter que si l'on renonce à la correction.

BEGIN;

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 · « Artistic activities » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('4225bffe-a158-4fad-a849-261d0274e02d', 'a8b8fb00-7184-4aec-a39a-3d93a723000a', '752613e1-c1b3-4fd7-9046-8a3683eb5f11', 'Artistic activities', NULL, '1', '20', '2024-2025', NULL, 20, NULL, NULL, 6, '2026-10-08 11:03:26.921523+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'activites_artistiques', NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '4225bffe-a158-4fad-a849-261d0274e02d';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 · « Discovery of the world » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('7a30eacd-638c-4af7-a470-802425023956', 'a8b8fb00-7184-4aec-a39a-3d93a723000a', '752613e1-c1b3-4fd7-9046-8a3683eb5f11', 'Discovery of the world', NULL, '1', '20', '2024-2025', NULL, 20, NULL, NULL, 4, '2026-10-08 11:03:26.920057+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'decouverte_monde', NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '7a30eacd-638c-4af7-a470-802425023956';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 · « Language and communication » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('e7152213-fa56-48ad-b222-6d04c0661992', 'a8b8fb00-7184-4aec-a39a-3d93a723000a', '752613e1-c1b3-4fd7-9046-8a3683eb5f11', 'Language and communication', NULL, '1', '20', '2024-2025', NULL, 20, NULL, NULL, 0, '2026-10-08 11:03:26.882515+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'langage_communication', NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = 'e7152213-fa56-48ad-b222-6d04c0661992';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 · « Personal autonomy » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('3e48e85a-9ccd-46e2-8a22-a7d7db99c2a4', 'a8b8fb00-7184-4aec-a39a-3d93a723000a', '752613e1-c1b3-4fd7-9046-8a3683eb5f11', 'Personal autonomy', NULL, '1', '20', '2024-2025', NULL, 20, NULL, NULL, 7, '2026-10-08 11:03:39.875776+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'autonomie_personnelle', NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '3e48e85a-9ccd-46e2-8a22-a7d7db99c2a4';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 · « Pre-numeracy and logical reasoning » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('ebf1ad7f-5a52-4629-a666-ef4f9645be76', 'a8b8fb00-7184-4aec-a39a-3d93a723000a', '752613e1-c1b3-4fd7-9046-8a3683eb5f11', 'Pre-numeracy and logical reasoning', NULL, '1', '20', '2024-2025', NULL, 20, NULL, NULL, 2, '2026-10-08 11:03:36.571267+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'prenumeration_logique', NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = 'ebf1ad7f-5a52-4629-a666-ef4f9645be76';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 · « Pre-reading and pre-writing » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('1c46a286-3c95-460f-8d4b-261c5866cfcc', 'a8b8fb00-7184-4aec-a39a-3d93a723000a', '752613e1-c1b3-4fd7-9046-8a3683eb5f11', 'Pre-reading and pre-writing', NULL, '1', '20', '2024-2025', NULL, 20, NULL, NULL, 1, '2026-10-08 11:03:35.499618+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'prelecture_preecriture', NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '1c46a286-3c95-460f-8d4b-261c5866cfcc';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 · « Psychomotor skills » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('2a52c3a4-6057-493e-82b5-373eac49f94e', 'a8b8fb00-7184-4aec-a39a-3d93a723000a', '752613e1-c1b3-4fd7-9046-8a3683eb5f11', 'Psychomotor skills', NULL, '1', '20', '2024-2025', NULL, 20, NULL, NULL, 3, '2026-10-08 11:03:26.88027+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'psychomotricite', NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '2a52c3a4-6057-493e-82b5-373eac49f94e';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 · « Social and emotional life » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('75b8800e-63c0-4ba8-a759-66b084b5b0a7', 'a8b8fb00-7184-4aec-a39a-3d93a723000a', '752613e1-c1b3-4fd7-9046-8a3683eb5f11', 'Social and emotional life', NULL, '1', '20', '2024-2025', NULL, 20, NULL, NULL, 5, '2026-10-08 11:03:37.565388+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'vie_sociale_affective', NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '75b8800e-63c0-4ba8-a759-66b084b5b0a7';

-- ── Collège La retraite · 3e · « EPS » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('17af19e6-9a70-4527-a612-7fbe4ba6e82f', 'b76a76f5-fc27-4469-9c8e-4a8acb65a0e4', 'f16451a2-c555-4735-ae0e-dac4a3d24d6e', 'EPS', NULL, '2', '20', '2024-2025', NULL, 20, NULL, NULL, NULL, '2026-08-04 12:14:27.378797+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '17af19e6-9a70-4527-a612-7fbe4ba6e82f';

-- ── goudja · 5ème B · « Anglais » ──
UPDATE public.subjects SET position = NULL
  WHERE id = 'edd0bad6-14c1-4611-94d1-6e6a82d60adf';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('47046574-3800-413f-a65d-27b4db9bc2d0', '92331504-e428-43dc-a69c-4ed921b1208f', '468aab6d-1391-4540-b8f3-afe9343d4162', 'Anglais', NULL, '4', '20', '2024-2025', NULL, 20, NULL, NULL, 1, '2026-08-02 17:42:56.81762+00', 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '47046574-3800-413f-a65d-27b4db9bc2d0';

-- ── goudja · 5ème B · « Français » ──
UPDATE public.subjects SET position = NULL
  WHERE id = '31fdbc8e-fe85-468e-bcb6-3afb34377c5a';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('455b1c6b-b165-49c5-8180-c4b17c741474', '92331504-e428-43dc-a69c-4ed921b1208f', '468aab6d-1391-4540-b8f3-afe9343d4162', 'Français', NULL, '4', '20', '2024-2025', NULL, 20, NULL, NULL, 0, '2026-08-02 17:40:16.545486+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '455b1c6b-b165-49c5-8180-c4b17c741474';

-- ── goudja · 5ème B · « Histoire-Géographie » ──
UPDATE public.subjects SET position = NULL
  WHERE id = '58cea964-4103-4774-90ee-85636d17928d';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('9ebf98bf-e9e8-4cce-a135-57f97c53d0e0', '92331504-e428-43dc-a69c-4ed921b1208f', '468aab6d-1391-4540-b8f3-afe9343d4162', 'Histoire-Géographie', NULL, '2', '20', '2024-2025', NULL, 20, NULL, NULL, 5, '2026-08-02 17:42:57.600722+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '9ebf98bf-e9e8-4cce-a135-57f97c53d0e0';

-- ── goudja · 5ème B · « Informatique » ──
UPDATE public.subjects SET position = NULL
  WHERE id = '9cc55d5b-459c-42b1-a8b7-7ef720581bfc';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('d7e28c11-edc5-42e5-a760-eb882a794e04', '92331504-e428-43dc-a69c-4ed921b1208f', '468aab6d-1391-4540-b8f3-afe9343d4162', 'Informatique', NULL, '2', '20', '2024-2025', NULL, 20, NULL, NULL, 7, '2026-08-02 17:40:14.696059+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = 'd7e28c11-edc5-42e5-a760-eb882a794e04';

-- ── goudja · 5ème B · « Mathématiques » ──
UPDATE public.subjects SET position = NULL
  WHERE id = 'acce9951-594a-42f9-ba1c-3fc3539d60fa';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('232831fb-ffbd-4985-b60d-ef20b583adc3', '92331504-e428-43dc-a69c-4ed921b1208f', '468aab6d-1391-4540-b8f3-afe9343d4162', 'Mathématiques', NULL, '4', '20', '2024-2025', NULL, 20, NULL, NULL, 2, '2026-08-02 17:40:15.088804+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '232831fb-ffbd-4985-b60d-ef20b583adc3';

-- ── goudja · 6ème A · « Anglais » ──
UPDATE public.subjects SET position = NULL
  WHERE id = 'c60d43ac-4a36-4fc8-b609-de59ef4abfdd';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('57fb3408-fa53-46f5-8933-c66bc6d1464a', '92331504-e428-43dc-a69c-4ed921b1208f', 'f0fcc776-8835-4c9e-b781-885ca047d058', 'Anglais', NULL, '4', '20', '2024-2025', NULL, 20, NULL, NULL, 1, '2026-08-02 17:40:13.590875+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '57fb3408-fa53-46f5-8933-c66bc6d1464a';

-- ── goudja · 6ème A · « Français » ──
UPDATE public.subjects SET position = NULL
  WHERE id = '59398928-e573-480b-8193-451db64a4a33';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('908e7ac7-b601-4e87-9cdb-041df9c48730', '92331504-e428-43dc-a69c-4ed921b1208f', 'f0fcc776-8835-4c9e-b781-885ca047d058', 'Français', NULL, '4', '20', '2024-2025', NULL, 20, NULL, NULL, 0, '2026-08-02 17:40:13.590881+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '908e7ac7-b601-4e87-9cdb-041df9c48730';

-- ── goudja · 6ème A · « Histoire-Géographie » ──
UPDATE public.subjects SET position = NULL
  WHERE id = '6066da5a-06d1-4973-ab1d-6d9adc662c89';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('35179c23-4440-48c8-9c12-04fc65dd3c30', '92331504-e428-43dc-a69c-4ed921b1208f', 'f0fcc776-8835-4c9e-b781-885ca047d058', 'Histoire-Géographie', NULL, '2', '20', '2024-2025', NULL, 20, NULL, NULL, 5, '2026-08-02 17:40:13.234129+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '35179c23-4440-48c8-9c12-04fc65dd3c30';

-- ── goudja · 6ème A · « Informatique » ──
UPDATE public.subjects SET position = NULL
  WHERE id = 'f2426dad-3009-4d44-ab8a-df043a81fa46';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('6ce67ee9-bb4b-4d40-93df-036f7458c8e3', '92331504-e428-43dc-a69c-4ed921b1208f', 'f0fcc776-8835-4c9e-b781-885ca047d058', 'Informatique', NULL, '2', '20', '2024-2025', NULL, 20, NULL, NULL, 7, '2026-08-02 17:40:11.75108+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '6ce67ee9-bb4b-4d40-93df-036f7458c8e3';

-- ── goudja · 6ème A · « Mathématiques » ──
UPDATE public.subjects SET position = NULL
  WHERE id = '5a6c8ad9-2b70-45fa-bb54-beabf6174296';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('28b454f9-9d02-4557-9b1b-2882e4679c9b', '92331504-e428-43dc-a69c-4ed921b1208f', 'f0fcc776-8835-4c9e-b781-885ca047d058', 'Mathématiques', NULL, '4', '20', '2024-2025', NULL, 20, NULL, NULL, 2, '2026-08-02 17:40:13.233606+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '28b454f9-9d02-4557-9b1b-2882e4679c9b';

-- ── goudja · Form 1 A · « Biology » ──
UPDATE public.subjects SET position = NULL
  WHERE id = '41731fe9-ed6a-4a80-8339-67c878c6677a';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('3fb3faaf-1466-4009-be6b-c075e9f9a471', '92331504-e428-43dc-a69c-4ed921b1208f', '0c930ef3-16b2-41b0-810d-2665bdf50f9c', 'Biology', NULL, '2', '20', '2024-2025', NULL, 100, NULL, NULL, 3, '2026-08-02 17:43:15.795189+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '3fb3faaf-1466-4009-be6b-c075e9f9a471';

-- ── goudja · Form 1 A · « Computer Science » ──
UPDATE public.subjects SET position = NULL
  WHERE id = 'd8dc51b3-44e7-41c4-bdea-274cf158f781';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('8d32df78-b055-4afe-a2c3-00c34ab9d121', '92331504-e428-43dc-a69c-4ed921b1208f', '0c930ef3-16b2-41b0-810d-2665bdf50f9c', 'Computer Science', NULL, '2', '20', '2024-2025', NULL, 100, NULL, NULL, 9, '2026-08-02 17:43:18.036044+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '8d32df78-b055-4afe-a2c3-00c34ab9d121';

-- ── goudja · Form 1 A · « English Language » ──
UPDATE public.subjects SET position = NULL
  WHERE id = 'b9b6b98b-c207-4faa-8dc6-f76be7d5527e';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('a72eec36-ed8c-40ce-8cc9-818ed6221096', '92331504-e428-43dc-a69c-4ed921b1208f', '0c930ef3-16b2-41b0-810d-2665bdf50f9c', 'English Language', NULL, '4', '20', '2024-2025', NULL, 100, NULL, NULL, 0, '2026-08-02 17:43:15.114995+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = 'a72eec36-ed8c-40ce-8cc9-818ed6221096';

-- ── goudja · Form 1 A · « Mathematics » ──
UPDATE public.subjects SET position = NULL
  WHERE id = '2a22d68a-6ca4-4130-b6d0-0e91dddd3521';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('2c1a04b7-5db2-40f7-818f-6311cc204a84', '92331504-e428-43dc-a69c-4ed921b1208f', '0c930ef3-16b2-41b0-810d-2665bdf50f9c', 'Mathematics', NULL, '4', '20', '2024-2025', NULL, 100, NULL, NULL, 2, '2026-08-02 17:43:15.467123+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '2c1a04b7-5db2-40f7-818f-6311cc204a84';

-- ── goudja · Form 1 A · « Physical Education » ──
UPDATE public.subjects SET position = NULL
  WHERE id = '733517de-40a4-4ab8-ad4a-30d884750ec0';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('13ede2f3-aaee-4f36-915f-083612d9f814', '92331504-e428-43dc-a69c-4ed921b1208f', '0c930ef3-16b2-41b0-810d-2665bdf50f9c', 'Physical Education', NULL, '1', '20', '2024-2025', NULL, 100, NULL, NULL, 10, '2026-08-02 17:43:18.398869+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '13ede2f3-aaee-4f36-915f-083612d9f814';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · 5eme · « Étude de texte » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('ba799a0b-9e61-48e2-9a47-87f1d0be50f1', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', 'ETUDE DE TEXTE', NULL, '1', '20', '2024-2025', NULL, 20, 'db6fcad3-a2ca-4369-89c8-a6c3829de56e', NULL, 12, '2026-10-15 07:42:08.462+00', 1, '1913fd1b-0e1e-4d7c-b065-556e612a43a8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-12 07:22:56+00', NULL, NULL, NULL, 'langues')
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = 'ba799a0b-9e61-48e2-9a47-87f1d0be50f1';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · 5eme · « Géographie » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('ae39d78b-3e8f-a203-7c32-3921c8ca6d5b', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', 'Géographie', NULL, '2', '20', '2026-2027', NULL, 20, '4b08a436-0b36-49f6-839c-a2c5d714b9d2', NULL, 12, '2026-10-20 09:42:46.046899+00', 2, '1913fd1b-0e1e-4d7c-b065-556e612a43a8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-15 20:37:06.014+00', 'Sciences humaines', 3, true, 'litteraire')
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = 'ae39d78b-3e8f-a203-7c32-3921c8ca6d5b';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · 5eme · « Histoire » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('cc9f3755-190a-2e76-aba6-dd70a0cc3418', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', 'Histoire', NULL, '2', '20', '2026-2027', NULL, 20, NULL, NULL, 10, '2026-10-15 20:32:57.042746+00', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Sciences humaines', 3, true, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = 'cc9f3755-190a-2e76-aba6-dd70a0cc3418';

INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('e81b6494-dc10-401a-ae4f-3cdf5b07c7bb', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', 'Histoire', NULL, '1', '20', '2024-2025', NULL, 20, '4b08a436-0b36-49f6-839c-a2c5d714b9d2', NULL, NULL, '2026-10-20 07:10:23.613+00', 1, '1913fd1b-0e1e-4d7c-b065-556e612a43a8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-20 07:06:00+00', NULL, NULL, NULL, 'litteraire')
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = 'e81b6494-dc10-401a-ae4f-3cdf5b07c7bb';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · 5eme · « SVT » ──
INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)
  VALUES ('285b6b71-3c23-4672-9f4a-925eb5184eca', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', '65e518d8-400e-4e75-a70a-7faf5a9afbba', '25ee89ba-f263-4a54-b5da-750021f46a14', 1, '14.75', '2024-2025') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)
  VALUES ('0dbbd9d2-307a-4b5f-8f66-b25e1f061bfa', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', '632ae82d-4d55-4cd7-ba20-57c031fdcb35', '25ee89ba-f263-4a54-b5da-750021f46a14', 1, '11', '2024-2025') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)
  VALUES ('2f537e5e-ded7-4c6f-b1d7-28bcb0db6d62', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', 'e5ab5a85-4d84-41e5-8e12-9bb759a24be1', '25ee89ba-f263-4a54-b5da-750021f46a14', 1, '16', '2024-2025') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)
  VALUES ('4c54f736-87b6-455b-a9ac-c658e5cf6aad', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', 'a14eafa9-055c-4ad0-950b-871ec8ec0278', '25ee89ba-f263-4a54-b5da-750021f46a14', 1, '11.75', '2024-2025') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)
  VALUES ('7015df28-80a7-4082-9ef4-eac5a0305cb9', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', 'ad141c85-0b8a-4c71-815c-79d965e5b40c', '25ee89ba-f263-4a54-b5da-750021f46a14', 1, '12.5', '2024-2025') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)
  VALUES ('c3cebd9d-e15e-4efe-baf0-6d34c1a27b3b', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', '1f545a39-d624-4be6-98b2-0a4481b7f58e', '25ee89ba-f263-4a54-b5da-750021f46a14', 1, '12.75', '2024-2025') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)
  VALUES ('eff15c0b-3835-4f7b-9bbe-b0e8e701c743', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', 'cd2f491b-5b0b-42ad-a128-1c71eedd67e9', '25ee89ba-f263-4a54-b5da-750021f46a14', 1, '12.25', '2024-2025') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)
  VALUES ('69ef62b5-680e-4a13-86b7-a6d1c122ba2b', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', '657b4c09-0b23-4694-a3b0-febbdaf4b6bb', '25ee89ba-f263-4a54-b5da-750021f46a14', 1, '10.5', '2024-2025') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)
  VALUES ('ca10b9e0-deed-472d-a092-1bd78e40a947', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', '774cde23-6e8b-45b5-97a4-439f5ccdd1fa', '25ee89ba-f263-4a54-b5da-750021f46a14', 1, '15.5', '2024-2025') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)
  VALUES ('4955a7d3-068e-4a12-a0d5-fab2ab21bcc0', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', 'c91531af-4f5d-41f8-b6d1-c4ff79d5bfaf', '25ee89ba-f263-4a54-b5da-750021f46a14', 1, '19', '2024-2025') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('25ee89ba-f263-4a54-b5da-750021f46a14', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '2951f4e1-9e95-492e-abe5-6e21306b06c8', 'SVT', NULL, '1', '20', '2024-2025', NULL, 20, 'e1770558-c370-475c-ba41-8f7364ae04c3', NULL, NULL, '2026-10-20 07:10:12.395+00', 1, '1913fd1b-0e1e-4d7c-b065-556e612a43a8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-20 07:10:04+00', NULL, NULL, NULL, 'sciences')
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '25ee89ba-f263-4a54-b5da-750021f46a14';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · 6eme · « Expression Ecrite » ──
UPDATE public.subjects SET position = NULL
  WHERE id = '46e89744-e999-430d-be20-25f14a8b54d6';
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('d299890c-276c-e71f-5173-c21d26750344', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '8784bfd1-19ef-4516-8415-73181eff684d', 'Expression écrite', NULL, '2', '20', '2026-2027', NULL, 20, 'db6fcad3-a2ca-4369-89c8-a6c3829de56e', NULL, 3, '2026-10-20 10:29:31.988551+00', 3, '1913fd1b-0e1e-4d7c-b065-556e612a43a8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-15 20:37:06.017+00', 'Langues et littérature', 1, true, 'langues')
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = 'd299890c-276c-e71f-5173-c21d26750344';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · FORM1 · « Genius Labs » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('7e501858-0628-47a3-9174-fe314b9f319b', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '9be1de99-668f-4250-bb87-bf6ef6462d5c', 'Genius LABS', NULL, '2', '20', '2024-2025', NULL, 20, 'ade16d57-7bbd-4877-8cc5-4ef15c607789', NULL, NULL, '2026-10-14 08:06:40.861+00', 1, '1913fd1b-0e1e-4d7c-b065-556e612a43a8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-14 08:06:37+00', NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '7e501858-0628-47a3-9174-fe314b9f319b';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · FORM1 · « Home Economics » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('d288152e-e312-4921-9451-c4fb8d435470', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '9be1de99-668f-4250-bb87-bf6ef6462d5c', 'HOME ECONOMICS', NULL, '2', '20', '2024-2025', NULL, 20, 'aefa2612-7cab-42ac-aa15-168cde982fdb', NULL, NULL, '2026-10-12 14:15:39.045+00', 1, '1913fd1b-0e1e-4d7c-b065-556e612a43a8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-17 09:04:16+00', NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = 'd288152e-e312-4921-9451-c4fb8d435470';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · FORM2 · « Genius Labs » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('9af0c74c-c1cc-4731-8faa-2ff517fd8382', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '022d645f-bd76-46e6-901b-e2fcaf7250a9', 'Genius LABS', NULL, '2', '20', '2024-2025', NULL, 20, 'ade16d57-7bbd-4877-8cc5-4ef15c607789', NULL, NULL, '2026-10-14 08:07:28.517+00', 1, '1913fd1b-0e1e-4d7c-b065-556e612a43a8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-14 08:07:23+00', NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '9af0c74c-c1cc-4731-8faa-2ff517fd8382';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · FORM2 · « Home Economics » ──
INSERT INTO public.subjects (id, school_id, class_id, name, short, coef, max_grade, year, client_updated_at, max, teacher_id, category_id, position, updated_at, version, device_id, parent_id, calc_method, formula, sc_groupe, sc_groupe_ordre, charge_horaire, prim_competence_id, mat_domaine_id, created_at, bil_domaine, bil_domaine_ordre, bil_obligatoire, category)
  VALUES ('4a8bbe91-7a0c-4580-84cf-175787db40fe', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '022d645f-bd76-46e6-901b-e2fcaf7250a9', 'HOME ECONOMICS', NULL, '2', '20', '2024-2025', NULL, 20, 'aefa2612-7cab-42ac-aa15-168cde982fdb', NULL, NULL, '2026-10-12 14:22:22.136+00', 1, '1913fd1b-0e1e-4d7c-b065-556e612a43a8', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-17 09:06:47+00', NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
DELETE FROM public.sync_tombstones WHERE tablename = 'subjects' AND row_id = '4a8bbe91-7a0c-4580-84cf-175787db40fe';

COMMIT;
