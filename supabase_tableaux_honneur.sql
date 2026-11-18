-- TABLEAUX D'HONNEUR : seuil réglable par l'établissement, options, modèles en base (2026-11-18).
--
--  honor_min_avg        moyenne minimale SUR 20 pour entrer au tableau d'honneur (NULL = 12).
--  honor_options        JSON (texte) : niveaux Encouragements / Félicitations, exclusion des
--                       élèves sanctionnés, langue des documents, modèle visuel, couleurs.
--  honor_roll_templates JSON (texte) : les modèles de l'école, jusqu'ici dans le localStorage
--                       d'un seul navigateur (perdus en changeant de poste).
--
-- Droits : la policy « schools: update admins » (supabase_security_hardening.sql) réserve déjà
-- toute écriture de `schools` à l'administrateur. Le déclencheur ci-dessous JOURNALISE chaque
-- changement du seuil ou des options dans audit_events (qui, quand, avant → après).
--
-- ORDRE : à appliquer AVANT de livrer le paquet LAN (server/db.js porte les mêmes colonnes ;
-- `schools` est poussée colonne par colonne, une colonne inconnue fait rejeter la ligne).
-- Additif et idempotent. RETOUR ARRIÈRE (en bas du fichier, commenté).

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS honor_min_avg numeric(5,2);
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS honor_options text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS honor_roll_templates text;

DO $$ BEGIN
  ALTER TABLE public.schools ADD CONSTRAINT schools_honor_min_avg_0_20
    CHECK (honor_min_avg IS NULL OR (honor_min_avg >= 0 AND honor_min_avg <= 20));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.audit_honor_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changes jsonb := '{}'::jsonb;
BEGIN
  -- Sans utilisateur (poussée d'un serveur d'école) : le serveur LAN a déjà journalisé le
  -- changement avec son véritable auteur (server/honorAudit.js) ; on ne le double pas.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.honor_min_avg IS DISTINCT FROM OLD.honor_min_avg THEN
    changes := changes || jsonb_build_object('honor_min_avg', jsonb_build_object('avant', OLD.honor_min_avg, 'apres', NEW.honor_min_avg));
  END IF;
  IF NEW.honor_options IS DISTINCT FROM OLD.honor_options THEN
    changes := changes || jsonb_build_object('honor_options', jsonb_build_object('avant', OLD.honor_options, 'apres', NEW.honor_options));
  END IF;
  IF changes <> '{}'::jsonb THEN
    INSERT INTO public.audit_events (school_id, action, aggregate_type, target_id, actor_id, payload)
    VALUES (NEW.id, 'honor_settings_changed', 'school', NEW.id, auth.uid(), changes);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_honor_settings ON public.schools;
CREATE TRIGGER trg_audit_honor_settings AFTER UPDATE OF honor_min_avg, honor_options ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.audit_honor_settings();

NOTIFY pgrst, 'reload schema';

-- RETOUR ARRIÈRE :
-- DROP TRIGGER IF EXISTS trg_audit_honor_settings ON public.schools;
-- DROP FUNCTION IF EXISTS public.audit_honor_settings();
-- ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_honor_min_avg_0_20;
-- ALTER TABLE public.schools DROP COLUMN IF EXISTS honor_roll_templates, DROP COLUMN IF EXISTS honor_options, DROP COLUMN IF EXISTS honor_min_avg;
