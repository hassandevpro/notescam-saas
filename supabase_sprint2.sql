-- ============================================================
-- NotesCam SaaS — Sprint 2 : Tables domaine scolaire
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- 1. CLASSES
-- ============================================================
create table if not exists classes (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  name          text not null,
  level         text,
  section       text,
  system        text not null default 'FR',  -- 'FR' (notes /20) ou 'EN' (notes /100)
  current_year  text,
  created_at    timestamptz default now()
);

-- Index pour récupérer toutes les classes d'une école rapidement
create index if not exists classes_school_id_idx on classes(school_id);

-- RLS
alter table classes enable row level security;

create policy "classes: lecture par membres de l'école"
  on classes for select
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true
    )
  );

create policy "classes: écriture par admins de l'école"
  on classes for all
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true and role = 'admin'
    )
  );


-- ============================================================
-- 2. SUBJECTS (Matières)
-- ============================================================
create table if not exists subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  class_id    uuid not null references classes(id) on delete cascade,
  name        text not null,
  coef        integer not null default 1,
  max         integer not null default 20,  -- 20 pour FR, 100 pour EN
  created_at  timestamptz default now()
);

create index if not exists subjects_school_id_idx on subjects(school_id);
create index if not exists subjects_class_id_idx  on subjects(class_id);

alter table subjects enable row level security;

create policy "subjects: lecture par membres de l'école"
  on subjects for select
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true
    )
  );

create policy "subjects: écriture par admins de l'école"
  on subjects for all
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true and role = 'admin'
    )
  );


-- ============================================================
-- 3. STUDENTS (Élèves)
-- ============================================================
create table if not exists students (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,
  class_id        uuid not null references classes(id) on delete cascade,
  name            text not null,
  matricule       text,
  gender          text,          -- 'Masculin' | 'Féminin'
  date_naissance  date,
  created_at      timestamptz default now()
);

create index if not exists students_school_id_idx on students(school_id);
create index if not exists students_class_id_idx  on students(class_id);

alter table students enable row level security;

create policy "students: lecture par membres de l'école"
  on students for select
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true
    )
  );

create policy "students: écriture par admins et enseignants"
  on students for all
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true
        and role in ('admin', 'teacher')
    )
  );


-- ============================================================
-- 4. GRADES (Notes)
-- ============================================================
create table if not exists grades (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  class_id    uuid not null references classes(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  subject_id  uuid not null references subjects(id) on delete cascade,
  sequence    integer not null,   -- 1, 2, 3, 4, 5, 6
  value       text not null,      -- valeur numérique ou 'ABS'
  updated_at  timestamptz default now(),

  -- Une seule note par (élève × matière × séquence)
  unique(class_id, student_id, subject_id, sequence)
);

create index if not exists grades_school_id_idx   on grades(school_id);
create index if not exists grades_class_id_idx    on grades(class_id);
create index if not exists grades_student_id_idx  on grades(student_id);

alter table grades enable row level security;

create policy "grades: lecture par membres de l'école"
  on grades for select
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true
    )
  );

create policy "grades: écriture par admins et enseignants"
  on grades for all
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true
        and role in ('admin', 'teacher')
    )
  );


-- ============================================================
-- FIN — Sprint 3 ajoutera : teachers, timetable
-- ============================================================
