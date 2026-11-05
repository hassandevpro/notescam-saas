// AUCUNE LECTURE COMPLÈTE NE DOIT ÉCHAPPER À LA PAGINATION — le garde-fou durable.
//
// CE QUE CE BANC EMPÊCHE DE REVIVRE. Le 2026-11-05, l'école BRIGHT CONTINENT a répété
// pendant des jours que les notes du primaire « ne persistaient pas ». Mesure faite dans
// son navigateur, sur sa base réelle :
//
//     total en base ................ 1 873
//     reçues par l'application ..... 1 000
//     invisibles ...................   873
//
// PostgREST plafonne CHAQUE select à 1000 lignes et répond `200` en tronquant.
// `fetchPrimNotes` lisait la table d'un seul coup. Une note saisie partait bien — POST
// 200, ligne en base — mais au rechargement elle tombait hors des mille premières lignes
// et l'écran l'affichait vide. Aucune erreur, aucun refus, console vide : il n'y avait
// rien à voir, puisque le serveur disait oui. Les enseignants ressaisissaient des notes
// qui étaient déjà là.
//
// Le pagineur `fetchAllRows` EXISTAIT DÉJÀ, écrit pour ce piège exact — mais privé à
// schoolService.js. Trois services ne l'ont jamais traversé. Corriger ces appels ne suffit
// donc pas : il faut qu'une NOUVELLE lecture complète ne puisse plus passer inaperçue.
//
// RÈGLE : toute lecture `select('*')` filtrée sur `school_id` doit être BORNÉE, c'est-à-
// dire paginée (`fetchAllRows` / `fetchToutesLesLignes`), ou plafonnée (`.limit`,
// `.range`, `.single`), ou réduite à un sous-ensemble qui ne peut pas croître (un filtre
// sur une clé étrangère unique). Sinon, elle doit être inscrite ci-dessous AVEC SA RAISON.
// Inscrire une table est un choix explicite, pas un oubli — et il se relit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));

// ── LES TABLES BORNÉES PAR NATURE ────────────────────────────────────────────
// Chaque entrée dit POURQUOI elle ne peut pas franchir 1000 lignes dans une école.
// Si l'une d'elles se met à croître (nouvelle fonctionnalité, école plus grande),
// la retirer d'ici et la paginer — c'est le seul geste correct.
const BORNEES = {
  // Configuration d'établissement : saisie à la main, une poignée de lignes.
  budgets: 'un budget par exercice',
  budget_chapters: 'les chapitres d’un plan comptable scolaire',
  budget_periods: 'les périodes d’un exercice',
  budget_line_periods: 'les périodes d’une ligne budgétaire',
  budget_line_sectors: 'les secteurs d’une ligne budgétaire',
  budget_line_reallocations: 'les réaffectations décidées, gestes rares',
  budget_revisions: 'les révisions d’un budget, gestes rares',
  budget_unlock_requests: 'les demandes de déverrouillage, gestes rares',
  budget_expenses: 'les dépenses engagées d’un exercice',
  fee_catalog: 'le catalogue des frais de l’école',
  fee_schedule_items: 'les échéances d’un échéancier type',
  class_fee_grids: 'une grille par classe',
  assets: 'les immobilisations de l’école',
  school_units: 'les unités d’un complexe scolaire',
  sequence_dates: 'les dates des séquences d’une année',
  timetable_slots: 'les créneaux d’un emploi du temps',
  hr_payroll_catalog: 'le catalogue des lignes de paie',
  governance_roles: 'les rôles de gouvernance',
  user_governance_roles: 'les rôles attribués aux utilisateurs',
  signalements: 'les signalements ouverts d’une école',
  // Personnel et structure : bornés par la taille de l'établissement.
  classes: 'les classes d’une école',
  subjects: 'les matières des classes d’une école',
  staff: 'le personnel d’une école',
  teachers: 'les enseignants d’une école',
  academic_periods: 'les trimestres d’une année',
  cash_sessions: 'les sessions de caisse ouvertes',
};

// Ce qui BORNE une lecture. `fetchAllRows`/`fetchToutesLesLignes` paginent ;
// `.limit`/`.range` plafonnent ; `.single`/`maybeSingle` rendent une ligne ;
// `.in(`/`.eq(` sur autre chose que school_id réduisent à un sous-ensemble fixe.
const BORNES = [
  'fetchAllRows', 'fetchToutesLesLignes', '.limit(', '.range(', '.single(', '.maybeSingle(',
  'fetchParLotsDIds',
];

// Découpe un fichier en fonctions exportées : on juge une lecture dans SON corps,
// pas dans une fenêtre de lignes arbitraire qui attraperait la fonction d'à côté.
function fonctions(src) {
  const lignes = src.split('\n');
  const out = [];
  let courante = null;
  for (const l of lignes) {
    if (/^(export )?(async )?function /.test(l) || /^(export )?const \w+ = (async )?\(/.test(l)) {
      if (courante) out.push(courante);
      courante = { nom: (l.match(/function (\w+)|const (\w+)/) || [])[1] || (l.match(/const (\w+)/) || [])[1] || '?', corps: [l] };
      continue;
    }
    if (courante) courante.corps.push(l);
  }
  if (courante) out.push(courante);
  return out.map((f) => ({ nom: f.nom, corps: f.corps.join('\n') }));
}

function lecturesNonBornees() {
  const trouvees = [];
  for (const fichier of readdirSync(DIR).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(join(DIR, fichier), 'utf8').replace(/\r\n/g, '\n');
    for (const f of fonctions(src)) {
      // Une lecture complète : select('*') ET filtrée sur l'école.
      if (!/\.select\('\*'\)/.test(f.corps)) continue;
      if (!/\.eq\('school_id'/.test(f.corps)) continue;
      if (BORNES.some((b) => f.corps.includes(b))) continue;
      // Un filtre sur une AUTRE clé que school_id réduit déjà le jeu.
      const autresFiltres = [...f.corps.matchAll(/\.eq\('(\w+)'/g)].map((m) => m[1])
        .filter((c) => c !== 'school_id' && c !== 'active');
      if (autresFiltres.length) continue;
      for (const m of f.corps.matchAll(/\.from\('(\w+)'\)/g)) {
        const table = m[1];
        if (BORNEES[table]) continue;
        trouvees.push({ fichier, fonction: f.nom, table });
      }
    }
  }
  return trouvees;
}

test('AUCUNE table qui grossit n’est lue en entier sans pagination', () => {
  const fautives = lecturesNonBornees();
  const message = fautives.length
    ? '\n\nLECTURE COMPLÈTE NON PAGINÉE :\n'
      + fautives.map((f) => `  • ${f.table} — ${f.fichier} / ${f.fonction}()`).join('\n')
      + '\n\nPostgREST tronque à 1000 lignes en répondant 200 : au-delà, les lignes'
      + '\nmanquantes sont INVISIBLES, sans erreur. Deux issues, et deux seulement :'
      + '\n  1. paginer — `fetchAllRows(() => …)` ou `fetchToutesLesLignes(table, …)`,'
      + '\n     avec un ordre sur une clé unique ;'
      + '\n  2. si la table ne peut PAS croître, l’inscrire dans BORNEES avec sa raison.'
      + '\nMesure du 2026-11-05 : 1 873 notes en base, 1 000 lues, 873 invisibles.\n'
    : '';
  assert.equal(fautives.length, 0, message);
});

test('les quatre lectures de notes passent bien par la pagination', () => {
  // Celles qui ont causé le défaut. Nommées une à une : le balayage ci-dessus
  // pourrait les manquer si leur forme changeait, celui-ci ne le peut pas.
  const lire = (f) => readFileSync(join(DIR, f), 'utf8');
  assert.match(lire('primService.js'), /fetchToutesLesLignes\('prim_notes'/);
  assert.match(lire('primService.js'), /fetchToutesLesLignes\('prim_competences_non_evaluees'/);
  assert.match(lire('apcService.js'), /fetchToutesLesLignes\('apc_notes'/);
  assert.match(lire('matService.js'), /fetchToutesLesLignes\('mat_observations'/);
});

test('et les deux tables qui grossissent avec l’activité de l’école', () => {
  const lire = (f) => readFileSync(join(DIR, f), 'utf8');
  // Une ligne par encaissement : un journal tronqué donne un SOLDE FAUX.
  assert.match(lire('cashBookService.js'), /fetchAllRows\(\(\) => \{/);
  // Une ligne par élève et par poste : 250 élèves à quatre postes suffisent.
  assert.match(lire('feeCatalogService.js'), /fetchAllRows\(\(\) => \{/);
});

test('BORNEES porte une raison lisible pour chaque table, pas une case cochée', () => {
  for (const [table, raison] of Object.entries(BORNEES)) {
    assert.ok(raison && raison.length > 10, `${table} doit dire POURQUOI elle est bornée`);
  }
});
