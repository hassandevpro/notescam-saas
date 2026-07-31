// Tests des OPÉRATIONS budgétaires V3 (E6) — réallocation entre LIGNES + révision
// annuelle, via le VRAI chemin RPC serveur (runRpc). Vérifie : autorité (permissions
// gouvernance, y compris Fondatrice/Coordonnateur), atomicité, historisation
// (avant/après/auteur/motif), respect des engagements, plancher de révision.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID as uuid } from 'node:crypto';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-opsv3-'));
process.env.NODE_ENV = 'test';

const { db } = await import('../server/db.js');
const { runRpc } = await import('../server/rpc.js');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✅ ${m}`); };
const bad = (m) => { fail++; console.log(`  ❌ ${m}`); };
const allowed = (label, res) => (!res.error ? ok(label) : bad(`${label} — refusé à tort : ${res.error.message}`));
const blocked = (label, res, needle) => {
  if (!res.error) return bad(`${label} — aurait dû être refusé`);
  if (needle && !res.error.message.toLowerCase().includes(needle)) return bad(`${label} — motif inattendu : ${res.error.message}`);
  ok(`${label} — refusé (${res.error.message.slice(0, 60)}…)`);
};
const ins = (table, o) => { const k = Object.keys(o); db.prepare(`INSERT INTO "${table}" (${k.map((x) => `"${x}"`).join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...k.map((x) => o[x])); };
const rpc = (name, p, userId) => runRpc(name, p, { userId });
const plannedOf = (id) => db.prepare('SELECT planned_amount FROM budget_chapters WHERE id = ?').get(id).planned_amount;
const envOf = (id) => db.prepare('SELECT envelope_amount FROM budgets WHERE id = ?').get(id).envelope_amount;

const YEAR = '2026-2027';
for (const u of ['u_admin', 'u_fond', 'u_coord', 'u_none']) ins('users', { id: u, email: `${u}@x`, password_hash: 'x' });
ins('schools', { id: 'V', name: 'École V', budget_validation: 0, current_year: YEAR });
ins('school_users', { id: uuid(), school_id: 'V', user_id: 'u_admin', role: 'admin', full_name: 'Admin', active: 1 });
ins('school_users', { id: uuid(), school_id: 'V', user_id: 'u_fond', role: 'censeur', full_name: 'Fondatrice', active: 1 });
ins('school_users', { id: uuid(), school_id: 'V', user_id: 'u_coord', role: 'censeur', full_name: 'Coordo', active: 1 });
ins('school_users', { id: uuid(), school_id: 'V', user_id: 'u_none', role: 'teacher', full_name: 'Prof', active: 1 });

// Catalogue de gouvernance : Fondatrice & Coordonnateur = capacités financières complètes.
const FIN_PERMS = ['budget.view', 'budget.prepare', 'budget.submit', 'budget.reallocate.request', 'budget.annual.revise.request'];
const FIN_WF = ['budget.approve', 'budget.reallocate.decide', 'budget.annual.revise'];
const role = (code) => ins('governance_roles', { id: uuid(), school_id: 'V', code, name: code, rank: 90, scope: 'complex', permissions: JSON.stringify(FIN_PERMS), pages: '[]', dashboards: '[]', workflows: JSON.stringify(FIN_WF), active: 1 });
role('fondatrice'); role('coordonnateur_general');
ins('user_governance_roles', { id: uuid(), school_id: 'V', user_id: 'u_fond', role: 'fondatrice' });
ins('user_governance_roles', { id: uuid(), school_id: 'V', user_id: 'u_coord', role: 'coordonnateur_general' });

// Budget annuel + 2 lignes actives (Σ = 7M ≤ 10M) + une dépense engagée sur L1 (3M).
ins('budgets', { id: 'AN', school_id: 'V', academic_year: YEAR, tier: 'annual', label: 'Annuel', envelope_amount: 10000000, status: 'active' });
ins('budget_periods', { id: 'P1', school_id: 'V', academic_year: YEAR, name: 'T1', start_date: '2026-09-01', end_date: '2026-12-20' });
ins('budget_chapters', { id: 'R', school_id: 'V', budget_id: 'AN', label: 'Fonctionnement' });
ins('budget_chapters', { id: 'L1', school_id: 'V', budget_id: 'AN', parent_id: 'R', label: 'Carburant', scope: 'complex', status: 'active', planned_amount: 4000000 });
ins('budget_chapters', { id: 'L2', school_id: 'V', budget_id: 'AN', parent_id: 'R', label: 'Eau', scope: 'complex', status: 'active', planned_amount: 3000000 });
ins('budget_line_periods', { id: uuid(), school_id: 'V', budget_chapter_id: 'L1', budget_period_id: 'P1', pct: 100 });
ins('budget_line_periods', { id: uuid(), school_id: 'V', budget_chapter_id: 'L2', budget_period_id: 'P1', pct: 100 });
ins('budget_expenses', { id: uuid(), school_id: 'V', budget_id: 'AN', budget_chapter_id: 'L1', budget_period_id: 'P1', amount: 3000000, status: 'approved' });

console.log('\n▶ RÉALLOCATION — permissions');
blocked('u_none (aucune perm) propose une réallocation', rpc('budget_create_line_realloc', { p_source_chapter_id: 'L1', p_dest_chapter_id: 'L2', p_amount: 1000000, p_reason: 'x' }, 'u_none'), 'permission');

console.log('\n▶ RÉALLOCATION — cycle + respect des engagements');
let reallocId;
{
  const res = rpc('budget_create_line_realloc', { p_source_chapter_id: 'L1', p_dest_chapter_id: 'L2', p_amount: 1000000, p_reason: 'rééquilibrage' }, 'u_admin');
  allowed('admin propose L1→L2 (1M)', res); reallocId = res.data;
  blocked('u_none décide (aucune perm)', rpc('budget_decide_line_realloc', { p_id: reallocId, p_decision: 'approve' }, 'u_none'), 'permission');
  allowed('Fondatrice approuve (autorité de décision)', rpc('budget_decide_line_realloc', { p_id: reallocId, p_decision: 'approve' }, 'u_fond'));
  (plannedOf('L1') === 3000000 && plannedOf('L2') === 4000000) ? ok('montants transférés (L1 4M→3M, L2 3M→4M)') : bad(`transfert incorrect : L1=${plannedOf('L1')} L2=${plannedOf('L2')}`);
  const row = db.prepare('SELECT * FROM budget_line_reallocations WHERE id = ?').get(reallocId);
  (row.status === 'applied' && row.source_before === 4000000 && row.source_after === 3000000 && row.decided_by) ? ok('historisée (statut/avant-après/décideur)') : bad('historisation incomplète');
  // Total annuel inchangé (enveloppe).
  envOf('AN') === 10000000 ? ok('budget annuel global INCHANGÉ (10M)') : bad('le total annuel a changé');
}
{
  // L1 = 3M, engagé 3M → tout transfert supplémentaire tomberait sous les engagements.
  const res = rpc('budget_create_line_realloc', { p_source_chapter_id: 'L1', p_dest_chapter_id: 'L2', p_amount: 500000, p_reason: 'trop' }, 'u_admin');
  allowed('admin propose L1→L2 (500k)', res);
  blocked('décision refusée : source sous ses engagements (3M)', rpc('budget_decide_line_realloc', { p_id: res.data, p_decision: 'approve' }, 'u_admin'), 'engagement');
  plannedOf('L1') === 3000000 ? ok('atomique : aucun changement après refus') : bad('mutation partielle');
}

console.log('\n▶ RÉVISION ANNUELLE — plancher lignes/engagements + permissions');
{
  // Lignes actives = 3M + 4M = 7M ; engagé = 3M.
  blocked('u_none propose une révision (aucune perm)', rpc('budget_create_revision', { p_annual_budget_id: 'AN', p_new_amount: 8000000, p_reason: 'x' }, 'u_none'), 'permission');

  const low = rpc('budget_create_revision', { p_annual_budget_id: 'AN', p_new_amount: 6000000, p_reason: 'baisse' }, 'u_admin');
  allowed('admin propose une révision à 6M', low);
  blocked('révision à 6M refusée (< lignes activées 7M)', rpc('budget_decide_revision', { p_id: low.data, p_decision: 'approve' }, 'u_admin'), 'lignes');

  const up = rpc('budget_create_revision', { p_annual_budget_id: 'AN', p_new_amount: 12000000, p_reason: 'rallonge' }, 'u_coord');
  allowed('Coordonnateur propose une révision à 12M', up);
  allowed('Coordonnateur approuve la révision (autorité)', rpc('budget_decide_revision', { p_id: up.data, p_decision: 'approve' }, 'u_coord'));
  envOf('AN') === 12000000 ? ok('enveloppe annuelle révisée (10M → 12M)') : bad(`révision non appliquée : ${envOf('AN')}`);
}

console.log(`\n═══ RÉSULTAT E6 OPS : ${pass} OK · ${fail} échec(s) ═══`);
process.exit(fail ? 1 : 0);
