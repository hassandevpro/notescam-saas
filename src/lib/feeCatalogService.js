// Couche CRUD Supabase du catalogue de frais + liste de frais par élève.
// Compatible LAN (localClient). Les paiements passent par le chemin existant
// (schoolStore.addPayment, avec student_fee_item_id) → aucune divergence.
import { supabase } from './supabase';
import { uuid } from './uuid';

function nn(v) { return v === '' || v === undefined ? null : v; }

// ── Catalogue (configurable par établissement) ────────────────────────────────
export async function fetchCatalog(schoolId, { yearLabel } = {}) {
  let q = supabase.from('fee_catalog').select('*').eq('school_id', schoolId);
  if (yearLabel) q = q.or(`academic_year.eq.${yearLabel},academic_year.is.null`);
  const { data, error } = await q.order('position', { ascending: true });
  if (error) { console.error('fetchCatalog', error); return null; }
  return data;
}
export async function upsertCatalogItem(row) {
  const payload = {
    id: row.id || uuid(), school_id: row.school_id, name: row.name,
    category: row.category || 'autre', amount: Number(row.amount) || 0,
    academic_year: nn(row.academic_year), level: nn(row.level), class_id: nn(row.class_id),
    mandatory: !!row.mandatory, optional: row.optional !== false,
    payment_type: row.payment_type || 'unique', start_date: nn(row.start_date), end_date: nn(row.end_date),
    active: row.active !== false, position: Number(row.position) || 0, notes: nn(row.notes),
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
