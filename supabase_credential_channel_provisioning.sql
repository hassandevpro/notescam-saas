-- supabase_credential_channel_provisioning.sql
-- Complète supabase_credential_channel.sql pour que le sens Cloud → Local
-- couvre AUSSI les comptes créés/réinitialisés par un administrateur.
--
-- Constat corrigé ici : la politique d'origine n'autorisait que
--   cloud_user_id = auth.uid()
-- c'est-à-dire un membre déposant SON PROPRE changement (parcours « mot de passe
-- oublié »). Un administrateur qui crée un compte du personnel, ou qui
-- réinitialise le mot de passe d'un membre, n'est pas la cible : son dépôt était
-- rejeté par RLS, et le serveur LAN de l'école ne recevait donc jamais ces
-- identifiants — aucun de ces comptes ne pouvait ouvrir de session locale.
--
-- À EXÉCUTER dans l'éditeur SQL Supabase (idempotent).
--
-- TOUT est dans UNE transaction : l'étape 3 doit supprimer la fonction avant de
-- la recréer (PostgreSQL refuse un CREATE OR REPLACE qui change le type de
-- retour). Sans transaction, un échec entre les deux laisserait l'école SANS
-- fonction de réinitialisation de mot de passe. Ici, soit tout passe, soit rien.
-- ============================================================================
BEGIN;

-- 1) L'ADMIN d'une école peut déposer une credential pour un membre DE SON ÉCOLE.
--    Double cloisonnement : l'appelant doit être admin actif de credential_outbox
--    .school_id, ET la cible doit être membre de cette même école. Aucune écriture
--    possible vers une autre école, ni vers un utilisateur étranger à l'école.
drop policy if exists "admins insert member credential change" on credential_outbox;
create policy "admins insert member credential change"
  on credential_outbox for insert to authenticated
  with check (
    exists (
      select 1 from school_users adm
      where adm.school_id = credential_outbox.school_id
        and adm.user_id = auth.uid()
        and adm.role = 'admin'
        and adm.active = true
    )
    and exists (
      select 1 from school_users cible
      where cible.school_id = credential_outbox.school_id
        and cible.user_id = credential_outbox.cloud_user_id
    )
  );

-- 2) L'admin doit aussi pouvoir LIRE la clé publique du serveur de son école
--    pour chiffrer : la politique existante le permet déjà (membre de l'école).
--    Rien à ajouter.

-- 3) admin_set_staff_password renvoie désormais l'E-MAIL de la cible.
--    Pourquoi : le serveur LAN a besoin de l'e-mail pour CRÉER le compte local
--    (identifiant de connexion, NOT NULL). auth.users n'étant pas lisible par un
--    client, seule cette fonction SECURITY DEFINER peut le fournir à l'appelant.
--    Le corps métier est INCHANGÉ (mêmes contrôles, même écriture bcrypt) ;
--    seul le type de retour évolue, d'où le DROP préalable (PostgreSQL refuse un
--    CREATE OR REPLACE qui change le type de retour).
drop function if exists public.admin_set_staff_password(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_set_staff_password(
  p_school_user_id uuid,
  p_new_password   text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_school uuid;
  v_user   uuid;
  v_role   text;
  v_email  text;
BEGIN
  -- L'appelant doit être admin actif d'une école.
  SELECT school_id INTO v_school
  FROM public.school_users
  WHERE user_id = auth.uid() AND role = 'admin' AND active = true
  LIMIT 1;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  -- La cible doit appartenir à CETTE école et être un compte de direction.
  SELECT user_id, role INTO v_user, v_role
  FROM public.school_users
  WHERE id = p_school_user_id AND school_id = v_school;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Compte introuvable'; END IF;
  IF v_role NOT IN ('censeur', 'surveillant') THEN RAISE EXCEPTION 'Rôle non autorisé'; END IF;

  IF length(coalesce(p_new_password, '')) < 8 THEN
    RAISE EXCEPTION 'Mot de passe trop court (8 caractères min.)';
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   WHERE id = v_user
   RETURNING email INTO v_email;

  RETURN v_email;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_set_staff_password(uuid, text) TO authenticated;

COMMIT;
