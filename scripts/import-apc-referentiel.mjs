#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Import d'un référentiel officiel APC (MINESEC) → tables apc_*.
//
// Lit un fichier pivot JSON (cf. docs/APC_REFERENTIEL_FORMAT.md), crée une
// nouvelle VERSION de référentiel (désactive les précédentes), puis insère les
// compétences en upsert sur (classe, trimestre, matière, ordre).
//
// Aucune compétence n'est inventée : tout slug inconnu (classe/trimestre/matière)
// arrête l'import. La structure fixe doit avoir été seedée par
// supabase_apc_minesec.sql.
//
// USAGE
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/import-apc-referentiel.mjs [--dry-run] [--keep-old] <fichier.json>
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const keepOld = args.includes('--keep-old');
const file    = args.find((a) => !a.startsWith('--'));

function die(msg) { console.error(`❌ ${msg}`); process.exit(1); }

if (!file) die('Fichier pivot manquant.\n   node scripts/import-apc-referentiel.mjs [--dry-run] [--keep-old] <fichier.json>');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!URL || !KEY)) die('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis (clé service role).');

// --- Lecture & validation structurelle du fichier ----------------------------
let doc;
try { doc = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { die(`Lecture/JSON invalide : ${e.message}`); }

if (!doc?.version?.label) die('`version.label` requis.');
if (!Array.isArray(doc.entries) || !doc.entries.length) die('`entries` (tableau non vide) requis.');
const cycleId = doc.cycle || 'premier_cycle';

// --- Connexion + chargement des slugs valides --------------------------------
async function loadValidSlugs(sb) {
  const [cl, tr, ma, cy] = await Promise.all([
    sb.from('apc_classes').select('id'),
    sb.from('apc_trimestres').select('id'),
    sb.from('apc_matieres').select('id'),
    sb.from('apc_cycles').select('id'),
  ]);
  const err = cl.error || tr.error || ma.error || cy.error;
  if (err) die(`Lecture de la structure : ${err.message}`);
  return {
    classes:    new Set(cl.data.map((r) => r.id)),
    trimestres: new Set(tr.data.map((r) => r.id)),
    matieres:   new Set(ma.data.map((r) => r.id)),
    cycles:     new Set(cy.data.map((r) => r.id)),
  };
}

// Validation des entrées contre les slugs réels (ou, en dry-run, contre les
// slugs seedés connus si pas de connexion).
const KNOWN = {
  classes:    new Set(['6e', '5e', '4e', '3e']),
  trimestres: new Set(['t1', 't2', 't3']),
  cycles:     new Set(['premier_cycle']),
  matieres:   new Set(['anglais','francais','mathematiques','informatique','histoire','geographie',
    'sciences','svteehb','pct','eps','esf','travail_manuel','eac','ecm','cultures_nat','langues_nat',
    'latin','grec','allemand','arabe','espagnol','italien','chinois']),
};

function validateEntries(valid) {
  const errors = [];
  let compCount = 0;
  if (!valid.cycles.has(cycleId)) errors.push(`cycle inconnu : ${cycleId}`);
  doc.entries.forEach((e, i) => {
    const tag = `entries[${i}]`;
    if (!valid.classes.has(e.classe))      errors.push(`${tag}: classe inconnue « ${e.classe} »`);
    if (!valid.trimestres.has(e.trimestre))errors.push(`${tag}: trimestre inconnu « ${e.trimestre} »`);
    if (!valid.matieres.has(e.matiere))    errors.push(`${tag}: matière inconnue « ${e.matiere} »`);
    if (!Array.isArray(e.competences) || !e.competences.length)
      errors.push(`${tag}: `+'`competences` vide');
    const seen = new Set();
    (e.competences || []).forEach((c, j) => {
      if (!Number.isInteger(c.ordre) || c.ordre < 1) errors.push(`${tag}.competences[${j}]: ordre invalide`);
      if (seen.has(c.ordre)) errors.push(`${tag}.competences[${j}]: ordre dupliqué (${c.ordre})`);
      seen.add(c.ordre);
      if (!c.intitule || !String(c.intitule).trim()) errors.push(`${tag}.competences[${j}]: intitulé requis`);
      compCount++;
    });
  });
  return { errors, compCount };
}

function buildRows(versionId) {
  const rows = [];
  for (const e of doc.entries) {
    for (const c of e.competences) {
      rows.push({
        cycle_id: cycleId,
        classe_id: e.classe,
        trimestre_id: e.trimestre,
        matiere_id: e.matiere,
        ordre: c.ordre,
        intitule: String(c.intitule).trim(),
        coefficient: c.coefficient ?? null,
        actif: true,
        referentiel_version_id: versionId,
      });
    }
  }
  return rows;
}

async function main() {
  // DRY-RUN : valide sans connexion si les variables manquent.
  if (dryRun && (!URL || !KEY)) {
    const { errors, compCount } = validateEntries(KNOWN);
    if (errors.length) { errors.forEach((e) => console.error(`  • ${e}`)); die(`${errors.length} erreur(s).`); }
    console.log(`✅ [dry-run hors-ligne] ${doc.entries.length} bloc(s), ${compCount} compétence(s) valides.`);
    return;
  }

  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const valid = await loadValidSlugs(sb);
  const { errors, compCount } = validateEntries(valid);
  if (errors.length) { errors.forEach((e) => console.error(`  • ${e}`)); die(`${errors.length} erreur(s) — rien n'a été écrit.`); }

  if (dryRun) {
    console.log(`✅ [dry-run] ${doc.entries.length} bloc(s), ${compCount} compétence(s) valides. Aucune écriture.`);
    return;
  }

  // 1) Nouvelle version
  const { data: ver, error: vErr } = await sb
    .from('apc_referentiel_versions')
    .insert({ label: doc.version.label, source: doc.version.source || null, actif: true })
    .select().single();
  if (vErr) die(`Création de version : ${vErr.message}`);
  console.log(`→ version créée : ${ver.id} (${ver.label})`);

  // 2) Désactiver les versions précédentes
  if (!keepOld) {
    const { error: dErr } = await sb.from('apc_referentiel_versions').update({ actif: false }).neq('id', ver.id);
    if (dErr) die(`Désactivation des anciennes versions : ${dErr.message}`);
  }

  // 3) Upsert des compétences
  const rows = buildRows(ver.id);
  const { error: cErr } = await sb
    .from('apc_competences')
    .upsert(rows, { onConflict: 'classe_id,trimestre_id,matiere_id,ordre' });
  if (cErr) die(`Insertion des compétences : ${cErr.message}`);

  // 4) Coefficient + ordre par (classe, matière) — déduits des entrées portant
  //    `coef`. Une matière peut apparaître sur plusieurs trimestres : on retient
  //    le 1er coef/ordre rencontré (identiques d'un trimestre à l'autre).
  const cmMap = new Map();
  for (const e of doc.entries) {
    if (e.coef == null) continue;
    const key = `${e.classe}|${e.matiere}`;
    if (cmMap.has(key)) continue;
    cmMap.set(key, {
      classe_id: e.classe, matiere_id: e.matiere,
      coefficient: e.coef,
      ordre: e.ordre_matiere ?? 0,
      optionnelle: !!e.optionnelle,
    });
  }
  const cmRows = [...cmMap.values()];
  if (cmRows.length) {
    const { error: cmErr } = await sb
      .from('apc_classe_matieres')
      .upsert(cmRows, { onConflict: 'classe_id,matiere_id' });
    if (cmErr) die(`Insertion des coefficients par classe : ${cmErr.message}`);
  }

  console.log(`✅ Import terminé : ${rows.length} compétence(s), ${cmRows.length} coef(s) par classe, sur ${doc.entries.length} bloc(s).`);
}

main().catch((e) => die(e.message));
