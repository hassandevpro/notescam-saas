-- ════════════════════════════════════════════════════════════════════════════
-- NotesCam — Historisation des affectations élèves : RAPPORT DRY-RUN (lecture seule)
-- ════════════════════════════════════════════════════════════════════════════
--
-- À exécuter AVANT `supabase_student_assignments.sql`. Ce script ne modifie RIEN :
-- il ne contient que des SELECT. Il chiffre ce que la migration va faire et
-- signale les anomalies (élèves sans date d'inscription, classe orpheline…).
--
-- Copier/coller dans Supabase → SQL Editor → Run, puis lire les 6 blocs.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Volumétrie globale ------------------------------------------------------
SELECT
  '1. Volumétrie' AS bloc,
  (SELECT count(*) FROM students)                              AS eleves_total,
  (SELECT count(*) FROM student_class_assignments)             AS lignes_journal_existantes,
  (SELECT count(DISTINCT student_id) FROM student_class_assignments) AS eleves_ayant_deja_un_journal;

-- 2) Élèves qui recevront une affectation n°1 « initial » --------------------
--    (ceux qui n'ont AUCUNE ligne de journal aujourd'hui)
SELECT
  '2. Affectations n°1 à créer' AS bloc,
  count(*) AS eleves_sans_journal_donc_affectation_initiale
FROM students s
WHERE NOT EXISTS (
  SELECT 1 FROM student_class_assignments a WHERE a.student_id = s.id
);

-- 3) Élèves avec un journal existant → reconstruction d'historique -----------
--    La DERNIÈRE ligne de journal deviendra l'affectation en cours (date_fin
--    NULL) si sa classe correspond encore à students.class_id ; sinon on
--    ferme la ligne et on crée une affectation « initial » vers la vraie classe.
SELECT
  '3. Journaux à reconstruire' AS bloc,
  count(*) FILTER (WHERE latest_class = current_class) AS derniere_ligne_coherente,
  count(*) FILTER (WHERE latest_class <> current_class) AS derniere_ligne_perimee_a_reconcilier
FROM (
  SELECT s.id,
         s.class_id AS current_class,
         (SELECT a.class_id FROM student_class_assignments a
           WHERE a.student_id = s.id ORDER BY a.assigned_at DESC LIMIT 1) AS latest_class
  FROM students s
  WHERE EXISTS (SELECT 1 FROM student_class_assignments a WHERE a.student_id = s.id)
) t;

-- 4) ANOMALIE : élèves dont la classe n'existe plus (class_id orphelin) ------
SELECT
  '4. ANOMALIE classe orpheline' AS bloc,
  count(*) AS eleves_avec_classe_introuvable
FROM students s
LEFT JOIN classes c ON c.id = s.class_id
WHERE c.id IS NULL;

-- 5) Date d'inscription : la colonne students.created_at existe-t-elle ? -----
--    (lecture seule ; on ne référence PAS s.created_at directement car il peut
--    être absent du schéma historique reg/year). La migration l'ajoutera puis
--    retombera sur now() pour les lignes sans date exploitable.
SELECT
  '5. Source de date_debut' AS bloc,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'created_at'
  ) THEN 'created_at présent' ELSE 'PAS de created_at (migration l''ajoutera)' END AS date_inscription,
  CASE WHEN to_regclass('public.academic_periods') IS NULL
       THEN 'academic_periods absente → repli = now()'
       WHEN EXISTS (SELECT 1 FROM public.academic_periods WHERE teaching_start IS NOT NULL)
       THEN 'repli = début d''année scolaire (teaching_start) puis now()'
       ELSE 'academic_periods sans teaching_start → repli = now()' END AS repli_date_debut;

-- 6) Détail des classes orphelines (échantillon 50) pour vérification manuelle
SELECT
  '6. Détail classes orphelines' AS bloc,
  s.id, s.name, s.matricule, s.class_id
FROM students s
LEFT JOIN classes c ON c.id = s.class_id
WHERE c.id IS NULL
LIMIT 50;
