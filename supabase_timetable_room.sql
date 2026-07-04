-- ════════════════════════════════════════════════════════════════════════════
-- EMPLOI DU TEMPS — colonne « salle » (room)
-- ════════════════════════════════════════════════════════════════════════════
-- Ajoute la salle à chaque créneau pour permettre la « Vue Salle » du
-- planificateur et la détection des conflits de salle (deux cours dans la même
-- salle au même moment). Texte libre : les écoles nomment leurs salles
-- librement (« Salle 12 », « Labo SVT », « Amphi A »…).
--
-- À exécuter une seule fois dans l'éditeur SQL Supabase.
-- Le LAN (SQLite) se migre seul au démarrage via ensureColumn() dans server/db.js.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.timetable_slots
  ADD COLUMN IF NOT EXISTS room text;

COMMENT ON COLUMN public.timetable_slots.room IS
  'Salle où se déroule le cours (texte libre). Sert à la Vue Salle et à la détection des conflits de salle.';
