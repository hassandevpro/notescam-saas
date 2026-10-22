-- THE GENIUS — les 4 classes bilingues portent les deux programmes (2026-10-19).
--
-- Demande de l'école, bulletins en main : « CE1 BIL = fusion des matières de
-- Class 3 + CE1 », puis « fais ceci pour les autres classes bilingues ».
--
-- Ce que ce script fait, et RIEN d'autre : il CRÉE 45 lignes
-- `subjects`, copiées des classes jumelles anglophones du niveau équivalent —
-- correspondances du référentiel (`primaireNiveauSlug`) :
--   · CE1 BIL (prim:ce1) ← Class 3 : 12 matières
--   · CE2 BIL (prim:ce2) ← Class 4 : 11 matières
--   · CP BIL (prim:cp) ← Class 2 : 11 matières
--   · SIL BIL (prim:sil) ← Class 1 A : 11 matières
--
-- Chaque matière garde le coefficient et le barème que l'école a posés sur la
-- classe d'origine (/100 anglophone). Aucune ligne existante n'est modifiée,
-- aucune n'est supprimée : les libellés déjà portés par la classe bilingue
-- (« Chinois ») sont écartés, donc aucune note existante n'est menacée.
--
-- Le commit est refusé si le compte n'est pas EXACTEMENT 45.
-- Retour arrière : 2026-10-19-genius-classes-bilingues-retour-arriere.sql
--
--   node scripts/apply-cloud-sql.mjs --apply docs/corrections/2026-10-19-genius-classes-bilingues.sql

BEGIN;

INSERT INTO public.subjects (id, school_id, class_id, name, coef, max, position) VALUES
  ('892ecab6-264f-4768-b10e-33af18bbf25e', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'Arts', 1, 100, 9),
  ('63e8a7ea-bab4-47bc-9c6b-2144265412bd', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'English', 4, 100, 10),
  ('350e51ec-62c5-43e5-9cd4-18da6ec551cf', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'Social Studies', 2, 100, 11),
  ('93a1532d-970a-4ebc-8118-03516b76c0ea', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'Mathematics', 4, 100, 12),
  ('0faad84a-e354-42b5-b26f-f7234329e4f7', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'French', 2, 100, 13),
  ('0dfac0b5-9481-49cc-a210-0ee80375c994', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'Science', 2, 100, 14),
  ('73b48091-5aef-4de5-98aa-d4b75f137fb6', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'Citizenship', 1, 100, 15),
  ('ecaaea04-9167-4f5d-a88c-15e5fed90bdb', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'Computer Studies', 1, 100, 16),
  ('029c095d-a896-4cd6-b0bf-9e6827e14c12', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'Physical Education', 1, 100, 17),
  ('5f4a8ead-b357-43d8-a3ab-a8f6cffc6563', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'French Language', 1, 100, 18),
  ('146b1ab1-1c0d-4b97-8542-aa87f3d05c1c', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'Music', 1, 100, 19),
  ('66da0ccc-bdcb-4871-8f7b-6fc0fae57300', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '66782d24-2227-4eb1-b0ac-b8bf81573df9', 'Chinois', 1, 100, 20),
  ('67fcab63-7a99-4300-8eb5-5b947e8f1722', '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'b849ee65-97d7-4a2a-80bf-5da07186c47e', 'English', 4, 100, 9),
  ('05baa3ca-2577-4d2b-a35d-4dafd5ed7591', '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'b849ee65-97d7-4a2a-80bf-5da07186c47e', 'Mathematics', 4, 100, 10),
  ('e85decb4-d3f1-42b8-a534-cbf10b8d34cc', '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'b849ee65-97d7-4a2a-80bf-5da07186c47e', 'Science', 2, 100, 11),
  ('749bca68-8c82-4a92-93f9-6cd30249d652', '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'b849ee65-97d7-4a2a-80bf-5da07186c47e', 'Social Studies', 2, 100, 12),
  ('01f0b107-363d-4753-a19b-2f1ba8931379', '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'b849ee65-97d7-4a2a-80bf-5da07186c47e', 'French', 2, 100, 13),
  ('dc609505-d6ac-4aad-b3a5-182fcbaab955', '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'b849ee65-97d7-4a2a-80bf-5da07186c47e', 'Arts', 1, 100, 14),
  ('42a4ce09-e5f3-43f0-8a63-a152f76eee8e', '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'b849ee65-97d7-4a2a-80bf-5da07186c47e', 'Citizenship', 1, 100, 15),
  ('867fbb07-6f42-4fa7-af53-9310232f9a0f', '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'b849ee65-97d7-4a2a-80bf-5da07186c47e', 'Physical Education', 1, 100, 16),
  ('7d700e3f-a4f8-4611-a9d0-d8044edb0ca5', '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'b849ee65-97d7-4a2a-80bf-5da07186c47e', 'Computer Studies', 1, 100, 17),
  ('f9249e19-3cdc-45c3-9d49-843f178896ee', '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'b849ee65-97d7-4a2a-80bf-5da07186c47e', 'French Language', 1, 100, 18),
  ('2d5b1d59-ba5a-4482-9a00-290b6d226d50', '6b68407b-3d2e-426b-81ff-c4e68e66120a', 'b849ee65-97d7-4a2a-80bf-5da07186c47e', 'Music', 1, 100, 19),
  ('ab93c072-15ba-402a-b083-c06342ff21bf', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '4aa94ea6-6cbf-46f4-9fb0-9c1cde60dac5', 'Science', 2, 100, 9),
  ('6596973c-d906-4b0b-be3e-f4adebc506cc', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '4aa94ea6-6cbf-46f4-9fb0-9c1cde60dac5', 'English', 4, 100, 10),
  ('6cd9f5d3-10d9-4e3b-b81d-2f0c9b94fe9f', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '4aa94ea6-6cbf-46f4-9fb0-9c1cde60dac5', 'Physical Education', 1, 100, 11),
  ('ba04995e-75a6-47ae-9648-628cf0095afb', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '4aa94ea6-6cbf-46f4-9fb0-9c1cde60dac5', 'Mathematics', 4, 100, 12),
  ('bd1cff22-988a-4da6-9e3e-e836812009b5', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '4aa94ea6-6cbf-46f4-9fb0-9c1cde60dac5', 'Arts', 1, 100, 13),
  ('18f90105-a831-4b55-bbae-218b6825b323', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '4aa94ea6-6cbf-46f4-9fb0-9c1cde60dac5', 'Social Studies', 2, 100, 14),
  ('8e9f9e5d-393f-40e9-8377-3f341990f54c', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '4aa94ea6-6cbf-46f4-9fb0-9c1cde60dac5', 'Computer Studies', 1, 100, 15),
  ('f1bb3106-c43b-4548-95e0-af45485488a8', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '4aa94ea6-6cbf-46f4-9fb0-9c1cde60dac5', 'Citizenship', 1, 100, 16),
  ('b5687b43-5279-42eb-9b85-ab973ab344d5', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '4aa94ea6-6cbf-46f4-9fb0-9c1cde60dac5', 'French', 2, 100, 17),
  ('fe8f3b82-4d0b-4f25-a10f-bd0b81df5989', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '4aa94ea6-6cbf-46f4-9fb0-9c1cde60dac5', 'French Language', 1, 100, 18),
  ('6e7e0c3c-9a22-407c-b6e8-9eba4f7507ed', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '4aa94ea6-6cbf-46f4-9fb0-9c1cde60dac5', 'Music', 1, 100, 19),
  ('e9366476-29cb-4f27-a64b-543d23a9269d', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '0a1ebacb-5edb-4f41-a51a-983919f676cf', 'English', 4, 100, 9),
  ('da39ce59-821b-442d-b747-416af2843e07', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '0a1ebacb-5edb-4f41-a51a-983919f676cf', 'Arts', 1, 100, 10),
  ('741524ad-8db5-4b0a-a0a0-4f29b4f63c8f', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '0a1ebacb-5edb-4f41-a51a-983919f676cf', 'Mathematics', 4, 100, 11),
  ('29499b17-03af-4328-99e0-9cb80ed1b812', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '0a1ebacb-5edb-4f41-a51a-983919f676cf', 'Science', 2, 100, 12),
  ('92fb4c43-2c2c-4dd4-96e0-d743f09f1028', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '0a1ebacb-5edb-4f41-a51a-983919f676cf', 'Social Studies', 2, 100, 13),
  ('97f1cdb4-05f9-4045-9879-c0234b6efbd3', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '0a1ebacb-5edb-4f41-a51a-983919f676cf', 'Computer Studies', 1, 100, 14),
  ('709d7628-cd7b-4ff6-9baf-490fbd301b74', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '0a1ebacb-5edb-4f41-a51a-983919f676cf', 'Citizenship', 1, 100, 15),
  ('c8c6a2ea-f1a6-4790-9dfc-f3947b9eed05', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '0a1ebacb-5edb-4f41-a51a-983919f676cf', 'French', 2, 100, 16),
  ('a9016862-1982-4c8a-b920-1725f296c5ff', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '0a1ebacb-5edb-4f41-a51a-983919f676cf', 'Physical Education', 1, 100, 17),
  ('8d68fa33-5a5c-4b30-90cb-b98bb98f01e2', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '0a1ebacb-5edb-4f41-a51a-983919f676cf', 'French Language', 1, 100, 18),
  ('03bbec41-9dca-4cce-991c-063921c0613f', '6b68407b-3d2e-426b-81ff-c4e68e66120a', '0a1ebacb-5edb-4f41-a51a-983919f676cf', 'Music', 1, 100, 19);

-- AUTO-CONTRÔLE : 45 lignes créées, et pas une de plus.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.subjects WHERE id IN (
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
  IF n <> 45 THEN
    RAISE EXCEPTION 'fusion bilingue : attendu 45 lignes, trouvé %', n;
  END IF;
END $$;

COMMIT;

-- État après coup, à relire : chaque classe bilingue et son compte de matières.
SELECT c.name AS classe,
       count(*) FILTER (WHERE s.max = 20)  AS francophones_sur_20,
       count(*) FILTER (WHERE s.max = 100) AS anglophones_sur_100,
       count(*) AS total
  FROM public.classes c
  JOIN public.subjects s ON s.class_id = c.id
 WHERE c.school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'
   AND c.name ILIKE '%BIL%'
 GROUP BY c.name
 ORDER BY c.name;
