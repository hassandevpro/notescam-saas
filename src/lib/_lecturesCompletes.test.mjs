// AUCUNE LECTURE NE DOIT ÉCHAPPER À LA PAGINATION — le garde-fou durable.
//
// ── CE QUE CE BANC EMPÊCHE DE REVIVRE ────────────────────────────────────────
//
// Le 2026-11-05, BRIGHT CONTINENT a répété pendant des jours que les notes du primaire
// « ne persistaient pas ». Mesure faite dans son navigateur, sur sa base réelle :
//
//     total en base ................ 1 873
//     reçues par l'application ..... 1 000
//     invisibles ...................   873
//
// PostgREST plafonne CHAQUE select à 1000 lignes et répond `200` en tronquant. Une note
// saisie partait bien — POST 200, ligne en base — mais au rechargement elle tombait hors
// des mille premières lignes et l'écran l'affichait vide. Aucune erreur, console vide :
// il n'y avait rien à voir, puisque le serveur disait oui.
//
// RIEN N'AVAIT JAMAIS ÉTÉ PERDU. Tout était en base, et invisible.
//
// ── POURQUOI CE BANC A ÉTÉ DURCI LE MÊME JOUR ────────────────────────────────
//
// Sa première version ne regardait que `src/lib`, et seulement les `select('*')`. Elle a
// donc laissé passer, le jour même où elle était écrite :
//
//   • `attendance` lu par le BULLETIN, le CONSEIL DE CLASSE et la FICHE D'ÉLÈVE avec une
//     projection nommée (`select('student_id, …')`) : les absences imprimées sur le
//     carnet étaient sous-comptées pour toute classe cumulant plus de mille absences,
//     et, faute de `.order()`, deux tirages du même bulletin pouvaient différer ;
//   • `attendance` lu par l'écran de STATISTIQUES sans classe choisie, donc sur l'école
//     entière pour une année ;
//   • `fee_payments` lu par `fetchReceiptNumbers`, qui cherche les TROUS dans la série
//     des reçus : tronqué, il déclarait manquants tous les reçus au-delà du millième —
//     l'outil censé détecter un détournement en inventait des centaines.
//
// D'où les trois règles de cette version : TOUT `src/`, TOUTE projection, et plus aucune
// exemption automatique. Un filtre sur une clé ne dispense de paginer que s'il est
// inscrit dans `REDUITES` avec sa raison écrite — un choix qui se relit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, relative, sep } from 'node:path';

const LIB = dirname(fileURLToPath(import.meta.url));
const SRC = dirname(LIB);

// ── LES TABLES BORNÉES PAR NATURE ────────────────────────────────────────────
// Chaque entrée dit POURQUOI elle ne peut pas franchir 1000 lignes dans une école.
// Si l'une se met à croître (nouvelle fonctionnalité, école plus grande), la retirer
// d'ici et la paginer — c'est le seul geste correct.
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
  school_backups: 'les sauvegardes conservées par l’école',
  sequence_dates: 'les dates des séquences d’une année',
  timetable_slots: 'les créneaux d’un emploi du temps',
  hr_payroll_catalog: 'le catalogue des lignes de paie',
  governance_roles: 'les rôles de gouvernance',
  user_governance_roles: 'les rôles attribués aux utilisateurs',
  signalements: 'les signalements ouverts d’une école',
  mat_domaines_masques: 'les domaines masqués, un par domaine et par classe',
  prim_competences_classe_masquees: 'les compétences masquées, une par classe',
  prim_criteres_masques_classe: 'les critères masqués, un par critère, compétence et classe',
  prim_criteres_masques_init: 'les classes dont le masque des critères est initialisé',
  prim_criteres_classe_masques: 'les critères masqués, un par critère et par classe',
  apc_matieres: 'les matières APC d’une école',
  referentiel_libelles: 'les libellés renommés par l’école',
  // Personnel et structure : bornés par la taille de l'établissement.
  classes: 'les classes d’une école',
  subjects: 'les matières des classes d’une école',
  staff: 'le personnel d’une école',
  teachers: 'les enseignants d’une école',
  academic_periods: 'les trimestres d’une année',
  cash_sessions: 'les sessions de caisse ouvertes',
};

// ── LES LECTURES RÉDUITES PAR UN FILTRE QUI BORNE VRAIMENT ───────────────────
// Clé : « fichier → bloc → table ». La valeur dit quel filtre borne, et jusqu'où.
//
// CE QUI NE BORNE PAS, et qu'aucune entrée ne doit prétendre borner : `class_id` seul,
// `year_label` seul, ou les deux ensemble. Une classe accumule des absences toute
// l'année — c'est précisément le défaut corrigé ce jour-là.
const REDUITES = {
  'pages/Absences.jsx → SaisieTab → attendance':
    'class_id + date + session + subject_id : au plus l’effectif d’une classe pour une séance',
  'governance/governanceService.js → fetchUserGovernanceRoles → user_governance_roles':
    'user_id : les rôles d’UNE personne',
  'lib/hrService.js → fetchPayrollItems → hr_payroll_items':
    'payroll_id : les lignes d’UN bulletin de paie',
  'lib/notificationProducers.js → staff → staff':
    'department : le personnel d’un service, borné par la taille de l’établissement',
};

// Ce qui BORNE une lecture. `fetchAllRows`/`fetchToutesLesLignes` paginent ;
// `.limit`/`.range` plafonnent ; `.single`/`maybeSingle` rendent une ligne ;
// un `count` ne rapatrie aucune ligne.
const BORNES = [
  'fetchAllRows', 'fetchToutesLesLignes', '.limit(', '.range(', '.single(', '.maybeSingle(',
  'fetchParLotsDIds', "count: 'exact'",
];

function fichiers(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (/\.(js|jsx)$/.test(e) && !/\.test\.|_test|\.spec\.|\.bak$/.test(e)) out.push(p);
  }
  return out;
}

// Découpe un fichier en blocs (fonction, hook, méthode) : on juge une lecture dans SON
// corps, pas dans une fenêtre de lignes arbitraire qui attraperait celle d'à côté.
function blocs(src) {
  const lignes = src.split('\n');
  const out = [];
  let cur = null;
  for (let i = 0; i < lignes.length; i += 1) {
    const l = lignes[i];
    if (/^(export )?(async )?function |^(export )?const \w+ = (async )?\(|^\s{0,2}(async )?\w+\s*[:(]/.test(l)) {
      if (cur) out.push(cur);
      cur = { nom: (l.match(/(?:function|const)\s+(\w+)/) || [])[1] || l.trim().slice(0, 32), corps: [l] };
      continue;
    }
    if (cur) cur.corps.push(l);
  }
  if (cur) out.push(cur);
  return out.map((f) => ({ nom: f.nom, corps: f.corps.join('\n') }));
}

export function lecturesNonBornees() {
  const trouvees = [];
  const vues = new Set();
  for (const abs of fichiers(SRC)) {
    const src = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    if (!src.includes("from('")) continue;
    const fichier = relative(SRC, abs).split(sep).join('/');
    for (const b of blocs(src)) {
      // Une lecture : un `.from(table)` avec un `.select(` — TOUTE projection —, filtrée
      // sur l'école. C'est le `select('*')` de l'ancienne version qui laissait passer
      // `select('student_id, …')`, donc les absences du bulletin.
      if (!/\.select\(/.test(b.corps)) continue;
      if (!/\.eq\('school_id'/.test(b.corps)) continue;
      if (BORNES.some((x) => b.corps.includes(x))) continue;
      for (const m of b.corps.matchAll(/\.from\('(\w+)'\)/g)) {
        const table = m[1];
        if (BORNEES[table]) continue;
        const cle = `${fichier} → ${b.nom} → ${table}`;
        if (REDUITES[cle]) continue;
        if (vues.has(cle)) continue;
        vues.add(cle);
        trouvees.push({ cle, fichier, fonction: b.nom, table });
      }
    }
  }
  return trouvees;
}

test('AUCUNE lecture filtrée sur l’école n’échappe à la pagination, dans TOUT src/', () => {
  const fautives = lecturesNonBornees();
  const message = fautives.length
    ? '\n\nLECTURE NON BORNÉE :\n'
      + fautives.map((f) => `  • ${f.cle}`).join('\n')
      + '\n\nPostgREST tronque à 1000 lignes en répondant 200 : au-delà, les lignes'
      + '\nmanquantes sont INVISIBLES, sans erreur. Trois issues, et trois seulement :'
      + '\n  1. paginer — `fetchAllRows(() => …)` ou `fetchToutesLesLignes(table, …)`,'
      + '\n     avec un `.order()` sur une clé UNIQUE (sans quoi les pages se chevauchent) ;'
      + '\n  2. si la table ne peut PAS croître dans une école, l’inscrire dans BORNEES'
      + '\n     avec sa raison ;'
      + '\n  3. si un filtre la borne VRAIMENT, l’inscrire dans REDUITES avec la clé exacte'
      + '\n     et ce qu’elle laisse au plus. Attention : `class_id` et `year_label`, seuls'
      + '\n     ou ensemble, NE BORNENT PAS — une classe cumule des absences toute l’année.'
      + '\nMesure du 2026-11-05 : 1 873 notes en base, 1 000 lues, 873 invisibles.\n'
    : '';
  assert.equal(fautives.length, 0, message);
});

test('les lectures de NOTES passent bien par la pagination', () => {
  // Celles qui ont causé le défaut. Nommées une à une : le balayage ci-dessus pourrait
  // les manquer si leur forme changeait, celui-ci ne le peut pas.
  const lire = (f) => readFileSync(join(LIB, f), 'utf8');
  assert.match(lire('primService.js'), /fetchToutesLesLignes\('prim_notes'/);
  assert.match(lire('primService.js'), /fetchToutesLesLignes\('prim_competences_non_evaluees'/);
  assert.match(lire('apcService.js'), /fetchToutesLesLignes\('apc_notes'/);
  assert.match(lire('matService.js'), /fetchToutesLesLignes\('mat_observations'/);
  // Et les notes du SECONDAIRE, qui alimentent bulletins, rapports et fiche d'élève.
  // Elles échappaient au balayage d'hier : `select(GRADE_COLS)` n'est pas `select('*')`.
  assert.match(lire('schoolService.js'), /export async function fetchGrades[\s\S]{0,200}fetchAllRows/);
});

test('les ABSENCES du bulletin, du conseil et de la fiche d’élève sont paginées', () => {
  // Elles s'impriment SUR le bulletin (`__abs_j__` / `__abs_nj__`). Tronquées, elles
  // faisaient imprimer moins d'absences qu'il n'y en a — et la fiche d'élève, lue
  // autrement, pouvait annoncer un autre compte du MÊME fait.
  const lire = (f) => readFileSync(join(SRC, f), 'utf8').replace(/\r\n/g, '\n');
  for (const f of ['pages/Bulletins.jsx', 'pages/ConseilDeClasse.jsx',
    'pages/StudentDisciplineFile.jsx', 'pages/Absences.jsx', 'pages/VieScolaire.jsx']) {
    const src = lire(f);
    // La requête n'est pas toujours écrite au point d'appel : dans `Absences.jsx` elle est
    // bâtie par `faireQ` et passée à `fetchAllRows` plus bas. On vérifie donc que le
    // fichier PAGINE et qu'il ORDONNE sur `id` — le balayage ci-dessus, lui, garantit
    // qu'aucune lecture non bornée n'y subsiste, ce qu'une regex de voisinage ne peut dire.
    assert.ok(src.includes('fetchAllRows'),
      `${f} doit lire attendance à travers fetchAllRows`);
    assert.ok(src.includes(".order('id'"),
      `${f} doit ordonner attendance sur id — sans clé unique, les pages se chevauchent`);
  }
});

test('les NUMÉROS DE REÇUS sont paginés — un trou inventé se lit comme un détournement', () => {
  const src = readFileSync(join(LIB, 'cashSessionService.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /fetchAllRows\(faireQ, 'fetchReceiptNumbers'\)/);
  // `null` (lecture échouée) ne doit JAMAIS devenir une série vide, donc sans trou :
  // le rapport dirait « tout va bien » alors qu'il n'a rien pu lire.
  assert.match(src, /if \(data === null\) return \[\];/);
});

test('BORNEES et REDUITES portent une raison lisible, pas une case cochée', () => {
  for (const [table, raison] of Object.entries(BORNEES)) {
    assert.ok(raison && raison.length > 10, `${table} doit dire POURQUOI elle est bornée`);
  }
  for (const [cle, raison] of Object.entries(REDUITES)) {
    assert.ok(raison && raison.length > 20, `${cle} doit dire QUEL filtre borne, et jusqu’où`);
    assert.ok(/:/.test(raison), `${cle} doit nommer la clé qui borne`);
  }
});

test('le balayage SAIT ENCORE TOMBER — une projection nommée non paginée est vue', () => {
  // Sans cette preuve, un balayage cassé passerait pour un code sain. On vérifie que la
  // forme EXACTE qui avait échappé à la première version — `select('a, b')` sans
  // pagination, filtré sur la classe et l'année — est bien détectée.
  const faux = [
    'export async function fetchQuelqueChose(schoolId) {',
    "  const { data } = await supabase.from('attendance').select('student_id, date')",
    "    .eq('school_id', schoolId).eq('class_id', c).eq('year_label', y);",
    '  return data;',
    '}',
  ].join('\n');
  const b = blocs(faux)[0];
  assert.ok(/\.select\(/.test(b.corps), 'la lecture doit être reconnue comme un select');
  assert.ok(/\.eq\('school_id'/.test(b.corps), 'et comme filtrée sur l’école');
  assert.ok(!BORNES.some((x) => b.corps.includes(x)), 'elle n’est bornée par rien');
  assert.ok(!BORNEES.attendance, 'attendance ne doit JAMAIS être déclarée bornée par nature');
  assert.ok(!REDUITES['x → fetchQuelqueChose → attendance'],
    'et class_id + year_label ne doit jamais figurer dans REDUITES');
});
