-- ════════════════════════════════════════════════════════════════════════════
-- NotesCam — Historisation des affectations élèves (Partie 1, Étape 1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Principe : un élève ne change jamais directement de classe. Son AFFECTATION
-- évolue. Chaque changement (classe/section/établissement) ferme la ligne en
-- cours (date_fin) et en ouvre une nouvelle. Aucune suppression physique.
--
-- Choix de conception : on FAIT ÉVOLUER la table `student_class_assignments`
-- déjà présente (Sprint 20), non destructif, plutôt que d'en créer une nouvelle.
-- Elle était jusqu'ici un simple journal ; elle devient la SOURCE DE VÉRITÉ.
--
-- ⚠️ Exécuter d'abord `supabase_student_assignments_dryrun.sql` (lecture seule).
-- Ce script-ci est IDEMPOTENT : le rejouer ne crée pas de doublons.
--
-- À coller dans : Supabase → SQL Editor → New query → Run.
-- Le LAN (SQLite) se migre seul au démarrage (server/db.js).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Évolution de la table student_class_assignments ────────────────────────
-- Colonnes ajoutées (toutes nullables / à défaut → aucune migration destructive).
-- Enums applicatifs (pas de CHECK en base, cohérent avec les autres colonnes
-- « status » de l'app ; la validation vit dans le moteur) :
--   type_transfert : initial | changement_administratif | changement_niveau
--                    | changement_etablissement | reconstruit
--   motif_cloture  : administratif | niveau | etablissement | redoublement
--                    | promotion_exceptionnelle | autre   (posé sur la ligne FERMÉE)
ALTER TABLE public.student_class_assignments
  ADD COLUMN IF NOT EXISTS school_unit_id  uuid REFERENCES public.school_units(id) ON DELETE SET NULL, -- établissement du groupe
  ADD COLUMN IF NOT EXISTS section         text,
  ADD COLUMN IF NOT EXISTS date_debut      timestamptz,
  ADD COLUMN IF NOT EXISTS date_fin        timestamptz,          -- NULL = affectation en cours
  ADD COLUMN IF NOT EXISTS type_transfert  text,
  ADD COLUMN IF NOT EXISTS motif_cloture   text,
  ADD COLUMN IF NOT EXISTS commentaire     text,
  ADD COLUMN IF NOT EXISTS created_at      timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.student_class_assignments.date_fin IS
  'NULL = affectation en cours. Renseignée = affectation clôturée (jamais supprimée).';

-- ── 2. Identifiant stable au niveau GROUPE (transfert inter-établissements) ────
-- N'existait pas : `matricule` est un texte par école. On ajoute un identifiant
-- de groupe préservé quand l'élève passe d'un établissement du complexe à un autre.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS group_student_id text;

-- Certaines bases (schéma historique reg/year) n'ont PAS students.created_at.
-- On l'ajoute (sans défaut : les anciennes lignes restent NULL → date de migration
-- via COALESCE plus bas). Harmonise avec le schéma LAN qui possède déjà la colonne.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

-- ── 3. Rattachement des données pédagogiques à l'affectation ──────────────────
-- Colonnes ajoutées (nullables). Le CÂBLAGE des lectures viendra aux étapes
-- suivantes ; ici on prépare seulement le schéma, sans backfill (les notes des
-- années archivées seront reliées quand on traitera le multi-années).
ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.student_class_assignments(id) ON DELETE SET NULL;
ALTER TABLE public.student_absences
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.student_class_assignments(id) ON DELETE SET NULL;
ALTER TABLE public.student_fees
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.student_class_assignments(id) ON DELETE SET NULL;

-- ── 4. Backfill : group_student_id (un identifiant distinct par élève) ─────────
UPDATE public.students
   SET group_student_id = gen_random_uuid()::text
 WHERE group_student_id IS NULL;

-- ── 5. Backfill des affectations ──────────────────────────────────────────────
-- 5a. Enrichit les lignes de journal existantes depuis leur classe (si connue)
--     et pose date_debut = assigned_at + type 'reconstruit'.
UPDATE public.student_class_assignments a
   SET class_name     = COALESCE(a.class_name, c.name),
       section        = COALESCE(a.section, c.section),
       school_unit_id = COALESCE(a.school_unit_id, c.unit_id),
       date_debut     = COALESCE(a.date_debut, a.assigned_at),
       type_transfert = COALESCE(a.type_transfert, 'reconstruit')
  FROM public.classes c
 WHERE c.id = a.class_id;
-- (lignes dont la classe n'existe plus : au moins date_debut/type posés)
UPDATE public.student_class_assignments a
   SET date_debut     = COALESCE(a.date_debut, a.assigned_at),
       type_transfert = COALESCE(a.type_transfert, 'reconstruit')
 WHERE a.date_debut IS NULL OR a.type_transfert IS NULL;

-- 5b. Ferme chaque ligne de journal antérieure : date_fin = début de la SUIVANTE
--     du même élève. La dernière ligne par élève reste ouverte (candidate au rôle
--     d'affectation en cours).
WITH ordered AS (
  SELECT id,
         LEAD(assigned_at) OVER (PARTITION BY student_id ORDER BY assigned_at, id) AS next_at
  FROM public.student_class_assignments
)
UPDATE public.student_class_assignments a
   SET date_fin = ordered.next_at
  FROM ordered
 WHERE a.id = ordered.id
   AND a.date_fin IS NULL
   AND ordered.next_at IS NOT NULL;

-- 5c. Réconciliation : si la dernière ligne ouverte pointe vers une AUTRE classe
--     que students.class_id (source de vérité actuelle), on la ferme — une
--     affectation « initial » correcte sera insérée en 5d.
UPDATE public.student_class_assignments a
   SET date_fin = now()
  FROM public.students s
 WHERE a.student_id = s.id
   AND a.date_fin IS NULL
   AND a.class_id IS DISTINCT FROM s.class_id;

-- 5d. Crée l'affectation EN COURS pour tout élève qui n'en a pas encore une
--     (élèves sans journal, ou dont la dernière ligne a été réconciliée).
--     date_debut = date d'inscription (created_at) ; défaut now() si absente.
INSERT INTO public.student_class_assignments (
  school_id, student_id, class_id, class_name, section, school_unit_id,
  date_debut, date_fin, type_transfert, reason, assigned_at, created_at
)
SELECT s.school_id, s.id, s.class_id, c.name, c.section, c.unit_id,
       COALESCE(s.created_at, now()), NULL, 'initial',   -- date d'inscription, sinon now() (raffiné en 5e)
       'Migration : affectation initiale', now(), now()
  FROM public.students s
  LEFT JOIN public.classes c ON c.id = s.class_id
 WHERE NOT EXISTS (
   SELECT 1 FROM public.student_class_assignments a
    WHERE a.student_id = s.id AND a.date_fin IS NULL
 );

-- 5e. Raffine date_debut (brief) : pour les affectations « initial » d'élèves SANS
--     date d'inscription, on remplace now() par le début de l'année scolaire en
--     cours (academic_periods.teaching_start, priorité à la période active).
--     Bloc gardé : ne s'exécute (et n'est planifié) que si la table existe → aucun
--     plantage si academic_periods est absente. Pas de table temporaire.
DO $$
BEGIN
  IF to_regclass('public.academic_periods') IS NOT NULL THEN
    UPDATE public.student_class_assignments a
       SET date_debut = ys.start_date::timestamptz
      FROM public.students s
      JOIN (
        SELECT DISTINCT ON (school_id) school_id, teaching_start AS start_date
          FROM public.academic_periods
         WHERE teaching_start IS NOT NULL
         ORDER BY school_id, (status = 'active') DESC, teaching_start ASC
      ) ys ON ys.school_id = s.school_id
     WHERE a.student_id = s.id
       AND a.type_transfert = 'initial'
       AND a.reason = 'Migration : affectation initiale'
       AND s.created_at IS NULL
       AND ys.start_date IS NOT NULL;
  END IF;
END $$;

-- ── 6. Contrainte d'unicité : un élève = une seule affectation EN COURS ───────
-- Créée APRÈS le backfill (qui garantit l'invariant). Idempotente.
CREATE UNIQUE INDEX IF NOT EXISTS sca_one_current_per_student
  ON public.student_class_assignments (student_id)
  WHERE date_fin IS NULL;

-- Index de requêtage sur les données pédagogiques rattachées.
CREATE INDEX IF NOT EXISTS grades_assignment_idx           ON public.grades (assignment_id);
CREATE INDEX IF NOT EXISTS student_absences_assignment_idx ON public.student_absences (assignment_id);
CREATE INDEX IF NOT EXISTS student_fees_assignment_idx     ON public.student_fees (assignment_id);
CREATE INDEX IF NOT EXISTS students_group_id_idx           ON public.students (group_student_id);

-- ── 7. RLS : autoriser la MISE À JOUR (clôture d'affectation) ─────────────────
-- La table avait SELECT (membres) + INSERT (admin). Clôturer une affectation
-- exige un UPDATE. On l'ouvre aux admins, comme l'INSERT existant.
DROP POLICY IF EXISTS "School admin can update assignments" ON public.student_class_assignments;
CREATE POLICY "School admin can update assignments"
  ON public.student_class_assignments FOR UPDATE
  USING (
    school_id IN (
      SELECT school_id FROM public.school_users
       WHERE user_id = auth.uid() AND active = true AND role = 'admin'
    )
  )
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM public.school_users
       WHERE user_id = auth.uid() AND active = true AND role = 'admin'
    )
  );

COMMIT;

-- ── 8. Vérification post-migration (lecture seule) ────────────────────────────
-- Doit renvoyer 0 : aucun élève sans affectation en cours, aucune violation.
SELECT
  (SELECT count(*) FROM public.students s
     WHERE NOT EXISTS (SELECT 1 FROM public.student_class_assignments a
                        WHERE a.student_id = s.id AND a.date_fin IS NULL)) AS eleves_sans_affectation_en_cours,
  (SELECT count(*) FROM public.students WHERE group_student_id IS NULL)    AS eleves_sans_id_groupe;
