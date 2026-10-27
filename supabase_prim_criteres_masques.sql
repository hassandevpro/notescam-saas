-- UNE ÉCOLE QUI N'ÉVALUE QU'À L'ÉCRIT PEUT RETIRER LES AUTRES CRITÈRES
-- ============================================================================
-- Suite de `supabase_prim_competences_par_ecole.sql`, qui écrivait :
--
--   « `prim_criteres` (Oral, Écrit, Savoir-être) ne sont PAS ouverts ici : les
--     critères structurent le barème officiel et le calcul de la cote. Les
--     rendre modifiables demanderait de revoir primEngine, pas seulement une
--     policy — à traiter à froid si le besoin se confirme. »
--
-- LE BESOIN S'EST CONFIRMÉ. THE GENIUS (Bafoussam) a signalé le 2026-10-27, sur
-- ses cinq niveaux : « c'est uniquement l'écrit, il n'y a pas de pratique et de
-- l'oral ». Ses bulletins CM1 et CE2 BIL sortent avec quatre colonnes — Oral,
-- Écrit, Pratique, Savoir-être — dont trois ne seront jamais remplies. Et rien
-- ne permettait de les retirer : `primColumnBareme.js` ne sait fermer qu'un
-- critère que le national IGNORE, jamais un critère officiel.
--
-- CE FICHIER RESTE EN DEÇÀ DE CE QUE LA DÉCISION D'ORIGINE REDOUTAIT.
-- Il n'ouvre PAS `prim_criteres` : pas de `school_id`, pas d'écriture, pas de
-- critère maison. La table nationale et son barème ne bougent pas d'un octet.
-- Il ajoute seulement un MASQUE par école — exactement la même mécanique que
-- `prim_competences_masques`, déjà en production depuis la 0.3.20.
--
-- CE QUE LE MASQUE CHANGE, ET IL FAUT LE SAVOIR AVANT D'APPLIQUER :
--   • la colonne quitte l'écran de saisie ET le bulletin ;
--   • ses POINTS quittent le barème de chaque compétence. La compétence 1A du
--     SIL passe de 40 points (Oral 20 + Écrit 15 + Savoir-être 5) à 15 si
--     l'école ne garde que l'écrit. C'est voulu : une colonne jamais
--     interrogée ne peut pas rester au dénominateur, sinon chaque élève
--     plafonnerait sous la note qu'il mérite ;
--   • les NOTES déjà saisies dans un critère masqué restent EN BASE. Masquer
--     cache, ne supprime pas. L'écran annonce leur nombre avant le geste, et
--     démasquer les fait toutes revenir.
--
-- HORS CONTRAT DE SYNCHRONISATION. Comme ses tables sœurs, celle-ci n'est PAS
-- dans `SYNCED_TABLES` (server/db.js) : un masque est un réglage d'affichage
-- local, il ne monte pas et ne descend pas. Aucune colonne n'est ajoutée à une
-- table synchronisée, donc le piège de B1 — une colonne inconnue du Cloud qui
-- fait refuser la ligne entière — ne s'applique pas ici.
--
-- Additif, idempotent. À EXÉCUTER dans Supabase.
-- ============================================================================

-- ── 1. La table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prim_criteres_masques (
  school_id  uuid NOT NULL REFERENCES public.schools(id)       ON DELETE CASCADE,
  critere_id text NOT NULL REFERENCES public.prim_criteres(id) ON DELETE CASCADE,
  masque_le  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, critere_id)
);

COMMENT ON TABLE public.prim_criteres_masques IS
  'Critères d''évaluation du primaire qu''une école n''utilise pas. '
  'Masque réversible : la colonne quitte la saisie, le bulletin et le barème, '
  'mais les notes déjà saisies restent en base.';

-- ── 2. RLS — chaque école ne voit et n'écrit que les siens ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'member_of_school') THEN
    RAISE EXCEPTION 'public.member_of_school absente — appliquez d''abord supabase_mat_domaines_par_ecole.sql.';
  END IF;
END $$;

ALTER TABLE public.prim_criteres_masques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prim criteres masques: les siens" ON public.prim_criteres_masques;
CREATE POLICY "prim criteres masques: les siens"
  ON public.prim_criteres_masques FOR ALL TO authenticated
  USING      (public.member_of_school(school_id))
  WITH CHECK (public.member_of_school(school_id));

-- ── 3. Vérification ─────────────────────────────────────────────────────────
DO $$
DECLARE v_tab boolean; v_rls boolean; v_pol boolean; v_crit integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='prim_criteres_masques') INTO v_tab;
  SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.prim_criteres_masques'::regclass INTO v_rls;
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='prim_criteres_masques'
                  AND policyname='prim criteres masques: les siens') INTO v_pol;
  SELECT count(*) FROM public.prim_criteres INTO v_crit;

  IF NOT (v_tab AND v_rls AND v_pol) THEN
    RAISE EXCEPTION 'Incomplet — table=% rls=% policy=%', v_tab, v_rls, v_pol;
  END IF;
  RAISE NOTICE 'OK — % critere(s) national(aux) intact(s), chaque ecole peut desormais retirer ceux qu''elle n''evalue pas.', v_crit;
END $$;

-- Contrôle : le national est intact, et personne n'a encore rien masqué.
SELECT (SELECT count(*) FROM public.prim_criteres)          AS criteres_nationaux,
       (SELECT count(*) FROM public.prim_criteres_masques)  AS masques_poses,
       (SELECT count(*) FROM public.prim_notes)             AS notes_intactes;
