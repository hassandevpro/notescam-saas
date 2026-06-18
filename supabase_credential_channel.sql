-- supabase_credential_channel.sql
-- Canal CHIFFRÉ pour le sens Cloud → Local du pont d'identifiants.
--
-- Quand un mot de passe est changé dans l'app cloud, l'app le chiffre avec la clé
-- PUBLIQUE du serveur de l'école (table school_credential_keys) et dépose le
-- résultat dans credential_outbox. Le cloud ne détient donc QUE du chiffré qu'il
-- ne peut pas ouvrir : seul le serveur LAN (clé privée locale) le déchiffre, le
-- re-hache en scrypt et l'applique, puis marque la ligne appliquée.

-- Clé publique RSA du serveur de chaque école (publiée à la migration / sync).
create table if not exists school_credential_keys (
  school_id  uuid primary key references schools(id) on delete cascade,
  public_key text not null,                 -- SPKI PEM
  updated_at timestamptz not null default now()
);

-- Boîte d'envoi des changements de mot de passe vers le serveur LAN.
create table if not exists credential_outbox (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references schools(id) on delete cascade,
  cloud_user_id uuid not null,
  email         text,
  ciphertext    text not null,              -- mot de passe chiffré (RSA-OAEP) pour la clé publique du serveur
  created_at    timestamptz not null default now(),
  applied_at    timestamptz
);
create index if not exists idx_credential_outbox_school on credential_outbox (school_id) where applied_at is null;

-- RLS : un membre authentifié de l'école peut DÉPOSER son propre changement ;
-- la lecture/marquage est réservée au service_role (le serveur LAN lit via sa
-- clé service côté sync). On n'autorise donc que l'INSERT pour authenticated.
alter table school_credential_keys enable row level security;
alter table credential_outbox      enable row level security;

create policy "members insert own credential change"
  on credential_outbox for insert to authenticated
  with check (
    cloud_user_id = auth.uid()
    and exists (
      select 1 from school_users su
      where su.school_id = credential_outbox.school_id and su.user_id = auth.uid()
    )
  );

-- Lecture de la clé publique de son école (pour chiffrer) par les membres.
create policy "members read school public key"
  on school_credential_keys for select to authenticated
  using (
    exists (
      select 1 from school_users su
      where su.school_id = school_credential_keys.school_id and su.user_id = auth.uid()
    )
  );
