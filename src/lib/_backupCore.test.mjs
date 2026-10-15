// LA SAUVEGARDE PREND-ELLE VRAIMENT TOUT, Y COMPRIS LE MODULE DE DEMAIN ?
//
// Ce que ces tests attaquent :
//   • un module ajouté (table inconnue de l'app, avec school_id) entre dans la
//     sauvegarde sans aucune modification du code ;
//   • les secrets n'y entrent jamais, et leur exclusion est visible ;
//   • l'ordre d'insertion respecte les FK, même avec cycle ou auto-référence ;
//   • une restauration n'écrase rien par défaut et ne supprime jamais ;
//   • la sauvegarde d'une autre école est refusée.
import {
  splitCatalog, orderTables, buildBundle, validateBundle, planTable, rowsDiffer,
  isExcludedTable, chunk, backupFileName, BACKUP_FORMAT,
} from './backupCore.js';

let fails = 0;
const ok = (c, m) => { if (c) console.log('  ✓', m); else { fails++; console.error('  ✗', m); } };

console.log('Découverte automatique des modules');
{
  const catalog = [
    { table: 'schools', deps: [] },
    { table: 'students', deps: ['schools', 'classes'] },
    { table: 'classes', deps: ['schools'] },
    { table: 'module_cantine_menus', deps: ['schools'] },      // module « inventé » demain
    { table: 'school_server_tokens', deps: ['schools'] },
    { table: 'lan_pairing_codes', deps: ['schools'] },
    { table: 'school_sms_settings', deps: ['schools'] },
    { table: 'sync_outbox', deps: [] },
  ];
  const { included, excluded } = splitCatalog(catalog);
  const names = included.map((t) => t.table);
  ok(names.includes('module_cantine_menus'), 'une table de module inconnue est incluse sans changer le code');
  ok(!names.some(isExcludedTable), 'aucun secret dans les tables incluses');
  ok(excluded.join(',') === 'lan_pairing_codes,school_server_tokens,school_sms_settings,sync_outbox', 'les exclusions sont listées (jamais silencieuses)');
  ok(!isExcludedTable('notification_outbox') && !isExcludedTable('cash_sessions'), 'pas de faux positif sur des tables métier');
}

console.log('Ordre d’insertion');
{
  const order = orderTables([
    { table: 'grades', deps: ['students', 'subjects'] },
    { table: 'students', deps: ['classes'] },
    { table: 'subjects', deps: ['classes'] },
    { table: 'classes', deps: ['schools'] },
    { table: 'schools', deps: [] },
    { table: 'budgets', deps: ['budgets', 'schools'] },         // auto-référence
    { table: 'a_cycle', deps: ['b_cycle'] }, { table: 'b_cycle', deps: ['a_cycle'] },
  ]);
  const at = (t) => order.indexOf(t);
  ok(order[0] === 'schools', 'schools en premier');
  ok(at('classes') < at('students') && at('students') < at('grades') && at('subjects') < at('grades'), 'parents avant enfants');
  ok(at('budgets') > 0, 'une auto-référence ne bloque pas le tri');
  ok(order.length === 8 && at('a_cycle') >= 0 && at('b_cycle') >= 0, 'un cycle de FK ne fait perdre aucune table');
}

console.log('Validation du fichier');
{
  const S = 'school-1';
  const b = buildBundle({ schoolId: S, catalog: [{ table: 'students' }], tables: { students: [{ id: 'x', school_id: S }] } });
  ok(b.format === BACKUP_FORMAT && b.totalRows === 1 && b.counts.students === 1, 'compteurs du manifeste');
  ok(validateBundle(b, { schoolId: S }).ok, 'sauvegarde de la même école acceptée');
  ok(!validateBundle(b, { schoolId: 'autre' }).ok, 'sauvegarde d’une autre école refusée');
  const mixed = { ...b, tables: { students: [{ id: 'y', school_id: 'intrus' }] } };
  ok(!validateBundle(mixed, { schoolId: S }).ok, 'lignes d’une autre école refusées même si l’en-tête ment');
  const secret = { ...b, tables: { school_server_tokens: [] } };
  ok(!validateBundle(secret, { schoolId: S }).ok, 'une table sensible glissée dans le fichier est refusée');
  ok(!validateBundle({ format: 'x' }, { schoolId: S }).ok && !validateBundle(null).ok, 'fichier étranger refusé');
}

console.log('Plan de restauration');
{
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const p = planTable({ rows, existingKeys: new Set(['a']), mode: 'missing' });
  ok(p.insert.length === 2 && p.update.length === 0 && p.unchanged === 1, 'mode « manquantes » : rien d’existant n’est touché');
  const o = planTable({ rows, existingKeys: new Set(['a']), mode: 'overwrite' });
  ok(o.insert.length === 2 && o.update.length === 1, 'mode « écraser » : les existantes sont remises à l’état sauvegardé');
  const cpk = planTable({ rows: [{ k1: 1, k2: 2 }], existingKeys: new Set(['1|2']), pk: ['k1', 'k2'] });
  ok(cpk.insert.length === 0, 'clé primaire composite gérée');
  ok(!('delete' in p), 'aucune suppression n’est jamais planifiée');
  const ex = new Map([['a', { id: 'a', name: 'X', updated_at: '2027' }], ['b', { id: 'b', name: 'modifié' }]]);
  const d = planTable({ rows: [{ id: 'a', name: 'X', updated_at: '2026' }, { id: 'b', name: 'orig' }], existingRows: ex, mode: 'overwrite' });
  ok(d.update.length === 1 && d.update[0].id === 'b' && d.unchanged === 1, 'mode « écraser » : seules les lignes changées sont réécrites');
  ok(!rowsDiffer({ active: true, tranches: [1, 2] }, { active: 1, tranches: '[1,2]' }), 'booléen/JSON SQLite ≡ Postgres');
  ok(!rowsDiffer({ amount: 5000 }, { amount: '5000' }), 'numeric Postgres (texte) ≡ nombre');
}

console.log('Parité des exclusions JS ↔ SQL cloud');
{
  // Une table exclue d'un côté seulement = un secret exporté par l'autre.
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(new URL('../../supabase_backup_restore.sql', import.meta.url), 'utf8');
  const body = sql.match(/FUNCTION public\._backup_is_excluded[\s\S]*?\$\$([\s\S]*?)\$\$/)[1];
  const sqlRes = [...body.matchAll(/~\*\s*'([^']+)'/g)].map((m) => new RegExp(m[1], 'i'));
  const sqlExcluded = (n) => sqlRes.some((re) => re.test(n));
  const probes = ['school_server_tokens', 'lan_pairing_codes', 'school_credential_keys', 'credential_outbox',
    'pwd_mirror_queue', 'school_sms_settings', 'sync_tombstones', 'school_backups', 'students', 'grades',
    'notification_outbox', 'cash_sessions', 'module_futur', 'api_secrets', 'user_passwords'];
  const diff = probes.filter((p) => sqlExcluded(p) !== isExcludedTable(p));
  ok(diff.length === 0, `mêmes exclusions des deux côtés${diff.length ? ' — divergent : ' + diff.join(', ') : ''}`);
}

console.log('Divers');
ok(chunk([1, 2, 3, 4, 5], 2).length === 3, 'découpage en lots');
ok(/^notescam-ecole-saint-andre-2026-10-15-08-30\.json$/.test(backupFileName('École Saint-André', new Date('2026-10-15T08:30:00Z'))), 'nom de fichier lisible et sûr');

if (fails) { console.error(`\n${fails} échec(s)`); process.exit(1); }
console.log('\nOK');
