-- ════════════════════════════════════════════════════════════════════════════
-- RECETTE MAARIF SCHOOL OF CAMEROON — jeu de données 100 % FICTIF, IDENTIFIABLE,
-- ADDITIF et RÉVERSIBLE. Aucune donnée existante n'est modifiée/supprimée.
-- (Exception assumée : deployment_policy remise à NULL = valeur d'origine de MAARIF
--  avant l'activation pilote — nécessaire pour tester la finance depuis l'UI SANS
--  serveur LAN ; ré-appliquer supabase/pilot_activate_maarif.sql pour re-activer l'hybride.)
--
-- Convention de nettoyage : tout est préfixé « [RECETTE] », emails « @maarif.test »,
-- UUID en « a0000000-… » (comptes/MAARIF) et « b0000000-… » (école B).
-- Nettoyage : supabase/recette_maarif_cleanup.sql.
-- Idempotent (WHERE NOT EXISTS / ON CONFLICT DO NOTHING) → ré-exécutable.
-- Mot de passe de tous les comptes de recette : Recette2027!
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── 0. MAARIF : repasse en mode Cloud natif (finance écrivable dans l'UI) ──────
UPDATE schools SET deployment_policy = NULL
WHERE id = '369fa0e3-318f-4130-94b3-6f14d007ca85';

-- ── 1. Correctif gouvernance : coordonnateur_general reçoit l'autorité d'approbation
--       attendue par validation_rules (palier 25k–250k). Idempotent (union).
UPDATE governance_roles
SET permissions = (
  SELECT jsonb_agg(DISTINCT p ORDER BY p)
  FROM jsonb_array_elements_text(
    permissions || '["expense.approve","expense.reject","budget.approve"]'::jsonb
  ) AS p)
WHERE school_id = '369fa0e3-318f-4130-94b3-6f14d007ca85' AND code = 'coordonnateur_general';

-- ── 2. Établissement B (isolation multi-tenant) — minimal, fictif ─────────────
INSERT INTO schools (id, name, current_year)
SELECT 'b0000000-0000-4000-8000-0000000000b1', '[RECETTE] École B (isolation)', '2026-2027'
WHERE NOT EXISTS (SELECT 1 FROM schools WHERE id = 'b0000000-0000-4000-8000-0000000000b1');

-- ── 3. Comptes de recette (auth + memberships + rôles de gouvernance) ─────────
CREATE TEMP TABLE _rec(uid uuid, email text, full_name text, school_id uuid, base_role text, gov_role text, remote bool) ON COMMIT DROP;
INSERT INTO _rec VALUES
  -- 7 permanents MAARIF
  ('a0000000-0000-4000-8000-000000000001','recette.fondatrice@maarif.test','[RECETTE] Fondatrice','369fa0e3-318f-4130-94b3-6f14d007ca85','censeur','fondatrice',true),
  ('a0000000-0000-4000-8000-000000000002','recette.coordonnateur@maarif.test','[RECETTE] Coordonnateur Général','369fa0e3-318f-4130-94b3-6f14d007ca85','censeur','coordonnateur_general',true),
  ('a0000000-0000-4000-8000-000000000003','recette.administration@maarif.test','[RECETTE] Administration','369fa0e3-318f-4130-94b3-6f14d007ca85','admin',NULL,false),
  ('a0000000-0000-4000-8000-000000000004','recette.pedagogie@maarif.test','[RECETTE] Responsable Pédagogique','369fa0e3-318f-4130-94b3-6f14d007ca85','censeur','principal',false),
  ('a0000000-0000-4000-8000-000000000005','recette.raf@maarif.test','[RECETTE] Responsable Financier (RAF)','369fa0e3-318f-4130-94b3-6f14d007ca85','censeur','raf',false),
  ('a0000000-0000-4000-8000-000000000006','recette.controleur@maarif.test','[RECETTE] Contrôleur','369fa0e3-318f-4130-94b3-6f14d007ca85','censeur','controleur',true),
  ('a0000000-0000-4000-8000-000000000007','recette.caissier@maarif.test','[RECETTE] Caissier','369fa0e3-318f-4130-94b3-6f14d007ca85','censeur','caissier',false),
  -- Échantillon d'enseignants
  ('a0000000-0000-4000-8000-000000000011','recette.prof1@maarif.test','[RECETTE] Enseignant 1','369fa0e3-318f-4130-94b3-6f14d007ca85','teacher',NULL,false),
  ('a0000000-0000-4000-8000-000000000012','recette.prof2@maarif.test','[RECETTE] Enseignant 2','369fa0e3-318f-4130-94b3-6f14d007ca85','teacher',NULL,false),
  ('a0000000-0000-4000-8000-000000000013','recette.prof3@maarif.test','[RECETTE] Enseignant 3','369fa0e3-318f-4130-94b3-6f14d007ca85','teacher',NULL,false),
  -- Compte de l'école B (pour tester l'isolation)
  ('a0000000-0000-4000-8000-0000000000b1','recette.ecoleb@maarif.test','[RECETTE] Admin École B','b0000000-0000-4000-8000-0000000000b1','admin',NULL,false);

-- 3a. auth.users (e-mail confirmé, mot de passe bcrypt)
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
SELECT '00000000-0000-0000-0000-000000000000', r.uid, 'authenticated', 'authenticated', r.email,
       crypt('Recette2027!', gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', r.full_name)
FROM _rec r
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.uid OR lower(u.email) = lower(r.email));

-- 3b. auth.identities (identité e-mail → connexion possible)
INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
SELECT gen_random_uuid(), r.uid, 'email', r.uid::text,
       jsonb_build_object('sub', r.uid::text, 'email', r.email, 'email_verified', true),
       now(), now(), now()
FROM _rec r
WHERE NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = r.uid AND i.provider = 'email');

-- 3c. school_users (membership + capacité d'accès distant)
INSERT INTO school_users (id, school_id, user_id, role, active, remote_access_allowed, full_name)
SELECT gen_random_uuid(), r.school_id, r.uid, r.base_role, true, r.remote, r.full_name
FROM _rec r
WHERE NOT EXISTS (SELECT 1 FROM school_users su WHERE su.school_id = r.school_id AND su.user_id = r.uid);

-- 3d. user_governance_roles (rôles de direction réels du catalogue)
INSERT INTO user_governance_roles (id, school_id, user_id, role)
SELECT gen_random_uuid(), r.school_id, r.uid, r.gov_role
FROM _rec r
WHERE r.gov_role IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_governance_roles ug WHERE ug.school_id = r.school_id AND ug.user_id = r.uid AND ug.role = r.gov_role);

-- ── 4. Échantillon pédagogique MAARIF (identifiable, minimal) ─────────────────
-- Classe de recette + 3 matières + 3 élèves + notes (Séquence 1).
INSERT INTO classes (id, school_id, name, system, level, current_year)
SELECT 'a0000000-0000-4000-9000-000000000c01', '369fa0e3-318f-4130-94b3-6f14d007ca85', '[RECETTE] Classe Test', 'FR', '6e', '2026-2027'
WHERE NOT EXISTS (SELECT 1 FROM classes WHERE id = 'a0000000-0000-4000-9000-000000000c01');

INSERT INTO subjects (id, school_id, class_id, name, coef, max)
SELECT v.id::uuid, '369fa0e3-318f-4130-94b3-6f14d007ca85', 'a0000000-0000-4000-9000-000000000c01', v.name, v.coef, 20
FROM (VALUES
  ('a0000000-0000-4000-9000-0000000000b1','[RECETTE] Mathématiques',4),
  ('a0000000-0000-4000-9000-0000000000b2','[RECETTE] Français',4),
  ('a0000000-0000-4000-9000-0000000000b3','[RECETTE] Anglais',2)
) AS v(id,name,coef)
WHERE NOT EXISTS (SELECT 1 FROM subjects WHERE id = v.id::uuid);

INSERT INTO students (id, school_id, class_id, name, gender)
SELECT v.id::uuid, '369fa0e3-318f-4130-94b3-6f14d007ca85', 'a0000000-0000-4000-9000-000000000c01', v.name, v.gender
FROM (VALUES
  ('a0000000-0000-4000-9000-0000000000e1','[RECETTE] Élève Un','Masculin'),
  ('a0000000-0000-4000-9000-0000000000e2','[RECETTE] Élève Deux','Feminin'),
  ('a0000000-0000-4000-9000-0000000000e3','[RECETTE] Élève Trois','Masculin')
) AS v(id,name,gender)
WHERE NOT EXISTS (SELECT 1 FROM students WHERE id = v.id::uuid);

-- Notes Séquence 1 (3 élèves × 3 matières).
INSERT INTO grades (id, school_id, class_id, student_id, subject_id, sequence, value)
SELECT gen_random_uuid(), '369fa0e3-318f-4130-94b3-6f14d007ca85', 'a0000000-0000-4000-9000-000000000c01', s.sid, sub.subid, 1, g.val
FROM (VALUES
  ('a0000000-0000-4000-9000-0000000000e1','a0000000-0000-4000-9000-0000000000b1','14'),
  ('a0000000-0000-4000-9000-0000000000e1','a0000000-0000-4000-9000-0000000000b2','12'),
  ('a0000000-0000-4000-9000-0000000000e1','a0000000-0000-4000-9000-0000000000b3','16'),
  ('a0000000-0000-4000-9000-0000000000e2','a0000000-0000-4000-9000-0000000000b1','09'),
  ('a0000000-0000-4000-9000-0000000000e2','a0000000-0000-4000-9000-0000000000b2','15'),
  ('a0000000-0000-4000-9000-0000000000e2','a0000000-0000-4000-9000-0000000000b3','11'),
  ('a0000000-0000-4000-9000-0000000000e3','a0000000-0000-4000-9000-0000000000b1','18'),
  ('a0000000-0000-4000-9000-0000000000e3','a0000000-0000-4000-9000-0000000000b2','08'),
  ('a0000000-0000-4000-9000-0000000000e3','a0000000-0000-4000-9000-0000000000b3','13')
) AS g(sid, subid, val)
JOIN (SELECT 'a0000000-0000-4000-9000-0000000000e1'::uuid AS sid UNION ALL SELECT 'a0000000-0000-4000-9000-0000000000e2' UNION ALL SELECT 'a0000000-0000-4000-9000-0000000000e3') s ON s.sid::text = g.sid
JOIN (SELECT 'a0000000-0000-4000-9000-0000000000b1'::uuid AS subid UNION ALL SELECT 'a0000000-0000-4000-9000-0000000000b2' UNION ALL SELECT 'a0000000-0000-4000-9000-0000000000b3') sub ON sub.subid::text = g.subid
WHERE NOT EXISTS (
  SELECT 1 FROM grades gr WHERE gr.class_id='a0000000-0000-4000-9000-000000000c01'
    AND gr.student_id = g.sid::uuid AND gr.subject_id = g.subid::uuid AND gr.sequence = 1);

-- ── 5. École B : 1 classe + 1 élève (pour vérifier l'isolation) ───────────────
INSERT INTO classes (id, school_id, name, system, level, current_year)
SELECT 'b0000000-0000-4000-8000-0000000000c1', 'b0000000-0000-4000-8000-0000000000b1', '[RECETTE] B — CM2', 'FR', 'CM2', '2026-2027'
WHERE NOT EXISTS (SELECT 1 FROM classes WHERE id = 'b0000000-0000-4000-8000-0000000000c1');
INSERT INTO students (id, school_id, class_id, name, gender)
SELECT 'b0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-0000000000c1', '[RECETTE] Élève B', 'Feminin'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE id = 'b0000000-0000-4000-8000-0000000000d1');

-- ── 6. Budget ────────────────────────────────────────────────────────────────
-- PAS de budget de recette créé : une contrainte `budgets_annual_unique`
-- (school_id, academic_year) impose UN SEUL budget annuel par an, et MAARIF a DÉJÀ
-- un budget annuel 2026-2027 (démo, 12 M). Avec deployment_policy remise à NULL
-- (§0), ce budget existant devient écrivable depuis l'UI → les tests du cycle de
-- vie (modification / lignes / allocations / activation / révision / réallocation /
-- dépenses / plafonds) se font DESSUS. Ne pas le supprimer (décision de l'utilisateur).

COMMIT;
