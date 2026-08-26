// Le CAISSIER voit les MÊMES ONGLETS que le RAF — y compris dans une école DÉJÀ
// amorcée, que le seed (`INSERT OR IGNORE`) ne corrige jamais.
//
// Ce que le test tient, et pourquoi :
//   • l'école héritée est rattrapée      → c'est le cas réel de toutes les écoles en service ;
//   • la personnalisation n'est pas écrasée → le catalogue est éditable par établissement ;
//   • les POUVOIRS ne bougent pas         → ouvrir un onglet n'ouvre aucun droit de décision ;
//   • l'opération est idempotente         → elle tourne à CHAQUE démarrage du serveur.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-caissier-'));

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const { db, ensureCaissierPages } = await import('./db.js');

const RAF_PAGES = ['/app/groupe', '/app/reports', '/app/budgets', '/app/budget-global', '/app/depenses'];
const ins = db.prepare(`INSERT INTO governance_roles
  (id, school_id, code, name, description, rank, scope, sector, permissions, pages, dashboards, workflows, active, is_system)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,1)`);
const pagesOf = (school, code) => JSON.parse(
  db.prepare('SELECT pages FROM governance_roles WHERE school_id = ? AND code = ?').get(school, code).pages,
);
const school = (id, name) => db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(id, name);
const role = (school, code, pages, perms = [], wf = []) => ins.run(
  `gr-${school}-${code}`, school, code, code, '', 50, 'complex', null,
  JSON.stringify(perms), JSON.stringify(pages), '[]', JSON.stringify(wf),
);

// ── 1. École HÉRITÉE : caissier borné à /app/depenses, comme toutes celles en service
school('ec-legacy', 'ECOLE HERITEE');
role('ec-legacy', 'raf', RAF_PAGES, ['budget.view'], ['expense.approve']);
role('ec-legacy', 'caissier', ['/app/depenses'], ['budget.view', 'expense.view'], ['expense.pay']);

// ── 2. École PERSONNALISÉE : l'école a ajouté une page au caissier
school('ec-perso', 'ECOLE PERSONNALISEE');
role('ec-perso', 'raf', RAF_PAGES);
role('ec-perso', 'caissier', ['/app/depenses', '/app/fees']);

// ── 3. École SANS RAF : rien à copier, on n'invente pas
school('ec-sansraf', 'ECOLE SANS RAF');
role('ec-sansraf', 'caissier', ['/app/depenses']);

ensureCaissierPages();

const eq = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

ok(eq(pagesOf('ec-legacy', 'caissier'), RAF_PAGES),
  '1. école héritée : le caissier reçoit EXACTEMENT les onglets du RAF', pagesOf('ec-legacy', 'caissier'));

ok(eq(pagesOf('ec-legacy', 'raf'), RAF_PAGES),
  '2. le RAF n’est pas touché', pagesOf('ec-legacy', 'raf'));

{
  const r = db.prepare("SELECT permissions, workflows FROM governance_roles WHERE school_id='ec-legacy' AND code='caissier'").get();
  ok(!JSON.parse(r.workflows).includes('expense.approve') && JSON.parse(r.workflows).includes('expense.pay'),
    '3. POUVOIRS inchangés : il paie, il n’approuve pas', r.workflows);
}

ok(eq(pagesOf('ec-perso', 'caissier'), [...RAF_PAGES, '/app/fees']),
  '4. personnalisation préservée : union, jamais remplacement', pagesOf('ec-perso', 'caissier'));

ok(eq(pagesOf('ec-sansraf', 'caissier'), ['/app/depenses']),
  '5. école sans RAF : rien n’est inventé', pagesOf('ec-sansraf', 'caissier'));

{
  const avant = db.prepare('SELECT id, pages FROM governance_roles ORDER BY id').all().map((r) => r.id + r.pages).join('|');
  ensureCaissierPages();
  const apres = db.prepare('SELECT id, pages FROM governance_roles ORDER BY id').all().map((r) => r.id + r.pages).join('|');
  ok(avant === apres, '6. idempotent : un second passage n’écrit rien');
}

console.log(`\n=== ${fail === 0 ? 'OK' : 'ECHEC'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail === 0 ? 0 : 1);
