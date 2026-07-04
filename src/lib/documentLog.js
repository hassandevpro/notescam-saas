// Historique des générations de relevés — journal local (IndexedDB document_log).
// Aucune table cloud : par poste / navigateur, suffisant pour le suivi direction.
// Cf. décision projet (choix « Local IndexedDB » lors de la refonte du module).

import { documentLogDB } from './db';

export const DOC_TYPES = {
  single: ['PDF individuel', 'Individual PDF', 'PDF individual'],
  class:  ['PDF classe',     'Class PDF',      'PDF de clase'],
  level:  ['PDF niveau',      'Level PDF',      'PDF de nivel'],
  multi:  ['PDF multi-années','Multi-year PDF', 'PDF plurianual'],
  all:    ['PDF établissement','Whole-school PDF','PDF del centro'],
  'certificat-single': ['Certificat — élève',    'Certificate — student', 'Certificado — alumno'],
  'certificat-class':  ['Certificats — classe',  'Certificates — class',  'Certificados — clase'],
  'certificat-level':  ['Certificats — niveau',  'Certificates — level',  'Certificados — nivel'],
  'certificat-all':    ['Certificats — école',   'Certificates — school', 'Certificados — centro'],
};

// Enregistre une opération de génération (succès ou échec).
//   { schoolId, userName, type, scope, count, status:'success'|'error', detail }
export async function recordGeneration({ schoolId, userName, type, scope, count, status, detail }) {
  try {
    await documentLogDB.log({
      school_id: schoolId, user_name: userName || '—',
      type, scope: scope || '', count: count || 0,
      status: status || 'success', detail: detail || '',
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
