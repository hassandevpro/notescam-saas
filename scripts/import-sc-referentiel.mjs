#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Import d'un référentiel SECOND CYCLE MINESEC (arrêté) → tables sc_*.
//
// Crée une nouvelle VERSION (désactive les précédentes), étend les catalogues
// séries/matières si fournis, puis upsert sc_serie_matieres (coef + charge par
// série×classe×matière). Aucun coefficient n'est inventé : tout slug structurel
// inconnu (serie/classe/groupe) arrête l'import.
//
// USAGE
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/import-sc-referentiel.mjs [--dry-run] [--keep-old] <fichier.json>
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const keepOld = args.includes('--keep-old');
const file    = args.find((a) => !a.startsWith('--'));

function die(m) { console.error(`❌ ${m}`); process.exit(1); }
if (!file) die('Fichier pivot manquant.');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dryRun && (!URL || !KEY)) die('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.');

let doc;
try { doc = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { die(`JSON invalide : ${e.message}`); }
if (!doc?.version?.label) die('`version.label` requis.');
if (!Array.isArray(doc.entries) || !doc.entries.length) die('`entries` (tableau non vide) requis.');

const CLASSES = new Set(['2nde', '1ere', 'tle']);
const GROUPES = new Set(['g1', 'g2']);
const SERIES_SEED = new Set(['a1', 'a2', 'a3', 'a4', 'a5', 'abi', 'c', 'd', 'e', 'ti', 'sh', 'ac']);

function validate(knownSeries, knownMatieres) {
  const errors = [];
  const seenKey = new Set();
  doc.entries.forEach((e, i) => {
    const tag = `entries[${i}]`;
    if (!knownSeries.has(e.serie)) errors.push(`${tag}: série inconnue « ${e.serie} »`);
    if (!CLASSES.has(e.classe))    errors.push(`${tag}: classe inconnue « ${e.classe} » (2nde|1ere|tle)`);
    if (!GROUPES.has(e.groupe))    errors.push(`${tag}: groupe inconnu « ${e.groupe} » (g1|g2)`);
    if (!knownMatieres.has(e.matiere)) errors.push(`${tag}: matière inconnue « ${e.matiere} » (déclarez-la dans matieres[])`);
    if (e.coef == null || isNaN(Number(e.coef))) errors.push(`${tag}: coef invalide`);
    const key = `${e.serie}|${e.classe}|${e.matiere}`;
    if (seenKey.has(key)) errors.push(`${tag}: doublon (serie,classe,matiere) ${key}`);
    seenKey.add(key);
  });
  return errors;
}

async function main() {
  const knownSeries   = new Set([...SERIES_SEED, ...(doc.series || []).map((s) => s.id)]);
  const knownMatieres = new Set((doc.matieres || []).map((m) => m.id));

  if (dryRun && (!URL || !KEY)) {
    // Hors-ligne : on ne connaît pas le catalogue matières en base → on exige
    // qu'elles soient déclarées dans matieres[].
    const errors = validate(knownSeries, knownMatieres);
    if (errors.length) { errors.forEach((e) => console.error('  • ' + e)); die(`${errors.length} erreur(s).`); }
    console.log(`✅ [dry-run hors-ligne] ${doc.entries.length} ligne(s) valides.`);
    return;
  }

  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  // Catalogues réels (séries seedées + matières déjà en base) + extensions du fichier.
  const [dbSeries, dbMat] = await Promise.all([
    sb.from('sc_series').select('id'),
    sb.from('sc_matieres').select('id'),
  ]);
  if (dbSeries.error || dbMat.error) die('Lecture des catalogues : ' + (dbSeries.error || dbMat.error).message);
  dbSeries.data.forEach((r) => knownSeries.add(r.id));
  dbMat.data.forEach((r) => knownMatieres.add(r.id));

  const errors = validate(knownSeries, knownMatieres);
  if (errors.length) { errors.forEach((e) => console.error('  • ' + e)); die(`${errors.length} erreur(s) — rien n'a été écrit.`); }
  if (dryRun) { console.log(`✅ [dry-run] ${doc.entries.length} ligne(s) valides.`); return; }

  // 1) Étendre les catalogues si fournis
  if (doc.series?.length) {
    const { error } = await sb.from('sc_series').upsert(
      doc.series.map((s) => ({ id: s.id, nom: s.nom, categorie: s.categorie || 'litteraire', description: s.description || null, ordre: s.ordre ?? 0 })),
      { onConflict: 'id' });
    if (error) die('Séries : ' + error.message);
  }
  if (doc.matieres?.length) {
    const { error } = await sb.from('sc_matieres').upsert(
      doc.matieres.map((m) => ({ id: m.id, nom: m.nom, code: m.code || null, domaine_apprentissage: m.domaine || null, ordre: m.ordre ?? 0 })),
      { onConflict: 'id' });
    if (error) die('Matières : ' + error.message);
  }

  // 2) Nouvelle version
  const { data: ver, error: vErr } = await sb.from('sc_referentiel_versions')
    .insert({ label: doc.version.label, source: doc.version.source || null, actif: true }).select().single();
  if (vErr) die('Version : ' + vErr.message);
  if (!keepOld) await sb.from('sc_referentiel_versions').update({ actif: false }).neq('id', ver.id);

  // 3) Upsert des coefficients/charges
  const rows = doc.entries.map((e) => ({
    serie_id: e.serie, classe_id: e.classe, matiere_id: e.matiere, groupe_id: e.groupe,
    coefficient: Number(e.coef), charge_horaire: e.charge == null ? null : Number(e.charge),
    obligatoire: e.obligatoire !== false, actif: true, referentiel_version_id: ver.id,
  }));
  const { error: rErr } = await sb.from('sc_serie_matieres').upsert(rows, { onConflict: 'serie_id,classe_id,matiere_id' });
  if (rErr) die('sc_serie_matieres : ' + rErr.message);

  console.log(`✅ Import terminé : ${rows.length} ligne(s) coef/charge (version ${ver.id}).`);
}

main().catch((e) => die(e.message));
