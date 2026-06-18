-- supabase_server_tokens.sql
-- Jetons serveur scellés par école (sens Local → Cloud du pont d'identifiants).
-- Chaque serveur LAN détient un jeton ; la fonction edge `set-password` le vérifie
-- (haché) et limite la portée à l'école correspondante. Révocable sans toucher au
-- compte ni au mot de passe.

create table if not exists school_server_tokens (
  school_id  uuid primary key references schools(id) on delete cascade,
  token_hash text not null,                 -- sha256(token) ; le token clair n'est jamais stocké
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Accès réservé au service_role (les fonctions edge). Aucun rôle anon/authenticated
-- ne lit ni n'écrit cette table : RLS activée sans policy permissive.
alter table school_server_tokens enable row level security;

-- Révoquer un poste compromis :
--   update school_server_tokens set revoked_at = now() where school_id = '<uuid>';
