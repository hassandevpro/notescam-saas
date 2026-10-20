-- Complément du script de fusion bilingue : poser `created_at` sur les 45 lignes
-- créées. L'INSERT l'avait laissé NULL (la colonne n'a pas de valeur par défaut),
-- alors que toutes les autres matières de l'école le portent. Sans conséquence
-- fonctionnelle — le pull LAN défaute déjà un created_at NULL au présent
-- (`cloudSync.rawUpsert`) — mais une ligne sans date de création est une ligne
-- qu'on ne sait plus datter dans un audit.
--
-- Strictement borné aux 45 identifiants créés, et seulement s'ils sont encore
-- NULL : réexécuter ce script ne touche plus rien.

BEGIN;

UPDATE public.subjects
   SET created_at = updated_at
 WHERE created_at IS NULL
   AND id IN (
    '892ecab6-264f-4768-b10e-33af18bbf25e',
    '63e8a7ea-bab4-47bc-9c6b-2144265412bd',
    '350e51ec-62c5-43e5-9cd4-18da6ec551cf',
    '93a1532d-970a-4ebc-8118-03516b76c0ea',
    '0faad84a-e354-42b5-b26f-f7234329e4f7',
    '0dfac0b5-9481-49cc-a210-0ee80375c994',
    '73b48091-5aef-4de5-98aa-d4b75f137fb6',
    'ecaaea04-9167-4f5d-a88c-15e5fed90bdb',
    '029c095d-a896-4cd6-b0bf-9e6827e14c12',
    '5f4a8ead-b357-43d8-a3ab-a8f6cffc6563',
    '146b1ab1-1c0d-4b97-8542-aa87f3d05c1c',
    '66da0ccc-bdcb-4871-8f7b-6fc0fae57300',
    '67fcab63-7a99-4300-8eb5-5b947e8f1722',
    '05baa3ca-2577-4d2b-a35d-4dafd5ed7591',
    'e85decb4-d3f1-42b8-a534-cbf10b8d34cc',
    '749bca68-8c82-4a92-93f9-6cd30249d652',
    '01f0b107-363d-4753-a19b-2f1ba8931379',
    'dc609505-d6ac-4aad-b3a5-182fcbaab955',
    '42a4ce09-e5f3-43f0-8a63-a152f76eee8e',
    '867fbb07-6f42-4fa7-af53-9310232f9a0f',
    '7d700e3f-a4f8-4611-a9d0-d8044edb0ca5',
    'f9249e19-3cdc-45c3-9d49-843f178896ee',
    '2d5b1d59-ba5a-4482-9a00-290b6d226d50',
    'ab93c072-15ba-402a-b083-c06342ff21bf',
    '6596973c-d906-4b0b-be3e-f4adebc506cc',
    '6cd9f5d3-10d9-4e3b-b81d-2f0c9b94fe9f',
    'ba04995e-75a6-47ae-9648-628cf0095afb',
    'bd1cff22-988a-4da6-9e3e-e836812009b5',
    '18f90105-a831-4b55-bbae-218b6825b323',
    '8e9f9e5d-393f-40e9-8377-3f341990f54c',
    'f1bb3106-c43b-4548-95e0-af45485488a8',
    'b5687b43-5279-42eb-9b85-ab973ab344d5',
    'fe8f3b82-4d0b-4f25-a10f-bd0b81df5989',
    '6e7e0c3c-9a22-407c-b6e8-9eba4f7507ed',
    'e9366476-29cb-4f27-a64b-543d23a9269d',
    'da39ce59-821b-442d-b747-416af2843e07',
    '741524ad-8db5-4b0a-a0a0-4f29b4f63c8f',
    '29499b17-03af-4328-99e0-9cb80ed1b812',
    '92fb4c43-2c2c-4dd4-96e0-d743f09f1028',
    '97f1cdb4-05f9-4045-9879-c0234b6efbd3',
    '709d7628-cd7b-4ff6-9baf-490fbd301b74',
    'c8c6a2ea-f1a6-4790-9dfc-f3947b9eed05',
    'a9016862-1982-4c8a-b920-1725f296c5ff',
    '8d68fa33-5a5c-4b30-90cb-b98bb98f01e2',
    '03bbec41-9dca-4cce-991c-063921c0613f'
 );

DO $$
DECLARE restants integer;
BEGIN
  SELECT count(*) INTO restants FROM public.subjects
   WHERE created_at IS NULL AND id IN (
    '892ecab6-264f-4768-b10e-33af18bbf25e',
    '63e8a7ea-bab4-47bc-9c6b-2144265412bd',
    '350e51ec-62c5-43e5-9cd4-18da6ec551cf',
    '93a1532d-970a-4ebc-8118-03516b76c0ea',
    '0faad84a-e354-42b5-b26f-f7234329e4f7',
    '0dfac0b5-9481-49cc-a210-0ee80375c994',
    '73b48091-5aef-4de5-98aa-d4b75f137fb6',
    'ecaaea04-9167-4f5d-a88c-15e5fed90bdb',
    '029c095d-a896-4cd6-b0bf-9e6827e14c12',
    '5f4a8ead-b357-43d8-a3ab-a8f6cffc6563',
    '146b1ab1-1c0d-4b97-8542-aa87f3d05c1c',
    '66da0ccc-bdcb-4871-8f7b-6fc0fae57300',
    '67fcab63-7a99-4300-8eb5-5b947e8f1722',
    '05baa3ca-2577-4d2b-a35d-4dafd5ed7591',
    'e85decb4-d3f1-42b8-a534-cbf10b8d34cc',
    '749bca68-8c82-4a92-93f9-6cd30249d652',
    '01f0b107-363d-4753-a19b-2f1ba8931379',
    'dc609505-d6ac-4aad-b3a5-182fcbaab955',
    '42a4ce09-e5f3-43f0-8a63-a152f76eee8e',
    '867fbb07-6f42-4fa7-af53-9310232f9a0f',
    '7d700e3f-a4f8-4611-a9d0-d8044edb0ca5',
    'f9249e19-3cdc-45c3-9d49-843f178896ee',
    '2d5b1d59-ba5a-4482-9a00-290b6d226d50',
    'ab93c072-15ba-402a-b083-c06342ff21bf',
    '6596973c-d906-4b0b-be3e-f4adebc506cc',
    '6cd9f5d3-10d9-4e3b-b81d-2f0c9b94fe9f',
    'ba04995e-75a6-47ae-9648-628cf0095afb',
    'bd1cff22-988a-4da6-9e3e-e836812009b5',
    '18f90105-a831-4b55-bbae-218b6825b323',
    '8e9f9e5d-393f-40e9-8377-3f341990f54c',
    'f1bb3106-c43b-4548-95e0-af45485488a8',
    'b5687b43-5279-42eb-9b85-ab973ab344d5',
    'fe8f3b82-4d0b-4f25-a10f-bd0b81df5989',
    '6e7e0c3c-9a22-407c-b6e8-9eba4f7507ed',
    'e9366476-29cb-4f27-a64b-543d23a9269d',
    'da39ce59-821b-442d-b747-416af2843e07',
    '741524ad-8db5-4b0a-a0a0-4f29b4f63c8f',
    '29499b17-03af-4328-99e0-9cb80ed1b812',
    '92fb4c43-2c2c-4dd4-96e0-d743f09f1028',
    '97f1cdb4-05f9-4045-9879-c0234b6efbd3',
    '709d7628-cd7b-4ff6-9baf-490fbd301b74',
    'c8c6a2ea-f1a6-4790-9dfc-f3947b9eed05',
    'a9016862-1982-4c8a-b920-1725f296c5ff',
    '8d68fa33-5a5c-4b30-90cb-b98bb98f01e2',
    '03bbec41-9dca-4cce-991c-063921c0613f'
   );
  IF restants <> 0 THEN
    RAISE EXCEPTION 'horodatage incomplet : % lignes encore sans created_at', restants;
  END IF;
END $$;

COMMIT;

SELECT count(*) AS lignes_datees
  FROM public.subjects
 WHERE created_at IS NOT NULL AND id IN (
    '892ecab6-264f-4768-b10e-33af18bbf25e',
    '63e8a7ea-bab4-47bc-9c6b-2144265412bd',
    '350e51ec-62c5-43e5-9cd4-18da6ec551cf',
    '93a1532d-970a-4ebc-8118-03516b76c0ea',
    '0faad84a-e354-42b5-b26f-f7234329e4f7',
    '0dfac0b5-9481-49cc-a210-0ee80375c994',
    '73b48091-5aef-4de5-98aa-d4b75f137fb6',
    'ecaaea04-9167-4f5d-a88c-15e5fed90bdb',
    '029c095d-a896-4cd6-b0bf-9e6827e14c12',
    '5f4a8ead-b357-43d8-a3ab-a8f6cffc6563',
    '146b1ab1-1c0d-4b97-8542-aa87f3d05c1c',
    '66da0ccc-bdcb-4871-8f7b-6fc0fae57300',
    '67fcab63-7a99-4300-8eb5-5b947e8f1722',
    '05baa3ca-2577-4d2b-a35d-4dafd5ed7591',
    'e85decb4-d3f1-42b8-a534-cbf10b8d34cc',
    '749bca68-8c82-4a92-93f9-6cd30249d652',
    '01f0b107-363d-4753-a19b-2f1ba8931379',
    'dc609505-d6ac-4aad-b3a5-182fcbaab955',
    '42a4ce09-e5f3-43f0-8a63-a152f76eee8e',
    '867fbb07-6f42-4fa7-af53-9310232f9a0f',
    '7d700e3f-a4f8-4611-a9d0-d8044edb0ca5',
    'f9249e19-3cdc-45c3-9d49-843f178896ee',
    '2d5b1d59-ba5a-4482-9a00-290b6d226d50',
    'ab93c072-15ba-402a-b083-c06342ff21bf',
    '6596973c-d906-4b0b-be3e-f4adebc506cc',
    '6cd9f5d3-10d9-4e3b-b81d-2f0c9b94fe9f',
    'ba04995e-75a6-47ae-9648-628cf0095afb',
    'bd1cff22-988a-4da6-9e3e-e836812009b5',
    '18f90105-a831-4b55-bbae-218b6825b323',
    '8e9f9e5d-393f-40e9-8377-3f341990f54c',
    'f1bb3106-c43b-4548-95e0-af45485488a8',
    'b5687b43-5279-42eb-9b85-ab973ab344d5',
    'fe8f3b82-4d0b-4f25-a10f-bd0b81df5989',
    '6e7e0c3c-9a22-407c-b6e8-9eba4f7507ed',
    'e9366476-29cb-4f27-a64b-543d23a9269d',
    'da39ce59-821b-442d-b747-416af2843e07',
    '741524ad-8db5-4b0a-a0a0-4f29b4f63c8f',
    '29499b17-03af-4328-99e0-9cb80ed1b812',
    '92fb4c43-2c2c-4dd4-96e0-d743f09f1028',
    '97f1cdb4-05f9-4045-9879-c0234b6efbd3',
    '709d7628-cd7b-4ff6-9baf-490fbd301b74',
    'c8c6a2ea-f1a6-4790-9dfc-f3947b9eed05',
    'a9016862-1982-4c8a-b920-1725f296c5ff',
    '8d68fa33-5a5c-4b30-90cb-b98bb98f01e2',
    '03bbec41-9dca-4cce-991c-063921c0613f'
 );
