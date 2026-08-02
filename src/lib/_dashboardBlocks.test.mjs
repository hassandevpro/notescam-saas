// Tests de la COMPOSITION du tableau de bord par rôle (module pur).
//   node src/lib/_dashboardBlocks.test.mjs
import assert from 'node:assert/strict';
import { dashboardLayout, primaryDomain, BLOCK, BLOCK_ROUTE, DOMAINS } from './dashboardBlocks.js';
import { DEFAULT_CATALOG } from '../governance/defaultCatalog.js';

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.error(`❌ ${name}\n   ${e.message}`); process.exitCode = 1; }
}

const CAT = DEFAULT_CATALOG;
const A = (role, sector = null) => ({ role, sector, status: 'active' });
const layout = (role, assignments = [], permissions = null) =>
  dashboardLayout({ role, catalog: CAT, assignments, permissions });

const has = (l, b) => l.blocks.includes(b);
const first = (l) => l.blocks[0];

// ── Rôles de base ───────────────────────────────────────────────────────────
test('enseignant : ses classes d’abord, aucune donnée d’établissement', () => {
  const l = layout('teacher');
  assert.equal(l.domain, 'teaching');
  assert.equal(first(l), BLOCK.TEACHER_CLASSES);
  assert.ok(!has(l, BLOCK.FEES), 'un enseignant n’a rien à faire du recouvrement');
  assert.ok(!has(l, BLOCK.DISCIPLINE));
  assert.ok(!has(l, BLOCK.ACADEMICS));
});

test('administrateur : vue d’ensemble, guide de démarrage en tête', () => {
  const l = layout('admin');
  assert.equal(l.domain, 'school');
  assert.equal(first(l), BLOCK.SETUP);
  for (const b of [BLOCK.ACADEMICS, BLOCK.GRADES_TODO, BLOCK.CLASS_TABLE, BLOCK.FEES, BLOCK.DISCIPLINE]) {
    assert.ok(has(l, b), `admin doit garder ${b}`);
  }
});

test('administrateur : les files financières lui reviennent aussi', () => {
  const l = layout('admin');
  for (const b of [BLOCK.QUEUE_VALIDATE, BLOCK.QUEUE_UNLOCK, BLOCK.QUEUE_PAY, BLOCK.GROUP_LINK]) {
    assert.ok(has(l, b), `admin doit voir ${b}`);
  }
});

test('censeur : pédagogie en tête, frais suivis, discipline en contexte', () => {
  const l = layout('censeur');
  assert.equal(l.domain, 'academics');
  assert.equal(first(l), BLOCK.ACADEMICS);
  assert.ok(has(l, BLOCK.FEES));
  assert.ok(has(l, BLOCK.DISCIPLINE));
  assert.ok(!has(l, BLOCK.SETUP), 'le guide de démarrage reste à l’administrateur');
});

test('surveillant : discipline SEULE (ni notes, ni frais, ni budget)', () => {
  const l = layout('surveillant');
  assert.equal(l.domain, 'discipline');
  assert.equal(first(l), BLOCK.DISCIPLINE);
  assert.ok(!has(l, BLOCK.FEES), 'le recouvrement n’est pas son métier');
  assert.ok(!has(l, BLOCK.ACADEMICS));
  assert.ok(!has(l, BLOCK.BUDGET_FIGURES));
});

// ── Gouvernance (additive, pilotée par le catalogue) ────────────────────────
test('caissier : file de décaissement en tête, aucun chiffre global', () => {
  const l = layout('teacher', [A('caissier')]);
  assert.equal(l.domain, 'cash');
  assert.equal(first(l), BLOCK.QUEUE_PAY);
  assert.ok(!has(l, BLOCK.QUEUE_VALIDATE), 'il exécute, il n’arbitre pas');
  assert.ok(!has(l, BLOCK.BUDGET_FIGURES));
  assert.ok(!has(l, BLOCK.GROUP_LINK));
});

// Un bloc renvoie toujours vers une page ; l'afficher à qui ne peut pas l'ouvrir
// fabriquerait un lien mort. Les pages scolaires dépendent du RÔLE DE BASE, que
// la gouvernance n'élargit pas (catalogue par défaut : aucun rôle n'ouvre /app/fees
// ni /app/classes).
test('caissier sur base enseignant : pas de bloc frais (page fermée)', () => {
  assert.ok(!has(layout('teacher', [A('caissier')]), BLOCK.FEES));
});

test('caissier sur base censeur : le bloc frais revient', () => {
  assert.ok(has(layout('censeur', [A('caissier')]), BLOCK.FEES));
});

test('direction générale sur base enseignant : pas de blocs scolaires', () => {
  const l = layout('teacher', [A('fondatrice')]);
  for (const b of [BLOCK.ACADEMICS, BLOCK.CLASS_TABLE, BLOCK.FEES, BLOCK.DISCIPLINE]) {
    assert.ok(!has(l, b), `${b} renverrait vers une page fermée`);
  }
});

test('RAF : validation, déblocages, décaissement et chiffres globaux', () => {
  const l = layout('teacher', [A('raf')]);
  assert.equal(l.domain, 'finance');
  assert.equal(first(l), BLOCK.QUEUE_VALIDATE);
  for (const b of [BLOCK.QUEUE_PAY, BLOCK.BUDGET_FIGURES, BLOCK.GROUP_LINK]) assert.ok(has(l, b), `RAF doit voir ${b}`);
  assert.ok(!has(l, BLOCK.QUEUE_UNLOCK), 'le RAF ne décide pas des déblocages dans le catalogue par défaut');
});

test('fondatrice : files complètes + consolidation du groupe', () => {
  const l = layout('teacher', [A('fondatrice')]);
  assert.equal(l.domain, 'finance');
  for (const b of [BLOCK.QUEUE_VALIDATE, BLOCK.QUEUE_UNLOCK, BLOCK.QUEUE_PAY, BLOCK.BUDGET_FIGURES, BLOCK.GROUP_LINK]) {
    assert.ok(has(l, b), `fondatrice doit voir ${b}`);
  }
});

test('chef de secteur : vue budgétaire BORNÉE à son secteur', () => {
  const l = layout('teacher', [A('principal')]);
  assert.deepEqual(l.covered, ['college']);
  assert.ok(l.profile.scopedToSector);
  assert.ok(has(l, BLOCK.BUDGET_FIGURES));
  assert.ok(!has(l, BLOCK.GROUP_LINK), 'un chef de secteur ne consolide pas le groupe');
});

test('adjoint de secteur : consultation, aucune file d’approbation', () => {
  const l = layout('teacher', [A('vice_principal')]);
  assert.ok(!has(l, BLOCK.QUEUE_VALIDATE));
  assert.ok(!has(l, BLOCK.QUEUE_PAY));
  assert.ok(has(l, BLOCK.BUDGET_FIGURES));
});

test('une affectation EXPIRÉE ne donne aucun bloc financier', () => {
  const expired = [{ role: 'fondatrice', status: 'active', end_date: '2020-01-01' }];
  const l = layout('teacher', expired);
  assert.equal(l.domain, 'teaching');
  assert.ok(!has(l, BLOCK.QUEUE_VALIDATE));
});

test('une affectation révoquée ne donne aucun bloc financier', () => {
  const l = layout('teacher', [{ role: 'raf', status: 'revoked' }]);
  assert.equal(l.domain, 'teaching');
});

test('la gouvernance est ADDITIVE : le censeur RAF garde sa pédagogie', () => {
  const l = layout('censeur', [A('raf')]);
  assert.equal(l.domain, 'finance', 'sa mission financière passe devant');
  assert.ok(has(l, BLOCK.ACADEMICS), 'mais il ne perd pas la pédagogie');
  assert.ok(has(l, BLOCK.DISCIPLINE));
});

test('l’administrateur garde son domaine même avec un rôle de gouvernance', () => {
  assert.equal(layout('admin', [A('caissier')]).domain, 'school');
});

// ── Comptes délégués ────────────────────────────────────────────────────────
test('compte délégué : un bloc dont la page est fermée n’apparaît pas', () => {
  const l = layout('censeur', [], ['/app/grades', '/app/bulletins']);
  assert.ok(has(l, BLOCK.ACADEMICS), '/app/grades est autorisé');
  assert.ok(!has(l, BLOCK.FEES), '/app/fees ne l’est pas');
  assert.ok(!has(l, BLOCK.DISCIPLINE));
});

test('compte délégué : les raccourcis restent, jamais d’écran vide', () => {
  const l = layout('censeur', [], ['/app/rh']);
  assert.deepEqual(l.blocks, [BLOCK.QUICK_ACCESS]);
});

test('permissions null = compte historique, accès par rôle inchangé', () => {
  assert.deepEqual(layout('censeur', [], null).blocks, layout('censeur').blocks);
  assert.deepEqual(layout('censeur', [], []).blocks, layout('censeur').blocks);
});

// ── Invariants de structure ─────────────────────────────────────────────────
test('aucun bloc en double, et toujours au moins un bloc', () => {
  const cases = [layout('admin'), layout('censeur'), layout('surveillant'), layout('teacher'),
    layout('teacher', [A('caissier')]), layout('teacher', [A('fondatrice')])];
  for (const l of cases) {
    assert.equal(new Set(l.blocks).size, l.blocks.length, `doublon dans ${l.domain}`);
    assert.ok(l.blocks.length > 0, `écran vide pour ${l.domain}`);
  }
});

test('tout bloc affiché a une route connue (zéro lien mort)', () => {
  for (const role of ['admin', 'censeur', 'surveillant', 'teacher']) {
    for (const b of layout(role).blocks) {
      assert.ok(b in BLOCK_ROUTE, `route manquante pour ${b}`);
    }
  }
});

test('primaryDomain ne renvoie jamais un domaine inconnu', () => {
  const profile = { showValidationQueue: false, showPaymentQueue: false, showUnlockQueue: false, showGlobalFigures: false, showGroupDashboard: false, cashierOnly: false };
  for (const role of ['admin', 'censeur', 'surveillant', 'teacher', 'inconnu', undefined]) {
    assert.ok(DOMAINS.includes(primaryDomain(role, profile, false)), `domaine invalide pour ${role}`);
  }
});

test('appel sans argument → repli enseignant, aucune exception', () => {
  const l = dashboardLayout();
  assert.equal(l.domain, 'teaching');
  assert.ok(l.blocks.includes(BLOCK.QUICK_ACCESS));
});

console.log(passed === 24 ? '\n✅ Tous les tests passent' : `\n⚠️ ${passed}/24`);
