// ════════════════════════════════════════════════════════════════════════════
// ÉCHÉANCES D'UN FRAIS PÉRIODIQUE — couche I/O
// ════════════════════════════════════════════════════════════════════════════
// Les RÈGLES (quelles périodes, à partir de quand, quel statut) vivent dans
// feeScheduleEngine.js, pur et testé sous Node nu. Ici, uniquement la lecture et
// l'écriture. Même séparation que notificationEngine / notificationService.
//
// ── CE QUI REND CE SERVICE SÛR ──────────────────────────────────────────────
// La génération est IDEMPOTENTE, et pas seulement « prudente ». L'unicité
// (student_fee_item_id, period_key) est posée en base : deux postes qui ouvrent
// la même fiche au même instant ne peuvent pas facturer novembre deux fois.
// Un contrôle applicatif « je lis puis j'écris » laisserait, lui, une fenêtre
// entre les deux — et une dette doublée se remarque au guichet, pas dans les logs.
//
// La génération ne TOUCHE JAMAIS une échéance existante : on n'envoie que les
// périodes absentes. Un montant corrigé à la main, une exemption accordée, un
// abandon acté survivent donc à toute régénération. C'est la règle la plus
// importante de ce fichier : l'école a le dernier mot sur ce qu'elle a décidé.
import { supabase } from './supabase';
import { uuid } from './uuid';
import { echeancierPour, statutEcheance, paidForSchedule, peutChangerStatut } from './feeScheduleEngine';
import { logAction } from './historyService';
import { emitFinanceEvent } from '../domains/finance/emit';
import { AGGREGATE, EVT } from '../domains/finance/events';

// Échéances déjà enregistrées pour un élève (toutes ses souscriptions).
export async function fetchSchedule(schoolId, { studentId, yearLabel } = {}) {
  let q = supabase.from('fee_schedule_items').select('*').eq('school_id', schoolId);
  if (studentId) q = q.eq('student_id', studentId);
  if (yearLabel) q = q.eq('academic_year', yearLabel);
  const { data, error } = await q;
  if (error) { console.error('fetchSchedule', error); return null; }
  // Tri côté client : `period_key` est construite pour être triable comme du
  // texte ('2025-09' < '2025-10'), ce qui évite un ORDER BY que le client LAN
  // n'applique pas toujours de la même façon.
  return (data || []).sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
}

/**
 * Crée les échéances MANQUANTES d'un frais attribué à un élève.
 *
 * @param {object} opts
 * @param {string} opts.schoolId
 * @param {object} opts.catalogItem      l'article du catalogue (periodicity, billing_periods, amount)
 * @param {object} opts.studentFeeItem   le frais ATTRIBUÉ (id, student_id, amount, academic_year)
 * @param {string} [opts.enrolledAt]     date d'inscription À L'ÉCOLE — REPLI seulement.
 *                                       La date qui fait foi est `studentFeeItem.started_at`,
 *                                       celle de la souscription À CE SERVICE.
 * @param {string} [opts.langue]         fige le libellé de période à la génération
 * @returns {number} nombre d'échéances créées (0 si tout existait déjà)
 */
export async function generateSchedule({ schoolId, catalogItem, studentFeeItem, enrolledAt, langue = 'fr' }) {
  if (!schoolId || !catalogItem || !studentFeeItem?.id) return 0;
  // Un frais non périodique n'a pas d'échéancier : il reste ce qu'il a toujours
  // été, une ligne unique réglée par le chemin de paiement existant.
  if (!catalogItem.periodicity || catalogItem.periodicity === 'unique') return 0;

  const annee = studentFeeItem.academic_year || catalogItem.academic_year;
  const attendues = echeancierPour(catalogItem, {
    academicYear: annee,
    // La date d'entrée dans CE SERVICE prime sur celle de l'école. Un élève
    // présent depuis septembre qui prend la cantine en février ne doit pas
    // septembre : il n’a pas pris ces repas. `enrolledAt` ne sert que de repli,
    // ce qui laisse les souscriptions antérieures à B6 se comporter comme avant.
    startedAt: studentFeeItem.started_at || null,
    enrolledAt,
    // Le montant de la SOUSCRIPTION prime : c'est un instantané pris à
    // l'attribution, et un tarif modifié en cours d'année ne doit pas réécrire
    // ce que l'élève doit déjà.
    amount: studentFeeItem.amount ?? catalogItem.amount,
    langue,
  });
  if (!attendues.length) return 0;

  const { data: existantes, error } = await supabase
    .from('fee_schedule_items').select('period_key')
    .eq('student_fee_item_id', studentFeeItem.id);
  if (error) { console.error('generateSchedule (lecture)', error); return 0; }
  const deja = new Set((existantes || []).map((r) => r.period_key));

  const manquantes = attendues.filter((e) => !deja.has(e.period_key));
  if (!manquantes.length) return 0;

  const maintenant = new Date().toISOString();
  const lignes = manquantes.map((e) => ({
    id: uuid(),
    school_id: schoolId,
    student_id: studentFeeItem.student_id,
    student_fee_item_id: studentFeeItem.id,
    academic_year: annee || null,
    period_key: e.period_key,
    period_label: e.period_label,
    amount_due: e.amount_due,
    status: 'due',
    created_at: maintenant, updated_at: maintenant, version: 1,
  }));

  // `onConflict` sur la contrainte d'unicité, et non sur `id` : si un autre
  // poste vient de créer la même période, sa ligne est conservée telle quelle
  // au lieu d'échouer bruyamment ou d'être dupliquée.
  const { error: errIns } = await supabase
    .from('fee_schedule_items').upsert(lignes, { onConflict: 'student_fee_item_id,period_key' });
  if (errIns) { console.error('generateSchedule (écriture)', errIns); return 0; }
  return lignes.length;
}

// Somme versée sur une échéance précise. Même principe que `paidForItem` : le
// payé se CALCULE, il ne se stocke pas. La fonction vit désormais dans le
// moteur — elle est pure, et c'est là que les tests peuvent l'atteindre sans
// traîner le client de base de données derrière eux. Réexportée ici pour que
// les appelants existants n'aient rien à changer.
export { paidForSchedule };

// Vue d'un échéancier prêt à afficher : chaque ligne reçoit son versé et son
// statut effectif (le statut manuel de l'école l'emporte, cf. moteur).
export function scheduleView(lignes = [], payments = []) {
  return lignes.map((l) => {
    const paye = paidForSchedule(l.id, payments);
    return {
      ...l,
      amount_paid: paye,
      balance: Math.max(0, (Number(l.amount_due) || 0) - paye),
      effective_status: statutEcheance({
        amountDue: l.amount_due, amountPaid: paye, manualStatus: l.status,
      }),
    };
  });
}

// ── POSER UNE DÉCISION SUR UNE PÉRIODE ─────────────────────────────────────
// Exempter, acter un abandon, déclarer une période non applicable — ou revenir
// au suivi automatique avec 'due'. Ne touche JAMAIS au montant : une exemption
// ne réécrit pas l'historique de ce qui était dû, elle le fait sortir du dû.
//
// TROIS GARDES, dans cet ordre :
//   1. la recevabilité (moteur pur) — une période déjà payée ne se requalifie
//      pas, un frais qui interdit l’exemption la refuse, et « payé » ne se pose
//      pas à la main ;
//   2. le périmètre ÉCOLE est réimposé dans le WHERE. La RLS du Cloud le fait
//      déjà, mais un `eq(id)` seul ferait reposer tout le cloisonnement sur
//      elle ; en LAN c’est scopeGuard qui tranche, et deux verrous valent mieux
//      qu’un sur une écriture qui efface une créance ;
//   3. la TRACE, best-effort et hors du chemin d’écriture, dans les deux
//      journaux — comme le fait déjà tout encaissement. Sans elle, faire sortir
//      une dette du dû serait le seul geste financier anonyme de l’application.
//
// @returns {{ok: boolean, raison: string|null}}
export async function setScheduleStatus({
  ligne, statut, schoolId, allowExemption = true, payments = [],
} = {}) {
  if (!ligne?.id || !schoolId) return { ok: false, raison: 'parametres_manquants' };

  const verse = paidForSchedule(ligne.id, payments);
  const verdict = peutChangerStatut({ nouveauStatut: statut, verse, allowExemption });
  if (!verdict.ok) return verdict;

  const ancien = ligne.status || null;
  if (ancien === statut) return { ok: true, raison: null };   // rien à écrire, rien à tracer

  const { error } = await supabase
    .from('fee_schedule_items')
    .update({ status: statut, updated_at: new Date().toISOString() })
    .eq('id', ligne.id)
    .eq('school_id', schoolId);
  if (error) { console.error('setScheduleStatus', error); return { ok: false, raison: 'ecriture_refusee' }; }

  const details = {
    student_id: ligne.student_id || null,
    student_fee_item_id: ligne.student_fee_item_id || null,
    academic_year: ligne.academic_year || null,
    period_key: ligne.period_key,
    amount_due: Number(ligne.amount_due) || 0,
    from: ancien,
    to: statut,
  };
  logAction({ action: 'update', table: 'fee_schedule_items', target_id: ligne.id, details });
  emitFinanceEvent({
    aggregateType: AGGREGATE.FEE_SCHEDULE,
    aggregateId: ligne.id,
    correlationId: ligne.student_fee_item_id || ligne.id,
    schoolId,
    eventType: EVT.FEE_SCHEDULE_STATUS_CHANGED,
    payload: details,
  });

  return { ok: true, raison: null };
}
