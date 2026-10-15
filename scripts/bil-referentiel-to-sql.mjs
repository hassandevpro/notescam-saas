#!/usr/bin/env node
// Convertit le pivot du PROGRAMME D'ÉDUCATION BILINGUE SPÉCIAL (premier cycle)
// en SQL idempotent à COLLER dans Supabase → SQL Editor (aucune clé à manipuler).
// Le même fichier alimente le seed LAN via scripts/build-officiel-seed.mjs.
//
// USAGE  node scripts/bil-referentiel-to-sql.mjs <pivot.json> [sortie.sql]
//
// Contrairement à l'import SECOND CYCLE, les classes acceptées sont celles du
// PREMIER cycle : 6e–3e (francophone) et Form 1–5 (anglophone). Un slug inconnu
// ARRÊTE la génération — on n'invente jamais un coefficient ni une classe.

import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const file = process.argv[2];
const out  = process.argv[3] || 'supabase_bilingue_special_data.sql';
if (!file) {
  console.error('usage: node scripts/bil-referentiel-to-sql.mjs <pivot.json> [sortie.sql]');
  process.exit(1);
}

const doc = JSON.parse(readFileSync(file, 'utf8'));

// ── Validation stricte ───────────────────────────────────────────────────────
// Classes du PREMIER cycle couvertes par l'arrêté 239-23, et le sous-système
// auquel chacune appartient. Une classe de second cycle est refusée : l'arrêté
// n'en traite aucune, donc aucun coefficient ne pourrait en être tiré.
const CLASSES = {
  '6e': 'bil_fr', '5e': 'bil_fr', '4e': 'bil_fr', '3e': 'bil_fr',
  form1: 'bil_en', form2: 'bil_en', form3: 'bil_en', form4: 'bil_en', form5: 'bil_en',
};

const errors = [];
const serieIds  = new Set((doc.series   || []).map((s) => s.id));
const groupeIds = new Set((doc.groupes  || []).map((g) => g.id));
const matIds    = new Set((doc.matieres || []).map((m) => m.id));

if (!doc.version?.label) errors.push('version.label est requis');
if (!Array.isArray(doc.entries) || !doc.entries.length) errors.push('entries[] est vide');

const seen = new Set();
(doc.entries || []).forEach((e, i) => {
  const tag = `entries[${i}] (${e.serie}/${e.classe}/${e.matiere})`;
  if (!serieIds.has(e.serie))    errors.push(`${tag} : série inconnue « ${e.serie} »`);
  if (!groupeIds.has(e.groupe))  errors.push(`${tag} : domaine inconnu « ${e.groupe} »`);
  if (!matIds.has(e.matiere))    errors.push(`${tag} : matière inconnue « ${e.matiere} »`);
  if (!(e.classe in CLASSES)) {
    errors.push(`${tag} : classe inconnue « ${e.classe} » (${Object.keys(CLASSES).join('|')})`);
  } else if (CLASSES[e.classe] !== e.serie) {
    // Garde-fou contre le mélange des deux tableaux de l'arrêté : une 6e ne peut
    // pas porter le référentiel anglophone, ni une Form 1 le francophone.
    errors.push(`${tag} : la classe « ${e.classe} » relève de ${CLASSES[e.classe]}, pas de ${e.serie}`);
  }
  if (!(Number(e.coef) > 0)) errors.push(`${tag} : coefficient absent ou nul`);
  const key = `${e.serie}|${e.classe}|${e.matiere}`;
  if (seen.has(key)) errors.push(`${tag} : doublon`);
  seen.add(key);
});

if (errors.length) {
  console.error(`✗ ${errors.length} erreur(s) — rien n'a été généré :`);
  for (const e of errors.slice(0, 40)) console.error('   ' + e);
  if (errors.length > 40) console.error(`   … et ${errors.length - 40} autre(s)`);
  process.exit(1);
}

// ── Génération ───────────────────────────────────────────────────────────────
const Q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const N = (v) => (v == null || v === '' ? 'NULL' : Number(v));
const versionId = randomUUID();

const serieRows = (doc.series || []).map((s, i) =>
  `  (${Q(s.id)}, ${Q(s.nom)}, ${Q(s.categorie || 'bilingue_special')}, ${Q(s.description)}, ${s.ordre ?? i})`);
const groupeRows = (doc.groupes || []).map((g, i) =>
  `  (${Q(g.id)}, ${Q(g.nom)}, ${g.ordre ?? i})`);
const matRows = (doc.matieres || []).map((m, i) =>
  `  (${Q(m.id)}, ${Q(m.nom)}, ${Q(m.code)}, ${Q(m.domaine)}, ${m.ordre ?? i})`);
const smRows = doc.entries.map((e) =>
  `  (${Q(e.serie)}, ${Q(e.classe)}, ${Q(e.matiere)}, ${Q(e.groupe)}, ${N(e.coef)}, ${N(e.charge)}, ${e.obligatoire === false ? 'false' : 'true'}, true, ${Q(versionId)})`);

const parClasse = {};
for (const e of doc.entries) {
  parClasse[`${e.serie}/${e.classe}`] = (parClasse[`${e.serie}/${e.classe}`] || 0) + Number(e.coef);
}
const recap = Object.entries(parClasse)
  .map(([k, v]) => `--   ${k.padEnd(14)} Σcoef = ${v}`).join('\n');

const sql = `-- ============================================================================
-- DONNÉES RÉFÉRENTIEL BILINGUE SPÉCIAL (généré) — À COLLER dans Supabase SQL Editor.
-- Pré-requis : supabase_bilingue_special.sql exécuté. Idempotent.
-- Version : ${doc.version?.label || '—'}
-- ${smRows.length} ligne(s) coefficient/charge · ${doc.matieres?.length || 0} matière(s).
--
-- Somme des coefficients par classe (contrôle de recopie) :
${recap}
-- ============================================================================

-- Séries (sous-systèmes)
INSERT INTO public.bil_series (id, nom, categorie, description, ordre) VALUES
${serieRows.join(',\n')}
ON CONFLICT (id) DO UPDATE SET nom=EXCLUDED.nom, categorie=EXCLUDED.categorie, description=EXCLUDED.description, ordre=EXCLUDED.ordre;

-- Domaines d'apprentissage
INSERT INTO public.bil_groupes (id, nom, ordre) VALUES
${groupeRows.join(',\n')}
ON CONFLICT (id) DO UPDATE SET nom=EXCLUDED.nom, ordre=EXCLUDED.ordre;

-- Catalogue des matières
INSERT INTO public.bil_matieres (id, nom, code, domaine_apprentissage, ordre) VALUES
${matRows.join(',\n')}
ON CONFLICT (id) DO UPDATE SET nom=EXCLUDED.nom, code=EXCLUDED.code, domaine_apprentissage=EXCLUDED.domaine_apprentissage, ordre=EXCLUDED.ordre;

-- Nouvelle version (désactive les précédentes du SEUL référentiel bilingue)
UPDATE public.bil_referentiel_versions SET actif = false;
INSERT INTO public.bil_referentiel_versions (id, label, source, actif)
VALUES (${Q(versionId)}, ${Q(doc.version?.label)}, ${Q(doc.version?.source)}, true)
ON CONFLICT (id) DO NOTHING;

-- Coefficients + charges horaires par (série, classe, matière)
INSERT INTO public.bil_serie_matieres
  (serie_id, classe_id, matiere_id, groupe_id, coefficient, charge_horaire, obligatoire, actif, referentiel_version_id)
VALUES
${smRows.join(',\n')}
ON CONFLICT (serie_id, classe_id, matiere_id) DO UPDATE
  SET groupe_id=EXCLUDED.groupe_id, coefficient=EXCLUDED.coefficient, charge_horaire=EXCLUDED.charge_horaire,
      obligatoire=EXCLUDED.obligatoire, actif=true, referentiel_version_id=EXCLUDED.referentiel_version_id;

-- ============================================================================
-- FIN. Ensuite : UPDATE schools SET bulletin_engine='bilingue_special' WHERE id='...';
--          ou  : UPDATE classes SET bulletin_engine='bilingue_special' WHERE id='...';
-- ============================================================================
`;

writeFileSync(out, sql, 'utf8');
console.log(`✅ ${out}`);
console.log(`   ${smRows.length} lignes coef/charge · ${doc.series?.length} séries · ${doc.groupes?.length} domaines · ${doc.matieres?.length} matières`);
for (const [k, v] of Object.entries(parClasse)) console.log(`   ${k.padEnd(14)} Σcoef = ${v}`);
