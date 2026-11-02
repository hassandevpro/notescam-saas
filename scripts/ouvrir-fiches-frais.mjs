#!/usr/bin/env node
// ── Ouvrir les fiches de frais absentes ────────────────────────────────────
//
// Pourquoi ce script existe : la scolarité attendue se calcule
// `Σ student_fees.frais_annuels`. Un élève sans ligne compte pour ZÉRO, en
// silence, et aucun écran ne le signale. Audit du 2026-11-01 sur THE GENIUS :
// 17 élèves sur 713 dans ce cas, 3 320 000 FCFA jamais réclamés
// (`docs/AUDIT_SCOLARITE_GENIUS.md`).
//
// Ce que le script écrit : des INSERT, uniquement. Il ne modifie ni ne supprime
// aucune ligne existante, donc aucun versement, aucun reçu, aucune créance
// déjà en place ne peut être altéré. Le retour arrière est la suppression des
// identifiants qu'il a créés, et il les écrit dans la sauvegarde.
//
// LA GRILLE TARIFAIRE EST UN FICHIER, PAS UNE CONSTANTE. Les tarifs d'une école
// viennent de l'école. `--grille <fichier.json>` est obligatoire :
//   [{ "libelle": "Primaire bilingue", "tarif": 210000,
//      "classes": ["SIL BIL", "CP BIL"] }, …]
//
// Usage :
//   node scripts/ouvrir-fiches-frais.mjs --ecole <id> --annee 2026-2027 \
//        --grille grille.json --sauvegarde avant.json [--confirmer]
//
// Sans `--confirmer`, il SIMULE : il affiche élève par élève ce qu'il écrirait
// et ne touche à rien.

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { planifierFichesManquantes, REFUS_FICHE } from '../src/lib/ficheFraisManquante.js';

const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const ECOLE = val('--ecole');
const ANNEE = val('--annee');
const GRILLE_F = val('--grille');
const SAUVEGARDE = val('--sauvegarde');
const CONFIRMER = argv.includes('--confirmer');

const fr = (n) => Math.round(Number(n) || 0).toLocaleString('fr-FR');
const ligne = (c = '─') => console.log(c.repeat(74));

if (!ECOLE || !ANNEE || !GRILLE_F) {
  console.error('Usage : --ecole <id> --annee <AAAA-AAAA> --grille <f.json>'
    + ' --sauvegarde <f.json> [--confirmer]');
  process.exit(1);
}
// Même garde-fou que `nettoyer-essais-services.mjs` : on n'écrit pas en
// production sans avoir d'abord posé l'état d'avant sur le disque.
if (CONFIRMER && !SAUVEGARDE) {
  console.error('REFUS : --confirmer exige --sauvegarde <fichier.json>.');
  console.error('  Écrire des créances sans garder l’état d’avant, c’est écrire sans retour arrière.');
  process.exit(1);
}

const URL = process.env.VITE_SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!URL || !CLE) {
  console.error('REFUS : VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être dans l’environnement.');
  process.exit(1);
}
const db = createClient(URL, CLE, { auth: { persistSession: false } });

async function tout(table, select, filtre = (q) => q) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtre(db.from(table).select(select)).range(de, de + 999);
    if (error) throw new Error(`${table} : ${error.message}`);
    out.push(...(data || []));
    if ((data || []).length < 1000) return out;
  }
}

// ── VOIR, OU NE PAS VOIR ───────────────────────────────────────────────────
// Incident I35 : lancé avec la clé anonyme, un script de ce genre affichait
// « rien à faire » — rassurant, et faux. La RLS refuse chaque ligne sans
// `auth.uid()`, et PostgREST répond une liste vide SANS erreur. Une lecture
// vide n'est pas une information : on exige de voir avant de conclure.
async function exigeDeVoir() {
  const { count, error } = await db.from('schools').select('*', { count: 'exact', head: true });
  if (error) throw new Error(`lecture refusée (${error.message}) — clé sans droit de lecture ?`);
  if (!count) {
    throw new Error('aucune école visible : la clé ne voit rien (RLS). '
      + 'Une liste vide ne prouve pas qu’il n’y a rien à corriger. Utilisez la clé service-role.');
  }
}

async function main() {
  await exigeDeVoir();

  const grille = JSON.parse(readFileSync(GRILLE_F, 'utf8'));
  if (!Array.isArray(grille) || !grille.length) throw new Error(`${GRILLE_F} : grille vide`);

  const [ecoles, classes, eleves, fees] = await Promise.all([
    tout('schools', 'id,name', (q) => q.eq('id', ECOLE)),
    tout('classes', 'id,name', (q) => q.eq('school_id', ECOLE)),
    tout('students', '*', (q) => q.eq('school_id', ECOLE)),
    tout('student_fees', 'student_id', (q) => q.eq('school_id', ECOLE).eq('academic_year', ANNEE)),
  ]);
  if (!ecoles.length) throw new Error(`école ${ECOLE} introuvable (ou invisible)`);
  const nomEcole = ecoles[0].name;
  const cn = Object.fromEntries(classes.map((c) => [c.id, c.name]));

  const plan = planifierFichesManquantes({
    eleves: eleves.map((s) => ({
      id: s.id,
      nom: [s.last_name, s.first_name].filter(Boolean).join(' ') || s.name || '—',
      classe: cn[s.class_id] || '',
      matricule: s.matricule || '',
      archive: s.archived_at || null,
    })),
    feesExistantes: fees,
    grille,
  });

  ligne('═');
  console.log(`École : ${nomEcole}`);
  console.log(`Année : ${ANNEE}   ·   élèves : ${plan.resume.eleves}   ·   fiches déjà là : ${fees.length}`);
  if (plan.resume.grilleDoublons.length) {
    console.log(`\n⚠ GRILLE AMBIGUË : ${plan.resume.grilleDoublons.join(', ')} cité(s) par deux lignes.`);
    console.log('  Deux tarifs pour une même classe : corrigez la grille avant de continuer.');
    process.exitCode = 2;
    return;
  }
  if (!plan.resume.boucle) throw new Error('bouclage rompu : un élève n’est ni créé ni écarté');

  ligne('═');
  console.log(CONFIRMER ? 'FICHES OUVERTES' : 'FICHES À OUVRIR  (simulation — rien ne sera écrit)');
  ligne();
  for (const x of plan.aCreer) {
    console.log(`  ${String(x.classe).padEnd(18)} ${String(x.nom).slice(0, 34).padEnd(34)} `
      + `${String(x.matricule || '—').padEnd(11)} ${fr(x.frais_annuels).padStart(9)}  [${x.section}]`);
  }
  console.log(`\n  ${plan.aCreer.length} fiche(s)   =   ${fr(plan.resume.montant)} FCFA de scolarité attendue en plus`);

  const parRefus = plan.resume.parRefus;
  if (plan.ecartes.length) {
    console.log('\nÉCARTÉS :');
    if (parRefus[REFUS_FICHE.DEJA_LA]) console.log(`  ${parRefus[REFUS_FICHE.DEJA_LA]} ont déjà une fiche (jamais recréée : doublerait la créance)`);
    if (parRefus[REFUS_FICHE.ARCHIVE]) {
      console.log(`  ${parRefus[REFUS_FICHE.ARCHIVE]} archivé(s) — NON facturés par ce script :`);
      for (const x of plan.ecartes.filter((e) => e.refus === REFUS_FICHE.ARCHIVE)) {
        console.log(`      ${String(x.classe).padEnd(18)} ${x.nom}`);
      }
      console.log('    Facturer un élève sorti est une décision de l’école, pas un correctif.');
    }
    if (parRefus[REFUS_FICHE.SANS_TARIF]) {
      console.log(`  ⚠ ${parRefus[REFUS_FICHE.SANS_TARIF]} sans tarif (classe absente de la grille) :`);
      for (const x of plan.ecartes.filter((e) => e.refus === REFUS_FICHE.SANS_TARIF)) {
        console.log(`      ${String(x.classe).padEnd(18)} ${x.nom}`);
      }
      console.log('    Aucun montant inventé. Complétez la grille pour les traiter.');
    }
  }

  if (!plan.aCreer.length) { console.log('\nRien à ouvrir.'); return; }
  if (!CONFIRMER) {
    console.log('\nSimulation terminée. Ajoutez --confirmer --sauvegarde <f.json> pour écrire.');
    return;
  }

  // ── L'ÉTAT D'AVANT, SUR LE DISQUE, AVANT LE PREMIER INSERT ──────────────
  const maintenant = new Date().toISOString();
  const lignes = plan.aCreer.map((x) => ({
    id: randomUUID(),
    school_id: ECOLE,
    student_id: x.id,
    academic_year: ANNEE,
    frais_annuels: x.frais_annuels,
    frais_payes: 0,
    date_dernier_paiement: null,
    // La convention des 696 fiches existantes de cette école, relevée avant
    // d'écrire : mode « echelonne », tranches et ajustements en chaîne '[]'.
    // `schoolStore.parseJsonArray` tolère les deux formes à la lecture ; on
    // copie la forme DOMINANTE pour que ces fiches soient indistinguables des
    // autres sur les écrans.
    payment_mode: 'echelonne',
    tranches: '[]',
    adjustments: '[]',
    notes: `Fiche ouverte le ${maintenant.slice(0, 10)} — audit de réconciliation `
      + `(tarif de section ${fr(x.frais_annuels)}, aucun versement)`,
    version: 1,
    // `updated_at` à MAINTENANT, et c'est indispensable : le pull LAN est un
    // keyset sur (updated_at, id) — une date passée et l'école ne verrait
    // jamais ces fiches arriver.
    created_at: maintenant,
    updated_at: maintenant,
  }));

  writeFileSync(SAUVEGARDE, JSON.stringify({
    operation: 'ouvrir-fiches-frais',
    quand: maintenant,
    ecole: { id: ECOLE, nom: nomEcole },
    annee: ANNEE,
    grille,
    // Le retour arrière, écrit noir sur blanc : ces lignes n'existaient pas
    // avant, donc annuler = les supprimer. Elles ne portent aucun versement.
    retour_arriere: {
      quoi: 'supprimer les lignes student_fees dont l’id figure ci-dessous',
      ids: lignes.map((l) => l.id),
      sql: `DELETE FROM student_fees WHERE id IN (${lignes.map((l) => `'${l.id}'`).join(', ')});`,
    },
    fiches_creees: lignes,
    eleves_ecartes: plan.ecartes,
  }, null, 1), 'utf8');
  console.log(`\nSauvegarde + retour arrière écrits : ${SAUVEGARDE}`);

  // ── ÉCRITURE ────────────────────────────────────────────────────────────
  // `insert` et non `upsert` : si une fiche existait déjà, la contrainte
  // UNIQUE(student_id, academic_year) doit FAIRE ÉCHOUER l'écriture, pas
  // l'écraser en silence. Écraser une fiche existante, c'est perdre un montant.
  let ecrites = 0;
  for (let i = 0; i < lignes.length; i += 100) {
    const lot = lignes.slice(i, i + 100);
    const { error } = await db.from('student_fees').insert(lot);
    if (error) {
      console.error(`\nÉCHEC sur le lot ${i / 100 + 1} : ${error.message}`);
      console.error(`  ${ecrites} fiche(s) écrite(s) avant l’échec. Le retour arrière est dans ${SAUVEGARDE}.`);
      process.exitCode = 1;
      return;
    }
    ecrites += lot.length;
  }
  console.log(`  ${ecrites} fiche(s) écrite(s)`);

  // ── VÉRIFICATION : relire, ne pas croire ────────────────────────────────
  // La RLS peut refuser sans lever d'erreur. On relit ce qu'on croit avoir fait.
  const apres = await tout('student_fees', 'student_id,frais_annuels',
    (q) => q.eq('school_id', ECOLE).eq('academic_year', ANNEE));
  const vus = new Set(apres.map((f) => f.student_id));
  const manquants = plan.aCreer.filter((x) => !vus.has(x.id));
  const total = apres.reduce((s, f) => s + (Number(f.frais_annuels) || 0), 0);

  ligne();
  if (manquants.length) {
    console.log(`✗ ${manquants.length} fiche(s) ABSENTE(S) à la relecture — l’écriture n’a pas pris.`);
    for (const m of manquants) console.log(`    ${m.classe}  ${m.nom}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✔ Vérifié par relecture : ${apres.length} fiches pour ${ANNEE} (${fees.length} + ${ecrites}).`);
  console.log(`  Scolarité attendue : ${fr(total)} FCFA`);
}

main().catch((e) => {
  console.error(`\nÉCHEC : ${e.message}`);
  console.error('Relancez sans --confirmer pour voir l’état réel avant d’agir.');
  process.exitCode = 1;
});
