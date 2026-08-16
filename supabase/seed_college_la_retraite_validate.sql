-- ════════════════════════════════════════════════════════════════════════════
-- VALIDATION de l'établissement de démonstration « COLLÈGE LA RETRAITE »
-- École : 8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8
--
-- Renvoie une ligne par contrôle, puis une ligne « RÉSULTAT GLOBAL » finale.
-- À lancer APRÈS seed_college_la_retraite.sql, dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

WITH s AS (SELECT '8f3d1c62-4a97-4c0e-9b25-7e6a10f4d3b8'::uuid id, 'seed-laretraite-v1' m),
k AS (
   SELECT 'C01 école créée' chk,
          (SELECT count(*) FROM schools WHERE id=(SELECT id FROM s))=1 ok,
          (SELECT name FROM schools WHERE id=(SELECT id FROM s)) detail

  UNION ALL SELECT 'C02 comptes de connexion (16)',
    (SELECT count(*) FROM school_users WHERE school_id=(SELECT id FROM s))=16,
    (SELECT count(*)::text FROM school_users WHERE school_id=(SELECT id FROM s))

  UNION ALL SELECT 'C03 rôles de gouvernance attribués (10)',
    (SELECT count(*) FROM user_governance_roles WHERE school_id=(SELECT id FROM s) AND status='active')=10,
    (SELECT string_agg(role, ', ' ORDER BY role) FROM user_governance_roles WHERE school_id=(SELECT id FROM s))

  UNION ALL SELECT 'C04 catalogue de gouvernance complet (10 rôles, dont controleur)',
    (SELECT count(*) FROM governance_roles WHERE school_id=(SELECT id FROM s) AND active)>=10
    AND EXISTS(SELECT 1 FROM governance_roles WHERE school_id=(SELECT id FROM s) AND code='controleur'),
    (SELECT count(*)::text FROM governance_roles WHERE school_id=(SELECT id FROM s))

  UNION ALL SELECT 'C05 3 enseignants, chacun relié à son compte',
    (SELECT count(*) FROM teachers WHERE school_id=(SELECT id FROM s))=3
    AND NOT EXISTS(SELECT 1 FROM teachers WHERE school_id=(SELECT id FROM s) AND auth_user_id IS NULL),
    '3 enseignants (maternelle / primaire / secondaire)'

  UNION ALL SELECT 'C06 3 unités pédagogiques',
    (SELECT count(*) FROM school_units WHERE school_id=(SELECT id FROM s))=3, ''

  UNION ALL SELECT 'C07 13 classes, toutes avec titulaire et unité',
    (SELECT count(*) FROM classes WHERE school_id=(SELECT id FROM s) AND device_id=(SELECT m FROM s))=13
    AND NOT EXISTS(SELECT 1 FROM classes WHERE school_id=(SELECT id FROM s) AND device_id=(SELECT m FROM s) AND (teacher_id IS NULL OR unit_id IS NULL)),
    (SELECT count(*)::text FROM classes WHERE school_id=(SELECT id FROM s) AND device_id=(SELECT m FROM s))

  UNION ALL SELECT 'C08 232 élèves (36 maternelle + 108 primaire + 88 collège)',
    (SELECT count(*) FROM students WHERE school_id=(SELECT id FROM s) AND device_id=(SELECT m FROM s))=232,
    (SELECT string_agg(x.section||'='||x.n, ', ' ORDER BY x.section) FROM
       (SELECT c.section, count(*) n FROM students st JOIN classes c ON c.id=st.class_id
         WHERE st.school_id=(SELECT id FROM s) AND st.device_id=(SELECT m FROM s) GROUP BY c.section) x)

  UNION ALL SELECT 'C09 notes > 9000, séquence 6 partielle',
    (SELECT count(*) FROM grades WHERE school_id=(SELECT id FROM s) AND device_id=(SELECT m FROM s))>9000
    AND (SELECT count(*) FROM grades WHERE school_id=(SELECT id FROM s) AND sequence=6)
      < (SELECT count(*) FROM grades WHERE school_id=(SELECT id FROM s) AND sequence=1),
    (SELECT count(*)::text FROM grades WHERE school_id=(SELECT id FROM s) AND device_id=(SELECT m FROM s))

  UNION ALL SELECT 'C10 aucune note orpheline',
    NOT EXISTS(SELECT 1 FROM grades g WHERE g.school_id=(SELECT id FROM s)
                 AND NOT EXISTS(SELECT 1 FROM students st WHERE st.id=g.student_id)), 'orphelins=0'

  UNION ALL SELECT 'C11 codes de conduite valides (TB|B|AB|P|M)',
    NOT EXISTS(SELECT 1 FROM student_absences WHERE school_id=(SELECT id FROM s)
                 AND conduite IS NOT NULL AND conduite NOT IN ('TB','B','AB','P','M')), 'ok'

  -- Ces colonnes stockent des CODES (src/core/disciplineTerms.js, assetEngine.js,
  -- feeCatalogEngine.js) : un libellé en clair s'afficherait brut à l'écran.
  UNION ALL SELECT 'C11b codes vie scolaire / patrimoine / frais valides',
    NOT EXISTS(SELECT 1 FROM disciplinary_incidents WHERE school_id=(SELECT id FROM s)
                 AND (severity NOT IN ('mineur','majeur','grave') OR status NOT IN ('ouvert','traite','classe')))
    AND NOT EXISTS(SELECT 1 FROM disciplinary_actions WHERE school_id=(SELECT id FROM s)
                 AND action_type NOT IN ('avertissement_oral','avertissement_ecrit','blame','retenue','exclusion_temporaire','exclusion_definitive','travail_interet'))
    AND NOT EXISTS(SELECT 1 FROM student_warnings WHERE school_id=(SELECT id FROM s)
                 AND (warning_type NOT IN ('oral','ecrit') OR category NOT IN ('travail','conduite')))
    AND NOT EXISTS(SELECT 1 FROM parent_meetings WHERE school_id=(SELECT id FROM s)
                 AND (target NOT IN ('eleve','parent','les_deux') OR status NOT IN ('planifie','honore','absent','annule')))
    AND NOT EXISTS(SELECT 1 FROM assets WHERE school_id=(SELECT id FROM s)
                 AND (category NOT IN ('vehicule','batiment','ordinateur','imprimante','groupe_electrogene','mobilier')
                      OR status NOT IN ('active','maintenance','out_of_service','disposed')))
    AND NOT EXISTS(SELECT 1 FROM fee_catalog WHERE school_id=(SELECT id FROM s)
                 AND category NOT IN ('inscription','scolarite','apee','tenue','cantine','transport','internat','soutien','activites','bibliotheque','assurance','sortie','autre')),
    'ok'

  UNION ALL SELECT 'C12 Σ lignes budgétaires = enveloppe annuelle',
    (SELECT coalesce(sum(planned_amount),0) FROM budget_chapters
      WHERE school_id=(SELECT id FROM s) AND scope IS NOT NULL AND device_id=(SELECT m FROM s))
    = (SELECT coalesce(envelope_amount,0) FROM budgets WHERE school_id=(SELECT id FROM s) AND tier='annual'),
    (SELECT coalesce(sum(planned_amount),0)::text FROM budget_chapters
      WHERE school_id=(SELECT id FROM s) AND scope IS NOT NULL AND device_id=(SELECT m FROM s))

  UNION ALL SELECT 'C13 Σ% temporel = 100 sur chaque ligne',
    NOT EXISTS(SELECT 1 FROM budget_chapters c WHERE c.school_id=(SELECT id FROM s) AND c.scope IS NOT NULL
                 AND (SELECT coalesce(sum(pct),0) FROM budget_line_periods lp WHERE lp.budget_chapter_id=c.id) <> 100), 'ok'

  UNION ALL SELECT 'C14 Σ% sectoriel = 100 sur les lignes réparties',
    NOT EXISTS(SELECT 1 FROM budget_chapters c WHERE c.school_id=(SELECT id FROM s) AND c.scope='sectors'
                 AND (SELECT coalesce(sum(pct),0) FROM budget_line_sectors ls WHERE ls.budget_chapter_id=c.id) <> 100), 'ok'

  UNION ALL SELECT 'C15 aucun dépassement de ligne (engagé <= prévu)',
    NOT EXISTS(SELECT 1 FROM budget_chapters c WHERE c.school_id=(SELECT id FROM s) AND c.scope IS NOT NULL
                 AND (SELECT coalesce(sum(e.amount),0) FROM budget_expenses e
                       WHERE e.budget_chapter_id=c.id AND e.status IN ('submitted','approved','paid')) > c.planned_amount),
    'ok'

  UNION ALL SELECT 'C16 les 8 cas du circuit de validation sont présents',
    (SELECT count(DISTINCT subcategory) FROM budget_expenses
      WHERE school_id=(SELECT id FROM s) AND subcategory LIKE 'CAS-%')=8, 'CAS-A … CAS-H'

  UNION ALL SELECT 'C17 décision en attente de la Fondatrice (>= 250 000)',
    EXISTS(SELECT 1 FROM budget_expenses WHERE school_id=(SELECT id FROM s) AND status='submitted' AND amount>=250000), 'CAS-D'

  UNION ALL SELECT 'C18 décision en attente du Coordonnateur (25 000 – 250 000)',
    EXISTS(SELECT 1 FROM budget_expenses WHERE school_id=(SELECT id FROM s) AND status='submitted' AND amount BETWEEN 25000 AND 249999), 'CAS-A'

  UNION ALL SELECT 'C19 demande de déblocage en attente',
    EXISTS(SELECT 1 FROM budget_unlock_requests WHERE school_id=(SELECT id FROM s) AND status='pending'), 'CAS-H'

  UNION ALL SELECT 'C20 chronologie complète du CAS-C (soumis → approuvé → payé)',
    (SELECT count(*) FROM domain_events de JOIN budget_expenses e ON e.id=de.aggregate_id
      WHERE e.subcategory='CAS-C' AND de.school_id=(SELECT id FROM s))=3, 'audit'

  UNION ALL SELECT 'C21 Coordonnateur & Caissier ont les droits du scénario',
    (SELECT permissions @> '["expense.approve"]' FROM governance_roles WHERE school_id=(SELECT id FROM s) AND code='coordonnateur_general')
    AND (SELECT permissions @> '["expense.submit"]' FROM governance_roles WHERE school_id=(SELECT id FROM s) AND code='caissier'),
    'approve / submit'

  -- Les versements RATTACHÉS à un frais annexe (student_fee_item_id) ne font pas
  -- partie de la pension : seuls les versements globaux doivent l'égaler.
  UNION ALL SELECT 'C22 Σ versements de pension = Σ frais payés',
    (SELECT coalesce(sum(amount),0) FROM fee_payments WHERE school_id=(SELECT id FROM s) AND student_fee_item_id IS NULL)
    = (SELECT coalesce(sum(frais_payes),0) FROM student_fees WHERE school_id=(SELECT id FROM s)),
    (SELECT coalesce(sum(amount),0)::text FROM fee_payments WHERE school_id=(SELECT id FROM s) AND student_fee_item_id IS NULL)

  UNION ALL SELECT 'C23 aucun élève n''a payé plus que dû',
    NOT EXISTS(SELECT 1 FROM student_fees WHERE school_id=(SELECT id FROM s) AND (frais_payes<0 OR frais_payes>frais_annuels)), 'ok'

  UNION ALL SELECT 'C24 numéros de reçu attribués et uniques',
    NOT EXISTS(SELECT 1 FROM fee_payments WHERE school_id=(SELECT id FROM s) AND receipt_no IS NULL)
    AND (SELECT count(*) FROM fee_payments WHERE school_id=(SELECT id FROM s))
      = (SELECT count(DISTINCT receipt_no) FROM fee_payments WHERE school_id=(SELECT id FROM s)),
    (SELECT count(*)::text FROM fee_payments WHERE school_id=(SELECT id FROM s))

  UNION ALL SELECT 'C25 paie de juin : net = base + primes − retenues',
    NOT EXISTS(SELECT 1 FROM hr_payroll WHERE school_id=(SELECT id FROM s)
                 AND net_salary <> base_salary + bonuses - deductions),
    (SELECT count(*)::text||' bulletins' FROM hr_payroll WHERE school_id=(SELECT id FROM s))

  UNION ALL SELECT 'C26 congé en attente de décision',
    EXISTS(SELECT 1 FROM hr_leaves WHERE school_id=(SELECT id FROM s) AND status='pending'), 'circuit RH'

  UNION ALL SELECT 'C27 vie scolaire : dossiers ouverts à traiter',
    EXISTS(SELECT 1 FROM disciplinary_incidents WHERE school_id=(SELECT id FROM s) AND status='ouvert'), 'surveillant'

  UNION ALL SELECT 'C28 signalements ouverts et résolus coexistent',
    EXISTS(SELECT 1 FROM signalements WHERE school_id=(SELECT id FROM s) AND status='new')
    AND EXISTS(SELECT 1 FROM signalements WHERE school_id=(SELECT id FROM s) AND status='resolved'), 'reports'

  UNION ALL SELECT 'C29 emploi du temps rempli (GS, CM2, 6e)',
    (SELECT count(DISTINCT class_id) FROM timetable_slots WHERE school_id=(SELECT id FROM s))=3,
    (SELECT count(*)::text||' créneaux' FROM timetable_slots WHERE school_id=(SELECT id FROM s))

  UNION ALL SELECT 'C30 aucune période verrouillée (démo modifiable)',
    NOT EXISTS(SELECT 1 FROM academic_periods WHERE school_id=(SELECT id FROM s) AND is_locked), 'is_locked=false'
)
SELECT chk AS "contrôle", CASE WHEN ok THEN 'PASS' ELSE '*** FAIL ***' END AS "résultat", detail AS "détail" FROM k
UNION ALL
SELECT 'ZZ ════ RÉSULTAT GLOBAL',
       CASE WHEN bool_and(ok) THEN 'COLLÈGE LA RETRAITE : PASS' ELSE 'COLLÈGE LA RETRAITE : FAIL' END,
       (SELECT count(*) FILTER (WHERE NOT ok)::text||' contrôle(s) en échec' FROM k)
FROM k
ORDER BY 1;
