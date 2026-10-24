#!/usr/bin/env node
// Reprise d'un cahier de caisse Excel dans NotesCam.
//
// N'ÉCRIT RIEN NULLE PART. Le script lit les classeurs, classe les écritures et
// PRODUIT du SQL ; c'est un humain qui décide de l'exécuter. C'est volontaire :
// une reprise comptable ne doit pas pouvoir partir d'un coup de molette.
//
// Ce qui va où :
//   • SORTIES  →  budget_expenses (statut `paid` : l'argent est sorti du tiroir)
//   • ENTREES  →  cash_movements, kind 'approvisionnement'
//   • REPORT   →  cash_movements, kind 'report' (positionne le solde, n'ajoute rien)
//   • sous-totaux, totaux mensuels, annexes bancaires → RIEN, ce sont des contrôles
//
// IDEMPOTENCE. L'`id` de chaque ligne est DÉDUIT de son origine (fichier + ligne)
// via src/lib/sourceKey.js. Relancer la reprise réécrit les mêmes lignes au lieu
// d'en créer de nouvelles, et deux reprises faites de part et d'autre (LAN et
// Cloud) produisent les mêmes identifiants. Aucun index unique n'est nécessaire
// — il bloquerait la file de synchro entière au premier conflit.
//
// Usage :
//   node scripts/import-caisse-genius.mjs \
//     --school <uuid> --from 2026-06-01 --to 2026-08-31 \
//     --fichier "SORTIES DU COLLEGE.xlsx=/chemin/f.xlsx:college" \
//     --fichier "DEPENSES 2027.xlsx=/chemin/g.xlsx:complexe" \
//     --unite college=<uuid> --budget "Reprise 2025-2026" --annee 2025-2026 \
//     --sql out/reprise.sql --csv out/previsualisation.csv
//
// Dans « label=chemin:caisse », `caisse` vaut `complexe` (school_unit_id NULL)
// ou le nom d'une unité passée par --unite.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readCashBook } from './lib/caisseWorkbook.mjs';
import { sourceUuid, uuidV5 } from '../src/lib/sourceKey.js';

// ── Arguments ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const optAll = (name) => argv.reduce((acc, a, i) => (a === `--${name}` && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);

const SCHOOL = opt('school');
const FROM = opt('from');
const TO = opt('to');
const ANNEE = opt('annee', '2025-2026');
const BUDGET_LABEL = opt('budget', `Reprise de caisse ${ANNEE}`);
const BATCH = opt('batch', `reprise-${new Date().toISOString().slice(0, 10)}`);
const SQL_OUT = opt('sql');
const CSV_OUT = opt('csv');

if (!SCHOOL) {
  console.error('--school <uuid> est requis.');
  process.exit(2);
}
const UNITES = new Map(optAll('unite').map((s) => {
  const i = s.indexOf('=');
  return [s.slice(0, i), s.slice(i + 1)];
}));
const FICHIERS = optAll('fichier').map((s) => {
  const eq = s.indexOf('=');
  const label = s.slice(0, eq);
  const reste = s.slice(eq + 1);
  const sep = reste.lastIndexOf(':');
  const chemin = sep > 1 ? reste.slice(0, sep) : reste;
  const caisse = sep > 1 ? reste.slice(sep + 1) : 'complexe';
  if (caisse !== 'complexe' && !UNITES.has(caisse)) {
    console.error(`Caisse « ${caisse} » inconnue : ajoutez --unite ${caisse}=<uuid>.`);
    process.exit(2);
  }
  return { label, chemin, caisse, unitId: caisse === 'complexe' ? null : UNITES.get(caisse) };
});
if (!FICHIERS.length) { console.error('Au moins un --fichier est requis.'); process.exit(2); }

const dansPerimetre = (d) => !!d && (!FROM || d >= FROM) && (!TO || d <= TO);
const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('fr-FR'));

// ── Lecture ─────────────────────────────────────────────────────────────────
const retenues = [];     // { op, unitId, cible }
const horsPerimetre = [];
const aVerifier = [];    // opérations du périmètre qui ne doivent PAS partir en base
const lectures = [];

for (const f of FICHIERS) {
  const r = readCashBook(f.chemin, {
    label: f.label,
    etabResolver: (titre) => {
      const T = titre.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
      return T.includes('COLLEGE') && !T.includes('SCHOOL') ? 'COLLEGE' : 'PRIMAIRE';
    },
  });
  lectures.push({ f, r });

  for (const op of r.ops) {
    if (!dansPerimetre(op.date)) { horsPerimetre.push(op); continue; }
    // Une opération sans date exploitable ou sans montant n'est pas importable :
    // elle serait rattachée à un mois comptable arbitraire.
    const motifs = r.anomalies
      .filter((a) => a.row === op.row && a.file === op.file
        && /aucune date|montant non numérique|année saisie|date non reconnue|mois invalide|jour invalide/.test(a.probleme))
      .map((a) => a.probleme);
    if (motifs.length) { aVerifier.push({ op, motifs }); continue; }
    retenues.push({ op, unitId: f.unitId, caisse: f.caisse });
  }

  // Les reports servent à poser le solde d'ouverture : on les reprend aussi,
  // sinon le solde du premier mois importé partirait de zéro.
  for (const c of r.controls) {
    if (c.type !== 'report_solde') continue;
    // `c.date` est déjà normalisée par le lecteur. Le repli sur le 1er du mois ne
    // sert qu'aux reports dont la cellule de date est vide : sans date, le report
    // ne pourrait pas ouvrir son mois.
    const date = c.date || (c.moisSection ? `${c.moisSection}-01` : null);
    if (!dansPerimetre(date) || !c.montant) continue;
    retenues.push({ op: { ...c, date, type: 'report', montant: c.montant }, unitId: f.unitId, caisse: f.caisse });
  }
}

// ── Périodes budgétaires : une par mois réellement présent ───────────────────
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const moisPresents = [...new Set(retenues.filter((x) => x.op.type === 'depense').map((x) => x.op.date.slice(0, 7)))].sort();
const BUDGET_ID = uuidV5(`budget|${SCHOOL}|${ANNEE}|${BUDGET_LABEL}`);
const periodes = moisPresents.map((m) => {
  const [y, mm] = m.split('-').map(Number);
  const fin = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
  return {
    id: uuidV5(`periode|${SCHOOL}|${ANNEE}|${m}`),
    mois: m,
    nom: `${MOIS_FR[mm - 1]} ${y}`,
    debut: `${m}-01`,
    fin,
  };
});
const periodeDe = (date) => periodes.find((p) => date >= p.debut && date <= p.fin)?.id || null;

// ── Lignes à écrire ─────────────────────────────────────────────────────────
const depenses = [], mouvements = [], balancesAValider = [];
for (const { op, unitId, caisse } of retenues) {
  // LA BALANCE DU DOCUMENT, EN DEUX CHAMPS DISTINCTS.
  //
  // `source_balance` ne reçoit QUE la valeur numérique validée. `source_balance_raw`
  // conserve ce que le document écrit, tel quel. Confondre les deux faisait
  // disparaître en silence toute balance textuelle : le cahier du primaire porte
  // « 254 08 » (un chiffre manquant), et l'anomalie s'évaporait avec la valeur.
  //
  // Rien n'est converti : lire « 254 08 » comme 25408 serait une interprétation
  // de la machine, et elle est probablement fausse (le solde recalculé vaut
  // 254 080). La ligne part donc en validation humaine.
  const brut = op.balanceSource;
  const balanceNumerique = typeof brut === 'number' ? brut : null;
  const balanceBrute = brut === null || brut === undefined ? null : String(brut);
  const aValiderBalance = balanceNumerique === null && balanceBrute !== null;
  if (aValiderBalance) balancesAValider.push({ op, brut: balanceBrute });
  const commun = {
    source_file: op.file, source_row: op.row, import_batch: BATCH,
    source_balance: balanceNumerique,
    source_balance_raw: balanceBrute,
  };
  if (op.type === 'depense') {
    depenses.push({
      id: sourceUuid({ schoolId: SCHOOL, sourceFile: op.file, sourceRow: op.row, kind: 'expense' }),
      school_id: SCHOOL, budget_id: BUDGET_ID,
      budget_chapter_id: null,                 // aucune imputation inventée
      budget_period_id: periodeDe(op.date),
      school_unit_id: unitId,
      category: null, subcategory: null, sector: null, supplier: null,
      amount: op.montant,
      // Le n° d'ordre du cahier EST la référence de la pièce.
      receipt: op.ordre === null || op.ordre === undefined ? null : String(op.ordre),
      status: 'paid',                           // la dépense a quitté la caisse
      expense_date: op.date,
      notes: op.libelle,
      created_by: `import:${BATCH}`,
      caisse, ...commun,
    });
  } else {
    mouvements.push({
      id: sourceUuid({ schoolId: SCHOOL, sourceFile: op.file, sourceRow: op.row, kind: 'cash' }),
      school_id: SCHOOL, school_unit_id: unitId, academic_year: ANNEE,
      date: op.date,
      kind: op.type === 'report' ? 'report' : 'approvisionnement',
      amount: op.montant,
      label: op.libelle || (op.type === 'report' ? 'Report de solde' : 'Approvisionnement de caisse'),
      reference: op.ordre === null || op.ordre === undefined ? null : String(op.ordre),
      notes: null, created_by: `import:${BATCH}`,
      caisse, ...commun,
    });
  }
}

// ── Prévisualisation ────────────────────────────────────────────────────────
console.log('═'.repeat(94));
console.log(`REPRISE DE CAISSE — prévisualisation (AUCUNE écriture)   école ${SCHOOL}`);
console.log(`périmètre : ${FROM || '—'} → ${TO || '—'}   |   lot : ${BATCH}`);
console.log('═'.repeat(94));

for (const { f, r } of lectures) {
  console.log(`\n▸ ${f.label}  →  caisse « ${f.caisse} »`);
  for (const s of r.sections) {
    const q = s.resume;
    const c = q.concordance;
    const etat = !q.totalInscrit ? 'mois ouvert (pas de ligne TOTAL)'
      : (c.sorties && c.entrees && c.solde ? 'rapproché' : 'ÉCART avec la ligne TOTAL');
    console.log(`   ${s.annee}-${String(s.mois).padStart(2, '0')}  dép. ${String(q.nbDepenses).padStart(3)} / ${fmt(q.sommeDepenses).padStart(12)}`
      + `   entrées ${String(q.nbAppros).padStart(2)} / ${fmt(q.sommeAppros).padStart(11)}`
      + `   solde ${fmt(q.soldeFinal).padStart(11)}   ${etat}`);
  }
  if (r.ecarts.length) {
    console.log(`   écarts de solde : ${r.ecarts.length}`);
    for (const e of r.ecarts) console.log(`     ligne ${e.row} : inscrit « ${e.brut} » / recalculé ${fmt(e.calcule)} — ${e.probleme}`);
  }
  if (r.doublons.length) {
    console.log(`   doublons POTENTIELS (à confirmer, jamais fusionnés) : ${r.doublons.length}`);
    for (const d of r.doublons) console.log(`     lignes ${d.rows.join(', ')} : ${d.cle}`);
  }
}

console.log(`\n── À ÉCRIRE ───────────────────────────────────────────────────────────`);
const parMois = new Map();
for (const d of depenses) {
  const k = `${d.caisse} | ${d.expense_date.slice(0, 7)}`;
  if (!parMois.has(k)) parMois.set(k, { dep: 0, nDep: 0, ent: 0, nEnt: 0 });
  const e = parMois.get(k); e.dep += d.amount; e.nDep++;
}
for (const m of mouvements) {
  if (m.kind === 'report') continue;            // un report n'est pas une entrée
  const k = `${m.caisse} | ${m.date.slice(0, 7)}`;
  if (!parMois.has(k)) parMois.set(k, { dep: 0, nDep: 0, ent: 0, nEnt: 0 });
  const e = parMois.get(k); e.ent += m.amount; e.nEnt++;
}
console.log('  caisse / mois                     dépenses (n)         entrées (n)');
for (const [k, v] of [...parMois].sort()) {
  console.log(`  ${k.padEnd(32)} ${fmt(v.dep).padStart(12)} (${String(v.nDep).padStart(3)})  ${fmt(v.ent).padStart(12)} (${String(v.nEnt).padStart(2)})`);
}
const totDep = depenses.reduce((a, b) => a + b.amount, 0);
const totEnt = mouvements.filter((m) => m.kind !== 'report').reduce((a, b) => a + b.amount, 0);
const totRep = mouvements.filter((m) => m.kind === 'report').reduce((a, b) => a + b.amount, 0);
console.log(`  ${'TOTAL'.padEnd(32)} ${fmt(totDep).padStart(12)} (${String(depenses.length).padStart(3)})  ${fmt(totEnt).padStart(12)} (${String(mouvements.filter((m) => m.kind !== 'report').length).padStart(2)})`);
console.log(`\n  budget autonome créé : « ${BUDGET_LABEL} » (${ANNEE}) — ${BUDGET_ID}`);
console.log(`  périodes mensuelles  : ${periodes.map((p) => p.nom).join(', ')}`);
console.log(`  reports repris       : ${mouvements.filter((m) => m.kind === 'report').length} pour ${fmt(totRep)} (positionnent le solde, hors entrées)`);
console.log(`  hors périmètre       : ${horsPerimetre.length} opération(s) ignorée(s)`);
// Les balances illisibles n'empêchent PAS l'opération d'être reprise : le
// montant, lui, est net. C'est la balance seule qui attend un arbitrage.
if (balancesAValider.length) {
  console.log(`\n  ⚠ BALANCES SOURCE À VALIDER : ${balancesAValider.length} ligne(s)`);
  console.log(`    La valeur du document est conservée telle quelle (source_balance_raw) ;`);
  console.log(`    aucune conversion n'est faite, et source_balance reste vide jusqu'à votre arbitrage.`);
  for (const { op, brut } of balancesAValider) {
    console.log(`    ${op.file} #${op.row} : balance inscrite « ${brut} » — montant de la ligne ${fmt(op.montant)}`);
  }
}
console.log(`\n  À VÉRIFIER (non importées) : ${aVerifier.length}`);
for (const { op, motifs } of aVerifier.slice(0, 20)) {
  console.log(`     ${op.file} ligne ${op.row} : ${fmt(op.montant)} — ${motifs.join(' ; ')} — « ${(op.libelle || '').slice(0, 50)} »`);
}
if (aVerifier.length > 20) console.log(`     … et ${aVerifier.length - 20} autres (voir le CSV)`);

// ── CSV de prévisualisation ─────────────────────────────────────────────────
if (CSV_OUT) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Une ligne dont la balance brute existe sans valeur numérique validée attend
  // un arbitrage : elle s'importe, mais son solde source reste à trancher.
  const aValider = (x) => x.source_balance === null && x.source_balance_raw !== null;
  const head = ['cible', 'caisse', 'unite_id', 'date', 'type', 'reference', 'libelle', 'montant',
    'solde_source', 'solde_source_brut', 'fichier', 'ligne', 'periode', 'statut', 'anomalie'];
  const rows = [
    ...depenses.map((d) => ['budget_expenses', d.caisse, d.school_unit_id, d.expense_date, 'depense',
      d.receipt, d.notes, d.amount, d.source_balance, d.source_balance_raw, d.source_file, d.source_row,
      periodes.find((p) => p.id === d.budget_period_id)?.nom || '',
      aValider(d) ? 'A_IMPORTER_BALANCE_A_VALIDER' : 'A_IMPORTER',
      aValider(d) ? `balance source illisible « ${d.source_balance_raw} » : conservée brute, non convertie` : '']),
    ...mouvements.map((m) => ['cash_movements', m.caisse, m.school_unit_id, m.date, m.kind,
      m.reference, m.label, m.amount, m.source_balance, m.source_balance_raw, m.source_file, m.source_row, '',
      aValider(m) ? 'A_IMPORTER_BALANCE_A_VALIDER' : 'A_IMPORTER',
      aValider(m) ? `balance source illisible « ${m.source_balance_raw} » : conservée brute, non convertie` : '']),
    ...aVerifier.map(({ op, motifs }) => ['—', '', '', op.dateSource || '', op.type,
      op.ordre ?? '', op.libelle || '', op.montant, '', op.balanceSource ?? '', op.file, op.row, '',
      'A_VERIFIER', motifs.join(' ; ')]),
  ];
  mkdirSync(dirname(CSV_OUT), { recursive: true });
  writeFileSync(CSV_OUT, '﻿' + [head.join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n'), 'utf8');
  console.log(`\nCSV de prévisualisation : ${CSV_OUT}`);
}

// ── SQL ─────────────────────────────────────────────────────────────────────
if (SQL_OUT) {
  const q = (v) => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  const L = [];
  L.push('-- Reprise de caisse NotesCam — généré par scripts/import-caisse-genius.mjs');
  L.push(`-- école ${SCHOOL} | périmètre ${FROM || '—'} → ${TO || '—'} | lot ${BATCH}`);
  L.push('-- Idempotent : les identifiants sont déduits de (fichier, ligne). Relancer réécrit, ne duplique pas.');
  L.push('-- PRÉREQUIS : supabase_cash_book.sql appliqué.');
  L.push('BEGIN;');
  L.push('');
  L.push('-- Budget AUTONOME de reprise : aucun parent, sa propre année, ses propres périodes.');
  L.push('-- Il ne consomme donc aucune enveloppe du budget prévisionnel en cours.');
  L.push('--');
  L.push("-- `tier` reste NULL, DÉLIBÉRÉMENT. Un budget `tier = 'annual'` doit porter une");
  L.push('-- enveloppe prévisionnelle (CHECK budgets_tier_annual) : une reprise ne prévoit');
  L.push("-- rien, elle CONSTATE. Et un second budget 'annual' entrerait en concurrence");
  L.push("-- avec le prévisionnel 2026-2027 dans l'écran Budgets, qui retient le premier");
  L.push("-- `tier = 'annual'` trouvé. Hors hiérarchie v3, la reprise ne gêne personne.");
  L.push(`INSERT INTO budgets (id, school_id, academic_year, period_type, sector, label, status, tier, parent_budget_id, notes, start_date, end_date, envelope_amount)`);
  L.push(`VALUES (${q(BUDGET_ID)}, ${q(SCHOOL)}, ${q(ANNEE)}, 'annuel', 'general', ${q(BUDGET_LABEL)}, 'active', NULL, NULL,`);
  L.push(`        ${q(`Reprise des cahiers de caisse (lot ${BATCH}). Montants CONSTATÉS, aucune prévision. Hors hiérarchie budgétaire v3 (tier NULL) pour ne pas concurrencer le budget prévisionnel en cours.`)},`);
  L.push(`        ${q(periodes[0]?.debut || null)}, ${q(periodes[periodes.length - 1]?.fin || null)}, ${q(totDep)})`);
  L.push('ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, status = EXCLUDED.status,');
  L.push('  envelope_amount = EXCLUDED.envelope_amount, notes = EXCLUDED.notes, updated_at = now();');
  L.push('');
  for (const p of periodes) {
    L.push(`INSERT INTO budget_periods (id, school_id, academic_year, name, start_date, end_date, description, position)`);
    L.push(`VALUES (${q(p.id)}, ${q(SCHOOL)}, ${q(ANNEE)}, ${q(p.nom)}, ${q(p.debut)}, ${q(p.fin)}, 'Reprise de caisse', ${periodes.indexOf(p)})`);
    L.push('ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, updated_at = now();');
  }
  L.push('');
  // Un INSERT par table, toutes les lignes dans un seul VALUES. Une instruction
  // par ligne serait plus lisible mais quatre fois plus volumineuse, et surtout
  // elle multiplierait les allers-retours : ici, soit tout entre, soit rien.
  L.push(`-- ${depenses.length} dépense(s), statut « paid » : l'argent est sorti de la caisse.`);
  if (depenses.length) {
    // `updated_at` EST DANS LA LISTE DES COLONNES, et pas seulement dans la
    // branche ON CONFLICT ci-dessous.
    //
    // CE QUE SON ABSENCE A COÛTÉ, mesuré en production le 2026-10-24. Un INSERT
    // qui ne la nomme pas laisse la colonne à NULL (elle n'avait pas de valeur
    // par défaut), et la descente Cloud → école est un keyset `(updated_at, id)`
    // dont la fonction `sync-pull` écarte explicitement les lignes sans date.
    // Les 60 dépenses et les 10 mouvements de caisse importés chez THE GENIUS
    // le 2026-10-18 étaient donc INVISIBLES pour toujours sur leur serveur :
    // le journal de caisse restait vide, et le script de déploiement le disait
    // (« la caisse resterait vide ») sans que personne ne voie pourquoi.
    // La branche ON CONFLICT, elle, la posait déjà : seul le PREMIER import
    // était touché, c'est-à-dire le seul qui compte.
    L.push(`INSERT INTO budget_expenses (id, school_id, budget_id, budget_chapter_id, budget_period_id, school_unit_id,`);
    L.push(`  amount, receipt, status, expense_date, notes, created_by, source_file, source_row, import_batch, source_balance, source_balance_raw, updated_at)`);
    L.push('VALUES');
    L.push(depenses.map((d) => `  (${q(d.id)}, ${q(d.school_id)}, ${q(d.budget_id)}, NULL, ${q(d.budget_period_id)},`
      + ` ${q(d.school_unit_id)}, ${q(d.amount)}, ${q(d.receipt)}, 'paid', ${q(d.expense_date)}, ${q(d.notes)},`
      + ` ${q(d.created_by)}, ${q(d.source_file)}, ${q(d.source_row)}, ${q(d.import_batch)},`
      + ` ${q(d.source_balance)}, ${q(d.source_balance_raw)}, now())`).join(',\n'));
    L.push(`ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, expense_date = EXCLUDED.expense_date,`);
    L.push(`  notes = EXCLUDED.notes, receipt = EXCLUDED.receipt, school_unit_id = EXCLUDED.school_unit_id,`);
    L.push(`  budget_period_id = EXCLUDED.budget_period_id, source_balance = EXCLUDED.source_balance,`);
    L.push(`  source_balance_raw = EXCLUDED.source_balance_raw, updated_at = now();`);
  }
  L.push('');
  L.push(`-- ${mouvements.length} mouvement(s) de caisse (dont ${mouvements.filter((m) => m.kind === 'report').length} report(s)).`);
  if (mouvements.length) {
    // `updated_at` dans la liste des colonnes, même raison qu'au-dessus : sans
    // elle, le mouvement ne descend jamais vers le serveur de l'école.
    L.push(`INSERT INTO cash_movements (id, school_id, school_unit_id, academic_year, date, kind, amount, label,`);
    L.push(`  reference, source_balance, source_balance_raw, notes, source_file, source_row, import_batch, created_by, updated_at)`);
    L.push('VALUES');
    L.push(mouvements.map((m) => `  (${q(m.id)}, ${q(m.school_id)}, ${q(m.school_unit_id)}, ${q(m.academic_year)},`
      + ` ${q(m.date)}, ${q(m.kind)}, ${q(m.amount)}, ${q(m.label)}, ${q(m.reference)}, ${q(m.source_balance)}, ${q(m.source_balance_raw)},`
      + ` ${q(m.notes)}, ${q(m.source_file)}, ${q(m.source_row)}, ${q(m.import_batch)}, ${q(m.created_by)}, now())`).join(',\n'));
    L.push(`ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, date = EXCLUDED.date, kind = EXCLUDED.kind,`);
    L.push(`  label = EXCLUDED.label, reference = EXCLUDED.reference, school_unit_id = EXCLUDED.school_unit_id,`);
    L.push(`  source_balance = EXCLUDED.source_balance, source_balance_raw = EXCLUDED.source_balance_raw, updated_at = now();`);
  }
  L.push('');
  L.push('COMMIT;');
  mkdirSync(dirname(SQL_OUT), { recursive: true });
  writeFileSync(SQL_OUT, L.join('\n') + '\n', 'utf8');
  console.log(`SQL généré (NON exécuté) : ${SQL_OUT}`);
}

console.log('\nAucune base n\'a été modifiée par ce script.');
