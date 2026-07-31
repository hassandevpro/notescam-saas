// server/syncVerify.js
// Audit d'intégrité HIÉRARCHIQUE Cloud ↔ LAN (arbre de Merkle, anti-entropie).
//
// On part du niveau le plus élevé (checksum par table) et on ne DESCEND que dans les
// partitions divergentes : table → classe → élève (+ séquence). On ne recalcule JAMAIS
// un scope qui concorde → un audit reste quasi instantané même avec des millions de
// notes, et une divergence est localisée précisément (classe X / élève Y / séquence Z).
//
// Deux méthodes de checksum au niveau table, choisies par table :
//   • MERKLE  (tables volumineuses/critiques suivies) : lecture O(1) de sync_merkle des
//     deux côtés (maintenu incrémentalement à chaque écriture).
//   • PLAIN   (petites tables de config) : md5 de la liste « id:version » à la demande
//     (via l'existante RPC sync_integrity côté Cloud) — instantané car volume négligeable.
//
// Déclenché À LA DEMANDE (admin), après restauration, et à l'appairage (gate). JAMAIS
// en fonctionnement normal (la synchro continue reste purement incrémentale).

import { createHash } from 'node:crypto';
import { db, tableColumns, SYNCED_TABLES } from './db.js';
import { EDGE_BASE } from './cloudEnv.js';
import { serverToken } from './cloudSync.js';
import { shouldPush, shouldPull } from '../src/lib/policyEngine.js';
import {
  isTracked, MERKLE_EXPLICIT, refreshPromotions, ensureTracked,
  localTableChecksum, localScope, distinctChildKeys,
} from './syncMerkle.js';

// MÊME périmètre que sync-pull : les 54 tables répliquées Cloud → LAN.
export const VERIFY_TABLES = [
  'schools', 'school_units', 'school_users', 'academic_periods', 'classes', 'subjects',
  'students', 'teachers', 'staff', 'grades', 'student_fees', 'fee_payments',
  'budgets', 'budget_chapters', 'budget_expenses', 'budget_unlock_requests',
  'budget_reallocations', 'budget_revisions',
  'budget_periods', 'budget_line_periods', 'budget_line_sectors', 'budget_line_reallocations',
  'governance_roles', 'user_governance_roles', 'governance_role_history',
  'hr_contracts', 'hr_leaves', 'hr_evaluations', 'hr_attendance', 'hr_career_events',
  'signalement_comments', 'signalement_history',
  'notifications', 'notification_outbox',
  'assets', 'asset_breakdowns', 'asset_repairs', 'asset_expenses',
  'fee_catalog', 'student_fee_items',
  'attendance', 'student_absences', 'student_class_assignments',
  'late_arrivals', 'disciplinary_incidents', 'disciplinary_actions',
  'student_warnings', 'student_detentions', 'parent_meetings', 'exit_permissions',
  'school_messages', 'teacher_notifications', 'sequence_dates', 'timetable_slots',
];

const LABELS = {
  schools: 'Écoles', school_units: 'Unités', school_users: 'Comptes', academic_periods: 'Périodes',
  classes: 'Classes', subjects: 'Matières', students: 'Élèves', teachers: 'Enseignants',
  staff: 'Personnel', grades: 'Notes', student_fees: 'Frais élèves', fee_payments: 'Paiements',
  budgets: 'Budgets', budget_chapters: 'Rubriques budget', budget_expenses: 'Dépenses',
  governance_roles: 'Rôles gouvernance', user_governance_roles: 'Attributions rôles',
  student_absences: 'Conseils de classe', student_class_assignments: 'Affectations',
  attendance: 'Présences', student_fee_items: 'Frais détaillés', timetable_slots: 'Emploi du temps',
};
const labelOf = (t) => LABELS[t] || t;
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');

function currentPolicy() {
  try { return db.prepare('SELECT deployment_policy FROM schools LIMIT 1').get()?.deployment_policy || null; }
  catch { return null; }
}
// Table « miroir » (identique attendue) sous la politique courante. LAN-only (finance
// en hybride sélectif) ⇒ exclue du contrôle d'égalité.
function isMirrored(policy, table) { return shouldPush(policy, table) && shouldPull(policy, table); }

function localHasTable(table) { try { return tableColumns(table).size > 0; } catch { return false; } }

// Checksum PLAIN (md5 de la liste « id:version » triée par id) — pour les petites tables.
function localPlain(table) {
  if (!localHasTable(table)) return { present: false, count: null, checksum: null };
  const rows = db.prepare(`SELECT id, version FROM "${table}" ORDER BY id`).all();
  const str = rows.map((r) => `${r.id}:${r.version == null ? '' : r.version}`).join(',');
  return { present: true, count: rows.length, checksum: md5(str) };
}

// ── Transport Edge (injectable pour les tests) ───────────────────────────────────
async function defaultEdge(reqBody) {
  const token = serverToken();
  if (!token) throw new Error('no_server_token');
  const res = await fetch(`${EDGE_BASE}/sync-verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody || {}),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j) throw new Error(`sync-verify: HTTP ${res.status}`);
  return j;
}

// Compteurs « tableau de bord » dérivés (identiques dès que les tables sources concordent).
// Ordre + périmètre = rapport de synchronisation demandé (classes, élèves, enseignants,
// matières, utilisateurs, notes, bulletins, absences, budgets, dépenses, paiements).
function buildDashboard(byName) {
  const metric = (name) => { const t = byName[name]; return { lan: t?.lanCount ?? 0, cloud: t?.cloudCount ?? 0, match: !!t?.match }; };
  const identical = (names) => { const rel = names.filter((n) => byName[n]); return { match: rel.length ? rel.every((n) => byName[n].match) : true }; };
  return [
    { key: 'classes', label: 'Classes', kind: 'count', ...metric('classes') },
    { key: 'students', label: 'Élèves', kind: 'count', ...metric('students') },
    { key: 'teachers', label: 'Enseignants', kind: 'count', ...metric('teachers') },
    { key: 'subjects', label: 'Matières', kind: 'count', ...metric('subjects') },
    { key: 'users', label: 'Utilisateurs', kind: 'count', ...metric('school_users') },
    { key: 'grades', label: 'Notes', kind: 'count', ...metric('grades') },
    { key: 'bulletins', label: 'Bulletins', kind: 'identical', ...identical(['grades', 'subjects', 'classes', 'students', 'academic_periods', 'student_absences']) },
    { key: 'absences', label: 'Absences', kind: 'count', ...metric('student_absences') },
    { key: 'budgets', label: 'Budgets', kind: 'count', ...metric('budgets') },
    { key: 'expenses', label: 'Dépenses', kind: 'count', ...metric('budget_expenses') },
    { key: 'payments', label: 'Paiements', kind: 'count', ...metric('fee_payments') },
  ];
}

// Empreinte GLOBALE : un hash unique des checksums de toutes les tables comparées.
// LAN et Cloud produisent la MÊME valeur ssi tout est identique → « preuve » globale.
function globalChecksum(pick) {
  const parts = [];
  for (const t of [...VERIFY_TABLES].sort()) parts.push(`${t}=${pick(t) ?? ''}`);
  return md5(parts.join('|')).slice(0, 16);
}

// Diff de deux ensembles de partitions { key -> {checksum,count} }. Renvoie les clés
// qui diffèrent (checksum ≠ OU présente d'un seul côté).
function diffScopes(lan, cloud) {
  const keys = new Set([...Object.keys(lan), ...Object.keys(cloud)]);
  const out = [];
  for (const k of keys) {
    const l = lan[k], c = cloud[k];
    if (!l || !c || l.checksum !== c.checksum) out.push(k);
  }
  return out;
}

// Descente ciblée dans UNE table suivie divergente : classe → élève (+ séquence).
// N'interroge QUE les partitions nécessaires (compteur `scopes`). Renvoie la
// localisation { table, classes:[{class_id, students:[...], sequences:[...]}], tableOnly }.
async function descend(edge, table, counter) {
  const dims = new Set(tableColumns(table));
  const node = { table, label: labelOf(table), classes: [] };

  if (!dims.has('class_id')) { node.tableOnly = true; return node; } // pas de dimension → localisation au niveau table

  // Niveau classe.
  const cloudClasses = (await edge({ op: 'scope', table, scope: 'class' }))?.parts || {}; counter.scopes++;
  const lanClasses = localScope(table, 'class');
  const divClasses = diffScopes(lanClasses, cloudClasses);

  // Séquences divergentes (peu de clés) — utile pour les notes.
  let divSeq = [];
  if (dims.has('sequence')) {
    const cloudSeq = (await edge({ op: 'scope', table, scope: 'seq' }))?.parts || {}; counter.scopes++;
    divSeq = diffScopes(localScope(table, 'seq'), cloudSeq);
  }

  for (const cls of divClasses) {
    const entry = { class_id: cls, students: [], sequences: divSeq };
    if (dims.has('student_id')) {
      const studentKeys = distinctChildKeys(table, 'student_id', 'class_id', [cls]);
      const cloudStudents = (await edge({ op: 'scope', table, scope: 'student', keys: studentKeys }))?.parts || {}; counter.scopes++;
      const lanStudents = localScope(table, 'student', studentKeys);
      entry.students = diffScopes(lanStudents, cloudStudents);
    }
    node.classes.push(entry);
  }
  if (!divClasses.length) node.tableOnly = true; // diverge au niveau table sans classe localisable
  return node;
}

// Prépare l'arbre local : backfill des tables explicites manquantes + (optionnel)
// auto-promotions. `promote=false` (audit PAR CYCLE) saute le scan de promotion (54
// COUNT) → contrôle post-synchro quasi gratuit ; `promote=true` (appairage / à la
// demande / après restauration) réévalue les seuils.
function ensureLocalMerkle(promote) {
  for (const t of MERKLE_EXPLICIT) { if (tableColumns(t).size) ensureTracked(t); }
  if (promote) { try { refreshPromotions(VERIFY_TABLES); } catch { /* best-effort */ } }
}

// Audit hiérarchique complet. @param edge transport injectable. @param promote (voir ci-dessus).
export async function verifyIntegrity({ edge = defaultEdge, promote = true } = {}) {
  ensureLocalMerkle(promote);
  const policy = currentPolicy();
  const counter = { scopes: 0 };

  // (1) Niveau table : le Cloud renvoie ses checksums (merkle pour les tables suivies,
  //     plain md5 pour les autres). On ne compare que les tables miroir sous la politique.
  const compareTables = VERIFY_TABLES.filter((t) => isMirrored(policy, t));
  const cloudL1 = await edge({ op: 'tablelevel', tables: compareTables });
  const cloudMerkle = cloudL1?.merkle || {}; // { t: {checksum,count} }
  const cloudPlain = cloudL1?.plain || {};   // { t: {checksum,count} }

  const tables = [];
  const mismatches = [];
  const trackedDiverging = [];
  let skipped = 0;

  for (const t of VERIFY_TABLES) {
    if (!isMirrored(policy, t)) { skipped++; continue; }
    // Méthode : merkle si le Cloud maintient l'arbre de cette table, sinon plain.
    const cloudIsMerkle = Object.prototype.hasOwnProperty.call(cloudMerkle, t);
    let method, lan, cloud;
    if (cloudIsMerkle) {
      method = 'merkle';
      const lm = localTableChecksum(t); // backfillé par ensureLocalMerkle si suivi localement
      lan = lm ? { checksum: lm.checksum, count: lm.count } : { checksum: null, count: localHasTable(t) ? null : null };
      cloud = cloudMerkle[t];
    } else {
      method = 'plain';
      const lp = localPlain(t);
      lan = { checksum: lp.checksum, count: lp.count };
      cloud = cloudPlain[t] || { checksum: null, count: null };
    }
    const countMatch = lan.count === cloud.count;
    const checksumMatch = lan.checksum != null && cloud.checksum != null && lan.checksum === cloud.checksum;
    const match = countMatch && checksumMatch;
    if (!match) { mismatches.push(t); if (method === 'merkle') trackedDiverging.push(t); }
    tables.push({
      table: t, label: labelOf(t), method,
      lanCount: lan.count, cloudCount: cloud.count,
      lanChecksum: lan.checksum, cloudChecksum: cloud.checksum,
      countMatch, checksumMatch, match,
    });
  }

  // (2) Descente ciblée UNIQUEMENT dans les tables suivies divergentes.
  const divergences = [];
  for (const t of trackedDiverging) divergences.push(await descend(edge, t, counter));

  const byName = Object.fromEntries(tables.map((t) => [t.table, t]));
  const ok = mismatches.length === 0;
  // Empreinte globale LAN vs Cloud (une seule valeur = « preuve » synthétique).
  const lanGlobal = globalChecksum((t) => byName[t]?.lanChecksum);
  const cloudGlobal = globalChecksum((t) => byName[t]?.cloudChecksum);
  return {
    ok,
    at: new Date().toISOString(),
    method: 'hierarchical',
    tables,
    mismatches,
    mismatchLabels: mismatches.map((t) => labelOf(t)),
    divergences,
    dashboard: buildDashboard(byName),
    globalChecksum: { lan: lanGlobal, cloud: cloudGlobal, match: lanGlobal === cloudGlobal },
    summary: {
      total: tables.length, matched: tables.length - mismatches.length,
      mismatched: mismatches.length, skipped, scopesCompared: counter.scopes,
    },
  };
}
