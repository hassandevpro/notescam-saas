// UNE TABLE AJOUTÉE À LA DESCENTE REÇOIT AUSSI SON HISTORIQUE
//
// La 0.2.7 ajoute hr_payroll_catalog, hr_payroll et hr_payroll_items à
// PULL_ORDER (server/cloudSync.js). Or `sync-pull` est un keyset strictement
// supérieur au curseur : la paie saisie en Cloud AVANT la mise à jour est plus
// ancienne que le curseur d'un serveur déjà appairé — elle ne serait jamais
// renvoyée. Constaté sur la démo le 22/09/2026 : 16 bulletins en Cloud datés
// du 22/08, curseur LAN au 21/09.
//
// resetPullCursorIfPullOrderGrew() relit tout, une fois, quand une table est
// neuve. Ce test joue la mise à jour d'un serveur appairé contre un Cloud
// simulé qui respecte le keyset, et vérifie :
//   · que la paie ancienne descend bien, FK comprises (catalogue → bulletin → lignes) ;
//   · que le témoin (sans remise à zéro) la perd — c'est le défaut ;
//   · qu'un second cycle ne relit rien et ne duplique rien.
//
// AUCUNE DONNÉE DE PRODUCTION. Lancer : node server/_pull_tables_neuves.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-pull-neuves-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const { db } = await import('./db.js');
const { syncOnce, resetPullCursorIfPullOrderGrew } = await import('./cloudSync.js');

const ECOLE = 'ec-paie';
db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(ECOLE, 'ÉCOLE PAIE');
db.prepare('INSERT INTO staff (id,school_id,name) VALUES (?,?,?)').run('st1', ECOLE, 'MBARGA Paul');

// LE CLOUD SIMULÉ : lignes de paie saisies le 22/08, soit AVANT le curseur du
// serveur. Types tels que PostgREST les renvoie (booléen, numeric en nombre).
const AOUT = '2026-08-22T09:53:03+00:00';
const CLOUD = {
  hr_payroll_catalog: [{ id: 'cat1', school_id: ECOLE, code: 'PRIME_T', name: 'Prime de transport',
    kind: 'prime', calc_type: 'fixed', amount: 25000, rate: null, base_ref: 'brut', active: true,
    position: 1, created_at: AOUT, updated_at: AOUT, version: 1 }],
  hr_payroll: [{ id: 'pay1', school_id: ECOLE, staff_id: 'st1', period: '2026-06', base_salary: 320000,
    worked_days: 22, bonuses: 25000, deductions: 0, net_salary: 345000, status: 'paid',
    paid_date: '2026-06-28', created_at: AOUT, updated_at: AOUT, version: 1 }],
  hr_payroll_items: [{ id: 'it1', school_id: ECOLE, payroll_id: 'pay1', catalog_id: 'cat1',
    code: 'PRIME_T', kind: 'prime', name: 'Prime de transport', calc_type: 'fixed', amount: 25000,
    created_at: AOUT, updated_at: AOUT, version: 1 }],
};
// Keyset fidèle au contrat : `since` nul → tout ; sinon, seulement ce qui est
// strictement plus récent. Le curseur rendu est la dernière date vue.
let appelsPull = [];
const edge = async (path, body) => {
  if (path === 'sync-push') return { applied: (body.changes || []).length, skipped: 0 };
  if (path !== 'sync-pull') throw new Error('chemin inattendu : ' + path);
  appelsPull.push(body.since ?? null);
  const since = body.since ? Date.parse(body.since) : -Infinity;
  const rows = {};
  let max = body.since || null;
  for (const [t, lignes] of Object.entries(CLOUD)) {
    rows[t] = lignes.filter((r) => Date.parse(r.updated_at) > since);
    for (const r of rows[t]) if (!max || Date.parse(r.updated_at) > Date.parse(max)) max = r.updated_at;
  }
  return { rows, tombstones: [], cursor: max, tomb_cursor: null };
};

const setCur = (name, value) => db.prepare(
  'INSERT INTO sync_cursor (name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',
).run(name, value);
const getCur = (name) => db.prepare('SELECT value FROM sync_cursor WHERE name = ?').get(name)?.value ?? null;
const nb = (t) => db.prepare(`SELECT count(*) c FROM ${t} WHERE school_id = ?`).get(ECOLE).c;
const SEPT = '2026-09-21T10:27:06+00:00';

// ── TÉMOIN : serveur appairé dont la liste connue contient DÉJÀ la paie ──
// (aucune remise à zéro) → le keyset ne renvoie rien d'antérieur au curseur.
setCur('pull_at', SEPT);
resetPullCursorIfPullOrderGrew();            // pose la liste courante
setCur('pull_at', SEPT);                      // curseur d'un serveur déjà appairé
await syncOnce({ edge });
ok(nb('hr_payroll') === 0,
  '1. (témoin) sans remise à zéro, la paie antérieure au curseur NE DESCEND PAS — le défaut', nb('hr_payroll'));

// ── MISE À JOUR 0.2.6 → 0.2.7 : la liste connue ne contient pas la paie ──
const liste026 = JSON.parse(getCur('pull_tables'))
  .filter((t) => !['hr_payroll_catalog', 'hr_payroll', 'hr_payroll_items', 'cash_sessions'].includes(t));
setCur('pull_tables', JSON.stringify(liste026));
setCur('pull_at', SEPT);
appelsPull = [];
await syncOnce({ edge });
ok(appelsPull[0] === null, '2. après mise à jour, le pull repart de zéro', appelsPull);
ok(nb('hr_payroll_catalog') === 1, '3. le catalogue de paie ancien est descendu', nb('hr_payroll_catalog'));
ok(nb('hr_payroll') === 1, '4. le bulletin ancien est descendu', nb('hr_payroll'));
ok(nb('hr_payroll_items') === 1, '5. la ligne de bulletin est descendue (FK bulletin + catalogue satisfaites)', nb('hr_payroll_items'));
const b = db.prepare('SELECT net_salary, status, worked_days FROM hr_payroll WHERE id = ?').get('pay1');
ok(b?.net_salary === 345000 && b?.status === 'paid' && b?.worked_days === 22, '6. contenu du bulletin intact', b);
ok(db.prepare('SELECT active FROM hr_payroll_catalog WHERE id = ?').get('cat1')?.active === 1,
  '7. le booléen Cloud est converti pour SQLite');
ok(getCur('pull_at') === AOUT, '8. le curseur avance normalement après la relecture', getCur('pull_at'));

// ── Cycle suivant : aucune relecture, aucun doublon ──────────────────────
appelsPull = [];
await syncOnce({ edge });
ok(appelsPull[0] === AOUT, '9. le cycle suivant reprend au curseur (pas de relecture complète)', appelsPull);
ok(nb('hr_payroll') === 1 && nb('hr_payroll_items') === 1 && nb('hr_payroll_catalog') === 1,
  '10. IDEMPOTENCE : aucun doublon après un second cycle');

// ── Premier démarrage d'un serveur ancien (liste jamais mémorisée) ───────
db.prepare("DELETE FROM sync_cursor WHERE name = 'pull_tables'").run();
setCur('pull_at', SEPT);
const neuves = resetPullCursorIfPullOrderGrew();
ok(neuves.includes('hr_payroll') && getCur('pull_at') === null,
  '11. liste absente (serveur antérieur à la 0.2.7) → une relecture complète', { neuves, pull_at: getCur('pull_at') });
setCur('pull_at', SEPT);
ok(resetPullCursorIfPullOrderGrew().length === 0 && getCur('pull_at') === SEPT,
  '12. liste à jour → le curseur n’est plus jamais touché');

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
