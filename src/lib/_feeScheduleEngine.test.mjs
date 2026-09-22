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
  soldeEcheance, repartitionVersement, paidForSchedule,
  peutChangerStatut, ventilationEcheancier, STATUTS_DECIDES, STATUTS_POSABLES,
  debutServiceEffectif, premierePeriodeApplicable,
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

// ── B4 : affecter un versement aux périodes ─────────────────────────────────
// Ce que ce bloc protège : le guichet reçoit une SOMME, pas une période. La
// façon dont cette somme devient « novembre soldé » doit être UNE règle, testée,
// et non l'improvisation de l'écran qui encaisse.
const echCantine = [
  { id: 'e1', period_key: '2025-09', period_label: 'Septembre 2025', amount_due: 15000, amount_paid: 15000, status: 'due' },
  { id: 'e2', period_key: '2025-10', period_label: 'Octobre 2025',   amount_due: 15000, amount_paid: 0,     status: 'due' },
  { id: 'e3', period_key: '2025-11', period_label: 'Novembre 2025',  amount_due: 15000, amount_paid: 5000,  status: 'due' },
  { id: 'e4', period_key: '2026-01', period_label: 'Janvier 2026',   amount_due: 15000, amount_paid: 0,     status: 'exempted' },
  { id: 'e5', period_key: '2026-02', period_label: 'Février 2026',   amount_due: 15000, amount_paid: 0,     status: 'due' },
];

ok(soldeEcheance(echCantine[0]) === 0, '30. une période soldée ne doit plus rien', soldeEcheance(echCantine[0]));
ok(soldeEcheance(echCantine[2]) === 10000, '31. une période partiellement payée doit le reste', soldeEcheance(echCantine[2]));
ok(soldeEcheance(echCantine[3]) === 0,
  '32. une période EXEMPTÉE ne doit rien — un encaissement ne révoque pas une décision', soldeEcheance(echCantine[3]));

const r1 = repartitionVersement(echCantine, 30000);
ok(r1.affectations.length === 3, '33. 30 000 couvrent trois périodes', r1.affectations);
ok(r1.affectations[0].period_key === '2025-10',
  '34. LES PLUS ANCIENNES D’ABORD — c’est ce qui fait le rattrapage d’arriérés', r1.affectations.map((a) => a.period_key));
ok(r1.affectations[0].amount === 15000 && r1.affectations[1].amount === 10000,
  '35. chaque période reçoit son SOLDE, jamais plus', r1.affectations.map((a) => a.amount));
ok(!r1.affectations.some((a) => a.schedule_id === 'e4'),
  '36. la période exemptée est sautée, pas payée', r1.affectations.map((a) => a.schedule_id));
ok(!r1.affectations.some((a) => a.schedule_id === 'e1'),
  '37. une période déjà soldée est ignorée', r1.affectations.map((a) => a.schedule_id));
ok(r1.affecte === 30000 && r1.reste === 0, '38. tout est affecté, rien ne se perd', r1);

ok(repartitionVersement(echCantine, 0).affectations.length === 0, '39. un versement nul n’affecte rien', repartitionVersement(echCantine, 0));
ok(repartitionVersement(echCantine, -5000).affecte === 0,
  '40. un montant négatif n’est pas une recette (il naît d’une contre-passation)', repartitionVersement(echCantine, -5000));
const r0 = repartitionVersement([], 15000);
ok(r0.affectations.length === 0 && r0.reste === 15000,
  '41. sans échéance, rien n’est affecté et la somme entière reste à la main du caissier', r0);

const r2 = repartitionVersement(echCantine, 100000);
ok(r2.affecte === 40000 && r2.reste === 60000,
  '42. au-delà du dû, le surplus reste NON affecté — il ne s’impute pas sur rien', r2);

// Tout ou rien : l'école a interdit le paiement partiel sur ce frais.
const r3 = repartitionVersement(echCantine, 20000, { allowPartial: false });
ok(r3.affectations.length === 1 && r3.affectations[0].period_key === '2025-10' && r3.reste === 5000,
  '43. sans paiement partiel : octobre entier, et le reste n’entame pas novembre', r3);
const r4 = repartitionVersement(echCantine, 5000, { allowPartial: false });
ok(r4.affectations.length === 0 && r4.affecte === 0,
  '44. sans paiement partiel, une somme trop faible n’affecte rien du tout', r4);
// Le cas qui distingue « s’arrêter » de « sauter » : avril est un demi-mois à
// 7 500 chez cette école. Avec 10 000 en main et octobre (15 000) impayé, une
// répartition qui CONTINUERAIT solderait avril et afficherait un mois vert
// devant un arriéré d’octobre. Elle doit s’arrêter.
const ordre = [
  { id: 'o1', period_key: '2025-10', period_label: 'Octobre 2025', amount_due: 15000, amount_paid: 0, status: 'due' },
  { id: 'o2', period_key: '2026-04', period_label: 'Avril 2026',   amount_due: 7500,  amount_paid: 0, status: 'due' },
];
const r5 = repartitionVersement(ordre, 10000, { allowPartial: false });
ok(r5.affectations.length === 0 && r5.reste === 10000,
  '45. la répartition S’ARRÊTE à la période non couverte — solder avril avant octobre masquerait un arriéré', r5);
// Transport : trimestres, et un versement partiel autorisé.
const echTransport = [
  { id: 't1', period_key: '2025-T1', period_label: '1er trimestre', amount_due: 30000, amount_paid: 0, status: 'due' },
  { id: 't2', period_key: '2025-T2', period_label: '2e trimestre',  amount_due: 20000, amount_paid: 0, status: 'abandoned' },
];
const r6 = repartitionVersement(echTransport, 12000);
ok(r6.affectations.length === 1 && r6.affectations[0].amount === 12000,
  '46. paiement partiel d’un trimestre : le versement s’impute sans solder', r6.affectations);
ok(!r6.affectations.some((a) => a.schedule_id === 't2'),
  '47. un trimestre ABANDONNÉ ne reçoit rien', r6.affectations);

// ── B4 : annuler le paiement d'une période le remet à « dû » ───────────────
// Une contre-passation est une écriture NÉGATIVE qui pointe l’originale. Pour
// qu’elle annule le bon mois, elle doit reprendre la période visée. Sans ce
// report, le total de l’élève baisserait mais novembre resterait vert : le
// relevé afficherait un mois payé que plus personne n’a payé, et c’est le seul
// écran où la famille lit sa dette.
const versements = [
  { id: 'v1', amount: 15000, student_fee_item_id: 'sfi', fee_schedule_item_id: 'nov' },
  { id: 'v2', amount: 15000, student_fee_item_id: 'sfi', fee_schedule_item_id: 'dec' },
];
ok(paidForSchedule('nov', versements) === 15000, '48. novembre est payé', paidForSchedule('nov', versements));

const avecAnnulation = [...versements,
  { id: 'v3', amount: -15000, reversal_of: 'v1', student_fee_item_id: 'sfi', fee_schedule_item_id: 'nov' }];
ok(paidForSchedule('nov', avecAnnulation) === 0,
  '49. la contre-passation qui PORTE la période remet novembre à zéro', paidForSchedule('nov', avecAnnulation));
ok(paidForSchedule('dec', avecAnnulation) === 15000,
  '50. et elle ne touche à aucun autre mois', paidForSchedule('dec', avecAnnulation));

// La régression que ce contrôle interdit : une annulation qui oublie la période.
const annulationSansLien = [...versements,
  { id: 'v4', amount: -15000, reversal_of: 'v1', student_fee_item_id: 'sfi', fee_schedule_item_id: null }];
ok(paidForSchedule('nov', annulationSansLien) === 15000,
  '51. sans ce lien, novembre resterait payé — c’est précisément le défaut corrigé', paidForSchedule('nov', annulationSansLien));

const soldeApres = soldeEcheance({ period_key: '2025-11', amount_due: 15000, amount_paid: paidForSchedule('nov', avecAnnulation), status: 'due' });
ok(soldeApres === 15000, '52. et le mois annulé redevient entièrement dû', soldeApres);
// ── B5 : décider du sort d’une période ──────────────────────────────────────
// Une période peut être ACTIVE, EXEMPTÉE, ABANDONNÉE ou NON APPLICABLE. Les
// trois dernières sont des DÉCISIONS de l’école : rien de calculé, et rien qu’un
// encaissement puisse révoquer.

ok(STATUTS_DECIDES.length === 3 && STATUTS_DECIDES.includes('exempted')
  && STATUTS_DECIDES.includes('abandoned') && STATUTS_DECIDES.includes('not_applicable'),
  '53. les trois décisions sont nommées', STATUTS_DECIDES);
ok(!STATUTS_POSABLES.includes('paid') && !STATUTS_POSABLES.includes('partial'),
  '54. « payé » et « partiellement payé » ne se posent PAS à la main — ils se déduisent des versements', STATUTS_POSABLES);

// ── Payable ou non ─────────────────────────────────────────────────────────
const per = (status, amount_paid = 0) => ({ id: 'x', period_key: '2025-11', amount_due: 15000, amount_paid, status });
ok(soldeEcheance(per('due')) === 15000, '55. période ACTIVE → payable', soldeEcheance(per('due')));
ok(soldeEcheance(per('exempted')) === 0, '56. période EXEMPTÉE → non payable', soldeEcheance(per('exempted')));
ok(soldeEcheance(per('abandoned')) === 0, '57. période ABANDONNÉE → non payable', soldeEcheance(per('abandoned')));
ok(soldeEcheance(per('not_applicable')) === 0, '58. période NON APPLICABLE → non payable', soldeEcheance(per('not_applicable')));

// Le FIFO de B4 ne doit pas sauter une période ACTIVE pour en atteindre une autre.
const suite = [
  { id: 's1', period_key: '2025-09', amount_due: 15000, amount_paid: 0, status: 'exempted' },
  { id: 's2', period_key: '2025-10', amount_due: 15000, amount_paid: 0, status: 'due' },
  { id: 's3', period_key: '2025-11', amount_due: 15000, amount_paid: 0, status: 'abandoned' },
  { id: 's4', period_key: '2025-12', amount_due: 15000, amount_paid: 0, status: 'due' },
];
const rep = repartitionVersement(suite, 30000);
ok(rep.affectations.map((a) => a.schedule_id).join(',') === 's2,s4',
  '59. le versement saute les périodes DÉCIDÉES et ne saute aucune période ACTIVE', rep.affectations.map((a) => a.schedule_id));
const rep1 = repartitionVersement(suite, 15000);
ok(rep1.affectations.length === 1 && rep1.affectations[0].schedule_id === 's2',
  '60. et il sert toujours la plus ancienne des ACTIVES en premier', rep1.affectations);

// ── Recevabilité de la décision ────────────────────────────────────────────
ok(peutChangerStatut({ nouveauStatut: 'exempted' }).ok, '61. exempter une période vierge est recevable');
ok(peutChangerStatut({ nouveauStatut: 'abandoned' }).ok, '62. acter un abandon aussi');
ok(peutChangerStatut({ nouveauStatut: 'not_applicable' }).ok, '63. déclarer non applicable aussi');
ok(peutChangerStatut({ nouveauStatut: 'due' }).ok, '64. revenir au suivi automatique est toujours possible');

const posePaid = peutChangerStatut({ nouveauStatut: 'paid' });
ok(!posePaid.ok && posePaid.raison === 'statut_non_posable',
  '65. « payé » ne se pose pas à la main — cela ferait mentir la caisse', posePaid);

const exInterdite = peutChangerStatut({ nouveauStatut: 'exempted', allowExemption: false });
ok(!exInterdite.ok && exInterdite.raison === 'exemption_interdite',
  '66. un frais qui interdit l’exemption la refuse', exInterdite);
ok(peutChangerStatut({ nouveauStatut: 'abandoned', allowExemption: false }).ok,
  '67. mais un ABANDON reste enregistrable : c’est un fait, pas une faveur');
ok(peutChangerStatut({ nouveauStatut: 'not_applicable', allowExemption: false }).ok,
  '68. et « non applicable » aussi : c’est une constatation');

// La règle qui protège la caisse.
const surPaye = peutChangerStatut({ nouveauStatut: 'exempted', verse: 15000 });
ok(!surPaye.ok && surPaye.raison === 'periode_payee',
  '69. EXEMPTER une période DÉJÀ PAYÉE est REFUSÉ — sinon la recette sort du dû sans contre-passation', surPaye);
const abPaye = peutChangerStatut({ nouveauStatut: 'abandoned', verse: 5000 });
ok(!abPaye.ok && abPaye.raison === 'periode_payee',
  '70. ABANDONNER une période partiellement payée est REFUSÉ pour la même raison', abPaye);
ok(peutChangerStatut({ nouveauStatut: 'due', verse: 15000 }).ok,
  '71. revenir à « dû » reste possible même payée — cela ne fait disparaître aucune dette');

// Et la contre-passation rouvre la décision : net ramené à zéro.
const apresAnnulation = [
  { id: 'v1', amount: 15000, fee_schedule_item_id: 'nov2' },
  { id: 'v2', amount: -15000, reversal_of: 'v1', fee_schedule_item_id: 'nov2' },
];
ok(peutChangerStatut({ nouveauStatut: 'exempted', verse: paidForSchedule('nov2', apresAnnulation) }).ok,
  '72. une fois le versement CONTRE-PASSÉ, l’exemption redevient recevable — l’ordre imposé est : annuler puis décider');

// ── Le relevé distingue les trois façons de sortir du dû ───────────────────
const releve = [
  { period_key: '2025-09', amount_due: 15000, status: 'due' },
  { period_key: '2025-10', amount_due: 15000, status: 'due' },
  { period_key: '2025-11', amount_due: 15000, status: 'exempted' },
  { period_key: '2025-12', amount_due: 15000, status: 'abandoned' },
  { period_key: '2026-01', amount_due: 15000, status: 'not_applicable' },
];
const v = ventilationEcheancier(releve, { '2025-09': 15000, '2025-10': 5000 });
ok(v.paye === 20000, '73. relevé : PAYÉ', v);
ok(v.du === 30000, '74. relevé : DÛ (les trois décisions en sont sorties)', v);
ok(v.solde === 10000, '75. relevé : SOLDE', v);
ok(v.exempte === 15000, '76. relevé : EXEMPTÉ, compté seul', v);
ok(v.abandonne === 15000, '77. relevé : ABANDONNÉ, distinct de l’exempté', v);
ok(v.nonApplicable === 15000, '78. relevé : NON APPLICABLE, distinct des deux autres', v);
ok(v.horsDu === 45000, '79. et leur total sort bien du dû', v);

// Non-régression : l’ancien contrat de totauxEcheancier est intact.
const anc = totauxEcheancier(releve, { '2025-09': 15000, '2025-10': 5000 });
ok(anc.du === v.du && anc.paye === v.paye && anc.solde === v.solde && anc.exempte === v.horsDu,
  '80. totauxEcheancier garde son contrat d’origine (exempte = tout ce qui sort du dû)', anc);

// De l'argent déjà encaissé sur une période ensuite abandonnée reste au PAYÉ :
// il est entré en caisse, le relevé ne peut pas faire comme s'il n'existait pas.
const vAband = ventilationEcheancier([{ period_key: '2025-12', amount_due: 15000, status: 'abandoned' }], { '2025-12': 7500 });
ok(vAband.paye === 7500 && vAband.du === 0,
  '81. un versement fait avant l’abandon reste compté au payé, et la période sort du dû', vAband);
// ── B6 : date d’entrée PAR SERVICE ──────────────────────────────────────────
// La date qui fait foi est celle de la souscription AU SERVICE, pas celle de
// l'inscription à l'école. Un élève scolarisé depuis septembre peut prendre la
// cantine en février : lui facturer septembre reviendrait à lui faire payer des
// repas qu’il n’a pas pris.

const CANTINE = { periodicity: 'mensuel', amount: 15000, academic_year: '2025-2026',
  billing_periods: ['2025-09', '2025-10', '2025-11', '2026-01', '2026-02'] };
const clesDe = (opts) => echeancierPour(CANTINE, { academicYear: '2025-2026', ...opts }).map((e) => e.period_key);

// TEST 1 — inscription au début de l’année : comportement actuel conservé.
ok(clesDe({ startedAt: '2025-09-01' }).join(',') === '2025-09,2025-10,2025-11,2026-01,2026-02',
  '82. TEST 1 — début en septembre : toutes les périodes facturées, comme avant', clesDe({ startedAt: '2025-09-01' }));
ok(clesDe({}).length === 5,
  '83. et sans aucune date connue, tout est facturé (comportement d’origine intact)', clesDe({}));

// TEST 2 — inscription en novembre : septembre et octobre ne sont PAS dus.
const nov = clesDe({ startedAt: '2025-11-15' });
ok(!nov.includes('2025-09') && !nov.includes('2025-10'),
  '84. TEST 2 — entrée en novembre : septembre et octobre ne sont pas facturés', nov);

// TEST 3 — entrée en cours de mois : LE MOIS D’ENTRÉE EST DÛ EN ENTIER.
// Règle assumée, pas un défaut : l’état de cantine de l’école facture 7 500 à un
// élève entré le 15/10 et 15 000 à un autre entré le 17/11. Le prorata y est une
// décision humaine, pas une règle ; le déduire amputerait la recette de chaque
// arrivant en cours de mois. L’école corrige le montant, ou marque la période.
ok(nov.includes('2025-11'), '85. TEST 3 — entrée le 15 novembre : novembre est dû', nov);
const e15 = echeancierPour(CANTINE, { academicYear: '2025-2026', startedAt: '2025-11-15' });
ok(e15.find((x) => x.period_key === '2025-11').amount_due === 15000,
  '86. TEST 3 — et il est dû EN ENTIER (aucun prorata implicite)', e15[0]);
ok(clesDe({ startedAt: '2025-11-01' }).join(',') === clesDe({ startedAt: '2025-11-28' }).join(','),
  '87. TEST 3 — le JOUR du mois ne change rien : seul le mois compte');

// TEST 4 — première période applicable.
ok(premierePeriodeApplicable(CANTINE, { academicYear: '2025-2026', startedAt: '2025-11-15' }) === '2025-11',
  '88. TEST 4 — la première période applicable est novembre');
ok(premierePeriodeApplicable(CANTINE, { academicYear: '2025-2026', startedAt: '2025-12-01' }) === '2026-01',
  '89. TEST 4 — décembre n’étant pas facturé, c’est janvier qui vient ensuite');
ok(premierePeriodeApplicable(CANTINE, { academicYear: '2025-2026', startedAt: '2026-09-01' }) === null,
  '90. TEST 4 — souscription après la dernière période : aucune période applicable, pas une erreur');

// TEST 5 + 9 (FIFO) — la répartition commence à la première période APPLICABLE.
const genere = echeancierPour(CANTINE, { academicYear: '2025-2026', startedAt: '2025-11-15' })
  .map((e, n) => ({ id: 'g' + n, ...e, amount_paid: 0, status: 'due' }));
const fifo = repartitionVersement(genere, 30000);
ok(fifo.affectations[0].period_key === '2025-11',
  '91. TEST 5 — le FIFO démarre à la première période applicable, pas à septembre', fifo.affectations.map((a) => a.period_key));
ok(fifo.affectations.map((a) => a.period_key).join(',') === '2025-11,2026-01',
  '92. TEST 5 — et poursuit dans l’ordre chronologique', fifo.affectations.map((a) => a.period_key));

// TEST 6 — les périodes d’avant l’inscription sont ABSENTES du dû.
// Elles ne sont pas « filtrées à l’affichage » : elles n’existent pas. Une ligne
// qui n’existe pas ne peut être ni payée, ni décidée, ni comptée.
const vB6 = ventilationEcheancier(genere, {});
ok(vB6.du === 45000, '93. TEST 6 — le dû ne porte que sur les 3 périodes applicables (nov, jan, fév)', vB6);
ok(genere.length === 3 && !genere.some((g) => g.period_key < '2025-11'),
  '94. TEST 6 — 3 échéances générées, et AUCUNE antérieure à l’entrée', genere.map((g) => g.period_key));

// TESTS 7-9 — les statuts de B5 gardent la priorité APRÈS filtrage par la date.
const apresDate = genere.map((g, n) => ({ ...g, status: n === 0 ? 'exempted' : 'due' }));
ok(soldeEcheance(apresDate[0]) === 0,
  '95. TEST 7 — une période EXEMPTÉE après la date d’entrée ne doit rien', soldeEcheance(apresDate[0]));
const repEx = repartitionVersement(apresDate, 30000);
ok(repEx.affectations.length === 2 && !repEx.affectations.some((a) => a.schedule_id === 'g0'),
  '96. TEST 7 — le versement saute la période exemptée et sert les deux suivantes', repEx.affectations.map((a) => a.period_key));
const aband = genere.map((g) => ({ ...g, status: 'abandoned' }));
ok(ventilationEcheancier(aband, {}).du === 0 && ventilationEcheancier(aband, {}).abandonne === 45000,
  '97. TEST 8 — ABANDONNÉ : sort du dû et se compte à part', ventilationEcheancier(aband, {}));
const nonApp = genere.map((g) => ({ ...g, status: 'not_applicable' }));
ok(ventilationEcheancier(nonApp, {}).du === 0 && ventilationEcheancier(nonApp, {}).nonApplicable === 45000,
  '98. TEST 9 — NON APPLICABLE : idem, et distinct de l’abandon', ventilationEcheancier(nonApp, {}));

// TEST 10 — paiement puis contre-passation sur une période postérieure à l’entrée.
const versB6 = [{ id: 'p1', amount: 15000, fee_schedule_item_id: 'g0' }];
ok(paidForSchedule('g0', versB6) === 15000, '99. TEST 10 — la période applicable reçoit son versement');
const annuleB6 = [...versB6, { id: 'p2', amount: -15000, reversal_of: 'p1', fee_schedule_item_id: 'g0' }];
ok(paidForSchedule('g0', annuleB6) === 0, '100. TEST 10 — la contre-passation la remet à zéro');
ok(soldeEcheance({ ...genere[0], amount_paid: paidForSchedule('g0', annuleB6) }) === 15000,
  '101. TEST 10 — et la période redevient entièrement due, sans réapparition de septembre');

// TEST 16 — le relevé ne compte que les périodes réellement applicables.
const relB6 = ventilationEcheancier(genere, { '2025-11': 15000 });
ok(relB6.du === 45000 && relB6.paye === 15000 && relB6.solde === 30000,
  '102. TEST 16 — relevé juste, bâti sur les seules périodes applicables', relB6);

// TEST 17 — deux services, deux dates, pour le MÊME élève.
const TRANSPORT = { periodicity: 'trimestriel', amount: 30000, academic_year: '2026-2027' };
const CANT27 = { periodicity: 'mensuel', amount: 15000, academic_year: '2026-2027',
  billing_periods: ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01'] };
const cles27 = echeancierPour(CANT27, { academicYear: '2026-2027', startedAt: '2026-09-01' }).map((e) => e.period_key);
const clesTr = echeancierPour(TRANSPORT, { academicYear: '2026-2027', startedAt: '2026-11-15' }).map((e) => e.period_key);
ok(cles27[0] === '2026-09' && cles27.length === 5,
  '103. TEST 17 — cantine souscrite le 01/09/2026 : toute l’année facturée', cles27);
ok(clesTr.join(',') === '2026-T1,2026-T2,2026-T3',
  '104. TEST 17 — transport souscrit le 15/11/2026 : le 1er trimestre, ENTAMÉ, reste dû', clesTr);
const clesTrFev = echeancierPour(TRANSPORT, { academicYear: '2026-2027', startedAt: '2027-02-01' }).map((e) => e.period_key);
ok(clesTrFev.join(',') === '2026-T2,2026-T3',
  '105. TEST 17 — souscrit en février, le 1er trimestre CLOS ne l’est pas', clesTrFev);
ok(JSON.stringify(cles27) !== JSON.stringify(clesTr),
  '106. TEST 17 — deux services du même élève produisent bien des périodes différentes');

// Le repli : la date du SERVICE prime, celle de l’école ne sert qu’à défaut.
ok(debutServiceEffectif({ startedAt: '2025-11-15', enrolledAt: '2025-09-01' }) === '2025-11-15',
  '107. la date du SERVICE prime sur celle de l’école');
ok(debutServiceEffectif({ startedAt: null, enrolledAt: '2025-09-01' }) === '2025-09-01',
  '108. sans date de service, repli sur l’inscription scolaire — les souscriptions d’avant B6 ne bougent pas');
ok(debutServiceEffectif({ startedAt: 'n’importe quoi', enrolledAt: '2025-09-01' }) === '2025-09-01',
  '109. une date illisible ne fait pas tomber le calcul, elle est ignorée');
ok(debutServiceEffectif({}) === null, '110. sans rien du tout, aucune restriction (tout est facturé)');
ok(clesDe({ startedAt: '2025-11-15', enrolledAt: '2025-09-01' }).length === 3,
  '111. RÈGLE 4 — un élève scolarisé en septembre qui prend la cantine en novembre ne doit pas septembre',
  clesDe({ startedAt: '2025-11-15', enrolledAt: '2025-09-01' }));
console.log(ko === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${ko}`);
process.exitCode = ko === 0 ? 0 : 1;
