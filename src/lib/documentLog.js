// Historique des générations de documents — journal local (IndexedDB document_log).
// Aucune table cloud : par poste / navigateur, suffisant pour le suivi direction.
// Cf. décision projet (choix « Local IndexedDB » lors de la refonte du module).

import { documentLogDB } from './db';

export const DOC_TYPES = {
  single: ['Relevé — élève',         'Transcript — student',  'Certificación — alumno'],
  class:  ['Relevés — classe',       'Transcripts — class',   'Certificaciones — clase'],
  level:  ['Relevés — niveau',       'Transcripts — level',   'Certificaciones — nivel'],
  multi:  ['Relevé multi-années',    'Multi-year transcript', 'Certificación plurianual'],
  all:    ['Relevés — établissement','Transcripts — school',  'Certificaciones — centro'],
  'certificat-single': ['Certificat — élève',    'Certificate — student', 'Certificado — alumno'],
  'certificat-class':  ['Certificats — classe',  'Certificates — class',  'Certificados — clase'],
  'certificat-level':  ['Certificats — niveau',  'Certificates — level',  'Certificados — nivel'],
  'certificat-all':    ['Certificats — école',   'Certificates — school', 'Certificados — centro'],
  'pv-class': ['Procès-verbal — classe',         'Minutes — class',  'Acta — clase'],
  'pv-level': ['Procès-verbaux — niveau',        'Minutes — level',  'Actas — nivel'],
  'pv-all':   ['Procès-verbaux — établissement', 'Minutes — school', 'Actas — centro'],
};

// ── Statuts d'une génération ─────────────────────────────────────────────────
// Distinguer l'échec du blocage et du partiel n'est pas cosmétique : « pop-up
// bloqué » se corrige en deux clics par l'utilisateur, « données incomplètes »
// se corrige dans la saisie des notes, et « échec » appelle un vrai diagnostic.
export const GEN_STATUS = {
  SUCCESS: 'success',   // tous les documents demandés sont partis à l'impression
  PARTIAL: 'partial',   // imprimé, mais des documents manquent ou sont incomplets
  BLOCKED: 'blocked',   // fenêtre d'impression refusée par le navigateur
  FAILED:  'failed',    // rien n'a pu être produit
};

const KNOWN_STATUS = new Set(Object.values(GEN_STATUS));

export const GEN_STATUS_LABEL = {
  [GEN_STATUS.SUCCESS]: ['Succès',  'Success', 'Éxito'],
  [GEN_STATUS.PARTIAL]: ['Partiel', 'Partial', 'Parcial'],
  [GEN_STATUS.BLOCKED]: ['Bloqué',  'Blocked', 'Bloqueado'],
  [GEN_STATUS.FAILED]:  ['Échec',   'Failed',  'Fallo'],
};

// Classe visuelle de la pastille de statut (historique).
export const GEN_STATUS_STYLE = {
  [GEN_STATUS.SUCCESS]: 'bg-emerald-100 text-emerald-700',
  [GEN_STATUS.PARTIAL]: 'bg-amber-100 text-amber-700',
  [GEN_STATUS.BLOCKED]: 'bg-orange-100 text-orange-700',
  [GEN_STATUS.FAILED]:  'bg-red-100 text-red-700',
};

// Enregistre une opération de génération.
//   { schoolId, userName, type, scope, count, status, detail }
export async function recordGeneration({ schoolId, userName, type, scope, count, status, detail }) {
  try {
    // Un statut inconnu ne doit jamais se faire passer pour un succès : les
    // valeurs héritées ('error') sont ramenées sur FAILED.
    const st = KNOWN_STATUS.has(status) ? status : (status ? GEN_STATUS.FAILED : GEN_STATUS.SUCCESS);
    await documentLogDB.log({
      school_id: schoolId, user_name: userName || '—',
      type, scope: scope || '', count: count || 0,
      status: st, detail: detail || '',
    });
  } catch (e) {
    // Le journal ne doit jamais bloquer une génération.
    console.warn('documentLog', e);
  }
}

// N dernières entrées, plus récentes d'abord.
export async function recentGenerations(schoolId, limit = 25) {
  try {
    const rows = await documentLogDB.getBySchool(schoolId);
    return (rows || []).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, limit);
  } catch (e) {
    console.warn('documentLog', e);
    return [];
  }
}
