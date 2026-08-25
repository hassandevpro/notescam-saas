-- supabase_genius_role_permissions.sql
-- PERMISSIONS FONCTIONNELLES DE THE GENIUS — Phase 3.
--
-- Fait suite à supabase_sector_isolation.sql (Phase 2, cloisonnement Collège /
-- Primaire des 12 tables noyau). Cette phase-ci traite ce que la Phase 2 avait
-- laissé ouvert :
--
--   1. PÉDAGOGIE — étend le cloisonnement aux 10 tables de vie scolaire qui
--      portent un élève mais n'étaient pas gardées, puis aux ENSEIGNANTS et au
--      PERSONNEL (secteur dérivé pour les enseignants, colonne explicite pour le
--      personnel administratif).
--   2. FINANCE — l'autorité financière devient un RÔLE, plus un effet de bord du
--      rôle de base. Aujourd'hui `is_school_cashier` renvoie vrai pour tout
--      compte `role = 'censeur'` : or TOUS les comptes délégués de l'app naissent
--      censeur (src/config/capabilities.js). La secrétaire du Primaire peut donc
--      encaisser et modifier une grille tarifaire. C'est le trou que ce fichier
--      ferme.
--   3. FINANCE TRANSVERSE SANS PÉDAGOGIE TRANSVERSE — le service financier
--      traverse les deux secteurs sur l'argent SANS obtenir les notes et les
--      bulletins des deux secteurs. Jusqu'ici le seul moyen de le rendre
--      transverse était `scope_global = true`, qui ouvrait tout.
--   4. PERSONNEL PAR SECTEUR — le Principal et son adjoint gèrent le personnel du
--      Collège, la Directrice du primaire et son adjointe celui du Primaire.
--
-- ── CONFINEMENT À THE GENIUS ────────────────────────────────────────────────
-- Tout durcissement est gardé par `schools.strict_role_enforcement`, à FALSE par
-- défaut — même patron que `schools.advanced_delegation`. Une école qui ne
-- l'active pas conserve EXACTEMENT le comportement d'aujourd'hui, jusque dans le
-- corps des fonctions partagées (`is_school_cashier` teste le drapeau et retombe
-- sur son code d'origine). Aucun identifiant d'école n'est codé en dur dans une
-- fonction ou une policy : seule la §9, isolée et commentée, pose le drapeau.
--
-- ── POURQUOI « RESTRICTIVE » (rappel de la Phase 2) ─────────────────────────
-- Les policies permissives se combinent en OU : en ajouter une n'enlève jamais
-- un droit. Une policy AS RESTRICTIVE se combine en ET :
--   accès final = (permissive1 OR permissive2 OR …) AND (restrictive1 AND …)
-- Une seule par table suffit donc à rendre le cloisonnement incontournable sans
-- toucher aux policies existantes — donc sans casser un droit légitime en place.
--
-- ── CE QUI N'EST PAS TOUCHÉ ─────────────────────────────────────────────────
-- `service_role` contourne la RLS par conception : sync-pull, sync-push,
-- events-*, credentials-pull et donc L'APPAIRAGE LAN/CLOUD sont intacts. Aucune
-- donnée n'est supprimée. Aucun mot de passe n'est modifié. Aucune autre école
-- ne change de comportement.
--
-- Rollback : supabase_genius_role_permissions_rollback.sql
-- Contrôle  : supabase_genius_role_permissions_verify.sql
-- ============================================================================
BEGIN;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1 — L'INTERRUPTEUR ET LA COLONNE DE SECTEUR DU PERSONNEL                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS strict_role_enforcement boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schools.strict_role_enforcement IS
  'Permissions fonctionnelles strictes : l''autorité financière devient un rôle '
  '(fees.manage) au lieu de découler du rôle de base, le cloisonnement secteur '
  'couvre la vie scolaire, les enseignants et le personnel, et la gestion du '
  'personnel est bornée au secteur du responsable. FALSE = comportement historique.';

-- Secteur du personnel ADMINISTRATIF. Un agent administratif n'a ni classe ni
-- matière : son secteur ne peut pas être dérivé, il doit être déclaré.
-- NULL = agent TRANSVERSE (comptabilité, RAF, gardiennage…) : reste visible de
-- tous, ce qui est le comportement d'aujourd'hui — donc aucune régression pour
-- les fiches déjà saisies, qui sont toutes à NULL après cette migration.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS sector text;

COMMENT ON COLUMN public.staff.sector IS
  'Secteur de rattachement : maternelle | primaire | college. NULL = agent '
  'transverse au complexe (visible de tous les secteurs).';

CREATE INDEX IF NOT EXISTS staff_sector_idx ON public.staff (school_id, sector);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2 — SOCLE : DRAPEAU, PERMISSIONS DE GOUVERNANCE, VOCABULAIRE DE SECTEUR  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Toutes SECURITY DEFINER (elles lisent school_users / governance_roles sans être
-- bloquées par la RLS de ces tables) et STABLE (évaluées une fois par requête et
-- non par ligne — l'audit d'échelle 100+ écoles impose cette précaution).

-- L'école applique-t-elle les permissions strictes ?
CREATE OR REPLACE FUNCTION public.school_strict_roles(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT s.strict_role_enforcement FROM public.schools s
                    WHERE s.id = p_school), false);
$$;

-- Le compte est-il administrateur actif de cette école ?
CREATE OR REPLACE FUNCTION public.is_school_admin(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.school_users su
                  WHERE su.user_id = (SELECT auth.uid())
                    AND su.school_id = p_school AND su.active = true
                    AND su.role = 'admin');
$$;

-- Permissions effectives apportées par les RÔLES DE GOUVERNANCE actifs du compte.
-- Union de `permissions` et `workflows` du catalogue de l'école (governance_roles),
-- pour les affectations actives aujourd'hui (statut + fenêtre de dates) — même
-- sémantique que src/governance/governanceEngine.js:activeAssignments.
CREATE OR REPLACE FUNCTION public.user_gov_perms(p_school uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT p), '{}'::text[])
    FROM public.user_governance_roles ugr
    JOIN public.governance_roles gr
      ON gr.school_id = ugr.school_id AND gr.code = ugr.role AND gr.active = true
   CROSS JOIN LATERAL (
     SELECT jsonb_array_elements_text(gr.permissions) AS p
     UNION ALL
     SELECT jsonb_array_elements_text(gr.workflows)
   ) q
   WHERE ugr.school_id = p_school
     AND ugr.user_id = (SELECT auth.uid())
     AND COALESCE(ugr.status, 'active') = 'active'
     AND (ugr.start_date IS NULL OR ugr.start_date <= CURRENT_DATE)
     AND (ugr.end_date   IS NULL OR ugr.end_date   >= CURRENT_DATE);
$$;

CREATE OR REPLACE FUNCTION public.user_has_gov_perm(p_school uuid, p_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_perm = ANY (public.user_gov_perms(p_school));
$$;

-- Le compte porte-t-il cette PAGE dans ses capacités déléguées ?
-- Comparaison sur le TEXTE, sans cast jsonb : un `permissions` mal formé ferait
-- lever la fonction, donc échouer toute la requête métier. Même parti pris que
-- `is_school_cashier` d'origine — une correspondance un peu large vaut mieux
-- qu'un métier bloqué.
CREATE OR REPLACE FUNCTION public.user_has_page(p_school uuid, p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.school_users su
                  WHERE su.user_id = (SELECT auth.uid())
                    AND su.school_id = p_school AND su.active = true
                    AND su.permissions::text LIKE '%' || p_path || '%');
$$;

-- ── Vocabulaire de secteur ──────────────────────────────────────────────────
-- Le dépôt manipule QUATRE vocabulaires : classes.cycle (maternelle|primaire|
-- secondaire), classes.section (maternelle|primaire|premier_cycle|second_cycle),
-- school_users.scope_cycles (fondamental|secondaire) et le secteur de gouvernance
-- (maternelle|primaire|college). Cette fonction est le SEUL point de traduction :
-- tout le reste du fichier raisonne en secteur de gouvernance.
CREATE OR REPLACE FUNCTION public.class_sector(p_class uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
           WHEN cl.section IN ('premier_cycle','second_cycle') THEN 'college'
           WHEN cl.cycle   = 'secondaire'                      THEN 'college'
           WHEN cl.section = 'primaire'   OR cl.cycle = 'primaire'   THEN 'primaire'
           WHEN cl.section = 'maternelle' OR cl.cycle = 'maternelle' THEN 'maternelle'
           ELSE NULL
         END
    FROM public.classes cl WHERE cl.id = p_class;
$$;

-- Secteurs RÉELLEMENT couverts par le périmètre du compte.
-- Dérivé en rejouant le prédicat de la Phase 2 sur les classes de l'école : le
-- résultat ne peut donc pas diverger du cloisonnement déjà en place, et aucune
-- règle de traduction n'est réécrite ici.
CREATE OR REPLACE FUNCTION public.user_sectors(p_school uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT s), '{}'::text[]) FROM (
    SELECT public.class_sector(cl.id) AS s
      FROM public.classes cl
     WHERE cl.school_id = p_school
       AND public.user_scope_allows_class(p_school, cl.id)
  ) q WHERE q.s IS NOT NULL;
$$;

-- Secteurs d'un ENSEIGNANT — DÉRIVÉS (décision : aucune saisie supplémentaire).
-- Un enseignant relève des secteurs des classes dont il est titulaire
-- (classes.teacher_id) et de celles où il assure une matière (subjects.teacher_id).
CREATE OR REPLACE FUNCTION public.teacher_sectors(p_school uuid, p_teacher uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT s), '{}'::text[]) FROM (
    SELECT public.class_sector(cl.id) AS s
      FROM public.classes cl
     WHERE cl.school_id = p_school
       AND (cl.teacher_id = p_teacher
            OR EXISTS (SELECT 1 FROM public.subjects sub
                        WHERE sub.class_id = cl.id AND sub.teacher_id = p_teacher))
  ) q WHERE q.s IS NOT NULL;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3 — L'AUTORITÉ FINANCIÈRE DEVIENT UN RÔLE                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Trois clés de permission, portées par le CATALOGUE de gouvernance de l'école
-- (governance_roles est par école : le confinement à THE GENIUS est donc naturel,
-- aucune autre école ne reçoit ces clés).
--
--   fees.manage  — gérer frais, dus, grilles et encaissements, SUR LES DEUX
--                  SECTEURS. Caissier, RAF, Coordonnateur, Fondatrice.
--   fees.view    — CONSULTER les frais des deux secteurs, sans aucune écriture.
--                  Contrôleur (décision : lecture seule, conforme au « préparé
--                  sans droits excessifs » de src/governance/permissions.js).
--   staff.manage.sector — gérer le personnel de SON secteur. Principal,
--                  Vice-principal, Directrice du primaire, Adjointe, Responsable
--                  maternelle.

-- Détient l'autorité d'ÉCRITURE financière.
CREATE OR REPLACE FUNCTION public.is_finance_officer(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_school_admin(p_school)
      OR public.user_has_gov_perm(p_school, 'fees.manage');
$$;

-- Détient l'autorité de LECTURE financière transverse (inclut les écrivains).
CREATE OR REPLACE FUNCTION public.is_finance_reader(p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_finance_officer(p_school)
      OR public.user_has_gov_perm(p_school, 'fees.view');
$$;

-- ── Redéfinition de `is_school_cashier` ─────────────────────────────────────
-- Garde `student_fees`, `class_fee_grids` (FOR ALL), `fee_payments` (INSERT) et
-- `cash_sessions` (supabase_fee_integrity.sql, supabase_cash_control.sql).
-- La branche « école non stricte » reproduit MOT POUR MOT le corps d'origine :
-- aucune autre école ne change de comportement.
CREATE OR REPLACE FUNCTION public.is_school_cashier(p_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.school_strict_roles(p_school_id)
      -- STRICT : l'autorité financière est un rôle, jamais un effet de bord du
      -- rôle de base. Voir la ANNEXE en fin de fichier pour la démonstration.
      THEN public.is_finance_officer(p_school_id)
    ELSE
      -- HISTORIQUE — corps d'origine, inchangé.
      EXISTS (
        SELECT 1 FROM public.school_users
         WHERE user_id = (SELECT auth.uid())
           AND school_id = p_school_id
           AND active = true
           AND (role IN ('admin', 'censeur')
                OR permissions::text LIKE '%/app/fees%')
      )
  END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4 — PRÉDICATS DE CLOISONNEMENT (enseignants, personnel, argent)          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Un ENSEIGNANT est-il dans le périmètre du compte connecté ?
CREATE OR REPLACE FUNCTION public.user_scope_allows_teacher(p_school uuid, p_teacher uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sectors text[]; v_mine text[];
BEGIN
  IF NOT public.school_strict_roles(p_school) THEN RETURN true; END IF;  -- autres écoles
  IF p_teacher IS NULL THEN RETURN true; END IF;
  IF public.user_scope_is_global(p_school) THEN RETURN true; END IF;
  -- L'administrateur voit tout le corps enseignant même si un périmètre lui a
  -- été posé par erreur : sans cela, une fausse manœuvre de paramétrage rendrait
  -- l'école ingérable pour son propre administrateur.
  IF public.is_school_admin(p_school) THEN RETURN true; END IF;

  -- Un enseignant voit TOUJOURS sa propre fiche (profil, mot de passe, photo).
  IF EXISTS (SELECT 1 FROM public.teachers t
              WHERE t.id = p_teacher AND t.school_id = p_school
                AND t.auth_user_id = (SELECT auth.uid())) THEN
    RETURN true;
  END IF;

  v_sectors := public.teacher_sectors(p_school, p_teacher);
  -- Enseignant sans aucune classe ni matière : son secteur est indéterminé. Le
  -- masquer le rendrait ingérable (on ne pourrait plus lui AFFECTER de classe,
  -- donc jamais lui donner un secteur : impasse). Il reste donc visible.
  IF array_length(v_sectors, 1) IS NULL THEN RETURN true; END IF;

  v_mine := public.user_sectors(p_school);
  RETURN v_sectors && v_mine;   -- intersection non vide
END $$;

-- Un membre du PERSONNEL est-il dans le périmètre du compte connecté ?
CREATE OR REPLACE FUNCTION public.user_scope_allows_staff(p_school uuid, p_sector text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.school_strict_roles(p_school)
      OR public.user_scope_is_global(p_school)
      OR public.is_school_admin(p_school)       -- cf. user_scope_allows_teacher
      -- RH TRANSVERSE : l'autorité sur tout le personnel ne se laisse pas borner
      -- par le périmètre PÉDAGOGIQUE du compte. Le RAF est sectoriel côté classes
      -- et transverse côté personnel — comme il l'est côté argent.
      OR public.user_has_gov_perm(p_school, 'staff.manage.all')
      OR p_sector IS NULL                       -- agent transverse : visible de tous
      OR p_sector = ANY (public.user_sectors(p_school));
$$;

-- Le compte peut-il ÉCRIRE la fiche d'un membre du personnel de ce secteur ?
-- « La directrice du primaire et son adjointe gèrent leur personnel, tout comme
--   le principal du collège et son adjoint gèrent le leur. »
CREATE OR REPLACE FUNCTION public.can_manage_staff(p_school uuid, p_sector text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.school_strict_roles(p_school)
      OR public.is_school_admin(p_school)
      -- RH transverse : conserve la gestion de tout le complexe.
      OR public.user_has_gov_perm(p_school, 'staff.manage.all')
      -- Chef de secteur (ou compte délégué porteur de la page Personnel) :
      -- borné à SON secteur, plus les agents transverses.
      OR ( (public.user_has_gov_perm(p_school, 'staff.manage.sector')
            OR public.user_has_page(p_school, '/app/personnel'))
           AND (p_sector IS NULL OR p_sector = ANY (public.user_sectors(p_school))) );
$$;

-- ── Périmètre appliqué à l'ARGENT ───────────────────────────────────────────
-- Le service financier traverse les deux secteurs SUR L'ARGENT, sans obtenir
-- pour autant les notes et les bulletins des deux secteurs : c'est exactement la
-- séparation demandée (pédagogie sectorielle / finance transverse). Avant ce
-- fichier, le seul moyen de rendre un caissier transverse était
-- `scope_global = true`, qui lui ouvrait aussi toute la pédagogie.
CREATE OR REPLACE FUNCTION public.fee_scope_allows_student(p_school uuid, p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_scope_allows_student(p_school, p_student)
      OR (public.school_strict_roles(p_school) AND public.is_finance_reader(p_school));
$$;

CREATE OR REPLACE FUNCTION public.fee_scope_allows_class(p_school uuid, p_class uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_scope_allows_class(p_school, p_class)
      OR (public.school_strict_roles(p_school) AND public.is_finance_reader(p_school));
$$;

REVOKE ALL ON FUNCTION public.school_strict_roles(uuid)              FROM public;
REVOKE ALL ON FUNCTION public.is_school_admin(uuid)                  FROM public;
REVOKE ALL ON FUNCTION public.user_gov_perms(uuid)                   FROM public;
REVOKE ALL ON FUNCTION public.user_has_gov_perm(uuid, text)          FROM public;
REVOKE ALL ON FUNCTION public.user_has_page(uuid, text)              FROM public;
REVOKE ALL ON FUNCTION public.class_sector(uuid)                     FROM public;
REVOKE ALL ON FUNCTION public.user_sectors(uuid)                     FROM public;
REVOKE ALL ON FUNCTION public.teacher_sectors(uuid, uuid)            FROM public;
REVOKE ALL ON FUNCTION public.is_finance_officer(uuid)               FROM public;
REVOKE ALL ON FUNCTION public.is_finance_reader(uuid)                FROM public;
REVOKE ALL ON FUNCTION public.user_scope_allows_teacher(uuid, uuid)  FROM public;
REVOKE ALL ON FUNCTION public.user_scope_allows_staff(uuid, text)    FROM public;
REVOKE ALL ON FUNCTION public.can_manage_staff(uuid, text)           FROM public;
REVOKE ALL ON FUNCTION public.fee_scope_allows_student(uuid, uuid)   FROM public;
REVOKE ALL ON FUNCTION public.fee_scope_allows_class(uuid, uuid)     FROM public;

GRANT EXECUTE ON FUNCTION public.school_strict_roles(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_gov_perms(uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_gov_perm(uuid, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_page(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.class_sector(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_sectors(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_sectors(uuid, uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_officer(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_reader(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_scope_allows_teacher(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_scope_allows_staff(uuid, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_staff(uuid, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.fee_scope_allows_student(uuid, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fee_scope_allows_class(uuid, uuid)     TO authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 5 — VIE SCOLAIRE : LES 10 TABLES LAISSÉES OUVERTES PAR LA PHASE 2       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Toutes portent `student_id` ET `class_id` mais n'étaient gardées par aucune
-- policy de secteur : un surveillant du Collège lisait les retards, incidents,
-- sanctions et convocations du Primaire. On applique le prédicat par ÉLÈVE
-- (et non par classe) car `class_id` y est nullable : un élève ayant changé de
-- classe laisserait sinon une ligne orpheline hors cloisonnement.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance', 'late_arrivals', 'student_warnings', 'student_detentions',
    'disciplinary_incidents', 'disciplinary_actions', 'exit_permissions',
    'parent_meetings', 'student_fee_items'
  ] LOOP
    -- Table absente (module non déployé sur cette base) : on passe, sans échouer.
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'table % absente — ignorée', t; CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY "secteur: cloisonnement" ON public.%I AS RESTRICTIVE FOR ALL TO public
        USING      (public.user_scope_allows_student(school_id, student_id))
        WITH CHECK (public.user_scope_allows_student(school_id, student_id))
    $p$, t);
    RAISE NOTICE 'cloisonnement posé sur %', t;
  END LOOP;
END $$;

-- `class_fee_grids` porte le TARIF d'une classe : c'est une donnée d'argent,
-- gardée par le prédicat financier (le service financier voit les deux secteurs).
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.class_fee_grids;
CREATE POLICY "secteur: cloisonnement" ON public.class_fee_grids AS RESTRICTIVE FOR ALL TO public
  USING      (public.fee_scope_allows_class(school_id, class_id))
  WITH CHECK (public.fee_scope_allows_class(school_id, class_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 6 — ARGENT : TRANSVERSE POUR LA FINANCE, CLOISONNÉ POUR LES AUTRES      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Remplace les deux policies posées par la Phase 2 : le prédicat passe de
-- `user_scope_allows_student` à `fee_scope_allows_student`, qui ajoute le seul
-- cas du service financier. Pour toute école NON stricte, les deux prédicats
-- sont rigoureusement équivalents.

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.student_fees;
CREATE POLICY "secteur: cloisonnement" ON public.student_fees AS RESTRICTIVE FOR ALL TO public
  USING      (public.fee_scope_allows_student(school_id, student_id))
  WITH CHECK (public.fee_scope_allows_student(school_id, student_id));

DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.fee_payments;
CREATE POLICY "secteur: cloisonnement" ON public.fee_payments AS RESTRICTIVE FOR ALL TO public
  USING      (public.fee_scope_allows_student(school_id, student_id))
  WITH CHECK (public.fee_scope_allows_student(school_id, student_id));

-- Le CONTRÔLEUR est en lecture seule (décision de l'établissement). `fees.view`
-- ne lui ouvre donc que le SELECT : l'écriture reste gardée par
-- `is_school_cashier` → `is_finance_officer`, qui exige `fees.manage`.
-- Cette policy restrictive interdit en outre toute écriture financière à qui
-- n'est pas officier financier, y compris par un chemin qu'on aurait oublié.
DROP POLICY IF EXISTS "finance: écriture réservée" ON public.fee_payments;
CREATE POLICY "finance: écriture réservée" ON public.fee_payments AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (NOT public.school_strict_roles(school_id) OR public.is_finance_officer(school_id));

DROP POLICY IF EXISTS "finance: écriture réservée" ON public.student_fees;
CREATE POLICY "finance: écriture réservée" ON public.student_fees AS RESTRICTIVE FOR ALL TO public
  USING      (true)   -- la LECTURE reste ouverte aux membres (policy permissive)
  WITH CHECK (NOT public.school_strict_roles(school_id) OR public.is_finance_officer(school_id));

DROP POLICY IF EXISTS "finance: écriture réservée" ON public.class_fee_grids;
CREATE POLICY "finance: écriture réservée" ON public.class_fee_grids AS RESTRICTIVE FOR ALL TO public
  USING      (true)
  WITH CHECK (NOT public.school_strict_roles(school_id) OR public.is_finance_officer(school_id));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 7 — ENSEIGNANTS ET PERSONNEL PAR SECTEUR                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.teachers;
CREATE POLICY "secteur: cloisonnement" ON public.teachers AS RESTRICTIVE FOR ALL TO public
  USING      (public.user_scope_allows_teacher(school_id, id))
  WITH CHECK (public.user_scope_allows_teacher(school_id, id));

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "secteur: cloisonnement" ON public.staff;
CREATE POLICY "secteur: cloisonnement" ON public.staff AS RESTRICTIVE FOR ALL TO public
  USING      (public.user_scope_allows_staff(school_id, sector))
  WITH CHECK (public.user_scope_allows_staff(school_id, sector)
              AND public.can_manage_staff(school_id, sector));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 8 — CATALOGUE DE GOUVERNANCE : QUI PORTE QUELLE AUTORITÉ                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Les clés sont ajoutées AUX rôles existants du catalogue de l'école visée, sans
-- rien retirer (`||` sur le tableau jsonb, dédoublonné). `governance_roles` étant
-- par école, aucune autre école n'est concernée.

CREATE OR REPLACE FUNCTION public.grant_gov_perm(p_school uuid, p_code text, p_perm text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.governance_roles
     SET permissions = (
           SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb)
             FROM jsonb_array_elements_text(permissions || to_jsonb(p_perm)) AS x
         ),
         updated_at = now()
   WHERE school_id = p_school AND code = p_code
     AND NOT (permissions @> to_jsonb(p_perm));
END $$;

-- Applique la matrice d'autorité à UNE école. Appelée en §9 pour THE GENIUS.
CREATE OR REPLACE FUNCTION public.apply_strict_role_matrix(p_school uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text;
BEGIN
  -- Le catalogue doit exister avant d'être enrichi (écoles jamais amorcées).
  IF NOT EXISTS (SELECT 1 FROM public.governance_roles WHERE school_id = p_school) THEN
    PERFORM public.seed_governance_catalog(p_school);
  END IF;

  -- Le Contrôleur n'est PAS dans le catalogue système (src/governance/
  -- defaultCatalog.js n'en contient que 9) : on le crée s'il manque, en lecture
  -- seule — aucune permission d'approbation, de paiement ni de mutation.
  INSERT INTO public.governance_roles
         (school_id, code, name, description, rank, scope, sector,
          permissions, pages, dashboards, workflows, active, is_system)
  VALUES (p_school, 'controleur', 'Contrôleur', 'Audit et contrôle — consultation seule',
          70, 'complex', NULL,
          '["governance.view","budget.view","expense.view"]'::jsonb,
          '["/app/reports"]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, true)
  ON CONFLICT (school_id, code) DO NOTHING;

  -- FINANCE — écriture transverse sur les deux secteurs.
  FOREACH c IN ARRAY ARRAY['caissier','raf','coordonnateur_general','fondatrice'] LOOP
    PERFORM public.grant_gov_perm(p_school, c, 'fees.manage');
  END LOOP;

  -- FINANCE — lecture transverse seule (décision : Contrôleur sans écriture).
  PERFORM public.grant_gov_perm(p_school, 'controleur', 'fees.view');

  -- PERSONNEL — chaque chef de secteur gère le personnel de SON secteur.
  FOREACH c IN ARRAY ARRAY['principal','vice_principal','directrice_primaire',
                           'directrice_adjointe_primaire','responsable_maternelle'] LOOP
    PERFORM public.grant_gov_perm(p_school, c, 'staff.manage.sector');
  END LOOP;

  -- PERSONNEL — RH transverse conservée à la direction générale.
  FOREACH c IN ARRAY ARRAY['fondatrice','coordonnateur_general','raf'] LOOP
    PERFORM public.grant_gov_perm(p_school, c, 'staff.manage.all');
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.grant_gov_perm(uuid, text, text)  FROM public;
REVOKE ALL ON FUNCTION public.apply_strict_role_matrix(uuid)    FROM public;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 9 — ACTIVATION — LA SEULE SECTION QUI NOMME UNE ÉCOLE                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Deux écoles du projet contiennent « genius » : `THE GENIUS` (plan réseau,
-- 11 membres) et `The Genius International School` (1 membre, à ignorer). Le
-- filtre porte donc sur l'ID, jamais sur le nom.
--
-- ⚠️ VÉRIFIEZ l'ID ci-dessous par la requête 3 de supabase_genius_role_permissions_verify.sql
--    AVANT d'exécuter ce fichier. Un ID erroné durcirait la mauvaise école.

DO $$
DECLARE v_school uuid := '6b68407b-3d2e-426b-81ff-c4e68e66120a';
        v_name   text;
BEGIN
  SELECT name INTO v_name FROM public.schools WHERE id = v_school;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'École % introuvable — activation annulée, rien n''est durci.', v_school;
  END IF;
  RAISE NOTICE 'Activation des permissions strictes pour : %', v_name;

  PERFORM public.apply_strict_role_matrix(v_school);
  UPDATE public.schools SET strict_role_enforcement = true WHERE id = v_school;

  -- Garde-fou : aucune AUTRE école ne doit avoir été activée par ce fichier.
  IF EXISTS (SELECT 1 FROM public.schools
              WHERE strict_role_enforcement = true AND id <> v_school) THEN
    RAISE EXCEPTION 'Une autre école porte le drapeau strict — annulation complète.';
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- ANNEXE — POURQUOI `role IN ('admin','censeur')` NE POUVAIT PAS TENIR
-- ════════════════════════════════════════════════════════════════════════════
-- `school_users.role` n'accepte que 4 valeurs (admin, teacher, censeur,
-- surveillant). L'app n'a donc AUCUN rôle de base « caissier », « secrétaire »
-- ou « RAF » : src/config/capabilities.js crée ces métiers comme `censeur` +
-- une liste de pages. Le test `role IN ('admin','censeur')` de l'ancienne
-- `is_school_cashier` renvoyait par conséquent vrai pour la secrétaire du
-- Primaire, le responsable informatique et le censeur — tous porteurs du rôle de
-- base `censeur`. Le second terme, `permissions LIKE '%/app/fees%'`, était lui
-- aussi trop large : le préréglage `censeur` accorde explicitement `/app/fees`.
--
-- D'où la règle retenue : l'autorité financière est portée par un RÔLE DE
-- GOUVERNANCE (fees.manage), attribué dans le catalogue de l'école. Elle ne peut
-- plus être obtenue par le simple fait d'exister en tant que compte délégué.
