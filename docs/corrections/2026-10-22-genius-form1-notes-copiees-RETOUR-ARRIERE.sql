-- RETOUR ARRIÈRE — les 41 notes de « French Language » (FORM1, THE GENIUS)
--
-- Défait 2026-10-22-genius-form1-notes-copiees.sql.
--
-- COMMENT LES LIGNES SONT RECONSTITUÉES, et pourquoi ainsi. Chaque note
-- supprimée était la copie EXACTE de celle de « Français intensif » pour le même
-- élève et la même séquence — c'est précisément ce que le garde-fou de la
-- correction a vérifié (41 avec jumelle identique, 0 sans). On réinsère donc en
-- JOIGNANT sur la matière conservée : la valeur, la séquence et l'année viennent
-- de la base elle-même, et ne peuvent pas être recopiées de travers.
--
-- Seuls les IDENTIFIANTS d'origine sont listés ici, appariés à leur élève : ils
-- ne se déduisent de rien, et les remettre tels quels garde les pierres
-- tombales cohérentes avec les lignes rétablies.
--
-- À n'exécuter que si l'on renonce à la correction.

BEGIN;

INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value, year)
SELECT v.id, k.school_id, k.class_id, k.student_id,
       '1cc68fbc-f4bd-4405-a7fd-597160593fb0', k.sequence, k.value, k.year
  FROM (VALUES
    ('0198b8fb-7646-4af9-a54a-7be5888b3ac8'::uuid, 'd091439c-16b8-4504-8d0e-fdbd0bf983dd'::uuid),
    ('0a4400b4-1d21-41b5-b70d-750560ef6ffa', '51ef7955-7dbf-4268-91c8-4d01803a5a34'),
    ('0ec97504-d382-4db8-9462-e1547136645b', '466ec6d6-b601-44ae-96c0-646ff99daf69'),
    ('0f06fa7c-6b19-4526-ae0b-02dadfc15584', '1adb3b93-e898-4a10-8710-a6723727811e'),
    ('106b5ea2-a6ff-4af5-9b7b-a1c0685e45b0', 'a884f50b-ad54-4d60-aaa9-12ac8659f4e8'),
    ('17f1ba5b-7bb9-4b3f-b72f-e4c36e6d6f9a', '2fe2a2b1-a1b2-4bce-aaa7-c5f120619c5f'),
    ('18a829bf-1766-47c5-b446-c590fc8a0bae', 'a9825e0b-6914-43e8-b4ee-9c42af93df67'),
    ('1b4aaf5d-58b9-4026-b63d-4f7e48d9415e', 'ad52a535-c034-42ae-b90e-57e361ffdd7a'),
    ('239e47ba-d5f1-4cb2-a170-354b7f69c664', 'a083d09a-85fe-4c41-a3f1-845ebce95ca4'),
    ('24983ec4-afe1-4c36-9806-3a313898f4fd', 'e8fe20fb-32e6-4750-92fc-10a49217630d'),
    ('31689c4f-eeec-43ab-8fac-6a4f3ac7675a', 'cd403e61-ec6b-4ca3-9fb8-e3cd78373d78'),
    ('3fc2bb0d-f69b-450b-9227-89765a618ac9', 'b4fbdd33-fe84-4730-bdd5-9c03eb99b09f'),
    ('40cef2ed-3c27-4b61-8e46-3c771f6a36ef', '3cf705d6-1bbc-48ff-8f8d-2d78becc14c0'),
    ('432d7299-474b-4d90-b7bd-b19c30101712', 'de460cc5-ce3c-4d72-9241-54974f4f8740'),
    ('4934ebe9-b8d8-4a61-8733-03355dba8351', '3713bd90-d324-429c-b40a-0e81da991dc0'),
    ('4c087e10-9495-46c3-9f61-b4bc6f01d51a', 'ed3666ba-baae-47ca-9079-3fda5b6f440e'),
    ('51991f9f-9656-4c3a-89e6-69544435f14c', 'de8d3760-f100-45bb-b1b9-715a2eda8257'),
    ('54c8ad64-99fb-40fe-aaf9-52e8a740556b', '9f2ff330-4fbd-4bdf-8ef3-4b12c737a78d'),
    ('5a1a2bfa-bb1c-4f6e-bf2b-ffd41a3ef43a', 'e156204a-f081-4c70-a49c-c5ce6b033266'),
    ('5b0b5176-03da-4bf5-9496-2b77b17e7bc4', 'bffef7ef-b42c-4916-85b2-9665778d54dc'),
    ('5d1d6bf5-2a7f-452c-8709-f7f2acb227f7', 'e326f790-b08e-4bc1-9f4b-ec4c8d787819'),
    ('622b9103-fb7c-4606-9786-332b955111ad', '2523cda1-f0dd-4d59-97f6-9e5e23180bbb'),
    ('62c728a6-6cfa-45c1-afa4-ca5350786fd8', 'e7bbb03c-6561-42bd-9c7f-477c31e52464'),
    ('69e0d079-08a2-4fad-ad03-59bf6c5950e3', 'e8aca7ff-3d61-4582-9cd9-2edca77f0bc4'),
    ('6ddb35be-e2cb-46fd-a598-e2f7ac45aa7f', '2d3e1841-dd87-4c6c-adc9-0d5cb13ff391'),
    ('6ebf1519-b29a-46c5-a3f0-1ae09e8058b8', 'f917f508-8f3e-4eaa-a5ae-60e596017a4a'),
    ('9348ac05-484e-4398-879b-2d819db6185d', 'b87cec6e-6223-4963-aa14-d36e7390eede'),
    ('9cbba1e4-3b3a-49d5-8676-c4d98fc6e2b8', '3793aade-d0e1-487d-b821-2a81fccd9586'),
    ('a99f9420-ac4d-4be7-9a55-f7d1a3b6b23b', 'f8c9bbfe-31f8-4133-8e95-5021bf82f702'),
    ('c1c531a7-0a5d-4662-a7bc-ae2ed4934ac5', '7c6a3225-1c2d-47e6-a184-6a82cfad6279'),
    ('d2a8bf9c-b855-4f3b-8ddf-3e3a20d43a63', 'b57cfcef-921e-453b-bf53-44f2f72b7fce'),
    ('d4a081cd-1c9d-4f40-b3b6-ea177b5b48ee', '98af6761-b4bb-4da1-ac14-f21967208530'),
    ('d9e627f3-67e7-46ef-aa9c-61019effa989', '5e65bb41-70b4-475c-b842-c15d4b3ffe19'),
    ('ec25ea4b-02b8-44c3-9773-0b9c47e2aea0', '421ad56e-4204-4521-a698-c32c031037d4'),
    ('efb5e22f-195c-4d28-9d6d-3bf7863d6a1d', '5b82530e-4b3d-49fd-9f3a-4c7a74641c69'),
    ('f08c5c86-a85c-46ec-b3d9-6ff08e02dd09', '7114ca89-8faf-4d3f-b8b6-baf687954b99'),
    ('f0e1c482-1dcf-48ef-9ae7-17abbe5b6f50', 'd6292653-c81a-4005-af32-1c0d78684892'),
    ('f75779be-60c0-4120-8ddc-641e2f08ba96', 'e26239f4-0222-47dd-96b8-1af8decd6360'),
    ('f8129d12-4174-4122-a736-a0e5928b3375', 'af4bb205-299e-402c-8c4d-18c1ef374897'),
    ('f87b32b2-0025-44cf-8fb9-446f315a03f9', '7479fb7e-f889-44b2-ad1a-bda730577cde'),
    ('f8e622b0-6fb5-4c2b-8c90-5bd0922d5517', 'dcd3d0d3-a8b1-470c-94b4-d89bd4d00346')
  ) AS v(id, student_id)
  JOIN public.grades k
    ON k.subject_id = 'aaef1310-c389-117f-abf6-f2a39971f564'
   AND k.student_id = v.student_id
 ON CONFLICT (id) DO NOTHING;

-- Les pierres tombales écrites par la suppression doivent partir avec, sinon la
-- synchronisation effacerait à nouveau ce qu'on vient de rétablir.
DELETE FROM public.sync_tombstones
 WHERE tablename = 'grades'
   AND row_id IN (
     '0198b8fb-7646-4af9-a54a-7be5888b3ac8', '0a4400b4-1d21-41b5-b70d-750560ef6ffa',
     '0ec97504-d382-4db8-9462-e1547136645b', '0f06fa7c-6b19-4526-ae0b-02dadfc15584',
     '106b5ea2-a6ff-4af5-9b7b-a1c0685e45b0', '17f1ba5b-7bb9-4b3f-b72f-e4c36e6d6f9a',
     '18a829bf-1766-47c5-b446-c590fc8a0bae', '1b4aaf5d-58b9-4026-b63d-4f7e48d9415e',
     '239e47ba-d5f1-4cb2-a170-354b7f69c664', '24983ec4-afe1-4c36-9806-3a313898f4fd',
     '31689c4f-eeec-43ab-8fac-6a4f3ac7675a', '3fc2bb0d-f69b-450b-9227-89765a618ac9',
     '40cef2ed-3c27-4b61-8e46-3c771f6a36ef', '432d7299-474b-4d90-b7bd-b19c30101712',
     '4934ebe9-b8d8-4a61-8733-03355dba8351', '4c087e10-9495-46c3-9f61-b4bc6f01d51a',
     '51991f9f-9656-4c3a-89e6-69544435f14c', '54c8ad64-99fb-40fe-aaf9-52e8a740556b',
     '5a1a2bfa-bb1c-4f6e-bf2b-ffd41a3ef43a', '5b0b5176-03da-4bf5-9496-2b77b17e7bc4',
     '5d1d6bf5-2a7f-452c-8709-f7f2acb227f7', '622b9103-fb7c-4606-9786-332b955111ad',
     '62c728a6-6cfa-45c1-afa4-ca5350786fd8', '69e0d079-08a2-4fad-ad03-59bf6c5950e3',
     '6ddb35be-e2cb-46fd-a598-e2f7ac45aa7f', '6ebf1519-b29a-46c5-a3f0-1ae09e8058b8',
     '9348ac05-484e-4398-879b-2d819db6185d', '9cbba1e4-3b3a-49d5-8676-c4d98fc6e2b8',
     'a99f9420-ac4d-4be7-9a55-f7d1a3b6b23b', 'c1c531a7-0a5d-4662-a7bc-ae2ed4934ac5',
     'd2a8bf9c-b855-4f3b-8ddf-3e3a20d43a63', 'd4a081cd-1c9d-4f40-b3b6-ea177b5b48ee',
     'd9e627f3-67e7-46ef-aa9c-61019effa989', 'ec25ea4b-02b8-44c3-9773-0b9c47e2aea0',
     'efb5e22f-195c-4d28-9d6d-3bf7863d6a1d', 'f08c5c86-a85c-46ec-b3d9-6ff08e02dd09',
     'f0e1c482-1dcf-48ef-9ae7-17abbe5b6f50', 'f75779be-60c0-4120-8ddc-641e2f08ba96',
     'f8129d12-4174-4122-a736-a0e5928b3375', 'f87b32b2-0025-44cf-8fb9-446f315a03f9',
     'f8e622b0-6fb5-4c2b-8c90-5bd0922d5517'
   );

-- Contrôle : on doit retrouver 41 notes de chaque côté.
DO $$
DECLARE g int; c int;
BEGIN
  SELECT count(*) INTO g FROM public.grades WHERE subject_id = 'aaef1310-c389-117f-abf6-f2a39971f564';
  SELECT count(*) INTO c FROM public.grades WHERE subject_id = '1cc68fbc-f4bd-4405-a7fd-597160593fb0';
  RAISE NOTICE 'Français intensif : % note(s) — French Language : % note(s)', g, c;
END $$;

COMMIT;
