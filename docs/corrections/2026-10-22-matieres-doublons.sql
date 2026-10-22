-- CORRECTION — MATIÈRES DE CLASSE EN DOUBLE
-- Généré le 2026-10-22 par scripts/audit-matieres-doublons.mjs, sur le projet ltxopwoxvgslsgzixbpx.
--
-- ⚠️  INSTANTANÉ. Ce fichier NOMME des identifiants relevés à la génération. Si
--     la base a changé depuis, relancez le script avant d'appliquer : le compte
--     attendu ci-dessous refusera le lot plutôt que d'agir à l'aveugle.
--
-- CE QUE CE SQL FAIT, dans cet ordre :
--   1. il vérifie qu'il retrouve bien les 34 lignes attendues ;
--   2. la ligne gardée reprend de sa copie ce qu'elle n'a pas (rangement sur le
--      bulletin, groupe réglementaire, enseignant) ;
--   3. les notes strictement identiques portées par la copie sont retirées
--      (même élève, même séquence, même année, MÊME valeur) ;
--   4. les notes restantes sont rattachées à la ligne gardée — aucune n'est
--      perdue ;
--   5. les copies sont supprimées. La suppression écrit un `sync_tombstones`
--      (trigger `trg_tomb_subjects`), donc les serveurs LAN des écoles
--      retireront la ligne à leur prochain cycle de synchronisation. SANS cette
--      propagation, l'école garderait son doublon et le repousserait au Cloud.
--
-- CE QUE CE SQL NE FAIT PAS : il ne touche à AUCUN coefficient, à aucun barème,
-- à aucune note dont la valeur diffère entre les deux copies. Ces écarts sont
-- listés dans le rapport et reviennent à l'école.
--
-- RETOUR ARRIÈRE : 2026-10-22-matieres-doublons-RETOUR-ARRIERE.sql (lignes et notes
-- réinsérées telles quelles, tombstones retirés, reprises défaites).

BEGIN;

-- 1) Compte attendu. Si la base a bougé, on s'arrête ici.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.subjects WHERE id IN ('4225bffe-a158-4fad-a849-261d0274e02d', '7a30eacd-638c-4af7-a470-802425023956', 'e7152213-fa56-48ad-b222-6d04c0661992', '3e48e85a-9ccd-46e2-8a22-a7d7db99c2a4', 'ebf1ad7f-5a52-4629-a666-ef4f9645be76', '1c46a286-3c95-460f-8d4b-261c5866cfcc', '2a52c3a4-6057-493e-82b5-373eac49f94e', '75b8800e-63c0-4ba8-a759-66b084b5b0a7', '17af19e6-9a70-4527-a612-7fbe4ba6e82f', '47046574-3800-413f-a65d-27b4db9bc2d0', '455b1c6b-b165-49c5-8180-c4b17c741474', '9ebf98bf-e9e8-4cce-a135-57f97c53d0e0', 'd7e28c11-edc5-42e5-a760-eb882a794e04', '232831fb-ffbd-4985-b60d-ef20b583adc3', '57fb3408-fa53-46f5-8933-c66bc6d1464a', '908e7ac7-b601-4e87-9cdb-041df9c48730', '35179c23-4440-48c8-9c12-04fc65dd3c30', '6ce67ee9-bb4b-4d40-93df-036f7458c8e3', '28b454f9-9d02-4557-9b1b-2882e4679c9b', '3fb3faaf-1466-4009-be6b-c075e9f9a471', '8d32df78-b055-4afe-a2c3-00c34ab9d121', 'a72eec36-ed8c-40ce-8cc9-818ed6221096', '2c1a04b7-5db2-40f7-818f-6311cc204a84', '13ede2f3-aaee-4f36-915f-083612d9f814', 'ba799a0b-9e61-48e2-9a47-87f1d0be50f1', 'ae39d78b-3e8f-a203-7c32-3921c8ca6d5b', 'cc9f3755-190a-2e76-aba6-dd70a0cc3418', 'e81b6494-dc10-401a-ae4f-3cdf5b07c7bb', '25ee89ba-f263-4a54-b5da-750021f46a14', 'd299890c-276c-e71f-5173-c21d26750344', '7e501858-0628-47a3-9174-fe314b9f319b', 'd288152e-e312-4921-9451-c4fb8d435470', '9af0c74c-c1cc-4731-8faa-2ff517fd8382', '4a8bbe91-7a0c-4580-84cf-175787db40fe');
  IF n <> 34 THEN
    RAISE EXCEPTION 'Attendu 34 copie(s) à fusionner, trouvé % — relancez audit-matieres-doublons.mjs', n;
  END IF;
END $$;

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 [2026-2027] · « Artistic activities » ──
DELETE FROM public.subjects WHERE id = '4225bffe-a158-4fad-a849-261d0274e02d';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 [2026-2027] · « Discovery of the world » ──
DELETE FROM public.subjects WHERE id = '7a30eacd-638c-4af7-a470-802425023956';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 [2026-2027] · « Language and communication » ──
DELETE FROM public.subjects WHERE id = 'e7152213-fa56-48ad-b222-6d04c0661992';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 [2026-2027] · « Personal autonomy » ──
DELETE FROM public.subjects WHERE id = '3e48e85a-9ccd-46e2-8a22-a7d7db99c2a4';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 [2026-2027] · « Pre-numeracy and logical reasoning » ──
DELETE FROM public.subjects WHERE id = 'ebf1ad7f-5a52-4629-a666-ef4f9645be76';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 [2026-2027] · « Pre-reading and pre-writing » ──
DELETE FROM public.subjects WHERE id = '1c46a286-3c95-460f-8d4b-261c5866cfcc';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 [2026-2027] · « Psychomotor skills » ──
DELETE FROM public.subjects WHERE id = '2a52c3a4-6057-493e-82b5-373eac49f94e';

-- ── BRIGHT CONTINENT BILINGUAL SCHOOL · Nursery 2 [2026-2027] · « Social and emotional life » ──
DELETE FROM public.subjects WHERE id = '75b8800e-63c0-4ba8-a759-66b084b5b0a7';

-- ── Collège La retraite · 3e [2026-2027] · « EPS » ──
DELETE FROM public.subjects WHERE id = '17af19e6-9a70-4527-a612-7fbe4ba6e82f';

-- ── goudja · 5ème B [2026-2027] · « Anglais » ──
UPDATE public.subjects SET position = 1
  WHERE id = 'edd0bad6-14c1-4611-94d1-6e6a82d60adf';
DELETE FROM public.subjects WHERE id = '47046574-3800-413f-a65d-27b4db9bc2d0';

-- ── goudja · 5ème B [2026-2027] · « Français » ──
UPDATE public.subjects SET position = 0
  WHERE id = '31fdbc8e-fe85-468e-bcb6-3afb34377c5a';
DELETE FROM public.subjects WHERE id = '455b1c6b-b165-49c5-8180-c4b17c741474';

-- ── goudja · 5ème B [2026-2027] · « Histoire-Géographie » ──
UPDATE public.subjects SET position = 5
  WHERE id = '58cea964-4103-4774-90ee-85636d17928d';
DELETE FROM public.subjects WHERE id = '9ebf98bf-e9e8-4cce-a135-57f97c53d0e0';

-- ── goudja · 5ème B [2026-2027] · « Informatique » ──
UPDATE public.subjects SET position = 7
  WHERE id = '9cc55d5b-459c-42b1-a8b7-7ef720581bfc';
DELETE FROM public.subjects WHERE id = 'd7e28c11-edc5-42e5-a760-eb882a794e04';

-- ── goudja · 5ème B [2026-2027] · « Mathématiques » ──
UPDATE public.subjects SET position = 2
  WHERE id = 'acce9951-594a-42f9-ba1c-3fc3539d60fa';
DELETE FROM public.subjects WHERE id = '232831fb-ffbd-4985-b60d-ef20b583adc3';

-- ── goudja · 6ème A [2026-2027] · « Anglais » ──
UPDATE public.subjects SET position = 1
  WHERE id = 'c60d43ac-4a36-4fc8-b609-de59ef4abfdd';
DELETE FROM public.subjects WHERE id = '57fb3408-fa53-46f5-8933-c66bc6d1464a';

-- ── goudja · 6ème A [2026-2027] · « Français » ──
UPDATE public.subjects SET position = 0
  WHERE id = '59398928-e573-480b-8193-451db64a4a33';
DELETE FROM public.subjects WHERE id = '908e7ac7-b601-4e87-9cdb-041df9c48730';

-- ── goudja · 6ème A [2026-2027] · « Histoire-Géographie » ──
UPDATE public.subjects SET position = 5
  WHERE id = '6066da5a-06d1-4973-ab1d-6d9adc662c89';
DELETE FROM public.subjects WHERE id = '35179c23-4440-48c8-9c12-04fc65dd3c30';

-- ── goudja · 6ème A [2026-2027] · « Informatique » ──
UPDATE public.subjects SET position = 7
  WHERE id = 'f2426dad-3009-4d44-ab8a-df043a81fa46';
DELETE FROM public.subjects WHERE id = '6ce67ee9-bb4b-4d40-93df-036f7458c8e3';

-- ── goudja · 6ème A [2026-2027] · « Mathématiques » ──
UPDATE public.subjects SET position = 2
  WHERE id = '5a6c8ad9-2b70-45fa-bb54-beabf6174296';
DELETE FROM public.subjects WHERE id = '28b454f9-9d02-4557-9b1b-2882e4679c9b';

-- ── goudja · Form 1 A [2026-2027] · « Biology » ──
UPDATE public.subjects SET position = 3
  WHERE id = '41731fe9-ed6a-4a80-8339-67c878c6677a';
DELETE FROM public.subjects WHERE id = '3fb3faaf-1466-4009-be6b-c075e9f9a471';

-- ── goudja · Form 1 A [2026-2027] · « Computer Science » ──
UPDATE public.subjects SET position = 9
  WHERE id = 'd8dc51b3-44e7-41c4-bdea-274cf158f781';
DELETE FROM public.subjects WHERE id = '8d32df78-b055-4afe-a2c3-00c34ab9d121';

-- ── goudja · Form 1 A [2026-2027] · « English Language » ──
UPDATE public.subjects SET position = 0
  WHERE id = 'b9b6b98b-c207-4faa-8dc6-f76be7d5527e';
DELETE FROM public.subjects WHERE id = 'a72eec36-ed8c-40ce-8cc9-818ed6221096';

-- ── goudja · Form 1 A [2026-2027] · « Mathematics » ──
UPDATE public.subjects SET position = 2
  WHERE id = '2a22d68a-6ca4-4130-b6d0-0e91dddd3521';
DELETE FROM public.subjects WHERE id = '2c1a04b7-5db2-40f7-818f-6311cc204a84';

-- ── goudja · Form 1 A [2026-2027] · « Physical Education » ──
UPDATE public.subjects SET position = 10
  WHERE id = '733517de-40a4-4ab8-ad4a-30d884750ec0';
DELETE FROM public.subjects WHERE id = '13ede2f3-aaee-4f36-915f-083612d9f814';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · 5eme [2026-2027] · « Étude de texte » ──
DELETE FROM public.subjects WHERE id = 'ba799a0b-9e61-48e2-9a47-87f1d0be50f1';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · 5eme [2026-2027] · « Géographie » ──
DELETE FROM public.subjects WHERE id = 'ae39d78b-3e8f-a203-7c32-3921c8ca6d5b';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · 5eme [2026-2027] · « Histoire » ──
DELETE FROM public.subjects WHERE id = 'cc9f3755-190a-2e76-aba6-dd70a0cc3418';

DELETE FROM public.subjects WHERE id = 'e81b6494-dc10-401a-ae4f-3cdf5b07c7bb';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · 5eme [2026-2027] · « SVT » ──
-- 10 note(s) strictement identique(s) à celles de la ligne gardée
DELETE FROM public.grades WHERE id IN ('285b6b71-3c23-4672-9f4a-925eb5184eca', '0dbbd9d2-307a-4b5f-8f66-b25e1f061bfa', '2f537e5e-ded7-4c6f-b1d7-28bcb0db6d62', '4c54f736-87b6-455b-a9ac-c658e5cf6aad', '7015df28-80a7-4082-9ef4-eac5a0305cb9', 'c3cebd9d-e15e-4efe-baf0-6d34c1a27b3b', 'eff15c0b-3835-4f7b-9bbe-b0e8e701c743', '69ef62b5-680e-4a13-86b7-a6d1c122ba2b', 'ca10b9e0-deed-472d-a092-1bd78e40a947', '4955a7d3-068e-4a12-a0d5-fab2ab21bcc0');
DELETE FROM public.subjects WHERE id = '25ee89ba-f263-4a54-b5da-750021f46a14';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · 6eme [2026-2027] · « Expression Ecrite » ──
UPDATE public.subjects SET position = 3
  WHERE id = '46e89744-e999-430d-be20-25f14a8b54d6';
DELETE FROM public.subjects WHERE id = 'd299890c-276c-e71f-5173-c21d26750344';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · FORM1 [2026-2027] · « Genius Labs » ──
DELETE FROM public.subjects WHERE id = '7e501858-0628-47a3-9174-fe314b9f319b';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · FORM1 [2026-2027] · « Home Economics » ──
DELETE FROM public.subjects WHERE id = 'd288152e-e312-4921-9451-c4fb8d435470';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · FORM2 [2026-2027] · « Genius Labs » ──
DELETE FROM public.subjects WHERE id = '9af0c74c-c1cc-4731-8faa-2ff517fd8382';

-- ── THE GENIUS INTERNATIONAL SCHOOL & COLLEGE · FORM2 [2026-2027] · « Home Economics » ──
DELETE FROM public.subjects WHERE id = '4a8bbe91-7a0c-4580-84cf-175787db40fe';

-- 6) Contrôle : plus aucun couple (classe, nom normalisé) en double.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT s.class_id, lower(regexp_replace(translate(coalesce(s.name,''),
  'ÀÂÄÁÃàâäáãÇçÉÈÊËéèêëÎÏÍÌîïíìÔÖÓÒÕôöóòõÙÛÜÚùûüúÑñ',
  'AAAAAaaaaaCcEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNn'), '[^a-zA-Z0-9]', '', 'g')) AS cle FROM public.subjects s
     GROUP BY s.class_id, lower(regexp_replace(translate(coalesce(s.name,''),
  'ÀÂÄÁÃàâäáãÇçÉÈÊËéèêëÎÏÍÌîïíìÔÖÓÒÕôöóòõÙÛÜÚùûüúÑñ',
  'AAAAAaaaaaCcEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNn'), '[^a-zA-Z0-9]', '', 'g')) HAVING count(*) > 1) t;
  RAISE NOTICE 'Couples (classe, matière) encore en double : %', n;
END $$;

COMMIT;
