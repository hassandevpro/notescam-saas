-- NotesCam — Donnees fictives ecole Hassan
-- Supabase > SQL Editor > New query > coller > Run

DO $$
DECLARE
  v_school_id uuid;
  v_term_a    uuid := gen_random_uuid();
  v_prem_c    uuid := gen_random_uuid();
  v_4eme      uuid := gen_random_uuid();
  v_maths_t   uuid := gen_random_uuid();
  v_pc_t      uuid := gen_random_uuid();
  v_svt_t     uuid := gen_random_uuid();
  v_fr_t      uuid := gen_random_uuid();
  v_an_t      uuid := gen_random_uuid();
  v_hg_t      uuid := gen_random_uuid();
  v_maths_p   uuid := gen_random_uuid();
  v_pc_p      uuid := gen_random_uuid();
  v_svt_p     uuid := gen_random_uuid();
  v_fr_p      uuid := gen_random_uuid();
  v_an_p      uuid := gen_random_uuid();
  v_hg_p      uuid := gen_random_uuid();
  v_maths_4   uuid := gen_random_uuid();
  v_fr_4      uuid := gen_random_uuid();
  v_an_4      uuid := gen_random_uuid();
  v_hg_4      uuid := gen_random_uuid();
  v_eps_4     uuid := gen_random_uuid();
  v_s1        uuid := gen_random_uuid();
  v_s2        uuid := gen_random_uuid();
  v_s3        uuid := gen_random_uuid();
  v_s4        uuid := gen_random_uuid();
  v_s5        uuid := gen_random_uuid();
  v_s6        uuid := gen_random_uuid();
  v_s7        uuid := gen_random_uuid();
  v_s8        uuid := gen_random_uuid();
  v_s9        uuid := gen_random_uuid();
  v_s10       uuid := gen_random_uuid();
  v_s11       uuid := gen_random_uuid();
  v_s12       uuid := gen_random_uuid();
  v_s13       uuid := gen_random_uuid();
  v_s14       uuid := gen_random_uuid();
  v_s15       uuid := gen_random_uuid();
  v_s16       uuid := gen_random_uuid();
  v_s17       uuid := gen_random_uuid();
  v_s18       uuid := gen_random_uuid();
  v_s19       uuid := gen_random_uuid();
  v_s20       uuid := gen_random_uuid();
  v_s21       uuid := gen_random_uuid();
  v_s22       uuid := gen_random_uuid();
  v_s23       uuid := gen_random_uuid();
  v_s24       uuid := gen_random_uuid();
BEGIN

  SELECT id INTO v_school_id FROM schools ORDER BY created_at DESC LIMIT 1;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Aucune ecole trouvee';
  END IF;

  -- CLASSES
  INSERT INTO classes (id, school_id, name, level, system) VALUES
    (v_term_a, v_school_id, 'Terminale A', 'Terminale', 'FR'),
    (v_prem_c, v_school_id, 'Premiere C',  'Premiere',  'FR'),
    (v_4eme,   v_school_id, '4eme D',      '4eme',      'FR');

  -- MATIERES Terminale A
  INSERT INTO subjects (id, school_id, class_id, name, coef) VALUES
    (v_maths_t, v_school_id, v_term_a, 'Mathematiques',   3),
    (v_pc_t,    v_school_id, v_term_a, 'Physique-Chimie',  2),
    (v_svt_t,   v_school_id, v_term_a, 'SVT',              2),
    (v_fr_t,    v_school_id, v_term_a, 'Francais',         4),
    (v_an_t,    v_school_id, v_term_a, 'Anglais',          3),
    (v_hg_t,    v_school_id, v_term_a, 'Histoire-Geo',     4);

  -- MATIERES Premiere C
  INSERT INTO subjects (id, school_id, class_id, name, coef) VALUES
    (v_maths_p, v_school_id, v_prem_c, 'Mathematiques',   5),
    (v_pc_p,    v_school_id, v_prem_c, 'Physique-Chimie',  4),
    (v_svt_p,   v_school_id, v_prem_c, 'SVT',              3),
    (v_fr_p,    v_school_id, v_prem_c, 'Francais',         3),
    (v_an_p,    v_school_id, v_prem_c, 'Anglais',          2),
    (v_hg_p,    v_school_id, v_prem_c, 'Histoire-Geo',     2);

  -- MATIERES 4eme D
  INSERT INTO subjects (id, school_id, class_id, name, coef) VALUES
    (v_maths_4, v_school_id, v_4eme, 'Mathematiques',  3),
    (v_fr_4,    v_school_id, v_4eme, 'Francais',        3),
    (v_an_4,    v_school_id, v_4eme, 'Anglais',         2),
    (v_hg_4,    v_school_id, v_4eme, 'Histoire-Geo',    2),
    (v_eps_4,   v_school_id, v_4eme, 'EPS',             1);

  -- ELEVES Terminale A
  INSERT INTO students (id, school_id, class_id, name, reg, matricule, gender, date_naissance) VALUES
    (v_s1, v_school_id, v_term_a, 'ATANGANA Paul',   'TA001', 'TA001', 'Masculin', '2005-03-12'),
    (v_s2, v_school_id, v_term_a, 'MBARGA Marie',    'TA002', 'TA002', 'Feminin',  '2005-07-24'),
    (v_s3, v_school_id, v_term_a, 'ESSONO Jean',     'TA003', 'TA003', 'Masculin', '2004-11-05'),
    (v_s4, v_school_id, v_term_a, 'NKEMDIRIM Amina', 'TA004', 'TA004', 'Feminin',  '2005-01-18'),
    (v_s5, v_school_id, v_term_a, 'TABI Charles',    'TA005', 'TA005', 'Masculin', '2004-09-30'),
    (v_s6, v_school_id, v_term_a, 'ONDOUA Florence', 'TA006', 'TA006', 'Feminin',  '2005-05-14'),
    (v_s7, v_school_id, v_term_a, 'BIYONG Patrick',  'TA007', 'TA007', 'Masculin', '2004-12-22'),
    (v_s8, v_school_id, v_term_a, 'NGONO Cecile',    'TA008', 'TA008', 'Feminin',  '2005-08-09');

  -- ELEVES Premiere C
  INSERT INTO students (id, school_id, class_id, name, reg, matricule, gender, date_naissance) VALUES
    (v_s9,  v_school_id, v_prem_c, 'FOUDA Theodore',  'PC001', 'PC001', 'Masculin', '2006-02-17'),
    (v_s10, v_school_id, v_prem_c, 'NDOUMBE Sandrine','PC002', 'PC002', 'Feminin',  '2006-06-03'),
    (v_s11, v_school_id, v_prem_c, 'NLEND Boris',     'PC003', 'PC003', 'Masculin', '2007-04-28'),
    (v_s12, v_school_id, v_prem_c, 'OMBESSA Julie',   'PC004', 'PC004', 'Feminin',  '2006-10-11'),
    (v_s13, v_school_id, v_prem_c, 'ETOGA Martin',    'PC005', 'PC005', 'Masculin', '2006-08-19'),
    (v_s14, v_school_id, v_prem_c, 'MBELE Pascaline', 'PC006', 'PC006', 'Feminin',  '2007-01-07'),
    (v_s15, v_school_id, v_prem_c, 'BODO Romuald',    'PC007', 'PC007', 'Masculin', '2006-12-25'),
    (v_s16, v_school_id, v_prem_c, 'TAGNE Rachel',    'PC008', 'PC008', 'Feminin',  '2006-05-30');

  -- ELEVES 4eme D
  INSERT INTO students (id, school_id, class_id, name, reg, matricule, gender, date_naissance) VALUES
    (v_s17, v_school_id, v_4eme, 'NJOYA Ibrahim',     '4D001', '4D001', 'Masculin', '2009-03-08'),
    (v_s18, v_school_id, v_4eme, 'KAMGA Sylvie',      '4D002', '4D002', 'Feminin',  '2009-07-16'),
    (v_s19, v_school_id, v_4eme, 'MEKA Pierre',       '4D003', '4D003', 'Masculin', '2010-01-22'),
    (v_s20, v_school_id, v_4eme, 'NGONO Lucie',       '4D004', '4D004', 'Feminin',  '2009-11-04'),
    (v_s21, v_school_id, v_4eme, 'ABANDA Simon',      '4D005', '4D005', 'Masculin', '2010-05-13'),
    (v_s22, v_school_id, v_4eme, 'ESSAMA Christelle', '4D006', '4D006', 'Feminin',  '2009-09-27'),
    (v_s23, v_school_id, v_4eme, 'FOTSO Daniel',      '4D007', '4D007', 'Masculin', '2009-06-01'),
    (v_s24, v_school_id, v_4eme, 'MBAH Grace',        '4D008', '4D008', 'Feminin',  '2010-02-14');

  -- NOTES Terminale A Sequence 1
  INSERT INTO grades (school_id, class_id, student_id, subject_id, sequence, value) VALUES
    (v_school_id,v_term_a,v_s1,v_maths_t,1,'14'),
    (v_school_id,v_term_a,v_s1,v_pc_t,1,'12'),
    (v_school_id,v_term_a,v_s1,v_svt_t,1,'11'),
    (v_school_id,v_term_a,v_s1,v_fr_t,1,'9'),
    (v_school_id,v_term_a,v_s1,v_an_t,1,'13'),
    (v_school_id,v_term_a,v_s1,v_hg_t,1,'10'),
    (v_school_id,v_term_a,v_s2,v_maths_t,1,'8'),
    (v_school_id,v_term_a,v_s2,v_pc_t,1,'10'),
    (v_school_id,v_term_a,v_s2,v_svt_t,1,'12'),
    (v_school_id,v_term_a,v_s2,v_fr_t,1,'15'),
    (v_school_id,v_term_a,v_s2,v_an_t,1,'14'),
    (v_school_id,v_term_a,v_s2,v_hg_t,1,'16'),
    (v_school_id,v_term_a,v_s3,v_maths_t,1,'17'),
    (v_school_id,v_term_a,v_s3,v_pc_t,1,'15'),
    (v_school_id,v_term_a,v_s3,v_svt_t,1,'14'),
    (v_school_id,v_term_a,v_s3,v_fr_t,1,'13'),
    (v_school_id,v_term_a,v_s3,v_an_t,1,'16'),
    (v_school_id,v_term_a,v_s3,v_hg_t,1,'12'),
    (v_school_id,v_term_a,v_s4,v_maths_t,1,'6'),
    (v_school_id,v_term_a,v_s4,v_pc_t,1,'7'),
    (v_school_id,v_term_a,v_s4,v_svt_t,1,'9'),
    (v_school_id,v_term_a,v_s4,v_fr_t,1,'11'),
    (v_school_id,v_term_a,v_s4,v_an_t,1,'8'),
    (v_school_id,v_term_a,v_s4,v_hg_t,1,'10'),
    (v_school_id,v_term_a,v_s5,v_maths_t,1,'12'),
    (v_school_id,v_term_a,v_s5,v_pc_t,1,'11'),
    (v_school_id,v_term_a,v_s5,v_svt_t,1,'10'),
    (v_school_id,v_term_a,v_s5,v_fr_t,1,'12'),
    (v_school_id,v_term_a,v_s5,v_an_t,1,'10'),
    (v_school_id,v_term_a,v_s5,v_hg_t,1,'11'),
    (v_school_id,v_term_a,v_s6,v_maths_t,1,'10'),
    (v_school_id,v_term_a,v_s6,v_pc_t,1,'9'),
    (v_school_id,v_term_a,v_s6,v_svt_t,1,'13'),
    (v_school_id,v_term_a,v_s6,v_fr_t,1,'14'),
    (v_school_id,v_term_a,v_s6,v_an_t,1,'11'),
    (v_school_id,v_term_a,v_s6,v_hg_t,1,'13'),
    (v_school_id,v_term_a,v_s7,v_maths_t,1,'5'),
    (v_school_id,v_term_a,v_s7,v_pc_t,1,'6'),
    (v_school_id,v_term_a,v_s7,v_svt_t,1,'7'),
    (v_school_id,v_term_a,v_s7,v_fr_t,1,'8'),
    (v_school_id,v_term_a,v_s7,v_an_t,1,'7'),
    (v_school_id,v_term_a,v_s7,v_hg_t,1,'9'),
    (v_school_id,v_term_a,v_s8,v_maths_t,1,'16'),
    (v_school_id,v_term_a,v_s8,v_pc_t,1,'14'),
    (v_school_id,v_term_a,v_s8,v_svt_t,1,'15'),
    (v_school_id,v_term_a,v_s8,v_fr_t,1,'17'),
    (v_school_id,v_term_a,v_s8,v_an_t,1,'15'),
    (v_school_id,v_term_a,v_s8,v_hg_t,1,'18');

  -- NOTES Terminale A Sequence 2
  INSERT INTO grades (school_id, class_id, student_id, subject_id, sequence, value) VALUES
    (v_school_id,v_term_a,v_s1,v_maths_t,2,'13'),
    (v_school_id,v_term_a,v_s1,v_pc_t,2,'11'),
    (v_school_id,v_term_a,v_s1,v_svt_t,2,'12'),
    (v_school_id,v_term_a,v_s1,v_fr_t,2,'10'),
    (v_school_id,v_term_a,v_s1,v_an_t,2,'14'),
    (v_school_id,v_term_a,v_s1,v_hg_t,2,'11'),
    (v_school_id,v_term_a,v_s2,v_maths_t,2,'9'),
    (v_school_id,v_term_a,v_s2,v_pc_t,2,'11'),
    (v_school_id,v_term_a,v_s2,v_svt_t,2,'13'),
    (v_school_id,v_term_a,v_s2,v_fr_t,2,'16'),
    (v_school_id,v_term_a,v_s2,v_an_t,2,'15'),
    (v_school_id,v_term_a,v_s2,v_hg_t,2,'17'),
    (v_school_id,v_term_a,v_s3,v_maths_t,2,'18'),
    (v_school_id,v_term_a,v_s3,v_pc_t,2,'16'),
    (v_school_id,v_term_a,v_s3,v_svt_t,2,'15'),
    (v_school_id,v_term_a,v_s3,v_fr_t,2,'14'),
    (v_school_id,v_term_a,v_s3,v_an_t,2,'17'),
    (v_school_id,v_term_a,v_s3,v_hg_t,2,'13'),
    (v_school_id,v_term_a,v_s4,v_maths_t,2,'7'),
    (v_school_id,v_term_a,v_s4,v_pc_t,2,'8'),
    (v_school_id,v_term_a,v_s4,v_svt_t,2,'10'),
    (v_school_id,v_term_a,v_s4,v_fr_t,2,'12'),
    (v_school_id,v_term_a,v_s4,v_an_t,2,'9'),
    (v_school_id,v_term_a,v_s4,v_hg_t,2,'11'),
    (v_school_id,v_term_a,v_s5,v_maths_t,2,'11'),
    (v_school_id,v_term_a,v_s5,v_pc_t,2,'12'),
    (v_school_id,v_term_a,v_s5,v_svt_t,2,'10'),
    (v_school_id,v_term_a,v_s5,v_fr_t,2,'13'),
    (v_school_id,v_term_a,v_s5,v_an_t,2,'11'),
    (v_school_id,v_term_a,v_s5,v_hg_t,2,'10'),
    (v_school_id,v_term_a,v_s6,v_maths_t,2,'11'),
    (v_school_id,v_term_a,v_s6,v_pc_t,2,'10'),
    (v_school_id,v_term_a,v_s6,v_svt_t,2,'14'),
    (v_school_id,v_term_a,v_s6,v_fr_t,2,'15'),
    (v_school_id,v_term_a,v_s6,v_an_t,2,'12'),
    (v_school_id,v_term_a,v_s6,v_hg_t,2,'14'),
    (v_school_id,v_term_a,v_s7,v_maths_t,2,'6'),
    (v_school_id,v_term_a,v_s7,v_pc_t,2,'7'),
    (v_school_id,v_term_a,v_s7,v_svt_t,2,'8'),
    (v_school_id,v_term_a,v_s7,v_fr_t,2,'9'),
    (v_school_id,v_term_a,v_s7,v_an_t,2,'8'),
    (v_school_id,v_term_a,v_s7,v_hg_t,2,'10'),
    (v_school_id,v_term_a,v_s8,v_maths_t,2,'17'),
    (v_school_id,v_term_a,v_s8,v_pc_t,2,'15'),
    (v_school_id,v_term_a,v_s8,v_svt_t,2,'16'),
    (v_school_id,v_term_a,v_s8,v_fr_t,2,'18'),
    (v_school_id,v_term_a,v_s8,v_an_t,2,'16'),
    (v_school_id,v_term_a,v_s8,v_hg_t,2,'17');

  -- NOTES Premiere C Sequence 1
  INSERT INTO grades (school_id, class_id, student_id, subject_id, sequence, value) VALUES
    (v_school_id,v_prem_c,v_s9,v_maths_p,1,'15'),
    (v_school_id,v_prem_c,v_s9,v_pc_p,1,'14'),
    (v_school_id,v_prem_c,v_s9,v_svt_p,1,'13'),
    (v_school_id,v_prem_c,v_s9,v_fr_p,1,'11'),
    (v_school_id,v_prem_c,v_s9,v_an_p,1,'12'),
    (v_school_id,v_prem_c,v_s9,v_hg_p,1,'10'),
    (v_school_id,v_prem_c,v_s10,v_maths_p,1,'7'),
    (v_school_id,v_prem_c,v_s10,v_pc_p,1,'8'),
    (v_school_id,v_prem_c,v_s10,v_svt_p,1,'11'),
    (v_school_id,v_prem_c,v_s10,v_fr_p,1,'13'),
    (v_school_id,v_prem_c,v_s10,v_an_p,1,'10'),
    (v_school_id,v_prem_c,v_s10,v_hg_p,1,'12'),
    (v_school_id,v_prem_c,v_s11,v_maths_p,1,'18'),
    (v_school_id,v_prem_c,v_s11,v_pc_p,1,'17'),
    (v_school_id,v_prem_c,v_s11,v_svt_p,1,'16'),
    (v_school_id,v_prem_c,v_s11,v_fr_p,1,'14'),
    (v_school_id,v_prem_c,v_s11,v_an_p,1,'15'),
    (v_school_id,v_prem_c,v_s11,v_hg_p,1,'13'),
    (v_school_id,v_prem_c,v_s12,v_maths_p,1,'9'),
    (v_school_id,v_prem_c,v_s12,v_pc_p,1,'10'),
    (v_school_id,v_prem_c,v_s12,v_svt_p,1,'12'),
    (v_school_id,v_prem_c,v_s12,v_fr_p,1,'14'),
    (v_school_id,v_prem_c,v_s12,v_an_p,1,'11'),
    (v_school_id,v_prem_c,v_s12,v_hg_p,1,'10'),
    (v_school_id,v_prem_c,v_s13,v_maths_p,1,'13'),
    (v_school_id,v_prem_c,v_s13,v_pc_p,1,'12'),
    (v_school_id,v_prem_c,v_s13,v_svt_p,1,'10'),
    (v_school_id,v_prem_c,v_s13,v_fr_p,1,'11'),
    (v_school_id,v_prem_c,v_s13,v_an_p,1,'9'),
    (v_school_id,v_prem_c,v_s13,v_hg_p,1,'10'),
    (v_school_id,v_prem_c,v_s14,v_maths_p,1,'6'),
    (v_school_id,v_prem_c,v_s14,v_pc_p,1,'5'),
    (v_school_id,v_prem_c,v_s14,v_svt_p,1,'8'),
    (v_school_id,v_prem_c,v_s14,v_fr_p,1,'10'),
    (v_school_id,v_prem_c,v_s14,v_an_p,1,'7'),
    (v_school_id,v_prem_c,v_s14,v_hg_p,1,'9'),
    (v_school_id,v_prem_c,v_s15,v_maths_p,1,'16'),
    (v_school_id,v_prem_c,v_s15,v_pc_p,1,'15'),
    (v_school_id,v_prem_c,v_s15,v_svt_p,1,'14'),
    (v_school_id,v_prem_c,v_s15,v_fr_p,1,'12'),
    (v_school_id,v_prem_c,v_s15,v_an_p,1,'13'),
    (v_school_id,v_prem_c,v_s15,v_hg_p,1,'11'),
    (v_school_id,v_prem_c,v_s16,v_maths_p,1,'11'),
    (v_school_id,v_prem_c,v_s16,v_pc_p,1,'10'),
    (v_school_id,v_prem_c,v_s16,v_svt_p,1,'13'),
    (v_school_id,v_prem_c,v_s16,v_fr_p,1,'15'),
    (v_school_id,v_prem_c,v_s16,v_an_p,1,'12'),
    (v_school_id,v_prem_c,v_s16,v_hg_p,1,'14');

  -- NOTES 4eme D Sequence 1
  INSERT INTO grades (school_id, class_id, student_id, subject_id, sequence, value) VALUES
    (v_school_id,v_4eme,v_s17,v_maths_4,1,'12'),
    (v_school_id,v_4eme,v_s17,v_fr_4,1,'11'),
    (v_school_id,v_4eme,v_s17,v_an_4,1,'10'),
    (v_school_id,v_4eme,v_s17,v_hg_4,1,'13'),
    (v_school_id,v_4eme,v_s17,v_eps_4,1,'15'),
    (v_school_id,v_4eme,v_s18,v_maths_4,1,'8'),
    (v_school_id,v_4eme,v_s18,v_fr_4,1,'14'),
    (v_school_id,v_4eme,v_s18,v_an_4,1,'13'),
    (v_school_id,v_4eme,v_s18,v_hg_4,1,'12'),
    (v_school_id,v_4eme,v_s18,v_eps_4,1,'16'),
    (v_school_id,v_4eme,v_s19,v_maths_4,1,'16'),
    (v_school_id,v_4eme,v_s19,v_fr_4,1,'13'),
    (v_school_id,v_4eme,v_s19,v_an_4,1,'11'),
    (v_school_id,v_4eme,v_s19,v_hg_4,1,'14'),
    (v_school_id,v_4eme,v_s19,v_eps_4,1,'17'),
    (v_school_id,v_4eme,v_s20,v_maths_4,1,'6'),
    (v_school_id,v_4eme,v_s20,v_fr_4,1,'9'),
    (v_school_id,v_4eme,v_s20,v_an_4,1,'8'),
    (v_school_id,v_4eme,v_s20,v_hg_4,1,'7'),
    (v_school_id,v_4eme,v_s20,v_eps_4,1,'12'),
    (v_school_id,v_4eme,v_s21,v_maths_4,1,'14'),
    (v_school_id,v_4eme,v_s21,v_fr_4,1,'12'),
    (v_school_id,v_4eme,v_s21,v_an_4,1,'10'),
    (v_school_id,v_4eme,v_s21,v_hg_4,1,'11'),
    (v_school_id,v_4eme,v_s21,v_eps_4,1,'18'),
    (v_school_id,v_4eme,v_s22,v_maths_4,1,'10'),
    (v_school_id,v_4eme,v_s22,v_fr_4,1,'15'),
    (v_school_id,v_4eme,v_s22,v_an_4,1,'14'),
    (v_school_id,v_4eme,v_s22,v_hg_4,1,'16'),
    (v_school_id,v_4eme,v_s22,v_eps_4,1,'14'),
    (v_school_id,v_4eme,v_s23,v_maths_4,1,'5'),
    (v_school_id,v_4eme,v_s23,v_fr_4,1,'7'),
    (v_school_id,v_4eme,v_s23,v_an_4,1,'6'),
    (v_school_id,v_4eme,v_s23,v_hg_4,1,'8'),
    (v_school_id,v_4eme,v_s23,v_eps_4,1,'11'),
    (v_school_id,v_4eme,v_s24,v_maths_4,1,'13'),
    (v_school_id,v_4eme,v_s24,v_fr_4,1,'16'),
    (v_school_id,v_4eme,v_s24,v_an_4,1,'15'),
    (v_school_id,v_4eme,v_s24,v_hg_4,1,'17'),
    (v_school_id,v_4eme,v_s24,v_eps_4,1,'13');

  RAISE NOTICE 'OK - school_id: %', v_school_id;
END;
$$;
