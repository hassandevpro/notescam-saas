-- ============================================================================
-- MOTEUR « APC_PRIMAIRE » (MINEDUB Cameroun) — Phase 1 (fondations)
-- ============================================================================
-- Modèle pédagogique officiel du primaire APC camerounais :
--   Cycle → Niveau (SIL…CM2) → Compétence nationale → Critère → Note → Cote
--
-- Les 11 COMPÉTENCES NATIONALES (1A…6B) sont FIXES du SIL au CM2 et s'affichent
-- sur les 3 bulletins trimestriels. Chaque compétence est évaluée selon 4 CRITÈRES
-- (Oral / Écrit / Pratique / Savoir-être). La note atomique porte le quadruplet
-- (élève, compétence, critère, trimestre). Barème de saisie /10 (grade_max).
--
-- Cotes APC dérivées (JAMAIS saisies) : A+ (Très bien acquis) / A (Acquis) /
-- ECA (En cours d'acquisition) / NA (Non acquis), via seuils en % de grade_max.
--
-- Deux familles de tables (patron supabase_apc_minesec.sql) :
--   • RÉFÉRENTIEL (global, lecture authentifiée) — cycles/niveaux/compétences/
--     critères/barème. Slugs stables, seed idempotent.
--   • TRANSACTIONNEL (par école, RLS school_id) — notes/bulletins/résultats.
--
-- Réutilise public.apc_trimestres (t1/t2/t3). À EXÉCUTER dans Supabase → SQL
-- Editor. Idempotent. Compatible avec supabase_maternelle.sql (ordre indifférent).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) DRAPEAUX (convergent avec les autres migrations — ordre indifférent)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_bulletin_engine_chk;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_bulletin_engine_chk
  CHECK (bulletin_engine IN
    ('classic','officiel','apc_minesec','minesec','minedub','maternelle','apc_primaire'));

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS bulletin_engine text;

-- Lien matière↔compétence (matérialisation UI + affectation enseignant ; primAutoConfig).
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS prim_competence_id text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) RÉFÉRENTIEL (global)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prim_referentiel_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL DEFAULT 'CM',
  label        text NOT NULL,
  source       text,
  imported_at  timestamptz NOT NULL DEFAULT now(),
  imported_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actif        boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.prim_cycles (
  id           text PRIMARY KEY,   -- 'initiation'|'fondamentaux'|'consolidation'
  country_code text NOT NULL DEFAULT 'CM',
  nom          text NOT NULL,
  ordre        integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.prim_niveaux (
  id           text PRIMARY KEY,   -- 'sil','cp','ce1','ce2','cm1','cm2'
  cycle_id     text NOT NULL REFERENCES public.prim_cycles(id) ON DELETE CASCADE,
  country_code text NOT NULL DEFAULT 'CM',
  nom          text NOT NULL,
  ordre        integer NOT NULL
);

-- Compétences nationales APC (fixes tous niveaux).
CREATE TABLE IF NOT EXISTS public.prim_competences (
  id           text PRIMARY KEY,   -- '1a','1b','1c','2a','2b','3a','3b','4a','5a','6a','6b'
  country_code text NOT NULL DEFAULT 'CM',
  code         text NOT NULL,      -- '1A','1B'…
  intitule     text NOT NULL,
  domaine      text,               -- regroupement d'affichage
  coefficient  numeric NOT NULL DEFAULT 1,
  ordre        integer NOT NULL,
  actif        boolean NOT NULL DEFAULT true
);

-- Exceptions d'application / surcharge de coef par niveau (extensibilité).
-- Vide ⇒ toutes les compétences actives s'appliquent à tous les niveaux.
CREATE TABLE IF NOT EXISTS public.prim_niveau_competences (
  niveau_id     text NOT NULL REFERENCES public.prim_niveaux(id)     ON DELETE CASCADE,
  competence_id text NOT NULL REFERENCES public.prim_competences(id) ON DELETE CASCADE,
  coefficient   numeric,
  actif         boolean NOT NULL DEFAULT true,
  PRIMARY KEY (niveau_id, competence_id)
);

CREATE TABLE IF NOT EXISTS public.prim_criteres (
  id           text PRIMARY KEY,   -- 'oral'|'ecrit'|'pratique'|'savoir_etre'
  country_code text NOT NULL DEFAULT 'CM',
  nom          text NOT NULL,
  poids        numeric NOT NULL DEFAULT 1,
  ordre        integer NOT NULL
);

-- Barème cote APC : seuil (% de grade_max) → cote. Configurable/versionnable.
CREATE TABLE IF NOT EXISTS public.prim_cote_bareme (
  id           text PRIMARY KEY,   -- 'a_plus'|'a'|'eca'|'na'
  country_code text NOT NULL DEFAULT 'CM',
  cote         text NOT NULL,      -- 'A+','A','ECA','NA'
  libelle      text NOT NULL,
  seuil_min    numeric NOT NULL,   -- pourcentage inclusif (0..100)
  ordre        integer NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) SEED DE LA STRUCTURE FIXE
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.prim_cycles (id, nom, ordre) VALUES
  ('initiation','Cycle des initiations',1),
  ('fondamentaux','Cycle des apprentissages fondamentaux',2),
  ('consolidation','Cycle de consolidation',3)
ON CONFLICT (id) DO UPDATE SET nom = EXCLUDED.nom, ordre = EXCLUDED.ordre;

INSERT INTO public.prim_niveaux (id, cycle_id, nom, ordre) VALUES
  ('sil','initiation','SIL',1), ('cp','initiation','CP',2),
  ('ce1','fondamentaux','CE1',3), ('ce2','fondamentaux','CE2',4),
  ('cm1','consolidation','CM1',5), ('cm2','consolidation','CM2',6)
ON CONFLICT (id) DO UPDATE
  SET cycle_id = EXCLUDED.cycle_id, nom = EXCLUDED.nom, ordre = EXCLUDED.ordre;

INSERT INTO public.prim_competences (id, code, intitule, domaine, ordre) VALUES
  ('1a','1A','Communiquer en français','langues',10),
  ('1b','1B','Communicate in English','langues',20),
  ('1c','1C','Pratiquer une langue nationale','langues',30),
  ('2a','2A','Utiliser les notions de base en mathématiques','maths_sciences',40),
  ('2b','2B','Utiliser les notions de base en sciences et technologies','maths_sciences',50),
  ('3a','3A','Pratiquer les valeurs sociales','vie_citoyennete',60),
  ('3b','3B','Pratiquer les valeurs citoyennes','vie_citoyennete',70),
  ('4a','4A','Démontrer l''autonomie, l''esprit d''initiative, la créativité et l''entrepreneuriat','autonomie',80),
  ('5a','5A','Utiliser les concepts de base et les outils des TIC','tic',90),
  ('6a','6A','Pratiquer les activités physiques et sportives','arts_sport',100),
  ('6b','6B','Pratiquer les activités artistiques','arts_sport',110)
ON CONFLICT (id) DO UPDATE
  SET code = EXCLUDED.code, intitule = EXCLUDED.intitule,
      domaine = EXCLUDED.domaine, ordre = EXCLUDED.ordre;

INSERT INTO public.prim_criteres (id, nom, poids, ordre) VALUES
  ('oral','Oral',1,1), ('ecrit','Écrit',1,2),
  ('pratique','Pratique',1,3), ('savoir_etre','Savoir-être',1,4)
ON CONFLICT (id) DO UPDATE
  SET nom = EXCLUDED.nom, poids = EXCLUDED.poids, ordre = EXCLUDED.ordre;

-- Barème par défaut (seuils en % — indépendant de l'échelle /10 ou /20).
INSERT INTO public.prim_cote_bareme (id, cote, libelle, seuil_min, ordre) VALUES
  ('a_plus','A+','Très bien acquis',90,1),
  ('a','A','Acquis',70,2),
  ('eca','ECA','En cours d''acquisition',50,3),
  ('na','NA','Non acquis',0,4)
ON CONFLICT (id) DO UPDATE
  SET cote = EXCLUDED.cote, libelle = EXCLUDED.libelle, seuil_min = EXCLUDED.seuil_min, ordre = EXCLUDED.ordre;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) TRANSACTIONNEL (par école)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prim_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id)  ON DELETE CASCADE,
  eleve_id       uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  competence_id  text NOT NULL REFERENCES public.prim_competences(id),
  critere_id     text NOT NULL REFERENCES public.prim_criteres(id),
  trimestre_id   text NOT NULL REFERENCES public.apc_trimestres(id),
  note           numeric CHECK (note >= 0),
  enseignant_id  uuid,
  date_saisie    timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz,
  version        integer NOT NULL DEFAULT 1,
  device_id      text,
  CONSTRAINT prim_notes_uniq UNIQUE (eleve_id, competence_id, critere_id, trimestre_id)
);
CREATE INDEX IF NOT EXISTS prim_notes_school  ON public.prim_notes(school_id);
CREATE INDEX IF NOT EXISTS prim_notes_student ON public.prim_notes(eleve_id);
CREATE INDEX IF NOT EXISTS prim_notes_lookup  ON public.prim_notes(eleve_id, trimestre_id, competence_id);

CREATE TABLE IF NOT EXISTS public.prim_bulletins (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             uuid NOT NULL REFERENCES public.schools(id)  ON DELETE CASCADE,
  eleve_id              uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  trimestre_id          text NOT NULL REFERENCES public.apc_trimestres(id),
  moyenne_generale      numeric,
  cote_generale         text,
  rang                  integer,
  appreciation_generale text,
  decision_conseil      text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz,
  version               integer NOT NULL DEFAULT 1,
  device_id             text,
  CONSTRAINT prim_bulletins_uniq UNIQUE (eleve_id, trimestre_id)
);
CREATE INDEX IF NOT EXISTS prim_bulletins_school ON public.prim_bulletins(school_id);

-- Détail par compétence d'un bulletin (ce qui s'imprime).
CREATE TABLE IF NOT EXISTS public.prim_bulletin_competences (
  bulletin_id   uuid NOT NULL REFERENCES public.prim_bulletins(id) ON DELETE CASCADE,
  competence_id text NOT NULL REFERENCES public.prim_competences(id),
  moyenne       numeric,
  cote          text,
  appreciation  text,
  PRIMARY KEY (bulletin_id, competence_id)
);

CREATE TABLE IF NOT EXISTS public.prim_resultats_annuels (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id)  ON DELETE CASCADE,
  eleve_id         uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  annee            text NOT NULL,
  moyenne_annuelle numeric,
  cote_annuelle    text,
  rang_annuel      integer,
  decision         text,
  updated_at       timestamptz,
  version          integer NOT NULL DEFAULT 1,
  device_id        text,
  CONSTRAINT prim_resultats_uniq UNIQUE (eleve_id, annee)
);
CREATE INDEX IF NOT EXISTS prim_resultats_school ON public.prim_resultats_annuels(school_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- 4a) Référentiel : lecture authentifiée, écriture service role.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'prim_referentiel_versions','prim_cycles','prim_niveaux','prim_competences',
    'prim_niveau_competences','prim_criteres','prim_cote_bareme'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "prim ref read" ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY "prim ref read" ON public.%I FOR SELECT TO authenticated USING (true);', t);
  END LOOP;
END $$;

-- 4b) Transactionnel scopé école (tables portant school_id).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prim_notes','prim_bulletins','prim_resultats_annuels'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "prim sel" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "prim ins" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "prim upd" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "prim del" ON public.%I;', t);
    EXECUTE format($p$CREATE POLICY "prim sel" ON public.%I FOR SELECT USING (
      school_id IN (SELECT school_id FROM public.school_users WHERE user_id=auth.uid() AND active=true));$p$, t);
    EXECUTE format($p$CREATE POLICY "prim ins" ON public.%I FOR INSERT WITH CHECK (
      school_id IN (SELECT school_id FROM public.school_users WHERE user_id=auth.uid() AND active=true));$p$, t);
    EXECUTE format($p$CREATE POLICY "prim upd" ON public.%I FOR UPDATE USING (
      school_id IN (SELECT school_id FROM public.school_users WHERE user_id=auth.uid() AND active=true));$p$, t);
    EXECUTE format($p$CREATE POLICY "prim del" ON public.%I FOR DELETE USING (
      school_id IN (SELECT school_id FROM public.school_users WHERE user_id=auth.uid() AND active=true));$p$, t);
  END LOOP;
END $$;

-- 4c) prim_bulletin_competences : rattaché via bulletin_id (école du bulletin parent).
ALTER TABLE public.prim_bulletin_competences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prim bc all" ON public.prim_bulletin_competences;
CREATE POLICY "prim bc all" ON public.prim_bulletin_competences FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.prim_bulletins b
    JOIN public.school_users su ON su.school_id = b.school_id
    WHERE b.id = prim_bulletin_competences.bulletin_id
      AND su.user_id = auth.uid() AND su.active = true
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.prim_bulletins b
    JOIN public.school_users su ON su.school_id = b.school_id
    WHERE b.id = prim_bulletin_competences.bulletin_id
      AND su.user_id = auth.uid() AND su.active = true
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RPC — CALCUL DES BULLETINS (moyennes + cotes + rangs), atomique par classe
-- ─────────────────────────────────────────────────────────────────────────────
-- moyenne_competence = Σ(note × poids_critère) / Σ(poids des critères notés)
-- moyenne_generale   = Σ(moyenne_competence × coef) / Σ(coef)
-- cote               = plus haute bande du barème dont seuil_min ≤ (moyenne/grade_max*100)
CREATE OR REPLACE FUNCTION public.compute_prim_bulletin(
  p_school_id  uuid,
  p_class_id   uuid,
  p_trimestre_id text,
  p_grade_max  numeric DEFAULT 10
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count       int := 0;
  v_eleve       record;
  v_bulletin_id uuid;
  v_gen         numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.school_users
    WHERE user_id = auth.uid() AND school_id = p_school_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  FOR v_eleve IN
    SELECT id FROM public.students WHERE class_id = p_class_id AND school_id = p_school_id
  LOOP
    INSERT INTO public.prim_bulletins (school_id, eleve_id, trimestre_id)
    VALUES (p_school_id, v_eleve.id, p_trimestre_id)
    ON CONFLICT (eleve_id, trimestre_id)
      DO UPDATE SET updated_at = now(), version = public.prim_bulletins.version + 1
    RETURNING id INTO v_bulletin_id;

    -- Moyennes + cotes par compétence
    DELETE FROM public.prim_bulletin_competences WHERE bulletin_id = v_bulletin_id;
    INSERT INTO public.prim_bulletin_competences (bulletin_id, competence_id, moyenne, cote)
    SELECT v_bulletin_id, comp.competence_id, comp.moy,
           (SELECT b.cote FROM public.prim_cote_bareme b
            WHERE (comp.moy / NULLIF(p_grade_max, 0) * 100) >= b.seuil_min
            ORDER BY b.seuil_min DESC LIMIT 1)
    FROM (
      SELECT n.competence_id,
             round(sum(n.note * cr.poids) / NULLIF(sum(cr.poids), 0), 2) AS moy
      FROM public.prim_notes n
      JOIN public.prim_criteres cr ON cr.id = n.critere_id
      WHERE n.eleve_id = v_eleve.id AND n.trimestre_id = p_trimestre_id AND n.note IS NOT NULL
      GROUP BY n.competence_id
    ) comp;

    -- Moyenne générale (pondérée par coef de compétence)
    SELECT round(sum(bc.moyenne * COALESCE(c.coefficient, 1))
               / NULLIF(sum(COALESCE(c.coefficient, 1)), 0), 2)
    INTO v_gen
    FROM public.prim_bulletin_competences bc
    JOIN public.prim_competences c ON c.id = bc.competence_id
    WHERE bc.bulletin_id = v_bulletin_id AND bc.moyenne IS NOT NULL;

    UPDATE public.prim_bulletins
    SET moyenne_generale = v_gen,
        cote_generale = (SELECT b.cote FROM public.prim_cote_bareme b
                         WHERE (v_gen / NULLIF(p_grade_max, 0) * 100) >= b.seuil_min
                         ORDER BY b.seuil_min DESC LIMIT 1),
        updated_at = now()
    WHERE id = v_bulletin_id;

    v_count := v_count + 1;
  END LOOP;

  -- Rangs (ex æquo partagent le rang ; élèves sans moyenne en dernier)
  WITH ranked AS (
    SELECT b.id, rank() OVER (ORDER BY b.moyenne_generale DESC NULLS LAST) AS rk
    FROM public.prim_bulletins b
    JOIN public.students s ON s.id = b.eleve_id
    WHERE s.class_id = p_class_id AND b.trimestre_id = p_trimestre_id
  )
  UPDATE public.prim_bulletins b SET rang = r.rk FROM ranked r WHERE b.id = r.id;

  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.compute_prim_bulletin(uuid, uuid, text, numeric) TO authenticated;

-- Résultats annuels = moyenne des 3 trimestres + rang annuel (décision saisie à part).
CREATE OR REPLACE FUNCTION public.compute_prim_annual(
  p_school_id uuid,
  p_class_id  uuid,
  p_annee     text,
  p_grade_max numeric DEFAULT 10
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.school_users
    WHERE user_id = auth.uid() AND school_id = p_school_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  INSERT INTO public.prim_resultats_annuels (school_id, eleve_id, annee, moyenne_annuelle, cote_annuelle)
  SELECT p_school_id, s.id, p_annee, m.moy,
         (SELECT cote FROM public.prim_cote_bareme b
          WHERE (m.moy / NULLIF(p_grade_max, 0) * 100) >= b.seuil_min
          ORDER BY b.seuil_min DESC LIMIT 1)
  FROM public.students s
  JOIN LATERAL (
    SELECT round(avg(bl.moyenne_generale), 2) AS moy
    FROM public.prim_bulletins bl
    WHERE bl.eleve_id = s.id AND bl.moyenne_generale IS NOT NULL
  ) m ON true
  WHERE s.class_id = p_class_id AND s.school_id = p_school_id AND m.moy IS NOT NULL
  ON CONFLICT (eleve_id, annee) DO UPDATE
    SET moyenne_annuelle = EXCLUDED.moyenne_annuelle,
        cote_annuelle    = EXCLUDED.cote_annuelle,
        updated_at       = now(),
        version          = public.prim_resultats_annuels.version + 1;

  WITH ranked AS (
    SELECT ra.id, rank() OVER (ORDER BY ra.moyenne_annuelle DESC NULLS LAST) AS rk
    FROM public.prim_resultats_annuels ra
    JOIN public.students s ON s.id = ra.eleve_id
    WHERE s.class_id = p_class_id AND ra.annee = p_annee
  )
  UPDATE public.prim_resultats_annuels ra SET rang_annuel = r.rk FROM ranked r WHERE ra.id = r.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.compute_prim_annual(uuid, uuid, text, numeric) TO authenticated;

-- ============================================================================
-- FIN — Bascule d'une école : UPDATE schools SET bulletin_engine='minedub'
-- (ou 'apc_primaire') WHERE id='...'. Les 11 compétences s'associent
-- automatiquement à la création d'une classe SIL…CM2 (src/lib/primAutoConfig.js).
-- ============================================================================
