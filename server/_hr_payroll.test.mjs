// Valide le module PAIE côté serveur LAN : colonnes légales du dossier
// personnel, catalogue de primes/retenues (hr_payroll_catalog) et lignes
// attachées à un bulletin (hr_payroll_items), plus la résolution des montants
// par le moteur pur. Reproduit les appels exacts de l'app (hrService).
//
// Lancer : node server/_hr_payroll.test.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'nc-payroll-'));
process.env.NOTESCAM_DATA_DIR = dir;
const { runQuery } = await import('./query.js');
const { resolvePayrollItems, isActiveRow } = await import('../src/lib/hrEngine.js');


let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };
const must = (op) => { const r = runQuery(op); if (r.error) throw new Error(`${op.action} ${op.table}: ${r.error.message}`); return r; };
const eq = (col, val) => ({ col, op: 'eq', val });
const one = (table, filters) => must({ table, action: 'select', columns: '*', single: true, maybeSingle: true, filters }).data;
const all = (table, filters) => must({ table, action: 'select', columns: '*', filters }).data;

must({ table: 'schools', action: 'insert', values: { id: 'sch1', name: 'Collège Test', niu: 'M0720146', cnps_number: '356-001' } });

// --- Identité légale de l'établissement (en-tête du bulletin) ---------------
const sch = one('schools', [eq('id', 'sch1')]);
ok(sch?.niu === 'M0720146' && sch?.cnps_number === '356-001', 'école : NIU + N° CNPS persistés', sch && [sch.niu, sch.cnps_number]);

// --- Trois agents, dont deux avec toutes les colonnes « paie / légal » ------
must({ table: 'staff', action: 'upsert', onConflict: 'id', values: {
  id: 'stf1', school_id: 'sch1', name: 'Awa NDIAYE', department: 'administration', fonction: 'Censeur',
  matricule: '005', hire_date: '2021-08-01',
  convention_collective: 'COMMERCE', categorie_echelon: '5 / A', situation_familiale: 'Célibataire (0 enf.)',
  cnps_number: '351-1227648-3', niu: 'P0451', cni_number: '100866374', bank_account: 'AFB 1234',
} });
must({ table: 'staff', action: 'upsert', onConflict: 'id', values: {
  id: 'stf2', school_id: 'sch1', name: 'Paul OBAM', department: 'comptabilite', fonction: 'Comptable',
  matricule: '006', hire_date: '2023-01-15', categorie_echelon: '3 / B', cnps_number: '351-9999999-1',
} });
must({ table: 'staff', action: 'upsert', onConflict: 'id', values: {
  id: 'stf3', school_id: 'sch1', name: 'Marie ETOA', department: 'enseignants', fonction: 'Enseignante',
  matricule: '007', hire_date: '2024-09-01',
} });

const a1 = one('staff', [eq('id', 'stf1')]);
ok(a1?.convention_collective === 'COMMERCE' && a1?.categorie_echelon === '5 / A', 'agent : convention + catégorie/échelon persistées', a1 && [a1.convention_collective, a1.categorie_echelon]);
ok(a1?.cnps_number === '351-1227648-3' && a1?.niu === 'P0451' && a1?.cni_number === '100866374' && a1?.bank_account === 'AFB 1234',
  'agent : CNPS / NIU / CNI / banque persistés', a1 && [a1.cnps_number, a1.niu, a1.cni_number, a1.bank_account]);
ok(all('staff', [eq('school_id', 'sch1')]).length === 3, 'trois agents créés');

// --- Catalogue : une prime fixe, une retenue en %, une charge patronale -----
const cat = (id, v) => must({ table: 'hr_payroll_catalog', action: 'upsert', onConflict: 'id', values: { id, school_id: 'sch1', ...v } });
cat('cat1', { code: '205', name: "Prime d'Ancienneté", kind: 'prime', calc_type: 'fixed', amount: 25000, base_ref: 'brut', active: true, position: 1 });
cat('cat2', { code: '651', name: 'CNPS Pension Vieillesse', kind: 'retenue', calc_type: 'percent', rate: 4.2, base_ref: 'brut', active: true, position: 2 });
cat('cat3', { name: 'CNPS Patronale (PVID)', kind: 'patronale', calc_type: 'percent', rate: 4.2, base_ref: 'brut', active: true, position: 3 });
cat('cat4', { code: '999', name: 'Ligne désactivée', kind: 'retenue', calc_type: 'fixed', amount: 9999, active: false, position: 4 });

const c1 = one('hr_payroll_catalog', [eq('id', 'cat1')]);
ok(c1?.name === "Prime d'Ancienneté" && c1?.kind === 'prime' && c1?.amount === 25000, 'catalogue : ligne fixe persistée', c1 && [c1.kind, c1.amount]);
const c2 = one('hr_payroll_catalog', [eq('id', 'cat2')]);
ok(c2?.calc_type === 'percent' && Number(c2?.rate) === 4.2 && c2?.base_ref === 'brut', 'catalogue : taux en % persisté', c2 && [c2.calc_type, c2.rate]);
const c3 = one('hr_payroll_catalog', [eq('id', 'cat3')]);
ok(c3?.kind === 'patronale', 'catalogue : charge patronale acceptée', c3?.kind);
ok(all('hr_payroll_catalog', [eq('school_id', 'sch1')]).length === 4, 'catalogue : 4 lignes pour l’école');

// Le drapeau « actif » doit rester exploitable après aller-retour en base :
// en LAN il revient en INTEGER (0/1), au Cloud en booléen. Tout filtre de l’UI
// doit donc tester la VÉRACITÉ, jamais `!== false` (0 !== false est vrai !).
const c4 = one('hr_payroll_catalog', [eq('id', 'cat4')]);
ok(!c4.active, 'catalogue : ligne désactivée est falsy après relecture', c4?.active);
ok(c4.active !== false, 'catalogue : `active !== false` NE distingue PAS une ligne désactivée en LAN (piège)', c4?.active);
// Le filtre RÉELLEMENT utilisé par l'UI (isActiveRow) doit, lui, l'exclure.
const catalogRows = all('hr_payroll_catalog', [eq('school_id', 'sch1')]);
ok(catalogRows.filter(isActiveRow).length === 3, 'catalogue : isActiveRow exclut bien la ligne désactivée', catalogRows.filter(isActiveRow).length);
ok(!isActiveRow(c4) && isActiveRow(c1), 'catalogue : isActiveRow distingue actif / désactivé');

// Mise à jour d’une ligne (édition depuis le modal).
cat('cat1', { code: '205', name: "Prime d'Ancienneté", kind: 'prime', calc_type: 'fixed', amount: 30000, base_ref: 'brut', active: true, position: 1 });
ok(one('hr_payroll_catalog', [eq('id', 'cat1')])?.amount === 30000, 'catalogue : mise à jour du montant');

// --- Bulletin + lignes attachées (snapshot) --------------------------------
must({ table: 'hr_payroll', action: 'upsert', onConflict: 'id', values: {
  id: 'pay1', school_id: 'sch1', staff_id: 'stf1', period: '2026-06',
  base_salary: 75000, bonuses: 30000, deductions: 4410, net_salary: 100590, status: 'paid',
} });

// replacePayrollItems : purge puis insertion des lignes retenues.
const putItems = (rows) => {
  must({ table: 'hr_payroll_items', action: 'delete', filters: [eq('payroll_id', 'pay1')] });
  rows.forEach((r, i) => must({ table: 'hr_payroll_items', action: 'insert', values: { id: `it${i}`, school_id: 'sch1', payroll_id: 'pay1', ...r } }));
};
putItems([
  { catalog_id: 'cat1', code: '205', kind: 'prime', name: "Prime d'Ancienneté", calc_type: 'fixed', amount: 30000 },
  { catalog_id: 'cat2', code: '651', kind: 'retenue', name: 'CNPS Pension Vieillesse', calc_type: 'percent', rate: 4.2, base_ref: 'brut', amount: 4410 },
  { catalog_id: 'cat3', kind: 'patronale', name: 'CNPS Patronale (PVID)', calc_type: 'percent', rate: 4.2, base_ref: 'brut', amount: 4410 },
]);
const items = all('hr_payroll_items', [eq('payroll_id', 'pay1')]);
ok(items.length === 3, 'bulletin : 3 lignes attachées', items.length);
ok(items.some((i) => i.kind === 'patronale' && i.amount === 4410), 'bulletin : charge patronale attachée', items.map((i) => i.kind));
ok(items.every((i) => i.name && i.kind), 'bulletin : nom + type figés sur chaque ligne (snapshot)');

// Le remplacement ne doit pas laisser d’orphelins.
putItems([{ catalog_id: 'cat1', code: '205', kind: 'prime', name: "Prime d'Ancienneté", calc_type: 'fixed', amount: 30000 }]);
ok(all('hr_payroll_items', [eq('payroll_id', 'pay1')]).length === 1, 'bulletin : remplacement des lignes sans orphelin');

// --- Cohérence moteur ↔ montants enregistrés -------------------------------
const resolved = resolvePayrollItems([
  { kind: 'prime', calc_type: 'fixed', amount: 30000 },
  { kind: 'retenue', calc_type: 'percent', rate: 4.2, base_ref: 'brut' },
  { kind: 'patronale', calc_type: 'percent', rate: 4.2, base_ref: 'brut' },
], 75000);
ok(resolved.brut === 105000, 'moteur : brut = 75 000 + 30 000', resolved.brut);
ok(resolved.deductions === 4410, 'moteur : retenue 4,2 % du brut = 4 410', resolved.deductions);
ok(resolved.employerTotal === 4410 && resolved.net === 100590, 'moteur : net ignore la charge patronale', [resolved.employerTotal, resolved.net]);

// Suppression d’une ligne de catalogue : le bulletin déjà émis conserve la
// sienne (snapshot indépendant) — c’est tout l’intérêt de hr_payroll_items.
must({ table: 'hr_payroll_catalog', action: 'delete', filters: [eq('id', 'cat1')] });
ok(!one('hr_payroll_catalog', [eq('id', 'cat1')]), 'catalogue : suppression effective');
const survivor = all('hr_payroll_items', [eq('payroll_id', 'pay1')])[0];
ok(survivor && survivor.name === "Prime d'Ancienneté" && survivor.amount === 30000,
  'bulletin : la ligne survit à la suppression de son entrée catalogue', survivor && survivor.name);

console.log(`\n=== ${fail === 0 ? 'OK' : 'KO'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail === 0 ? 0 : 1);
