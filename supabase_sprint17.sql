-- ============================================================
-- NotesCam SaaS — Sprint 17 : Surveillance enseignants + Notifications
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- 1. TABLE teacher_notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS teacher_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  type         text NOT NULL DEFAULT 'grades_saved',
  teacher_name text NOT NULL,
  teacher_id   uuid REFERENCES teachers(id) ON DELETE SET NULL,
  class_name   text,
  class_id     uuid REFERENCES classes(id) ON DELETE SET NULL,
  sequence     int,
  nb_entries   int NOT NULL DEFAULT 0,
  read         boolean NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_notif_school_date_idx
  ON teacher_notifications(school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS teacher_notif_school_unread_idx
  ON teacher_notifications(school_id, read)
  WHERE read = false;


-- ============================================================
-- 2. RLS
-- ============================================================
ALTER TABLE teacher_notifications ENABLE ROW LEVEL SECURITY;

-- Les admins lisent toutes les notifications de leur école
DROP POLICY IF EXISTS "notif: lecture admin" ON teacher_notifications;
CREATE POLICY "notif: lecture admin"
  ON teacher_notifications FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM school_users
      WHERE user_id = auth.uid() AND active = true AND role = 'admin'
    )
  );

-- Les membres (teachers + admins) insèrent
DROP POLICY IF EXISTS "notif: insertion membres" ON teacher_notifications;
CREATE POLICY "notif: insertion membres"
  ON teacher_notifications FOR INSERT
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM school_users
      WHERE user_id = auth.uid() AND active = true
    )
  );

-- Les admins marquent comme lu (UPDATE)
DROP POLICY IF EXISTS "notif: update admin" ON teacher_notifications;
CREATE POLICY "notif: update admin"
  ON teacher_notifications FOR UPDATE
  USING (
    school_id IN (
      SELECT school_id FROM school_users
      WHERE user_id = auth.uid() AND active = true AND role = 'admin'
    )
  );


-- ============================================================
-- 3. Activer Realtime sur la table
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE teacher_notifications;


-- ============================================================
-- FIN Sprint 17
-- ============================================================
