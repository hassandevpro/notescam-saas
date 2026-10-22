-- =====================================================================
-- LES MATIÈRES EN DOUBLE ÉTAIENT DANS LE RÉFÉRENTIEL, PAS DANS LES CLASSES
-- =====================================================================
--
-- SIGNALEMENT DU 2026-10-22 : « ça n'a pas résolu le problème de note qui
-- revient dans d'autres matières », après deux corrections déjà livrées.
--
-- POURQUOI LES DEUX PRÉCÉDENTES NE POUVAIENT PAS Y ARRIVER. L'audit du matin
-- portait sur `subjects` — les matières COCHÉES DANS LA CLASSE — et les a bien
-- ramenées à 0 doublon. Mais l'écran de saisie APC et le bulletin officiel ne
-- lisent pas `subjects` : ils lisent `apc_matieres`, LE RÉFÉRENTIEL. Et c'est
-- là que les doublons étaient restés, intacts.
--
-- MESURE DU 2026-10-22, lecture seule, BRIGHT CONTINENT BILINGUAL SCHOOL
-- (school_id a8b8fb00-7184-4aec-a39a-3d93a723000a), classe de référentiel 3e :
--
--     Langue Turc ......... 3 copies   (6 notes + 6 notes + 0)
--     Expression Orale .... 3 copies   (0 note)
--     Etude de texte ...... 3 copies   (3 notes + 0 + 0)
--     Expresion ecrite .... 3 copies   (1 note + 0 + 0)
--     Chimie .............. 2 copies   (0 note)
--                          ──────────
--                          14 lignes pour 5 matières réelles
--
-- Ce sont EXACTEMENT les deux noms que le responsable avait cités : « Langue
-- Turc » et « Expression Orale ». Trois exemplaires de chacun à la saisie, trois
-- lignes sur le bulletin.
--
-- LA CAUSE, et elle est déjà corrigée dans le code livré. `addMatiereMaisonApc`
-- tirait l'identifiant au HASARD. Un poste dont le cache IndexedDB ignorait les
-- lignes maison les croyait absentes et en recréait une série complète — d'où
-- trois copies pour trois postes. Depuis `4e5011e`, l'identifiant est
-- DÉTERMINISTE (dérivé de l'école et du nom) : la preuve est en base, les deux
-- seules lignes récentes s'appellent `ec_a8b8fb007184_expression_ecrite` et
-- `ec_8f3d1c624a97_*`. Aucune copie nouvelle ne peut plus naître. Ce fichier ne
-- corrige donc QUE l'héritage.
--
-- LES 6 NOTES QUI DISPARAISSENT SONT DES JUMELLES, et c'est vérifié deux fois :
-- une fois à la main avant d'écrire ce fichier, une fois par le fichier lui-même
-- (étape 2, qui REFUSE de continuer si ce n'est pas vrai). Les 6 notes de
-- `462dfb0c` reprennent élève par élève les 6 notes de `1955b0c8` — mêmes
-- valeurs (14 · 15,5 · 16,5 · 17,5 · 17,5 · 17,5), saisies 1 h 13 plus tard :
-- l'enseignant a saisi, a vu une deuxième colonne « Langue Turc », et a ressaisi.
--
-- MATIÈRE GARDÉE, PAR GROUPE : celle qui porte des notes ; à égalité, la PREMIÈRE
-- saisie (c'est l'original, l'autre est la ressaisie) ; sans note, le plus petit
-- identifiant, pour que le choix soit reproductible.
--
--     Chimie ............ 29a621fc   (ffb65b88 supprimée)
--     Etude de texte .... 05b0038b   3 notes   (52857867, c6c7b3e4)
--     Expresion ecrite .. 41eb0b6d   1 note    (5983c648, f00c47d5)
--     Expression Orale .. 10b36928             (6f174cf1, e621d767)
--     Langue Turc ....... 1955b0c8   6 notes   (462dfb0c, 3d898a55)
--
-- CE QUE CELA NE TOUCHE PAS : les matières NATIONALES (`school_id is null`), les
-- autres écoles, `subjects`, et les notes des matières gardées.
--
-- ⚠ PORTÉE DE LA SUPPRESSION. Il n'existe AUCUN déclencheur de pierre tombale
-- sur `apc_matieres`, `apc_competences` ni `apc_notes` (vérifié : seules 53
-- tables en ont, pas celles-ci). Cette suppression ne se propagera donc PAS à un
-- serveur d'école en réseau local. BRIGHT CONTINENT travaille dans le
-- NAVIGATEUR — aucune note poussée par un serveur LAN — donc la correction la
-- concerne entièrement. Pour une école LAN, il faudrait d'abord poser ces
-- déclencheurs : c'est noté comme limite, pas comme fait acquis.
--
-- =====================================================================

begin;

-- ── 1. GARDE-FOU : la base est-elle bien dans l'état mesuré ? ─────────
--
-- Les neuf identifiants sont FIGÉS EN DUR, pas recalculés. Si quelqu'un a touché
-- à ces lignes depuis la mesure, on s'arrête AVANT d'écrire quoi que ce soit.
do $$
declare n int;
begin
  select count(*) into n from apc_matieres where id in (
    'ffb65b88-2e8b-43fe-a613-0a949a3a81a0',
    '52857867-7a54-4efd-b263-eb1eac4f7644',
    'c6c7b3e4-5c18-41eb-939a-f4993ad5c042',
    '5983c648-d67b-41d8-bbff-0ca3d8a0f2f0',
    'f00c47d5-6f41-467d-911c-f9b1f6bb6958',
    '6f174cf1-2e67-4b90-8cc7-a720e6df60c5',
    'e621d767-519a-4cfe-9de0-c4ca831baf48',
    '462dfb0c-4c6a-4358-83a0-1eca38cd1a18',
    '3d898a55-d541-4e44-af0d-142037f43863');
  if n <> 9 then
    raise exception 'ETAT INATTENDU : % matiere(s) en trop trouvee(s) au lieu de 9. Rien n''est modifie.', n;
  end if;

  select count(*) into n from apc_matieres where id in (
    '29a621fc-09a2-4ec0-811e-86978b7c485f',
    '05b0038b-2157-4e37-bac5-5c4c6270cda2',
    '41eb0b6d-a436-4724-ad31-8563697eca05',
    '10b36928-b6b3-4e50-87d5-b46333176499',
    '1955b0c8-0040-4e07-aa0e-7e222d357eeb');
  if n <> 5 then
    raise exception 'ETAT INATTENDU : % matiere(s) gardee(s) trouvee(s) au lieu de 5. Rien n''est modifie.', n;
  end if;
end $$;

-- ── 2. PREUVE : aucune note n'est PERDUE, seulement une copie ────────
--
-- C'est le contrôle qui compte. Chaque note portée par une matière à supprimer
-- doit avoir sa JUMELLE EXACTE — même élève, même séquence, même valeur — sur la
-- matière gardée qui porte le même nom dans la même école. Une seule note sans
-- jumelle, et la transaction entière est annulée : mieux vaut un doublon qui
-- reste qu'une note d'élève qui disparaît.
do $$
declare orphelines int;
begin
  with surplus(id) as (values
    ('ffb65b88-2e8b-43fe-a613-0a949a3a81a0'),('52857867-7a54-4efd-b263-eb1eac4f7644'),
    ('c6c7b3e4-5c18-41eb-939a-f4993ad5c042'),('5983c648-d67b-41d8-bbff-0ca3d8a0f2f0'),
    ('f00c47d5-6f41-467d-911c-f9b1f6bb6958'),('6f174cf1-2e67-4b90-8cc7-a720e6df60c5'),
    ('e621d767-519a-4cfe-9de0-c4ca831baf48'),('462dfb0c-4c6a-4358-83a0-1eca38cd1a18'),
    ('3d898a55-d541-4e44-af0d-142037f43863')),
  gardees(id) as (values
    ('29a621fc-09a2-4ec0-811e-86978b7c485f'),('05b0038b-2157-4e37-bac5-5c4c6270cda2'),
    ('41eb0b6d-a436-4724-ad31-8563697eca05'),('10b36928-b6b3-4e50-87d5-b46333176499'),
    ('1955b0c8-0040-4e07-aa0e-7e222d357eeb')),
  a_perdre as (
    select n.eleve_id, n.sequence_id, n.note, m.nom, m.school_id
    from apc_notes n
    join apc_competences c on c.id = n.competence_id
    join apc_matieres m on m.id = c.matiere_id
    join surplus s on s.id = m.id),
  conservees as (
    select n.eleve_id, n.sequence_id, n.note, m.nom, m.school_id
    from apc_notes n
    join apc_competences c on c.id = n.competence_id
    join apc_matieres m on m.id = c.matiere_id
    join gardees g on g.id = m.id)
  select count(*) into orphelines from a_perdre a
  where not exists (
    select 1 from conservees k
    where k.school_id = a.school_id and k.nom = a.nom
      and k.eleve_id = a.eleve_id and k.sequence_id = a.sequence_id
      and k.note is not distinct from a.note);

  if orphelines <> 0 then
    raise exception '% note(s) SANS jumelle sur la matiere gardee. Transaction annulee, rien n''est supprime.', orphelines;
  end if;
  raise notice 'Preuve OK : chaque note a supprimer a sa jumelle exacte sur la matiere gardee.';
end $$;

-- ── 3. SAUVEGARDE, dans la base ──────────────────────────────────────
--
-- On ne s'appuie pas sur un fichier recopié à la main : les lignes partent dans
-- des tables de sauvegarde, et le retour arrière les relit telles quelles.
-- `apc_classe_matieres`, `apc_competences` et `apc_notes` sont tous en
-- `on delete cascade` sur `apc_matieres` : la suppression de l'étape 4 les
-- emporte SANS les nommer, d'où l'obligation de les sauvegarder ici.
create table if not exists zz_sauv_apc_doublons_20261022_matieres as
  select * from apc_matieres where id in (
    'ffb65b88-2e8b-43fe-a613-0a949a3a81a0','52857867-7a54-4efd-b263-eb1eac4f7644',
    'c6c7b3e4-5c18-41eb-939a-f4993ad5c042','5983c648-d67b-41d8-bbff-0ca3d8a0f2f0',
    'f00c47d5-6f41-467d-911c-f9b1f6bb6958','6f174cf1-2e67-4b90-8cc7-a720e6df60c5',
    'e621d767-519a-4cfe-9de0-c4ca831baf48','462dfb0c-4c6a-4358-83a0-1eca38cd1a18',
    '3d898a55-d541-4e44-af0d-142037f43863');

create table if not exists zz_sauv_apc_doublons_20261022_classe_matieres as
  select cm.* from apc_classe_matieres cm
  join zz_sauv_apc_doublons_20261022_matieres m on m.id = cm.matiere_id;

create table if not exists zz_sauv_apc_doublons_20261022_competences as
  select c.* from apc_competences c
  join zz_sauv_apc_doublons_20261022_matieres m on m.id = c.matiere_id;

create table if not exists zz_sauv_apc_doublons_20261022_notes as
  select n.* from apc_notes n
  join zz_sauv_apc_doublons_20261022_competences c on c.id = n.competence_id;

-- Ce que la sauvegarde doit contenir, mesuré avant écriture : 9 / 9 / 27 / 6.
do $$
declare a int; b int; c int; d int;
begin
  select count(*) into a from zz_sauv_apc_doublons_20261022_matieres;
  select count(*) into b from zz_sauv_apc_doublons_20261022_classe_matieres;
  select count(*) into c from zz_sauv_apc_doublons_20261022_competences;
  select count(*) into d from zz_sauv_apc_doublons_20261022_notes;
  if (a,b,c,d) <> (9,9,27,6) then
    raise exception 'SAUVEGARDE INCOMPLETE : % matieres, % liens, % competences, % notes (attendu 9/9/27/6).', a,b,c,d;
  end if;
  raise notice 'Sauvegarde OK : 9 matieres, 9 liens de classe, 27 competences, 6 notes.';
end $$;

-- ── 4. SUPPRESSION ───────────────────────────────────────────────────
--
-- Une seule instruction : les cascades emportent les liens de classe, les
-- compétences et les notes. C'est voulu — écrire quatre suppressions dans le
-- bon ordre serait quatre occasions de se tromper.
delete from apc_matieres where id in (
  'ffb65b88-2e8b-43fe-a613-0a949a3a81a0','52857867-7a54-4efd-b263-eb1eac4f7644',
  'c6c7b3e4-5c18-41eb-939a-f4993ad5c042','5983c648-d67b-41d8-bbff-0ca3d8a0f2f0',
  'f00c47d5-6f41-467d-911c-f9b1f6bb6958','6f174cf1-2e67-4b90-8cc7-a720e6df60c5',
  'e621d767-519a-4cfe-9de0-c4ca831baf48','462dfb0c-4c6a-4358-83a0-1eca38cd1a18',
  '3d898a55-d541-4e44-af0d-142037f43863');

-- ── 5. CONTRÔLE APRÈS COUP, dans la même transaction ─────────────────
--
-- Plus aucun nom de matière maison ne doit apparaître deux fois dans une école,
-- et les notes des matières gardées doivent être au complet : 6 pour Langue
-- Turc, 3 pour Etude de texte, 1 pour Expresion ecrite.
do $$
declare restants int; turc int; texte int; ecrite int;
begin
  select count(*) into restants from (
    select m.school_id,
           lower(translate(m.nom,'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ','aaaeeeeiioouuucAAAEEEEIIOOUUUC')) clef
    from apc_matieres m where m.school_id is not null
    group by 1,2 having count(*) > 1) x;
  if restants <> 0 then
    raise exception 'IL RESTE % groupe(s) de matieres maison en double. Transaction annulee.', restants;
  end if;

  select count(*) into turc from apc_notes n join apc_competences c on c.id=n.competence_id
    where c.matiere_id = '1955b0c8-0040-4e07-aa0e-7e222d357eeb';
  select count(*) into texte from apc_notes n join apc_competences c on c.id=n.competence_id
    where c.matiere_id = '05b0038b-2157-4e37-bac5-5c4c6270cda2';
  select count(*) into ecrite from apc_notes n join apc_competences c on c.id=n.competence_id
    where c.matiere_id = '41eb0b6d-a436-4724-ad31-8563697eca05';
  if (turc, texte, ecrite) <> (6, 3, 1) then
    raise exception 'NOTES GARDEES ALTEREES : Langue Turc %, Etude de texte %, Expresion ecrite % (attendu 6/3/1).', turc, texte, ecrite;
  end if;
  raise notice 'Controle OK : 0 doublon restant ; notes gardees 6/3/1, intactes.';
end $$;

commit;

-- APRÈS VALIDATION PAR L'ÉCOLE, et pas avant, les quatre tables de sauvegarde
-- peuvent partir. Les garder ne coûte rien ; les supprimer trop tôt coûte le
-- retour arrière :
--   drop table zz_sauv_apc_doublons_20261022_notes;
--   drop table zz_sauv_apc_doublons_20261022_competences;
--   drop table zz_sauv_apc_doublons_20261022_classe_matieres;
--   drop table zz_sauv_apc_doublons_20261022_matieres;
