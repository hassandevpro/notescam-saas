-- ============================================================================
-- ISOLATION ENTRE ÉTABLISSEMENTS — students, grades, fee_payments
--
--   supabase test db
--
-- POURQUOI CE FICHIER EXISTE
-- --------------------------
-- Le dépôt compte 200 fichiers `supabase_*.sql`, dont 76 définissent des
-- politiques RLS. Aucune n'était couverte par un test exécutable DANS Postgres.
-- L'édition LAN est tenue par `server/scopeGuard.js`, qui filtre `/api/db` et
-- que trois suites de tests couvrent ; en édition Cloud, la RLS tient SEULE, et
-- rien ne la vérifiait. Une politique trop permissive laisserait fuir les
-- élèves, les notes ou les versements d'un établissement vers un autre, sans
-- qu'aucun test ne s'en aperçoive.
--
-- CE QUI EST VÉRIFIÉ, TABLE PAR TABLE
--   · students      lecture réservée aux membres ; écriture à la direction
--   · grades        lecture réservée aux membres
--   · fee_payments  lecture réservée aux membres ; encaissement à la caisse ;
--                   effacement impossible pour tous
--
-- SÛRETÉ
-- ------
-- Tout le fichier est encadré par BEGIN / ROLLBACK : rien n'est conservé, même
-- si la suite échoue en cours de route. L'extension pgTAP et les aides de test
-- sont créées DANS cette transaction, donc elles ne subsistent pas — c'est la
-- recommandation explicite de leurs auteurs, qui demandent de ne pas les
-- laisser actives en production.
--
-- AUCUNE DONNÉE RÉELLE. Les identifiants sont des UUID fabriqués, les noms sont
-- « Ecole A » et « Ecole B », et aucun élève, parent ou agent réel n'apparaît.
--
-- À EXÉCUTER SUR UNE BASE LOCALE OU DE RECETTE, JAMAIS EN PRODUCTION : le test
-- écrit dans `auth.users` et dans les tables métier avant de tout annuler.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
-- Aides de Basejump (MIT) : tests.create_supabase_user, tests.authenticate_as,
-- tests.rls_enabled. Installées via dbdev :
--   select dbdev.install('basejump-supabase_test_helpers');
CREATE EXTENSION IF NOT EXISTS "basejump-supabase_test_helpers" VERSION '0.0.6';

-- 29 assertions : 3 (RLS active) + 6 (cloisonnement en lecture) + 4 (écriture)
-- + 4 (rôles internes) + 4 (caisse) + 6 (non-membres) + 2 (anonyme).
SELECT plan(29);

-- ── 0. La RLS est-elle même active ? ────────────────────────────────────────
-- Première chose à vérifier : une politique parfaite sur une table dont la RLS
-- est désactivée ne protège rien du tout.
SELECT tests.rls_enabled('public', 'students');
SELECT tests.rls_enabled('public', 'grades');
SELECT tests.rls_enabled('public', 'fee_payments');

-- ── Jeu d'essai : DEUX établissements étanches ─────────────────────────────
SELECT tests.create_supabase_user('admin_a@essai.invalid');
SELECT tests.create_supabase_user('prof_a@essai.invalid');
SELECT tests.create_supabase_user('caisse_a@essai.invalid');
SELECT tests.create_supabase_user('admin_b@essai.invalid');
SELECT tests.create_supabase_user('etranger@essai.invalid');
SELECT tests.create_supabase_user('exclu_a@essai.invalid');

-- Les écritures de préparation se font hors RLS (rôle du propriétaire).
SET LOCAL ROLE postgres;

INSERT INTO public.schools (id, name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Ecole A'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Ecole B');

-- Appartenances. `active = false` pour `exclu_a` : un compte désactivé ne doit
-- plus rien voir, et c'est un oubli classique dans une politique.
INSERT INTO public.school_users (user_id, school_id, role, active, scope_global) VALUES
  (tests.get_supabase_uid('admin_a@essai.invalid'),  'aaaaaaaa-0000-4000-8000-000000000001', 'admin',    true,  true),
  (tests.get_supabase_uid('prof_a@essai.invalid'),   'aaaaaaaa-0000-4000-8000-000000000001', 'teacher',  true,  true),
  (tests.get_supabase_uid('caisse_a@essai.invalid'), 'aaaaaaaa-0000-4000-8000-000000000001', 'caissier', true,  true),
  (tests.get_supabase_uid('admin_b@essai.invalid'),  'bbbbbbbb-0000-4000-8000-000000000002', 'admin',    true,  true),
  (tests.get_supabase_uid('exclu_a@essai.invalid'),  'aaaaaaaa-0000-4000-8000-000000000001', 'admin',    false, true);

INSERT INTO public.classes (id, school_id, name) VALUES
  ('c0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001', '6e A'),
  ('c0000000-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000002', '6e B');

INSERT INTO public.subjects (id, school_id, class_id, name, max) VALUES
  ('50000000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a', 'Maths', 20),
  ('50000000-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000b', 'Maths', 20);

INSERT INTO public.students (id, school_id, class_id, name) VALUES
  ('e0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a', 'Eleve A'),
  ('e0000000-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000b', 'Eleve B');

INSERT INTO public.grades (id, school_id, class_id, student_id, subject_id, sequence, value) VALUES
  ('60000000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000a', '50000000-0000-4000-8000-00000000000a', 1, 14),
  ('60000000-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000b', '50000000-0000-4000-8000-00000000000b', 1, 18);

INSERT INTO public.fee_payments (id, school_id, student_id, amount) VALUES
  ('70000000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', 50000),
  ('70000000-0000-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000b', 75000);

RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
--  1. L'ADMINISTRATION DE A NE VOIT QUE A
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.authenticate_as('admin_a@essai.invalid');

SELECT is(
  (SELECT count(*) FROM public.students)::int, 1,
  'students — l''admin de A ne voit qu''UN eleve au total'
);
SELECT is(
  (SELECT count(*) FROM public.students WHERE school_id = 'bbbbbbbb-0000-4000-8000-000000000002')::int, 0,
  'students — AUCUN eleve de l''ecole B ne lui est visible'
);
SELECT is(
  (SELECT count(*) FROM public.grades WHERE school_id = 'bbbbbbbb-0000-4000-8000-000000000002')::int, 0,
  'grades — AUCUNE note de l''ecole B ne lui est visible'
);
SELECT is(
  (SELECT count(*) FROM public.fee_payments WHERE school_id = 'bbbbbbbb-0000-4000-8000-000000000002')::int, 0,
  'fee_payments — AUCUN versement de l''ecole B ne lui est visible'
);
SELECT is(
  (SELECT count(*) FROM public.grades)::int, 1,
  'grades — il voit bien la note de SON etablissement'
);

-- Une lecture nominative ne doit pas davantage traverser la frontière : c'est
-- la forme d'attaque réelle, où l'on connaît déjà l'identifiant visé.
SELECT is(
  (SELECT count(*) FROM public.students WHERE id = 'e0000000-0000-4000-8000-00000000000b')::int, 0,
  'students — meme en citant son identifiant, l''eleve de B reste invisible'
);

-- ════════════════════════════════════════════════════════════════════════════
--  2. ÉCRITURE : LA FRONTIÈRE TIENT AUSSI DANS CE SENS
-- ════════════════════════════════════════════════════════════════════════════
-- Un admin de A ne doit pas pouvoir créer, modifier ni supprimer chez B.
SELECT throws_ok(
  $$ INSERT INTO public.students (id, school_id, class_id, name)
     VALUES ('e0000000-0000-4000-8000-0000000000ff', 'bbbbbbbb-0000-4000-8000-000000000002',
             'c0000000-0000-4000-8000-00000000000b', 'Intrus') $$,
  '42501',
  'students — l''admin de A ne peut pas CREER un eleve chez B'
);

SELECT is(
  (WITH t AS (UPDATE public.students SET name = 'Pirate'
              WHERE id = 'e0000000-0000-4000-8000-00000000000b' RETURNING 1)
   SELECT count(*) FROM t)::int, 0,
  'students — une modification chez B ne touche AUCUNE ligne'
);

SELECT is(
  (WITH t AS (DELETE FROM public.students
              WHERE id = 'e0000000-0000-4000-8000-00000000000b' RETURNING 1)
   SELECT count(*) FROM t)::int, 0,
  'students — une suppression chez B ne touche AUCUNE ligne'
);

-- Et l'écriture chez soi fonctionne — une isolation qui bloque tout le monde
-- serait une régression, pas une sécurité.
SELECT lives_ok(
  $$ INSERT INTO public.students (id, school_id, class_id, name)
     VALUES ('e0000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-000000000001',
             'c0000000-0000-4000-8000-00000000000a', 'Nouvel eleve A') $$,
  'students — l''admin de A cree bien un eleve CHEZ LUI'
);

-- ════════════════════════════════════════════════════════════════════════════
--  3. LES RÔLES À L'INTÉRIEUR D'UN MÊME ÉTABLISSEMENT
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.authenticate_as('prof_a@essai.invalid');

SELECT is(
  (SELECT count(*) FROM public.students WHERE school_id = 'aaaaaaaa-0000-4000-8000-000000000001')::int, 2,
  'students — un enseignant de A LIT les eleves de son etablissement'
);
SELECT is(
  (SELECT count(*) FROM public.students WHERE school_id = 'bbbbbbbb-0000-4000-8000-000000000002')::int, 0,
  'students — et rien de l''ecole B'
);

-- L'écriture sur le dossier élève est réservée à la direction (admin, censeur).
SELECT throws_ok(
  $$ INSERT INTO public.students (id, school_id, class_id, name)
     VALUES ('e0000000-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-000000000001',
             'c0000000-0000-4000-8000-00000000000a', 'Cree par un prof') $$,
  '42501',
  'students — un enseignant ne CREE pas un eleve, meme chez lui'
);

-- Le versement est un acte de caisse : un enseignant ne l'enregistre pas.
SELECT throws_ok(
  $$ INSERT INTO public.fee_payments (id, school_id, student_id, amount)
     VALUES ('70000000-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-000000000001',
             'e0000000-0000-4000-8000-00000000000a', 10000) $$,
  '42501',
  'fee_payments — un enseignant n''encaisse pas'
);

-- ════════════════════════════════════════════════════════════════════════════
--  4. LA CAISSE ENCAISSE, MAIS N'EFFACE PAS
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.authenticate_as('caisse_a@essai.invalid');

SELECT lives_ok(
  $$ INSERT INTO public.fee_payments (id, school_id, student_id, amount)
     VALUES ('70000000-0000-4000-8000-0000000000a4', 'aaaaaaaa-0000-4000-8000-000000000001',
             'e0000000-0000-4000-8000-00000000000a', 25000) $$,
  'fee_payments — la caisse de A encaisse chez elle'
);

SELECT throws_ok(
  $$ INSERT INTO public.fee_payments (id, school_id, student_id, amount)
     VALUES ('70000000-0000-4000-8000-0000000000b4', 'bbbbbbbb-0000-4000-8000-000000000002',
             'e0000000-0000-4000-8000-00000000000b', 25000) $$,
  '42501',
  'fee_payments — la caisse de A n''encaisse PAS chez B'
);

-- UPDATE et DELETE sont révoqués pour tous : un versement encaissé ne
-- s'efface pas, c'est l'intégrité de la comptabilite de l'école.
SELECT throws_ok(
  $$ DELETE FROM public.fee_payments WHERE id = '70000000-0000-4000-8000-00000000000a' $$,
  '42501',
  'fee_payments — un versement ne peut pas etre SUPPRIME'
);
SELECT throws_ok(
  $$ UPDATE public.fee_payments SET amount = 1 WHERE id = '70000000-0000-4000-8000-00000000000a' $$,
  '42501',
  'fee_payments — un versement ne peut pas etre MODIFIE'
);

-- ════════════════════════════════════════════════════════════════════════════
--  5. QUI N'EST PAS MEMBRE NE VOIT RIEN
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.authenticate_as('etranger@essai.invalid');

SELECT is((SELECT count(*) FROM public.students)::int,     0, 'students — un compte sans etablissement ne voit AUCUN eleve');
SELECT is((SELECT count(*) FROM public.grades)::int,        0, 'grades — ni AUCUNE note');
SELECT is((SELECT count(*) FROM public.fee_payments)::int,  0, 'fee_payments — ni AUCUN versement');

-- Un compte DÉSACTIVÉ est un ancien membre : il ne doit plus rien voir.
SELECT tests.authenticate_as('exclu_a@essai.invalid');

SELECT is((SELECT count(*) FROM public.students)::int,    0, 'students — un compte DESACTIVE ne voit plus rien');
SELECT is((SELECT count(*) FROM public.grades)::int,       0, 'grades — ni les notes de son ancien etablissement');
SELECT is((SELECT count(*) FROM public.fee_payments)::int, 0, 'fee_payments — ni les versements');

-- ════════════════════════════════════════════════════════════════════════════
--  6. LE VISITEUR ANONYME
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL ROLE anon;

SELECT is((SELECT count(*) FROM public.students)::int,    0, 'students — un visiteur anonyme ne voit AUCUN eleve');
SELECT is((SELECT count(*) FROM public.fee_payments)::int, 0, 'fee_payments — ni aucun versement');

SELECT * FROM finish();
ROLLBACK;
