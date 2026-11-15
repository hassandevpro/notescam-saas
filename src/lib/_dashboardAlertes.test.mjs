import { aSuivre, aFaire, classesDuFiltre, SEUILS } from './dashboardAlertes.js';

let ok = 0; let ko = 0;
const t = (nom, cond, info = '') => { if (cond) { ok++; console.log('✅', nom); } else { ko++; console.log('❌', nom, info); } };

const L = [
  { id: 'a', nom: '6eA', cur: { avg: 8, graded: 20, above: 5, maxScale: 20 }, prev: { avg: 10, graded: 20, above: 10, maxScale: 20 } },
  { id: 'b', nom: 'Form1', cur: { avg: 70, graded: 10, above: 8, maxScale: 100 }, prev: { avg: 72, graded: 10, above: 8, maxScale: 100 } },  // 14/20, stable
  { id: 'c', nom: 'Vide', cur: { avg: null, graded: 0, above: 0, maxScale: 20 }, prev: null },
];
const s = aSuivre(L);
t('moyenne basse (8/20) = urgent', s.some((x) => x.type === 'moyenne_basse' && x.classId === 'a' && x.gravite === 2));
t('réussite basse (25 %)', s.some((x) => x.type === 'reussite_basse' && x.valeur === 25));
t('baisse de 2 pts signalée', s.some((x) => x.type === 'baisse' && x.valeur === -2));
t('classe saine (14/20 sur barème 100) : rien', !s.some((x) => x.classId === 'b'));
t('classe sans note : rien (pas de faux signal)', !s.some((x) => x.classId === 'c'));
t('tri : les urgences d\'abord', s[0].gravite === 2);
t('seuil exporté', SEUILS.moyenneBasse === 10);

const f = aFaire({
  retards: [{ cls: { id: 'a', name: '6eA' }, joursRetard: 12 }],
  encours: [{ cls: { id: 'b', name: 'Form1' }, atRisk: true, joursRestants: 2 }, { cls: { id: 'c', name: 'x' }, atRisk: false, joursRestants: 30 }],
  calendrierConfirme: false, matieresSansEnseignant: 3,
});
t('à faire : retard (urgent) en tête', f[0].type === 'saisie_en_retard' && f[0].valeur === 12);
t('à faire : limite proche seulement si à risque', f.filter((x) => x.type === 'limite_proche').length === 1);
t('à faire : matières sans enseignant et calendrier', f.some((x) => x.type === 'matieres_sans_enseignant' && x.valeur === 3) && f.some((x) => x.type === 'calendrier_a_confirmer'));
t('rien à faire : liste vide', aFaire({}).length === 0);

const classes = [{ id: '1', cycle: 'primaire' }, { id: '2', cycle: 'secondaire' }, { id: '3', cycle: 'secondaire' }];
t('filtre école entière = null', classesDuFiltre('all', classes) === null);
t('filtre cycle', [...classesDuFiltre('cycle:secondaire', classes)].join() === '2,3');
t('filtre classe', [...classesDuFiltre('class:1', classes)].join() === '1');

console.log(`\n✅ À suivre / À faire : ${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
