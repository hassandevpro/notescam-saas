-- ============================================================
-- Module Personnel — table `staff` (tous départements)
-- Départements : enseignants, administration, surveillance, sante,
--                comptabilite, support.
-- Les ENSEIGNANTS gardent en plus leur profil pédagogique dans `teachers`
-- (matières/classes/titulaire). On enrichit donc aussi `teachers` du même
-- socle d'informations personnel.
-- Exécuter dans : Supabase → SQL Editor → New query → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS public.staff (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  matricule     text,
  first_name    text,
  last_name     text,
  name          text NOT NULL,
  gender        text,
  phone         text,
  email         text,
  address       text,
  photo_url     text,
  fonction      text,
  department    text NOT NULL DEFAULT 'administration',
  hire_date     date,
  status        text,
  documents     jsonb,                 -- [{ name, url }]
  auth_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- colonnes de synchronisation continue LAN ↔ Cloud (Phase 2)
  updated_at    timestamptz,
  version       integer NOT NULL DEFAULT 1,
  device_id     text
);

CREATE INDEX IF NOT EXISTS staff_school      ON public.staff(school_id);
CREATE INDEX IF NOT EXISTS staff_department  ON public.staff(department);

-- Socle personnel ajouté aux enseignants (sous-type du personnel)
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS matricule text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS gender    text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS address   text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS fonction  text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS hire_date date;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS status    text;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS documents jsonb;

-- RLS — même modèle que les autres tables (membre actif de l'école)
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school members read staff" ON public.staff
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

CREATE POLICY "school members insert staff" ON public.staff
  FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

CREATE POLICY "school members update staff" ON public.staff
  FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

CREATE POLICY "school members delete staff" ON public.staff
  FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );
