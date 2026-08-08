-- supabase_prim_bareme_ua.sql
-- Complète supabase_apc_primaire.sql : barème officiel par critère × sous-compétence
-- × niveau (au lieu d'un poids uniforme /10 partout), saisie par Unité d'Apprentissage
-- (UA 1-8) au lieu du trimestre, et aptitude sportive de l'élève (compétence 6A, deux
-- profils de barème : apte/inapte). Miroir cloud de server/schema.sql (mêmes tables).
--
-- Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT partout).
-- À coller dans Supabase → SQL Editor → Run, APRÈS supabase_apc_primaire.sql.

-- 1) Aptitude sportive de l'élève (barème 6A dépend de cette valeur).
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS sport_aptitude text NOT NULL DEFAULT 'apte';

-- 2) prim_notes : UA (1-8) remplace trimestre_id comme clé de saisie. trimestre_id
--    reste en base (colonne inutilisée) plutôt que d'être supprimée — aucune vraie
--    donnée de notes primaire APC en prod à ce jour, migration destructive inutile.
ALTER TABLE public.prim_notes ADD COLUMN IF NOT EXISTS ua integer CHECK (ua BETWEEN 1 AND 8);
ALTER TABLE public.prim_notes DROP CONSTRAINT IF EXISTS prim_notes_uniq;
ALTER TABLE public.prim_notes ADD CONSTRAINT prim_notes_uniq UNIQUE (eleve_id, competence_id, critere_id, ua);

-- 3) Barème officiel (points) par critère × sous-compétence × niveau. Compétence
--    '6a' a deux profils (aptitude 'apte' | 'inapte'), toutes les autres n'utilisent
--    que le profil 'apte' par défaut.
CREATE TABLE IF NOT EXISTS public.prim_bareme_criteres (
  id            text PRIMARY KEY,
  niveau_id     text NOT NULL REFERENCES public.prim_niveaux(id)     ON DELETE CASCADE,
  competence_id text NOT NULL REFERENCES public.prim_competences(id) ON DELETE CASCADE,
  critere_id    text NOT NULL REFERENCES public.prim_criteres(id),
  aptitude      text NOT NULL DEFAULT 'apte',
  points_max    numeric NOT NULL,
  ordre         integer NOT NULL,
  CONSTRAINT prim_bareme_criteres_uniq UNIQUE (niveau_id, competence_id, critere_id, aptitude)
);
CREATE INDEX IF NOT EXISTS idx_prim_bareme_lookup ON public.prim_bareme_criteres(niveau_id, competence_id, aptitude);
ALTER TABLE public.prim_bareme_criteres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prim_bareme_criteres_read ON public.prim_bareme_criteres;
CREATE POLICY prim_bareme_criteres_read ON public.prim_bareme_criteres FOR SELECT USING (true);

-- 4) Seuils de cote corrigés — le carnet officiel (p.2) implique 90/75/55/0 %
--    (A+ 18-20/20, A 15-17/20, ECA 11-14/20, NA 0-10/20), pas 90/70/50/0.
UPDATE public.prim_cote_bareme SET seuil_min = 75 WHERE id = 'a';
UPDATE public.prim_cote_bareme SET seuil_min = 55 WHERE id = 'eca';

-- 5) Seed Niveau I (SIL, CP) — vérifié par recoupement : somme des critères d'une
--    sous-compétence = son total annoncé ; somme des sous-compétences = total de
--    la compétence nationale (C1=100, C2=60, C3=40, C4=20, C5=20, C6=40).
INSERT INTO public.prim_bareme_criteres (id, niveau_id, competence_id, critere_id, aptitude, points_max, ordre) VALUES
  ('n1-1a-oral','sil','1a','oral','apte',20,1), ('n1-1a-ecrit','sil','1a','ecrit','apte',15,2), ('n1-1a-se','sil','1a','savoir_etre','apte',5,3),
  ('n1cp-1a-oral','cp','1a','oral','apte',20,1), ('n1cp-1a-ecrit','cp','1a','ecrit','apte',15,2), ('n1cp-1a-se','cp','1a','savoir_etre','apte',5,3),
  ('n1-1b-oral','sil','1b','oral','apte',20,1), ('n1-1b-ecrit','sil','1b','ecrit','apte',15,2), ('n1-1b-se','sil','1b','savoir_etre','apte',5,3),
  ('n1cp-1b-oral','cp','1b','oral','apte',20,1), ('n1cp-1b-ecrit','cp','1b','ecrit','apte',15,2), ('n1cp-1b-se','cp','1b','savoir_etre','apte',5,3),
  ('n1-1c-oral','sil','1c','oral','apte',10,1), ('n1-1c-ecrit','sil','1c','ecrit','apte',5,2), ('n1-1c-pratique','sil','1c','pratique','apte',3,3), ('n1-1c-se','sil','1c','savoir_etre','apte',2,4),
  ('n1cp-1c-oral','cp','1c','oral','apte',10,1), ('n1cp-1c-ecrit','cp','1c','ecrit','apte',5,2), ('n1cp-1c-pratique','cp','1c','pratique','apte',3,3), ('n1cp-1c-se','cp','1c','savoir_etre','apte',2,4),
  ('n1-2a-oral','sil','2a','oral','apte',5,1), ('n1-2a-ecrit','sil','2a','ecrit','apte',20,2), ('n1-2a-se','sil','2a','savoir_etre','apte',5,3),
  ('n1cp-2a-oral','cp','2a','oral','apte',5,1), ('n1cp-2a-ecrit','cp','2a','ecrit','apte',20,2), ('n1cp-2a-se','cp','2a','savoir_etre','apte',5,3),
  ('n1-2b-oral','sil','2b','oral','apte',5,1), ('n1-2b-ecrit','sil','2b','ecrit','apte',5,2), ('n1-2b-pratique','sil','2b','pratique','apte',15,3), ('n1-2b-se','sil','2b','savoir_etre','apte',5,4),
  ('n1cp-2b-oral','cp','2b','oral','apte',5,1), ('n1cp-2b-ecrit','cp','2b','ecrit','apte',5,2), ('n1cp-2b-pratique','cp','2b','pratique','apte',15,3), ('n1cp-2b-se','cp','2b','savoir_etre','apte',5,4),
  ('n1-3a-oral','sil','3a','oral','apte',3,1), ('n1-3a-ecrit','sil','3a','ecrit','apte',3,2), ('n1-3a-pratique','sil','3a','pratique','apte',10,3), ('n1-3a-se','sil','3a','savoir_etre','apte',4,4),
  ('n1cp-3a-oral','cp','3a','oral','apte',3,1), ('n1cp-3a-ecrit','cp','3a','ecrit','apte',3,2), ('n1cp-3a-pratique','cp','3a','pratique','apte',10,3), ('n1cp-3a-se','cp','3a','savoir_etre','apte',4,4),
  ('n1-3b-oral','sil','3b','oral','apte',5,1), ('n1-3b-ecrit','sil','3b','ecrit','apte',5,2), ('n1-3b-pratique','sil','3b','pratique','apte',8,3), ('n1-3b-se','sil','3b','savoir_etre','apte',2,4),
  ('n1cp-3b-oral','cp','3b','oral','apte',5,1), ('n1cp-3b-ecrit','cp','3b','ecrit','apte',5,2), ('n1cp-3b-pratique','cp','3b','pratique','apte',8,3), ('n1cp-3b-se','cp','3b','savoir_etre','apte',2,4),
  ('n1-4a-oral','sil','4a','oral','apte',5,1), ('n1-4a-ecrit','sil','4a','ecrit','apte',3,2), ('n1-4a-pratique','sil','4a','pratique','apte',10,3), ('n1-4a-se','sil','4a','savoir_etre','apte',2,4),
  ('n1cp-4a-oral','cp','4a','oral','apte',5,1), ('n1cp-4a-ecrit','cp','4a','ecrit','apte',3,2), ('n1cp-4a-pratique','cp','4a','pratique','apte',10,3), ('n1cp-4a-se','cp','4a','savoir_etre','apte',2,4),
  ('n1-5a-oral','sil','5a','oral','apte',3,1), ('n1-5a-ecrit','sil','5a','ecrit','apte',3,2), ('n1-5a-pratique','sil','5a','pratique','apte',10,3), ('n1-5a-se','sil','5a','savoir_etre','apte',4,4),
  ('n1cp-5a-oral','cp','5a','oral','apte',3,1), ('n1cp-5a-ecrit','cp','5a','ecrit','apte',3,2), ('n1cp-5a-pratique','cp','5a','pratique','apte',10,3), ('n1cp-5a-se','cp','5a','savoir_etre','apte',4,4),
  ('n1-6a-oral-a','sil','6a','oral','apte',3,1), ('n1-6a-ecrit-a','sil','6a','ecrit','apte',3,2), ('n1-6a-pratique-a','sil','6a','pratique','apte',10,3), ('n1-6a-se-a','sil','6a','savoir_etre','apte',4,4),
  ('n1cp-6a-oral-a','cp','6a','oral','apte',3,1), ('n1cp-6a-ecrit-a','cp','6a','ecrit','apte',3,2), ('n1cp-6a-pratique-a','cp','6a','pratique','apte',10,3), ('n1cp-6a-se-a','cp','6a','savoir_etre','apte',4,4),
  ('n1-6a-oral-i','sil','6a','oral','inapte',8,1), ('n1-6a-ecrit-i','sil','6a','ecrit','inapte',10,2), ('n1-6a-se-i','sil','6a','savoir_etre','inapte',2,3),
  ('n1cp-6a-oral-i','cp','6a','oral','inapte',8,1), ('n1cp-6a-ecrit-i','cp','6a','ecrit','inapte',10,2), ('n1cp-6a-se-i','cp','6a','savoir_etre','inapte',2,3),
  ('n1-6b-oral','sil','6b','oral','apte',4,1), ('n1-6b-ecrit','sil','6b','ecrit','apte',3,2), ('n1-6b-pratique','sil','6b','pratique','apte',10,3), ('n1-6b-se','sil','6b','savoir_etre','apte',3,4),
  ('n1cp-6b-oral','cp','6b','oral','apte',4,1), ('n1cp-6b-ecrit','cp','6b','ecrit','apte',3,2), ('n1cp-6b-pratique','cp','6b','pratique','apte',10,3), ('n1cp-6b-se','cp','6b','savoir_etre','apte',3,4)
ON CONFLICT (id) DO UPDATE
  SET points_max = EXCLUDED.points_max, ordre = EXCLUDED.ordre;
