// UN ARRÊTÉ DE CAISSE ACCEPTÉ EN LAN DOIT ÊTRE ACCEPTÉ PAR LE CLOUD
//
// Le Cloud porte deux CHECK sur cash_sessions que le schéma LAN n'avait pas :
//   cash_sessions_no_self_validation  : validated_by IS NULL OR validated_by IS DISTINCT FROM cashier_id
//   cash_sessions_variance_explained  : status = 'open' OR variance = 0 OR NULLIF(btrim(explanation), '') IS NOT NULL
// Un arrêté qui les viole passait en LAN, puis était refusé par sync-push —
// erreur loguée côté Edge, ligne perdue avec la purge de l'outbox.
//
// Les triggers de server/schema.sql reproduisent ces deux règles. Ce test joue
// chaque cas des deux côtés de la frontière, à l'INSERT comme à l'UPDATE, et
// vérifie qu'une base DÉJÀ installée (table créée sans les triggers) les reçoit
// au démarrage.
//
// Lancer : node server/_cash_sessions_cloud_checks.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-cash-checks-'));

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const { db } = await import('./db.js');

const SCHOOL = 'ecole-caisse';
db.prepare(`INSERT INTO schools (id, name) VALUES (?, ?)`).run(SCHOOL, 'École caisse');

let n = 0;
const session = (over = {}) => ({
  id: `cs-${++n}`, school_id: SCHOOL, date: `2026-09-${String(n).padStart(2, '0')}`,
  cashier_id: 'caissier', cashier_name: 'Caissier', opening_float: 0,
  expected_cash: 10000, counted_cash: 10000, variance: 0, entry_count: 3,
  explanation: null, status: 'declared', validated_by: null, ...over,
});
const insert = (row) => {
  try {
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO cash_sessions (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...cols.map((c) => row[c]));
    return null;
  } catch (e) { return e.message; }
};
const update = (id, set) => {
  try {
    const cols = Object.keys(set);
    db.prepare(`UPDATE cash_sessions SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...cols.map((c) => set[c]), id);
    return null;
  } catch (e) { return e.message; }
};

// ── Ce que le Cloud ACCEPTE doit passer ────────────────────────────────────
ok(insert(session()) === null, '1. arrêté équilibré, sans justification → accepté');
ok(insert(session({ variance: -500, counted_cash: 9500, explanation: 'Monnaie rendue en trop' })) === null,
  '2. écart justifié → accepté');
ok(insert(session({ status: 'open', variance: -500, counted_cash: 9500 })) === null,
  '3. journée encore OUVERTE avec écart non justifié → acceptée (la règle ne vise que la clôture)');
ok(insert(session({ status: 'validated', validated_by: 'controleur' })) === null,
  '4. validé par un TIERS → accepté');
ok(insert(session({ cashier_id: null, status: 'validated', validated_by: 'controleur' })) === null,
  '5. caissier inconnu, validé par un tiers → accepté (IS DISTINCT FROM, comme le Cloud)');

// ── Ce que le Cloud REFUSE doit être refusé ici ────────────────────────────
const e6 = insert(session({ variance: 700, counted_cash: 10700 }));
ok(/variance_explained/.test(e6 || ''), '6. écart NON justifié à la clôture → refusé', e6);
const e7 = insert(session({ variance: 700, counted_cash: 10700, explanation: '   ' }));
ok(/variance_explained/.test(e7 || ''), '7. justification faite d’espaces → refusée (btrim, comme le Cloud)', e7);
const e8 = insert(session({ status: 'validated', validated_by: 'caissier' }));
ok(/no_self_validation/.test(e8 || ''), '8. caissier qui valide son propre comptage → refusé', e8);

// ── Même règle à la MODIFICATION ───────────────────────────────────────────
const e9 = update('cs-3', { status: 'declared' });
ok(/variance_explained/.test(e9 || ''), '9. clore une journée ouverte à écart non justifié → refusé', e9);
ok(update('cs-3', { status: 'declared', explanation: 'Billet déchiré retiré' }) === null,
  '10. la même clôture, justifiée → acceptée');
const e11 = update('cs-1', { status: 'validated', validated_by: 'caissier' });
ok(/no_self_validation/.test(e11 || ''), '11. auto-validation par UPDATE → refusée', e11);
ok(update('cs-1', { status: 'validated', validated_by: 'controleur', validated_by_name: 'Contrôleur' }) === null,
  '12. validation par un tiers par UPDATE → acceptée');

const refusees = db.prepare(`SELECT count(*) c FROM cash_sessions WHERE id IN ('cs-6','cs-7','cs-8')`).get().c;
ok(refusees === 0, '13. aucune ligne refusée n’a été écrite', refusees);

// ── Base DÉJÀ installée : triggers absents avant la mise à jour ────────────
// On simule une 0.2.6 (table présente, triggers absents), puis on rejoue le
// schéma comme le fait db.js au démarrage.
db.exec('DROP TRIGGER cash_sessions_cloud_checks_ins; DROP TRIGGER cash_sessions_cloud_checks_upd;');
const temoin = session({ variance: 900, counted_cash: 10900 });
ok(insert(temoin) === null,
  '14. (témoin) sans triggers, l’arrêté fautif passait — c’est le défaut corrigé');
const { readFileSync } = await import('node:fs');
db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const e15 = insert(session({ variance: 900, counted_cash: 10900 }));
ok(/variance_explained/.test(e15 || ''), '15. après rejeu du schéma sur une base existante → refusé', e15);
const avant = db.prepare(`SELECT variance, explanation, status FROM cash_sessions WHERE id = ?`).get(temoin.id);
ok(avant && avant.variance === 900 && avant.explanation === null && avant.status === 'declared',
  '16. la ligne préexistante n’est ni modifiée ni supprimée par la mise à jour', avant);

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
