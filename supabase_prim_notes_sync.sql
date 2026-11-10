-- ════════════════════════════════════════════════════════════════════════════
-- NOTES DU PRIMAIRE (prim_notes) : LES FAIRE VOYAGER ENTRE L'ÉCOLE ET LE CLOUD
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. Jusqu'ici `prim_notes` figurait dans SYNCED_TABLES côté école mais PAS dans la
-- liste `ALLOWED` de sync-push : la fonction jetait ces lignes sans erreur ni refus. Les
-- notes saisies à l'école (THE GENIUS : 2 505 notes, 237 élèves) ne sont donc jamais
-- arrivées au Cloud.
--
-- CE FICHIER NE FAIT QUE TROIS CHOSES, toutes ADDITIVES et IDEMPOTENTES :
--   1. rendre visibles à la descente les notes DÉJÀ présentes au Cloud (sync-pull ignore
--      toute ligne dont `updated_at` est NULL) ;
--   2. créer les 4 compétences propres à THE GENIUS qui existent à l'école et pas au
--      Cloud (sans elles, 119 notes seraient refusées par la clé étrangère) ;
--   3. un index pour que le keyset de sync-pull (updated_at, id) reste rapide.
--
-- RIEN n'est supprimé, aucune clé d'unicité n'est modifiée (prim_notes_uniq =
-- eleve_id, competence_id, critere_id, ua reste telle quelle : les autres écoles ne sont
-- pas touchées). Les colonnes ua, points_max et statut existent déjà (vérifié le
-- 2026-11-10 sur le projet de production).
--
-- ORDRE : exécuter CE FICHIER, puis déployer sync-push et sync-pull, PUIS distribuer le
-- paquet LAN. Dans l'autre sens, les notes de l'école seraient mises de côté avec le motif
-- « competence_absente_du_cloud ».
--
-- RETOUR ARRIÈRE : (1) n'a pas de retour (c'est un horodatage manquant), (2) :
--   DELETE FROM public.prim_competences WHERE id IN (<les 4 ids ci-dessous>);
--   (seulement si aucune note ne les référence encore).

-- 1) Les notes déjà au Cloud doivent pouvoir descendre.
UPDATE public.prim_notes
   SET updated_at = COALESCE(updated_at, date_saisie, now())
 WHERE updated_at IS NULL;

-- 2) Les 4 compétences propres à THE GENIUS absentes du Cloud (définition relevée sur le
--    serveur de l'école le 2026-11-10).
INSERT INTO public.prim_competences (id, country_code, code, intitule, domaine, coefficient, ordre, actif, school_id)
VALUES
  ('ec_6b68407b3d2e_english_2', 'CM', 'E2', 'ENGLISH 2', NULL, 1, 480, true, '6b68407b-3d2e-426b-81ff-c4e68e66120a'),
  ('ec_6b68407b3d2e_practice_social_values', 'CM', 'PSV', 'Practice social values', NULL, 1, 380, true, '6b68407b-3d2e-426b-81ff-c4e68e66120a'),
  ('ec_6b68407b3d2e_pratice_artistic_activities', 'CM', 'PAA', 'Pratice artistic activities', NULL, 1, 390, true, '6b68407b-3d2e-426b-81ff-c4e68e66120a'),
  ('ec_6b68407b3d2e_pratiquer_les_activites_physiques_et_spo', 'CM', 'PLA', 'Pratiquer les activités physiques et sportives pour les apprenants aptes', NULL, 1, 450, true, '6b68407b-3d2e-426b-81ff-c4e68e66120a')
ON CONFLICT (id) DO NOTHING;

-- 3) Keyset de sync-pull.
CREATE INDEX IF NOT EXISTS prim_notes_sync_keyset ON public.prim_notes (school_id, updated_at, id);

-- ── Vérification (doit renvoyer : 0 note sans updated_at, 4 compétences, 1 index) ──
SELECT (SELECT count(*) FROM public.prim_notes WHERE updated_at IS NULL) AS notes_sans_updated_at,
       (SELECT count(*) FROM public.prim_competences
         WHERE id IN ('ec_6b68407b3d2e_english_2','ec_6b68407b3d2e_practice_social_values',
                      'ec_6b68407b3d2e_pratice_artistic_activities',
                      'ec_6b68407b3d2e_pratiquer_les_activites_physiques_et_spo')) AS competences_presentes,
       (SELECT count(*) FROM pg_indexes WHERE indexname = 'prim_notes_sync_keyset') AS index_present;
