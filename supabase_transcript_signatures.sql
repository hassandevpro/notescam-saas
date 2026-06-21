-- Relevés de notes — signatures des 3 autorités + noms.
-- À exécuter dans l'éditeur SQL Supabase. Idempotent.
--
-- Le relevé de notes officiel porte trois signatures :
--   1. Le Chef d'établissement → utilise les colonnes EXISTANTES
--      schools.signature_url (signature) + schools.stamp_url (cachet) + schools.director (nom).
--   2. Le Censeur            → censeur_signature_url + censeur_name (nouveaux).
--   3. Le Surveillant Général → surveillant_signature_url + surveillant_name (nouveaux).
--
-- Les images de signature sont stockées dans le bucket `school-assets`
-- (mêmes règles que logo/tampon/signature existants) ; ces colonnes ne gardent
-- que l'URL publique. Aucune donnée existante n'est modifiée.

ALTER TABLE schools ADD COLUMN IF NOT EXISTS censeur_signature_url     text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS censeur_name              text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS surveillant_signature_url text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS surveillant_name          text;
