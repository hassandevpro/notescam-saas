-- ============================================================
-- NotesCam — RPC signup_school_and_admin
-- Crée école + lien admin en transaction atomique
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================

create or replace function public.signup_school_and_admin(
  p_school_name    text,
  p_school_type    text,
  p_region         text,
  p_director       text,
  p_email          text,
  p_academic_year  text,
  p_full_name      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
  v_user_id   uuid;
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

  -- Crée l'école
  insert into schools (name, type, region, director, email, current_year,
                       license_status, license_expires_at)
  values (
    p_school_name, p_school_type, p_region, p_director, p_email, p_academic_year,
    'trial', now() + interval '30 days'
  )
  returning id into v_school_id;

  -- Crée le lien admin
  insert into school_users (school_id, user_id, role, full_name, active)
  values (v_school_id, v_user_id, 'admin', p_full_name, true);
end;
$$;

-- ============================================================
-- APRÈS avoir créé le RPC :
-- Si tu avais déjà créé un compte avant ce correctif,
-- déconnecte-toi et refais une inscription avec un nouvel email,
-- OU exécute ce bloc en remplaçant les valeurs :
-- ============================================================
/*
do $$
declare
  v_school_id uuid;
begin
  insert into schools (name, type, region, director, email, current_year,
                       license_status, license_expires_at)
  values (
    'Nom de ton école',   -- à modifier
    'Public',             -- à modifier
    'Centre',             -- à modifier
    'Nom directeur',      -- à modifier
    'ton@email.com',      -- ton email de connexion
    '2025-2026',
    'trial', now() + interval '30 days'
  )
  returning id into v_school_id;

  insert into school_users (school_id, user_id, role, full_name, active)
  values (
    v_school_id,
    (select id from auth.users where email = 'ton@email.com'),  -- ton email
    'admin',
    'Ton Nom Complet',    -- à modifier
    true
  );
end;
$$;
*/
