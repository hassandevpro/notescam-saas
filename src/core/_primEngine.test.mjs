// Test du cœur pur maternelle + primaire APC : cote dérivée /10, moyenne pondérée
// par critère puis par compétence, dominance A/ECA/NA, et résolution du moteur par
// niveau (PS/MS/GS → maternelle ; SIL…CM2 → apc_primaire). Aucune dépendance.
import { primCote, competenceAverage, generalAverage, competencesForNiveau, bulletinRows,
         subjectsFromPrimReferentiel, PRIM_COTE_DEFAULT } from './primEngine.js';
import { dominantAcquis, isValidAcquis, domainesForMaternelle, subjectsFromMatReferentiel } from './matEngine.js';
import { resolveClassEngine, isMaternelle, isPrimaire,
         maternelleNiveauSlug, primaireNiveauSlug } from './engineResolver.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// ── PRIMAIRE APC ──────────────────────────────────────────────────────────────
const criteres = [
  { id: 'oral', poids: 1 }, { id: 'ecrit', poids: 1 },
  { id: 'pratique', poids: 1 }, { id: 'savoir_etre', poids: 1 },
];

// 1) Cote dérivée sur /10 (90/70/50 %).
ok(primCote(9.5, 10).cote === 'A+', '9.5/10 → A+ (≥90%)');
ok(primCote(7, 10).cote === 'A',   '7/10 → A (≥70%)');
ok(primCote(5, 10).cote === 'ECA', '5/10 → ECA (≥50%)');
ok(primCote(3, 10).cote === 'NA',  '3/10 → NA (<50%)');
ok(primCote(null, 10) === null,    'pas de moyenne → pas de cote');

// 2) Moyenne d'une compétence : critères non notés ignorés (pas comptés 0).
ok(competenceAverage({ oral: 8, ecrit: 6 }, criteres) === 7, 'moyenne (8+6)/2 = 7 (pratique/savoir_etre absents ignorés)');
ok(competenceAverage({}, criteres) === null, 'aucun critère noté → null');

// 3) Poids de critère respecté.
ok(competenceAverage({ oral: 10, ecrit: 4 }, [{ id: 'oral', poids: 3 }, { id: 'ecrit', poids: 1 }]) === 8.5,
  'poids : (10×3 + 4×1)/4 = 8.5');

// 4) Moyenne générale pondérée par coef de compétence ; non notées exclues.
ok(generalAverage([{ moyenne: 8, coef: 2 }, { moyenne: 6, coef: 1 }, { moyenne: null, coef: 5 }]) ===
  Math.round((8 * 2 + 6) / 3 * 100) / 100, 'moyenne générale pondérée (compétence non notée exclue)');

// 5) Compétences d'un niveau : par défaut les 11 (fixes), triées.
const primRef = {
  competences: [
    { id: '2a', code: '2A', intitule: 'Maths', coefficient: 2, ordre: 40, actif: true },
    { id: '1a', code: '1A', intitule: 'Français', coefficient: 3, ordre: 10, actif: true },
    { id: '6b', code: '6B', intitule: 'Arts', coefficient: 1, ordre: 110, actif: true },
  ],
  niveauCompetences: [{ niveau_id: 'cm1', competence_id: '6b', actif: false }], // 6B désactivée en CM1
};
const cm1 = competencesForNiveau(primRef, 'cm1');
ok(cm1[0].id === '1a' && cm1.length === 2, 'CM1 : tri par ordre + exception 6B retirée');
const cp = competencesForNiveau(primRef, 'cp');
ok(cp.length === 3, 'CP : aucune exception → les 3 compétences');

// 6) bulletinRows : moyenne + cote par compétence.
const rows = bulletinRows(cp, criteres, { '1a': { oral: 8, ecrit: 8 }, '2a': { oral: 4, ecrit: 4 } }, 10);
const r1a = rows.find((r) => r.competence.id === '1a');
ok(r1a.moyenne === 8 && r1a.cote === 'A', '1A : moyenne 8 → cote A');
ok(rows.find((r) => r.competence.id === '6b').moyenne === null, '6B non notée → moyenne null');

// 7) Matérialisation en subjects (max /10, lien compétence).
let n = 0;
const subs = subjectsFromPrimReferentiel(cp, { schoolId: 'S', classId: 'K', gradeMax: 10, makeId: () => `id${++n}` });
ok(subs.length === 3 && subs[0].max === 10 && subs[0].prim_competence_id, 'subjects primaire : max 10 + lien compétence');

// ── MATERNELLE ────────────────────────────────────────────────────────────────
ok(isValidAcquis('A') && isValidAcquis('ECA') && isValidAcquis('NA') && !isValidAcquis('X'), 'acquis valides A/ECA/NA');
ok(dominantAcquis([{ niveau_acquis: 'A' }, { niveau_acquis: 'A' }, { niveau_acquis: 'ECA' }]) === 'A', 'dominance = A');
ok(dominantAcquis([{ niveau_acquis: 'A' }, { niveau_acquis: 'NA' }]) === 'A', 'égalité → plus favorable (A)');
ok(dominantAcquis([]) === null, 'aucune observation → null');

const matRef = { domaines: [
  { id: 'psychomotricite', intitule: 'Psychomotricité', ordre: 4, actif: true },
  { id: 'langage_communication', intitule: 'Langage et communication', ordre: 1, actif: true },
  { id: 'obsolete', intitule: 'Ancien', ordre: 2, actif: false },
] };
const doms = domainesForMaternelle(matRef);
ok(doms.length === 2 && doms[0].id === 'langage_communication', 'domaines actifs triés (inactif exclu)');
let m = 0;
const msubs = subjectsFromMatReferentiel(doms, { schoolId: 'S', classId: 'K', makeId: () => `d${++m}` });
ok(msubs.length === 2 && msubs[0].max === 20 && msubs[0].mat_domaine_id, 'subjects maternelle : max placeholder (NOT NULL en base) + lien domaine');

// ── RÉSOLUTION DU MOTEUR PAR NIVEAU ─────────────────────────────────────────────
const school = (e) => ({ bulletin_engine: e });
ok(maternelleNiveauSlug('', 'GS A') === 'gs' && maternelleNiveauSlug('PS', '') === 'ps', 'slugs maternelle GS/PS');
ok(primaireNiveauSlug('', 'CM1 A') === 'cm1' && primaireNiveauSlug('CE2', '') === 'ce2', 'slugs primaire CM1/CE2');
ok(isMaternelle('', 'MS B') && !isPrimaire('', 'MS B'), 'MS = maternelle, pas primaire');
ok(isPrimaire('', 'SIL A') && !isMaternelle('', 'SIL A'), 'SIL = primaire, pas maternelle');
ok(resolveClassEngine(school('minedub'), { level: '', name: 'GS A' }) === 'maternelle', 'minedub + GS → maternelle');
ok(resolveClassEngine(school('minedub'), { level: '', name: 'CM2 A' }) === 'apc_primaire', 'minedub + CM2 → apc_primaire');
ok(resolveClassEngine(school('apc_primaire'), { level: '', name: 'GS A' }) === 'classic', 'apc_primaire + GS → classic (hors périmètre)');
ok(resolveClassEngine(school('classic'), { level: '', name: 'CM1 A' }) === 'classic', 'école classique → classic');
// Surcharge par classe : école classique, classe forcée APC.
ok(resolveClassEngine(school('classic'), { level: '', name: 'CM1 A', bulletin_engine: 'apc_primaire' }) === 'apc_primaire',
  'surcharge classe : classic + override apc_primaire → apc_primaire');
// Surcharge par classe : école MINEDUB, classe forcée classique (privé « classique »).
ok(resolveClassEngine(school('minedub'), { level: '', name: 'CM2 A', bulletin_engine: 'classic' }) === 'classic',
  'surcharge classe : minedub + override classic → classic');

console.log(failed ? '\n❌ DES TESTS ONT ÉCHOUÉ' : '\n✅ Tous les tests MATERNELLE + PRIMAIRE APC passent');
process.exit(failed ? 1 : 0);
