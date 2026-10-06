-- BARÈMES DE SAISIE PERSONNALISÉS PAR L'ENSEIGNANT
--
-- Les deux moteurs par compétences imposaient un barème fixe : /20 par
-- compétence en APC premier cycle (MINESEC), et un total de points par critère
-- (Oral, Écrit, Pratique, Savoir-être) en primaire APC (MINEDUB). L'enseignant
-- qui évalue une dictée sur 15 ou un oral sur 10 devait convertir de tête avant
-- de saisir — conversion fausse une fois sur trois, et invisible ensuite.
--
-- Cette table laisse chaque enseignant fixer le barème de saisie DANS l'écran de
-- saisie. Le calcul, lui, ramène tout à l'échelle officielle (src/core/
-- baremeOverride.js) : le bulletin et le PV restent sur le barème officiel.
--
-- PORTÉE : le NIVEAU, pas la classe. Un barème est une décision de niveau
-- (toutes les 6e, tous les CM2) — deux classes parallèles doivent rester
-- comparables sur le même bulletin.
--
-- Migration ADDITIVE et IDEMPOTENTE : aucun barème existant n'est touché, et
-- l'absence de ligne vaut « barème officiel ».

CREATE TABLE IF NOT EXISTS public.bareme_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- 'apc' = premier cycle MINESEC (compétence /20) ; 'prim' = primaire MINEDUB
  -- (critère noté en points). Les deux moteurs vivent dans la même table : la
  -- surcharge est la même idée, et un seul chargement suffit côté client.
  engine         text NOT NULL CHECK (engine IN ('apc', 'prim')),
  -- Slug du référentiel : '6e'…'3e' (APC) ou 'sil'…'cm2' (primaire).
  niveau_slug    text NOT NULL,
  -- Id de compétence du référentiel. PAS de clé étrangère : les ids de
  -- compétences divergent entre le seed LAN et le Cloud (cf. server/db.js), et
  -- une FK rendrait la ligne irrecevable d'un côté comme de l'autre.
  competence_id  text NOT NULL,
  -- Critère (primaire uniquement) : 'oral', 'ecrit', 'pratique', 'savoir_etre'.
  -- CHAÎNE VIDE en APC, où le barème porte la compétence entière — et non NULL :
  -- un NULL rendrait l'index d'unicité inutilisable comme cible d'upsert
  -- (PostgREST ne sait viser qu'une liste de colonnes, pas un index sur
  -- expression), et NULL ≠ NULL laisserait entrer des doublons.
  critere_id     text NOT NULL DEFAULT '',
  points_max     numeric NOT NULL CHECK (points_max >= 1 AND points_max <= 200),
  -- Qui a fixé ce barème : la question se pose dès le premier désaccord entre
  -- deux enseignants d'un même niveau.
  enseignant_id  uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- colonnes de synchronisation continue LAN ↔ Cloud (cf. apc_notes)
  updated_at     timestamptz,
  version        integer NOT NULL DEFAULT 1,
  device_id      text
);

-- Un seul barème par (école, moteur, niveau, compétence, critère). Cet index est
-- aussi la CIBLE D'UPSERT du client (`on_conflict`) : il doit donc porter sur les
-- colonnes nues, d'où `critere_id` NOT NULL plus haut.
CREATE UNIQUE INDEX IF NOT EXISTS bareme_notes_uniq
  ON public.bareme_notes (school_id, engine, niveau_slug, competence_id, critere_id);

CREATE INDEX IF NOT EXISTS bareme_notes_school ON public.bareme_notes (school_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS : lecture et écriture scopées à l'école du membre — calqué sur apc_notes.
--
-- L'ÉCRITURE EST OUVERTE AUX ENSEIGNANTS, délibérément : c'est la demande même
-- (« chaque enseignant doit pouvoir modifier le barème là où il saisit »). Un
-- enseignant atteint déjà ces écrans, et l'écran ne lui propose que ses propres
-- matières (teacherScope). Réserver le barème aux administrateurs rendrait la
-- fonction inutile : c'est l'enseignant qui connaît l'échelle de son épreuve.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.bareme_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bareme_notes: lecture par membres" ON public.bareme_notes;
CREATE POLICY "bareme_notes: lecture par membres"
  ON public.bareme_notes FOR SELECT USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

DROP POLICY IF EXISTS "bareme_notes: insert par membres" ON public.bareme_notes;
CREATE POLICY "bareme_notes: insert par membres"
  ON public.bareme_notes FOR INSERT WITH CHECK (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

DROP POLICY IF EXISTS "bareme_notes: update par membres" ON public.bareme_notes;
CREATE POLICY "bareme_notes: update par membres"
  ON public.bareme_notes FOR UPDATE USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );

DROP POLICY IF EXISTS "bareme_notes: delete par membres" ON public.bareme_notes;
CREATE POLICY "bareme_notes: delete par membres"
  ON public.bareme_notes FOR DELETE USING (
    school_id IN (SELECT school_id FROM public.school_users WHERE user_id = auth.uid() AND active = true)
  );
