-- ════════════════════════════════════════════════════════════════════════════
-- JEU DE DONNÉES E2E — « COMPLEXE SCOLAIRE BILINGUE LA RÉUSSITE » (Douala)
-- École de TEST hybride EXISTANTE : 31c70a36-065e-4933-a40c-1e9c051d1afc
-- (finance=LAN / gouvernance=Cloud). N'affecte JAMAIS MAARIF ni une autre école.
--
-- 100 % synthétique. Snapshot : année 2026-2027 EN COURS (~15 fév. 2027,
-- T1 clos, T2 actif) → état volontairement INCOMPLET (décisions/paiements/notes
-- en attente). Marqueur de nettoyage : device_id='seed-lareussite-v1'.
-- Idempotent (purge par marqueur en tête) → reproductible à l'identique.
-- Mot de passe des comptes de seed : Reussite2027!  (fondatrice = compte réel
-- hfiwdsjfci@gmail.com, mot de passe inchangé).
-- Nettoyage : seed_lareussite_cleanup.sql — Validation : seed_lareussite_validate.sql
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT setseed(0.4242);

-- ════ PURGE (marqueur) — FK-safe (enfants d'abord) ════
DELETE FROM audit_events WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND payload->>'seed'='seed-lareussite-v1';
DELETE FROM domain_events WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM notifications WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM budget_unlock_requests WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM budget_expenses WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM budget_chapters WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM budgets WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM fee_payments WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM student_fee_items WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM student_fees WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM class_fee_grids WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM fee_catalog WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM exit_permissions WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM parent_meetings WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM student_detentions WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM student_warnings WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM disciplinary_actions WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM disciplinary_incidents WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM late_arrivals WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM absences WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc';
DELETE FROM grades WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM student_class_assignments WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM students WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM subjects WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM classes WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM sequence_dates WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM academic_periods WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM staff WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM teachers WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1';
DELETE FROM school_units WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc';
DELETE FROM user_governance_roles WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc';
DELETE FROM school_users WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc';
DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE '%@lareussite.test');
DELETE FROM auth.users WHERE email LIKE '%@lareussite.test';

-- ════ ÉCOLE (rename + config, policy hybride INCHANGÉE) ════
UPDATE schools SET name='COMPLEXE SCOLAIRE BILINGUE LA RÉUSSITE', director='Mme Ngono Solange (Fondatrice)',
  region='Littoral', division='Wouri', subdivision='Douala', address='Akwa, Douala, Cameroun',
  phone='+237 233 42 10 10', email='contact@lareussite.test', current_year='2026-2027',
  language='francophone', currency='XAF', bulletin_engine='classic', bulletin_bilingual=true, budget_validation=true
WHERE id='31c70a36-065e-4933-a40c-1e9c051d1afc';

-- ════ CORRECTIF CATALOGUE GOUVERNANCE (workflow réellement testable) ════
UPDATE governance_roles SET permissions=(SELECT jsonb_agg(DISTINCT p ORDER BY p) FROM jsonb_array_elements_text(permissions || '["expense.approve","expense.reject","budget.approve"]'::jsonb) p)
WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND code='coordonnateur_general';
UPDATE governance_roles SET permissions=(SELECT jsonb_agg(DISTINCT p ORDER BY p) FROM jsonb_array_elements_text(permissions || '["expense.approve","expense.reject"]'::jsonb) p)
WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND code='raf';
UPDATE governance_roles SET permissions=(SELECT jsonb_agg(DISTINCT p ORDER BY p) FROM jsonb_array_elements_text(permissions || '["expense.prepare","expense.submit"]'::jsonb) p)
WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND code='caissier';

-- ════ COMPTES (fondatrice = compte réel existant ; les autres en @lareussite.test) ════
CREATE TEMP TABLE _acct(email text, full_name text, base_role text, gov_role text, remote bool, is_new bool, perms text, scope_cycles text[]) ON COMMIT DROP;
INSERT INTO _acct VALUES
 ('hfiwdsjfci@gmail.com','Mme Ngono Solange (Fondatrice)','admin','fondatrice',true,false,NULL,NULL),
 ('coordonnateur@lareussite.test','M. Mballa Emmanuel (Coordonnateur Général)','censeur','coordonnateur_general',true,true,NULL,NULL),
 ('raf@lareussite.test','M. Fotso Landry (RAF)','censeur','raf',true,true,NULL,NULL),
 ('caissiere@lareussite.test','Mme Abena Carine (Caissière)','censeur','caissier',false,true,NULL,NULL),
 ('controleur@lareussite.test','M. Onana Guy (Contrôleur)','censeur','controleur',true,true,NULL,NULL),
 ('principal@lareussite.test','M. Njoya Blaise (Principal Collège)','censeur','principal',false,true,NULL,NULL),
 ('dir.primaire@lareussite.test','Mme Etoa Chantal (Directrice Primaire)','censeur','directrice_primaire',false,true,NULL,NULL),
 ('resp.maternelle@lareussite.test','Mme Manga Odile (Resp. Maternelle)','censeur','responsable_maternelle',false,true,NULL,NULL),
 ('censeur@lareussite.test','M. Tabi Serge (Censeur)','censeur',NULL,false,true,NULL,NULL),
 ('surveillant@lareussite.test','M. Bello Achille (Surveillant Général)','surveillant',NULL,false,true,NULL,NULL),
 ('secretaire@lareussite.test','Mme Ayissi Josiane (Secrétaire)','admin',NULL,false,true,'["students","classes","documents","attendance"]',NULL),
 ('prof.math@lareussite.test','M. Kamdem Cedric (Enseignant)','teacher',NULL,false,true,NULL,NULL),
 ('prof.lettres@lareussite.test','Mme Nana Larissa (Enseignante)','teacher',NULL,false,true,NULL,NULL),
 ('prof.sciences@lareussite.test','M. Talla Rodrigue (Enseignant)','teacher',NULL,false,true,NULL,NULL);
INSERT INTO auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',a.email,
       crypt('Reussite2027!', gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name',a.full_name)
FROM _acct a WHERE a.is_new AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email)=lower(a.email));
INSERT INTO auth.identities (id,user_id,provider,provider_id,identity_data,created_at,updated_at,last_sign_in_at)
SELECT gen_random_uuid(), u.id,'email', u.id::text, jsonb_build_object('sub',u.id::text,'email',u.email,'email_verified',true), now(), now(), now()
FROM auth.users u JOIN _acct a ON lower(a.email)=lower(u.email)
WHERE a.is_new AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id=u.id AND i.provider='email');
INSERT INTO school_users (id,school_id,user_id,role,full_name,active,remote_access_allowed,permissions,scope_cycles,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', u.id, a.base_role, a.full_name, true, a.remote, a.perms, a.scope_cycles,'seed-lareussite-v1'
FROM _acct a JOIN auth.users u ON lower(u.email)=lower(a.email);
INSERT INTO user_governance_roles (id,school_id,user_id,role,sector,status,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', u.id, a.gov_role,
       (SELECT sector FROM governance_roles gr WHERE gr.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND gr.code=a.gov_role LIMIT 1),'active','seed-lareussite-v1'
FROM _acct a JOIN auth.users u ON lower(u.email)=lower(a.email) WHERE a.gov_role IS NOT NULL;

-- ════ UNITÉS ════
INSERT INTO school_units (id,school_id,section_key,name,short_name,position) VALUES
 (gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc','maternelle','École Maternelle Bilingue','Maternelle',1),
 (gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc','primaire','École Primaire Francophone','Primaire FR',2),
 (gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc','primaire_en','Primary School (Anglophone)','Primary EN',3),
 (gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc','college','Collège & Lycée Francophone','Secondaire FR',4),
 (gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc','secondaire_en','Secondary School (Anglophone)','Secondary EN',5);

-- ════ ENSEIGNANTS (50) & PERSONNEL (15) ════
INSERT INTO teachers (id,school_id,name,gender,matricule,specialty,hire_date,status,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc',
  (CASE WHEN i%2=0 THEN (ARRAY['Jean','Paul','Samuel','Emmanuel','Eric','Franck','Serge','Landry','Cedric','Blaise','Boris','Yannick','Rodrigue','Achille','Guy','Herve','Armand','Ghislain','Pierre','Bruno'])[(i%20)+1]
        ELSE (ARRAY['Marie','Christine','Solange','Brigitte','Estelle','Carine','Nadege','Laure','Prisca','Rachel','Sandrine','Vanessa','Larissa','Chantal','Odile','Bertille','Mireille','Josiane','Yolande','Flore'])[(i%20)+1] END)
  ||' '|| (ARRAY['Nkolo','Mballa','Tchoua','Fotso','Kamdem','Ngono','Essomba','Manga','Ekwalla','Njoya','Ndongo','Abena','Etoa','Onana','Tabi','Ze','Bello','Ayissi','Nana','Talla','Sop','Dibom','Eyenga','Mfege','Njike','Owona','Bikoro','Ngu','Biya','Ela'])[(i%30)+1],
  (CASE WHEN i%2=0 THEN 'Masculin' ELSE 'Feminin' END),'ENS-2026-'||lpad(i::text,3,'0'),
  (ARRAY['Mathématiques','Français','Anglais','SVT','Physique-Chimie','Histoire-Géographie','EPS','Informatique','Espagnol','Philosophie'])[(i%10)+1],
  DATE '2026-09-01' - ((i%6)*365), 'actif','seed-lareussite-v1'
FROM generate_series(1,50) i;
INSERT INTO staff (id,school_id,name,gender,department,fonction,matricule,hire_date,status,active,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', d.nom, d.g, d.dept, d.fonction,'PERS-'||lpad(d.i::text,3,'0'), DATE '2026-09-01','actif',true,'seed-lareussite-v1'
FROM (VALUES
 (1,'Mballa Emmanuel','Masculin','direction','Coordonnateur Général'),(2,'Fotso Landry','Masculin','finance','Responsable Administratif et Financier'),
 (3,'Abena Carine','Feminin','finance','Caissière'),(4,'Njoya Blaise','Masculin','direction','Principal'),
 (5,'Etoa Chantal','Feminin','direction','Directrice du Primaire'),(6,'Manga Odile','Feminin','direction','Responsable Maternelle'),
 (7,'Tabi Serge','Masculin','pedagogie','Censeur'),(8,'Bello Achille','Masculin','vie_scolaire','Surveillant Général'),
 (9,'Ayissi Josiane','Feminin','administration','Secrétaire'),(10,'Onana Guy','Masculin','direction','Contrôleur de Gestion'),
 (11,'Dibom Rachel','Feminin','administration','Agent Comptable'),(12,'Sop Boris','Masculin','support','Chef de Maintenance'),
 (13,'Eyenga Flore','Feminin','support','Infirmière Scolaire'),(14,'Njike Armand','Masculin','support','Chef Gardien'),
 (15,'Owona Mireille','Feminin','support','Intendante')
) d(i,nom,g,dept,fonction);

-- ════ PÉRIODES (3 trimestres + 6 séquences ; seq3 = seule active ; verrous OFF pour seed) ════
WITH t AS (
 INSERT INTO academic_periods(school_id,school_year,type,name,sequence_order,status,is_locked,teaching_start,teaching_end,device_id)
 SELECT '31c70a36-065e-4933-a40c-1e9c051d1afc','2026-2027','trimestre',v.name,v.ord,v.status,false,v.ts::date,v.te::date,'seed-lareussite-v1'
 FROM (VALUES ('1er Trimestre',1,'closed','2026-09-08','2026-12-05'),
              ('2e Trimestre',2,'active','2027-01-06','2027-03-27'),
              ('3e Trimestre',3,'upcoming','2027-04-06','2027-07-15')) v(name,ord,status,ts,te)
 RETURNING id, sequence_order )
INSERT INTO academic_periods(school_id,school_year,type,parent_id,name,sequence_order,status,is_locked,device_id)
SELECT '31c70a36-065e-4933-a40c-1e9c051d1afc','2026-2027','sequence', t.id,'Séquence '||sq.g, sq.g, sq.status, false,'seed-lareussite-v1'
FROM (VALUES (1,1,'closed'),(2,1,'closed'),(3,2,'active'),(4,2,'upcoming'),(5,3,'upcoming'),(6,3,'upcoming')) sq(g,trim,status)
JOIN t ON t.sequence_order=sq.trim;
INSERT INTO sequence_dates(school_id,seq_key,seq_label,exam_date,deadline_date,device_id)
SELECT '31c70a36-065e-4933-a40c-1e9c051d1afc','seq'||d.g,'Séquence '||d.g,d.exam::date,d.dl::date,'seed-lareussite-v1'
FROM (VALUES (1,'2026-10-20','2026-10-27'),(2,'2026-11-24','2026-12-01'),(3,'2027-02-16','2027-02-23'),
             (4,'2027-03-16','2027-03-23'),(5,'2027-05-18','2027-05-25'),(6,'2027-06-15','2027-06-22')) d(g,exam,dl);

-- ════ CLASSES (28) ════
INSERT INTO classes (id,school_id,name,system,level,cycle,section,serie,evaluation_mode,current_year,year,unit_id,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc',v.name,v.sys,v.lvl,v.cyc,v.sect,v.serie,'notes','2026-2027','2026-2027',
       (SELECT id FROM school_units su WHERE su.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND su.section_key=v.usect),'seed-lareussite-v1'
FROM (VALUES
 ('Petite Section','FR','PS','maternelle','maternelle',NULL,'maternelle'),('Moyenne Section','FR','MS','maternelle','maternelle',NULL,'maternelle'),('Grande Section','FR','GS','maternelle','maternelle',NULL,'maternelle'),
 ('SIL','FR','SIL','primaire','primaire',NULL,'primaire'),('CP','FR','CP','primaire','primaire',NULL,'primaire'),('CE1','FR','CE1','primaire','primaire',NULL,'primaire'),('CE2','FR','CE2','primaire','primaire',NULL,'primaire'),('CM1','FR','CM1','primaire','primaire',NULL,'primaire'),('CM2','FR','CM2','primaire','primaire',NULL,'primaire'),
 ('Class 1','EN','Class 1','primaire','primaire_en',NULL,'primaire_en'),('Class 2','EN','Class 2','primaire','primaire_en',NULL,'primaire_en'),('Class 3','EN','Class 3','primaire','primaire_en',NULL,'primaire_en'),('Class 4','EN','Class 4','primaire','primaire_en',NULL,'primaire_en'),
 ('6e','FR','6e','college','college',NULL,'college'),('5e','FR','5e','college','college',NULL,'college'),('4e','FR','4e','college','college',NULL,'college'),('3e','FR','3e','college','college',NULL,'college'),
 ('2nde A','FR','2nde','lycee','lycee','A','college'),('2nde C','FR','2nde','lycee','lycee','C','college'),('1ere A','FR','1ere','lycee','lycee','A','college'),('1ere C','FR','1ere','lycee','lycee','C','college'),('Tle A','FR','Tle','lycee','lycee','A','college'),('Tle C','FR','Tle','lycee','lycee','C','college'),
 ('Form 1','EN','Form 1','secondaire','secondaire_en',NULL,'secondaire_en'),('Form 2','EN','Form 2','secondaire','secondaire_en',NULL,'secondaire_en'),('Form 3','EN','Form 3','secondaire','secondaire_en',NULL,'secondaire_en'),('Form 4','EN','Form 4','secondaire','secondaire_en',NULL,'secondaire_en'),('Form 5','EN','Form 5','secondaire','secondaire_en',NULL,'secondaire_en')
) v(name,sys,lvl,cyc,sect,serie,usect);

-- ════ MATIÈRES (par section ; maternelle exclue) ════
INSERT INTO subjects (id,school_id,class_id,name,short,coef,max,max_grade,year,position,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', c.id, t.name, t.short, t.coef, 20, 20,'2026-2027', t.pos,'seed-lareussite-v1'
FROM classes c JOIN (VALUES
 ('primaire','Français','FR',4,1),('primaire','Mathématiques','MATH',4,2),('primaire','Anglais','ANG',2,3),('primaire','Sciences d''Observation','SCI',2,4),('primaire','Histoire-Géographie','HG',2,5),('primaire','Éducation Civique et Morale','ECM',1,6),('primaire','EPS','EPS',1,7),
 ('primaire_en','English','ENG',4,1),('primaire_en','Mathematics','MATH',4,2),('primaire_en','French','FRE',2,3),('primaire_en','Science','SCI',2,4),('primaire_en','Social Studies','SOC',2,5),('primaire_en','Physical Education','PE',1,6),
 ('college','Français','FR',4,1),('college','Anglais','ANG',3,2),('college','Mathématiques','MATH',4,3),('college','SVT','SVT',2,4),('college','Physique-Chimie-Technologie','PCT',3,5),('college','Histoire-Géographie','HG',2,6),('college','Éducation Civique','ECM',1,7),('college','Informatique','INFO',1,8),('college','EPS','EPS',1,9),
 ('lycee','Français','FR',3,1),('lycee','Anglais','ANG',2,2),('lycee','Mathématiques','MATH',5,3),('lycee','Physique','PHY',4,4),('lycee','Chimie','CHI',3,5),('lycee','SVT','SVT',3,6),('lycee','Histoire-Géographie','HG',3,7),('lycee','Philosophie','PHILO',2,8),('lycee','Informatique','INFO',2,9),('lycee','EPS','EPS',1,10),
 ('secondaire_en','English Language','ENG',4,1),('secondaire_en','French','FRE',2,2),('secondaire_en','Mathematics','MATH',4,3),('secondaire_en','Biology','BIO',2,4),('secondaire_en','Physics','PHY',2,5),('secondaire_en','Chemistry','CHE',2,6),('secondaire_en','History','HIS',2,7),('secondaire_en','Geography','GEO',2,8),('secondaire_en','Computer Science','ICT',1,9),('secondaire_en','Physical Education','PE',1,10)
) t(sect,name,short,coef,pos) ON t.sect=c.section
WHERE c.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND c.device_id='seed-lareussite-v1';

-- ════ ÉLÈVES (~656) ════
WITH cls AS (
  SELECT c.id, c.name, c.section, c.cycle, c.unit_id,
    CASE c.section WHEN 'maternelle' THEN 16 WHEN 'primaire' THEN 28 WHEN 'primaire_en' THEN 22
      WHEN 'college' THEN 30 WHEN 'lycee' THEN 22 WHEN 'secondaire_en' THEN 20 ELSE 20 END n
  FROM classes c WHERE c.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND c.device_id='seed-lareussite-v1'
),
gen AS ( SELECT cls.*, (row_number() OVER (ORDER BY cls.name, g))::int rn FROM cls CROSS JOIN LATERAL generate_series(1,cls.n) g )
INSERT INTO students (id,school_id,class_id,name,reg,gender,dob,matricule,statut,statut_etablissement,year,created_at,updated_at,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', gen.id,
  (CASE WHEN rn%2=0 THEN (ARRAY['Jean','Paul','Samuel','Emmanuel','Eric','Franck','Serge','Landry','Cedric','Blaise','Boris','Yannick','Rodrigue','Achille','Guy','Herve','Armand','Ghislain','Pierre','Bruno'])[(rn%20)+1]
        ELSE (ARRAY['Marie','Christine','Solange','Brigitte','Estelle','Carine','Nadege','Laure','Prisca','Rachel','Sandrine','Vanessa','Larissa','Chantal','Odile','Bertille','Mireille','Josiane','Yolande','Flore'])[(rn%20)+1] END)
  ||' '|| (ARRAY['Nkolo','Mballa','Tchoua','Fotso','Kamdem','Ngono','Essomba','Manga','Ekwalla','Njoya','Ndongo','Abena','Etoa','Onana','Tabi','Ze','Bello','Ayissi','Nana','Talla','Sop','Dibom','Eyenga','Mfege','Njike','Owona','Bikoro','Ngu','Biya','Ela'])[((rn*7)%30)+1],
  '', CASE WHEN rn%2=0 THEN 'Masculin' ELSE 'Feminin' END,
  make_date( (CASE gen.section WHEN 'maternelle' THEN 2021 WHEN 'primaire' THEN 2015 WHEN 'primaire_en' THEN 2015
      WHEN 'college' THEN 2011 WHEN 'lycee' THEN 2008 ELSE 2010 END + (rn%3))::int, ((rn%12)+1)::int, ((rn%27)+1)::int),
  'ELV-2026-'||lpad(rn::text,4,'0'),
  CASE WHEN rn%9=0 THEN 'redoublant' WHEN rn%23=0 THEN 'transfere' ELSE 'nouveau' END,
  CASE WHEN rn%3=0 THEN 'nouveau' ELSE 'ancien' END,
  '2026-2027', (DATE '2026-09-05' + (rn%60))::timestamptz, now(),'seed-lareussite-v1'
FROM gen;

INSERT INTO student_class_assignments (id,school_id,student_id,class_id,class_name,assigned_at,date_debut,section,school_unit_id,type_transfert,commentaire,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', s.id, s.class_id, c.name, s.created_at, s.created_at, c.section, c.unit_id,
  CASE WHEN s.statut='transfere' THEN 'transfert_entrant' ELSE 'inscription' END,
  CASE WHEN s.statut='transfere' THEN 'Transféré d''un autre établissement' ELSE NULL END,'seed-lareussite-v1'
FROM students s JOIN classes c ON c.id=s.class_id
WHERE s.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND s.device_id='seed-lareussite-v1';

-- ════ NOTES (primaire+secondaire ; seq1-2 complètes, seq3 ~66% ; ~4% absents=NULL) ════
INSERT INTO grades (id,school_id,class_id,student_id,subject_id,sequence,value,year,updated_at,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', s.class_id, s.id, sub.id, seq.n,
  CASE WHEN hv%25=0 THEN NULL ELSE ((4 + hv%16))::text || CASE WHEN hv%4=0 THEN '.5' ELSE '' END END,
  '2026-2027', now(),'seed-lareussite-v1'
FROM students s
JOIN classes c ON c.id=s.class_id AND c.section<>'maternelle'
JOIN subjects sub ON sub.class_id=s.class_id AND sub.device_id='seed-lareussite-v1'
CROSS JOIN (VALUES (1),(2),(3)) seq(n)
CROSS JOIN LATERAL (SELECT ('x'||substr(md5(s.id::text||sub.id::text||seq.n::text),1,7))::bit(28)::int hv) h
WHERE s.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND s.device_id='seed-lareussite-v1'
  AND NOT (seq.n=3 AND hv%3=0);

-- ════ ABSENCES (agrégat/séquence, sous-ensemble) ════
INSERT INTO absences (id,school_id,class_id,student_id,seq_idx,justified,unjustified,year,server_updated_at)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', s.class_id, s.id, seq.n, (hv%4), (hv%3),'2026-2027', now()
FROM students s
JOIN classes c ON c.id=s.class_id AND c.section<>'maternelle'
CROSS JOIN (VALUES (1),(2)) seq(n)
CROSS JOIN LATERAL (SELECT ('x'||substr(md5(s.id::text||'abs'||seq.n::text),1,7))::bit(28)::int hv) h
WHERE s.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND s.device_id='seed-lareussite-v1'
  AND hv%5=0 AND (hv%4)+(hv%3) > 0;

-- ════ VIE SCOLAIRE (Surveillant) ════
CREATE TEMP TABLE _sv ON COMMIT DROP AS SELECT (SELECT id FROM auth.users WHERE email='surveillant@lareussite.test') sv, (SELECT id FROM auth.users WHERE email='censeur@lareussite.test') cs;
CREATE TEMP TABLE _sec ON COMMIT DROP AS
 SELECT s.id student_id, s.class_id, (row_number() OVER (ORDER BY s.matricule))::int rn
 FROM students s JOIN classes c ON c.id=s.class_id
 WHERE s.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND s.device_id='seed-lareussite-v1' AND c.section IN ('college','lycee','secondaire_en');
INSERT INTO late_arrivals (id,school_id,student_id,class_id,year_label,date,arrival_time,reason,justified,justification,validated,recorded_by,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', x.student_id, x.class_id,'2026-2027',(DATE '2026-10-02' + (x.rn*3))::date,'07:'||lpad((30+x.rn%25)::text,2,'0'),
  (ARRAY['Transport','Réveil tardif','Embouteillage','Raison familiale','Non justifié'])[(x.rn%5)+1], (x.rn%2=0), CASE WHEN x.rn%2=0 THEN 'Mot des parents' ELSE NULL END, (x.rn%3<>0), (SELECT sv FROM _sv),'seed-lareussite-v1'
FROM _sec x WHERE x.rn<=40;
INSERT INTO disciplinary_incidents (id,school_id,student_id,class_id,year_label,incident_type,date,incident_time,location,description,witnesses,severity,responsible,decision,status,recorded_by,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', x.student_id, x.class_id,'2026-2027',
  (ARRAY['Bagarre','Indiscipline en classe','Absences répétées','Tricherie à un devoir','Insolence','Dégradation de matériel'])[(x.rn%6)+1],
  (DATE '2026-10-10' + (x.rn*4))::date,'10:15','Cour de récréation','Incident constaté par le surveillant général.','Deux camarades',
  (ARRAY['legere','moyenne','grave'])[(x.rn%3)+1], (SELECT sv FROM _sv), CASE WHEN x.rn%3=0 THEN NULL ELSE 'Sanction appliquée' END,
  CASE WHEN x.rn%3=0 THEN 'ouvert' WHEN x.rn%3=1 THEN 'en_cours' ELSE 'clos' END, (SELECT sv FROM _sv),'seed-lareussite-v1'
FROM _sec x WHERE x.rn<=16;
INSERT INTO disciplinary_actions (id,school_id,student_id,class_id,incident_id,year_label,action_type,date,reason,duration_days,start_date,end_date,decided_by,recorded_by,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', x.student_id, x.class_id,
  (SELECT di.id FROM disciplinary_incidents di WHERE di.student_id=x.student_id AND di.device_id='seed-lareussite-v1' LIMIT 1),'2026-2027',
  (ARRAY['Avertissement écrit','Exclusion temporaire','Travaux d''intérêt général','Blâme'])[(x.rn%4)+1],(DATE '2026-10-12' + (x.rn*4))::date,'Suite à incident disciplinaire',
  CASE WHEN x.rn%4=1 THEN 2 ELSE NULL END, CASE WHEN x.rn%4=1 THEN (DATE '2026-10-13' + (x.rn*4))::date ELSE NULL END, CASE WHEN x.rn%4=1 THEN (DATE '2026-10-15' + (x.rn*4))::date ELSE NULL END,
  'M. Tabi Serge (Censeur)', (SELECT sv FROM _sv),'seed-lareussite-v1'
FROM _sec x WHERE x.rn BETWEEN 1 AND 10;
INSERT INTO student_warnings (id,school_id,student_id,class_id,year_label,warning_type,category,date,reason,acknowledged,recorded_by,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', x.student_id, x.class_id,'2026-2027',
  (ARRAY['Travail insuffisant','Comportement','Absentéisme'])[(x.rn%3)+1],(ARRAY['pedagogique','discipline'])[(x.rn%2)+1],(DATE '2026-11-05' + (x.rn))::date,
  'Avertissement notifié à l''élève et aux parents.', (x.rn%2=0), (SELECT sv FROM _sv),'seed-lareussite-v1'
FROM _sec x WHERE x.rn BETWEEN 41 AND 52;
INSERT INTO student_detentions (id,school_id,student_id,class_id,year_label,date,start_time,end_time,duration_hours,task,supervised_by,completed,recorded_by,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', x.student_id, x.class_id,'2026-2027',(DATE '2026-11-15' + (x.rn))::date,'15:00','17:00',2,'Devoir supplémentaire encadré','M. Bello Achille', (x.rn%2=0), (SELECT sv FROM _sv),'seed-lareussite-v1'
FROM _sec x WHERE x.rn BETWEEN 53 AND 58;
INSERT INTO parent_meetings (id,school_id,student_id,class_id,incident_id,year_label,target,reason,meeting_date,meeting_time,location,status,outcome,convened_by,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', x.student_id, x.class_id,
  (SELECT di.id FROM disciplinary_incidents di WHERE di.student_id=x.student_id AND di.device_id='seed-lareussite-v1' LIMIT 1),'2026-2027',
  (ARRAY['discipline','travail','information'])[(x.rn%3)+1],'Convocation des parents',(DATE '2027-02-10' + (x.rn*2))::date,'14:00','Bureau du surveillant général',
  (ARRAY['planifie','tenu','annule'])[(x.rn%3)+1], CASE WHEN x.rn%3=1 THEN 'Entretien tenu, engagement de l''élève' ELSE NULL END, (SELECT sv FROM _sv),'seed-lareussite-v1'
FROM _sec x WHERE x.rn BETWEEN 1 AND 8;
INSERT INTO exit_permissions (id,school_id,student_id,class_id,year_label,exit_type,date,exit_time,return_time,reason,authorized_by,accompanied_by,returned,recorded_by,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', x.student_id, x.class_id,'2026-2027',
  (ARRAY['parentale','medicale','administrative'])[(x.rn%3)+1],(DATE '2027-02-05' + (x.rn))::date,'10:00', CASE WHEN x.rn%2=0 THEN '12:00' ELSE NULL END,
  'Rendez-vous / raison familiale','M. Bello Achille', CASE WHEN x.rn%3=0 THEN 'Parent' ELSE NULL END, (x.rn%2=0), (SELECT sv FROM _sv),'seed-lareussite-v1'
FROM _sec x WHERE x.rn BETWEEN 60 AND 69;

-- ════ SCOLARITÉ (catalogue, grilles, pension agrégée, encaissements, frais/élève) ════
INSERT INTO fee_catalog (id,school_id,name,category,amount,academic_year,mandatory,optional,payment_type,active,position,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', v.name,v.cat,v.amt,'2026-2027',v.mand,v.opt,v.pt,true,v.pos,'seed-lareussite-v1'
FROM (VALUES
 ('Uniforme scolaire','equipement',25000,true,false,'unique',1),('Assurance scolaire','assurance',5000,true,false,'unique',2),
 ('Cotisation APEE','association',10000,true,false,'unique',3),('Coopérative scolaire','cooperative',3000,true,false,'unique',4),
 ('Frais d''examen','examen',15000,true,false,'unique',5),('Carte scolaire','administratif',2000,true,false,'unique',6),
 ('Fournitures & manuels','pedagogique',20000,true,false,'unique',7),('Photo scolaire','divers',2000,true,false,'unique',8),
 ('Transport scolaire','transport',50000,false,true,'echelonne',9),('Cantine','restauration',60000,false,true,'echelonne',10),
 ('Cours de soutien','pedagogique',30000,false,true,'echelonne',11),('Sortie pédagogique','activite',8000,false,true,'unique',12)
) v(name,cat,amt,mand,opt,pt,pos);
INSERT INTO class_fee_grids (id,school_id,class_id,academic_year,amount_inscription,amount_comptant,amount_echelonne,tranches,currency,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', c.id,'2026-2027', a.insc, a.annual, a.annual+5000,
  jsonb_build_array(
    jsonb_build_object('label','1ère tranche','amount',round(a.annual*0.4),'due','2026-10-15'),
    jsonb_build_object('label','2e tranche','amount',round(a.annual*0.3),'due','2027-01-15'),
    jsonb_build_object('label','3e tranche','amount',a.annual-round(a.annual*0.4)-round(a.annual*0.3),'due','2027-04-15')
  ),'XAF','seed-lareussite-v1'
FROM classes c CROSS JOIN LATERAL (SELECT
   CASE c.section WHEN 'maternelle' THEN 150000 WHEN 'primaire' THEN 180000 WHEN 'primaire_en' THEN 200000 WHEN 'college' THEN 250000 WHEN 'lycee' THEN 300000 ELSE 320000 END annual,
   CASE c.section WHEN 'maternelle' THEN 30000 WHEN 'primaire' THEN 35000 WHEN 'primaire_en' THEN 40000 WHEN 'college' THEN 40000 WHEN 'lycee' THEN 50000 ELSE 50000 END insc) a
WHERE c.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND c.device_id='seed-lareussite-v1';
CREATE TEMP TABLE _stf ON COMMIT DROP AS
SELECT s.id student_id, s.class_id, c.section,
  (CASE c.section WHEN 'maternelle' THEN 150000 WHEN 'primaire' THEN 180000 WHEN 'primaire_en' THEN 200000 WHEN 'college' THEN 250000 WHEN 'lycee' THEN 300000 ELSE 320000 END)::int annual,
  ('x'||substr(md5(s.id::text||'fee'),1,7))::bit(28)::int hv
FROM students s JOIN classes c ON c.id=s.class_id
WHERE s.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND s.device_id='seed-lareussite-v1';
ALTER TABLE _stf ADD COLUMN bucket int; UPDATE _stf SET bucket=hv%5;
ALTER TABLE _stf ADD COLUMN paid int; UPDATE _stf SET paid = round(annual * (ARRAY[0,0.30,0.55,0.80,1.0])[bucket+1])::numeric;
INSERT INTO student_fees (id,school_id,student_id,academic_year,frais_annuels,frais_payes,date_dernier_paiement,payment_mode,tranches,adjustments,created_at,updated_at,version,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', student_id,'2026-2027', annual, paid,
  CASE WHEN paid>0 THEN (DATE '2026-10-05' + (hv%120))::date ELSE NULL END, CASE WHEN bucket>=3 THEN 'echelonne' ELSE 'comptant' END,
  '[]'::jsonb,'[]'::jsonb, now(), now(),1,'seed-lareussite-v1'
FROM _stf;
INSERT INTO fee_payments (id,school_id,student_id,academic_year,amount,date,note,recorded_by,updated_at,version,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', student_id,'2026-2027',
  CASE WHEN part=1 THEN (CASE WHEN bucket>=3 THEN round(paid*0.6)::int ELSE paid END) ELSE (paid - round(paid*0.6)::int) END,
  (DATE '2026-10-05' + (hv%120) + (part-1)*45)::date,'Reçu N° R-'||lpad((hv%9000+1000)::text,4,'0')||'-'||part,
  (SELECT id FROM auth.users WHERE email='caissiere@lareussite.test'), now(),1,'seed-lareussite-v1'
FROM _stf CROSS JOIN LATERAL generate_series(1, CASE WHEN bucket>=3 THEN 2 ELSE 1 END) part WHERE paid>0;
INSERT INTO student_fee_items (id,school_id,student_id,fee_catalog_id,academic_year,name,category,amount,mandatory,payment_type,status,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', st.student_id, fc.id,'2026-2027', fc.name, fc.category, fc.amount, true, fc.payment_type,
  CASE WHEN st.bucket=4 THEN 'paye' WHEN st.bucket IN (2,3) THEN 'partiel' ELSE 'impaye' END,'seed-lareussite-v1'
FROM _stf st JOIN fee_catalog fc ON fc.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND fc.device_id='seed-lareussite-v1' AND fc.mandatory;

-- ════ BUDGET + LIGNES + DÉPENSES (CAS A→H) + DÉBLOCAGE + AUDIT + NOTIFS ════
INSERT INTO budgets (id,school_id,academic_year,label,status,tier,envelope_amount,created_at,updated_at,version,device_id)
VALUES (gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc','2026-2027','Budget annuel 2026-2027','active','annual',30000000, now(), now(),1,'seed-lareussite-v1');
CREATE TEMP TABLE _fin ON COMMIT DROP AS SELECT
 (SELECT id FROM budgets WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND device_id='seed-lareussite-v1' LIMIT 1) bid,
 (SELECT id FROM auth.users WHERE email='hfiwdsjfci@gmail.com') fond,
 (SELECT id FROM auth.users WHERE email='coordonnateur@lareussite.test') coord,
 (SELECT id FROM auth.users WHERE email='raf@lareussite.test') raf,
 (SELECT id FROM auth.users WHERE email='caissiere@lareussite.test') caiss;
INSERT INTO budget_chapters (id,school_id,budget_id,code,label,kind,planned_amount,position,status,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc',(SELECT bid FROM _fin), v.code, v.label, v.kind, v.amt, v.pos,'active','seed-lareussite-v1'
FROM (VALUES
 ('R-SCOL','Frais de scolarité','recette',90000000,1),('R-INSC','Frais d''inscription','recette',12000000,2),('R-DON','Subventions & dons','recette',2000000,3),
 ('FOURN','Fournitures pédagogiques','depense',3000000,10),('ENTR','Entretien & maintenance','depense',3000000,11),('ELEC','Électricité & eau','depense',1800000,12),
 ('INFO','Informatique','depense',2500000,13),('COMM','Communication','depense',600000,14),('ACTI','Activités scolaires','depense',1200000,15),
 ('EXAM','Examens','depense',1500000,16),('TRANS','Transport','depense',1000000,17),('SECU','Sécurité','depense',900000,18),
 ('HYG','Hygiène','depense',700000,19),('IMPR','Imprévus','depense',1000000,20),('SAL','Salaires & charges','depense',12000000,21)
) v(code,label,kind,amt,pos);
-- dépenses de base (payées) → états de consommation variés (0 % .. ~94 %)
INSERT INTO budget_expenses (id,school_id,budget_id,budget_chapter_id,category,amount,requester,status,expense_date,notes,created_by,created_at,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc',(SELECT bid FROM _fin), ch.id, ch.label, base.amt,'M. Fotso Landry (RAF)','paid',
 (DATE '2026-11-01' + base.pos)::date,'Dépense de fonctionnement','M. Fotso Landry (RAF)', (DATE '2026-11-01' + base.pos)::timestamptz,'seed-lareussite-v1'
FROM (VALUES ('FOURN',1300000,1),('ENTR',600000,2),('ELEC',900000,3),('INFO',350000,4),('COMM',180000,5),('EXAM',600000,6),('TRANS',200000,7),('SECU',850000,8),('HYG',385000,9),('SAL',6000000,10)) base(code,amt,pos)
JOIN budget_chapters ch ON ch.budget_id=(SELECT bid FROM _fin) AND ch.code=base.code AND ch.device_id='seed-lareussite-v1';
-- CAS A→H
INSERT INTO budget_expenses (id,school_id,budget_id,budget_chapter_id,category,subcategory,amount,requester,status,expense_date,notes,created_by,created_at,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc',(SELECT bid FROM _fin), ch.id, ch.label, v.cas, v.amt, v.requester, v.status, v.dt::date, v.notes, v.requester, v.dt::timestamptz,'seed-lareussite-v1'
FROM (VALUES
 ('CAS-A','FOURN',85000,'Mme Abena Carine (Caissière)','submitted','2027-02-09','Achat de fournitures — EN ATTENTE approbation Coordonnateur'),
 ('CAS-B','INFO',450000,'M. Fotso Landry (RAF)','approved','2027-02-03','Maintenance parc informatique — approuvée par la Fondatrice'),
 ('CAS-C','COMM',125000,'Mme Abena Carine (Caissière)','paid','2027-02-10','Communication — approuvée Coordonnateur puis décaissée'),
 ('CAS-D','ENTR',1850000,'M. Fotso Landry (RAF)','submitted','2027-02-12','Réfection toiture — EN ATTENTE décision de la Fondatrice'),
 ('CAS-E','ACTI',300000,'Mme Abena Carine (Caissière)','rejected','2027-01-20','REJETÉE : activité non prioritaire, budget insuffisant'),
 ('CAS-F','EXAM',220000,'M. Fotso Landry (RAF)','approved','2027-02-06','Examens blancs — approuvée, non encore décaissée'),
 ('CAS-G','HYG',175000,'Mme Abena Carine (Caissière)','paid','2027-01-28','Produits d''hygiène — exécutée et décaissée'),
 ('CAS-H','SECU',250000,'M. Fotso Landry (RAF)','draft','2027-02-13','TENTATIVE BLOQUÉE : dépasse le disponible de la ligne Sécurité (voir demande de déblocage)')
) v(cas,code,amt,requester,status,dt,notes)
JOIN budget_chapters ch ON ch.budget_id=(SELECT bid FROM _fin) AND ch.code=v.code AND ch.device_id='seed-lareussite-v1';
-- CAS H : demande de déblocage en attente
INSERT INTO budget_unlock_requests (id,school_id,budget_id,budget_chapter_id,requested_amount,reason,requester,requested_by,status,created_at,version,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc',(SELECT bid FROM _fin), ch.id, 250000,
 'Ligne Sécurité presque épuisée — besoin de gardiennage supplémentaire','M. Fotso Landry (RAF)','M. Fotso Landry (RAF)','pending', now(),1,'seed-lareussite-v1'
FROM budget_chapters ch WHERE ch.budget_id=(SELECT bid FROM _fin) AND ch.code='SECU' AND ch.device_id='seed-lareussite-v1';
-- domain_events (chronologie des décisions)
INSERT INTO domain_events (id,school_id,aggregate_type,aggregate_id,event_type,payload,actor_id,actor_name,occurred_at,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc','expense', e.id, ev.etype,
  jsonb_build_object('amount',e.amount,'chapter',e.category,'status',ev.newstatus,'seed','seed-lareussite-v1'),
  (SELECT id FROM auth.users WHERE email=ev.actor_email), ev.actor_name, ev.occ::timestamptz,'seed-lareussite-v1'
FROM (VALUES
 ('CAS-A','ExpenseSubmitted','submitted','caissiere@lareussite.test','Mme Abena Carine (Caissière)','2027-02-09 10:15'),
 ('CAS-B','ExpenseSubmitted','submitted','raf@lareussite.test','M. Fotso Landry (RAF)','2027-02-01 09:00'),
 ('CAS-B','ExpenseApproved','approved','hfiwdsjfci@gmail.com','Mme Ngono Solange (Fondatrice)','2027-02-03 16:30'),
 ('CAS-C','ExpenseSubmitted','submitted','caissiere@lareussite.test','Mme Abena Carine (Caissière)','2027-02-10 10:15'),
 ('CAS-C','ExpenseApproved','approved','coordonnateur@lareussite.test','M. Mballa Emmanuel (Coordonnateur Général)','2027-02-10 11:47'),
 ('CAS-C','ExpensePaid','paid','raf@lareussite.test','M. Fotso Landry (RAF)','2027-02-10 14:20'),
 ('CAS-D','ExpenseSubmitted','submitted','raf@lareussite.test','M. Fotso Landry (RAF)','2027-02-12 08:40'),
 ('CAS-E','ExpenseSubmitted','submitted','caissiere@lareussite.test','Mme Abena Carine (Caissière)','2027-01-19 15:00'),
 ('CAS-E','ExpenseRejected','rejected','coordonnateur@lareussite.test','M. Mballa Emmanuel (Coordonnateur Général)','2027-01-20 09:10'),
 ('CAS-F','ExpenseSubmitted','submitted','raf@lareussite.test','M. Fotso Landry (RAF)','2027-02-05 11:00'),
 ('CAS-F','ExpenseApproved','approved','coordonnateur@lareussite.test','M. Mballa Emmanuel (Coordonnateur Général)','2027-02-06 10:05'),
 ('CAS-G','ExpenseSubmitted','submitted','caissiere@lareussite.test','Mme Abena Carine (Caissière)','2027-01-27 09:30'),
 ('CAS-G','ExpenseApproved','approved','coordonnateur@lareussite.test','M. Mballa Emmanuel (Coordonnateur Général)','2027-01-27 14:00'),
 ('CAS-G','ExpensePaid','paid','caissiere@lareussite.test','Mme Abena Carine (Caissière)','2027-01-28 10:00')
) ev(cas,etype,newstatus,actor_email,actor_name,occ)
JOIN budget_expenses e ON e.subcategory=ev.cas AND e.device_id='seed-lareussite-v1' AND e.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc';
INSERT INTO domain_events (id,school_id,aggregate_type,aggregate_id,event_type,payload,actor_id,actor_name,occurred_at,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc','expense', e.id,'ExpensePaid',
 jsonb_build_object('amount',e.amount,'chapter',e.category,'status','paid','seed','seed-lareussite-v1'),
 (SELECT raf FROM _fin),'M. Fotso Landry (RAF)', e.created_at,'seed-lareussite-v1'
FROM budget_expenses e WHERE e.device_id='seed-lareussite-v1' AND e.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND e.subcategory IS NULL AND e.status='paid';
INSERT INTO domain_events (id,school_id,aggregate_type,aggregate_id,event_type,payload,actor_id,actor_name,occurred_at,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc','budget_unlock', ur.id,'BudgetUnlockRequested',
 jsonb_build_object('amount',ur.requested_amount,'chapter','Sécurité','seed','seed-lareussite-v1'),(SELECT raf FROM _fin),'M. Fotso Landry (RAF)','2027-02-13 09:00'::timestamptz,'seed-lareussite-v1'
FROM budget_unlock_requests ur WHERE ur.device_id='seed-lareussite-v1' AND ur.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc';
INSERT INTO audit_events (id,school_id,action,aggregate_type,target_id,actor_id,actor_name,payload,at)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', a.action,'expense', e.id,
 (SELECT id FROM auth.users WHERE email=a.actor_email), a.actor_name, jsonb_build_object('amount',e.amount,'chapter',e.category,'seed','seed-lareussite-v1'), a.at::timestamptz
FROM (VALUES
 ('CAS-B','expense.approved','hfiwdsjfci@gmail.com','Mme Ngono Solange (Fondatrice)','2027-02-03 16:30'),
 ('CAS-C','expense.paid','raf@lareussite.test','M. Fotso Landry (RAF)','2027-02-10 14:20'),
 ('CAS-E','expense.rejected','coordonnateur@lareussite.test','M. Mballa Emmanuel (Coordonnateur Général)','2027-01-20 09:10'),
 ('CAS-F','expense.approved','coordonnateur@lareussite.test','M. Mballa Emmanuel (Coordonnateur Général)','2027-02-06 10:05'),
 ('CAS-G','expense.paid','caissiere@lareussite.test','Mme Abena Carine (Caissière)','2027-01-28 10:00')
) a(cas,action,actor_email,actor_name,at)
JOIN budget_expenses e ON e.subcategory=a.cas AND e.device_id='seed-lareussite-v1' AND e.school_id='31c70a36-065e-4933-a40c-1e9c051d1afc';
INSERT INTO notifications (id,school_id,recipient_id,recipient_role,type,title,body,link,read,device_id)
SELECT gen_random_uuid(),'31c70a36-065e-4933-a40c-1e9c051d1afc', r.rid, r.role, r.type, r.title, r.body,'/app/depenses',false,'seed-lareussite-v1'
FROM (VALUES
 ((SELECT fond FROM _fin),'fondatrice','expense.pending','Dépense en attente de votre décision','Réfection toiture — 1 850 000 FCFA (ligne Entretien) à approuver.'),
 ((SELECT coord FROM _fin),'coordonnateur_general','expense.pending','Dépense en attente d''approbation','Fournitures — 85 000 FCFA (ligne Fournitures) soumise par la Caissière.'),
 ((SELECT fond FROM _fin),'fondatrice','unlock.pending','Demande de déblocage de ligne','Sécurité : demande de 250 000 FCFA (ligne presque épuisée).'),
 ((SELECT coord FROM _fin),'coordonnateur_general','unlock.pending','Demande de déblocage de ligne','Sécurité : demande de 250 000 FCFA en attente de décision.')
) r(rid,role,type,title,body);

-- ════ NORMALISATION updated_at ════
-- Plusieurs tables n'ont pas de DEFAULT sur updated_at : sans valeur, une ligne à
-- updated_at NULL n'est JAMAIS reprise par la synchro incrémentale (le curseur
-- .gt('updated_at',…) exclut NULL) → le drain d'appairage ne converge pas. On
-- garantit donc un updated_at sur toutes les lignes du seed.
DO $$
DECLARE t text;
  tbls text[] := ARRAY['teachers','staff','fee_catalog','student_fee_items','budget_chapters','budget_expenses','budget_unlock_requests','notifications','user_governance_roles'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('UPDATE %I SET updated_at=now() WHERE school_id=%L AND device_id=%L AND updated_at IS NULL',
                   t, '31c70a36-065e-4933-a40c-1e9c051d1afc', 'seed-lareussite-v1');
  END LOOP;
  UPDATE school_units SET updated_at=now() WHERE school_id='31c70a36-065e-4933-a40c-1e9c051d1afc' AND updated_at IS NULL;
END $$;

COMMIT;
