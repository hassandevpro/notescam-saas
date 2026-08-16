// Tests du calcul « X/Y notes saisies » par moteur (module pur) :
//   node src/lib/_gradeEntryProgress.test.mjs
import { classEntryProgress, latestPeriodWithData, indexPrimNotes } from './gradeEntryProgress.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };
const eq = (a, b, msg) => ok(a === b, `${msg}  (${a} attendu ${b})`);

const studs = [{ id: 'e1' }, { id: 'e2' }];

// ── Classique / second cycle : gradeMap ─────────────────────────────────────
{
  const cls  = { id: 'c1' };
  const subs = [{ id: 'm1' }, { id: 'm2' }];
  const gradeMap = {
    c1_e1_3: { m1: 14, m2: '' },      // 1 saisie
    c1_e2_3: { m1: 'ABS', m2: 9 },    // ABS ne compte pas → 1 saisie
    c1_e1_4: { m1: 12, m2: 12 },
  };
  const p = classEntryProgress({ engine: 'classic', cls, subs, studs, order: 3, gradeMap });
  eq(p.expected, 4, 'classique : 2 élèves × 2 matières');
  eq(p.entered, 2, 'classique : vide et ABS ne comptent pas');

  eq(classEntryProgress({ engine: 'sc', cls, subs, studs, order: 5, gradeMap }).entered, 0,
    'classique : séquence sans aucune saisie');
  eq(latestPeriodWithData({ engine: 'classic', cls, subs, studs, maxOrder: 6, gradeMap }), 4,
    'repli : la dernière séquence renseignée est la 4');
  eq(latestPeriodWithData({ engine: 'classic', cls, subs, studs, maxOrder: 6, gradeMap: {} }), null,
    'repli : aucune donnée → null');
}

// ── Maternelle : observations A / ECA / NA ──────────────────────────────────
{
  const cls  = { id: 'cm' };
  const subs = [{ id: 's1', mat_domaine_id: 'd1' }, { id: 's2', mat_domaine_id: 'd2' }];
  const matObservations = {
    e1_d1_t2: { niveau_acquis: 'A' },
    e1_d2_t2: { niveau_acquis: '' },      // ligne créée mais vide
    e2_d1_t2: { niveau_acquis: 'ECA' },
    e2_d1_t1: { niveau_acquis: 'NA' },    // autre trimestre
  };
  const p = classEntryProgress({ engine: 'maternelle', cls, subs, studs, order: 2, matObservations });
  eq(p.expected, 4, 'maternelle : 2 élèves × 2 domaines');
  eq(p.entered, 2, 'maternelle : seules les observations cotées comptent, du bon trimestre');

  // Le bug d'origine : la maternelle comptée sur gradeMap restait à 0 pour toujours.
  eq(classEntryProgress({ engine: 'classic', cls, subs, studs, order: 2, gradeMap: {} }).entered, 0,
    'témoin : la formule classique voit 0 sur une maternelle…');
  ok(p.entered > 0, '…alors que le moteur maternelle voit bien les observations');

  eq(latestPeriodWithData({ engine: 'maternelle', cls, subs, studs, maxOrder: 3, matObservations }), 2,
    'repli maternelle : dernier trimestre observé = 2');
}

// ── Primaire APC : notes par critère, comptées au grain compétence ───────────
{
  const cls  = { id: 'cp' };
  const subs = [{ id: 's1', prim_competence_id: 'k1' }, { id: 's2', prim_competence_id: 'k2' }];
  const primNotes = {
    a: { eleve_id: 'e1', competence_id: 'k1', critere_id: 'cr1', ua: 4, note: 7 },
    b: { eleve_id: 'e1', competence_id: 'k1', critere_id: 'cr2', ua: 4, note: 8 },  // même compétence
    c: { eleve_id: 'e2', competence_id: 'k2', critere_id: 'cr1', ua: 4, note: null },
    d: { eleve_id: 'e2', competence_id: 'k1', critere_id: 'cr1', ua: 5, note: 6 },  // autre UA
  };
  const p = classEntryProgress({ engine: 'apc_primaire', cls, subs, studs, order: 4, primNotes });
  eq(p.expected, 4, 'primaire : 2 élèves × 2 compétences');
  eq(p.entered, 1, 'primaire : 2 critères d’une même compétence = 1 saisie, note nulle ignorée');
  eq(classEntryProgress({ engine: 'apc_primaire', cls, subs, studs, order: 5, primNotes }).entered, 1,
    'primaire : l’UA 5 a bien sa propre saisie');
  eq(latestPeriodWithData({ engine: 'apc_primaire', cls, subs, studs, maxOrder: 8, primNotes }), 5,
    'repli primaire : dernière UA renseignée = 5');

  // L'index évite de rebalayer `primNotes` à chaque (classe × UA) ; il doit
  // donner EXACTEMENT le même résultat que le calcul direct.
  const primIndex = indexPrimNotes(primNotes);
  eq(primIndex[4].size, 1, 'index UA4 : une seule paire (élève, compétence) notée');
  ok(primIndex[4].has('e1_k1'), 'index UA4 : la paire attendue');
  ok(!primIndex[4].has('e2_k2'), 'index : une note nulle n’entre pas dans l’index');
  eq(classEntryProgress({ engine: 'apc_primaire', cls, subs, studs, order: 4, primIndex }).entered,
     classEntryProgress({ engine: 'apc_primaire', cls, subs, studs, order: 4, primNotes }).entered,
     'index et balayage direct donnent le même compte');
  eq(classEntryProgress({ engine: 'apc_primaire', cls, subs, studs, order: 7, primIndex }).entered, 0,
     'UA sans aucune note via l’index');
  eq(Object.keys(indexPrimNotes(null)).length, 0, 'index d’un jeu de notes absent');
}

// ── APC premier cycle : compétences du référentiel ───────────────────────────
{
  const cls = { id: 'ca', level: '6ème', name: '6e A' };
  const apcReferentiel = {
    competences: [
      { id: 'k1', classe_id: '6e', trimestre_id: 't1', matiere_id: 'mat' },
      { id: 'k2', classe_id: '6e', trimestre_id: 't1', matiere_id: 'fra' },
      { id: 'k3', classe_id: '6e', trimestre_id: 't2', matiere_id: 'mat' },   // autre trimestre
      { id: 'k4', classe_id: '6e', trimestre_id: 't1', matiere_id: 'ang', actif: false },
      { id: 'k5', classe_id: '5e', trimestre_id: 't1', matiere_id: 'mat' },   // autre classe
    ],
  };
  const apcNotes = {
    e1_k1_s2: { note: 15 },
    e1_k2_s2: { note: null },
    e2_k1_s2: { note: 11 },
    e2_k1_s1: { note: 9 },
  };
  // Séquence 2 → trimestre t1 (SEQ_TO_TRIM).
  const p = classEntryProgress({ engine: 'apc', cls, studs, order: 2, apcNotes, apcReferentiel });
  eq(p.expected, 4, 'APC : 2 élèves × 2 compétences actives de la 6e au trimestre 1');
  eq(p.entered, 2, 'APC : les compétences non notées ou inactives ne comptent pas');

  const unknown = classEntryProgress({ engine: 'apc', cls, studs, order: 2, apcNotes, apcReferentiel: null });
  eq(unknown.expected, null, 'APC sans référentiel chargé : attendu inconnu, pas un faux 0');
  eq(classEntryProgress({ engine: 'apc', cls: { id: 'x', level: 'Tle' }, studs, order: 2, apcNotes, apcReferentiel }).expected, null,
    'APC : une classe hors premier cycle n’a pas de compétences');
}

// ── Garde-fou ───────────────────────────────────────────────────────────────
eq(classEntryProgress({ engine: 'classic', cls: { id: 'c' }, subs: [], studs: [], order: null }).expected, null,
  'sans période, rien à calculer');

console.log(failed ? '\n❌ ÉCHECS' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
