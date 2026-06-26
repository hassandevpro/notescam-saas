-- ============================================================================
-- NotesCam — DURCISSEMENT SÉCURITÉ (audit 2026-06-23)
-- À exécuter dans Supabase SQL Editor. Idempotent.
--
-- PARTIE 1 (C1) : APPLICABLE IMMÉDIATEMENT — corrige la faille d'isolation
--                 multi-établissements. Vérifié compatible avec login + Settings.
-- PARTIE 2 (C2) : Stockage — NE PAS APPLIQUER tel quel sans le changement
--                 applicatif (URL signées). Voir notes.
-- PARTIE 3 (H2) : Notes — audit d'acteur (sûr) + verrouillage écriture (à tester).
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VÉRIFICATION PRÉALABLE — état réel de la RLS (lecture seule)              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname IN ('school_users','schools','superadmins','fee_payments');
-- relrowsecurity = false sur une de ces lignes  ⇒  faille C1 ACTIVE.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 1 — C1 : ISOLATION MULTI-ÉTABLISSEMENTS (appliquer maintenant)     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── school_users : pivot de TOUTE l'isolation. Lecture de ses propres lignes ;
--    écriture INTERDITE via l'API (passe uniquement par les RPC SECURITY DEFINER
--    admin_create_*_account / admin_set_*_active / signup_*). ───────────────────
ALTER TABLE public.school_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_users: lecture" ON public.school_users;
DROP POLICY IF EXISTS "school_users: self read" ON public.school_users;
CREATE POLICY "school_users: self read"
  ON public.school_users FOR SELECT
  USING (user_id = auth.uid());

-- Bloque l'auto-insertion (devenir admin d'une autre école) et toute écriture client.
REVOKE INSERT, UPDATE, DELETE ON public.school_users FROM anon, authenticated;


-- ── superadmins : allowlist. Lecture de sa propre ligne (le client vérifie son
--    statut) ; aucune écriture client (sinon auto-promotion super-admin). ───────
ALTER TABLE public.superadmins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmins: self read" ON public.superadmins;
CREATE POLICY "superadmins: self read"
  ON public.superadmins FOR SELECT
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.superadmins FROM anon, authenticated;


-- ── schools : lecture par les membres ; mise à jour par les admins (Settings) ;
--    création via le RPC signup_school_and_admin uniquement ; pas de delete client.
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schools: read members" ON public.schools;
CREATE POLICY "schools: read members"
  ON public.schools FOR SELECT
  USING (id IN (
    SELECT school_id FROM public.school_users
    WHERE user_id = auth.uid() AND active = true
  ));

DROP POLICY IF EXISTS "schools: update admins" ON public.schools;
CREATE POLICY "schools: update admins"
  ON public.schools FOR UPDATE
  USING (id IN (
    SELECT school_id FROM public.school_users
    WHERE user_id = auth.uid() AND active = true AND role = 'admin'
  ))
  WITH CHECK (id IN (
    SELECT school_id FROM public.school_users
    WHERE user_id = auth.uid() AND active = true AND role = 'admin'
  ));

REVOKE INSERT, DELETE ON public.schools FROM anon, authenticated;


-- ── fee_payments : paiements individuels. Lecture + écriture scopées à l'école
--    du membre (corrige l'exposition inter-école). ─────────────────────────────
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fee_payments: members" ON public.fee_payments;
CREATE POLICY "fee_payments: members"
  ON public.fee_payments FOR ALL
  USING (school_id IN (
    SELECT school_id FROM public.school_users
    WHERE user_id = auth.uid() AND active = true
  ))
  WITH CHECK (school_id IN (
    SELECT school_id FROM public.school_users
    WHERE user_id = auth.uid() AND active = true
  ));
-- (Optionnel, plus strict : remplacer par role IN ('admin','censeur') si seuls
--  l'admin/l'économe enregistrent les paiements.)


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ⚠ À FAIRE : auditer TOUTES les tables publiques                            ║
-- ║   SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace ║
-- ║   WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false;     ║
-- ║   Toute table sensible listée doit recevoir ENABLE RLS + policies scopées.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 2 — C2 : STOCKAGE (signatures / cachets / photos / documents RH)   ║
-- ║ ⚠ NE PAS APPLIQUER sans avoir basculé l'app sur les URL SIGNÉES.          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Problème : le bucket `school-assets` est PUBLIC + policy SELECT ouverte
-- (supabase_sprint10.sql) → signatures, cachets, photos d'élèves et documents RH
-- (contrats/diplômes) sont téléchargeables/énumérables par n'importe qui
-- ⇒ falsification de documents + fuite PII.
--
-- ── 2a) INTERIM (faible risque, applicable maintenant) ──────────────────────
-- Coupe l'ÉNUMÉRATION anonyme (listing) des objets sans toucher l'affichage :
-- le bucket reste public (les <img src=URL publique> continuent de marcher), mais
-- un anonyme ne peut plus LISTER tous les fichiers pour découvrir les chemins.
-- Réduit fortement la fuite en attendant la bascule privée complète (2b).
DROP POLICY IF EXISTS "school-assets: lecture publique" ON storage.objects;
DROP POLICY IF EXISTS "school-assets: liste membres" ON storage.objects;
CREATE POLICY "school-assets: liste membres"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'school-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT school_id::text FROM public.school_users
      WHERE user_id = auth.uid() AND active = true
    )
  );
-- NB : un bucket PUBLIC sert toujours un fichier par URL directe connue (le RLS
-- ne s'applique qu'au listing). La protection complète vient de 2b (bucket privé).

-- ── 2b) BASCULE PRIVÉE COMPLÈTE ─────────────────────────────────────────────
-- Côté APPLICATION (prérequis avant d'exécuter le SQL ci-dessous) :
--   1. Remplacer getPublicUrl() par createSignedUrl(path, ttl) partout
--      (staffService.js, schoolService.uploadSchoolAsset, photos élèves…).
--   2. Génération PDF : déjà OK — les images sont converties en data-URL avant
--      capture (idCardService.imageToDataUrl), donc une URL signée courte suffit.
--   3. Portail parent : exposer le logo via une URL signée renvoyée par le RPC
--      get_parent_portal_data (SECURITY DEFINER) plutôt qu'une URL publique.
--
-- SQL (à exécuter APRÈS le changement applicatif) :
--
-- UPDATE storage.buckets SET public = false WHERE id = 'school-assets';
--
-- DROP POLICY IF EXISTS "school-assets: lecture publique" ON storage.objects;
-- CREATE POLICY "school-assets: lecture membres"
--   ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'school-assets'
--     AND (storage.foldername(name))[1] IN (
--       SELECT school_id::text FROM public.school_users
--       WHERE user_id = auth.uid() AND active = true
--     )
--   );
-- (Les policies INSERT/UPDATE/DELETE admin existantes restent valables.)


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PARTIE 3 — H2 : INTÉGRITÉ DES NOTES                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 3a) Audit d'acteur (SÛR — applicable maintenant) : qui a modifié la note.
ALTER TABLE public.grades ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION public.set_grade_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grades_set_actor ON public.grades;
CREATE TRIGGER grades_set_actor
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.set_grade_actor();

-- 3b) Restriction d'écriture : un enseignant ne modifie QUE les notes des matières
--     qui lui sont affectées (subjects.teacher_id ↔ teachers.auth_user_id).
--     ⚠ CHANGEMENT DE COMPORTEMENT — à activer après avoir vérifié que chaque
--       matière a bien un teacher_id. Décommenter pour appliquer :
--
-- DROP POLICY IF EXISTS "grades: écriture par admins et enseignants" ON public.grades;
-- -- Admin/censeur : toute l'école.
-- CREATE POLICY "grades: write staff"
--   ON public.grades FOR ALL
--   USING (school_id IN (SELECT school_id FROM public.school_users
--            WHERE user_id=auth.uid() AND active=true AND role IN ('admin','censeur')))
--   WITH CHECK (school_id IN (SELECT school_id FROM public.school_users
--            WHERE user_id=auth.uid() AND active=true AND role IN ('admin','censeur')));
-- -- Enseignant : uniquement ses matières.
-- CREATE POLICY "grades: write own subjects"
--   ON public.grades FOR ALL
--   USING (EXISTS (
--     SELECT 1 FROM public.subjects sub JOIN public.teachers tch ON tch.id = sub.teacher_id
--     WHERE sub.id = grades.subject_id AND sub.class_id = grades.class_id
--       AND tch.auth_user_id = auth.uid()))
--   WITH CHECK (EXISTS (
--     SELECT 1 FROM public.subjects sub JOIN public.teachers tch ON tch.id = sub.teacher_id
--     WHERE sub.id = grades.subject_id AND sub.class_id = grades.class_id
--       AND tch.auth_user_id = auth.uid()));

-- ============================================================================
-- FIN
-- ============================================================================
