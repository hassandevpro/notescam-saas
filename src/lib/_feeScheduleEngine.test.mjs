// L'ÉCHÉANCIER FACTURE-T-IL LES BONNES PÉRIODES, AU BON ÉLÈVE ?
//
// Fonctions pures : aucun DOM, aucune base, aucun réseau.
// Lancer : node src/lib/_feeScheduleEngine.test.mjs
//
// Ce que ce fichier protège, et pourquoi chaque point a été choisi :
//   • la liste des périodes est une DONNÉE — l'état de cantine de l'école ne
//     facture pas décembre, et un calcul « douze mois » le facturerait à tous ;
//   • aucune créance avant l'inscription — un élève arrivé en janvier ne doit
//     pas septembre, et c'est la règle la plus visible au guichet ;
//   • un trimestre entamé reste dû — l'écarter ferait cadeau d'un trimestre ;
//   • une exemption sort du dû — sinon ce n'est pas une exemption.
import {
  anneesDe, periodesParDefaut, periodesDuFrais, echeancierPour,
  statutEcheance, totauxEcheancier, libellePeriode,
} from './feeScheduleEngine.js';

let ko = 0;
const ok = (c, libelle, obtenu) => {
  if (c) { console.log(`✅ ${libelle}`); }
  else { console.log(`❌ ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); ko++; }
};
const cles = (l) => l.map((x) => x.period_key);

// ── Année scolaire ──────────────────────────────────────────────────────────
ok(JSON.stringify(anneesDe('2025-2026')) === '[2025,2026]', '1. « 2025-2026 » est compris', anneesDe('2025-2026'));
ok(JSON.stringify(anneesDe('2025/2026')) === '[2025,2026]', '2. « 2025/2026 » aussi (les écoles saisissent les deux)', anneesDe('2025/2026'));
ok(JSON.stringify(anneesDe('2025')) === '[2025,2026]', '3. une année seule est complétée', anneesDe('2025'));

// ── Périodes par défaut ─────────────────────────────────────────────────────
const mens = periodesParDefaut('mensuel', '2025-2026');
ok(mens.length === 10 && mens[0] === '2025-09' && mens[9] === '2026-06',
  '4. mensuel : septembre → juin (l’année scolaire, pas l’année civile)', [mens[0], mens[9], mens.length]);
ok(JSON.stringify(periodesParDefaut('trimestriel', '2025-2026')) === '["2025-T1","2025-T2","2025-T3"]',
  '5. trimestriel : trois trimestres', periodesParDefaut('trimestriel', '2025-2026'));
ok(periodesParDefaut('unique', '2025-2026').length === 1, '6. frais unique : une seule échéance');

// ── La liste explicite fait foi : le cas DÉCEMBRE de l’état de cantine ──────
const cantine = {
  periodicity: 'mensuel', amount: 15000, academic_year: '2025-2026',
  billing_periods: '["2025-09","2025-10","2025-11","2026-01","2026-02","2026-03","2026-04","2026-05"]',
};
const pCantine = periodesDuFrais(cantine, '2025-2026');
ok(pCantine.length === 8, '7. la liste explicite fait foi (8 mois, pas 10)', pCantine.length);
ok(!pCantine.includes('2025-12'),
  '8. DÉCEMBRE n’est PAS facturé — c’est ce que montre l’état de l’école', pCantine);

// Une liste vide ne doit pas rendre le frais muet : on retombe sur le défaut.
ok(periodesDuFrais({ periodicity: 'mensuel', billing_periods: '[]' }, '2025-2026').length === 10,
  '9. une liste vide retombe sur le défaut (un frais mensuel ne facture jamais rien, sinon)');

// ── Aucune créance avant l’inscription ──────────────────────────────────────
const entreeJanvier = echeancierPour(cantine, { academicYear: '2025-2026', enrolledAt: '2026-01-15' });
ok(!cles(entreeJanvier).some((k) => k < '2026-01'),
  '10. élève inscrit en janvier : aucun mois de l’automne ne lui est facturé', cles(entreeJanvier));
ok(cles(entreeJanvier).includes('2026-01'),
  '11. mais le mois de son arrivée l’est', cles(entreeJanvier));
ok(echeancierPour(cantine, { academicYear: '2025-2026' }).length === 8,
  '12. sans date d’inscription connue, toutes les périodes sont facturées');

// ── Un trimestre ENTAMÉ reste dû ────────────────────────────────────────────
// Le T1 court de septembre à décembre. Un élève arrivé en novembre l’a entamé :
// l’écarter reviendrait à lui offrir un trimestre de transport.
const transport = { periodicity: 'trimestriel', amount: 25000, academic_year: '2025-2026' };
const entreeNovembre = echeancierPour(transport, { academicYear: '2025-2026', enrolledAt: '2025-11-03' });
ok(cles(entreeNovembre).includes('2025-T1'),
  '13. arrivée en novembre : le 1er trimestre, entamé, reste dû', cles(entreeNovembre));
const entreeFevrier = echeancierPour(transport, { academicYear: '2025-2026', enrolledAt: '2026-02-01' });
ok(!cles(entreeFevrier).includes('2025-T1'),
  '14. arrivée en février : le 1er trimestre, clos, ne l’est pas', cles(entreeFevrier));
ok(cles(entreeFevrier).includes('2025-T2'), '15. et le 2e trimestre l’est', cles(entreeFevrier));

// ── Montant : celui d’UNE période ───────────────────────────────────────────
ok(entreeNovembre.every((l) => l.amount_due === 25000),
  '16. chaque échéance porte le montant d’UNE période', entreeNovembre[0]);

// ── Statuts ─────────────────────────────────────────────────────────────────
ok(statutEcheance({ amountDue: 15000, amountPaid: 0 }) === 'due', '17. rien versé → dû');
ok(statutEcheance({ amountDue: 15000, amountPaid: 5000 }) === 'partial', '18. versement partiel → partiellement payé');
ok(statutEcheance({ amountDue: 15000, amountPaid: 15000 }) === 'paid', '19. soldé → payé');
ok(statutEcheance({ amountDue: 15000, amountPaid: 20000 }) === 'paid', '20. trop-perçu → payé (jamais un statut négatif)');
ok(statutEcheance({ amountDue: 15000, amountPaid: 0, manualStatus: 'exempted' }) === 'exempted',
  '21. une exemption l’emporte sur le calcul — c’est une décision, pas une déduction');
ok(statutEcheance({ amountDue: 15000, amountPaid: 15000, manualStatus: 'abandoned' }) === 'abandoned',
  '22. un abandon aussi, même si la période était payée');

// ── Totaux ──────────────────────────────────────────────────────────────────
const lignes = [
  { period_key: '2025-09', amount_due: 15000 },
  { period_key: '2025-10', amount_due: 15000 },
  { period_key: '2025-11', amount_due: 15000, status: 'exempted' },
];
const tot = totauxEcheancier(lignes, { '2025-09': 15000, '2025-10': 5000 });
ok(tot.du === 30000, '23. le dû exclut la période exemptée', tot);
ok(tot.paye === 20000, '24. le payé additionne les versements', tot);
ok(tot.solde === 10000, '25. le solde est juste', tot);
ok(tot.exempte === 15000, '26. et l’exempté est compté à part, pas effacé', tot);

// ── Libellés ────────────────────────────────────────────────────────────────
ok(libellePeriode('2025-11', 'fr') === 'Novembre 2025', '27. libellé mensuel français', libellePeriode('2025-11', 'fr'));
ok(libellePeriode('2025-T1', 'fr') === '1er trimestre', '28. libellé trimestriel français', libellePeriode('2025-T1', 'fr'));
ok(libellePeriode('2025-11', 'en') === 'November 2025', '29. libellé anglais', libellePeriode('2025-11', 'en'));

console.log(ko === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${ko}`);
process.exitCode = ko === 0 ? 0 : 1;
