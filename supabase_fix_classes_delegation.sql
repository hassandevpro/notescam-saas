-- supabase_fix_classes_delegation.sql
-- CORRECTIF — « new row violates row-level security policy for table "classes" »
-- pour un compte à qui l'application a pourtant confié la page Classes.
--
-- ── LE DÉFAUT ───────────────────────────────────────────────────────────────
-- Le produit sait déléguer une page à un compte de direction : `school_users.
-- permissions` porte la liste des chemins confiés, et l'écran Accès la règle.
-- Le compte « Directeur » de BRIGHT CONTINENT (rôle de base `censeur`) a ainsi
-- `/app/classes` dans ses capacités, et l'application lui ouvre l'écran Classes.
--
-- Mais les deux policies d'ÉCRITURE de `classes` ne regardent que le RÔLE DE
-- BASE :
--     USING (school_id = user_school_id() AND user_role() = 'admin')
--     USING (school_id IN (SELECT ... WHERE role = 'admin'))
--
-- Elles ignorent `permissions`. Le compte délégué peut donc ouvrir la page,
-- créer ses classes — l'application étant hors-ligne d'abord, l'écriture locale
-- est acceptée — puis la synchronisation les repousse et la base les refuse.
-- La file retente, abandonne, et affiche « N opérations en échec · classes ·
-- upsert ». Le travail est perdu sans que personne ait été prévenu au moment
-- de la saisie.
--
-- Mesuré avant correctif, création d'une classe chez BRIGHT CONTINENT :
--     Administrateur   (admin)       -> acceptée
--     Directeur        (censeur)     -> REFUSÉE   ← alors que /app/classes lui est délégué
--     Sous-directrice  (censeur)     -> REFUSÉE   ← idem
--
-- ── CE QUE CE FICHIER FAIT ──────────────────────────────────────────────────
-- Il branche sur ces deux policies la fonction `has_page_permission`, qui existe
-- déjà en base et sert déjà à `admin_create_teacher_account`. Écrire les classes
-- devient possible pour un admin OU pour un compte à qui `/app/classes` a été
-- explicitement confié.
--
-- ── CE QUE ÇA N'OUVRE PAS ───────────────────────────────────────────────────
-- `has_page_permission` refuse d'emblée si l'école n'a pas `advanced_delegation
-- = true` : les établissements qui n'ont pas activé la délégation avancée ne
-- voient STRICTEMENT aucun changement. Aujourd'hui, deux écoles l'ont activée
-- (BRIGHT CONTINENT, THE GENIUS). Le cloisonnement par secteur reste par-dessus,
-- en RESTRICTIVE : un compte délégué mais cloisonné n'écrit que dans son
-- périmètre. Aucun droit n'est accordé à un rôle qui n'a rien de délégué.
--
-- Les mêmes policies d'écriture ignorent `permissions` sur `students`,
-- `subjects` et `teachers` : l'écart est identique, mais aucune panne n'y est
-- constatée à ce jour, donc ce fichier n'y touche pas.
--
-- IDEMPOTENT — rejouable. AUCUNE SUPPRESSION DE DONNÉES.
-- Retour arrière : supabase_fix_classes_delegation_rollback.sql
-- ============================================================================
BEGIN;

-- Policy héritée (nommage court, prédicats `user_school_id()` / `user_role()`).
DROP POLICY IF EXISTS "Admins write classes" ON public.classes;
CREATE POLICY "Admins write classes" ON public.classes FOR ALL TO public
  USING (
    school_id = public.user_school_id()
    AND (
      public.user_role() = 'admin'
      OR public.has_page_permission(school_id, '/app/classes')
    )
  );

-- Policy actuelle (nommage français, sous-requête sur school_users).
DROP POLICY IF EXISTS "classes: écriture par admins de l'école" ON public.classes;
CREATE POLICY "classes: écriture par admins de l'école" ON public.classes FOR ALL TO public
  USING (
    school_id IN (
      SELECT su.school_id FROM public.school_users su
       WHERE su.user_id = auth.uid() AND su.active = true AND su.role = 'admin'
    )
    OR public.has_page_permission(school_id, '/app/classes')
  );

COMMIT;
