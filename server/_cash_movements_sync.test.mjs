// LE JOURNAL DE CAISSE TRAVERSE-T-IL LA SYNCHRONISATION, DANS LES DEUX SENS ?
//
// Ce fichier existe parce que `cash_movements` a été déclarée dans six listes
// sur sept, et que le test de contrat — qui n'en lisait que six — passait quand
// même. La table montait et descendait sans jamais être COMPARÉE.
//
// Il reprend donc le principe de `_sync_contract.test.mjs` : le Cloud simulé lit
// la VRAIE liste `ALLOWED` de sync-push et applique le MÊME départage LWW. Un
// faux Cloud permissif ne prouverait rien.
//
// Ce qui est vérifié ici, et nulle part ailleurs :
//   • la montée LAN → Cloud des entrées, des reports et des retraits ;
//   • la descente Cloud → LAN, et l'ordre FK (school_units avant la caisse) ;
//   • l'absence de doublon à la relance, dans les deux sens ;
//   • les refus NOMMÉS (nature inconnue, montant négatif, hors périmètre) ;
//   • le conflit : qui gagne, et que le perdant ne soit pas perdu en silence ;
//   • et surtout : qu'un aller-retour complet rende les MÊMES soldes de caisse,
//     sans qu'une dépense soit comptée deux fois.
//
// Lancer : node server/_cash_movements_sync.test.mjs
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, '..');
process.env.NOTESCAM_DATA_DIR = mkdtempSync(join(tmpdir(), 'nc-caisse-sync-'));
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── Les listes réelles, lues dans les sources ──────────────────────────────
const lire = (rel) => readFileSync(join(RACINE, rel), 'utf8');
const listeEntre = (txt, debut, fin = ']') => {
  const i = txt.indexOf(debut);
  if (i < 0) return null;
  const j = txt.indexOf(fin, i);
  return j < 0 ? null : new Set([...txt.slice(i, j).matchAll(/["']([a-z][a-z0-9_]+)["']/g)].map((m) => m[1]));
};
const SRC_PUSH = lire('supabase/functions/sync-push/index.ts');
const PUSH_ALLOWED = listeEntre(SRC_PUSH, 'const ALLOWED = new Set([');
const PULL_TABLES = listeEntre(lire('supabase/functions/sync-pull/index.ts'), 'const TABLES = [');
const PULL_ORDER = listeEntre(lire('server/cloudSync.js'), 'const PULL_ORDER = [');

ok(PUSH_ALLOWED?.has('cash_movements'), '1. sync-push accepte cash_movements');
ok(PULL_TABLES?.has('cash_movements'), '2. sync-pull renvoie cash_movements');
ok(PULL_ORDER?.has('cash_movements'), '3. le LAN sait appliquer cash_movements à la descente');

// L'ordre FK : la caisse référence school_units, qui doit être appliquée avant.
const ordre = [...PULL_ORDER];
ok(ordre.indexOf('cash_movements') > ordre.indexOf('school_units'),
  '4. PULL_ORDER applique school_units AVANT la caisse (FK school_unit_id)',
  { units: ordre.indexOf('school_units'), caisse: ordre.indexOf('cash_movements') });

// Le comparateur LWW du Cloud doit rester celui des trois clés. S'il dérive, le
// Cloud et le LAN départageraient différemment et les conflits seraient instables.
ok(/updated_at/.test(SRC_PUSH) && /version/.test(SRC_PUSH) && /device_id/.test(SRC_PUSH)
   && /function wins\(/.test(SRC_PUSH),
  '5. sync-push départage toujours sur (updated_at, version, device_id)');

// ── Le LAN réel ────────────────────────────────────────────────────────────
const { db, SYNCED_TABLES, ALLOWED_TABLES } = await import('./db.js');
const { runQuery } = await import('./query.js');
const { rawUpsert, syncOnce } = await import('./cloudSync.js');

ok(SYNCED_TABLES.has('cash_movements'), '6. le LAN estampille et met en outbox cash_movements');
ok(ALLOWED_TABLES.has('cash_movements'), '7. cash_movements est accessible par l’API générique (sauvegarde incluse)');

const ECOLE = 'ec1', AUTRE = 'ec2';
const UNITE = 'u-college';
db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(ECOLE, 'GENIUS');
db.prepare('INSERT INTO schools (id,name) VALUES (?,?)').run(AUTRE, 'AUTRE ECOLE');
db.prepare('INSERT INTO school_units (id,school_id,section_key,name) VALUES (?,?,?,?)')
  .run(UNITE, ECOLE, 'premier_cycle', 'COLLEGE');

// ── Le Cloud simulé : vraie liste, vrai périmètre, vrai LWW ────────────────
const cloud = new Map();
let refusInconnue = 0, refusPerimetre = 0, refusErreur = 0, perdusLww = 0;
const motifs = [];

// Miroir EXACT de `wins()` dans sync-push : a doit-il écraser b ?
function wins(a, b) {
  if (!b) return true;
  if (!a) return false;
  const at = Date.parse(a.updated_at || 0) || 0;
  const bt = Date.parse(b.updated_at || 0) || 0;
  if (at !== bt) return at > bt;
  const av = a.version || 0, bv = b.version || 0;
  if (av !== bv) return av > bv;
  return String(a.device_id || '') > String(b.device_id || '');
}

// Les CONTRAINTES réelles du Cloud sur cash_movements (supabase_cash_book.sql).
// Le faux Cloud les applique : sans cela il serait plus permissif que le vrai,
// et une ligne refusée en production passerait ici pour un succès.
function contraintesCloud(table, row) {
  if (table !== 'cash_movements') return null;
  const KINDS = ['report', 'approvisionnement', 'recette_diverse', 'transfert_entrant', 'transfert_sortant', 'retrait'];
  if (!KINDS.includes(row.kind)) return 'cash_movements_kind_chk';
  if (Number(row.amount) < 0) return 'cash_movements_amount_chk';
  if (!row.date) return 'null value in column "date"';
  return null;
}

const edge = (jeton) => async (path, body) => {
  if (path === 'sync-pull') return { rows: {}, tombstones: [], cursor: null, tomb_cursor: null };
  if (path !== 'sync-push') throw new Error('chemin inattendu : ' + path);
  let applied = 0, skipped = 0;
  const rejected = [];
  for (const ch of body.changes || []) {
    // Le défaut d'origine : une table inconnue disparaît sans même un compteur.
    if (!PUSH_ALLOWED.has(ch.table)) { refusInconnue++; continue; }
    const scope = ch.table === 'schools' ? 'id' : 'school_id';
    if (ch.row?.[scope] !== jeton) {
      refusPerimetre++; skipped++; rejected.push({ table: ch.table, id: ch.row?.id, reason: 'hors_perimetre_ecole' });
      continue;
    }
    const violation = contraintesCloud(ch.table, ch.row);
    if (violation) {
      refusErreur++; skipped++; motifs.push(violation);
      rejected.push({ table: ch.table, id: ch.row.id, reason: violation });
      continue;
    }
    const existant = cloud.get(`${ch.table}|${ch.row.id}`);
    if (existant && !wins(ch.row, existant)) { perdusLww++; skipped++; continue; }
    cloud.set(`${ch.table}|${ch.row.id}`, { ...ch.row });
    applied++;
  }
  return { applied, skipped, rejected };
};

// ── MONTÉE : les trois natures d'écriture ──────────────────────────────────
// Par `runQuery`, le chemin réel de l'application : seul lui alimente l'outbox.
const MOUVEMENTS = [
  { id: 'm-rep', kind: 'report', amount: 268850, date: '2026-08-01', label: 'Report du 31/07' },
  { id: 'm-app', kind: 'approvisionnement', amount: 2000000, date: '2026-07-01', label: 'Dotation' },
  { id: 'm-ret', kind: 'retrait', amount: 50000, date: '2026-07-15', label: 'Versement en banque' },
];
for (const m of MOUVEMENTS) {
  runQuery({ table: 'cash_movements', action: 'insert',
    values: { ...m, school_id: ECOLE, school_unit_id: UNITE, academic_year: '2025-2026' } });
}
await syncOnce({ edge: edge(ECOLE) });

ok(refusInconnue === 0, '8. MONTÉE : aucune ligne rejetée comme « table inconnue »', refusInconnue);
for (const m of MOUVEMENTS) {
  ok(cloud.get(`cash_movements|${m.id}`)?.kind === m.kind,
    `9. MONTÉE : la nature « ${m.kind} » est arrivée au Cloud`, cloud.get(`cash_movements|${m.id}`)?.kind);
}
ok(cloud.get('cash_movements|m-app')?.amount === 2000000,
  '10. MONTÉE : le montant traverse sans altération');
ok(cloud.get('cash_movements|m-rep')?.school_unit_id === UNITE,
  '11. MONTÉE : la caisse (unité) traverse — sans elle les soldes se mélangeraient');

// ── IDEMPOTENCE de la montée ───────────────────────────────────────────────
const avant = cloud.size;
await syncOnce({ edge: edge(ECOLE) });
ok(cloud.size === avant, '12. MONTÉE : une relance à vide n’ajoute aucune ligne', { avant, apres: cloud.size });

// ── ISOLATION entre établissements ─────────────────────────────────────────
refusPerimetre = 0;
await edge(ECOLE)('sync-push', { changes: [{ table: 'cash_movements', op: 'upsert',
  row: { id: 'intrus', school_id: AUTRE, kind: 'approvisionnement', amount: 999, date: '2026-07-01' } }] });
ok(refusPerimetre === 1 && !cloud.has('cash_movements|intrus'),
  '13. ISOLATION : un mouvement d’une AUTRE école est refusé par le périmètre du jeton',
  { refusPerimetre, present: cloud.has('cash_movements|intrus') });

// ── ERREURS : nommées, jamais avalées ──────────────────────────────────────
refusErreur = 0; motifs.length = 0;
const r = await edge(ECOLE)('sync-push', { changes: [
  { table: 'cash_movements', op: 'upsert', row: { id: 'bad-kind', school_id: ECOLE, kind: 'nawak', amount: 1000, date: '2026-07-01' } },
  { table: 'cash_movements', op: 'upsert', row: { id: 'bad-amount', school_id: ECOLE, kind: 'report', amount: -5, date: '2026-07-01' } },
  { table: 'cash_movements', op: 'upsert', row: { id: 'bad-date', school_id: ECOLE, kind: 'report', amount: 5 } },
] });
ok(refusErreur === 3, '14. ERREURS : les trois lignes invalides sont refusées', refusErreur);
ok(r.rejected.length === 3 && r.rejected.every((x) => x.reason),
  '15. ERREURS : chaque refus est NOMMÉ dans la réponse (le LAN ne purgera pas sa file)', r.rejected);
ok(motifs.some((m) => /kind_chk/.test(m)) && motifs.some((m) => /amount_chk/.test(m)),
  '16. ERREURS : les motifs désignent les contraintes réelles du Cloud', motifs);
for (const id of ['bad-kind', 'bad-amount', 'bad-date']) {
  ok(!cloud.has(`cash_movements|${id}`), `17. ERREURS : « ${id} » n’est pas entrée au Cloud`);
}
// Et le LAN refuse les mêmes : un schéma plus permissif localement ferait naître
// des lignes condamnées à être refusées à chaque montée, pour toujours.
let refuseLocal = 0;
for (const bad of [{ kind: 'nawak', amount: 1000 }, { kind: 'report', amount: -5 }]) {
  try {
    db.prepare('INSERT INTO cash_movements (id,school_id,date,kind,amount) VALUES (?,?,?,?,?)')
      .run(`local-${bad.kind}-${bad.amount}`, ECOLE, '2026-07-01', bad.kind, bad.amount);
  } catch { refuseLocal++; }
}
ok(refuseLocal === 2, '18. ERREURS : le LAN refuse lui aussi nature inconnue et montant négatif', refuseLocal);

// ── CONFLIT : le départage, et le sort du perdant ──────────────────────────
perdusLww = 0;
const plusVieux = { id: 'm-app', school_id: ECOLE, school_unit_id: UNITE, kind: 'approvisionnement',
  amount: 111, date: '2026-07-01', updated_at: '2020-01-01T00:00:00.000Z', version: 1 };
await edge(ECOLE)('sync-push', { changes: [{ table: 'cash_movements', op: 'upsert', row: plusVieux }] });
ok(perdusLww === 1 && cloud.get('cash_movements|m-app').amount === 2000000,
  '19. CONFLIT : une version plus ANCIENNE n’écrase pas le Cloud', cloud.get('cash_movements|m-app').amount);

const plusRecent = { ...plusVieux, amount: 2500000, updated_at: new Date(Date.now() + 600000).toISOString(), version: 9 };
await edge(ECOLE)('sync-push', { changes: [{ table: 'cash_movements', op: 'upsert', row: plusRecent }] });
ok(cloud.get('cash_movements|m-app').amount === 2500000,
  '20. CONFLIT : une version plus RÉCENTE écrase bien', cloud.get('cash_movements|m-app').amount);

// Égalité d'horodatage : c'est `version` qui tranche, puis `device_id`. Sans ce
// départage déterministe, les deux côtés pourraient conclure différemment.
const t = new Date(Date.now() + 900000).toISOString();
ok(wins({ updated_at: t, version: 2 }, { updated_at: t, version: 1 }), '21. CONFLIT : à égalité de date, la version supérieure gagne');
ok(wins({ updated_at: t, version: 1, device_id: 'b' }, { updated_at: t, version: 1, device_id: 'a' }),
  '22. CONFLIT : à égalité de date ET de version, device_id tranche (déterministe)');

// ── DESCENTE : Cloud → LAN ─────────────────────────────────────────────────
const applique = rawUpsert('cash_movements', {
  id: 'm-cloud', school_id: ECOLE, school_unit_id: UNITE, academic_year: '2025-2026',
  date: '2026-08-11', kind: 'approvisionnement', amount: 400000, label: 'Dotation venue du Cloud',
  updated_at: new Date(Date.now() + 600000).toISOString(),
});
ok(applique, '23. DESCENTE : un mouvement venu du Cloud est accepté par le LAN', applique);
ok(db.prepare('SELECT amount FROM cash_movements WHERE id = ?').get('m-cloud')?.amount === 400000,
  '24. DESCENTE : le montant est bien enregistré localement');

// Doublon à la descente : la même ligne deux fois reste UNE ligne.
rawUpsert('cash_movements', {
  id: 'm-cloud', school_id: ECOLE, school_unit_id: UNITE, academic_year: '2025-2026',
  date: '2026-08-11', kind: 'approvisionnement', amount: 400000, label: 'Dotation venue du Cloud',
  updated_at: new Date(Date.now() + 700000).toISOString(),
});
ok(db.prepare("SELECT count(*) n FROM cash_movements WHERE id='m-cloud'").get().n === 1,
  '25. DESCENTE : aucune duplication à la relance');

// Deux reprises du MÊME document, faites des deux côtés : l'identifiant déduit
// de l'origine (src/lib/sourceKey.js) donne le même id, donc une seule ligne.
const { sourceUuid } = await import('../src/lib/sourceKey.js');
const idDeduit = sourceUuid({ schoolId: ECOLE, sourceFile: 'SORTIES DU COLLEGE.xlsx', sourceRow: 4, kind: 'cash' });
for (const cote of ['lan', 'cloud']) {
  rawUpsert('cash_movements', {
    id: idDeduit, school_id: ECOLE, school_unit_id: UNITE, date: '2026-07-01',
    kind: 'approvisionnement', amount: 2000000, source_file: 'SORTIES DU COLLEGE.xlsx', source_row: 4,
    import_batch: cote, updated_at: new Date(Date.now() + (cote === 'lan' ? 800000 : 900000)).toISOString(),
  });
}
ok(db.prepare('SELECT count(*) n FROM cash_movements WHERE source_file = ? AND source_row = 4').get('SORTIES DU COLLEGE.xlsx').n === 1,
  '26. DESCENTE : une reprise faite des DEUX côtés ne crée qu’une ligne (id déduit de l’origine)');

// ── ALLER-RETOUR : les soldes doivent être les MÊMES ───────────────────────
// C'est le contrôle qui compte : une synchro peut tout transporter et produire
// quand même un solde faux, si une dépense est comptée deux fois ou si un
// report est additionné au lieu de positionner le solde.
const { cashLedger, cashTotals } = await import('../src/lib/cashBookEngine.js');

db.prepare('DELETE FROM cash_movements').run();
db.prepare(`INSERT INTO budgets (id,school_id,academic_year,label,status) VALUES ('b',?, '2025-2026','Reprise','active')`).run(ECOLE);
const SCENARIO = {
  mouvements: [
    { id: 'c1', kind: 'approvisionnement', amount: 2000000, date: '2026-07-01' },
    { id: 'c2', kind: 'approvisionnement', amount: 300000, date: '2026-07-28' },
  ],
  depenses: [
    { id: 'd1', amount: 5000, date: '2026-07-01' },
    { id: 'd2', amount: 2026150, date: '2026-07-20' },
  ],
};
for (const m of SCENARIO.mouvements) {
  runQuery({ table: 'cash_movements', action: 'insert',
    values: { ...m, school_id: ECOLE, school_unit_id: UNITE, academic_year: '2025-2026' } });
}
for (const d of SCENARIO.depenses) {
  runQuery({ table: 'budget_expenses', action: 'insert',
    values: { id: d.id, school_id: ECOLE, budget_id: 'b', school_unit_id: UNITE,
      amount: d.amount, status: 'paid', expense_date: d.date } });
}
const soldeLan = cashTotals(cashLedger({
  movements: db.prepare('SELECT * FROM cash_movements').all(),
  expenses: db.prepare('SELECT * FROM budget_expenses').all(),
  unitId: UNITE,
}));

cloud.clear();
await syncOnce({ edge: edge(ECOLE) });
const versCloud = (table) => [...cloud.entries()].filter(([k]) => k.startsWith(`${table}|`)).map(([, v]) => v);
const soldeCloud = cashTotals(cashLedger({
  movements: versCloud('cash_movements'), expenses: versCloud('budget_expenses'), unitId: UNITE,
}));

ok(versCloud('cash_movements').length === 2, '27. ALLER-RETOUR : 2 mouvements au Cloud, pas plus', versCloud('cash_movements').length);
ok(versCloud('budget_expenses').length === 2, '28. ALLER-RETOUR : 2 dépenses au Cloud, pas plus', versCloud('budget_expenses').length);
ok(soldeLan.solde === soldeCloud.solde,
  `29. ALLER-RETOUR : le solde de caisse est IDENTIQUE des deux côtés (${soldeLan.solde})`,
  { lan: soldeLan.solde, cloud: soldeCloud.solde });
ok(soldeLan.solde === 268850, '30. ALLER-RETOUR : et c’est le bon solde (2 300 000 − 2 031 150)', soldeLan.solde);
ok(soldeCloud.entrees === 2300000 && soldeCloud.depenses === 2031150,
  '31. ALLER-RETOUR : entrées et dépenses ne sont ni confondues ni doublées',
  { entrees: soldeCloud.entrees, depenses: soldeCloud.depenses });

// Aucune dépense ne doit se retrouver recopiée dans le journal de caisse : ce
// serait la double comptabilisation que toute l'architecture cherche à éviter.
ok(versCloud('cash_movements').every((m) => m.kind !== 'depense'),
  '32. ALLER-RETOUR : aucune dépense recopiée dans cash_movements (pas de double comptabilisation)');

// Un report ne s'additionne pas : on l'ajoute et le solde ne doit pas bouger.
runQuery({ table: 'cash_movements', action: 'insert',
  values: { id: 'c3', kind: 'report', amount: 268850, date: '2026-07-31',
    school_id: ECOLE, school_unit_id: UNITE, academic_year: '2025-2026' } });
await syncOnce({ edge: edge(ECOLE) });
const apresReport = cashTotals(cashLedger({
  movements: versCloud('cash_movements'), expenses: versCloud('budget_expenses'), unitId: UNITE,
}));
ok(apresReport.solde === 268850, '33. ALLER-RETOUR : un report POSITIONNE le solde, il ne s’y ajoute pas', apresReport.solde);
ok(apresReport.entrees === 2300000, '34. ALLER-RETOUR : le report n’entre pas dans les entrées', apresReport.entrees);

console.log(`\n=== ${fail ? 'ÉCHEC' : 'OK'} : ${pass} ok, ${fail} ko ===`);
process.exit(fail ? 1 : 0);
