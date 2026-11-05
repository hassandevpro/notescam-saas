// Le raccourci Supabase par-dessus le pagineur PUR (core/pagination.js), qui porte
// la mesure et le raisonnement. Separe parce que `supabase` tire tout l environnement
// Vite : un banc Node ne peut pas l importer, et ce pagineur DOIT etre testable.

import { supabase } from './supabase';
import { fetchAllRows } from '../core/pagination';

export { fetchAllRows };

// Raccourci pour le cas le plus courant : TOUTES les lignes d une table pour une ecole,
// dans un ordre deterministe. L ordre sur une cle unique est obligatoire : sans lui, la
// pagination saute ou duplique des lignes aux frontieres de page.
export function fetchToutesLesLignes(table, schoolId, label, { ordre = "id" } = {}) {
  return fetchAllRows(
    () => supabase.from(table).select('*').eq('school_id', schoolId).order(ordre),
    label || `fetch:${table}`,
  );
}
