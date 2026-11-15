import { kpisGlobaux, tendance, barresParClasse, repartition } from './dashboardKpi.js';

let ok = 0; let ko = 0;
const t = (nom, cond, info = '') => { if (cond) { ok++; console.log('✅', nom); } else { ko++; console.log('❌', nom, info); } };

const L = [
  { id: 'a', nom: '6eA', cur: { avg: 12, graded: 30, above: 24, maxScale: 20 }, prev: { avg: 11, graded: 30, above: 20, maxScale: 20 } },
  { id: 'b', nom: 'Form1', cur: { avg: 60, graded: 10, above: 5, maxScale: 100 }, prev: null },   // EN /100 → 12/20, pas de période précédente
];
const k = kpisGlobaux(L);
t('moyenne pondérée sur 20, barèmes mixtes (12 et 60/100=12)', k.moyenne === 12, JSON.stringify(k));
t('réussite = réussites ÷ élèves notés (29/40)', k.reussite === 73, JSON.stringify(k));
t('variation : seulement les classes comparables (6eA : +1,0 pt, +13 pts)', k.variationMoyenne === 1 && k.variationReussite === 13 && k.comparable === 1, JSON.stringify(k));

const sans = kpisGlobaux([{ id: 'c', nom: 'x', cur: { avg: 10, graded: 5, above: 3, maxScale: 20 }, prev: null }]);
t('aucune classe comparable : pas de variation inventée', sans.variationMoyenne === null && sans.variationReussite === null);
t('aucune donnée : tout est null, 0 classe', kpisGlobaux([]).moyenne === null && kpisGlobaux([]).classes === 0);
t('classe sans élève noté ignorée', kpisGlobaux([{ id: 'd', nom: 'y', cur: { avg: null, graded: 0, above: 0, maxScale: 20 }, prev: null }]).classes === 0);

t('tendance', tendance(1) === 'hausse' && tendance(-1) === 'baisse' && tendance(0.05) === 'stable' && tendance(null) === null);

const b = barresParClasse(L);
t('barres : triées du plus faible au plus fort, sur 20', b.length === 2 && b[0].valeur <= b[1].valeur && b[0].valeur === 12);
const r = repartition([3, 9.99, 10, 19.5, 20, null]);
t('répartition : 20/20 dans la dernière tranche, null ignoré', r[9].n === 2 && r[1].n === 1 && r[4].n === 1 && r[5].n === 1 && r.reduce((s, x) => s + x.n, 0) === 5, JSON.stringify(r));

console.log(`\n✅ Indicateurs du tableau de bord : ${ok} ok, ${ko} ko`);
process.exit(ko ? 1 : 0);
