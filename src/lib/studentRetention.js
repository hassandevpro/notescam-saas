// ════════════════════════════════════════════════════════════════════════════
// RÉTENTION D'UN ÉLÈVE — supprimer ou archiver ?
// ════════════════════════════════════════════════════════════════════════════
// Moteur PUR (aucun store, aucun réseau, aucune date « maintenant »).
//
// Pourquoi ce moteur existe : supprimer un élève effaçait ses versements par
// cascade. C'était le contournement qui restait ouvert après avoir rendu les
// versements immuables — au lieu d'effacer la ligne d'argent, on effaçait
// l'élève, et l'argent partait avec lui.
//
// RÈGLE : dès qu'un élève porte la MOINDRE écriture de caisse, il ne se supprime
// plus, il s'archive. On raisonne sur le NOMBRE D'ÉCRITURES, jamais sur le solde :
// un versement intégralement contre-passé fait une somme nulle mais reste une
// pièce comptable, et un exercice se justifie sur ses écritures.

// Écritures de caisse portées par un élève (toutes années confondues).
export function paymentTrail(studentId, payments = []) {
  const rows = (payments || []).filter((p) => p && p.student_id === studentId);
  const reversals = rows.filter((p) => p.reversal_of).length;
  return {
    entries:   rows.length,
    reversals,
    net:       rows.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    years:     [...new Set(rows.map((p) => p.academic_year).filter(Boolean))].sort(),
  };
}

export const RETENTION = Object.freeze({
  DELETE:  'delete',   // aucune trace d'argent : suppression classique (corbeille)
  ARCHIVE: 'archive',  // écritures de caisse présentes : archivage obligatoire
});

/**
 * Décide du sort d'un élève que l'on veut retirer de l'établissement.
 * @param {string} studentId
 * @param {Array}  payments  toutes les lignes fee_payments connues
 * @returns {{ action: string, trail: object, blocking: boolean }}
 */
export function retentionDecision(studentId, payments = []) {
  const trail = paymentTrail(studentId, payments);
  return {
    action:   trail.entries > 0 ? RETENTION.ARCHIVE : RETENTION.DELETE,
    trail,
    blocking: trail.entries > 0,
  };
}

// Le backend a-t-il refusé la SUPPRESSION parce que l'élève porte des écritures ?
//
// À distinguer d'une panne réseau : un refus métier ne s'améliore pas en le
// rejouant. Le remettre dans la file hors-ligne le ferait échouer indéfiniment et
// laisserait l'élève dans un entre-deux — absent de l'écran, présent au serveur,
// de retour au prochain chargement. Reconnu ici pour basculer sur l'archivage.
//
// La reconnaissance porte sur le SENS du refus, pas sur son libellé : le serveur
// LAN et le cloud ne le formulent pas du tout de la même façon, et les DEUX
// doivent être compris.
//
//   LAN   (server/query.js, guardStudentDeletion) — une phrase écrite pour un
//         humain : « Élève non supprimable : N écriture(s) de caisse… ».
//   CLOUD — aucune phrase. La contrainte fee_payments_student_id_fkey est en
//         ON DELETE RESTRICT (vérifié en base le 27/08/2026) et PostgreSQL répond
//         « violates foreign key constraint », code 23503. Ne reconnaître que la
//         formulation du LAN laissait le cloud dans l'entre-deux : refus non
//         compris -> remis dans la file hors-ligne -> rejoué en vain à chaque
//         chargement -> l'élève revenait dans la liste. C'est le symptôme
//         rapporté en production le 27/08/2026.
//
// grades et student_fees, eux, sont en CASCADE : ils ne produisent jamais ce
// refus. Seule la caisse retient l'élève — ce qui est exactement la règle voulue.
export function isRetentionRefusal(error) {
  if (!error) return false;
  // Le code SQL de violation de clé étrangère ne dépend d'aucune langue.
  const code = String(error.code || '');
  const txt = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if ((code === '23503' || txt.includes('foreign key')) && txt.includes('fee_payments')) return true;
  return txt.includes('non supprimable')
    || txt.includes('ecriture(s) de caisse')
    || txt.includes('ecritures de caisse')
    || (txt.includes('archivez') && txt.includes('eleve'));
}

// Un élève archivé sort des listes actives (classes, notes, bulletins) mais
// conserve TOUTES ses données. `archived_at` est la seule marque qui compte.
export function isArchived(student) {
  return !!(student && student.archived_at);
}

export function splitArchived(students = []) {
  const active = [], archived = [];
  for (const s of students || []) (isArchived(s) ? archived : active).push(s);
  return { active, archived };
}

// Champs posés à l'archivage. Fonction pure : l'horodatage et l'acteur sont
// FOURNIS par l'appelant (testabilité, et cohérence avec le reste du socle).
export function archiveFields({ at, actorId = null, actorName = null, reason = null }) {
  return {
    archived_at:      at,
    archived_by:      actorId,
    archived_by_name: actorName,
    archive_reason:   (reason || '').trim() || null,
  };
}

export function unarchiveFields() {
  return { archived_at: null, archived_by: null, archived_by_name: null, archive_reason: null };
}
