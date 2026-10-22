-- =====================================================================
-- RÉAFFICHER « COMMUNIQUER EN FRANÇAIS » CHEZ BRIGHT CONTINENT
-- =====================================================================
--
-- DEMANDE DU RESPONSABLE, 2026-10-22 : « corrige cette erreur, le français
-- doit figurer parmi les notes ».
--
-- CE N'EST PAS UN DÉFAUT DU LOGICIEL, et c'est important pour la suite :
-- l'écran affichait
--
--     « Masquée(s) par l'école alors qu'une matière de cette classe les
--       couvre : 1A — Communicate in French (18). »
--
-- et ce message était EXACT. Une ligne de masque existe, et le message
-- indiquait déjà comment l'annuler (bouton « Modifier les compétences »).
--
-- MESURÉ EN LECTURE SEULE AVANT D'ÉCRIRE :
--
--   table ................. prim_competences_masques
--   school_id ............. a8b8fb00-7184-4aec-a39a-3d93a723000a  (BRIGHT CONTINENT)
--   competence_id ......... 1a
--   masque_le ............. 2026-10-08 10:46:28.95889+00
--   compétence ............ code 1A, « Communiquer en français », domaine
--                           « langues », NATIONALE (school_id NULL), active
--   notes de cette école .. 18   ← les « (18) » du message
--   notes toutes écoles ... 203  (aucune autre école ne la masque)
--
-- C'est l'UNIQUE ligne de cette table dans toute la base : le masquage a donc
-- été un geste unique et délibéré, le 8 octobre, pas un effet de bord.
--
-- CE QUE LA SUPPRESSION FAIT. Le masque n'a jamais rien effacé : les 18 notes
-- sont restées en base, simplement invisibles à la saisie et absentes du
-- bulletin. Les retirer du masque les REND VISIBLES — elles ne sont pas
-- recréées, elles n'ont jamais disparu.
--
-- ⚠ CONSÉQUENCE À DIRE À L'ÉCOLE : les bulletins du primaire déjà imprimés
-- depuis le 8 octobre ne portaient PAS le français. Ceux qui seront imprimés
-- après cette correction le porteront, avec les 18 notes. Deux bulletins du
-- même élève peuvent donc différer — ce n'est pas une anomalie, c'est le
-- masque qui est levé.
--
-- =====================================================================

begin;

-- ── 1. GARDE-FOU : la base est-elle dans l'état mesuré ? ─────────────
do $$
declare n int;
begin
  select count(*) into n from prim_competences_masques
   where school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a' and competence_id = '1a';
  if n <> 1 then
    raise exception 'ETAT INATTENDU : % ligne(s) de masque au lieu de 1. Rien n''est modifie.', n;
  end if;
end $$;

-- ── 2. SUPPRESSION ───────────────────────────────────────────────────
delete from prim_competences_masques
 where school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
   and competence_id = '1a';

-- ── 3. CONTRÔLE APRÈS COUP, dans la même transaction ─────────────────
--
-- Le masque doit avoir disparu, ET les 18 notes doivent être intactes : une
-- correction d'affichage qui toucherait une note serait une faute.
do $$
declare reste int; notes int;
begin
  select count(*) into reste from prim_competences_masques
   where school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a' and competence_id = '1a';
  if reste <> 0 then
    raise exception 'LE MASQUE EST TOUJOURS LA (% ligne). Transaction annulee.', reste;
  end if;

  select count(*) into notes from prim_notes n join students e on e.id = n.eleve_id
   where n.competence_id = '1a' and e.school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';
  if notes <> 18 then
    raise exception 'NOTES ALTEREES : % au lieu de 18. Transaction annulee.', notes;
  end if;
  raise notice 'Controle OK : masque retire, 18 notes de francais intactes et desormais visibles.';
end $$;

commit;

-- ── RETOUR ARRIÈRE ───────────────────────────────────────────────────
-- Remet la compétence masquée, exactement comme elle l'était :
--
--   insert into prim_competences_masques (school_id, competence_id, masque_le)
--   values ('a8b8fb00-7184-4aec-a39a-3d93a723000a', '1a',
--           '2026-10-08 10:46:28.95889+00');
--
-- L'école peut aussi le refaire elle-même, sans SQL : écran de saisie du
-- primaire → bouton « Modifier les compétences ».
