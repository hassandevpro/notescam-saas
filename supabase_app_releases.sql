-- supabase_app_releases.sql
-- Manifeste de VERSIONS de NotesCam côté Cloud — fondations de la mise à jour automatique
-- (OTA) des serveurs LAN. Ne contient AUCUNE donnée d'école : uniquement les métadonnées
-- de publication (version, empreinte, signature, URL de l'installeur).
--
-- La logique de téléchargement/vérification de signature/installation/redémarrage sera
-- branchée plus tard côté LAN (server/updateService.js) SANS changer ce schéma ni l'API.
--
-- À coller dans Supabase → SQL Editor → Run. Idempotent.

CREATE TABLE IF NOT EXISTS public.app_releases (
  version      text PRIMARY KEY,                 -- ex. '0.3.0' (semver)
  channel      text NOT NULL DEFAULT 'stable',   -- 'stable' | 'beta' | …
  min_version  text,                             -- version minimale requise pour migrer directement
  sha256       text,                             -- empreinte de l'installeur (contrôle d'intégrité)
  signature    text,                             -- signature détachée (authenticité) — vérifiée par le LAN
  url          text,                             -- URL de téléchargement de l'installeur
  mandatory    boolean NOT NULL DEFAULT false,   -- mise à jour obligatoire
  notes        text,                             -- notes de version
  published_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;
-- Manifeste PUBLIC en lecture (aucune donnée sensible) ; écriture réservée à service_role.
DROP POLICY IF EXISTS app_releases_public_read ON public.app_releases;
CREATE POLICY app_releases_public_read ON public.app_releases FOR SELECT USING (true);

-- Amorce : la version courante déclarée comme publiée (à mettre à jour à chaque release).
INSERT INTO public.app_releases (version, channel, mandatory, notes)
VALUES ('0.2.0', 'stable', false, 'Version courante')
ON CONFLICT (version) DO NOTHING;
