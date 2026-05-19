-- Sprint 31 : Emploi du temps
-- Executer dans Supabase SQL Editor

-- 1. Table des créneaux
CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id    uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id    uuid REFERENCES public.teachers(id) ON DELETE SET NULL,
  day_of_week   smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 6), -- 1=Lundi … 6=Samedi
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  label         text,          -- texte libre si pas de matière (Sport, Récréation…)
  academic_year text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;

-- Membres de l'école peuvent lire les créneaux
CREATE POLICY "school members read timetable"
  ON public.timetable_slots FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM school_users
       WHERE user_id = auth.uid() AND active = true
    )
  );

-- Admins seulement peuvent modifier
CREATE POLICY "admin manage timetable"
  ON public.timetable_slots FOR ALL
  USING (
    school_id IN (
      SELECT school_id FROM school_users
       WHERE user_id = auth.uid() AND role = 'admin' AND active = true
    )
  );

-- 3. Index performance
CREATE INDEX IF NOT EXISTS timetable_slots_school_year_idx
  ON public.timetable_slots (school_id, academic_year);

CREATE INDEX IF NOT EXISTS timetable_slots_class_idx
  ON public.timetable_slots (class_id);

CREATE INDEX IF NOT EXISTS timetable_slots_teacher_idx
  ON public.timetable_slots (teacher_id);
