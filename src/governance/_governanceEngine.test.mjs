// Tests du moteur de gouvernance (catalogue-driven). Node natif : `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  indexCatalog, isAssignmentActive, activeAssignments,
  effectivePermissions, hasPermission, canAccessBudgetModule,
  effectivePages, effectiveDashboards, canSeeDashboard,
  coveredSectors, canValidateAmount,
} from './governanceEngine.js';

// Catalogue FICTIF (aucun nom réel requis : le moteur ne code aucun rôle en dur).
const CATALOG = [
  { code: 'boss', name: 'Boss', rank: 100, scope: 'complex', sector: null,
    permissions: ['expense.view', 'expense.approve'], pages: ['/app/groupe', '/app/depenses'],
    dashboards: ['group', 'budget-global'], workflows: ['budget.approve'], active: true },
  { code: 'finance', name: 'Finance', rank: 80, scope: 'complex', sector: null,
    permissions: ['expense.view', 'expense.approve', 'expense.pay'], pages: ['/app/depenses'],
    dashboards: ['budget-global'], workflows: [], active: true },
  { code: 'sectorhead', name: 'Sector head', rank: 60, scope: 'sector', sector: 'primaire',
    permissions: ['expense.view', 'expense.prepare'], pages: ['/app/depenses'],
    dashboards: ['budget-global'], workflows: [], active: true },
  { code: 'disabled', name: 'Disabled role', rank: 50, scope: 'complex', sector: null,
    permissions: ['expense.approve'], pages: ['/app/depenses'], dashboards: [], workflows: [], active: false },
];

const A = (role, extra = {}) => ({ role, status: 'active', sector: null, start_date: null, end_date: null, ...extra });

test('indexCatalog écarte les rôles désactivés', () => {
  const idx = indexCatalog(CATALOG);
  assert.ok(idx.has('boss'));
  assert.ok(!idx.has('disabled'));
});

test('isAssignmentActive respecte statut et fenêtre de dates', () => {
  const now = new Date('2026-07-12T00:00:00Z');
  assert.equal(isAssignmentActive(A('boss'), now), true);
  assert.equal(isAssignmentActive(A('boss', { status: 'inactive' }), now), false);
  assert.equal(isAssignmentActive(A('boss', { start_date: '2026-08-01' }), now), false); // pas encore commencé
  assert.equal(isAssignmentActive(A('boss', { end_date: '2026-06-30' }), now), false);   // déjà expiré
  assert.equal(isAssignmentActive(A('boss', { start_date: '2026-01-01', end_date: '2026-12-31' }), now), true);
});

test('activeAssignments filtre la liste', () => {
  const now = new Date('2026-07-12T00:00:00Z');
  const rows = [A('boss'), A('finance', { end_date: '2020-01-01' }), A('sectorhead', { status: 'inactive' })];
  assert.deepEqual(activeAssignments(rows, now).map((r) => r.role), ['boss']);
});

test('effectivePermissions : union permissions + workflows ; admin = tout', () => {
  const p = effectivePermissions('censeur', CATALOG, [A('boss')]);
  assert.ok(p.has('expense.approve'));
  assert.ok(p.has('budget.approve'));   // vient des workflows
  assert.ok(!p.has('expense.pay'));
  // admin : ensemble non vide couvrant les clés connues
  assert.ok(effectivePermissions('admin', CATALOG, []).size > 0);
  assert.ok(hasPermission('admin', CATALOG, [], 'expense.pay'));
});

test('un rôle désactivé ne confère aucun droit même s’il est attribué', () => {
  const p = effectivePermissions('censeur', CATALOG, [A('disabled')]);
  assert.equal(p.size, 0);
  assert.equal(canAccessBudgetModule('censeur', CATALOG, [A('disabled')]), false);
});

test('effectivePages / effectiveDashboards : union', () => {
  const pages = effectivePages('censeur', CATALOG, [A('boss')]);
  assert.ok(pages.has('/app/groupe'));
  assert.ok(pages.has('/app/depenses'));
  const dash = effectiveDashboards('censeur', CATALOG, [A('finance')]);
  assert.ok(dash.has('budget-global'));
  assert.ok(!dash.has('group'));
  assert.equal(canSeeDashboard('censeur', CATALOG, [A('boss')], 'group'), true);
  assert.equal(canSeeDashboard('admin', CATALOG, [], 'group'), true);
});

test('coveredSectors : complex → null, sector → liste', () => {
  assert.equal(coveredSectors('admin', CATALOG, []), null);
  assert.equal(coveredSectors('censeur', CATALOG, [A('boss')]), null); // transverse
  assert.deepEqual(coveredSectors('censeur', CATALOG, [A('sectorhead')]), ['primaire']);
  // surcharge de secteur par l'affectation
  assert.deepEqual(coveredSectors('censeur', CATALOG, [A('sectorhead', { sector: 'college' })]), ['college']);
});

test('canValidateAmount : palier exact + recours hiérarchique par rang', () => {
  const rules = { expense: [ { under: 25000, role: 'finance' }, { under: null, role: 'boss' } ] };
  // 10 000 → requiert 'finance' ; finance l'a
  assert.equal(canValidateAmount('censeur', CATALOG, [A('finance')], rules, 10000), true);
  // 500 000 → requiert 'boss' ; finance (rang 80 < 100) NE peut pas
  assert.equal(canValidateAmount('censeur', CATALOG, [A('finance')], rules, 500000), false);
  // 500 000 → boss l'a (palier exact)
  assert.equal(canValidateAmount('censeur', CATALOG, [A('boss')], rules, 500000), true);
  // 10 000 → boss (rang 100 ≥ finance 80, scope complex) peut valider en dessous
  assert.equal(canValidateAmount('censeur', CATALOG, [A('boss')], rules, 10000), true);
  // admin toujours
  assert.equal(canValidateAmount('admin', CATALOG, [], rules, 999999), true);
});
