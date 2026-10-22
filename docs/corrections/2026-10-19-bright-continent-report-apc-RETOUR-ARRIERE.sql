-- ============================================================================
-- RETOUR ARRIÈRE de report-apc.sql
-- ============================================================================
-- Supprime UNIQUEMENT les lignes `apc_notes` créées par ce report, en excluant
-- nommément les 26 qui existaient avant (relevées et figées le 2026-10-19).
-- Une saisie faite par un enseignant APRÈS le report serait elle aussi
-- supprimée : ce retour arrière doit donc être joué sans attendre, ou revu.
--
-- `grades` n'est pas touchée : le report n'y avait rien changé.
-- ============================================================================

BEGIN;

DELETE FROM public.apc_notes
 WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a'
   AND sequence_id = 's1'
   AND id NOT IN (
    '0fc3f4b8-cd1d-4162-9562-bf54d50fbaa9',
    '1450a471-8a53-4999-8109-b0f68474a381',
    '2081f672-0c2a-4217-8cdc-c6a4ff6027cb',
    '28812bf7-3b1d-43dc-8ff5-53b132290462',
    '2e9a48a3-4a30-4bcd-9f48-ee9185259742',
    '3da642c9-5192-4f95-bc28-63bd0bed4680',
    '3fea8c98-d452-4988-bdf8-019cb13a9902',
    '4e7d736a-80f7-4dfb-b6dc-42920eed3d36',
    '730d0744-784f-4812-a2a4-6154ffee098c',
    '755567ff-43d3-43fc-a5a6-394c1de12eeb',
    '8698dc4a-27dc-4f36-b701-24588fb5bb95',
    '911b4efa-243c-46e3-a9d1-67a384973874',
    '93442aef-3727-4eae-983c-f6090fa171c9',
    '93982fca-41f3-4874-a0f6-2d141ce9721e',
    '93eebfb3-413b-4295-9f42-d5c940aedd29',
    '95dec7c0-adcd-48a3-b186-d1b1607eabf7',
    '9bb3a191-9a85-4173-9229-d9fdc535c069',
    'a82249ef-9c85-4962-bd01-dc83baa19202',
    'b2870eb0-ca63-4efa-9639-b9593cbba242',
    'b337a4fd-8af1-4af9-87c3-07f422c2ff6d',
    'b686b184-2027-426e-b35b-0812578f92ea',
    'caf3b487-3979-4864-b635-2150b1f463b3',
    'd827d6c9-4f8c-4288-b4ad-81469cf18a30',
    'df4be6a4-3ea8-471b-a706-27e81afd53e9',
    'e8e696f2-3ef3-4b9f-be9b-53f39673bfa9',
    'fe649635-8f14-48ba-809d-33a2173ce0d4'   );

-- Après suppression, on doit retrouver exactement les 26 lignes d'origine.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.apc_notes WHERE school_id = 'a8b8fb00-7184-4aec-a39a-3d93a723000a';
  IF n <> 26 THEN
    RAISE EXCEPTION 'Retour arrière refusé : il reste % ligne(s), 26 attendues', n;
  END IF;
END $$;

COMMIT;
