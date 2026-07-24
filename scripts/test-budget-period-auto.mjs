// Test : la PÉRIODE d'une dépense est déterminée SERVEUR à partir de sa DATE
// (jamais choisie, jamais la date du jour), via le VRAI chemin runQuery (= appel
// API direct). Vérifie : dérivation correcte selon la date, écrasement d'une
// période FAUSSE envoyée par l'API, blocage si aucune période ne couvre la date.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID as uuid } from 'node:crypto';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-perauto-'));
process.env.NODE_ENV = 'test';

const { db } = await import('../server/db.js');
const { runQuery } = await import('../server/query.js');

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
const run = (values) => runQuery({ table: 'budget_expenses', action: 'insert', values, returning: true, single: true }, { userId: 'u_admin' });
const periodOf = (id) => db.prepare('SELECT budget_period_id FROM budget_expenses WHERE id = ?').get(id)?.budget_period_id;

const YEAR = '2026-2027';
ins('users', { id: 'u_admin', email: 'a@x', password_hash: 'x' });
ins('schools', { id: 'S', name: 'S', budget_validation: 0, current_year: YEAR });
ins('school_users', { id: uuid(), school_id: 'S', user_id: 'u_admin', role: 'admin', full_name: 'A', active: 1 });
ins('budgets', { id: 'AN', school_id: 'S', academic_year: YEAR, tier: 'annual', label: 'Annuel', envelope_amount: 10000000, status: 'active' });
// Deux périodes DISJOINTES (trou entre le 20/12 et le 05/01).
ins('budget_periods', { id: 'T1', school_id: 'S', academic_year: YEAR, name: 'T1', start_date: '2026-09-01', end_date: '2026-12-20' });
ins('budget_periods', { id: 'T2', school_id: 'S', academic_year: YEAR, name: 'T2', start_date: '2027-01-05', end_date: '2027-03-31' });
ins('budget_chapters', { id: 'R', school_id: 'S', budget_id: 'AN', label: 'Fonctionnement' });
// Ligne active répartie sur T1 (40%) et T2 (60%).
ins('budget_chapters', { id: 'L', school_id: 'S', budget_id: 'AN', parent_id: 'R', label: 'Carburant', scope: 'complex', status: 'active', planned_amount: 6000000 });
ins('budget_line_periods', { id: uuid(), school_id: 'S', budget_chapter_id: 'L', budget_period_id: 'T1', pct: 40 });
ins('budget_line_periods', { id: uuid(), school_id: 'S', budget_chapter_id: 'L', budget_period_id: 'T2', pct: 60 });

const exp = (o) => ({ id: uuid(), school_id: 'S', budget_id: 'AN', budget_chapter_id: 'L', school_unit_id: null, amount: 100000, status: 'submitted', ...o });

console.log('\n▶ PÉRIODE DÉRIVÉE DE LA DATE (serveur)');
{
  const e1 = exp({ expense_date: '2026-10-15' }); // dans T1
  allowed('dépense datée 15/10/2026 → acceptée', run(e1));
  periodOf(e1.id) === 'T1' ? ok('période dérivée = T1') : bad(`période incorrecte : ${periodOf(e1.id)}`);

  const e2 = exp({ expense_date: '2027-02-10' }); // dans T2
  allowed('dépense datée 10/02/2027 → acceptée', run(e2));
  periodOf(e2.id) === 'T2' ? ok('période dérivée = T2') : bad(`période incorrecte : ${periodOf(e2.id)}`);
}

console.log('\n▶ PÉRIODE ENVOYÉE PAR L’API IGNORÉE (non contournable)');
{
  // Date dans T1 mais l'API tente d'imputer à T2 → le serveur écrase par T1.
  const e = exp({ expense_date: '2026-11-01', budget_period_id: 'T2' });
  allowed('API envoie T2 pour une date de T1', run(e));
  periodOf(e.id) === 'T1' ? ok('serveur a écrasé la période fausse (T2 → T1)') : bad(`la période fausse n’a pas été corrigée : ${periodOf(e.id)}`);
}

console.log('\n▶ AUCUNE PÉRIODE NE COUVRE LA DATE → BLOCAGE');
{
  const e = exp({ expense_date: '2026-12-30' }); // dans le trou
  blocked('dépense datée 30/12/2026 (aucune période)', run(e), 'aucune période');
}

console.log(`\n═══ RÉSULTAT PÉRIODE AUTO : ${pass} OK · ${fail} échec(s) ═══`);
process.exit(fail ? 1 : 0);
