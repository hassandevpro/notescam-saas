#!/usr/bin/env node
// Convertit un pivot d'import APC (cf. docs/APC_REFERENTIEL_FORMAT.md) en fichier
// SQL idempotent à COLLER dans Supabase → SQL Editor (aucune clé service role à
// manipuler : l'éditeur SQL écrit avec les droits service role).
//
// USAGE
//   node scripts/apc-referentiel-to-sql.mjs <pivot.json> [sortie.sql]

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const file = process.argv[2];
const out  = process.argv[3] || 'supabase_apc_referentiel_data.sql';
if (!file) { console.error('usage: node scripts/apc-referentiel-to-sql.mjs <pivot.json> [sortie.sql]'); process.exit(1); }

const doc = JSON.parse(readFileSync(file, 'utf8'));
const Q = (s) => `'${String(s).replace(/'/g, "''")}'`;     // échappe les apostrophes SQL
const cycle = doc.cycle || 'premier_cycle';
const versionId = randomUUID();

// Compétences
const compRows = [];
for (const e of doc.entries) {
  for (const c of e.competences) {
    compRows.push(`  (${Q(cycle)}, ${Q(e.classe)}, ${Q(e.trimestre)}, ${Q(e.matiere)}, ${c.ordre}, ${Q(c.intitule)}, ${c.coefficient == null ? 'NULL' : c.coefficient}, true, ${Q(versionId)})`);
  }
}

// Coefficients par (classe, matière) — 1er coef/ordre rencontré
const cm = new Map();
for (const e of doc.entries) {
  if (e.coef == null) continue;
  const k = `${e.classe}|${e.matiere}`;
  if (!cm.has(k)) cm.set(k, `  (${Q(e.classe)}, ${Q(e.matiere)}, ${e.coef}, ${e.ordre_matiere ?? 0}, ${e.optionnelle ? 'true' : 'false'})`);
}

const sql = `-- ============================================================================
-- DONNÉES DU RÉFÉRENTIEL APC (généré) — À COLLER dans Supabase → SQL Editor.
-- Pré-requis : avoir exécuté supabase_apc_minesec.sql (tables + structure).
-- Idempotent : rejouable. Version : ${doc.version?.label || '—'}
-- ${compRows.length} compétence(s), ${cm.size} coefficient(s) par classe.
-- ============================================================================

-- 1) Nouvelle version (désactive les précédentes)
UPDATE public.apc_referentiel_versions SET actif = false;
INSERT INTO public.apc_referentiel_versions (id, label, source, actif)
VALUES (${Q(versionId)}, ${Q(doc.version?.label || 'Référentiel APC')}, ${Q(doc.version?.source || '')}, true)
ON CONFLICT (id) DO NOTHING;

-- 2) Compétences officielles
INSERT INTO public.apc_competences
  (cycle_id, classe_id, trimestre_id, matiere_id, ordre, intitule, coefficient, actif, referentiel_version_id)
VALUES
${compRows.join(',\n')}
ON CONFLICT (classe_id, trimestre_id, matiere_id, ordre) DO UPDATE
  SET intitule = EXCLUDED.intitule,
      coefficient = EXCLUDED.coefficient,
      actif = true,
      referentiel_version_id = EXCLUDED.referentiel_version_id;

-- 3) Coefficients + ordre par (classe, matière)
INSERT INTO public.apc_classe_matieres (classe_id, matiere_id, coefficient, ordre, optionnelle)
VALUES
${[...cm.values()].join(',\n')}
ON CONFLICT (classe_id, matiere_id) DO UPDATE
  SET coefficient = EXCLUDED.coefficient, ordre = EXCLUDED.ordre, optionnelle = EXCLUDED.optionnelle;

-- ============================================================================
-- FIN. Ensuite : UPDATE schools SET bulletin_engine='apc_minesec' WHERE id='...';
-- ============================================================================
`;

writeFileSync(out, sql, 'utf8');
console.log(`✅ ${out} — ${compRows.length} compétences, ${cm.size} coef/classe (version ${versionId}).`);
