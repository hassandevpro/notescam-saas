-- ════════════════════════════════════════════════════════════════════════════
-- ÉTABLISSEMENT DE DÉMONSTRATION — « COLLÈGE LA RETRAITE » (édition CLOUD)
--
-- Établissement de TEST 100 % FICTIF destiné à l'enregistrement des vidéos de
-- formation. Crée SA PROPRE école (id figé ci-dessous) : n'affecte JAMAIS
-- MAARIF, LA RÉUSSITE ni aucun autre établissement.
--
--   • 16 comptes de connexion : les 13 rôles de direction que l'application
--     connaît (admin, censeur, surveillant + les 10 rôles de gouvernance)
--     + 3 enseignants (maternelle / primaire / secondaire) ;
--   • 3 unités pédagogiques, 13 classes, 232 élèves, ~10 000 notes ;
--   • scolarité, budget annuel avec circuit d'approbation, RH/paie,
--     vie scolaire, patrimoine, signalements, emploi du temps.
--
-- Instantané : année 2025-2026, au 30 juin 2026 (T1/T2 clos, T3 actif,
-- séquences 1-5 saisies, séquence 6 à ~70 %). Toutes les dates sont passées.
--
-- Mot de passe commun à tous les comptes : Retraite2026!
--
-- Idempotent : purge en tête, ré-exécutable à l'identique.
-- À coller dans Supabase → SQL Editor → New query → Run.
--
-- Miroir LAN      : scripts/seed-college-la-retraite.mjs
-- Nettoyage       : supabase/seed_college_la_retraite_cleanup.sql
-- Validation      : supabase/seed_college_la_retraite_validate.sql
-- Comptes & plans de tournage : docs/DEMO_COLLEGE_LA_RETRAITE.md
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
SELECT setseed(0.20260630);

-- ════ PURGE — FK-safe (enfants d'abord). L'école étant créée par ce script,
--      on purge simplement par school_id : aucun risque pour les autres écoles.
DO $$
DECLARE
  v_school uuid := '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8';
  t text;
  tables text[] := ARRAY[
    'audit_events','domain_events','notification_outbox','notifications',
    'signalement_comments','signalement_history','signalements',
    'asset_expenses','asset_repairs','asset_breakdowns','assets',
    'hr_payroll_items','hr_payroll','hr_payroll_catalog','hr_attendance',
    'hr_career_events','hr_evaluations','hr_leaves','hr_contracts',
    'exit_permissions','parent_meetings','student_detentions','student_warnings',
    'disciplinary_actions','disciplinary_incidents','late_arrivals','discipline_statistics',
    'budget_line_reallocations','budget_unlock_requests','budget_expenses',
    'budget_line_sectors','budget_line_periods','budget_revisions',
    'budget_reallocations','budget_chapters','budgets','budget_periods',
    'cash_sessions','fee_payments','student_fee_items','student_fees',
    'class_fee_grids','fee_catalog',
    'attendance','student_absences','student_class_assignments','timetable_slots',
    'grades','students','subjects','classes',
    'sequence_dates','academic_periods',
    'staff','teachers','school_units',
    'governance_role_history','user_governance_roles','governance_roles',
    'school_messages','teacher_notifications','school_users'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE school_id = %L', t, v_school);
    END IF;
  END LOOP;
END $$;
DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@laretraite.demo');
DELETE FROM auth.users      WHERE email LIKE '%@laretraite.demo';

-- ════ ÉCOLE ════
INSERT INTO schools (
  id, name, type, region, division, subdivision, address, phone, director, email,
  current_year, currency, language, country_system, grade_entry_mode,
  bulletin_engine, bulletin_subject_mode, bulletin_bilingual,
  budget_validation, censeur_name, surveillant_name, niu, cnps_number,
  plan, license_status, license_expires_at
) VALUES (
  '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', 'COLLÈGE LA RETRAITE', 'prive_confessionnel',
  'Centre', 'Mfoundi', 'Yaoundé III', 'Quartier Nsimeyong, BP 4127 — Yaoundé',
  '+237 222 31 45 60', 'Mme AWONO Marie-Thérèse', 'contact@laretraite.demo',
  -- `language` est contraint à francophone|anglophone|bilingue (schools_language_check) :
  -- 'fr' était refusé et faisait échouer tout le seed dès la création de l'école.
  '2025-2026', 'XAF', 'francophone', 'cameroon_fr', 'principal',
  'classic', 'synthetic', true,
  true, 'M. TABI Serge', 'M. BELLO Achille', 'M012600123456X', '0-12345-6',
  -- `plan` est contraint à starter|ecole|pro|reseau (schools_plan_check) :
  -- 'premium' n'existe pas. 'reseau' est le plan du complexe scolaire, cohérent
  -- avec les 3 unités pédagogiques que ce seed met en place.
  'reseau', 'active', now() + interval '365 days'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, director = EXCLUDED.director, current_year = EXCLUDED.current_year,
  budget_validation = EXCLUDED.budget_validation, bulletin_engine = EXCLUDED.bulletin_engine;

-- Pilotage MANUEL des périodes : l'instantané fait foi, pas la date du jour.
UPDATE schools SET period_mode = 'manual' WHERE id = '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8';

-- ════ CATALOGUE DE GOUVERNANCE (10 rôles) ════
-- Les 9 rôles « système » via la fonction officielle, puis le Contrôleur (qui
-- n'est amorcé que par supabase_h4_remote_governance.sql pour les écoles
-- existantes) : sans lui, le compte Contrôleur n'aurait ni menu ni droit.
SELECT public.seed_governance_catalog('8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8');

INSERT INTO governance_roles (school_id, code, name, description, rank, scope, permissions, pages, dashboards, workflows, active, is_system)
VALUES ('8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', 'controleur', 'Contrôleur',
  'Consultation et audit à distance (aucune approbation par défaut).', 70, 'complex',
  '["governance.view","budget.view","expense.view"]'::jsonb,
  '["/app/groupe","/app/reports","/app/budgets","/app/budget-global","/app/depenses"]'::jsonb,
  '["group","budget-global"]'::jsonb, '[]'::jsonb, true, true)
ON CONFLICT (school_id, code) DO NOTHING;

-- Ajustements rendant le circuit RÉELLEMENT rejouable devant la caméra :
--   • Coordonnateur & RAF doivent pouvoir approuver/rejeter une dépense ;
--   • la Caissière doit pouvoir en SAISIR et en SOUMETTRE (le jeu de données
--     lui en fait soumettre quatre : CAS A, C, E, G).
UPDATE governance_roles SET permissions = (
    SELECT jsonb_agg(DISTINCT p ORDER BY p)
    FROM jsonb_array_elements_text(permissions || '["expense.approve","expense.reject","budget.approve"]'::jsonb) p)
WHERE school_id = '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND code = 'coordonnateur_general';
UPDATE governance_roles SET permissions = (
    SELECT jsonb_agg(DISTINCT p ORDER BY p)
    FROM jsonb_array_elements_text(permissions || '["expense.approve","expense.reject"]'::jsonb) p)
WHERE school_id = '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND code = 'raf';
UPDATE governance_roles SET permissions = (
    SELECT jsonb_agg(DISTINCT p ORDER BY p)
    FROM jsonb_array_elements_text(permissions || '["expense.prepare","expense.submit"]'::jsonb) p)
WHERE school_id = '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND code = 'caissier';

-- ════ LES 16 COMPTES ════
-- `base_role` = school_users.role (le seul rôle que connaît l'authentification).
-- `gov_role`  = rôle de gouvernance ADDITIF, qui pilote menus, permissions et
-- validations. Un compte « Fondatrice » est donc un admin porteur du rôle
-- `fondatrice` ; un « Principal » est un censeur porteur du rôle `principal`.
CREATE TEMP TABLE _acct (
  k text, email text, full_name text, base_role text, gov_role text,
  remote bool, gender text, dept text, fonction text, salary bigint, cycle text, specialty text
) ON COMMIT DROP;
INSERT INTO _acct VALUES
 ('admin',       'admin@laretraite.demo',            'M. ONANA Célestin',        'admin',       NULL,                           false,'Masculin','administration','Administrateur système',                       320000, NULL, NULL),
 ('fondatrice',  'fondatrice@laretraite.demo',       'Mme AWONO Marie-Thérèse',  'admin',      'fondatrice',                    true, 'Feminin', 'administration','Fondatrice',                                   750000, NULL, NULL),
 ('coordo',      'coordonnateur@laretraite.demo',    'M. MBALLA Emmanuel',       'censeur',    'coordonnateur_general',         true, 'Masculin','administration','Coordonnateur Général',                        600000, NULL, NULL),
 ('raf',         'raf@laretraite.demo',              'M. FOTSO Landry',          'censeur',    'raf',                           true, 'Masculin','comptabilite',  'Responsable Administratif et Financier',       480000, NULL, NULL),
 ('controleur',  'controleur@laretraite.demo',       'M. ONDOA Guy',             'censeur',    'controleur',                    true, 'Masculin','administration','Contrôleur de gestion',                        420000, NULL, NULL),
 ('principal',   'principal@laretraite.demo',        'M. NJOYA Blaise',          'censeur',    'principal',                     false,'Masculin','administration','Principal du Collège',                         450000, NULL, NULL),
 ('vice',        'vice.principal@laretraite.demo',   'M. ESSOMBA Rodrigue',      'censeur',    'vice_principal',                false,'Masculin','administration','Vice-principal',                               380000, NULL, NULL),
 ('dirprim',     'dir.primaire@laretraite.demo',     'Mme ETOA Chantal',         'censeur',    'directrice_primaire',           false,'Feminin', 'administration','Directrice du Primaire',                       420000, NULL, NULL),
 ('dirprimadj',  'dir.adj.primaire@laretraite.demo', 'Mme NGO BELL Prisca',      'censeur',    'directrice_adjointe_primaire',  false,'Feminin', 'administration','Directrice adjointe du Primaire',              350000, NULL, NULL),
 ('respmat',     'resp.maternelle@laretraite.demo',  'Mme MANGA Odile',          'censeur',    'responsable_maternelle',        false,'Feminin', 'administration','Responsable de la Maternelle',                 380000, NULL, NULL),
 ('caissiere',   'caissiere@laretraite.demo',        'Mme ABENA Carine',         'censeur',    'caissier',                      false,'Feminin', 'comptabilite',  'Caissière',                                    260000, NULL, NULL),
 ('censeur',     'censeur@laretraite.demo',          'M. TABI Serge',            'censeur',     NULL,                           false,'Masculin','administration','Censeur',                                      400000, NULL, NULL),
 ('surveillant', 'surveillant@laretraite.demo',      'M. BELLO Achille',         'surveillant', NULL,                           false,'Masculin','surveillance',  'Surveillant Général',                          300000, NULL, NULL),
 ('ens_mat',     'ens.maternelle@laretraite.demo',   'Mme ABANDA Clarisse',      'teacher',     NULL,                           false,'Feminin', 'enseignants',   'Enseignante — Maternelle',                     220000, 'maternelle','Préscolaire'),
 ('ens_prim',    'ens.primaire@laretraite.demo',     'M. NKOULOU Bertrand',      'teacher',     NULL,                           false,'Masculin','enseignants',   'Enseignant — Primaire',                        240000, 'primaire',  'Polyvalent primaire'),
 ('ens_sec',     'ens.secondaire@laretraite.demo',   'Mme TCHUENTE Léonie',      'teacher',     NULL,                           false,'Feminin', 'enseignants',   'Enseignante — Secondaire',                     280000, 'college',   'Mathématiques');

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       a.email, crypt('Retraite2026!', gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', a.full_name)
FROM _acct a
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(a.email));

INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
SELECT gen_random_uuid(), u.id, 'email', u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
FROM auth.users u JOIN _acct a ON lower(a.email) = lower(u.email)
WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email');

INSERT INTO school_users (id, school_id, user_id, role, full_name, active, remote_access_allowed, device_id)
SELECT gen_random_uuid(), '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', u.id, a.base_role, a.full_name,
       true, a.remote, 'seed-laretraite-v1'
FROM _acct a JOIN auth.users u ON lower(u.email) = lower(a.email);

INSERT INTO user_governance_roles (id, school_id, user_id, role, sector, status, start_date, device_id)
SELECT gen_random_uuid(), '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', u.id, a.gov_role,
       (SELECT gr.sector FROM governance_roles gr
         WHERE gr.school_id = '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND gr.code = a.gov_role LIMIT 1),
       'active', DATE '2025-09-01', 'seed-laretraite-v1'
FROM _acct a JOIN auth.users u ON lower(u.email) = lower(a.email)
WHERE a.gov_role IS NOT NULL;

INSERT INTO governance_role_history (school_id, user_id, role_code, action, start_date, actor_name, at)
SELECT '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', u.id, a.gov_role, 'assigned', DATE '2025-09-01',
       'M. ONANA Célestin', TIMESTAMPTZ '2025-09-01 08:00'
FROM _acct a JOIN auth.users u ON lower(u.email) = lower(a.email)
WHERE a.gov_role IS NOT NULL;

-- ════ UNITÉS PÉDAGOGIQUES ════
-- `section_key` suit classSectionKey() (src/core/engineResolver.js) : c'est lui
-- qui fait porter à un bulletin l'identité de SON unité.
INSERT INTO school_units (id, school_id, section_key, name, short_name, director, address, phone, email, motto, establishment_no, color_primary, color_secondary, position)
VALUES
 (gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8','maternelle',   'École Maternelle La Retraite','Maternelle','Mme MANGA Odile', 'Quartier Nsimeyong, Yaoundé','+237 222 31 45 60','maternelle@laretraite.demo','Travail — Discipline — Réussite','CE/2000/YDE','#e11d48','#0f172a',1),
 (gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8','primaire',     'École Primaire La Retraite',  'Primaire',  'Mme ETOA Chantal','Quartier Nsimeyong, Yaoundé','+237 222 31 45 60','primaire@laretraite.demo',  'Travail — Discipline — Réussite','CE/2001/YDE','#2563eb','#0f172a',2),
 (gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8','premier_cycle','Collège La Retraite',         'Collège',   'M. NJOYA Blaise', 'Quartier Nsimeyong, Yaoundé','+237 222 31 45 60','college@laretraite.demo',   'Travail — Discipline — Réussite','CE/2002/YDE','#059669','#0f172a',3);

-- ════ ENSEIGNANTS (3, un par cycle) & PERSONNEL (16) ════
-- (pas de colonne `active` sur teachers au cloud — le statut porte l'info)
INSERT INTO teachers (id, school_id, name, email, gender, matricule, specialty, fonction, hire_date, status, device_id)
SELECT gen_random_uuid(), '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', a.full_name, a.email, a.gender,
       'ENS-2025-'||lpad((row_number() OVER (ORDER BY a.k))::text, 3, '0'),
       a.specialty, a.fonction, DATE '2021-09-01', 'actif', 'seed-laretraite-v1'
FROM _acct a WHERE a.base_role = 'teacher';

-- Rattache chaque profil pédagogique à son compte d'authentification.
UPDATE teachers t SET auth_user_id = u.id
FROM auth.users u
WHERE t.school_id = '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND lower(t.email) = lower(u.email);

INSERT INTO staff (id, school_id, matricule, name, gender, email, address, fonction, department,
                   hire_date, status, active, auth_user_id,
                   convention_collective, categorie_echelon, situation_familiale, device_id)
SELECT gen_random_uuid(), '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8',
       'PERS-'||lpad((row_number() OVER (ORDER BY a.k))::text, 3, '0'),
       a.full_name, a.gender, a.email, 'Yaoundé, Cameroun', a.fonction, a.dept,
       DATE '2021-09-01', 'actif', true, u.id,
       'Enseignement privé laïc et confessionnel', '6/B', 'marié(e)', 'seed-laretraite-v1'
FROM _acct a JOIN auth.users u ON lower(u.email) = lower(a.email);

-- ════ PÉRIODES (3 trimestres + 6 séquences) ════
-- T1/T2 clos, T3 actif ; séquences 1-5 closes, séquence 6 active.
-- is_locked = false PARTOUT : rien ne doit bloquer une saisie pendant une démo.
WITH t AS (
  INSERT INTO academic_periods (school_id, school_year, type, name, sequence_order, status, is_locked, teaching_start, teaching_end, device_id)
  SELECT '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8','2025-2026','trimestre', v.name, v.ord, v.status, false, v.ts::date, v.te::date,'seed-laretraite-v1'
  FROM (VALUES ('1er Trimestre',1,'closed','2025-09-08','2025-12-05'),
               ('2e Trimestre', 2,'closed','2026-01-05','2026-03-27'),
               ('3e Trimestre', 3,'active','2026-04-06','2026-07-03')) v(name,ord,status,ts,te)
  RETURNING id, sequence_order)
INSERT INTO academic_periods (school_id, school_year, type, parent_id, name, sequence_order, status, is_locked, teaching_end, entry_deadline, device_id)
SELECT '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8','2025-2026','sequence', t.id,'Séquence '||sq.g, sq.g, sq.status, false, sq.exam::date, sq.dl::date,'seed-laretraite-v1'
FROM (VALUES (1,1,'closed','2025-10-20','2025-10-27'),(2,1,'closed','2025-11-24','2025-12-01'),
             (3,2,'closed','2026-01-26','2026-02-02'),(4,2,'closed','2026-03-09','2026-03-16'),
             (5,3,'closed','2026-05-04','2026-05-11'),(6,3,'active','2026-06-15','2026-06-22')) sq(g,trim,status,exam,dl)
JOIN t ON t.sequence_order = sq.trim;

INSERT INTO sequence_dates (school_id, seq_key, seq_label, exam_date, deadline_date, conseil_date, device_id)
SELECT '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8','seq'||d.g,'Séquence '||d.g, d.exam::date, d.dl::date, (d.dl::date + 7),'seed-laretraite-v1'
FROM (VALUES (1,'2025-10-20','2025-10-27'),(2,'2025-11-24','2025-12-01'),(3,'2026-01-26','2026-02-02'),
             (4,'2026-03-09','2026-03-16'),(5,'2026-05-04','2026-05-11'),(6,'2026-06-15','2026-06-22')) d(g,exam,dl);

-- ════ CLASSES (13) ════
-- `section` reprend le vocabulaire des secteurs budgétaires (budgetUi.SECTOR_LABELS) ;
-- `birth` = année de naissance « à l'heure » du niveau, utilisée plus bas.
CREATE TEMP TABLE _cls_def (name text, level text, ukey text, section text, n int, birth int) ON COMMIT DROP;
INSERT INTO _cls_def VALUES
 ('Petite Section','PS','maternelle','maternelle',12,2022),
 ('Moyenne Section','MS','maternelle','maternelle',12,2021),
 ('Grande Section','GS','maternelle','maternelle',12,2020),
 ('SIL','SIL','primaire','primaire',18,2019),
 ('CP','CP','primaire','primaire',18,2018),
 ('CE1','CE1','primaire','primaire',18,2017),
 ('CE2','CE2','primaire','primaire',18,2016),
 ('CM1','CM1','primaire','primaire',18,2015),
 ('CM2','CM2','primaire','primaire',18,2014),
 ('6e','6e','college','college',22,2013),
 ('5e','5e','college','college',22,2012),
 ('4e','4e','college','college',22,2011),
 ('3e','3e','college','college',22,2010);

INSERT INTO classes (id, school_id, name, system, level, cycle, section, evaluation_mode, current_year, year, unit_id, teacher_id, max_students, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', d.name,'FR', d.level, d.ukey, d.section,'notes','2025-2026','2025-2026',
  (SELECT su.id FROM school_units su WHERE su.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8'
     AND su.section_key = CASE d.ukey WHEN 'college' THEN 'premier_cycle' ELSE d.ukey END),
  (SELECT t.id FROM teachers t JOIN _acct a ON lower(a.email)=lower(t.email)
     WHERE t.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND a.cycle = d.ukey),
  45, 'seed-laretraite-v1'
FROM _cls_def d;

-- ════ MATIÈRES ════
INSERT INTO subjects (id, school_id, class_id, name, short, coef, max, max_grade, year, position, teacher_id, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', c.id, m.name, m.short, m.coef, 20, 20,'2025-2026', m.pos, c.teacher_id,'seed-laretraite-v1'
FROM classes c JOIN (VALUES
 ('maternelle','Langage oral','LANG',2,1),('maternelle','Graphisme & Écriture','GRAPH',2,2),('maternelle','Mathématiques','MATH',2,3),
 ('maternelle','Découverte du monde','DECOU',1,4),('maternelle','Éveil artistique','EVEIL',1,5),('maternelle','Motricité','MOTRI',1,6),
 ('primaire','Français','FR',4,1),('primaire','Mathématiques','MATH',4,2),('primaire','Anglais','ANG',2,3),
 ('primaire','Sciences d''Observation','SCI',2,4),('primaire','Histoire-Géographie','HG',2,5),
 ('primaire','Éducation Civique et Morale','ECM',1,6),('primaire','EPS','EPS',1,7),
 ('college','Français','FR',4,1),('college','Anglais','ANG',3,2),('college','Mathématiques','MATH',4,3),
 ('college','SVT','SVT',2,4),('college','Physique-Chimie-Technologie','PCT',3,5),('college','Histoire-Géographie','HG',2,6),
 ('college','Éducation Civique et Morale','ECM',1,7),('college','Informatique','INFO',1,8),('college','EPS','EPS',1,9)
) m(sect,name,short,coef,pos) ON m.sect = c.section
WHERE c.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND c.device_id='seed-laretraite-v1';

-- ════ ÉLÈVES (232 : 36 maternelle + 108 primaire + 88 collège) ════
WITH gen AS (
  SELECT c.id class_id, c.name cname, c.section, d.birth,
         (row_number() OVER (ORDER BY c.name, g))::int rn, g
  FROM classes c JOIN _cls_def d ON d.name = c.name
  CROSS JOIN LATERAL generate_series(1, d.n) g
  WHERE c.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND c.device_id='seed-laretraite-v1')
INSERT INTO students (id, school_id, class_id, name, reg, gender, dob, matricule, statut, statut_etablissement, year, created_at, updated_at, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', gen.class_id,
  (ARRAY['NKOLO','MBALLA','TCHOUA','FOTSO','KAMDEM','NGONO','ESSOMBA','MANGA','EKWALLA','NJOYA','NDONGO','ABENA','ETOA','ONANA','TABI','ZE','BELLO','AYISSI','NANA','TALLA','SOP','DIBOM','EYENGA','MFEGE','NJIKE','OWONA','BIKORO','NGUEMA','ATANGANA','ELA'])[((rn*7)%30)+1]
  ||' '||
  (CASE WHEN g%2=1
     THEN (ARRAY['Jean','Paul','Samuel','Emmanuel','Éric','Franck','Serge','Landry','Cédric','Blaise','Boris','Yannick','Rodrigue','Achille','Guy','Hervé','Armand','Ghislain','Pierre','Bruno'])[(rn%20)+1]
     ELSE (ARRAY['Marie','Christine','Solange','Brigitte','Estelle','Carine','Nadège','Laure','Prisca','Rachel','Sandrine','Vanessa','Larissa','Chantal','Odile','Bertille','Mireille','Josiane','Yolande','Flore'])[(rn%20)+1] END),
  '', CASE WHEN g%2=1 THEN 'Masculin' ELSE 'Feminin' END,
  -- ~1 élève sur 7 a un an de plus que l'âge théorique du niveau.
  make_date((gen.birth - CASE WHEN g%7=1 THEN 1 ELSE 0 END)::int, ((rn%12)+1)::int, ((rn%27)+1)::int),
  'ELV-2025-'||lpad(rn::text,4,'0'),
  -- `statut` est CONTRAINT en base : nouveau | redoublant | transfere (sprint23).
  CASE WHEN rn%9=0 THEN 'redoublant' WHEN rn%23=0 THEN 'transfere' ELSE 'nouveau' END,
  CASE WHEN g%4=1 THEN 'nouveau' ELSE 'ancien' END,
  '2025-2026', (DATE '2025-09-01' + (rn%28))::timestamptz, now(),'seed-laretraite-v1'
FROM gen;

INSERT INTO student_class_assignments (id, school_id, student_id, class_id, class_name, assigned_at, date_debut, section, school_unit_id, type_transfert, commentaire, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', s.id, s.class_id, c.name, s.created_at, s.created_at::date, c.section, c.unit_id,
  CASE WHEN s.statut_etablissement='nouveau' THEN 'inscription' ELSE 'reinscription' END,
  CASE WHEN s.statut_etablissement='nouveau' THEN 'Première inscription dans l''établissement' ELSE 'Réinscription' END,
  'seed-laretraite-v1'
FROM students s JOIN classes c ON c.id = s.class_id
WHERE s.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND s.device_id='seed-laretraite-v1';

-- ════ NOTES — séquences 1-5 complètes, séquence 6 à ~70 %, ~3 % d'absents (NULL) ════
INSERT INTO grades (id, school_id, class_id, student_id, subject_id, sequence, value, year, updated_at, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', s.class_id, s.id, sub.id, seq.n,
  CASE WHEN hv%33=0 THEN NULL
       ELSE (5 + hv%15)::text || CASE WHEN hv%3=0 THEN '.5' ELSE '' END END,
  '2025-2026', now(),'seed-laretraite-v1'
FROM students s
JOIN subjects sub ON sub.class_id = s.class_id AND sub.device_id='seed-laretraite-v1'
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6)) seq(n)
CROSS JOIN LATERAL (SELECT ('x'||substr(md5(s.id::text||sub.id::text||seq.n::text),1,7))::bit(28)::int hv) h
WHERE s.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND s.device_id='seed-laretraite-v1'
  AND NOT (seq.n = 6 AND hv%10 < 3);

-- ════ CONSEIL DE CLASSE — assiduité, conduite, distinctions, décisions ════
-- `conduite` = CODE attendu par le bulletin (TB|B|AB|P|M) ;
-- `decision` = CODE contraint en base (admis|redoublant|renvoye), laissé NULL
-- pour la majorité afin que le bulletin la déduise de la moyenne.
INSERT INTO student_absences (id, school_id, class_id, student_id, sequence, abs_j, abs_nj, conduite,
                              th, encouragement, felicitation, aver_travail, aver_conduite, decision, appreciation, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', s.class_id, s.id, seq.n,
  (hv%7), (hv%4),
  CASE WHEN (hv%4) > 2 THEN 'P' WHEN hv%9=0 THEN 'TB' WHEN hv%5=0 THEN 'AB' ELSE 'B' END,
  (hv%8=0), (hv%6=0), (hv%13=0), (hv%15=0)::int::smallint, ((hv%4)>2)::int::smallint,
  CASE WHEN seq.n < 6 AND hv%4=0 THEN 'admis' ELSE NULL END,
  (ARRAY['Élève sérieux(se) et régulier(ère). Continuez.',
         'Des résultats en progression, encore un effort à l''oral.',
         'Trimestre correct, attention à l''assiduité.',
         'Bon niveau d''ensemble, participation à renforcer.'])[(hv%4)+1],
  'seed-laretraite-v1'
FROM students s
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6)) seq(n)
CROSS JOIN LATERAL (SELECT ('x'||substr(md5(s.id::text||'abs'||seq.n::text),1,7))::bit(28)::int hv) h
WHERE s.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND s.device_id='seed-laretraite-v1'
  AND NOT (seq.n = 6 AND hv%2 = 0);

-- ════ EMPLOI DU TEMPS — semaine complète pour GS, CM2 et 6e ════
INSERT INTO timetable_slots (id, school_id, class_id, subject_id, teacher_id, day_of_week, start_time, end_time, label, academic_year, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', c.id, sub.id, c.teacher_id,
  d.day, cr.st::time, cr.en::time, sub.name,'2025-2026','seed-laretraite-v1'
FROM classes c
JOIN LATERAL (SELECT count(*)::int n FROM subjects s WHERE s.class_id = c.id AND s.device_id='seed-laretraite-v1') k ON k.n > 0
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) d(day)
CROSS JOIN (VALUES ('07:30','08:25',1),('08:25','09:20',2),('09:35','10:30',3),
                   ('10:30','11:25',4),('12:30','13:25',5),('13:25','14:20',6)) cr(st,en,i)
-- Matière du créneau : rotation déterministe sur les matières de la classe.
JOIN LATERAL (SELECT s.id, s.name FROM subjects s
   WHERE s.class_id = c.id AND s.device_id='seed-laretraite-v1'
     AND s.position = ((d.day*3 + cr.i) % k.n) + 1) sub ON true
WHERE c.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND c.device_id='seed-laretraite-v1'
  AND c.name IN ('Grande Section','CM2','6e')
  -- mercredi et vendredi après-midi libres (usage courant au Cameroun)
  AND NOT (d.day IN (3,5) AND cr.i >= 5);

-- ════ SCOLARITÉ — catalogue, grilles tarifaires, pension, encaissements ════
INSERT INTO fee_catalog (id, school_id, name, category, amount, academic_year, mandatory, optional, payment_type, active, position, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', v.name, v.cat, v.amt,'2025-2026', v.mand, NOT v.mand, v.pt, true, v.pos,'seed-laretraite-v1'
-- `category` doit appartenir à FEE_CATEGORIES (src/lib/feeCatalogEngine.js).
FROM (VALUES
 ('Uniforme scolaire','tenue',18000,true,'unique',1),
 ('Assurance scolaire','assurance',4000,true,'unique',2),
 ('Cotisation APEE','apee',10000,true,'unique',3),
 ('Fournitures & manuels','bibliotheque',22000,true,'unique',4),
 ('Carte scolaire','autre',2000,true,'unique',5),
 ('Cantine','cantine',55000,false,'echelonne',6),
 ('Transport scolaire','transport',45000,false,'echelonne',7),
 ('Sortie pédagogique','sortie',7500,false,'unique',8)
) v(name,cat,amt,mand,pt,pos);

INSERT INTO class_fee_grids (id, school_id, class_id, academic_year, amount_inscription, amount_comptant, amount_echelonne, tranches, currency, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', c.id,'2025-2026', a.insc, a.annuel, a.annuel + 5000,
  jsonb_build_array(
    jsonb_build_object('id','T1','label','1ère tranche','amount',round(a.annuel*0.4),'due_date','2025-10-15'),
    jsonb_build_object('id','T2','label','2e tranche','amount',round(a.annuel*0.3),'due_date','2026-01-15'),
    jsonb_build_object('id','T3','label','3e tranche','amount',a.annuel-round(a.annuel*0.4)-round(a.annuel*0.3),'due_date','2026-04-15')),
  'XAF','seed-laretraite-v1'
FROM classes c CROSS JOIN LATERAL (SELECT
   CASE c.section WHEN 'maternelle' THEN 120000 WHEN 'primaire' THEN 150000 ELSE 200000 END annuel,
   CASE c.section WHEN 'maternelle' THEN 25000  WHEN 'primaire' THEN 30000  ELSE 35000  END insc) a
WHERE c.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND c.device_id='seed-laretraite-v1';

-- 5 profils de recouvrement : rien payé / 30 % / 55 % / 80 % / soldé.
CREATE TEMP TABLE _stf ON COMMIT DROP AS
SELECT s.id student_id, s.class_id, c.section,
  (CASE c.section WHEN 'maternelle' THEN 120000 WHEN 'primaire' THEN 150000 ELSE 200000 END)::int annuel,
  ('x'||substr(md5(s.id::text||'fee'),1,7))::bit(28)::int hv
FROM students s JOIN classes c ON c.id = s.class_id
WHERE s.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND s.device_id='seed-laretraite-v1';
ALTER TABLE _stf ADD COLUMN bucket int; UPDATE _stf SET bucket = hv % 5;
ALTER TABLE _stf ADD COLUMN paye int;   UPDATE _stf SET paye = round(annuel * (ARRAY[0,0.30,0.55,0.80,1.0])[bucket+1])::int;

INSERT INTO student_fees (id, school_id, student_id, academic_year, frais_annuels, frais_payes, date_dernier_paiement, payment_mode, tranches, adjustments, created_at, updated_at, version, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', student_id,'2025-2026', annuel, paye,
  CASE WHEN paye > 0 THEN (DATE '2025-10-05' + (hv%200))::date ELSE NULL END,
  CASE WHEN bucket >= 3 THEN 'echelonne' ELSE 'comptant' END,
  '[]'::jsonb,'[]'::jsonb, now(), now(), 1,'seed-laretraite-v1'
FROM _stf;

-- Versements de PENSION (sans student_fee_item_id) : deux pour les échelonnés,
-- un seul sinon. `receipt_no` est attribué par le trigger allocate_receipt_no() :
-- on ne le fixe surtout pas ici.
INSERT INTO fee_payments (id, school_id, student_id, academic_year, amount, date, note, recorded_by, recorded_by_name, updated_at, version, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', student_id,'2025-2026',
  CASE WHEN part = 1 THEN (CASE WHEN bucket >= 3 THEN round(paye*0.6)::int ELSE paye END)
       ELSE paye - round(paye*0.6)::int END,
  (DATE '2025-10-05' + (hv%200) + (part-1)*60)::date,
  'Versement scolarité 2025-2026',
  (SELECT id FROM auth.users WHERE email='caissiere@laretraite.demo'),'Mme ABENA Carine',
  now(), 1,'seed-laretraite-v1'
FROM _stf CROSS JOIN LATERAL generate_series(1, CASE WHEN bucket >= 3 THEN 2 ELSE 1 END) part
WHERE paye > 0;

-- Frais annexes obligatoires. `status` est un CYCLE DE VIE ('active'|'removed'),
-- PAS un état de paiement : celui-ci est CALCULÉ par feeCatalogEngine à partir
-- des versements rattachés (student_fee_item_id).
INSERT INTO student_fee_items (id, school_id, student_id, fee_catalog_id, academic_year, name, category, amount, mandatory, payment_type, status, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', st.student_id, fc.id,'2025-2026', fc.name, fc.category, fc.amount, true, fc.payment_type,
  'active','seed-laretraite-v1'
FROM _stf st JOIN fee_catalog fc ON fc.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND fc.device_id='seed-laretraite-v1' AND fc.mandatory;

-- Versements RATTACHÉS à un frais annexe → soldé (bucket 4) ou partiel (bucket 3).
-- Les autres élèves restent impayés sur leurs annexes : les trois états
-- coexistent à l'écran.
INSERT INTO fee_payments (id, school_id, student_id, student_fee_item_id, academic_year, amount, date, note, recorded_by, recorded_by_name, updated_at, version, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', st.student_id, sfi.id,'2025-2026',
  CASE WHEN st.bucket = 4 THEN sfi.amount ELSE round(sfi.amount/2.0)::int END,
  (DATE '2025-10-10' + (st.hv%180))::date,'Frais annexes — '||sfi.name,
  (SELECT id FROM auth.users WHERE email='caissiere@laretraite.demo'),'Mme ABENA Carine',
  now(), 1,'seed-laretraite-v1'
FROM _stf st
JOIN student_fee_items sfi ON sfi.student_id = st.student_id AND sfi.device_id='seed-laretraite-v1' AND sfi.mandatory
WHERE st.bucket >= 3;

-- ~1 élève sur 3 souscrit une option (cantine / transport / sortie), non payée.
INSERT INTO student_fee_items (id, school_id, student_id, fee_catalog_id, academic_year, name, category, amount, mandatory, payment_type, status, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', st.student_id, fc.id,'2025-2026', fc.name, fc.category, fc.amount, false, fc.payment_type,
  'active','seed-laretraite-v1'
FROM _stf st
JOIN LATERAL (SELECT f.* FROM fee_catalog f
   WHERE f.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND f.device_id='seed-laretraite-v1' AND NOT f.mandatory
   ORDER BY f.position OFFSET (st.hv % 3) LIMIT 1) fc ON true
WHERE st.hv % 3 = 0;

-- ════ BUDGET ANNUEL v3 : annuel → périodes → rubriques → lignes → dépenses ════
INSERT INTO budgets (id, school_id, academic_year, label, status, tier, envelope_amount, start_date, end_date, created_at, updated_at, version, device_id)
VALUES (gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8','2025-2026','Budget annuel 2025-2026','active','annual',45000000,
        DATE '2025-09-01', DATE '2026-07-05', now(), now(), 1,'seed-laretraite-v1');

CREATE TEMP TABLE _fin ON COMMIT DROP AS SELECT
 (SELECT id FROM budgets WHERE school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND device_id='seed-laretraite-v1' LIMIT 1) bid,
 (SELECT id FROM auth.users WHERE email='fondatrice@laretraite.demo')   fond,
 (SELECT id FROM auth.users WHERE email='coordonnateur@laretraite.demo') coord,
 (SELECT id FROM auth.users WHERE email='raf@laretraite.demo')          raf,
 (SELECT id FROM auth.users WHERE email='caissiere@laretraite.demo')    caiss;

INSERT INTO budget_periods (id, school_id, academic_year, name, start_date, end_date, position, created_at, updated_at, version, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8','2025-2026', v.name, v.sd::date, v.ed::date, v.pos, now(), now(), 1,'seed-laretraite-v1'
FROM (VALUES ('Trimestre 1','2025-09-01','2025-12-15',1),
             ('Trimestre 2','2026-01-05','2026-03-31',2),
             ('Trimestre 3','2026-04-06','2026-07-05',3)) v(name,sd,ed,pos);

-- Chapitre RECETTE (hors enveloppe de dépense) : alimente « recettes prévues ».
INSERT INTO budget_chapters (id, school_id, budget_id, code, label, kind, planned_amount, position, scope, status, device_id)
VALUES (gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8',(SELECT bid FROM _fin),'REC-SCOL','Scolarités & frais annexes','recette',52000000,0,NULL,'active','seed-laretraite-v1');

-- Rubriques (racines : scope NULL, montant porté par les lignes filles).
INSERT INTO budget_chapters (id, school_id, budget_id, parent_id, code, label, kind, planned_amount, position, scope, status, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8',(SELECT bid FROM _fin), NULL, v.code, v.label,'depense',0,v.pos,NULL,'active','seed-laretraite-v1'
FROM (VALUES ('RUB-FONC','Fonctionnement',1),('RUB-PERS','Personnel',2),('RUB-INV','Investissement',3)) v(code,label,pos);

-- Lignes (feuilles). Insérées en 'draft' : la garde d'activation exige que la
-- répartition temporelle somme 100 %, posée juste après.
INSERT INTO budget_chapters (id, school_id, budget_id, parent_id, code, label, kind, planned_amount, position, scope, status, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8',(SELECT bid FROM _fin),
 (SELECT r.id FROM budget_chapters r WHERE r.budget_id=(SELECT bid FROM _fin) AND r.code=v.rub AND r.device_id='seed-laretraite-v1'),
 v.code, v.label,'depense', v.amt, v.pos, v.scope,'draft','seed-laretraite-v1'
FROM (VALUES
 ('RUB-FONC','FOURN','Fournitures pédagogiques', 3500000,'sectors', 1),
 ('RUB-FONC','ENTR', 'Entretien & maintenance',  2800000,'complex', 2),
 ('RUB-FONC','ELEC', 'Électricité & eau',        2200000,'complex', 3),
 ('RUB-FONC','COMM', 'Communication',             800000,'complex', 4),
 ('RUB-FONC','ACTI', 'Activités scolaires',      1500000,'sectors', 5),
 ('RUB-FONC','EXAM', 'Examens & évaluations',    1800000,'sectors', 6),
 ('RUB-FONC','TRANS','Transport',                1200000,'complex', 7),
 ('RUB-FONC','SECU', 'Sécurité & gardiennage',   1400000,'complex', 8),
 ('RUB-FONC','HYG',  'Hygiène & santé',           900000,'complex', 9),
 ('RUB-FONC','IMPR', 'Imprévus',                 1000000,'complex',10),
 ('RUB-PERS','SAL',  'Salaires & charges',      24000000,'complex',11),
 ('RUB-PERS','FORM', 'Formation du personnel',   1200000,'complex',12),
 ('RUB-INV', 'INFO', 'Équipement informatique',  2000000,'complex',13),
 ('RUB-INV', 'MOB',  'Mobilier scolaire',         700000,'sectors',14)
) v(rub,code,label,amt,scope,pos);
-- Σ des lignes = 45 000 000 = enveloppe annuelle (contrôlé par le script de validation).

-- Répartition TEMPORELLE : 40/30/30 (Σ = 100 % par ligne).
INSERT INTO budget_line_periods (id, school_id, budget_chapter_id, budget_period_id, pct, amount, created_at, updated_at, version, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', ch.id, p.id, a.pct, round(ch.planned_amount*a.pct/100.0), now(), now(), 1,'seed-laretraite-v1'
FROM budget_chapters ch
JOIN (VALUES ('Trimestre 1',40),('Trimestre 2',30),('Trimestre 3',30)) a(pname,pct) ON true
JOIN budget_periods p ON p.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND p.academic_year='2025-2026' AND p.name=a.pname AND p.device_id='seed-laretraite-v1'
WHERE ch.budget_id=(SELECT bid FROM _fin) AND ch.scope IS NOT NULL AND ch.device_id='seed-laretraite-v1';

-- Répartition SECTORIELLE des lignes de portée « sectors » (Σ = 100 %).
INSERT INTO budget_line_sectors (id, school_id, budget_chapter_id, school_unit_id, pct, amount, created_at, updated_at, version, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', ch.id, su.id, a.pct, round(ch.planned_amount*a.pct/100.0), now(), now(), 1,'seed-laretraite-v1'
FROM budget_chapters ch
JOIN (VALUES ('maternelle',20),('primaire',40),('premier_cycle',40)) a(skey,pct) ON true
JOIN school_units su ON su.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND su.section_key = a.skey
WHERE ch.budget_id=(SELECT bid FROM _fin) AND ch.scope='sectors' AND ch.device_id='seed-laretraite-v1';

-- Activation des lignes (leurs allocations somment 100 % → garde satisfaite).
UPDATE budget_chapters SET status='active'
WHERE budget_id=(SELECT bid FROM _fin) AND scope IS NOT NULL AND device_id='seed-laretraite-v1';

-- Dépenses exécutées (consommation « normale » de l'exercice).
INSERT INTO budget_expenses (id, school_id, budget_id, budget_chapter_id, budget_period_id, category, supplier, amount, requester, status, expense_date, notes, created_by, created_at, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8',(SELECT bid FROM _fin), ch.id,
  (SELECT p.id FROM budget_periods p WHERE p.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND p.device_id='seed-laretraite-v1'
     AND v.dt::date BETWEEN p.start_date AND p.end_date LIMIT 1),
  ch.label, v.supplier, v.amt,'M. FOTSO Landry','paid', v.dt::date,'Dépense de fonctionnement de l''exercice.','M. FOTSO Landry', v.dt::timestamptz,'seed-laretraite-v1'
FROM (VALUES
 ('FOURN', 1900000,'2025-10-14','Librairie Étoile'),
 ('ENTR',  1450000,'2025-11-06','Ets Nkolo Bâtiment'),
 ('ELEC',  1500000,'2026-01-12','ENEO / CAMWATER'),
 ('COMM',   420000,'2026-02-03','Camtel'),
 ('ACTI',   700000,'2026-03-10','Comité des fêtes'),
 ('EXAM',   950000,'2026-05-18','Imprimerie Mvog-Ada'),
 ('TRANS',  640000,'2025-12-01','Transport Le Bosquet'),
 ('SECU',  1250000,'2026-04-20','Sécurité Vigilance SARL'),
 ('HYG',    505000,'2026-02-17','Pharmacie du Centre'),
 ('SAL',  16800000,'2026-05-28','Personnel'),
 ('FORM',   300000,'2026-01-22','Cabinet Perform'),
 ('INFO',  1200000,'2025-10-28','Cameroun Informatique'),
 ('MOB',    380000,'2025-09-22','Menuiserie Bonanjo')
) v(code,amt,dt,supplier)
JOIN budget_chapters ch ON ch.budget_id=(SELECT bid FROM _fin) AND ch.code=v.code AND ch.device_id='seed-laretraite-v1';

-- Les 8 CAS du circuit de validation (une vidéo possible par cas).
INSERT INTO budget_expenses (id, school_id, budget_id, budget_chapter_id, budget_period_id, category, subcategory, supplier, amount, requester, status, expense_date, notes, created_by, created_at, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8',(SELECT bid FROM _fin), ch.id,
  (SELECT p.id FROM budget_periods p WHERE p.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND p.device_id='seed-laretraite-v1'
     AND v.dt::date BETWEEN p.start_date AND p.end_date LIMIT 1),
  ch.label, v.cas,'Fournisseur local', v.amt, v.requester, v.status, v.dt::date, v.notes, v.requester, v.dt::timestamptz,'seed-laretraite-v1'
FROM (VALUES
 ('CAS-A','FOURN',  85000,'Mme ABENA Carine','submitted','2026-06-22','Achat de fournitures — EN ATTENTE d''approbation du Coordonnateur Général.'),
 ('CAS-B','INFO',  450000,'M. FOTSO Landry', 'approved', '2026-06-12','Maintenance du parc informatique — APPROUVÉE par la Fondatrice, décaissement à venir.'),
 ('CAS-C','COMM',  125000,'Mme ABENA Carine','paid',     '2026-06-15','Communication — circuit complet : soumise, approuvée, puis décaissée.'),
 ('CAS-D','ENTR', 1250000,'M. FOTSO Landry', 'submitted','2026-06-24','Réfection de la toiture du bloc B — EN ATTENTE de décision de la Fondatrice (montant élevé).'),
 ('CAS-E','ACTI',  300000,'Mme ABENA Carine','rejected', '2026-06-08','REJETÉE : activité non prioritaire en fin d''exercice.'),
 ('CAS-F','EXAM',  220000,'M. FOTSO Landry', 'approved', '2026-06-18','Examens blancs — approuvée, non encore décaissée.'),
 ('CAS-G','HYG',   175000,'Mme ABENA Carine','paid',     '2026-06-05','Produits d''hygiène — exécutée et décaissée.'),
 ('CAS-H','SECU',  250000,'M. FOTSO Landry', 'draft',    '2026-06-26','BLOQUÉE : dépasse le disponible de la ligne Sécurité → une demande de déblocage est en attente.')
) v(cas,code,amt,requester,status,dt,notes)
JOIN budget_chapters ch ON ch.budget_id=(SELECT bid FROM _fin) AND ch.code=v.code AND ch.device_id='seed-laretraite-v1';

-- CAS-H : la ligne Sécurité n'a plus le disponible → demande de déblocage.
INSERT INTO budget_unlock_requests (id, school_id, budget_id, budget_chapter_id, requested_amount, reason, requester, requested_by, status, created_at, version, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8',(SELECT bid FROM _fin), ch.id, 250000,
 'Ligne Sécurité presque épuisée — renfort de gardiennage pour les examens de fin d''année.',
 'M. FOTSO Landry',(SELECT raf FROM _fin),'pending', now(), 1,'seed-laretraite-v1'
FROM budget_chapters ch WHERE ch.budget_id=(SELECT bid FROM _fin) AND ch.code='SECU' AND ch.device_id='seed-laretraite-v1';

-- ════ CHRONOLOGIE DES DÉCISIONS (journal d'événements + audit) ════
INSERT INTO domain_events (id, school_id, aggregate_type, aggregate_id, event_type, payload, actor_id, actor_name, occurred_at, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8','expense', e.id, ev.etype,
  jsonb_build_object('amount',e.amount,'chapter',e.category,'cas',ev.cas,'seed','seed-laretraite-v1'),
  (SELECT id FROM auth.users WHERE email=ev.actor_email), ev.actor_name, ev.occ::timestamptz,'seed-laretraite-v1'
FROM (VALUES
 ('CAS-A','ExpenseSubmitted','caissiere@laretraite.demo',   'Mme ABENA Carine',       '2026-06-22 10:15'),
 ('CAS-B','ExpenseSubmitted','raf@laretraite.demo',         'M. FOTSO Landry',        '2026-06-10 09:00'),
 ('CAS-B','ExpenseApproved', 'fondatrice@laretraite.demo',  'Mme AWONO Marie-Thérèse','2026-06-12 16:30'),
 ('CAS-C','ExpenseSubmitted','caissiere@laretraite.demo',   'Mme ABENA Carine',       '2026-06-14 10:15'),
 ('CAS-C','ExpenseApproved', 'coordonnateur@laretraite.demo','M. MBALLA Emmanuel',    '2026-06-15 11:47'),
 ('CAS-C','ExpensePaid',     'raf@laretraite.demo',         'M. FOTSO Landry',        '2026-06-15 14:20'),
 ('CAS-D','ExpenseSubmitted','raf@laretraite.demo',         'M. FOTSO Landry',        '2026-06-24 08:40'),
 ('CAS-E','ExpenseSubmitted','caissiere@laretraite.demo',   'Mme ABENA Carine',       '2026-06-07 15:00'),
 ('CAS-E','ExpenseRejected', 'coordonnateur@laretraite.demo','M. MBALLA Emmanuel',    '2026-06-08 09:10'),
 ('CAS-F','ExpenseSubmitted','raf@laretraite.demo',         'M. FOTSO Landry',        '2026-06-17 11:00'),
 ('CAS-F','ExpenseApproved', 'coordonnateur@laretraite.demo','M. MBALLA Emmanuel',    '2026-06-18 10:05'),
 ('CAS-G','ExpenseSubmitted','caissiere@laretraite.demo',   'Mme ABENA Carine',       '2026-06-04 09:30'),
 ('CAS-G','ExpenseApproved', 'coordonnateur@laretraite.demo','M. MBALLA Emmanuel',    '2026-06-04 14:00'),
 ('CAS-G','ExpensePaid',     'caissiere@laretraite.demo',   'Mme ABENA Carine',       '2026-06-05 10:00')
) ev(cas,etype,actor_email,actor_name,occ)
JOIN budget_expenses e ON e.subcategory=ev.cas AND e.device_id='seed-laretraite-v1' AND e.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8';

INSERT INTO audit_events (id, school_id, action, aggregate_type, target_id, actor_id, actor_name, payload, at)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', a.action,'expense', e.id,
 (SELECT id FROM auth.users WHERE email=a.actor_email), a.actor_name,
 jsonb_build_object('amount',e.amount,'chapter',e.category,'seed','seed-laretraite-v1'), a.at::timestamptz
FROM (VALUES
 ('CAS-B','expense.approved','fondatrice@laretraite.demo',   'Mme AWONO Marie-Thérèse','2026-06-12 16:30'),
 ('CAS-C','expense.paid',    'raf@laretraite.demo',          'M. FOTSO Landry',        '2026-06-15 14:20'),
 ('CAS-E','expense.rejected','coordonnateur@laretraite.demo','M. MBALLA Emmanuel',     '2026-06-08 09:10'),
 ('CAS-F','expense.approved','coordonnateur@laretraite.demo','M. MBALLA Emmanuel',     '2026-06-18 10:05'),
 ('CAS-G','expense.paid',    'caissiere@laretraite.demo',    'Mme ABENA Carine',       '2026-06-05 10:00')
) a(cas,action,actor_email,actor_name,at)
JOIN budget_expenses e ON e.subcategory=a.cas AND e.device_id='seed-laretraite-v1' AND e.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8';

-- Cloche : ce qui attend une décision dès l'ouverture de session.
INSERT INTO notifications (id, school_id, recipient_id, recipient_role, type, title, body, link, read, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', r.rid, r.role, r.type, r.title, r.body,'/app/depenses', false,'seed-laretraite-v1'
FROM (VALUES
 ((SELECT fond  FROM _fin),'fondatrice',           'expense.pending', 'Dépense en attente de votre décision','Réfection de la toiture — 1 250 000 FCFA (ligne Entretien) à approuver.'),
 ((SELECT coord FROM _fin),'coordonnateur_general','expense.pending', 'Dépense en attente d''approbation',   'Fournitures — 85 000 FCFA soumise par la Caissière.'),
 ((SELECT fond  FROM _fin),'fondatrice',           'unlock.pending',  'Demande de déblocage de ligne',       'Sécurité : 250 000 FCFA demandés (ligne presque épuisée).'),
 ((SELECT raf   FROM _fin),'raf',                  'expense.approved','Dépense approuvée',                   'Maintenance informatique — 450 000 FCFA : décaissement à effectuer.')
) r(rid,role,type,title,body);

-- ════ RESSOURCES HUMAINES — contrats, catalogue de paie, bulletins de juin ════
INSERT INTO hr_contracts (id, school_id, staff_id, type, reference, title, start_date, salary, status, notes)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', st.id,'cdi','CT-2025-2026-'||upper(a.k), a.fonction, DATE '2021-09-01', a.salary,'active',
  'Contrat à durée indéterminée — établissement privé confessionnel.'
FROM staff st JOIN _acct a ON lower(a.email) = lower(st.email)
WHERE st.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND st.device_id='seed-laretraite-v1';

INSERT INTO hr_career_events (id, school_id, staff_id, event_date, type, title, description)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', st.id, DATE '2021-09-01','recrutement','Recrutement','Prise de fonction : '||a.fonction||'.'
FROM staff st JOIN _acct a ON lower(a.email) = lower(st.email)
WHERE st.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND st.device_id='seed-laretraite-v1';

INSERT INTO hr_attendance (id, school_id, staff_id, att_date, status, check_in, check_out)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', st.id, (DATE '2026-06-01' + d)::date,
  CASE WHEN (('x'||substr(md5(st.id::text||d::text),1,7))::bit(28)::int) % 12 = 0 THEN 'retard' ELSE 'present' END,
  '07:15','16:30'
FROM staff st CROSS JOIN generate_series(0,9) d
WHERE st.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND st.device_id='seed-laretraite-v1';

INSERT INTO hr_payroll_catalog (id, school_id, code, name, kind, calc_type, amount, rate, base_ref, active, position)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', v.code, v.name, v.kind, v.ct, v.amt, v.rate, v.base, true, v.pos
FROM (VALUES
 ('PRIM-TRANS','Prime de transport',    'prime',    'fixed',   20000::bigint, NULL::numeric,'brut',        1),
 ('PRIM-LOG',  'Prime de logement',     'prime',    'percent', NULL,          15,            'salaire_base',2),
 ('PRIM-ANC',  'Prime d''ancienneté',   'prime',    'fixed',   10000,         NULL,          'brut',        3),
 ('RET-CNPS',  'CNPS (part salarié)',   'retenue',  'percent', NULL,          4.2,           'brut',        4),
 ('RET-IRPP',  'IRPP',                  'retenue',  'percent', NULL,          8,             'brut',        5),
 ('RET-AVAN',  'Avance sur salaire',    'retenue',  'fixed',   25000,         NULL,          'brut',        6),
 ('PAT-CNPS',  'CNPS (part patronale)', 'patronale','percent', NULL,          11.2,          'brut',        7)
) v(code,name,kind,ct,amt,rate,base,pos);

-- Bulletins de juin 2026. Le calcul reproduit resolvePayrollItems()
-- (src/lib/hrEngine.js) : primes sur le SALAIRE DE BASE, retenues et charges
-- patronales sur le BRUT (= base + primes). Les patronales n'entrent pas au net.
CREATE TEMP TABLE _pay ON COMMIT DROP AS
SELECT st.id staff_id, a.k, a.salary::bigint base,
       (20000 + round(a.salary * 0.15) + 10000)::bigint bonuses
FROM staff st JOIN _acct a ON lower(a.email) = lower(st.email)
WHERE st.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND st.device_id='seed-laretraite-v1';
ALTER TABLE _pay ADD COLUMN brut bigint;   UPDATE _pay SET brut = base + bonuses;
-- Avance sur salaire : seulement pour trois agents (montre une retenue ponctuelle).
ALTER TABLE _pay ADD COLUMN avance bigint; UPDATE _pay SET avance = CASE WHEN k IN ('caissiere','surveillant','ens_prim') THEN 25000 ELSE 0 END;
ALTER TABLE _pay ADD COLUMN deductions bigint;
UPDATE _pay SET deductions = round(brut * 0.042) + round(brut * 0.08) + avance;

INSERT INTO hr_payroll (id, school_id, staff_id, period, base_salary, worked_days, bonuses, deductions, net_salary, status, paid_date, notes)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', staff_id,'2026-06', base, 22, bonuses, deductions,
       greatest(0, base + bonuses - deductions),'paid', DATE '2026-06-28','Bulletin de paie — juin 2026.'
FROM _pay;

INSERT INTO hr_payroll_items (id, school_id, payroll_id, catalog_id, code, kind, name, calc_type, rate, base_ref, amount)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', pr.id, c.id, c.code, c.kind, c.name, c.calc_type, c.rate, c.base_ref,
  CASE c.code
    WHEN 'PRIM-TRANS' THEN 20000
    WHEN 'PRIM-LOG'   THEN round(p.base * 0.15)
    WHEN 'PRIM-ANC'   THEN 10000
    WHEN 'RET-CNPS'   THEN round(p.brut * 0.042)
    WHEN 'RET-IRPP'   THEN round(p.brut * 0.08)
    WHEN 'RET-AVAN'   THEN p.avance
    WHEN 'PAT-CNPS'   THEN round(p.brut * 0.112)
  END::bigint
FROM hr_payroll pr
JOIN _pay p ON p.staff_id = pr.staff_id
JOIN hr_payroll_catalog c ON c.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8'
WHERE pr.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND pr.period='2026-06'
  AND NOT (c.code = 'RET-AVAN' AND p.avance = 0);

-- Congés : un approuvé, un maladie, un EN ATTENTE (circuit à montrer).
INSERT INTO hr_leaves (id, school_id, staff_id, type, start_date, end_date, days, reason, status, decided_by, decided_at)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', st.id, v.type, v.sd::date, v.ed::date, v.days, v.reason, v.status,
  CASE WHEN v.status='approved' THEN 'M. MBALLA Emmanuel' ELSE NULL END,
  CASE WHEN v.status='approved' THEN TIMESTAMPTZ '2026-03-30 09:00' ELSE NULL END
FROM (VALUES
 ('dirprim',    'annuel', '2026-04-06','2026-04-17',12,'approved','Congé annuel.'),
 ('surveillant','maladie','2026-05-11','2026-05-15', 5,'approved','Certificat médical fourni.'),
 ('ens_prim',   'annuel', '2026-07-06','2026-07-24',19,'pending', 'Demande de congé annuel — en attente de décision.')
) v(k,type,sd,ed,days,status,reason)
JOIN _acct a ON a.k = v.k
JOIN staff st ON lower(st.email) = lower(a.email) AND st.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8';

INSERT INTO hr_evaluations (id, school_id, staff_id, eval_date, period, evaluator, score, rating, strengths, improvements, comments, status)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', st.id, DATE '2026-06-20','2025-2026','M. MBALLA Emmanuel',
  14 + (('x'||substr(md5(st.id::text),1,7))::bit(28)::int % 5), 'Très bon',
  'Ponctualité, implication auprès des élèves.','Renforcer l''usage des outils numériques.',
  'Évaluation annuelle de fin d''exercice.','final'
FROM staff st JOIN _acct a ON lower(a.email) = lower(st.email)
WHERE st.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND st.device_id='seed-laretraite-v1'
  AND a.k IN ('ens_mat','ens_prim','ens_sec','caissiere','surveillant');

-- ════ VIE SCOLAIRE (Surveillant Général) — collège uniquement ════
CREATE TEMP TABLE _sec ON COMMIT DROP AS
SELECT s.id student_id, s.class_id, (row_number() OVER (ORDER BY s.matricule))::int rn
FROM students s JOIN classes c ON c.id = s.class_id
WHERE s.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND s.device_id='seed-laretraite-v1' AND c.section='college';
CREATE TEMP TABLE _sv ON COMMIT DROP AS
SELECT (SELECT id FROM auth.users WHERE email='surveillant@laretraite.demo') sv;

INSERT INTO late_arrivals (id, school_id, student_id, class_id, year_label, date, arrival_time, reason, justified, justification, validated, sequence_order, recorded_by, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', x.student_id, x.class_id,'2025-2026',(DATE '2025-10-02' + x.rn*6)::date,
  ('07:'||lpad((35 + x.rn%25)::text,2,'0'))::time,
  (ARRAY['Transport','Réveil tardif','Embouteillage','Raison familiale','Non justifié'])[(x.rn%5)+1],
  (x.rn%2=0), CASE WHEN x.rn%2=0 THEN 'Mot des parents présenté au surveillant.' ELSE NULL END,
  (x.rn%3<>0), 1 + (x.rn%6), (SELECT sv FROM _sv),'seed-laretraite-v1'
FROM _sec x WHERE x.rn <= 30;

-- Les champs de la vie scolaire stockent des CODES (src/core/disciplineTerms.js),
-- pas des libellés : un libellé en clair s'afficherait brut à l'écran.
INSERT INTO disciplinary_incidents (id, school_id, student_id, class_id, year_label, incident_type, date, incident_time, location, description, witnesses, severity, responsible, decision, status, sequence_order, recorded_by, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', x.student_id, x.class_id,'2025-2026',
  (ARRAY['bagarre','insolence','fraude','degradation','telephone','autre'])[(x.rn%6)+1],
  (DATE '2025-10-10' + x.rn*15)::date,'10:15'::time,
  (ARRAY['Cour de récréation','Salle de classe','Couloir du bloc B','Terrain de sport'])[(x.rn%4)+1],
  'Fait constaté et consigné par le surveillant général.','Deux camarades de classe',
  (ARRAY['mineur','majeur','grave'])[(x.rn%3)+1], (SELECT sv FROM _sv),
  CASE WHEN x.rn%3=0 THEN NULL ELSE 'Sanction appliquée et notifiée aux parents.' END,
  (ARRAY['ouvert','traite','classe'])[(x.rn%3)+1], 1 + (x.rn%6), (SELECT sv FROM _sv),'seed-laretraite-v1'
FROM _sec x WHERE x.rn <= 12;

INSERT INTO disciplinary_actions (id, school_id, student_id, class_id, incident_id, year_label, action_type, date, reason, duration_days, start_date, end_date, decided_by, sequence_order, recorded_by, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', x.student_id, x.class_id,
  (SELECT di.id FROM disciplinary_incidents di WHERE di.student_id=x.student_id AND di.device_id='seed-laretraite-v1' LIMIT 1),'2025-2026',
  (ARRAY['avertissement_ecrit','exclusion_temporaire','travail_interet','blame'])[(x.rn%4)+1],
  (DATE '2025-10-12' + x.rn*15)::date,'Suite à incident disciplinaire.',
  CASE WHEN x.rn%4=1 THEN 2 ELSE NULL END,
  CASE WHEN x.rn%4=1 THEN (DATE '2025-10-13' + x.rn*15)::date ELSE NULL END,
  CASE WHEN x.rn%4=1 THEN (DATE '2025-10-15' + x.rn*15)::date ELSE NULL END,
  'M. TABI Serge', 1 + (x.rn%6), (SELECT sv FROM _sv),'seed-laretraite-v1'
FROM _sec x WHERE x.rn <= 8;

INSERT INTO student_detentions (id, school_id, student_id, class_id, year_label, date, start_time, end_time, duration_hours, task, supervised_by, completed, recorded_by, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', x.student_id, x.class_id,'2025-2026',(DATE '2025-10-18' + x.rn*15)::date,
  '15:00'::time,'17:00'::time, 2,'Devoir supplémentaire encadré.','M. BELLO Achille',(x.rn%2=0),(SELECT sv FROM _sv),'seed-laretraite-v1'
FROM _sec x WHERE x.rn <= 5;

INSERT INTO parent_meetings (id, school_id, student_id, class_id, incident_id, year_label, target, reason, meeting_date, meeting_time, location, status, outcome, convened_by, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', x.student_id, x.class_id,
  (SELECT di.id FROM disciplinary_incidents di WHERE di.student_id=x.student_id AND di.device_id='seed-laretraite-v1' LIMIT 1),'2025-2026',
  (ARRAY['parent','les_deux','eleve'])[(x.rn%3)+1],'Convocation des parents suite à incident.',
  (DATE '2025-10-20' + x.rn*15)::date,'14:00'::time,'Bureau du surveillant général',
  (ARRAY['planifie','honore','absent','annule'])[(x.rn%4)+1],
  CASE WHEN x.rn%4=1 THEN 'Entretien tenu — engagement écrit de l''élève.' ELSE NULL END,
  (SELECT sv FROM _sv),'seed-laretraite-v1'
FROM _sec x WHERE x.rn <= 6;

INSERT INTO student_warnings (id, school_id, student_id, class_id, year_label, warning_type, category, date, reason, acknowledged, recorded_by, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', x.student_id, x.class_id,'2025-2026',
  CASE WHEN x.rn%3=0 THEN 'oral' ELSE 'ecrit' END,
  CASE WHEN x.rn%2=0 THEN 'travail' ELSE 'conduite' END,
  (DATE '2026-01-12' + x.rn*4)::date,'Avertissement notifié à l''élève et à sa famille.',
  (x.rn%2=0),(SELECT sv FROM _sv),'seed-laretraite-v1'
FROM _sec x WHERE x.rn BETWEEN 31 AND 40;

INSERT INTO exit_permissions (id, school_id, student_id, class_id, year_label, exit_type, date, exit_time, return_time, reason, authorized_by, accompanied_by, returned, recorded_by, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', x.student_id, x.class_id,'2025-2026',
  (ARRAY['parentale','medicale','administrative'])[(x.rn%3)+1],(DATE '2026-02-03' + x.rn*5)::date,
  '10:00'::time, CASE WHEN x.rn%2=0 THEN '12:00'::time ELSE NULL END,
  'Rendez-vous médical / raison familiale.','M. BELLO Achille',
  CASE WHEN x.rn%3=0 THEN 'Parent' ELSE NULL END,(x.rn%2=0),(SELECT sv FROM _sv),'seed-laretraite-v1'
FROM _sec x WHERE x.rn BETWEEN 41 AND 48;

-- ════ PATRIMOINE (immobilisations) ════
INSERT INTO assets (id, school_id, category, asset_number, name, value, acquisition_date, status, location, serial_number, unit_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', v.cat,'IMMO-'||lpad(v.i::text,3,'0'), v.name, v.val,
  (DATE '2019-06-15' + (v.i*137))::date, CASE WHEN v.i=7 THEN 'maintenance' ELSE 'active' END, v.loc,'SN'||(100000+v.i*7919)::text,
  (SELECT su.id FROM school_units su WHERE su.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND su.section_key=v.ukey)
FROM (VALUES
 -- catégories = codes de src/lib/assetEngine.js
 (1, 'Photocopieur Canon iR2625',   'imprimante',     1250000,'Secrétariat',      'premier_cycle'),
 (2, 'Vidéoprojecteur Epson EB-X06','ordinateur',      380000,'Salle multimédia', 'premier_cycle'),
 (3, 'Lot de 40 tables-bancs',      'mobilier',       1600000,'Bloc pédagogique', 'primaire'),
 (4, 'Ordinateur portable HP',      'ordinateur',      450000,'Bureau du RAF',    'premier_cycle'),
 (5, 'Serveur local NotesCam',      'ordinateur',      680000,'Salle serveur',    'premier_cycle'),
 (6, 'Groupe électrogène 15 kVA',   'groupe_electrogene',3200000,'Cour arrière',  'premier_cycle'),
 (7, 'Bus scolaire Toyota Coaster', 'vehicule',      12500000,'Parking',          'premier_cycle'),
 (8, 'Bloc pédagogique A',          'batiment',      28000000,'Enceinte',         'primaire'),
 (9, 'Jeux de motricité',           'mobilier',        540000,'Cour maternelle',  'maternelle'),
 (10,'Tableaux blancs (lot de 8)',  'mobilier',        440000,'Bloc primaire',    'primaire'),
 (11,'Imprimante Epson L3250',      'imprimante',      180000,'Bureau du Censeur','premier_cycle'),
 (12,'Extincteurs (lot de 10)',     'mobilier',        350000,'Ensemble du site', 'premier_cycle')
) v(i,name,cat,val,loc,ukey);

INSERT INTO asset_breakdowns (id, school_id, asset_id, date, description, severity, status, reported_by)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', a.id, DATE '2026-03-04',
  'Panne signalée par le service concerné.', CASE WHEN a.asset_number='IMMO-007' THEN 'majeure' ELSE 'mineure' END,
  CASE WHEN a.asset_number='IMMO-007' THEN 'open' ELSE 'resolved' END,'M. TABI Serge'
FROM assets a WHERE a.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND a.asset_number IN ('IMMO-003','IMMO-007','IMMO-011');

INSERT INTO asset_repairs (id, school_id, asset_id, date, description, provider, cost, status)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', a.id, DATE '2026-03-18',
  'Réparation effectuée par un prestataire externe.','Ets Technique Nsimeyong', 95000,'done'
FROM assets a WHERE a.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND a.asset_number IN ('IMMO-003','IMMO-011');

INSERT INTO asset_expenses (id, school_id, asset_id, date, category, amount, supplier)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', a.id, DATE '2026-03-18','reparation', 95000,'Ets Technique Nsimeyong'
FROM assets a WHERE a.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND a.asset_number IN ('IMMO-003','IMMO-011');

-- ════ SIGNALEMENTS (module Reports) ════
INSERT INTO signalements (id, school_id, reporter_id, reporter_name, domain, title, description, priority, status, assignee_id, resolution, created_at, updated_at, version, device_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8',
  (SELECT id FROM auth.users WHERE email='censeur@laretraite.demo'),'M. TABI Serge',
  v.domain, v.title,'Signalement enregistré depuis le module Reports.', v.prio, v.status,
  (SELECT id FROM auth.users WHERE email='coordonnateur@laretraite.demo'),
  CASE WHEN v.status='resolved' THEN 'Traité et clôturé.' ELSE NULL END,
  (DATE '2026-02-02' + v.i*9)::timestamptz,(DATE '2026-02-02' + v.i*9)::timestamptz, 1,'seed-laretraite-v1'
FROM (VALUES
 (0,'maintenance', 'Fuite d''eau aux sanitaires du bloc B',       'high',    'in_progress'),
 (1,'maintenance', 'Panne électrique en salle informatique',      'critical','assigned'),
 (2,'vie_scolaire','Attroupement récurrent devant le portail',    'normal',  'new'),
 (3,'academique',  'Manuels de SVT manquants en 4e',              'normal',  'in_progress'),
 (4,'finances',    'Écart de caisse constaté le 12/05',           'high',    'resolved'),
 (5,'patrimoine',  'Bus scolaire immobilisé — boîte de vitesses', 'critical','assigned'),
 (6,'vie_scolaire','Absences répétées d''un élève de 3e',         'normal',  'resolved'),
 (7,'maintenance', 'Vitre cassée en salle de CM1',                'low',     'new')
) v(i,domain,title,prio,status);

INSERT INTO signalement_history (id, school_id, signalement_id, action, to_status, actor, actor_id, at)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', s.id,'created','new','M. TABI Serge',
  (SELECT id::text FROM auth.users WHERE email='censeur@laretraite.demo'), s.created_at
FROM signalements s WHERE s.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND s.device_id='seed-laretraite-v1';

INSERT INTO signalement_history (id, school_id, signalement_id, action, from_status, to_status, actor, actor_id, at)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', s.id,'status_changed','new', s.status,'M. MBALLA Emmanuel',
  (SELECT id::text FROM auth.users WHERE email='coordonnateur@laretraite.demo'), s.created_at + interval '2 days'
FROM signalements s WHERE s.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND s.device_id='seed-laretraite-v1' AND s.status <> 'new';

INSERT INTO signalement_comments (id, school_id, signalement_id, body, author, author_id)
SELECT gen_random_uuid(),'8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8', s.id,
  'Prise en charge en cours, un prestataire a été contacté.','M. MBALLA Emmanuel',
  -- `author_id` / `actor_id` sont de type TEXT dans signalement_* (pas uuid).
  (SELECT id::text FROM auth.users WHERE email='coordonnateur@laretraite.demo')
FROM signalements s WHERE s.school_id='8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8' AND s.device_id='seed-laretraite-v1' AND s.status <> 'new';

-- ════ NORMALISATION updated_at ════
-- Plusieurs tables n'ont pas de DEFAULT sur updated_at : une ligne à NULL n'est
-- JAMAIS reprise par la synchro incrémentale (le curseur .gt('updated_at',…)
-- exclut NULL). On garantit donc un updated_at sur toutes les lignes du seed.
DO $$
DECLARE t text;
  tbls text[] := ARRAY['teachers','staff','fee_catalog','class_fee_grids','student_fee_items',
                       'budget_chapters','budget_expenses','budget_unlock_requests','notifications',
                       'user_governance_roles','school_units','assets','asset_breakdowns','asset_repairs',
                       'asset_expenses','hr_contracts','hr_leaves','hr_evaluations','hr_attendance',
                       'hr_career_events','hr_payroll','hr_payroll_catalog','hr_payroll_items'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET updated_at = now() WHERE school_id = %L AND updated_at IS NULL',
                     t, '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8');
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Vérifiez le résultat avec supabase/seed_college_la_retraite_validate.sql
-- ────────────────────────────────────────────────────────────────────────────
