-- ============================================================================
-- BRIGHT CONTINENT — 19 notes d'ESPAGNOL classées en MATHÉMATIQUES
-- ============================================================================
-- École : BRIGHT CONTINENT BILINGUAL SCHOOL  a8b8fb00-7184-4aec-a39a-3d93a723000a
-- Séquence 1 · année des notes 2024-2025 (inchangée)
--
-- CONSTAT (vérifié, lecture seule, le 2026-10-19)
--   Les 118 notes du classeur sont DÉJÀ au Cloud : 118 au classeur, 118 en base,
--   aucune manquante, aucune en trop. 99 d'entre elles sont à la bonne place.
--   Les 19 autres — l'Espagnol de 5ème, 4ème Esp et 3EME ESP — ont été écrites
--   sous MATHÉMATIQUES. Valeurs et élèves identiques, matière fausse.
--   Ces trois classes n'ont AUCUNE note de mathématiques au classeur : après
--   correction, leur colonne Mathématiques redevient donc vide, ce qui est juste.
--
-- CE QUE CE FICHIER NE FAIT PAS
--   Il n'insère rien. Réimporter le classeur créerait 118 doublons.
--   Il ne touche ni à l'année, ni à la séquence, ni aux valeurs, ni aux élèves.
--   Seule la colonne `subject_id` de 19 lignes change.
--
-- CIBLAGE PAR IDENTIFIANT, jamais par matière : si quelqu'un saisit de vraies
-- notes de mathématiques dans ces classes entre-temps, elles ne seront pas
-- emportées. C'est aussi ce qui rend le retour arrière exact.
-- ============================================================================

BEGIN;

-- 5ème : Mathématiques 2caec906-… -> Espagnol f4f05d2a-…   (8 notes)
UPDATE public.grades SET subject_id = 'f4f05d2a-9792-4bc5-9dea-e7f6ac4622e0'
 WHERE id IN (
   '8caebac9-6451-4ec9-bea9-d0d49b608bb2',  -- ADJI OUSMANE CHERIF      14.5
   '2e3e0288-588c-4504-9d7f-89ad12f82418',  -- ADOUM MAHAMAT ADOUM         9
   'b3b565ad-2705-46c5-b994-d3d9fe782e9a',  -- BENYOMO KAHLIL LEONARD     15
   '091e6c63-545f-40aa-9db1-ebc0173e3daa',  -- HABIBOU MOUHAMADOU          6
   '8e646f67-5f6e-4562-aafa-5a8929c8e87d',  -- ISSOUFA ABBASSI           4.5
   '2f13b92a-824c-47fb-99f9-22b69a037813',  -- MOUHAMADOU ADJI           7.5
   '556d7b14-d3ff-4a58-8d7b-01a5f727f800',  -- MOUHAMADOU HADI           7.5
   '6e31a512-adef-4797-928c-e5c117e9bdc8'   -- SULTAN BOUKAR BEN OUMAR   4.5
 );

-- 4ème Esp : Mathématiques a829e216-… -> Espagnol 4f389cbc-…   (5 notes)
UPDATE public.grades SET subject_id = '4f389cbc-6770-498a-a3b1-efd4e1fa8e53'
 WHERE id IN (
   '04c1c6e5-6364-4a51-b223-a4c6aa599943',  -- ABADAM MAHMAT BOUBA      2.5
   '1ec1b038-f104-45c5-9970-433a1c3ec78d',  -- ABDOUL AZIZ SABIHOU        9
   'c13ff423-6a0f-4741-8f4d-5e7c0f2222f8',  -- MOUHAMAN NOUROU MOUTTI     7
   'be660552-9aa7-4d7a-9084-0a1fead8a5dd',  -- NDOUM MOUBARAK CHERIF    1.5
   '26e0d84d-be71-4a59-a59b-b67c2c3f7f4e'   -- OUMAROU ABDOU              8
 );

-- 3EME ESP : Mathématiques 3491e26c-… -> Espagnol ffa449b6-…   (6 notes)
UPDATE public.grades SET subject_id = 'ffa449b6-90a5-4c6b-8b73-06f553429ea4'
 WHERE id IN (
   '7016c546-d4fd-4c72-a779-4bfa183c80f9',  -- ABDOUL MOUMINI              4
   '0b64f188-794f-477e-bf3a-a87fd3fc3f18',  -- ABDOURAHMAN HAROUN          6
   '02023594-7dc1-4349-a5b4-98bd23594d02',  -- ALHISSEIN OUMAR ADOUM SINI  5
   'e7dbd330-3a28-495a-9986-8b4af9e1b251',  -- ANGOLA MOUHAMADOU WALID    11
   '67919eec-36c1-4de1-85d1-1c9386f7d86a',  -- GBETNKOM SALIM JUNIOR       8
   '92c24379-6623-486b-9027-16836f569baa'   -- MOUNDEM FADIL             5.5
 );

-- AUTO-CONTRÔLE : exactement 19 lignes en Espagnol, 0 restante en Maths sur ces
-- trois classes, et le total de l'école toujours à 118. Si l'un des trois
-- comptes est faux, on annule tout plutôt que de laisser une moitié de
-- correction derrière soi.
DO $$
DECLARE esp int; maths int; total int;
BEGIN
  SELECT count(*) INTO esp FROM public.grades
   WHERE subject_id IN ('f4f05d2a-9792-4bc5-9dea-e7f6ac4622e0',
                        '4f389cbc-6770-498a-a3b1-efd4e1fa8e53',
                        'ffa449b6-90a5-4c6b-8b73-06f553429ea4');
  SELECT count(*) INTO maths FROM public.grades
   WHERE subject_id IN ('2caec906-ca7e-4b5d-84a5-5f3b8a172a64',
                        'a829e216-bb15-40a7-b8db-9acfe43f9945',
                        '3491e26c-15b3-46a7-ac94-7a12a23d14da');
  SELECT count(*) INTO total FROM public.grades
   WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';
  IF esp <> 19 OR maths <> 0 OR total <> 118 THEN
    RAISE EXCEPTION 'Contrôle refusé : espagnol=% (19 attendu), maths=% (0 attendu), total=% (118 attendu)', esp, maths, total;
  END IF;
END $$;

COMMIT;
