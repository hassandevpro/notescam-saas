-- Sprint 20 : Historique d'assignation des classes aux élèves
-- Crée la table student_class_assignments pour tracer chaque changement de classe

create table if not exists public.student_class_assignments (
  id               uuid        primary key default gen_random_uuid(),
  school_id        uuid        not null references public.schools(id)   on delete cascade,
  student_id       uuid        not null references public.students(id)  on delete cascade,
  class_id         uuid        not null references public.classes(id)   on delete cascade,
  class_name       text,
  assigned_by      uuid        references auth.users(id) on delete set null,
  assigned_by_name text,
  reason           text,
  assigned_at      timestamptz not null default now()
);

-- Indexes
create index if not exists idx_sca_student  on public.student_class_assignments(student_id);
create index if not exists idx_sca_school   on public.student_class_assignments(school_id);
create index if not exists idx_sca_class    on public.student_class_assignments(class_id);
create index if not exists idx_sca_assigned on public.student_class_assignments(assigned_at desc);

-- Row Level Security
alter table public.student_class_assignments enable row level security;

-- Lecture : tous les membres actifs de l'établissement (admins + enseignants)
create policy "School members can read assignments"
  on public.student_class_assignments for select
  using (
    school_id in (
      select school_id from public.school_users
      where user_id = auth.uid() and active = true
    )
  );

-- Insertion : uniquement les admins de l'établissement
create policy "School admin can insert assignments"
  on public.student_class_assignments for insert
  with check (
    school_id in (
      select school_id from public.school_users
      where user_id = auth.uid() and active = true and role = 'admin'
    )
  );
