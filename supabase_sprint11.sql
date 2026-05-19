-- ============================================================
-- NotesCam SaaS — Sprint 11 : Inscription enseignant
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- 1. Colonne auth_user_id sur teachers
--    Permet de lier un compte auth à son enregistrement teacher
-- ============================================================
alter table teachers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists teachers_auth_user_id_idx
  on teachers(auth_user_id)
  where auth_user_id is not null;


-- ============================================================
-- 2. RPC signup_teacher
--    Appelé après supabase.auth.signUp depuis TeacherSignup.jsx
--    Cherche l'école par code (8 premiers chars de l'UUID),
--    crée school_users (role='teacher') et lie le teachers record.
-- ============================================================
create or replace function public.signup_teacher(
  p_school_code  text,   -- 8 premiers chars de l'UUID de l'école (affiché dans Paramètres)
  p_full_name    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id   uuid;
  v_user_id     uuid;
  v_teacher_id  uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Empêche de lier un même user à plusieurs écoles
  if exists (
    select 1 from school_users
    where user_id = v_user_id and active = true
  ) then
    raise exception 'already linked';
  end if;

  -- Cherche l'école par code (comparaison insensible à la casse)
  select id into v_school_id
  from schools
  where lower(id::text) like lower(p_school_code) || '%'
  limit 1;

  if v_school_id is null then
    raise exception 'Code établissement invalide';
  end if;

  -- Crée le lien school_users
  insert into school_users (school_id, user_id, role, full_name, active)
  values (v_school_id, v_user_id, 'teacher', p_full_name, true);

  -- Cherche si un enregistrement teachers correspond (par nom) et le lie,
  -- sinon crée un nouveau record teachers pour ce compte
  select id into v_teacher_id
  from teachers
  where school_id = v_school_id
    and auth_user_id is null
    and lower(trim(name)) = lower(trim(p_full_name))
  limit 1;

  if v_teacher_id is not null then
    -- Lie le compte auth à l'enregistrement existant
    update teachers set auth_user_id = v_user_id where id = v_teacher_id;
  else
    -- Crée un nouvel enregistrement teachers
    insert into teachers (school_id, name, auth_user_id)
    values (v_school_id, p_full_name, v_user_id)
    returning id into v_teacher_id;
  end if;

  return jsonb_build_object(
    'school_id',  v_school_id,
    'teacher_id', v_teacher_id
  );
end;
$$;


-- ============================================================
-- 3. Mise à jour des policies RLS sur school_users
--    Les enseignants doivent pouvoir lire leur propre ligne
-- ============================================================
drop policy if exists "school_users: lecture" on school_users;

-- Policy simple sans auto-référence (évite la récursion infinie)
create policy "school_users: lecture"
  on school_users for select
  using (user_id = auth.uid());


-- ============================================================
-- FIN Sprint 11
-- ============================================================
