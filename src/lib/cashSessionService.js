// Accès aux ARRÊTÉS DE CAISSE (table cash_sessions). Cloud ou LAN via le même
// client (alias Vite). Aucune règle métier ici : tout le calcul appartient à
// cashSessionEngine (pur, testé). Ce module ne fait que lire/écrire.
import { supabase } from './supabase';
import { fetchAllRows } from './pagination';

const TABLE = 'cash_sessions';

export async function fetchCashSessions(schoolId, { from = null, to = null, year = null } = {}) {
  let q = supabase.from(TABLE).select('*').eq('school_id', schoolId);
  if (year) q = q.eq('academic_year', year);
  if (from) q = q.gte('date', from);
  if (to)   q = q.lte('date', to);
  const { data, error } = await q.order('date', { ascending: false });
  if (error) { console.error('fetchCashSessions', error); return []; }
  return data || [];
}

export async function upsertCashSession(session) {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(session, { onConflict: 'id' })
    .select()
    .single();
  if (error) { console.error('upsertCashSession', error); return null; }
  return data;
}

// Numéros de reçus émis sur une période — sert à détecter les TROUS dans la
// série (une recette encaissée puis escamotée). On ne lit que la colonne utile :
// sur une grosse école, tirer toutes les lignes de paiement pour compter des
// numéros serait absurde.
export async function fetchReceiptNumbers(schoolId, { year = null, from = null, to = null } = {}) {
  // PAGINE — et ici la troncature ne faisait pas qu amputer un total : elle
  // INVENTAIT des trous. Cette fonction sert a reperer les numeros manquants dans la
  // serie des recus, c est-a-dire une recette encaissee puis escamotee. Au-dela de
  // mille paiements — une ecole de 250 eleves a quatre echeances les depasse — tous
  // les recus suivants paraissaient absents. L outil qui doit detecter un detournement
  // en signalait donc des centaines qui n existaient pas.
  const faireQ = () => {
    let q = supabase.from('fee_payments').select('receipt_no, date').eq('school_id', schoolId);
    if (year) q = q.eq('academic_year', year);
    if (from) q = q.gte('date', from);
    if (to)   q = q.lte('date', to);
    return q.order('id', { ascending: true });
  };
  const data = await fetchAllRows(faireQ, 'fetchReceiptNumbers');
  // `null` = la lecture a echoue. Rendre [] ferait croire a une serie VIDE, donc sans
  // trou : le rapport dirait « tout va bien » alors qu il n a rien pu lire.
  if (data === null) return [];
  return data.map((r) => r.receipt_no).filter((n) => n != null);
}
