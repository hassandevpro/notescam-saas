-- ============================================================
-- Sprint 35 — Suivi des absences (pointage journalier)
-- Table : attendance (distinct de student_absences = cumulatif bulletins)
-- Exécuter dans : Supabase → SQL Editor → New query → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS public.attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id    uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id  uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  year_label  text NOT NULL,
  date        date NOT NULL,
  session     text,           -- NULL = journée entière | 'matin' | 'apres-midi' | 'H1'…'H6'
  status      text NOT NULL DEFAULT 'absent'
                CHECK (status IN ('absent', 'retard', 'excused')),
  motif       text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index pour les requêtes courantes
CREATE INDEX IF NOT EXISTS attendance_school_year  ON public.attendance(school_id, year_label);
CREATE INDEX IF NOT EXISTS attendance_class_date   ON public.attendance(class_id, date);
CREATE INDEX IF NOT EXISTS attendance_student      ON public.attendance(student_id);

-- RLS
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Lecture : tout membre actif de l'école
CREATE POLICY "school members read attendance" ON public.attendance
  FOR SELECT USING (
    school_id IN (
      SELECT school_id FROM public.school_users
      WHERE user_id = auth.uid() AND active = true
    )
  );

-- Écriture : tout membre actif de l'école (admin + enseignants)
CREATE POLICY "school members write attendance" ON public.attendance
  FOR INSERT WITH CHECK (
    school_id IN (
      SELECT school_id FROM public.school_users
      WHERE user_id = auth.uid() AND active = true
    )
  );

CREATE POLICY "school members update attendance" ON public.attendance
  FOR UPDATE USING (
    school_id IN (
      SELECT school_id FROM public.school_users
      WHERE user_id = auth.uid() AND active = true
    )
  );

CREATE POLICY "school members delete attendance" ON public.attendance
  FOR DELETE USING (
    school_id IN (
      SELECT school_id FROM public.school_users
      WHERE user_id = auth.uid() AND active = true
    )
  );
