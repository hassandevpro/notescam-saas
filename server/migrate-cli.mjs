// server/migrate-cli.mjs
// Migration Cloud → Local/LAN en ligne de commande (packaging, support).
// Usage :
//   npm run migrate:cloud -- --url <supabase_url> --key <anon_key> \
//        --email admin@ecole.cm --password '****' [--local-password '****']
import { runMigration } from './migrate.js';

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args[key] = (next === undefined || next.startsWith('--')) ? true : (i++, next);
  }
}

const onProgress = (e) => {
  if (e.phase === 'analyzed') console.log('  Analyse :', JSON.stringify(e.counts));
  else if (e.phase !== 'assets') console.log('→', e.phase);
};

try {
  const res = await runMigration({
    url: args.url || process.env.VITE_SUPABASE_URL,
    anonKey: args.key || process.env.VITE_SUPABASE_ANON_KEY,
    email: args.email,
    password: args.password,
    localPassword: args['local-password'],
    onProgress,
  });
  console.log('\n✅ Migration terminée —', res.school);
  console.table(res.report.tables);
  if (!res.ok) { console.error('⚠ Intégrité :', res.integrity.mismatches); process.exit(2); }
  console.log('Mode local prêt. Vous pouvez débrancher Internet.');
  process.exit(0);
} catch (e) {
  console.error('❌', e.message);
  process.exit(1);
}
