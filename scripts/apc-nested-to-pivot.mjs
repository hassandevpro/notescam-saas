#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Convertisseur : format imbriqué « par classe » → format pivot d'import APC.
//
// Accepte des fichiers de la forme :
//   { "PremierCycle": { "6eme": { "trimestre1": { "Anglais": [..], "Francais":[..] } } } }
// ou directement, sans wrapper :
//   { "4eme": { "trimestre1": { "Anglais": [..] } }, "3eme": { ... } }
//
// Fusionne plusieurs fichiers en UNE version de référentiel et écrit un pivot
// conforme à docs/APC_REFERENTIEL_FORMAT.md. Tout libellé de classe/trimestre/
// matière inconnu ARRÊTE la conversion (on n'invente / ne supprime rien).
//
// USAGE
//   node scripts/apc-nested-to-pivot.mjs --label "MINESEC Premier cycle 2024" \
//        --out examples/apc/referentiel-premier-cycle.json <f1.json> <f2.json> ...
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
function optVal(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const label  = optVal('--label', 'MINESEC Premier cycle');
const source = optVal('--source', '');
const out    = optVal('--out', 'referentiel-apc.pivot.json');
const files  = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--label' && args[i - 1] !== '--source' && args[i - 1] !== '--out');

function die(msg) { console.error(`❌ ${msg}`); process.exit(1); }
if (!files.length) die('Aucun fichier source.\n   node scripts/apc-nested-to-pivot.mjs --label "…" --out pivot.json <f1.json> [f2.json…]');

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// Slugs cibles (alignés sur le seed de supabase_apc_minesec.sql).
const CLASSE_MAP = { '6eme': '6e', 'sixieme': '6e', '5eme': '5e', 'cinquieme': '5e', '4eme': '4e', 'quatrieme': '4e', '3eme': '3e', 'troisieme': '3e' };
const TRIM_MAP   = { 'trimestre1': 't1', 't1': 't1', 'trimestre2': 't2', 't2': 't2', 'trimestre3': 't3', 't3': 't3' };
// nom de matière (normalisé) → slug
const MATIERE_MAP = {
  anglais: 'anglais', francais: 'francais', mathematiques: 'mathematiques', maths: 'mathematiques',
  informatique: 'informatique', histoire: 'histoire', geographie: 'geographie', sciences: 'sciences',
  svteehb: 'svteehb', pct: 'pct', eps: 'eps', esf: 'esf', travailmanuel: 'travail_manuel',
  educationartistiqueetculturelle: 'eac', eac: 'eac', educationalacitoyenneteetalamorale: 'ecm', ecm: 'ecm',
  culturesnationales: 'cultures_nat', languesnationales: 'langues_nat', latin: 'latin', grec: 'grec',
  allemand: 'allemand', arabe: 'arabe', espagnol: 'espagnol', italien: 'italien', chinois: 'chinois',
};

// Agrège par (classe, trimestre, matiere) → liste ordonnée de compétences.
const bucket = new Map(); // clé `${classe}|${trim}|${matiere}` → [intitulés]
const errors = [];

function ingestClass(classeRaw, classeNode) {
  const classe = CLASSE_MAP[norm(classeRaw)];
  if (!classe) { errors.push(`classe inconnue : « ${classeRaw} »`); return; }
  for (const [trimRaw, trimNode] of Object.entries(classeNode || {})) {
    const trimestre = TRIM_MAP[norm(trimRaw)];
    if (!trimestre) { errors.push(`trimestre inconnu : « ${trimRaw} » (classe ${classeRaw})`); continue; }
    for (const [matRaw, comps] of Object.entries(trimNode || {})) {
      const matiere = MATIERE_MAP[norm(matRaw)];
      if (!matiere) { errors.push(`matière inconnue : « ${matRaw} » (classe ${classeRaw}/${trimRaw})`); continue; }
      if (!Array.isArray(comps)) { errors.push(`compétences non-tableau : ${classeRaw}/${trimRaw}/${matRaw}`); continue; }
      const key = `${classe}|${trimestre}|${matiere}`;
      const arr = bucket.get(key) || [];
      for (const intitule of comps) {
        if (intitule && String(intitule).trim()) arr.push(String(intitule).trim());
      }
      bucket.set(key, arr);
    }
  }
}

for (const f of files) {
  let doc;
  try { doc = JSON.parse(readFileSync(f, 'utf8')); }
  catch (e) { die(`${f} : JSON invalide — ${e.message}`); }
  // Déballe un éventuel wrapper de cycle (« PremierCycle », « premier_cycle »…).
  const top = Object.keys(doc);
  const looksLikeClass = top.some((k) => CLASSE_MAP[norm(k)]);
  const roots = looksLikeClass ? [doc] : top.map((k) => doc[k]).filter((v) => v && typeof v === 'object');
  for (const root of roots) {
    for (const [classeRaw, classeNode] of Object.entries(root)) ingestClass(classeRaw, classeNode);
  }
}

if (errors.length) { errors.forEach((e) => console.error(`  • ${e}`)); die(`${errors.length} libellé(s) non reconnu(s) — rien n'a été écrit.`); }

// Construit les entrées pivot (ordre = position dans la liste, dédupliquées).
const entries = [];
let total = 0;
for (const [key, comps] of [...bucket.entries()].sort()) {
  const [classe, trimestre, matiere] = key.split('|');
  const seen = new Set();
  const competences = [];
  comps.forEach((intitule) => {
    if (seen.has(intitule)) return; // évite les doublons exacts
    seen.add(intitule);
    competences.push({ ordre: competences.length + 1, intitule });
  });
  total += competences.length;
  entries.push({ classe, trimestre, matiere, competences });
}

const pivot = { version: { label, ...(source ? { source } : {}) }, cycle: 'premier_cycle', entries };
writeFileSync(out, JSON.stringify(pivot, null, 2) + '\n', 'utf8');
console.log(`✅ ${entries.length} bloc(s) (classe×trimestre×matière), ${total} compétence(s) → ${out}`);
