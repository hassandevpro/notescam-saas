#!/usr/bin/env node
// Convertit un pivot SC (cf. docs/SC_REFERENTIEL_FORMAT.md) en SQL idempotent à
// COLLER dans Supabase → SQL Editor (aucune clé service role à manipuler).
//
// USAGE  node scripts/sc-referentiel-to-sql.mjs <pivot.json> [sortie.sql]

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const file = process.argv[2];
const out  = process.argv[3] || 'supabase_sc_referentiel_data.sql';
if (!file) { console.error('usage: node scripts/sc-referentiel-to-sql.mjs <pivot.json> [sortie.sql]'); process.exit(1); }

const doc = JSON.parse(readFileSync(file, 'utf8'));
const Q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const N = (v) => (v == null || v === '' ? 'NULL' : Number(v));
const versionId = randomUUID();

const seriesRows = (doc.series || []).map((s) =>
  `  (${Q(s.id)}, ${Q(s.nom)}, ${Q(s.categorie || 'litteraire')}, ${Q(s.description)}, ${s.ordre ?? 0})`);
const matRows = (doc.matieres || []).map((m) =>
  `  (${Q(m.id)}, ${Q(m.nom)}, ${Q(m.code)}, ${Q(m.domaine)}, ${m.ordre ?? 0})`);
const smRows = doc.entries.map((e) =>
  `  (${Q(e.serie)}, ${Q(e.classe)}, ${Q(e.matiere)}, ${Q(e.groupe)}, ${N(e.coef)}, ${N(e.charge)}, ${e.obligatoire === false ? 'false' : 'true'}, true, ${Q(versionId)})`);

const sql = `-- ============================================================================
-- DONNÉES RÉFÉRENTIEL SECOND CYCLE MINESEC (généré) — À COLLER dans Supabase SQL Editor.
-- Pré-requis : supabase_sc_minesec.sql exécuté. Idempotent. Version : ${doc.version?.label || '—'}
-- ${smRows.length} ligne(s) coef/charge.
-- ============================================================================
${seriesRows.length ? `
-- Catalogue séries (extension)
INSERT INTO public.sc_series (id, nom, categorie, description, ordre) VALUES
${seriesRows.join(',\n')}
ON CONFLICT (id) DO UPDATE SET nom=EXCLUDED.nom, categorie=EXCLUDED.categorie, description=EXCLUDED.description, ordre=EXCLUDED.ordre;
` : ''}${matRows.length ? `
-- Catalogue matières (extension)
INSERT INTO public.sc_matieres (id, nom, code, domaine_apprentissage, ordre) VALUES
${matRows.join(',\n')}
ON CONFLICT (id) DO UPDATE SET nom=EXCLUDED.nom, code=EXCLUDED.code, domaine_apprentissage=EXCLUDED.domaine_apprentissage, ordre=EXCLUDED.ordre;
` : ''}
-- Nouvelle version (désactive les précédentes)
UPDATE public.sc_referentiel_versions SET actif = false;
INSERT INTO public.sc_referentiel_versions (id, label, source, actif)
VALUES (${Q(versionId)}, ${Q(doc.version?.label || 'Référentiel SC')}, ${Q(doc.version?.source)}, true)
ON CONFLICT (id) DO NOTHING;

-- Coefficients + charges horaires par (série, classe, matière)
INSERT INTO public.sc_serie_matieres
  (serie_id, classe_id, matiere_id, groupe_id, coefficient, charge_horaire, obligatoire, actif, referentiel_version_id)
VALUES
${smRows.join(',\n')}
ON CONFLICT (serie_id, classe_id, matiere_id) DO UPDATE
  SET groupe_id=EXCLUDED.groupe_id, coefficient=EXCLUDED.coefficient, charge_horaire=EXCLUDED.charge_horaire,
      obligatoire=EXCLUDED.obligatoire, actif=true, referentiel_version_id=EXCLUDED.referentiel_version_id;

-- ============================================================================
-- FIN. Ensuite : UPDATE schools SET bulletin_engine='minesec' WHERE id='...';
-- ============================================================================
`;

writeFileSync(out, sql, 'utf8');
console.log(`✅ ${out} — ${smRows.length} lignes coef/charge (version ${versionId}).`);
