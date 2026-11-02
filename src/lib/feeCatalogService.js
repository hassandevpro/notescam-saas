// Couche CRUD Supabase du catalogue de frais + liste de frais par élève.
// Compatible LAN (localClient). Les paiements passent par le chemin existant
// (schoolStore.addPayment, avec student_fee_item_id) → aucune divergence.
import { supabase } from './supabase';
import { uuid } from './uuid';
import { decisionSuppression } from './feeCatalogEngine';

function nn(v) { return v === '' || v === undefined ? null : v; }

// ── Catalogue (configurable par établissement) ────────────────────────────────
export async function fetchCatalog(schoolId, { yearLabel } = {}) {
  // NB : pas de `.or()` (non supporté par le client LAN/localClient) — on tire
  // tout le catalogue de l'école puis on filtre l'année côté client.
  const { data, error } = await supabase
    .from('fee_catalog').select('*').eq('school_id', schoolId).order('position', { ascending: true });
  if (error) { console.error('fetchCatalog', error); return null; }
  const rows = data || [];
  return yearLabel ? rows.filter((r) => !r.academic_year || r.academic_year === yearLabel) : rows;
}
export async function upsertCatalogItem(row) {
  const payload = {
    id: row.id || uuid(), school_id: row.school_id, name: row.name,
    category: row.category || 'autre', amount: Number(row.amount) || 0,
    academic_year: nn(row.academic_year), level: nn(row.level), class_id: nn(row.class_id),
    mandatory: !!row.mandatory, optional: row.optional !== false,
    payment_type: row.payment_type || 'unique', start_date: nn(row.start_date), end_date: nn(row.end_date),
    active: row.active !== false, position: Number(row.position) || 0, notes: nn(row.notes),
    // Services scolaires (B1). `periodicity` vaut 'unique' par défaut : un frais
    // créé avant cette version, ou par un écran qui ne l'envoie pas, garde
    // exactement le comportement d'avant.
    periodicity: row.periodicity || 'unique',
    // Toujours sérialisé en texte : la colonne est TEXT des DEUX côtés (jsonb
    // aurait divergé du LAN, où SQLite n'a pas ce type). Écrire un tableau brut
    // ici enverrait « [object Object] » au serveur local.
    billing_periods: JSON.stringify(
      Array.isArray(row.billing_periods) ? row.billing_periods
        : (() => { try { const p = JSON.parse(row.billing_periods || '[]'); return Array.isArray(p) ? p : []; } catch { return []; } })(),
    ),
    allow_partial: row.allow_partial !== false,
    allow_exemption: row.allow_exemption !== false,
    // QUOTE-PART : le TAUX que l'école retient par élève et par mois servi, pas
    // un montant. La colonne existait des deux côtés depuis le 31/10, mais
    // aucune écriture ne la transportait : le Registre des services la lisait
    // et personne ne pouvait la poser. NULL = « non renseignée », ce qui est
    // différent de 0 et doit le rester — l'écran affiche alors « non
    // renseignée » au lieu d'un faux zéro.
    quote_part: row.quote_part === '' || row.quote_part == null
      ? null : Number(row.quote_part),
    updated_at: new Date().toISOString(), version: (row.version || 0) + 1,
  };
  const { data, error } = await supabase.from('fee_catalog').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) { console.error('upsertCatalogItem', error); return null; }
  return data;
}
export async function deleteCatalogItem(id) {
  const { error } = await supabase.from('fee_catalog').delete().eq('id', id);
  if (error) { console.error('deleteCatalogItem', error); return false; }
  return true;
}

// ── Frais par élève ───────────────────────────────────────────────────────────
export async function fetchStudentFeeItems(schoolId, { studentId, yearLabel } = {}) {
  let q = supabase.from('student_fee_items').select('*').eq('school_id', schoolId);
  if (studentId) q = q.eq('student_id', studentId);
  if (yearLabel) q = q.eq('academic_year', yearLabel);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) { console.error('fetchStudentFeeItems', error); return null; }
  return data;
}
export async function upsertStudentFeeItem(row) {
  const payload = {
    id: row.id || uuid(), school_id: row.school_id, student_id: row.student_id,
    fee_catalog_id: nn(row.fee_catalog_id), academic_year: nn(row.academic_year),
    name: row.name, category: row.category || 'autre', amount: Number(row.amount) || 0,
    mandatory: !!row.mandatory, payment_type: row.payment_type || 'unique', status: row.status || 'active',
    // DATE D'ENTRÉE DANS LE SERVICE. Elle était passée par les écrans et perdue
    // ici — la colonne existe pourtant partout (`supabase_fee_service_start.sql`,
    // `server/db.js`). Sans elle, `generateSchedule` retombe sur la date
    // d'inscription à l'ÉCOLE : un élève qui prend la cantine en février se
    // voyait facturer depuis septembre, des repas qu'il n'a pas pris.
    started_at: nn(row.started_at),
    updated_at: new Date().toISOString(), version: (row.version || 0) + 1,
  };
  const { data, error } = await supabase.from('student_fee_items').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) { console.error('upsertStudentFeeItem', error); return null; }
  return data;
}
export async function deleteStudentFeeItem(id) {
  const { error } = await supabase.from('student_fee_items').delete().eq('id', id);
  if (error) { console.error('deleteStudentFeeItem', error); return false; }
  return true;
}

// ════════════════════════════════════════════════════════════════════════════
// SUPPRIMER UN SERVICE — et refuser quand de l'argent y est attaché
// ════════════════════════════════════════════════════════════════════════════
//
// ── L'ORDRE N'EST PAS NÉGOCIABLE (cf. D35) ─────────────────────────────────
//
// Les clés étrangères, lues dans le schéma :
//
//   student_fee_items.fee_catalog_id        → ON DELETE SET NULL
//   fee_schedule_items.student_fee_item_id  → ON DELETE CASCADE
//   fee_payments.fee_schedule_item_id       → ON DELETE SET NULL
//   fee_payments.student_fee_item_id        → ON DELETE SET NULL
//
// Supprimer le SERVICE d'abord ne supprime QUE le service : les abonnements
// survivent avec `fee_catalog_id` à NULL, les échéances survivent, et l'argent
// reste. L'écran filtre sur le service, donc ces lignes disparaissent de
// l'affichage tout en continuant de compter en balance : l'école croit avoir
// nettoyé. Mesuré sur copie de base : 9 abonnements et 67 échéances survivants,
// 277 500 toujours présents. D'où : abonnements d'abord, service ensuite.
//
// ── POURQUOI CETTE FONCTION REFUSE, AU LIEU DE FAIRE AU MIEUX ──────────────
//
// `supabase_fee_integrity.sql` retire toute policy DELETE sur `fee_payments` et
// révoque le droit : « AUCUNE policy UPDATE ni DELETE : en RLS, ce qui n'est pas
// autorisé est refusé. » C'est une protection anti-fraude délibérée, pas un
// oubli — un encaissement ne doit pas pouvoir être effacé depuis l'app.
//
// Conséquence : l'app NE PEUT PAS supprimer un versement. Si elle supprimait
// quand même les abonnements, les versements passeraient à `SET NULL` et
// l'argent deviendrait orphelin — le pire des deux mondes : invisible à
// l'écran, toujours dans la balance, et plus rattaché à rien qui l'explique.
//
// Donc : dès qu'un versement existe, on REFUSE, et on dit le montant. La voie
// légale pour annuler une recette est la CONTRE-PASSATION (une insertion de
// ligne négative, que la policy « encaissement caisse » autorise), jamais la
// suppression. L'ordre imposé est le même que partout : contre-passer d'abord.

/**
 * Ce qui pend à un service, avant toute suppression.
 * @returns {{ abonnements: Array, echeances: Array, versements: Array, montant: number }}
 */
export async function dependancesDuService(serviceId) {
  const vide = { abonnements: [], echeances: [], versements: [], montant: 0 };
  if (!serviceId) return vide;

  const { data: abos, error: e1 } = await supabase
    .from('student_fee_items').select('id,student_id,amount')
    .eq('fee_catalog_id', serviceId);
  if (e1) { console.error('dependancesDuService (abonnements)', e1); return null; }
  const aboIds = (abos || []).map((x) => x.id);
  if (!aboIds.length) return vide;

  const { data: eches, error: e2 } = await supabase
    .from('fee_schedule_items').select('id,period_key,amount_due')
    .in('student_fee_item_id', aboIds);
  if (e2) { console.error('dependancesDuService (échéances)', e2); return null; }
  const echeIds = (eches || []).map((x) => x.id);

  // LES DEUX RATTACHEMENTS D'UN VERSEMENT. Il peut viser une période précise
  // (`fee_schedule_item_id`) OU le service sans préciser de mois
  // (`student_fee_item_id`) : `supabase_fee_schedule.sql` dit que les deux cas
  // cohabitent, et c'est voulu. N'en interroger qu'un laisserait de l'argent
  // hors du compte — mesuré au banc : 1 versement vu au lieu de 3.
  const requetes = [
    supabase.from('fee_payments').select('id,amount,receipt_no,reversal_of,date')
      .in('student_fee_item_id', aboIds),
  ];
  if (echeIds.length) {
    requetes.push(supabase.from('fee_payments').select('id,amount,receipt_no,reversal_of,date')
      .in('fee_schedule_item_id', echeIds));
  }
  const reponses = await Promise.all(requetes);
  for (const r of reponses) {
    if (r.error) { console.error('dependancesDuService (versements)', r.error); return null; }
  }
  const vus = new Set();
  const versements = reponses.flatMap((r) => r.data || [])
    .filter((p) => (vus.has(p.id) ? false : vus.add(p.id)));

  return {
    abonnements: abos || [],
    echeances: eches || [],
    versements,
    // La somme ALGÉBRIQUE : une recette déjà contre-passée pèse zéro, et un
    // service soldé à zéro ne doit pas être bloqué par le souvenir d'un
    // encaissement annulé.
    montant: versements.reduce((s, p) => s + (Number(p.amount) || 0), 0),
  };
}

/**
 * Supprime un service, ses abonnements et ses échéances.
 *
 * @param {string} serviceId
 * @param {{ forcerMalgreVersementsSoldes?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, refus?: string, montant?: number,
 *   versements?: number, abonnements?: number, echeances?: number }>}
 */
export async function supprimerService(serviceId, { forcerMalgreVersementsSoldes = false } = {}) {
  if (!serviceId) return { ok: false, refus: 'aucun_service' };
  const dep = await dependancesDuService(serviceId);
  if (!dep) return { ok: false, refus: 'lecture_impossible' };

  // ── LE REFUS ─────────────────────────────────────────────────────────────
  // La règle vit dans le moteur, où elle a un banc (`decisionSuppression`).
  // Ici on ne fait que s'y plier : un refus arrête tout avant le premier DELETE.
  const verdict = decisionSuppression(dep, { forcer: forcerMalgreVersementsSoldes });
  if (!verdict.ok) return verdict;

  // ── L'ORDRE ──────────────────────────────────────────────────────────────
  // 1. Les abonnements. Les échéances partent en CASCADE.
  for (const a of dep.abonnements) {
    const { error } = await supabase.from('student_fee_items').delete().eq('id', a.id);
    if (error) {
      console.error('supprimerService (abonnement)', error);
      return { ok: false, refus: 'abonnement_refuse' };
    }
  }
  // 2. Le service, en DERNIER. Avant, il n'aurait fait qu'orpheliner.
  const { error } = await supabase.from('fee_catalog').delete().eq('id', serviceId);
  if (error) { console.error('supprimerService (service)', error); return { ok: false, refus: 'service_refuse' }; }

  // ── LA VÉRIFICATION ──────────────────────────────────────────────────────
  // Une suppression annoncée n'est pas une suppression prouvée : la RLS peut
  // refuser silencieusement une ligne sans lever d'erreur (le DELETE ne touche
  // alors simplement rien). On relit.
  const apres = await dependancesDuService(serviceId);
  if (apres && (apres.abonnements.length || apres.echeances.length)) {
    return {
      ok: false, refus: 'reste_des_lignes',
      abonnements: apres.abonnements.length, echeances: apres.echeances.length,
    };
  }
  return {
    ok: true,
    abonnements: dep.abonnements.length,
    echeances: dep.echeances.length,
    versements: dep.versements.length,
  };
}
