-- ============================================================
-- NotesCam SaaS — Sprint 18 : Messagerie admin ↔ enseignants
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- 1. TABLE school_messages — messages admin → enseignant
-- ============================================================
CREATE TABLE IF NOT EXISTS school_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sender_name    text NOT NULL,
  sender_role    text NOT NULL DEFAULT 'admin',
  to_teacher_id  uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject        text,
  body           text NOT NULL,
  read           boolean NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_messages_school_idx
  ON school_messages(school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS school_messages_teacher_idx
  ON school_messages(to_teacher_id, read);


-- ============================================================
-- 2. RLS
-- ============================================================
ALTER TABLE school_messages ENABLE ROW LEVEL SECURITY;

-- Admin : lecture de tous les messages de son école
CREATE POLICY "messages: lecture admin"
  ON school_messages FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM school_users
      WHERE user_id = auth.uid() AND active = true AND role = 'admin'
    )
  );

-- Admin : envoi de messages
CREATE POLICY "messages: envoi admin"
  ON school_messages FOR INSERT
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM school_users
      WHERE user_id = auth.uid() AND active = true AND role = 'admin'
    )
  );

-- Enseignant : lecture de ses messages
CREATE POLICY "messages: lecture enseignant"
  ON school_messages FOR SELECT
  USING (
    to_teacher_id IN (
      SELECT id FROM teachers WHERE auth_user_id = auth.uid()
    )
  );

-- Enseignant : marquer lu (UPDATE read = true uniquement)
CREATE POLICY "messages: marquer lu enseignant"
  ON school_messages FOR UPDATE
  USING (
    to_teacher_id IN (
      SELECT id FROM teachers WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (true);


-- ============================================================
-- 3. Activer Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE school_messages;


-- ============================================================
-- FIN Sprint 18
-- ============================================================
