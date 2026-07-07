-- ════════════════════════════════════════════════════════════════════════════
-- MODULE VIE SCOLAIRE — Surveillant / Discipline
-- ════════════════════════════════════════════════════════════════════════════
-- Transforme le rôle « surveillant » en véritable module de vie scolaire :
--   • périmètre du surveillant (sections / cycles / classes)
--   • retards, incidents disciplinaires, sanctions, avertissements, retenues
--   • convocations & rendez-vous parents, autorisations de sortie
--   • conseil de discipline (dossier + décisions)
--
-- Modèle RLS : identique aux autres tables — tout membre actif de l'école lit ;
-- l'écriture reste réservée aux membres actifs (le front restreint au périmètre
-- Vie Scolaire : admin / censeur / surveillant). Le SURVEILLANT n'a par
-- construction AUCUNE table de notes/frais ici.
--
-- Colonnes de synchro continue LAN↔Cloud (updated_at/version/device_id) comme
-- pour `staff` — voir supabase_staff_personnel.sql.
--
-- Idempotent : réexécutable sans risque. À lancer dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PÉRIMÈTRE DU SURVEILLANT (sur school_users)
-- ─────────────────────────────────────────────────────────────────────────────
-- Un surveillant peut être rattaché à une ou plusieurs SECTIONS, un ou plusieurs
-- CYCLES, et/ou des CLASSES précises. Tout vide/NULL = tout l'établissement
-- (rétro-compatible : les surveillants existants gardent l'accès global).
--   scope_sections : text[]  parmi 'maternelle','primaire','premier_cycle','second_cycle'
--   scope_cycles   : text[]  parmi 'fondamental','secondaire'
--   scope_class_ids: uuid[]  ids de classes précises

ALTER TABLE public.school_users
  ADD COLUMN IF NOT EXISTS scope_sections  text[],
  ADD COLUMN IF NOT EXISTS scope_cycles    text[],
  ADD COLUMN IF NOT EXISTS scope_class_ids uuid[];

COMMENT ON COLUMN public.school_users.scope_sections IS
  'Périmètre du surveillant : sections accessibles (vide = tout l''établissement).';
COMMENT ON COLUMN public.school_users.scope_cycles IS
  'Périmètre du surveillant : cycles accessibles (fondamental/secondaire).';
COMMENT ON COLUMN public.school_users.scope_class_ids IS
  'Périmètre du surveillant : classes précises accessibles.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RETARDS (late_arrivals)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.late_arrivals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  year_label    text,
  date          date NOT NULL DEFAULT current_date,
  arrival_time  text,                    -- heure d'arrivée « HH:MM »
  reason        text,                    -- motif déclaré
  justified     boolean NOT NULL DEFAULT false,
  justification text,                    -- justificatif / pièce
  validated     boolean NOT NULL DEFAULT false,
  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  version       integer NOT NULL DEFAULT 1,
  device_id     text
);
CREATE INDEX IF NOT EXISTS late_arrivals_school  ON public.late_arrivals(school_id);
CREATE INDEX IF NOT EXISTS late_arrivals_student ON public.late_arrivals(student_id);
CREATE INDEX IF NOT EXISTS late_arrivals_date    ON public.late_arrivals(date);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INCIDENTS DISCIPLINAIRES (disciplinary_incidents)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.disciplinary_incidents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  year_label    text,
  incident_type text NOT NULL DEFAULT 'autre', -- bagarre|insolence|fraude|degradation|violence|telephone|autre
  custom_type   text,                    -- libellé si incident_type='autre'
  date          date NOT NULL DEFAULT current_date,
  incident_time text,                    -- « HH:MM »
  location      text,                    -- lieu
  description   text,
  witnesses     text,                    -- témoins (texte libre)
  severity      text NOT NULL DEFAULT 'mineur', -- mineur|majeur|grave
  responsible   uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- surveillant responsable
  decision      text,                    -- décision prise (résumé)
  status        text NOT NULL DEFAULT 'ouvert',  -- ouvert|traite|classe
  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  version       integer NOT NULL DEFAULT 1,
  device_id     text
);
CREATE INDEX IF NOT EXISTS disc_incidents_school  ON public.disciplinary_incidents(school_id);
CREATE INDEX IF NOT EXISTS disc_incidents_student ON public.disciplinary_incidents(student_id);
CREATE INDEX IF NOT EXISTS disc_incidents_date    ON public.disciplinary_incidents(date);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SANCTIONS (disciplinary_actions)
-- ─────────────────────────────────────────────────────────────────────────────
-- avertissement_oral|avertissement_ecrit|blame|retenue|exclusion_temporaire|
-- exclusion_definitive|travail_interet
CREATE TABLE IF NOT EXISTS public.disciplinary_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  incident_id   uuid REFERENCES public.disciplinary_incidents(id) ON DELETE SET NULL,
  year_label    text,
  action_type   text NOT NULL DEFAULT 'avertissement_oral',
  date          date NOT NULL DEFAULT current_date,
  reason        text,
  duration_days integer,                 -- pour retenue / exclusion temporaire
  start_date    date,
  end_date      date,
  decided_by    text,                    -- autorité (nom libre : surveillant, censeur, conseil…)
  notes         text,
  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  version       integer NOT NULL DEFAULT 1,
  device_id     text
);
CREATE INDEX IF NOT EXISTS disc_actions_school  ON public.disciplinary_actions(school_id);
CREATE INDEX IF NOT EXISTS disc_actions_student ON public.disciplinary_actions(student_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. AVERTISSEMENTS (student_warnings) — trace légère indépendante des sanctions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_warnings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  year_label    text,
  warning_type  text NOT NULL DEFAULT 'oral', -- oral|ecrit
  category      text,                    -- travail|conduite
  date          date NOT NULL DEFAULT current_date,
  reason        text,
  acknowledged  boolean NOT NULL DEFAULT false,
  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  version       integer NOT NULL DEFAULT 1,
  device_id     text
);
CREATE INDEX IF NOT EXISTS student_warnings_school  ON public.student_warnings(school_id);
CREATE INDEX IF NOT EXISTS student_warnings_student ON public.student_warnings(student_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RETENUES (student_detentions)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_detentions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  action_id     uuid REFERENCES public.disciplinary_actions(id) ON DELETE SET NULL,
  year_label    text,
  date          date NOT NULL DEFAULT current_date,
  start_time    text,
  end_time      text,
  duration_hours numeric,
  task          text,                    -- travail d'intérêt scolaire assigné
  supervised_by text,
  completed     boolean NOT NULL DEFAULT false,
  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  version       integer NOT NULL DEFAULT 1,
  device_id     text
);
CREATE INDEX IF NOT EXISTS student_detentions_school  ON public.student_detentions(school_id);
CREATE INDEX IF NOT EXISTS student_detentions_student ON public.student_detentions(student_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. CONVOCATIONS & RENDEZ-VOUS PARENTS (parent_meetings)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parent_meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  incident_id   uuid REFERENCES public.disciplinary_incidents(id) ON DELETE SET NULL,
  year_label    text,
  target        text NOT NULL DEFAULT 'parent', -- eleve|parent|les_deux
  reason        text,
  meeting_date  date,
  meeting_time  text,
  location      text,
  status        text NOT NULL DEFAULT 'planifie', -- planifie|honore|absent|annule
  outcome       text,                    -- compte-rendu du rendez-vous
  convened_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  version       integer NOT NULL DEFAULT 1,
  device_id     text
);
CREATE INDEX IF NOT EXISTS parent_meetings_school  ON public.parent_meetings(school_id);
CREATE INDEX IF NOT EXISTS parent_meetings_student ON public.parent_meetings(student_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. AUTORISATIONS DE SORTIE (exit_permissions)
-- ─────────────────────────────────────────────────────────────────────────────
-- medicale|parentale|administrative|exceptionnelle
CREATE TABLE IF NOT EXISTS public.exit_permissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  year_label    text,
  exit_type     text NOT NULL DEFAULT 'parentale',
  date          date NOT NULL DEFAULT current_date,
  exit_time     text,
  return_time   text,
  reason        text,
  authorized_by text,                    -- personne qui vient chercher / autorité
  accompanied_by text,                   -- accompagnateur
  returned      boolean NOT NULL DEFAULT false,
  signature     text,                    -- data-URL de signature (optionnel)
  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  version       integer NOT NULL DEFAULT 1,
  device_id     text
);
CREATE INDEX IF NOT EXISTS exit_permissions_school  ON public.exit_permissions(school_id);
CREATE INDEX IF NOT EXISTS exit_permissions_student ON public.exit_permissions(student_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CONSEIL DE DISCIPLINE (discipline_statistics — dossier + décisions)
-- ─────────────────────────────────────────────────────────────────────────────
-- Nom de table imposé par le cahier des charges. Sert de DOSSIER de conseil de
-- discipline : agrège l'élève concerné, les membres présents et la décision.
CREATE TABLE IF NOT EXISTS public.discipline_statistics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid REFERENCES public.students(id) ON DELETE CASCADE,
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  incident_id   uuid REFERENCES public.disciplinary_incidents(id) ON DELETE SET NULL,
  year_label    text,
  council_date  date,
  members       text,                    -- membres présents (un par ligne)
  summary       text,                    -- exposé des faits / dossier
  decision      text,                    -- décision du conseil
  sanction_type text,                    -- sanction retenue (cf. disciplinary_actions.action_type)
  status        text NOT NULL DEFAULT 'convoque', -- convoque|tenu|clos
  recorded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  version       integer NOT NULL DEFAULT 1,
  device_id     text
);
CREATE INDEX IF NOT EXISTS discipline_stats_school  ON public.discipline_statistics(school_id);
CREATE INDEX IF NOT EXISTS discipline_stats_student ON public.discipline_statistics(student_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RLS — même modèle que les autres tables (membre actif de l'école)
-- ─────────────────────────────────────────────────────────────────────────────
-- Générée par boucle pour rester DRY et idempotente (DROP puis CREATE).
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'late_arrivals','disciplinary_incidents','disciplinary_actions',
    'student_warnings','student_detentions','parent_meetings',
    'exit_permissions','discipline_statistics'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "school members read %1$s" ON public.%1$I;', tbl);
    EXECUTE format($p$
      CREATE POLICY "school members read %1$s" ON public.%1$I
        FOR SELECT USING (
          school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
        );$p$, tbl);

    EXECUTE format('DROP POLICY IF EXISTS "school members insert %1$s" ON public.%1$I;', tbl);
    EXECUTE format($p$
      CREATE POLICY "school members insert %1$s" ON public.%1$I
        FOR INSERT WITH CHECK (
          school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
        );$p$, tbl);

    EXECUTE format('DROP POLICY IF EXISTS "school members update %1$s" ON public.%1$I;', tbl);
    EXECUTE format($p$
      CREATE POLICY "school members update %1$s" ON public.%1$I
        FOR UPDATE USING (
          school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
        );$p$, tbl);

    EXECUTE format('DROP POLICY IF EXISTS "school members delete %1$s" ON public.%1$I;', tbl);
    EXECUTE format($p$
      CREATE POLICY "school members delete %1$s" ON public.%1$I
        FOR DELETE USING (
          school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
        );$p$, tbl);
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RPC : mettre à jour le périmètre d'un compte de direction (admin only)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_staff_scope(
  p_school_user_id uuid,
  p_sections       text[],
  p_cycles         text[],
  p_class_ids      uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id
  FROM school_users
  WHERE user_id = auth.uid() AND active = true AND role = 'admin';

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  UPDATE school_users
  SET scope_sections  = p_sections,
      scope_cycles    = p_cycles,
      scope_class_ids = p_class_ids
  WHERE id = p_school_user_id
    AND school_id = v_school_id
    AND role IN ('censeur', 'surveillant');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_staff_scope(uuid, text[], text[], uuid[]) TO authenticated;

-- Étendre admin_list_staff pour renvoyer aussi le périmètre (recréée proprement).
DROP FUNCTION IF EXISTS public.admin_list_staff(text);
CREATE OR REPLACE FUNCTION public.admin_list_staff(p_role text)
RETURNS TABLE (
  id uuid, user_id uuid, full_name text, active boolean,
  scope_sections text[], scope_cycles text[], scope_class_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  SELECT su.school_id INTO v_school_id
  FROM school_users su
  WHERE su.user_id = auth.uid() AND su.active = true AND su.role = 'admin';

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  RETURN QUERY
    SELECT su.id, su.user_id, su.full_name, su.active,
           su.scope_sections, su.scope_cycles, su.scope_class_ids
    FROM school_users su
    WHERE su.school_id = v_school_id AND su.role = p_role
    ORDER BY su.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_staff(text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- FIN — Module Vie Scolaire
-- ════════════════════════════════════════════════════════════════════════════
