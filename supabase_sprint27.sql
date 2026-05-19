-- Sprint 27 : deduplication des notifications de saisie de notes
-- Une seule ligne par (enseignant, classe, sequence) — mise a jour du timestamp au lieu d'insertion
-- Executer dans Supabase SQL Editor

-- 1. Supprimer les doublons existants (garde la plus recente par groupe)
DELETE FROM teacher_notifications a
USING teacher_notifications b
WHERE a.id < b.id
  AND a.school_id    = b.school_id
  AND a.teacher_id   = b.teacher_id
  AND a.class_id     = b.class_id
  AND a.sequence     = b.sequence
  AND a.type         = 'grades_saved';

-- 2. Contrainte unique pour bloquer tout futur doublon
ALTER TABLE teacher_notifications
  ADD CONSTRAINT teacher_notifications_unique_grade_entry
  UNIQUE (school_id, teacher_id, class_id, sequence);

-- 3. Permettre au realtime de detecter les UPDATE (pas seulement INSERT)
-- (pas de SQL necessaire — on change le filtre cote client)
