-- ════════════════════════════════════════════════════════════════════════════
-- VALIDATION du jeu de données E2E « LA RÉUSSITE » (école 31c70a36…).
-- Renvoie une ligne par contrôle + une ligne « DATASET TEST : PASS » finale
-- si TOUS les contrôles critiques passent.
-- ════════════════════════════════════════════════════════════════════════════
WITH s AS (SELECT '31c70a36-065e-4933-a40c-1e9c051d1afc'::uuid id, 'seed-lareussite-v1' m),
k AS (
 SELECT 'C01 école cible unique' chk, (SELECT count(*) FROM schools WHERE id=(SELECT id FROM s))=1 ok, (SELECT name FROM schools WHERE id=(SELECT id FROM s)) detail
 UNION ALL SELECT 'C02 comptes (14)', (SELECT count(*) FROM school_users WHERE school_id=(SELECT id FROM s))=14, (SELECT count(*)::text FROM school_users WHERE school_id=(SELECT id FROM s))
 UNION ALL SELECT 'C03 fondatrice rattachée', EXISTS(SELECT 1 FROM school_users su JOIN auth.users u ON u.id=su.user_id WHERE su.school_id=(SELECT id FROM s) AND u.email='hfiwdsjfci@gmail.com') AND EXISTS(SELECT 1 FROM user_governance_roles WHERE school_id=(SELECT id FROM s) AND role='fondatrice'), 'hfiwdsjfci=fondatrice'
 UNION ALL SELECT 'C04 élèves (656)', (SELECT count(*) FROM students WHERE school_id=(SELECT id FROM s) AND device_id=(SELECT m FROM s))=656, (SELECT count(*)::text FROM students WHERE school_id=(SELECT id FROM s) AND device_id=(SELECT m FROM s))
 UNION ALL SELECT 'C05 classes (28)', (SELECT count(*) FROM classes WHERE school_id=(SELECT id FROM s) AND device_id=(SELECT m FROM s))=28, ''
 UNION ALL SELECT 'C06 notes > 13000', (SELECT count(*) FROM grades WHERE school_id=(SELECT id FROM s) AND device_id=(SELECT m FROM s))>13000, (SELECT count(*)::text FROM grades WHERE school_id=(SELECT id FROM s) AND device_id=(SELECT m FROM s))
 UNION ALL SELECT 'C07 FK notes→élève OK', NOT EXISTS(SELECT 1 FROM grades g WHERE g.device_id=(SELECT m FROM s) AND NOT EXISTS(SELECT 1 FROM students st WHERE st.id=g.student_id)), 'orphelins=0'
 UNION ALL SELECT 'C08 FK dépense→ligne OK', NOT EXISTS(SELECT 1 FROM budget_expenses e WHERE e.device_id=(SELECT m FROM s) AND e.budget_chapter_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM budget_chapters c WHERE c.id=e.budget_chapter_id)), 'orphelins=0'
 UNION ALL SELECT 'C09 aucun montant négatif', NOT EXISTS(SELECT 1 FROM fee_payments WHERE device_id=(SELECT m FROM s) AND amount<=0) AND NOT EXISTS(SELECT 1 FROM budget_expenses WHERE device_id=(SELECT m FROM s) AND amount<0), 'ok'
 UNION ALL SELECT 'C10 pension: payé<=annuel', NOT EXISTS(SELECT 1 FROM student_fees WHERE device_id=(SELECT m FROM s) AND (frais_payes<0 OR frais_payes>frais_annuels)), 'ok'
 UNION ALL SELECT 'C11 Σversements = Σpayé', (SELECT coalesce(sum(amount),0) FROM fee_payments WHERE device_id=(SELECT m FROM s))=(SELECT coalesce(sum(frais_payes),0) FROM student_fees WHERE device_id=(SELECT m FROM s)), (SELECT sum(amount)::text FROM fee_payments WHERE device_id=(SELECT m FROM s))
 UNION ALL SELECT 'C12 aucun dépassement de ligne (committing)', NOT EXISTS(
    SELECT 1 FROM budget_chapters c WHERE c.device_id=(SELECT m FROM s) AND c.kind='depense'
      AND (SELECT coalesce(sum(e.amount),0) FROM budget_expenses e WHERE e.budget_chapter_id=c.id AND e.status IN ('submitted','approved','paid')) > c.planned_amount), 'ok'
 UNION ALL SELECT 'C13 décision en attente FONDATRICE (>=250k)', EXISTS(SELECT 1 FROM budget_expenses WHERE device_id=(SELECT m FROM s) AND status='submitted' AND amount>=250000), 'CAS D'
 UNION ALL SELECT 'C14 décision en attente COORDONNATEUR (25k–250k)', EXISTS(SELECT 1 FROM budget_expenses WHERE device_id=(SELECT m FROM s) AND status='submitted' AND amount>=25000 AND amount<250000), 'CAS A'
 UNION ALL SELECT 'C15 dépense rejetée + motif', EXISTS(SELECT 1 FROM budget_expenses WHERE device_id=(SELECT m FROM s) AND status='rejected' AND notes IS NOT NULL), 'CAS E'
 UNION ALL SELECT 'C16 déblocage en attente', EXISTS(SELECT 1 FROM budget_unlock_requests WHERE device_id=(SELECT m FROM s) AND status='pending'), 'CAS H'
 UNION ALL SELECT 'C17 audit CAS C complet (submitted→approved→paid)', (SELECT count(*) FROM domain_events de JOIN budget_expenses e ON e.id=de.aggregate_id WHERE e.subcategory='CAS-C' AND de.device_id=(SELECT m FROM s))=3, 'chronologie'
 UNION ALL SELECT 'C18 Coordonnateur peut approuver (permission)', (SELECT permissions @> '["expense.approve"]' FROM governance_roles WHERE school_id=(SELECT id FROM s) AND code='coordonnateur_general'), 'expense.approve'
 UNION ALL SELECT 'C19 pas de doublon de notes', (SELECT count(*) FROM grades WHERE device_id=(SELECT m FROM s))=(SELECT count(DISTINCT (student_id,subject_id,sequence)) FROM grades WHERE device_id=(SELECT m FROM s)), 'unique'
 UNION ALL SELECT 'C20 vie scolaire: dossiers ouverts', EXISTS(SELECT 1 FROM disciplinary_incidents WHERE device_id=(SELECT m FROM s) AND status='ouvert'), 'à traiter'
)
SELECT chk, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END res, detail FROM k
UNION ALL
SELECT '════ RÉSULTAT GLOBAL', CASE WHEN bool_and(ok) THEN 'DATASET TEST : PASS' ELSE 'DATASET TEST : FAIL' END, '' FROM k
ORDER BY chk;
