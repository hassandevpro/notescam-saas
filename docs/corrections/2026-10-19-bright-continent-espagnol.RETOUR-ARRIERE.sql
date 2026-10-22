-- ============================================================================
-- RETOUR ARRIÈRE de correction-espagnol.sql
-- ============================================================================
-- Remet les 19 notes sous MATHÉMATIQUES, exactement là où elles étaient.
--
-- Il cible les MÊMES 19 identifiants, jamais « toutes les notes d'espagnol » :
-- si de vraies notes d'espagnol sont saisies après la correction, ce retour
-- arrière ne les touchera pas. Il reste donc valable à tout moment, et pas
-- seulement dans la minute qui suit.
-- ============================================================================

BEGIN;

UPDATE public.grades SET subject_id = '2caec906-ca7e-4b5d-84a5-5f3b8a172a64'  -- 5ème Mathématiques
 WHERE id IN ('8caebac9-6451-4ec9-bea9-d0d49b608bb2', '2e3e0288-588c-4504-9d7f-89ad12f82418',
              'b3b565ad-2705-46c5-b994-d3d9fe782e9a', '091e6c63-545f-40aa-9db1-ebc0173e3daa',
              '8e646f67-5f6e-4562-aafa-5a8929c8e87d', '2f13b92a-824c-47fb-99f9-22b69a037813',
              '556d7b14-d3ff-4a58-8d7b-01a5f727f800', '6e31a512-adef-4797-928c-e5c117e9bdc8');

UPDATE public.grades SET subject_id = 'a829e216-bb15-40a7-b8db-9acfe43f9945'  -- 4ème Esp Mathématiques
 WHERE id IN ('04c1c6e5-6364-4a51-b223-a4c6aa599943', '1ec1b038-f104-45c5-9970-433a1c3ec78d',
              'c13ff423-6a0f-4741-8f4d-5e7c0f2222f8', 'be660552-9aa7-4d7a-9084-0a1fead8a5dd',
              '26e0d84d-be71-4a59-a59b-b67c2c3f7f4e');

UPDATE public.grades SET subject_id = '3491e26c-15b3-46a7-ac94-7a12a23d14da'  -- 3EME ESP Mathématiques
 WHERE id IN ('7016c546-d4fd-4c72-a779-4bfa183c80f9', '0b64f188-794f-477e-bf3a-a87fd3fc3f18',
              '02023594-7dc1-4349-a5b4-98bd23594d02', 'e7dbd330-3a28-495a-9986-8b4af9e1b251',
              '67919eec-36c1-4de1-85d1-1c9386f7d86a', '92c24379-6623-486b-9027-16836f569baa');

COMMIT;
