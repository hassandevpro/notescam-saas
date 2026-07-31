// Tests d'ENFORCEMENT SERVEUR v3 (E3) — pilotent le VRAI chemin runQuery (= l'API
// serveur locale = l'« appel API direct », non contournable). node:sqlite, base temp.
// Couvre : activation d'une ligne (config complète + PLAFOND ANNUEL FERME), gel du
// montant/portée et des allocations d'une ligne active, cohérence d'imputation
// (secteur autorisé / global / période répartie / ligne active), et chaîne de
// dépassement v3 (ligne / période / secteur / annuel).

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID as uuid } from 'node:crypto';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-v3-'));
process.env.NODE_ENV = 'test';

const { db } = await import('../server/db.js');
const { runQuery } = await import('../server/query.js');

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log(`  ✅ ${m}`); };
const bad = (m) => { fail++; console.log(`  ❌ ${m}`); };
const allowed = (label, res) => (!res.error ? ok(label) : bad(`${label} — refusé à tort : ${res.error.message}`));
const blocked = (label, res, needle) => {
  if (!res.error) return bad(`${label} — aurait dû être refusé`);
  if (needle && !res.error.message.toLowerCase().includes(needle)) return bad(`${label} — refusé mais motif inattendu : ${res.error.message}`);
  ok(`${label} — refusé (${res.error.message.slice(0, 70)}…)`);
};
const ins = (table, o) => {
  const k = Object.keys(o);
  db.prepare(`INSERT INTO "${table}" (${k.map((x) => `"${x}"`).join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...k.map((x) => o[x]));
};
const run = (table, action, values, filters) =>
  runQuery({ table, action, values, filters, returning: true, single: true }, { userId: 'u_admin' });
const setStatus = (table, id, status, extra = {}) => run(table, 'update', { status, ...extra }, [{ col: 'id', op: 'eq', val: id }]);

const YEAR = '2026-2027';
ins('users', { id: 'u_admin', email: 'admin@x', password_hash: 'x' });
const member = (school) => ins('school_users', { id: uuid(), school_id: school, user_id: 'u_admin', role: 'admin' });

// Ligne v3 (feuille) : budget_id = ANNUEL, scope défini.
const line = (id, school, budgetId, amount, scope, status = 'draft') =>
  ({ id, school_id: school, budget_id: budgetId, parent_id: null, label: id, kind: 'depense', planned_amount: amount, scope, status });
const palloc = (id, school, chapterId, periodId, pct) => ({ id, school_id: school, budget_chapter_id: chapterId, budget_period_id: periodId, pct });
const salloc = (id, school, chapterId, unitId, pct) => ({ id, school_id: school, budget_chapter_id: chapterId, school_unit_id: unitId, pct });

// ══════════════════════════════════════════════════════════════════════════════
// ÉCOLE V — ACTIVATION (configuration + plafond annuel ferme) + GEL
// ══════════════════════════════════════════════════════════════════════════════
ins('schools', { id: 'V', name: 'École V', budget_validation: 0 }); member('V');
ins('school_units', { id: 'vMat', school_id: 'V', name: 'Maternelle' });
ins('school_units', { id: 'vPrim', school_id: 'V', name: 'Primaire' });
ins('school_units', { id: 'vSec', school_id: 'V', name: 'Secondaire' });
ins('budgets', { id: 'VAN', school_id: 'V', academic_year: YEAR, tier: 'annual', label: 'Annuel', envelope_amount: 100000000, status: 'active' });
ins('budget_periods', { id: 'VP1', school_id: 'V', academic_year: YEAR, name: 'T1', start_date: '2026-09-01', end_date: '2026-12-20' });

// Ligne déjà ACTIVE 95M (seed direct : bypasse les gardes, comme une donnée établie).
ins('budget_chapters', line('Lact', 'V', 'VAN', 95000000, 'complex', 'active'));
ins('budget_line_periods', palloc('Lact-p', 'V', 'Lact', 'VP1', 100));

console.log('\n▶ V.1 ACTIVATION — configuration incomplète');
{
  ins('budget_chapters', line('Lbad', 'V', 'VAN', 1000000, 'complex', 'draft'));
  ins('budget_line_periods', palloc('Lbad-p', 'V', 'Lbad', 'VP1', 70)); // Σ = 70 ≠ 100
  blocked('activer une ligne dont Σ% périodes = 70', setStatus('budget_chapters', 'Lbad', 'active'), 'incomplète');

  ins('budget_chapters', line('Lsec', 'V', 'VAN', 1000000, 'sectors', 'draft'));
  ins('budget_line_periods', palloc('Lsec-p', 'V', 'Lsec', 'VP1', 100));
  ins('budget_line_sectors', salloc('Lsec-s1', 'V', 'Lsec', 'vPrim', 55)); // Σ secteurs = 55 ≠ 100
  blocked('activer une ligne sectorielle dont Σ% secteurs = 55', setStatus('budget_chapters', 'Lsec', 'active'), 'incomplète');
}

console.log('\n▶ V.2 ACTIVATION — plafond annuel ferme (100M ; 95M déjà actives)');
{
  ins('budget_chapters', line('Lnew', 'V', 'VAN', 10000000, 'complex', 'draft'));
  ins('budget_line_periods', palloc('Lnew-p', 'V', 'Lnew', 'VP1', 100));
  blocked('activer une ligne 10M (95M + 10M > 100M)', setStatus('budget_chapters', 'Lnew', 'active'), 'annuel');

  ins('budget_chapters', line('L5', 'V', 'VAN', 5000000, 'complex', 'draft'));
  ins('budget_line_periods', palloc('L5-p', 'V', 'L5', 'VP1', 100));
  allowed('activer une ligne 5M (95M + 5M = 100M)', setStatus('budget_chapters', 'L5', 'active'));
  blocked('activer 10M après coup (100M déjà atteints)', setStatus('budget_chapters', 'Lnew', 'active'), 'annuel');
}

console.log('\n▶ V.3 GEL d’une ligne active');
{
  blocked('modifier le montant d’une ligne active', run('budget_chapters', 'update', { planned_amount: 90000000 }, [{ col: 'id', op: 'eq', val: 'Lact' }]), 'active');
  blocked('modifier la portée d’une ligne active', run('budget_chapters', 'update', { scope: 'sectors' }, [{ col: 'id', op: 'eq', val: 'Lact' }]), 'active');
  blocked('ajouter une allocation à une ligne active', run('budget_line_periods', 'insert', palloc(uuid(), 'V', 'Lact', 'VP1', 10)), 'active');
  allowed('modifier l’allocation d’une ligne BROUILLON (Lbad)', run('budget_line_periods', 'update', { pct: 100 }, [{ col: 'id', op: 'eq', val: 'Lbad-p' }]));
}

// ══════════════════════════════════════════════════════════════════════════════
// ÉCOLE W — IMPUTATION & CHAÎNE (lignes actives, enveloppe large)
// ══════════════════════════════════════════════════════════════════════════════
ins('schools', { id: 'W', name: 'École W', budget_validation: 0 }); member('W');
ins('school_units', { id: 'wMat', school_id: 'W', name: 'Maternelle' });
ins('school_units', { id: 'wPrim', school_id: 'W', name: 'Primaire' });
ins('school_units', { id: 'wSec', school_id: 'W', name: 'Secondaire' });
ins('budgets', { id: 'WAN', school_id: 'W', academic_year: YEAR, tier: 'annual', label: 'Annuel', envelope_amount: 100000000, status: 'active' });
ins('budget_periods', { id: 'WP1', school_id: 'W', academic_year: YEAR, name: 'T1', start_date: '2026-09-01', end_date: '2026-12-20' });
ins('budget_periods', { id: 'WP2', school_id: 'W', academic_year: YEAR, name: 'T2', start_date: '2027-01-05', end_date: '2027-03-31' });

// Ligne COMPLEXE active (Carburant 6M ; T1 = 100%).
ins('budget_chapters', line('Wcx', 'W', 'WAN', 6000000, 'complex', 'active'));
ins('budget_line_periods', palloc('Wcx-p', 'W', 'Wcx', 'WP1', 100));
// Ligne SECTORIELLE active (Fournitures 3M ; T1 = 100% ; Primaire 50 / Secondaire 50 — PAS Maternelle).
ins('budget_chapters', line('Wsec', 'W', 'WAN', 3000000, 'sectors', 'active'));
ins('budget_line_periods', palloc('Wsec-p', 'W', 'Wsec', 'WP1', 100));
ins('budget_line_sectors', salloc('Wsec-prim', 'W', 'Wsec', 'wPrim', 50));
ins('budget_line_sectors', salloc('Wsec-sec', 'W', 'Wsec', 'wSec', 50));
// Ligne BROUILLON (pour tester l'engagement interdit sur une ligne non active).
ins('budget_chapters', line('Wdraft', 'W', 'WAN', 2000000, 'complex', 'draft'));
ins('budget_line_periods', palloc('Wdraft-p', 'W', 'Wdraft', 'WP1', 100));

// La période est dérivée de la DATE (serveur) : date par défaut dans T1 (WP1).
const wexp = (o) => ({ id: uuid(), school_id: 'W', budget_id: 'WAN', amount: 0, status: 'draft', expense_date: '2026-10-15', ...o });

console.log('\n▶ W.1 COHÉRENCE D’IMPUTATION (§2 arbitrage)');
blocked('secteur NON autorisé (Maternelle sur ligne Primaire+Secondaire)',
  run('budget_expenses', 'insert', wexp({ budget_chapter_id: 'Wsec', budget_period_id: 'WP1', school_unit_id: 'wMat', amount: 100000, status: 'submitted' })), 'imputation');
allowed('secteur autorisé (Primaire)',
  run('budget_expenses', 'insert', wexp({ budget_chapter_id: 'Wsec', budget_period_id: 'WP1', school_unit_id: 'wPrim', amount: 100000, status: 'submitted' })));
allowed('imputation GLOBALE sur ligne sectorielle (Complexe/Global)',
  run('budget_expenses', 'insert', wexp({ budget_chapter_id: 'Wsec', budget_period_id: 'WP1', school_unit_id: null, amount: 100000, status: 'submitted' })));
blocked('période NON répartie sur la ligne (date en T2, Wcx réparti sur T1 seulement)',
  run('budget_expenses', 'insert', wexp({ budget_chapter_id: 'Wcx', expense_date: '2027-02-10', school_unit_id: null, amount: 100000, status: 'submitted' })), 'imputation');
blocked('ENGAGER sur une ligne BROUILLON (Wdraft)',
  run('budget_expenses', 'insert', wexp({ budget_chapter_id: 'Wdraft', budget_period_id: 'WP1', school_unit_id: null, amount: 100000, status: 'submitted' })), 'imputation');
allowed('PRÉPARER un brouillon sur une ligne brouillon (autorisé)',
  run('budget_expenses', 'insert', wexp({ budget_chapter_id: 'Wdraft', budget_period_id: 'WP1', school_unit_id: null, amount: 100000, status: 'draft' })));

console.log('\n▶ W.2 CHAÎNE DE DÉPASSEMENT');
allowed('dépense = plafond ligne complexe (6M sur Wcx/T1)',
  run('budget_expenses', 'insert', wexp({ id: 'okcx', budget_chapter_id: 'Wcx', budget_period_id: 'WP1', school_unit_id: null, amount: 6000000, status: 'submitted' })));
// (Wcx est maintenant consommée à 6M ; T1 aussi.)
blocked('dépassement LIGNE/PÉRIODE (1 de plus sur Wcx)',
  run('budget_expenses', 'insert', wexp({ budget_chapter_id: 'Wcx', budget_period_id: 'WP1', school_unit_id: null, amount: 1, status: 'submitted' })));
blocked('dépassement ALLOCATION SECTORIELLE (Primaire 1.5M + 1)',
  run('budget_expenses', 'insert', wexp({ budget_chapter_id: 'Wsec', budget_period_id: 'WP1', school_unit_id: 'wPrim', amount: 1500001, status: 'submitted' })), 'sector');

// ── École W2 : dépassement ANNUEL (ligne/période OK, enveloppe annuelle serrée) ──
ins('schools', { id: 'W2', name: 'École W2', budget_validation: 0 }); member('W2');
ins('budgets', { id: 'W2AN', school_id: 'W2', academic_year: YEAR, tier: 'annual', label: 'Annuel', envelope_amount: 1000000, status: 'active' });
ins('budget_periods', { id: 'W2P1', school_id: 'W2', academic_year: YEAR, name: 'T1', start_date: '2026-09-01', end_date: '2026-12-20' });
ins('budget_chapters', line('W2L', 'W2', 'W2AN', 6000000, 'complex', 'active')); // ligne > annuel (config brouillon tolérée)
ins('budget_line_periods', palloc('W2L-p', 'W2', 'W2L', 'W2P1', 100));
ins('budget_expenses', { id: uuid(), school_id: 'W2', budget_id: 'W2AN', budget_chapter_id: 'W2L', budget_period_id: 'W2P1', amount: 900000, status: 'approved' });
blocked('dépassement ANNUEL (500k : ligne/période OK mais annuel dispo 100k)',
  run('budget_expenses', 'insert', { id: uuid(), school_id: 'W2', budget_id: 'W2AN', budget_chapter_id: 'W2L', expense_date: '2026-10-15', school_unit_id: null, amount: 500000, status: 'submitted' }), 'annual');
allowed('dépense dans la marge annuelle (100k)',
  run('budget_expenses', 'insert', { id: uuid(), school_id: 'W2', budget_id: 'W2AN', budget_chapter_id: 'W2L', expense_date: '2026-10-15', school_unit_id: null, amount: 100000, status: 'submitted' }));

// ══════════════════════════════════════════════════════════════════════════════
// ÉCOLE SG — MODE GOUVERNÉ (budget_validation=1) : permissions + plafond de validation
// (repris de l'ancien P3 ; la section gouvernance de enforceExpense est model-agnostic).
// ══════════════════════════════════════════════════════════════════════════════
for (const u of ['g_prep', 'g_coordo', 'g_fond', 'g_none']) ins('users', { id: u, email: `${u}@x`, password_hash: 'x' });
ins('schools', { id: 'SG', name: 'École SG', budget_validation: 1, current_year: YEAR });
for (const [u, r] of [['u_admin', 'admin'], ['g_prep', 'censeur'], ['g_coordo', 'censeur'], ['g_fond', 'censeur'], ['g_none', 'censeur']]) ins('school_users', { id: uuid(), school_id: 'SG', user_id: u, role: r, full_name: u, active: 1 });
const grole = (code, rank, perms, wf) => ins('governance_roles', { id: uuid(), school_id: 'SG', code, name: code, rank, scope: 'complex', permissions: JSON.stringify(perms), pages: '[]', dashboards: '[]', workflows: JSON.stringify(wf), active: 1 });
grole('raf', 80, ['expense.view', 'expense.prepare', 'expense.submit'], []);
grole('coordonnateur_general', 90, ['expense.view'], ['expense.approve']);
grole('fondatrice', 100, ['expense.view'], ['expense.approve']);
ins('user_governance_roles', { id: uuid(), school_id: 'SG', user_id: 'g_prep', role: 'raf' });
ins('user_governance_roles', { id: uuid(), school_id: 'SG', user_id: 'g_coordo', role: 'coordonnateur_general' });
ins('user_governance_roles', { id: uuid(), school_id: 'SG', user_id: 'g_fond', role: 'fondatrice' });
ins('budgets', { id: 'GAN', school_id: 'SG', academic_year: YEAR, tier: 'annual', label: 'Annuel', envelope_amount: 100000000, status: 'active' });
ins('budget_periods', { id: 'GP1', school_id: 'SG', academic_year: YEAR, name: 'T1', start_date: '2026-09-01', end_date: '2026-12-20' });
ins('budget_chapters', { id: 'GR', school_id: 'SG', budget_id: 'GAN', label: 'Fonctionnement' });
ins('budget_chapters', { id: 'GL', school_id: 'SG', budget_id: 'GAN', parent_id: 'GR', label: 'Divers', scope: 'complex', status: 'active', planned_amount: 80000000 });
ins('budget_line_periods', { id: uuid(), school_id: 'SG', budget_chapter_id: 'GL', budget_period_id: 'GP1', pct: 100 });
const runG = (values, userId, action = 'insert', filters) => runQuery({ table: 'budget_expenses', action, values, filters, returning: true, single: true }, { userId });
const gexp = (o) => ({ id: uuid(), school_id: 'SG', budget_id: 'GAN', budget_chapter_id: 'GL', school_unit_id: null, expense_date: '2026-10-15', amount: 0, status: 'draft', ...o });

console.log('\n▶ SG. MODE GOUVERNÉ (permissions + plafond)');
blocked('u sans perm soumet → refusé (expense.submit)', runG(gexp({ amount: 100000, status: 'submitted' }), 'g_none'), 'submit');
blocked('u sans perm crée directement « approved » → refusé', runG(gexp({ amount: 100000, status: 'approved' }), 'g_none'), 'approve');
allowed('raf crée un brouillon', runG(gexp({ id: 'GX1', amount: 100000 }), 'g_prep'));
allowed('raf soumet', runG({ status: 'submitted' }, 'g_prep', 'update', [{ col: 'id', op: 'eq', val: 'GX1' }]));
blocked('raf (sans approve) approuve → refusé', runG({ status: 'approved' }, 'g_prep', 'update', [{ col: 'id', op: 'eq', val: 'GX1' }]), 'approve');
allowed('coordonnateur approuve 100k (dans son plafond)', runG({ status: 'approved' }, 'g_coordo', 'update', [{ col: 'id', op: 'eq', val: 'GX1' }]));
ins('budget_expenses', { id: 'GX2', school_id: 'SG', budget_id: 'GAN', budget_chapter_id: 'GL', budget_period_id: 'GP1', school_unit_id: null, expense_date: '2026-10-15', amount: 300000, status: 'submitted' });
blocked('coordonnateur approuve 300k (> plafond) → refusé', runG({ status: 'approved' }, 'g_coordo', 'update', [{ col: 'id', op: 'eq', val: 'GX2' }]), 'plafond');
allowed('fondatrice approuve 300k (autorité suprême)', runG({ status: 'approved' }, 'g_fond', 'update', [{ col: 'id', op: 'eq', val: 'GX2' }]));

console.log(`\n═══ RÉSULTAT E3 (LAN) : ${pass} OK · ${fail} échec(s) ═══`);
process.exit(fail ? 1 : 0);
