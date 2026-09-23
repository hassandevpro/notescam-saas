-- ════════════════════════════════════════════════════════════════════════════
-- DEUX ENSEIGNANTS PRINCIPAUX PAR CLASSE — colonne `classes.teacher2_id`
-- ════════════════════════════════════════════════════════════════════════════
-- Demande de THE GENIUS (23/09/2026) : deux enseignants principaux par salle.
--
-- LE SECOND EST UNE MENTION, PAS UN DROIT. Décision explicite de
-- l'établissement. Aucune policy RLS n'est touchée, et c'est volontaire :
--   • la saisie des notes s'appuie sur `subjects.teacher_id` (policies
--     « grades: insert/update/delete scopé ») — inchangée ;
--   • le périmètre d'un enseignant est dérivé du SEUL `teacher_id`
--     (`teacherSectors`, server/scopeGuard.js) — inchangé ;
--   • les notifications de classe visent le premier — inchangé.
-- Le second n'apparaît donc que sur les documents et dans la fiche classe.
--
-- ADDITIVE ET SANS EFFET SUR L'EXISTANT : colonne NULLABLE, vide pour les
-- classes déjà enregistrées, aucune donnée réécrite, aucun bulletin modifié
-- tant que l'établissement n'a rien saisi.
--
-- MIROIR LAN : server/schema.sql (`teacher2_id TEXT`) + l'ensureColumn de
-- server/db.js. La colonne DOIT exister des deux côtés avant que la version
-- LAN ne parte en école : `sync-push` envoie la ligne classe entière, et une
-- colonne inconnue du Cloud ferait rejeter l'upsert — la modification de la
-- classe serait perdue en silence, avec la purge de l'outbox.
--
-- ON DELETE SET NULL, comme `teacher_id` : un enseignant qui quitte
-- l'établissement libère la mention au lieu d'empêcher sa propre suppression.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS teacher2_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.classes'::regclass
       AND conname  = 'classes_teacher2_id_fkey'
  ) THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_teacher2_id_fkey
      FOREIGN KEY (teacher2_id) REFERENCES public.teachers(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.classes.teacher2_id IS
  'Second enseignant principal de la classe. MENTION sur les documents '
  'uniquement : n''ouvre aucun droit (perimetre et notifications restent '
  'attaches a teacher_id). Ajoutee le 2026-09-23 a la demande de THE GENIUS.';
