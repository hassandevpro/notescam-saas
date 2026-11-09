-- ════════════════════════════════════════════════════════════════════════════
-- REQUÊTES DE COMPTAGE — LECTURE SEULE — à exécuter sur la base de l'école
-- ════════════════════════════════════════════════════════════════════════════
-- Aucune ne modifie quoi que ce soit : uniquement des SELECT, uniquement des NOMBRES.
-- Aucun nom d'élève, aucune note individuelle, aucun identifiant d'élève n'est renvoyé :
-- vous pouvez me renvoyer les résultats tels quels.
-- Valables sur Postgres (Cloud) ET SQLite (serveur de l'école : sqlite3 / node:sqlite) —
-- aucune syntaxe propre à l'un des deux. Remplacez :ECOLE par l'identifiant de l'école, entre apostrophes.
--   exemple : WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a'

-- Q1. Classes par moteur de bulletin et par cycle (NULL = hérite du réglage de l'école).
SELECT COALESCE(bulletin_engine, '(hérité)') AS moteur_classe, COALESCE(cycle, '(vide)') AS cycle, count(*) AS classes
  FROM classes WHERE school_id = :ECOLE
 GROUP BY 1, 2 ORDER BY 3 DESC;

-- Q2. Le moteur de l'école elle-même.
SELECT bulletin_engine AS moteur_ecole, primary_period_mode FROM schools WHERE id = :ECOLE;

-- Q3. Critères masqués PAR L'ÉCOLE (avant migration) : combien, et lesquels (ce sont des critères, pas des personnes).
SELECT critere_id, count(*) AS ecoles FROM prim_criteres_masques WHERE school_id = :ECOLE GROUP BY critere_id;

-- Q4. Après migration : combien de lignes par classe (doit valoir critères masqués × compétences visibles).
SELECT class_id, count(*) AS lignes FROM prim_criteres_masques_classe WHERE school_id = :ECOLE GROUP BY class_id;
SELECT count(*) AS classes_initialisees FROM prim_criteres_masques_init WHERE school_id = :ECOLE;

-- Q5. Matières à barème 100 dans une classe dont le barème déclaré est autre (le défaut /100 → /20).
SELECT c.system, c.grade_max, count(*) AS matieres,
       sum(CASE WHEN EXISTS (SELECT 1 FROM grades g WHERE g.subject_id = s.id) THEN 1 ELSE 0 END) AS avec_notes
  FROM subjects s JOIN classes c ON c.id = s.class_id
 WHERE s.school_id = :ECOLE AND s.max = 100 AND (c.grade_max IS NULL OR c.grade_max <> 100)
 GROUP BY c.system, c.grade_max;

-- Q6. Barèmes de matières en usage (pour vérifier qu'un barème libre /40, /50… existe déjà).
SELECT max AS bareme, count(*) AS matieres FROM subjects WHERE school_id = :ECOLE GROUP BY max ORDER BY max;

-- Q7. Notes à ZÉRO, vides et ABS dans `grades` (le primaire par compétences note dans prim_notes : voir Q8).
SELECT SUM(CASE WHEN value IS NULL OR TRIM(value) = '' THEN 1 ELSE 0 END)                AS vides,
       SUM(CASE WHEN UPPER(TRIM(value)) = 'ABS' THEN 1 ELSE 0 END)                       AS abs,
       SUM(CASE WHEN TRIM(value) IN ('0', '0.0', '0.00', '0,0', '0,00') THEN 1 ELSE 0 END) AS zeros,
       count(*) AS total
  FROM grades WHERE school_id = :ECOLE;

-- Q8. Même relevé pour le primaire par compétences (note NULL = barème posé sans note, ce n'est pas une absence).
SELECT SUM(CASE WHEN note IS NULL THEN 1 ELSE 0 END) AS sans_note_ou_bareme,
       SUM(CASE WHEN note = 0 THEN 1 ELSE 0 END)     AS zeros,
       count(*) AS total
  FROM prim_notes WHERE school_id = :ECOLE;

-- Q9. Classes qui ont DÉJÀ des notes dans `grades` ET un moteur « compétences » (cas où changer de mode serait bloqué).
SELECT c.id AS classe, count(*) AS notes
  FROM classes c JOIN grades g ON g.class_id = c.id
 WHERE c.school_id = :ECOLE
 GROUP BY c.id;
