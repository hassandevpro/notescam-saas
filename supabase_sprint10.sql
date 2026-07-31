-- ============================================================
-- NotesCam SaaS — Sprint 10 : Table teachers + FK teacher_id
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- 1. TEACHERS (Enseignants)
-- ============================================================
create table if not exists teachers (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  specialty   text,
  created_at  timestamptz default now()
);

create index if not exists teachers_school_id_idx on teachers(school_id);

alter table teachers enable row level security;

DROP POLICY IF EXISTS "teachers: lecture par membres de l'école" ON teachers;
create policy "teachers: lecture par membres de l'école"
  on teachers for select
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true
    )
  );

DROP POLICY IF EXISTS "teachers: écriture par admins de l'école" ON teachers;
create policy "teachers: écriture par admins de l'école"
  on teachers for all
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true and role = 'admin'
    )
  );


-- ============================================================
-- 2. FK teacher_id sur CLASSES (enseignant titulaire)
-- ============================================================
alter table classes
  add column if not exists teacher_id uuid references teachers(id) on delete set null;

create index if not exists classes_teacher_id_idx on classes(teacher_id);


-- ============================================================
-- 3. FK teacher_id sur SUBJECTS (enseignant responsable)
-- ============================================================
alter table subjects
  add column if not exists teacher_id uuid references teachers(id) on delete set null;

create index if not exists subjects_teacher_id_idx on subjects(teacher_id);


-- ============================================================
-- 4. Bucket Storage pour les assets de l'école
--    (logo, tampon, signature — uploadés depuis Paramètres)
-- ============================================================

-- Créer le bucket si inexistant (à exécuter en SQL ou via le dashboard Storage)
insert into storage.buckets (id, name, public)
values ('school-assets', 'school-assets', true)
on conflict (id) do nothing;

-- Politique : membres de l'école peuvent lire leurs propres assets
DROP POLICY IF EXISTS "school-assets: lecture publique" ON storage;
create policy "school-assets: lecture publique"
  on storage.objects for select
  using (bucket_id = 'school-assets');

-- Politique : admins peuvent uploader dans leur dossier (schoolId/)
DROP POLICY IF EXISTS "school-assets: upload par admins" ON storage;
create policy "school-assets: upload par admins"
  on storage.objects for insert
  with check (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] in (
      select id::text from schools
      where id in (
        select school_id from school_users
        where user_id = auth.uid() and active = true and role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "school-assets: mise à jour par admins" ON storage;
create policy "school-assets: mise à jour par admins"
  on storage.objects for update
  using (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] in (
      select id::text from schools
      where id in (
        select school_id from school_users
        where user_id = auth.uid() and active = true and role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "school-assets: suppression par admins" ON storage;
create policy "school-assets: suppression par admins"
  on storage.objects for delete
  using (
    bucket_id = 'school-assets'
    and (storage.foldername(name))[1] in (
      select id::text from schools
      where id in (
        select school_id from school_users
        where user_id = auth.uid() and active = true and role = 'admin'
      )
    )
  );


-- ============================================================
-- FIN Sprint 10
-- ============================================================
