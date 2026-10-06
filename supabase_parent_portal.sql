-- supabase_parent_portal.sql
-- ESPACE PARENT — compte parent authentifié, cloisonné à ses propres enfants.
--
-- ⚠️  CE FICHIER N'A PAS ENCORE ÉTÉ APPLIQUÉ EN PRODUCTION.
--     Jouer d'abord supabase_parent_portal_verify.sql §A (instantané de
--     référence), puis ce fichier, puis §B et §C du verify.
--     Retour arrière : supabase_parent_portal_rollback.sql
--
-- ── LE PRINCIPE, EN UNE PHRASE ──────────────────────────────────────────────
-- Le parent n'entre JAMAIS dans `school_users`. Toutes les policies de la base
-- (permissives comme restrictives) accordent l'accès sur l'appartenance à cette
-- table : `is_school_member`, `user_school_id()`, `can_see_school`,
-- `user_scope_allows_class`… Un compte absent de `school_users` est donc refusé
-- PAR DÉFAUT sur students, classes, subjects, grades, attendance, late_arrivals,
-- student_fees, fee_payments, tous les *_bulletins, disciplinary_*, schools…
--
-- Conséquence recherchée : il n'y a AUCUNE liste d'autorisations à maintenir. La
-- porte est fermée d'origine ; ce fichier n'ouvre que des fenêtres nommées, une
-- par section du portail, chacune gardée par le MÊME prédicat.
--
-- ── CE QUI N'EST PAS TOUCHÉ ─────────────────────────────────────────────────
-- Aucune policy existante n'est modifiée ni supprimée. Aucune fonction existante
-- n'est remplacée. En particulier restent intacts :
--   • les 5 policies `AS RESTRICTIVE "secteur: cloisonnement"` (Phase 2) ;
--   • user_scope_allows_class / _student / user_scope_is_global ;
--   • fee_scope_allows_student / _class, is_finance_officer, is_finance_reader,
--     is_school_cashier, school_strict_roles ;
--   • le drapeau schools.strict_role_enforcement et la matrice THE GENIUS ;
--   • le portail public /parent/:token (get_parent_portal_data), qui continue
--     de fonctionner en parallèle pour les familles sans compte.
--
-- ── AUCUNE ÉCRITURE POSSIBLE ────────────────────────────────────────────────
-- Toutes les RPC de ce fichier sont en LECTURE (RETURNS jsonb). Aucun GRANT
-- n'est posé sur une table de données. Écrire une note exigerait `school_users`
-- + le mode de saisie de l'école ; encaisser exigerait `is_school_cashier` ;
-- UPDATE et DELETE sur fee_payments sont déjà révoqués pour TOUT LE MONDE.
--
-- Idempotent : rejouable sans effet de bord.
-- ============================================================================

BEGIN;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §1 — IDENTITÉ PARENT                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Un compte parent. L'EXISTENCE d'une ligne active ici EST le rôle : pas de
-- colonne `role`, pas de valeur à ajouter à une contrainte CHECK ailleurs, donc
-- aucun risque de voir un parent hériter d'un droit du personnel par un test de
-- rôle écrit ailleurs dans la base.
CREATE TABLE IF NOT EXISTS public.parent_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  phone       text,
  email       text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.parent_accounts IS
  'Compte parent/tuteur. VOLONTAIREMENT HORS de school_users : y insérer un '
  'parent lui ouvrirait tout l''établissement via les policies existantes, qui '
  'accordent l''accès sur la seule appartenance et ne regardent pas le rôle.';

-- Le rattachement parent -> enfant. `school_id` est dénormalisé : une ligne se
-- suffit à elle-même pour l'audit, et un parent peut avoir des enfants dans
-- plusieurs écoles sans que la requête ait à remonter la chaîne.
CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id      uuid NOT NULL REFERENCES public.schools(id)  ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  relationship   text NOT NULL DEFAULT 'tuteur',
  is_primary     boolean NOT NULL DEFAULT false,
  active         boolean NOT NULL DEFAULT true,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  revoked_by     uuid,
  CONSTRAINT parent_student_links_unique UNIQUE (parent_user_id, student_id),
  CONSTRAINT parent_student_links_rel CHECK (relationship IN ('pere','mere','tuteur','autre'))
);

COMMENT ON TABLE public.parent_student_links IS
  'Lien parent -> enfant. Un parent peut avoir N enfants, dans N secteurs et N '
  'écoles. La révocation pose active = false : on ne supprime jamais, pour que '
  '« qui a vu quoi, et jusqu''à quand » reste établissable.';

CREATE INDEX IF NOT EXISTS parent_links_parent_idx
  ON public.parent_student_links (parent_user_id) WHERE active;
CREATE INDEX IF NOT EXISTS parent_links_student_idx
  ON public.parent_student_links (student_id) WHERE active;
CREATE INDEX IF NOT EXISTS parent_links_school_idx
  ON public.parent_student_links (school_id);

-- Publication du RANG au parent : décidée par l'établissement, jamais par
-- défaut. Le rang est une donnée COMPARATIVE — l'afficher, c'est situer l'enfant
-- par rapport aux autres. Même patron que strict_role_enforcement /
-- advanced_delegation : false par défaut, donc comportement inchangé partout.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS parent_show_rank boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schools.parent_show_rank IS
  'L''espace parent publie-t-il le rang de l''élève ? FALSE par défaut.';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §2 — LE GARDE UNIQUE                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Toute la sécurité de l'espace parent tient dans ce prédicat. Il est appelé en
-- PREMIÈRE LIGNE de chaque RPC. S'il est juste, tout l'espace est juste ; s'il
-- est faux, tout tombe — et un seul test le démontre.

CREATE OR REPLACE FUNCTION public.parent_owns_student(p_student uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.parent_student_links l
      JOIN public.parent_accounts a ON a.user_id = l.parent_user_id
     WHERE l.parent_user_id = auth.uid()
       AND l.student_id     = p_student
       AND l.active
       AND a.active
  );
$$;

COMMENT ON FUNCTION public.parent_owns_student(uuid) IS
  'LE point de décision de tout l''espace parent. Aucune RPC parent_* ne rend '
  'de donnée sans avoir obtenu true ici.';

-- « Ce compte est-il un parent ? » — sert au frontend et au refus explicite du
-- serveur LAN (server/scopeGuard.js), jamais à accorder quoi que ce soit.
CREATE OR REPLACE FUNCTION public.is_parent_account()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_accounts
     WHERE user_id = auth.uid() AND active
  );
$$;

REVOKE ALL ON FUNCTION public.parent_owns_student(uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_parent_account()       FROM public;
GRANT EXECUTE ON FUNCTION public.parent_owns_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_parent_account()       TO authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §3 — RLS DES DEUX TABLES NEUVES                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.parent_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_student_links  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parent_accounts: self read" ON public.parent_accounts;
CREATE POLICY "parent_accounts: self read"
  ON public.parent_accounts FOR SELECT
  USING (user_id = auth.uid());

-- Le parent lit SES liens. Rien d'autre : il ne peut pas énumérer les liens
-- d'un autre parent, ni découvrir qui d'autre suit son enfant.
DROP POLICY IF EXISTS "parent_links: self read" ON public.parent_student_links;
CREATE POLICY "parent_links: self read"
  ON public.parent_student_links FOR SELECT
  USING (parent_user_id = auth.uid());

-- Le PERSONNEL de l'école lit les liens de son école, pour les gérer depuis la
-- fiche élève. `is_school_member` est la fonction déjà utilisée par student_fees
-- et fee_payments : aucune sémantique nouvelle n'est introduite.
DROP POLICY IF EXISTS "parent_links: staff read" ON public.parent_student_links;
CREATE POLICY "parent_links: staff read"
  ON public.parent_student_links FOR SELECT
  USING (public.is_school_member(school_id));

-- Même doctrine que school_users et superadmins (supabase_security_hardening.sql) :
-- l'écriture ne passe QUE par les RPC SECURITY DEFINER. Un parent ne peut donc
-- pas se rattacher un élève dont il connaîtrait l'UUID, et un membre du personnel
-- ne peut pas contourner le contrôle de secteur de admin_link_parent_student.
GRANT SELECT ON public.parent_accounts      TO authenticated;
GRANT SELECT ON public.parent_student_links TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.parent_accounts      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.parent_student_links FROM anon, authenticated;
REVOKE ALL ON public.parent_accounts      FROM anon;
REVOKE ALL ON public.parent_student_links FROM anon;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §4 — NOTIFICATIONS : LA SEULE POLICY POSÉE SUR UNE TABLE EXISTANTE       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- PERMISSIVE et bornée aux lignes dont le destinataire EST le parent lui-même.
-- Elle ne peut élargir l'accès de personne d'autre : `notifications` ne porte
-- aucune policy restrictive avec laquelle elle pourrait se combiner, et la
-- policy historique `notifications_rw` (membres de l'école) reste inchangée.
--
-- `recipient_id` est de type text depuis l'origine (supabase_sprint17.sql) : on
-- y range l'uuid du compte parent sans changer le schéma.

DROP POLICY IF EXISTS "notifications: parent inbox read" ON public.notifications;
CREATE POLICY "notifications: parent inbox read"
  ON public.notifications FOR SELECT
  USING (recipient_role = 'parent' AND recipient_id = auth.uid()::text);

-- Le parent peut marquer SA notification comme lue — et rien d'autre. Le WITH
-- CHECK identique au USING empêche de déplacer la ligne vers un autre
-- destinataire ou un autre rôle.
DROP POLICY IF EXISTS "notifications: parent mark read" ON public.notifications;
CREATE POLICY "notifications: parent mark read"
  ON public.notifications FOR UPDATE
  USING      (recipient_role = 'parent' AND recipient_id = auth.uid()::text)
  WITH CHECK (recipient_role = 'parent' AND recipient_id = auth.uid()::text);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §5 — RPC DE LECTURE : « MES ENFANTS »                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Profil du parent + ses enfants. C'est la seule RPC qui n'attend pas d'élève :
-- elle EST la liste des élèves autorisés. Tout le reste en découle.
CREATE OR REPLACE FUNCTION public.parent_context()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acct public.parent_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_acct FROM public.parent_accounts
   WHERE user_id = auth.uid() AND active;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'parent', jsonb_build_object(
      'id',        v_acct.id,
      'user_id',   v_acct.user_id,
      'full_name', v_acct.full_name,
      'phone',     v_acct.phone,
      'email',     v_acct.email
    ),
    'children', COALESCE((
      SELECT jsonb_agg(child ORDER BY child->>'name')
        FROM (
          SELECT jsonb_build_object(
            'link_id',      l.id,
            'relationship', l.relationship,
            'is_primary',   l.is_primary,
            'student', jsonb_build_object(
              'id',             st.id,
              'name',           st.name,
              'matricule',      st.matricule,
              'photo_url',      st.photo_url,
              'gender',         st.gender,
              'date_naissance', st.date_naissance,
              'statut',         st.statut
            ),
            'class', CASE WHEN cl.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id',      cl.id,
              'name',    cl.name,
              'level',   cl.level,
              'section', cl.section,
              'cycle',   cl.cycle,
              'serie',   cl.serie,
              'system',  cl.system
            ) END,
            'school', jsonb_build_object(
              'id',           sc.id,
              'name',         sc.name,
              'logo_url',     sc.logo_url,
              'language',     sc.language,
              'currency',     sc.currency,
              'current_year', sc.current_year,
              'show_rank',    sc.parent_show_rank
            ),
            'unit', CASE WHEN un.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', un.id, 'name', un.name, 'section_key', un.section_key
            ) END,
            'name', st.name
          ) AS child
            FROM public.parent_student_links l
            JOIN public.students st ON st.id = l.student_id
            JOIN public.schools  sc ON sc.id = l.school_id
       LEFT JOIN public.classes cl ON cl.id = st.class_id
       LEFT JOIN public.school_units un ON un.id = cl.unit_id
           WHERE l.parent_user_id = auth.uid()
             AND l.active
             AND st.archived_at IS NULL
        ) q
    ), '[]'::jsonb)
  );
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §6 — RPC DE LECTURE : NOTES ET RÉSULTATS                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Rend les matières de la classe, les notes DU SEUL ENFANT, et — quand l'école
-- l'autorise — le rang, calculé en SQL sur la classe entière mais rendu sous
-- forme d'un seul entier. Les notes des autres élèves ne traversent jamais le
-- réseau : c'est la différence entre « le frontend n'affiche pas » et « le
-- serveur n'envoie pas ».

CREATE OR REPLACE FUNCTION public.parent_child_grades(p_student uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_class uuid; v_school uuid; v_sys text; v_scale numeric; v_show_rank boolean;
BEGIN
  IF NOT public.parent_owns_student(p_student) THEN RETURN NULL; END IF;

  SELECT st.class_id, st.school_id INTO v_class, v_school
    FROM public.students st WHERE st.id = p_student;

  SELECT COALESCE(cl.system, 'FR') INTO v_sys FROM public.classes cl WHERE cl.id = v_class;
  v_scale := CASE WHEN v_sys = 'FR' THEN 20 ELSE 100 END;
  SELECT COALESCE(s.parent_show_rank, false) INTO v_show_rank
    FROM public.schools s WHERE s.id = v_school;

  RETURN jsonb_build_object(
    'student_id', p_student,
    'system',     v_sys,
    'max_scale',  v_scale,
    'show_rank',  v_show_rank,

    'subjects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sb.id, 'name', sb.name, 'coef', sb.coef, 'max', COALESCE(sb."max", 20),
        'position', sb.position, 'parent_id', sb.parent_id
      ) ORDER BY COALESCE(sb.position, 999), sb.name)
        FROM public.subjects sb WHERE sb.class_id = v_class
    ), '[]'::jsonb),

    -- Les notes de l'enfant, et de lui seul.
    'grades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'subject_id', g.subject_id, 'sequence', g.sequence, 'value', g.value))
        FROM public.grades g WHERE g.student_id = p_student
    ), '[]'::jsonb),

    -- Appréciations et conduite du seul enfant.
    'appreciations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('sequence', a.seq_idx, 'text', a.text))
        FROM public.appreciations a WHERE a.student_id = p_student
    ), '[]'::jsonb),
    'conduct', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sequence', c.seq_idx, 'conduct', c.conduct, 'diligence', c.diligence))
        FROM public.conduct c WHERE c.student_id = p_student
    ), '[]'::jsonb),

    -- Décisions du conseil de classe pour cet enfant (appréciation générale,
    -- distinctions, décision) — déjà saisies par le personnel.
    'council', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sequence', sa.sequence, 'appreciation', sa.appreciation, 'decision', sa.decision,
        'th', sa.th, 'encouragement', sa.encouragement, 'felicitation', sa.felicitation))
        FROM public.student_absences sa WHERE sa.student_id = p_student
    ), '[]'::jsonb),

    -- AGRÉGATS de classe : des nombres, jamais des lignes d'élèves. Rendus même
    -- sans autorisation de rang (une moyenne de classe ne désigne personne).
    'class_stats', COALESCE((
      WITH moy AS (
        SELECT g.student_id, g.sequence,
               SUM((replace(g.value, ',', '.'))::numeric / NULLIF(COALESCE(sb."max", 20), 0)
                   * v_scale * COALESCE(sb.coef, 1)) AS pond,
               SUM(COALESCE(sb.coef, 1)) AS coefs
          FROM public.grades g
          JOIN public.subjects sb ON sb.id = g.subject_id
          JOIN public.students st ON st.id = g.student_id
         WHERE g.class_id = v_class
           AND st.archived_at IS NULL
           AND sb.parent_id IS NULL
           AND g.value ~ '^[0-9]+([.,][0-9]+)?$'
         GROUP BY g.student_id, g.sequence
      ), avg_par_eleve AS (
        SELECT student_id, sequence, ROUND(pond / NULLIF(coefs, 0), 2) AS moyenne FROM moy
      )
      SELECT jsonb_agg(jsonb_build_object(
        'sequence',  sequence,
        'class_avg', ROUND(AVG(moyenne), 2),
        'min',       MIN(moyenne),
        'max',       MAX(moyenne),
        'size',      COUNT(*)
      ) ORDER BY sequence)
        FROM avg_par_eleve GROUP BY sequence
    ), '[]'::jsonb),

    -- Le RANG de l'enfant, un entier par séquence, et uniquement si l'école le
    -- publie. Sinon la clé vaut [] : rien à filtrer côté interface.
    'ranks', CASE WHEN NOT v_show_rank THEN '[]'::jsonb ELSE COALESCE((
      WITH moy AS (
        SELECT g.student_id, g.sequence,
               SUM((replace(g.value, ',', '.'))::numeric / NULLIF(COALESCE(sb."max", 20), 0)
                   * v_scale * COALESCE(sb.coef, 1)) AS pond,
               SUM(COALESCE(sb.coef, 1)) AS coefs
          FROM public.grades g
          JOIN public.subjects sb ON sb.id = g.subject_id
          JOIN public.students st ON st.id = g.student_id
         WHERE g.class_id = v_class
           AND st.archived_at IS NULL
           AND sb.parent_id IS NULL
           AND g.value ~ '^[0-9]+([.,][0-9]+)?$'
         GROUP BY g.student_id, g.sequence
      ), rangs AS (
        SELECT student_id, sequence,
               RANK() OVER (PARTITION BY sequence ORDER BY pond / NULLIF(coefs, 0) DESC) AS rang,
               COUNT(*) OVER (PARTITION BY sequence) AS effectif
          FROM moy
      )
      SELECT jsonb_agg(jsonb_build_object(
        'sequence', sequence, 'rank', rang, 'size', effectif) ORDER BY sequence)
        FROM rangs WHERE student_id = p_student
    ), '[]'::jsonb) END
  );
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §7 — RPC DE LECTURE : BULLETINS                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- AUCUN RECALCUL. Moyennes, cotes, rangs et décisions sont LUS dans les tables
-- où le personnel les a publiés (apc_bulletins, prim_bulletins, mat_bulletins,
-- prim_resultats_annuels). Le parent voit exactement ce que l'école a arrêté —
-- pas un second calcul qui pourrait en diverger d'un centième.

CREATE OR REPLACE FUNCTION public.parent_child_bulletins(p_student uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_show_rank boolean; v_school uuid;
BEGIN
  IF NOT public.parent_owns_student(p_student) THEN RETURN NULL; END IF;

  SELECT st.school_id INTO v_school FROM public.students st WHERE st.id = p_student;
  SELECT COALESCE(s.parent_show_rank, false) INTO v_show_rank
    FROM public.schools s WHERE s.id = v_school;

  RETURN jsonb_build_object(
    'student_id', p_student,
    'show_rank',  v_show_rank,
    'apc', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'trimestre_id', b.trimestre_id, 'moyenne_generale', b.moyenne_generale,
        'cote', b.cote, 'rang', CASE WHEN v_show_rank THEN b.rang ELSE NULL END,
        'appreciation_generale', b.appreciation_generale,
        'decision_conseil', b.decision_conseil, 'updated_at', b.updated_at)
        ORDER BY b.trimestre_id)
        FROM public.apc_bulletins b WHERE b.eleve_id = p_student
    ), '[]'::jsonb),
    'prim', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'trimestre_id', b.trimestre_id, 'moyenne_generale', b.moyenne_generale,
        'cote_generale', b.cote_generale, 'rang', CASE WHEN v_show_rank THEN b.rang ELSE NULL END,
        'appreciation_generale', b.appreciation_generale,
        'decision_conseil', b.decision_conseil, 'updated_at', b.updated_at)
        ORDER BY b.trimestre_id)
        FROM public.prim_bulletins b WHERE b.eleve_id = p_student
    ), '[]'::jsonb),
    'prim_annuel', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'annee', r.annee, 'moyenne_annuelle', r.moyenne_annuelle,
        'cote_annuelle', r.cote_annuelle,
        'rang_annuel', CASE WHEN v_show_rank THEN r.rang_annuel ELSE NULL END,
        'decision', r.decision) ORDER BY r.annee)
        FROM public.prim_resultats_annuels r WHERE r.eleve_id = p_student
    ), '[]'::jsonb),
    'maternelle', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'trimestre_id', b.trimestre_id,
        'appreciation_generale', b.appreciation_generale,
        'decision', b.decision, 'updated_at', b.updated_at) ORDER BY b.trimestre_id)
        FROM public.mat_bulletins b WHERE b.eleve_id = p_student
    ), '[]'::jsonb)
  );
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §8 — RPC DE LECTURE : ABSENCES ET RETARDS                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.parent_child_attendance(p_student uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.parent_owns_student(p_student) THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'student_id', p_student,
    -- Absences DATÉES (date, demi-journée, motif) — la vue que la famille attend.
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'date', a.date, 'session', a.session, 'status', a.status,
        'motif', a.motif, 'year_label', a.year_label) ORDER BY a.date DESC)
        FROM public.attendance a WHERE a.student_id = p_student
    ), '[]'::jsonb),
    -- Retards, avec justification et validation par la vie scolaire.
    'late', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'date', l.date, 'arrival_time', l.arrival_time, 'reason', l.reason,
        'justified', l.justified, 'justification', l.justification,
        'validated', l.validated, 'year_label', l.year_label) ORDER BY l.date DESC)
        FROM public.late_arrivals l WHERE l.student_id = p_student
    ), '[]'::jsonb),
    -- Cumuls par séquence tels qu'ils figureront sur le bulletin.
    'totals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sequence', sa.sequence, 'abs_justifiees', sa.abs_j, 'abs_non_justifiees', sa.abs_nj,
        'conduite', sa.conduite) ORDER BY sa.sequence)
        FROM public.student_absences sa WHERE sa.student_id = p_student
    ), '[]'::jsonb)
  );
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §9 — RPC DE LECTURE : FRAIS SCOLAIRES                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- CONSULTATION SEULE. Le parent ne devient pas un utilisateur du service
-- financier : il ne voit que SES lignes, il n'encaisse pas, et rien ici ne pose
-- de GRANT sur fee_payments (dont UPDATE et DELETE sont déjà révoqués pour tous).
-- L'échéancier et les remises sont rendus tels quels : le moteur tarifaire
-- existant (src/lib/feeEngine.js) les interprète, comme pour le portail public.

CREATE OR REPLACE FUNCTION public.parent_child_fees(p_student uuid, p_year text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school uuid; v_year text;
BEGIN
  IF NOT public.parent_owns_student(p_student) THEN RETURN NULL; END IF;

  SELECT st.school_id INTO v_school FROM public.students st WHERE st.id = p_student;
  v_year := COALESCE(p_year, (SELECT s.current_year FROM public.schools s WHERE s.id = v_school));

  RETURN jsonb_build_object(
    'student_id', p_student,
    'academic_year', v_year,
    'currency', (SELECT s.currency FROM public.schools s WHERE s.id = v_school),
    'fee', (
      SELECT jsonb_build_object(
        'frais_annuels', f.frais_annuels, 'frais_payes', f.frais_payes,
        'date_dernier_paiement', f.date_dernier_paiement, 'payment_mode', f.payment_mode,
        'tranches', COALESCE(f.tranches, '[]'::jsonb),
        'adjustments', COALESCE(f.adjustments, '[]'::jsonb),
        'notes', f.notes)
        FROM public.student_fees f
       WHERE f.student_id = p_student AND f.academic_year = v_year
       ORDER BY f.created_at DESC LIMIT 1
    ),
    -- Postes de frais (obligatoires / optionnels) souscrits pour cet enfant.
    -- `student_fee_items` porte son propre libellé figé à la souscription : on
    -- ne joint PAS fee_catalog, dont le tarif a pu changer depuis.
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'name', i.name, 'category', i.category, 'amount', i.amount,
        'mandatory', i.mandatory, 'payment_type', i.payment_type,
        'status', i.status, 'academic_year', i.academic_year) ORDER BY i.name)
        FROM public.student_fee_items i
       WHERE i.student_id = p_student
    ), '[]'::jsonb),
    -- Historique des versements + n° de reçu. Les contre-passations sont
    -- rendues telles quelles : la famille voit un registre honnête, pas un
    -- solde retouché.
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'date', p.date, 'amount', p.amount, 'note', p.note,
        'receipt_no', p.receipt_no, 'academic_year', p.academic_year,
        'reversal_of', p.reversal_of, 'void_reason', p.void_reason,
        'recorded_by_name', p.recorded_by_name) ORDER BY p.date DESC, p.created_at DESC)
        FROM public.fee_payments p WHERE p.student_id = p_student
    ), '[]'::jsonb)
  );
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §10 — RPC DE LECTURE : DOCUMENTS ET CONVOCATIONS                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.parent_child_documents(p_student uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.parent_owns_student(p_student) THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'student_id', p_student,
    -- Convocations adressées à la famille.
    'meetings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'target', m.target, 'reason', m.reason,
        'meeting_date', m.meeting_date, 'meeting_time', m.meeting_time,
        'location', m.location, 'status', m.status, 'outcome', m.outcome)
        ORDER BY m.meeting_date DESC)
        FROM public.parent_meetings m WHERE m.student_id = p_student
    ), '[]'::jsonb),
    -- Reçus disponibles (le document lui-même est régénéré côté application par
    -- receiptDoc.js à partir de ces lignes — aucun fichier n'est stocké).
    'receipts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'receipt_no', p.receipt_no, 'date', p.date,
        'amount', p.amount, 'academic_year', p.academic_year) ORDER BY p.date DESC)
        FROM public.fee_payments p
       WHERE p.student_id = p_student AND p.receipt_no IS NOT NULL AND p.reversal_of IS NULL
    ), '[]'::jsonb),
    -- Bulletins publiés, tous moteurs confondus : de quoi lister ce qui est
    -- consultable sans rendre le contenu (c'est parent_child_bulletins qui le fait).
    'bulletins', COALESCE((
      SELECT jsonb_agg(d ORDER BY d->>'period')
        FROM (
          SELECT jsonb_build_object('engine', 'apc', 'period', b.trimestre_id,
                                    'updated_at', b.updated_at) AS d
            FROM public.apc_bulletins b WHERE b.eleve_id = p_student
          UNION ALL
          SELECT jsonb_build_object('engine', 'prim', 'period', b.trimestre_id,
                                    'updated_at', b.updated_at)
            FROM public.prim_bulletins b WHERE b.eleve_id = p_student
          UNION ALL
          SELECT jsonb_build_object('engine', 'maternelle', 'period', b.trimestre_id,
                                    'updated_at', b.updated_at)
            FROM public.mat_bulletins b WHERE b.eleve_id = p_student
        ) q
    ), '[]'::jsonb)
  );
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §11 — RPC DE LECTURE : NOTIFICATIONS                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.parent_notifications(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_parent_account() THEN RETURN NULL; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', n.id, 'type', n.type, 'title', n.title, 'body', n.body,
      'link', n.link, 'read', n.read, 'created_at', n.created_at) ORDER BY n.created_at DESC)
      FROM (
        SELECT * FROM public.notifications
         WHERE recipient_role = 'parent'
           AND recipient_id = auth.uid()::text
         ORDER BY created_at DESC
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
      ) n
  ), '[]'::jsonb);
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §12 — RPC DE LECTURE : TABLEAU DE BORD                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Une seule requête pour l'accueil : la synthèse par enfant. Elle réutilise les
-- RPC ci-dessus plutôt que de redire leurs règles — donc elle ne peut pas en
-- diverger.

CREATE OR REPLACE FUNCTION public.parent_dashboard()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_children jsonb; v_out jsonb := '[]'::jsonb; v_child jsonb; v_id uuid;
BEGIN
  v_ctx := public.parent_context();
  IF v_ctx IS NULL THEN RETURN NULL; END IF;
  v_children := v_ctx->'children';

  FOR v_child IN SELECT * FROM jsonb_array_elements(v_children) LOOP
    v_id := (v_child->'student'->>'id')::uuid;
    v_out := v_out || jsonb_build_array(v_child || jsonb_build_object(
      -- NULL::text explicite : sans le type, Postgres ne peut pas résoudre la
      -- surcharge parent_child_fees(uuid, text) et lève « function is not unique ».
      'fees',       public.parent_child_fees(v_id, NULL::text),
      'attendance', public.parent_child_attendance(v_id),
      'bulletins',  public.parent_child_bulletins(v_id)
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'parent',        v_ctx->'parent',
    'children',      v_out,
    'notifications', public.parent_notifications(10)
  );
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §13 — RPC D'ÉCRITURE : LE PROFIL DU PARENT, ET RIEN D'AUTRE              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Seule écriture de tout l'espace parent. Elle ne touche que la fiche du compte
-- appelant, et aucune donnée scolaire ou financière.

CREATE OR REPLACE FUNCTION public.parent_update_profile(
  p_full_name text DEFAULT NULL,
  p_phone     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_parent_account() THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  UPDATE public.parent_accounts
     SET full_name  = COALESCE(NULLIF(btrim(p_full_name), ''), full_name),
         phone      = COALESCE(NULLIF(btrim(p_phone), ''), phone),
         updated_at = now()
   WHERE user_id = auth.uid() AND active;

  RETURN public.parent_context();
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §14 — RPC D'ADMINISTRATION (CÔTÉ ÉCOLE)                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Motif identique à admin_create_staff_account : le compte auth est créé côté
-- application par un client sans persistance (src/lib/parentAccounts.js), puis
-- une RPC SECURITY DEFINER pose l'identité et le rattachement.

-- Qui, dans l'école, a le droit de rattacher un parent à un élève ?
-- L'administrateur, ou un compte à qui l'école a confié la page /app/students.
-- ET, dans tous les cas, le rattachement passe par user_scope_allows_student :
-- le cloisonnement par secteur s'applique donc À LA CRÉATION DU LIEN, sans
-- qu'aucune règle de secteur ne soit réécrite ici.
CREATE OR REPLACE FUNCTION public.can_manage_parent_links(p_school uuid, p_student uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_scope_allows_student(p_school, p_student)
     AND (
       EXISTS (SELECT 1 FROM public.school_users su
                WHERE su.user_id = auth.uid() AND su.school_id = p_school
                  AND su.active AND su.role IN ('admin', 'censeur'))
       OR public.has_page_permission(p_school, '/app/students')
     );
$$;

CREATE OR REPLACE FUNCTION public.admin_create_parent_account(
  p_user_id   uuid,
  p_full_name text,
  p_phone     text DEFAULT NULL,
  p_email     text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  -- L'appelant doit être membre actif d'une école. Le contrôle FIN (secteur de
  -- l'élève) se fait au rattachement : créer une identité parent sans lien
  -- n'ouvre l'accès à rien.
  IF NOT EXISTS (SELECT 1 FROM public.school_users su
                  WHERE su.user_id = auth.uid() AND su.active
                    AND su.role IN ('admin', 'censeur')) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- GARDE-FOU CENTRAL : un compte du personnel ne peut pas devenir un compte
  -- parent, et réciproquement. Les deux mondes ne se croisent jamais.
  IF EXISTS (SELECT 1 FROM public.school_users WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Ce compte appartient au personnel : il ne peut pas être un compte parent';
  END IF;

  INSERT INTO public.parent_accounts (user_id, full_name, phone, email)
       VALUES (p_user_id, p_full_name, p_phone, p_email)
  ON CONFLICT (user_id) DO UPDATE
          SET full_name = COALESCE(EXCLUDED.full_name, parent_accounts.full_name),
              phone     = COALESCE(EXCLUDED.phone,     parent_accounts.phone),
              email     = COALESCE(EXCLUDED.email,     parent_accounts.email),
              active    = true,
              updated_at = now()
    RETURNING id INTO v_id;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_link_parent_student(
  p_parent_user_id uuid,
  p_student_id     uuid,
  p_relationship   text DEFAULT 'tuteur',
  p_is_primary     boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school uuid; v_id uuid;
BEGIN
  SELECT st.school_id INTO v_school FROM public.students st WHERE st.id = p_student_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Élève introuvable'; END IF;

  IF NOT public.can_manage_parent_links(v_school, p_student_id) THEN
    RAISE EXCEPTION 'Non autorisé sur cet élève';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.parent_accounts
                  WHERE user_id = p_parent_user_id AND active) THEN
    RAISE EXCEPTION 'Compte parent introuvable ou désactivé';
  END IF;

  INSERT INTO public.parent_student_links
              (parent_user_id, school_id, student_id, relationship, is_primary, created_by)
       VALUES (p_parent_user_id, v_school, p_student_id,
               COALESCE(p_relationship, 'tuteur'), COALESCE(p_is_primary, false), auth.uid())
  ON CONFLICT (parent_user_id, student_id) DO UPDATE
          SET active       = true,
              relationship = EXCLUDED.relationship,
              is_primary   = EXCLUDED.is_primary,
              revoked_at   = NULL,
              revoked_by   = NULL
    RETURNING id INTO v_id;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_parent_link(p_link_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school uuid; v_student uuid;
BEGIN
  SELECT school_id, student_id INTO v_school, v_student
    FROM public.parent_student_links WHERE id = p_link_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Lien introuvable'; END IF;

  IF NOT public.can_manage_parent_links(v_school, v_student) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  -- Révocation, jamais suppression : « qui a vu quoi, jusqu'à quand » reste
  -- établissable, comme pour les contre-passations de caisse.
  UPDATE public.parent_student_links
     SET active = false, revoked_at = now(), revoked_by = auth.uid()
   WHERE id = p_link_id;
END $$;

-- Liste des comptes parents rattachés à un élève, pour la fiche élève.
CREATE OR REPLACE FUNCTION public.admin_list_parent_links(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school uuid;
BEGIN
  SELECT st.school_id INTO v_school FROM public.students st WHERE st.id = p_student_id;
  IF v_school IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF NOT public.user_scope_allows_student(v_school, p_student_id) THEN RETURN '[]'::jsonb; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'link_id', l.id, 'parent_user_id', l.parent_user_id,
      'full_name', a.full_name, 'phone', a.phone, 'email', a.email,
      'relationship', l.relationship, 'is_primary', l.is_primary,
      'active', l.active, 'created_at', l.created_at, 'revoked_at', l.revoked_at)
      ORDER BY l.active DESC, a.full_name)
      FROM public.parent_student_links l
      JOIN public.parent_accounts a ON a.user_id = l.parent_user_id
     WHERE l.student_id = p_student_id
  ), '[]'::jsonb);
END $$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ §15 — GRANTS                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- `authenticated` UNIQUEMENT. Rien pour `anon` : un visiteur non connecté ne
-- peut appeler aucune RPC de l'espace parent (test 20). Le portail public par
-- jeton garde sa propre RPC, inchangée.

REVOKE ALL ON FUNCTION public.parent_context()                        FROM public;
REVOKE ALL ON FUNCTION public.parent_child_grades(uuid)               FROM public;
REVOKE ALL ON FUNCTION public.parent_child_bulletins(uuid)            FROM public;
REVOKE ALL ON FUNCTION public.parent_child_attendance(uuid)           FROM public;
REVOKE ALL ON FUNCTION public.parent_child_fees(uuid, text)           FROM public;
REVOKE ALL ON FUNCTION public.parent_child_documents(uuid)            FROM public;
REVOKE ALL ON FUNCTION public.parent_notifications(int)               FROM public;
REVOKE ALL ON FUNCTION public.parent_dashboard()                      FROM public;
REVOKE ALL ON FUNCTION public.parent_update_profile(text, text)       FROM public;
REVOKE ALL ON FUNCTION public.can_manage_parent_links(uuid, uuid)     FROM public;
REVOKE ALL ON FUNCTION public.admin_create_parent_account(uuid, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.admin_link_parent_student(uuid, uuid, text, boolean) FROM public;
REVOKE ALL ON FUNCTION public.admin_revoke_parent_link(uuid)          FROM public;
REVOKE ALL ON FUNCTION public.admin_list_parent_links(uuid)           FROM public;

GRANT EXECUTE ON FUNCTION public.parent_context()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_child_grades(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_child_bulletins(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_child_attendance(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_child_fees(uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_child_documents(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_notifications(int)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_dashboard()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_update_profile(text, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_parent_links(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_parent_account(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_link_parent_student(uuid, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_parent_link(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_parent_links(uuid)        TO authenticated;

COMMIT;

-- ============================================================================
-- ANNEXE — POURQUOI PAS UNE POLICY RLS DIRECTE SUR `students`
--
-- Tentant, et c'est le piège. Il faudrait :
--   1. une policy PERMISSIVE « parent » sur chacune des quinze tables lues ;
--   2. ET modifier les cinq policies AS RESTRICTIVE « secteur: cloisonnement »
--      pour qu'elles laissent passer le parent — donc toucher
--      user_scope_allows_class, le cœur du cloisonnement THE GENIUS.
--
-- Le point 2 seul disqualifie l'approche : c'est exactement ce qu'on s'est
-- engagé à ne pas affaiblir. Mais il y a pire. La policy restrictive raisonne
-- par CLASSE (`user_scope_allows_class(school_id, class_id)`). L'assouplir pour
-- un parent ouvrirait TOUTE LA CLASSE de son enfant : ses 40 camarades, leurs
-- notes, leurs frais. La granularité demandée est l'ÉLÈVE, et seule une
-- fonction qui reçoit un student_id peut la tenir.
--
-- D'où le choix retenu : refus par défaut hérité de l'existant + RPC gardées
-- par parent_owns_student. Zéro policy existante modifiée, granularité juste,
-- et un seul endroit à relire pour auditer tout l'espace parent.
-- ============================================================================
