// JOURNAL D'AUDIT DES RÉGLAGES DE TABLEAU D'HONNEUR (édition LAN).
//
// Le seuil décide QUI figure au tableau d'honneur : le changer doit laisser une trace
// (qui, quand, de quoi à quoi). Pendant LAN du déclencheur Cloud
// (supabase_tableaux_honneur.sql). La garde d'écriture (admin seulement) reste
// guardSchoolWrite ; ici on ne fait que consigner, dans la MÊME transaction que l'écriture.
import { randomUUID } from 'node:crypto';
import { db } from './db.js';

export const CHAMPS_AUDITES = ['honor_min_avg', 'honor_options'];

// Avant l'écriture : relève les valeurs actuelles des champs audités que l'op modifie.
// Renvoie null si l'op ne touche aucun de ces champs.
export function auditHonneurAvant(op, ctx) {
  if (op?.table !== 'schools' || !['update', 'upsert'].includes(op.action)) return null;
  const rows = Array.isArray(op.values) ? op.values : [op.values];
  const v = rows[0] || {};
  // Validation SERVEUR du seuil (le front la fait aussi, mais une requête forgée passerait).
  if (Object.prototype.hasOwnProperty.call(v, 'honor_min_avg') && v.honor_min_avg !== null) {
    const n = Number(v.honor_min_avg);
    if (!Number.isFinite(n) || n < 0 || n > 20) throw new Error('Moyenne minimale du tableau d’honneur : une valeur de 0 à 20 est attendue.');
  }
  const champs = CHAMPS_AUDITES.filter((c) => Object.prototype.hasOwnProperty.call(v, c));
  if (!champs.length) return null;
  const idFiltre = (op.filters || []).find((f) => f.col === 'id' && f.op === 'eq')?.val;
  const schoolId = idFiltre || v.id;
  if (!schoolId) return null;
  let avant = null;
  try { avant = db.prepare(`SELECT ${champs.join(', ')} FROM schools WHERE id = ?`).get(schoolId) || null; } catch { return null; }
  const changes = {};
  for (const c of champs) {
    const a = avant?.[c] ?? null; const b = v[c] ?? null;
    if (String(a) !== String(b)) changes[c] = { avant: a, apres: b };
  }
  if (!Object.keys(changes).length) return null;
  return { schoolId, changes, actorId: ctx?.userId || null };
}

export function auditHonneurApres(rec) {
  if (!rec) return;
  const actor = rec.actorId
    ? (db.prepare('SELECT full_name AS n FROM users WHERE id = ?').get(rec.actorId)?.n ?? null)
    : null;
  const id = randomUUID();
  db.prepare(`INSERT INTO audit_events (id, school_id, action, aggregate_type, target_id, actor_id, actor_name, payload, event_id, at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, rec.schoolId, 'honor_settings_changed', 'school', rec.schoolId, rec.actorId, actor,
      JSON.stringify(rec.changes), id, new Date().toISOString());
}
