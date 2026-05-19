-- ============================================================
-- NotesCam SaaS — Sprint 15 : Frais scolaires + champs manquants
-- À coller dans : Supabase → SQL Editor → New query → Run
-- ============================================================


-- ============================================================
-- 1. parent_phone sur STUDENTS
-- ============================================================
alter table students
  add column if not exists parent_phone text;


-- ============================================================
-- 2. cycle sur CLASSES
--    Valeurs : 'secondaire' | 'primaire' | 'maternelle'
--    Par défaut 'secondaire' pour toutes les classes existantes.
-- ============================================================
alter table classes
  add column if not exists cycle text not null default 'secondaire';


-- ============================================================
-- 3. TABLE student_fees — suivi des frais scolaires
-- ============================================================
create table if not exists student_fees (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references schools(id) on delete cascade,
  student_id            uuid not null references students(id) on delete cascade,
  academic_year         text not null,       -- ex : "2025-2026"
  frais_annuels         integer not null default 0,  -- montant total dû (FCFA)
  frais_payes           integer not null default 0,  -- montant payé à ce jour
  date_dernier_paiement date,
  notes                 text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),

  unique(student_id, academic_year)
);

create index if not exists student_fees_school_id_idx  on student_fees(school_id);
create index if not exists student_fees_student_id_idx on student_fees(student_id);

-- Trigger pour mettre à jour updated_at automatiquement
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_fees_updated_at on student_fees;
create trigger student_fees_updated_at
  before update on student_fees
  for each row execute procedure set_updated_at();


-- ============================================================
-- 4. RLS sur student_fees
-- ============================================================
alter table student_fees enable row level security;

create policy "student_fees: lecture par membres de l'école"
  on student_fees for select
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true
    )
  );

create policy "student_fees: écriture par admins de l'école"
  on student_fees for all
  using (
    school_id in (
      select school_id from school_users
      where user_id = auth.uid() and active = true and role = 'admin'
    )
  );


-- ============================================================
-- FIN Sprint 15
-- ============================================================
