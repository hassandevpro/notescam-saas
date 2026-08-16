// ─────────────────────────────────────────────────────────────────────────────
// COÛT RÉSEAU DU CHARGEMENT DE L'ÉCOLE — npm run perf:network
// ─────────────────────────────────────────────────────────────────────────────
// `_refreshFromSupabase` retire TOUT : classes, matières, élèves, NOTES, absences,
// enseignants, personnel, frais, paiements, grilles, périodes, unités, affectations.
// La table `grades` porte UNE LIGNE PAR NOTE — (élève × matière × séquence) — et
// PostgREST plafonne chaque requête à 1000 lignes, donc la pagination enchaîne
// les allers-retours.
//
// Ce script ne devine rien : il construit une ligne réelle (mêmes colonnes que
// `supabase_sprint2.sql`), mesure son poids JSON, et déroule l'arithmétique pour
// des tailles d'établissement réelles, à des latences de terrain.

const PAGE_SIZE = 1000;                 // plafond PostgREST (lib/schoolService.js)
const CONCURRENCY = 6;                  // pages demandées de front (fetchAllRows)
const SEQS = 6;                         // séquences par année
const SUBJECTS = 15;                    // matières par classe

// Ligne telle que renvoyée par `select('*')`.
const gradeRow = {
  id: '3f2b9c14-8a7e-4d51-9b02-6f1c7d3e5a89',
  school_id: 'ab12cd34-0000-4000-8000-000000000001',
  class_id: 'c9e1a7b2-45d6-4f83-9a10-2b7c8d4e6f30',
  student_id: '7d4e2f18-93ab-4c05-8e61-1a2b3c4d5e6f',
  subject_id: '5b8c1d3a-6e2f-4970-b1c8-9d0e7f6a5b41',
  sequence: 3,
  value: '14.5',
  updated_at: '2026-08-15T09:41:22.187Z',
};
// Seules ces colonnes servent à construire le gradeMap (gradeRowsToMap).
const NEEDED = ['class_id', 'student_id', 'subject_id', 'sequence', 'value'];
const slim = Object.fromEntries(NEEDED.map((k) => [k, gradeRow[k]]));

const FULL_B = Buffer.byteLength(JSON.stringify(gradeRow)) + 1;   // + virgule
const SLIM_B = Buffer.byteLength(JSON.stringify(slim)) + 1;
const GZIP = 0.12;   // JSON très répétitif (UUID + clés) : ~8:1 en gzip

console.log(`Poids d'une ligne de note : select('*') ${FULL_B} o · colonnes utiles ${SLIM_B} o`
  + ` (${Math.round((1 - SLIM_B / FULL_B) * 100)} % de moins)\n`);

const fmtMo = (b) => `${(b / 1048576).toFixed(1)} Mo`;
const fmtS = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

console.log('  élèves | notes en base | requêtes | JSON select(*) |  gzip  | colonnes utiles (gzip)');
console.log('  -------+---------------+----------+----------------+--------+-----------------------');
const sizes = [200, 500, 1000, 1600, 3300];
const rows = [];
for (const n of sizes) {
  const grades = n * SUBJECTS * SEQS;
  const reqs = Math.ceil(grades / PAGE_SIZE);
  const full = grades * FULL_B;
  const lean = grades * SLIM_B;
  rows.push({ n, grades, reqs, full, lean });
  console.log(`  ${String(n).padStart(6)} | ${String(grades).padStart(13)} | ${String(reqs).padStart(8)} |`
    + ` ${fmtMo(full).padStart(14)} | ${fmtMo(full * GZIP).padStart(6)} | ${fmtMo(lean * GZIP).padStart(21)}`);
}

// ── Temps de chargement selon le réseau ──────────────────────────────────────
// AVANT : pagination séquentielle, chaque page payait un aller-retour complet.
const NETWORKS = [
  { label: 'fibre / bureau        ', rtt: 30,  mbps: 50 },
  { label: 'ADSL urbain           ', rtt: 120, mbps: 8 },
  { label: '4G correcte           ', rtt: 180, mbps: 5 },
  { label: '3G / zone rurale      ', rtt: 350, mbps: 1.5 },
];

console.log('\n  AVANT correction — select(*) et pagination séquentielle :\n');
console.log('  réseau                 |   500 élèves |  1000 élèves |  1600 élèves');
console.log('  -----------------------+--------------+--------------+-------------');
for (const net of NETWORKS) {
  const cells = [500, 1000, 1600].map((n) => {
    const r = rows.find((x) => x.n === n);
    const transfer = (r.full * GZIP * 8) / (net.mbps * 1e6) * 1000;   // ms
    return fmtS(r.reqs * net.rtt + transfer).padStart(12);
  });
  console.log(`  ${net.label} | ${cells.join(' | ')}`);
}

console.log('\n  APRÈS correction — 5 colonnes utiles, 6 pages de front :\n');
console.log('  réseau                 |   500 élèves |  1000 élèves |  1600 élèves');
console.log('  -----------------------+--------------+--------------+-------------');
for (const net of NETWORKS) {
  const cells = [500, 1000, 1600].map((n) => {
    const r = rows.find((x) => x.n === n);
    const reqs = Math.ceil(Math.ceil(r.grades / PAGE_SIZE) / CONCURRENCY);
    const transfer = (r.lean * GZIP * 8) / (net.mbps * 1e6) * 1000;
    return fmtS(reqs * net.rtt + transfer).padStart(12);
  });
  console.log(`  ${net.label} | ${cells.join(' | ')}`);
}

console.log(`\n  Rappel : ce rechargement complet part à l ouverture de session et au retour de`);
console.log(`  connexion. Il ne part PLUS après un vidage de la file de synchro (corrigé) :`);
console.log(`  l application vient d écrire ces lignes, elle les connaît déjà.`);
