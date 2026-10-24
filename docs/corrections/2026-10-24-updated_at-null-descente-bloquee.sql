-- ============================================================================
-- CORRECTION DE PRODUCTION — LES LIGNES SANS `updated_at` NE DESCENDENT JAMAIS
--
--   Date       : 2026-10-24
--   Projet     : ltxopwoxvgslsgzixbpx (Cloud NotesCam)
--   Déclencheur: journal d'installation de la 0.3.23 sur le serveur de THE
--                GENIUS — un seul échec, « curseur de descente TOUJOURS à … —
--                la caisse resterait vide ».
--   Statut     : PRÉPARÉE, NON EXÉCUTÉE — en attente d'autorisation explicite.
--
-- ── CE QUI A ÉTÉ MESURÉ (lectures seules, 2026-10-24) ──────────────────────
--
-- La descente Cloud → école est un keyset `(updated_at, id)` et la fonction
-- `sync-pull` écarte EXPLICITEMENT les lignes sans date :
--
--     .not('updated_at', 'is', null)   // le keyset exige updated_at non NULL
--
-- Une ligne sans `updated_at` est donc INVISIBLE POUR TOUJOURS sur le serveur
-- d'une école. Remettre le curseur à zéro n'y change rien : c'est pourquoi la
-- parade de I13 (curseur remis à zéro quand une table synchronisée naît) ne
-- suffisait pas, et pourquoi le script de déploiement a eu raison de crier.
--
-- Comptes relevés dans la base :
--
--     TABLE                     TOTAL   SANS updated_at
--     prim_notes                 2337      2337   (100 %)
--     apc_notes                  1334      1334   (100 %)
--     mat_observations            544       544   (100 %)
--     student_fee_items          6531      1237
--     hr_attendance               175       175   (100 %)
--     late_arrivals                81        70
--     budget_expenses             104        60
--     staff                        71        40
--     hr_contracts                 31        31   (100 %)
--     disciplinary_incidents       29        28
--     signalement_history          31        23
--     student_warnings             22        22   (100 %)
--     disciplinary_actions         18        18   (100 %)
--     exit_permissions             18        18   (100 %)
--     fee_catalog                  43        18
--     hr_career_events             17        16
--     parent_meetings              14        14   (100 %)
--     assets                       12        12   (100 %)
--     student_detentions           11        11   (100 %)
--     cash_movements               11        10
--     signalement_comments         10        10   (100 %)
--     notifications                88         7
--     budget_periods               15         6
--     hr_leaves                     6         6   (100 %)
--     hr_evaluations                5         5   (100 %)
--     asset_breakdowns/expenses/repairs  7     7  (100 %)
--     budget_chapters             122         2
--     budgets                      11         2
--     cash_sessions                 2         2   (100 %)
--
-- POUR THE GENIUS (6b68407b-3d2e-426b-81ff-c4e68e66120a), qui vient d'installer
-- la 0.3.23 et dont le serveur LAN descend ces tables :
--
--     budget_expenses   60 / 60  invisibles   (leur base locale en porte 0)
--     cash_movements    10 / 11  invisibles   (la 11e est la seule datée, et le
--                                              curseur LAN est posé dessus)
--
-- Les 4 215 notes par compétences appartiennent à d'AUTRES écoles : elles ne
-- gênent personne tant que ces écoles restent en ligne, et elles bloqueraient
-- le jour où l'une d'elles passe en serveur local.
--
-- ── ORIGINE, CORRIGÉE DANS LE CODE (commit du même jour) ───────────────────
--
--   · les trois constructeurs de notes (apc/prim/mat) ne posaient pas la
--     colonne — ils ne posaient que `date_saisie`, qui est la date PÉDAGOGIQUE
--     et que la descente ne lit pas ;
--   · `scripts/import-caisse-genius.mjs` ne nommait `updated_at` que dans la
--     branche `ON CONFLICT DO UPDATE` : au PREMIER import, la colonne restait
--     NULL. C'est l'origine exacte des 70 lignes de THE GENIUS
--     (import_batch = 'reprise-2026-06-08', 2026-10-18 06:12:19).
--
-- Les écritures d'application (`upsertCashMovement`, `upsertExpense`) la
-- posaient déjà : d'où UNE écriture de caisse datée sur onze.
--
-- ── CE QUE FAIT CE FICHIER ─────────────────────────────────────────────────
--
--   A. une VALEUR PAR DÉFAUT `now()` sur `updated_at` des tables synchronisées
--      qui n'en ont pas. Purement additif : AUCUNE ligne existante n'est
--      touchée, et un écrivain qui fournit la colonne (c'est le cas de la
--      remontée LAN) n'est pas affecté. C'est le garde-fou qui couvre aussi les
--      scripts SQL passés à la main, que le code applicatif ne peut pas border.
--
--   B. le RATTRAPAGE des lignes existantes : `updated_at = now()`.
--
-- POURQUOI `now()` ET NON `created_at`. Le curseur de descente d'une école est
-- déjà passé devant les dates de création (celui de THE GENIUS est au
-- 2026-10-18). Dater ces lignes de leur création les laisserait DERRIÈRE le
-- curseur : elles resteraient invisibles, et la correction n'aurait rien
-- corrigé. `now()` les place devant, donc elles descendent au prochain cycle.
--
-- CE QUE `now()` NE RISQUE PAS. La résolution de conflits est LWW sur
-- `updated_at` : dater à maintenant fait gagner la version Cloud. Or une ligne
-- dont le Cloud n'a pas de date n'a jamais pu descendre — l'école ne l'a donc
-- pas en base, et il n'y a aucune version locale à écraser. La remontée LAN,
-- elle, envoie toujours sa propre date (`stampSync`), donc une ligne venue de
-- l'école est déjà datée et n'est pas dans le périmètre de ce rattrapage.
--
-- ── RETOUR ARRIÈRE ─────────────────────────────────────────────────────────
-- Les identifiants touchés sont SAUVEGARDÉS dans des tables
-- `zz_sauv_updated_at_20261024_<table>` avant toute écriture. Le script de
-- retour arrière est en fin de fichier : il remet `updated_at` à NULL pour ces
-- identifiants exactement, et retire les valeurs par défaut posées en (A).
--
-- /!\ APRÈS EXÉCUTION, LA SYNCHRONISATION DES ÉCOLES EN SERVEUR LOCAL VA
--     TRAVAILLER : les lignes rattrapées descendent. Pour THE GENIUS, 70
--     lignes — 60 dépenses et 10 écritures de caisse. PRÉVENIR L'ÉCOLE.
-- ============================================================================

BEGIN;

-- ── GARDE D'ÉTAT ───────────────────────────────────────────────────────────
-- On refuse de s'exécuter si la base n'est pas celle qu'on a mesurée : un
-- rattrapage posé sur un état inattendu n'est plus un rattrapage.
DO $$
DECLARE v_pull text; v_nuls bigint;
BEGIN
  SELECT count(*) INTO v_nuls FROM public.cash_movements WHERE updated_at IS NULL;
  IF v_nuls = 0 THEN
    RAISE EXCEPTION 'ÉTAT INATTENDU : plus aucune ligne cash_movements sans updated_at — ce fichier a déjà été passé ?';
  END IF;
  RAISE NOTICE 'État vérifié : % ligne(s) cash_movements sans updated_at.', v_nuls;
END $$;

-- ── (A) VALEUR PAR DÉFAUT, ADDITIVE ────────────────────────────────────────
-- Aucune ligne n'est réécrite par un ALTER ... SET DEFAULT.
DO $$
DECLARE t text; n int := 0;
BEGIN
  FOR t IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.column_name  = 'updated_at'
       AND c.column_default IS NULL
       AND c.table_name IN (
         'schools','school_units','school_users','academic_periods','classes','subjects',
         'students','teachers','staff','grades','student_fees','fee_payments','class_fee_grids',
         'budgets','budget_chapters','budget_expenses','budget_unlock_requests',
         'budget_reallocations','budget_revisions','budget_periods','budget_line_periods',
         'budget_line_sectors','budget_line_reallocations','hr_contracts','hr_leaves',
         'hr_evaluations','hr_attendance','hr_career_events','hr_payroll','hr_payroll_catalog',
         'hr_payroll_items','signalement_comments','signalement_history','notifications',
         'notification_outbox','assets','asset_breakdowns','asset_repairs','asset_expenses',
         'fee_catalog','student_fee_items','fee_schedule_items','cash_sessions','cash_movements',
         'governance_roles','user_governance_roles','governance_role_history','attendance',
         'student_absences','student_class_assignments','late_arrivals','disciplinary_incidents',
         'disciplinary_actions','student_warnings','student_detentions','parent_meetings',
         'exit_permissions','school_messages','teacher_notifications','sequence_dates',
         'timetable_slots','apc_notes','mat_observations','prim_notes','signalements')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_at SET DEFAULT now()', t);
    n := n + 1;
  END LOOP;
  RAISE NOTICE '(A) valeur par défaut now() posée sur % table(s).', n;
END $$;

-- ── (B) SAUVEGARDE PUIS RATTRAPAGE ─────────────────────────────────────────
DO $$
DECLARE t text; n bigint; total bigint := 0; sauv text;
BEGIN
  FOR t IN
    SELECT c.table_name
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.column_name  = 'updated_at'
       AND c.table_name IN (
         'apc_notes','prim_notes','mat_observations','cash_movements','cash_sessions',
         'budget_expenses','budget_periods','budget_chapters','budgets','student_fee_items',
         'fee_catalog','staff','hr_attendance','hr_contracts','hr_leaves','hr_evaluations',
         'hr_career_events','late_arrivals','disciplinary_incidents','disciplinary_actions',
         'student_warnings','student_detentions','exit_permissions','parent_meetings',
         'assets','asset_breakdowns','asset_repairs','asset_expenses',
         'signalement_comments','signalement_history','notifications')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE updated_at IS NULL', t) INTO n;
    CONTINUE WHEN n = 0;

    sauv := format('zz_sauv_updated_at_20261024_%s', t);
    -- La sauvegarde ne garde QUE les identifiants : c'est tout ce qu'il faut
    -- pour remettre la colonne à NULL, et rien d'autre n'est copié.
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (id uuid PRIMARY KEY)', sauv);
    EXECUTE format('INSERT INTO public.%I (id) SELECT id FROM public.%I WHERE updated_at IS NULL ON CONFLICT DO NOTHING', sauv, t);
    EXECUTE format('UPDATE public.%I SET updated_at = now() WHERE updated_at IS NULL', t);

    total := total + n;
    RAISE NOTICE '(B) % : % ligne(s) datée(s) (identifiants sauvegardés dans %).', t, n, sauv;
  END LOOP;
  RAISE NOTICE '(B) TOTAL : % ligne(s) rattrapée(s).', total;
END $$;

-- ── CONTRÔLES APRÈS, DANS LA MÊME TRANSACTION ──────────────────────────────
DO $$
DECLARE v_genius_dep bigint; v_genius_caisse bigint; v_notes bigint;
BEGIN
  SELECT count(*) INTO v_genius_dep FROM public.budget_expenses
    WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' AND updated_at IS NULL;
  SELECT count(*) INTO v_genius_caisse FROM public.cash_movements
    WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' AND updated_at IS NULL;
  SELECT count(*) INTO v_notes FROM (
    SELECT 1 FROM public.apc_notes WHERE updated_at IS NULL
    UNION ALL SELECT 1 FROM public.prim_notes WHERE updated_at IS NULL
    UNION ALL SELECT 1 FROM public.mat_observations WHERE updated_at IS NULL) x;

  IF v_genius_dep <> 0 OR v_genius_caisse <> 0 OR v_notes <> 0 THEN
    RAISE EXCEPTION 'CONTRÔLE APRÈS ÉCHOUÉ : GENIUS dépenses=%, caisse=%, notes=% (attendu 0,0,0)',
      v_genius_dep, v_genius_caisse, v_notes;
  END IF;
  RAISE NOTICE 'CONTRÔLE APRÈS : plus aucune ligne sans date dans le périmètre.';
END $$;

COMMIT;

-- ============================================================================
-- VÉRIFICATION APRÈS COUP (à lire, hors transaction)
-- ============================================================================
-- SELECT 'GENIUS depenses' k, count(*) FROM budget_expenses
--   WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' AND updated_at IS NOT NULL
-- UNION ALL SELECT 'GENIUS caisse', count(*) FROM cash_movements
--   WHERE school_id = '6b68407b-3d2e-426b-81ff-c4e68e66120a' AND updated_at IS NOT NULL;
--   → attendu : 60 et 11
--
-- Puis, sur le serveur de l'école, après un cycle de synchronisation :
--   sqlite3 /var/lib/notescam/data/notescam.db \
--     'SELECT count(*) FROM cash_movements; SELECT count(*) FROM budget_expenses;'
--   → attendu : 11 et 60
--
-- ============================================================================
-- RETOUR ARRIÈRE
-- ============================================================================
-- BEGIN;
-- DO $$
-- DECLARE t text; sauv text;
-- BEGIN
--   FOR sauv IN SELECT table_name FROM information_schema.tables
--                WHERE table_schema='public' AND table_name LIKE 'zz_sauv_updated_at_20261024_%'
--   LOOP
--     t := replace(sauv, 'zz_sauv_updated_at_20261024_', '');
--     EXECUTE format('UPDATE public.%I c SET updated_at = NULL WHERE c.id IN (SELECT id FROM public.%I)', t, sauv);
--     EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_at DROP DEFAULT', t);
--     RAISE NOTICE 'retour arrière : % remise à NULL depuis %.', t, sauv;
--   END LOOP;
-- END $$;
-- COMMIT;
--
-- Les tables `zz_sauv_updated_at_20261024_*` sont LE retour arrière : les
-- garder jusqu'à ce que THE GENIUS confirme que son journal de caisse porte
-- bien ses onze écritures et ses soixante dépenses.
-- ============================================================================
