// Rapport du primaire APC pour une école EN SÉQUENCES : « Séquence n » = UA n.
//   node src/lib/_rapportPeriodePrimSequences.test.mjs
// Et une école en TRIMESTRES (défaut) ne change pas d'un chiffre.
import { buildClassReport } from './classReportEngine.js';

let failed = false;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed = true; };
const eq = (a, b, m) => ok(a === b, `${m}  (${JSON.stringify(a)} attendu ${JSON.stringify(b)})`);

const cls = { id: 'c1', level: 'CE1', name: 'CE1' };
const primReferentiel = {
  competences: [{ id: 'k1', code: '1A', intitule: 'Lire', coefficient: 1, ordre: 1, actif: true }],
  criteres: [{ id: 'cr1', nom: 'Oral' }],
  baremeCriteres: [{ niveau_id: 'ce1', competence_id: 'k1', critere_id: 'cr1', points_max: 20, ordre: 1, aptitude: 'apte' }],
};
const students = [{ id: 'e1', name: 'Abena' }];
// UA1 = 20/20 (100 %), UA2 = 10/20 (50 %), UA4 = 0/20 (0 %).
const note = (ua, v) => ({ [`e1_k1_cr1_${ua}`]: { eleve_id: 'e1', competence_id: 'k1', critere_id: 'cr1', ua, note: v } });
const primNotes = { ...note(1, 20), ...note(2, 10), ...note(4, 0) };
const moy = (period) => buildClassReport({
  engine: 'apc_primaire', cls, students, subjects: [], period, primNotes, primReferentiel,
}).rows[0].avg;

// ── École en séquences : la période porte ses UA ─────────────────────────────
eq(moy({ seqs: [1], uas: [1] }), 20, 'Séquence 1 = UA1 seule → 20');
eq(moy({ seqs: [2], uas: [2] }), 10, 'Séquence 2 = UA2 seule → 10');
eq(moy({ seqs: [3], uas: [3] }), null, 'Séquence 3 = UA3, aucune note → pas de moyenne (jamais 0 inventé)');
eq(moy({ seqs: [4], uas: [4] }), 0, 'Séquence 4 = UA4 = 0/20 → 0 (un zéro saisi n’est pas une absence)');
eq(moy({ seqs: [1, 2, 3, 4, 5, 6, 7, 8], uas: [1, 2, 3, 4, 5, 6, 7, 8] }), 10, 'Annuel (8 UA) → moyenne des UA notées (20, 10, 0) = 10');

// ── École en trimestres (aucun `uas`) : comportement HISTORIQUE inchangé ─────
eq(moy({ seqs: [1] }), 15, 'Trimestre 1 = UA1-3 → moyenne de UA1 et UA2 (20 et 10) = 15, comme avant');
eq(moy({ seqs: [2] }), 0, 'Trimestre 2 = UA4-6 → UA4 seule = 0');
eq(moy({ seqs: [1, 2, 3] }), 10, 'Annuel trimestriel = 8 UA → 10, comme avant');

process.exit(failed ? 1 : 0);
