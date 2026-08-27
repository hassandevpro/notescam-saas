-- supabase_student_hard_delete.sql
-- SUPPRIMER UN ÉLÈVE MÊME S'IL PORTE DES VERSEMENTS — demande des écoles,
-- décidée le 27/08/2026.
--
-- ── CE QUI CHANGE, ET CE QUI NE CHANGE PAS ──────────────────────────────────
-- Un versement reste INEFFAÇABLE À LUI SEUL : `fee_payments` n'a toujours aucune
-- policy permissive de DELETE ni d'UPDATE, et personne ne peut retirer une ligne
-- d'argent depuis l'écran de caisse. Ce qui devient possible, c'est de supprimer
-- l'ÉLÈVE ; ses écritures partent alors avec lui, par la clé étrangère.
--
-- Le droit qui gouverne le geste est donc, exactement, celui de supprimer un
-- élève — c'est la décision prise : « tout compte qui peut déjà supprimer un
-- élève ». Aucune permission nouvelle n'est distribuée, aucune n'est élargie ;
-- on ne rouvre pas non plus la porte à la suppression d'un versement isolé.
--
-- ── POURQUOI UNE CASCADE, ALORS QU'ELLE AVAIT ÉTÉ ÉCARTÉE ───────────────────
-- Elle avait été écartée pour une raison exacte : une cascade s'exécute au nom du
-- propriétaire de la table, ne repasse ni par la RLS ni par les GRANT, et
-- effaçait donc l'argent SANS LAISSER DE TRACE. C'est ce dernier mot qui posait
-- problème, pas la cascade elle-même — et 191 lignes orphelines constatées en
-- base le 27/08/2026 (7 460 000, quatre écoles, THE GENIUS non concernée)
-- montrent ce que « sans trace » donne à l'usage.
--
-- Le §1 retire ce défaut : chaque ligne effacée est recopiée AVANT sa disparition
-- dans `deleted_fee_payments`, avec qui l'a supprimée et quand. Le déclencheur est
-- posé sur `fee_payments` elle-même, donc il s'exécute aussi pour les lignes
-- emportées par la cascade — c'est précisément le cas à couvrir.
--
-- ── RETOUR ARRIÈRE ──────────────────────────────────────────────────────────
-- §5, commenté : repose la contrainte en RESTRICT. La table de trace est
-- conservée (elle ne gêne rien et contient de l'historique).
--
-- Idempotent. À coller dans Supabase → SQL Editor → Run.
-- ============================================================================

BEGIN;

-- ── 1. LA TRACE — avant tout le reste ───────────────────────────────────────
-- Posée EN PREMIER, et le déclencheur avec : si la cascade était ouverte avant
-- que la trace n'existe, une suppression faite entre les deux serait perdue.
CREATE TABLE IF NOT EXISTS public.deleted_fee_payments (
  id                uuid PRIMARY KEY,          -- l'id d'origine du versement
  school_id         uuid NOT NULL,
  student_id        uuid NOT NULL,
  student_name      text,                       -- lu AVANT la disparition de l'élève
  academic_year     text,
  amount            integer,
  date              date,
  note              text,
  receipt_no        integer,
  reversal_of       uuid,
  recorded_by       uuid,
  recorded_by_name  text,
  created_at        timestamptz,
  deleted_at        timestamptz NOT NULL DEFAULT now(),
  deleted_by        uuid,
  deleted_by_name   text
);

COMMENT ON TABLE public.deleted_fee_payments IS
  'Trace des versements effacés par la suppression de leur élève. Alimentée par '
  'un déclencheur, jamais par le client. Lecture seule : elle sert à justifier un '
  'exercice quand quelqu''un demande où sont passées des recettes.';

-- Index de consultation : « qu''a-t-on supprimé dans cette école ? »
CREATE INDEX IF NOT EXISTS deleted_fee_payments_school_idx
  ON public.deleted_fee_payments (school_id, deleted_at DESC);

-- ── 2. LE DÉCLENCHEUR ───────────────────────────────────────────────────────
-- BEFORE DELETE : la ligne existe encore, on la lit intégralement.
-- SECURITY DEFINER : la trace doit s'écrire même quand l'appelant n'a aucun droit
-- sur `deleted_fee_payments` — c'est justement le but, il ne doit pas pouvoir
-- l'empêcher.
-- ON CONFLICT DO NOTHING : un même id ne peut être tracé deux fois (rejeu).
CREATE OR REPLACE FUNCTION public.trace_deleted_fee_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid; v_actor_name text; v_student text;
BEGIN
  v_actor := (SELECT auth.uid());
  SELECT su.full_name INTO v_actor_name
    FROM public.school_users su
   WHERE su.user_id = v_actor AND su.school_id = OLD.school_id
   LIMIT 1;
  -- Le nom de l'élève est lu MAINTENANT : dans une cascade, la ligne `students`
  -- est déjà condamnée et ne sera plus lisible après coup.
  SELECT s.name INTO v_student FROM public.students s WHERE s.id = OLD.student_id;

  INSERT INTO public.deleted_fee_payments (
    id, school_id, student_id, student_name, academic_year, amount, date, note,
    receipt_no, reversal_of, recorded_by, recorded_by_name, created_at,
    deleted_by, deleted_by_name)
  VALUES (
    OLD.id, OLD.school_id, OLD.student_id, v_student, OLD.academic_year, OLD.amount,
    OLD.date, OLD.note, OLD.receipt_no, OLD.reversal_of, OLD.recorded_by,
    OLD.recorded_by_name, OLD.created_at, v_actor, v_actor_name)
  ON CONFLICT (id) DO NOTHING;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_trace_deleted_fee_payment ON public.fee_payments;
CREATE TRIGGER trg_trace_deleted_fee_payment
  BEFORE DELETE ON public.fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.trace_deleted_fee_payment();

-- ── 2 bis. LE DÉCLENCHEUR QUI CONNAÎT LE NOM ────────────────────────────────
-- Le §2 ne suffit pas, et l'épreuve du 27/08/2026 l'a montré : `student_name`
-- sortait NULL. Dans une cascade, PostgreSQL efface le PARENT d'abord, puis
-- applique l'action référentielle sur les enfants — quand le déclencheur du §2
-- interroge `students`, la ligne n'y est déjà plus.
--
-- On trace donc depuis l'ÉLÈVE, en BEFORE DELETE sur `students` : à cet instant
-- l'élève ET ses versements existent encore, et `OLD.name` est disponible.
--
-- Les deux déclencheurs coexistent volontairement, et dans cet ordre : celui-ci
-- écrit la ligne complète (nom compris) ; celui du §2 ne fait plus rien pour ces
-- lignes (`ON CONFLICT DO NOTHING`) et reste le filet pour une suppression de
-- versement qui n'emprunterait PAS la cascade — chemin qu'aucune policy n'ouvre
-- aujourd'hui, mais un filet ne se juge pas sur le trafic qu'il voit.
CREATE OR REPLACE FUNCTION public.trace_student_cash_before_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid; v_actor_name text;
BEGIN
  v_actor := (SELECT auth.uid());
  SELECT su.full_name INTO v_actor_name
    FROM public.school_users su
   WHERE su.user_id = v_actor AND su.school_id = OLD.school_id
   LIMIT 1;

  INSERT INTO public.deleted_fee_payments (
    id, school_id, student_id, student_name, academic_year, amount, date, note,
    receipt_no, reversal_of, recorded_by, recorded_by_name, created_at,
    deleted_by, deleted_by_name)
  SELECT p.id, p.school_id, p.student_id, OLD.name, p.academic_year, p.amount, p.date,
         p.note, p.receipt_no, p.reversal_of, p.recorded_by, p.recorded_by_name,
         p.created_at, v_actor, v_actor_name
    FROM public.fee_payments p
   WHERE p.student_id = OLD.id
  ON CONFLICT (id) DO NOTHING;

  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_trace_student_cash ON public.students;
CREATE TRIGGER trg_trace_student_cash
  BEFORE DELETE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.trace_student_cash_before_delete();

-- ── 3. LA LECTURE DE LA TRACE ───────────────────────────────────────────────
-- Lisible par les membres de l'école, et par eux seuls. Aucune policy d'écriture :
-- le client ne peut ni ajouter, ni modifier, ni effacer une ligne de trace — seul
-- le déclencheur (SECURITY DEFINER) y écrit.
ALTER TABLE public.deleted_fee_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trace suppressions : lecture membres" ON public.deleted_fee_payments;
CREATE POLICY "trace suppressions : lecture membres" ON public.deleted_fee_payments
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.school_users su
                  WHERE su.user_id = (SELECT auth.uid())
                    AND su.school_id = deleted_fee_payments.school_id
                    AND su.active = true));

-- ── 4. LA CASCADE ───────────────────────────────────────────────────────────
-- Seulement maintenant que la trace est en place et armée.
--
-- NOT VALID, et ce n'est pas un raccourci : la contrainte d'origine l'était DÉJÀ
-- (`convalidated = false`, constaté le 27/08/2026). C'est ce qui laisse vivre 191
-- versements rattachés à des élèves qui n'existent plus — 7 460 000, quatre
-- écoles, THE GENIUS non concernée. Exiger la validation ferait échouer la
-- migration sur ces lignes-là, et les nettoyer serait effacer les données
-- comptables d'autres établissements sans qu'on l'ait demandé.
--
-- Ce que NOT VALID ne change PAS : les déclencheurs de la clé sont bien posés,
-- donc la CASCADE s'applique dès maintenant à toute suppression d'élève. Seul le
-- balayage de l'existant est sauté. On reste donc exactement au niveau de
-- garantie d'avant — on ne l'abaisse pas.
ALTER TABLE public.fee_payments DROP CONSTRAINT IF EXISTS fee_payments_student_id_fkey;
ALTER TABLE public.fee_payments
  ADD CONSTRAINT fee_payments_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.students (id) ON DELETE CASCADE NOT VALID;

COMMIT;

-- ── CONTRÔLE ────────────────────────────────────────────────────────────────
-- Attendu : on_delete = 'c' (CASCADE), declencheur = true, policies_ecriture = 0.
SELECT (SELECT c.confdeltype FROM pg_constraint c
         WHERE c.conname = 'fee_payments_student_id_fkey')            AS on_delete,
       EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgname = 'trg_trace_deleted_fee_payment')       AS declencheur,
       (SELECT count(*) FROM pg_policies
         WHERE tablename = 'fee_payments' AND permissive = 'PERMISSIVE'
           AND cmd IN ('DELETE', 'UPDATE'))                           AS policies_ecriture;

-- ── 5. RETOUR ARRIÈRE (décommenter pour refermer la cascade) ────────────────
-- ALTER TABLE public.fee_payments DROP CONSTRAINT IF EXISTS fee_payments_student_id_fkey;
-- ALTER TABLE public.fee_payments
--   ADD CONSTRAINT fee_payments_student_id_fkey
--   FOREIGN KEY (student_id) REFERENCES public.students (id) ON DELETE RESTRICT;
