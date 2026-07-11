-- ════════════════════════════════════════════════════════════════════════════
-- NotesCam — Défense en profondeur : refus serveur des notes en séquence verrouillée
-- (Audit C6 « verrou de notes réellement appliqué » + I6 « gel d'année clôturée »)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Contexte : le verrou de séquence vit dans `academic_periods.is_locked`
-- (« édition matériellement bloquée », synchronisé cloud/LAN). L'application le
-- fait DÉSORMAIS respecter dans schoolStore.saveGrade (offline + LAN + cloud, via
-- le même code). Ce trigger ajoute une BARRIÈRE SERVEUR : même une écriture
-- directe (client obsolète, script, autre appareil) est refusée par la base.
--
-- Portée : CLOUD uniquement (Supabase/Postgres). En LAN (SQLite), la protection
-- reste applicative (saveGrade) — même base de code. Les absences/conduite vivent
-- dans `student_absences` (table distincte) : NON concernées, comme côté app.
--
-- Idempotent (CREATE OR REPLACE / DROP IF EXISTS). À coller dans :
-- Supabase → SQL Editor → New query → Run.
--
-- ⚠️ Effet de bord assumé : tant qu'une séquence est verrouillée, TOUTE écriture
-- de note de cette séquence est refusée, y compris une restauration depuis la
-- corbeille (matière/classe) ou un admin. Déverrouiller la période d'abord
-- (academic_periods.is_locked = false) pour éditer / restaurer.
-- ════════════════════════════════════════════════════════════════════════════

-- L'année scolaire d'une note se déduit de sa classe (classes.current_year). Le
-- verrou est posé par (école, année, sequence_order). On refuse l'écriture si la
-- période séquence correspondante est verrouillée.
CREATE OR REPLACE FUNCTION public.reject_locked_sequence_grade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.academic_periods ap
    JOIN public.classes c ON c.id = NEW.class_id
    WHERE ap.school_id      = NEW.school_id
      AND ap.type           = 'sequence'
      AND ap.sequence_order = NEW.sequence
      AND ap.school_year    = c.current_year
      AND ap.is_locked      = true
  ) THEN
    RAISE EXCEPTION
      'Séquence % verrouillée pour cette année scolaire (academic_periods.is_locked) — déverrouillez la période avant d''éditer.',
      NEW.sequence
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grades_lock_guard ON public.grades;
CREATE TRIGGER grades_lock_guard
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_locked_sequence_grade();

-- ════════════════════════════════════════════════════════════════════════════
-- FIN
-- ════════════════════════════════════════════════════════════════════════════
