// LE RELEVÉ D'UN ÉLÈVE RANGE-T-IL CHAQUE FRAIS DU BON CÔTÉ, ET COMPTE-T-IL JUSTE ?
//
// Fonctions pures : aucun DOM, aucune base. Lancer :
//   node src/lib/_feeStatement.test.mjs
//
// Ce que ce fichier protège :
//   • la répartition académique / services — un frais rangé du mauvais côté
//     donne un relevé que le parent ne reconnaît pas ;
//   • les totaux, qui sont ce que la famille lit en premier ;
//   • le fait qu'un trop-perçu sur un frais n'efface pas la dette d'un autre.
import { feeFamily, statementByFamily, ACADEMIC_CATEGORIES, SERVICE_CATEGORIES } from './feeCatalogEngine.js';

let ko = 0;
const ok = (c, libelle, obtenu) => {
  if (c) { console.log(`✅ ${libelle}`); }
  else { console.log(`❌ ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); ko++; }
};

// ── Répartition ─────────────────────────────────────────────────────────────
ok(feeFamily('scolarite') === 'academique', '1. la scolarité est un frais académique');
ok(feeFamily('inscription') === 'academique', '2. l’inscription aussi');
ok(feeFamily('cantine') === 'service', '3. la cantine est un service');
ok(feeFamily('transport') === 'service', '4. le transport aussi');
ok(feeFamily('tenue') === 'service', '5. les tenues aussi');
ok(feeFamily('autre') === 'academique',
  '6. « autre » reste côté académique — c’est le fourre-tout historique, le basculer déplacerait des frais déjà saisis');
ok(feeFamily('inconnue_future') === 'academique',
  '7. une catégorie inconnue retombe côté académique plutôt que de disparaître du relevé');

// Aucune catégorie ne doit appartenir aux deux familles : ce serait un frais
// compté deux fois dans le total.
const chevauchement = ACADEMIC_CATEGORIES.filter((c) => SERVICE_CATEGORIES.includes(c));
ok(chevauchement.length === 0, '8. aucune catégorie n’est dans les deux familles', chevauchement);

// ── Relevé ──────────────────────────────────────────────────────────────────
const items = [
  { id: 'a', name: 'Scolarité', category: 'scolarite', amount: 200000 },
  { id: 'b', name: 'Inscription', category: 'inscription', amount: 25000 },
  { id: 'c', name: 'Cantine', category: 'cantine', amount: 120000 },
  { id: 'd', name: 'Transport', category: 'transport', amount: 80000 },
  { id: 'e', name: 'Ancienne tenue', category: 'tenue', amount: 15000, status: 'removed' },
];
const paiements = { a: 150000, b: 25000, c: 40000, d: 0 };
const rel = statementByFamily(items, (i) => paiements[i.id] || 0);

ok(rel.academique.lignes.length === 2, '9. deux frais académiques', rel.academique.lignes.map((l) => l.name));
ok(rel.service.lignes.length === 2, '10. deux services (la tenue RETIRÉE est exclue)', rel.service.lignes.map((l) => l.name));

ok(rel.academique.due === 225000, '11. total dû académique', rel.academique.due);
ok(rel.academique.paid === 175000, '12. total payé académique', rel.academique.paid);
ok(rel.academique.balance === 50000, '13. solde académique', rel.academique.balance);

ok(rel.service.due === 200000, '14. total dû services', rel.service.due);
ok(rel.service.balance === 160000, '15. solde services', rel.service.balance);

ok(rel.total.due === 425000, '16. TOTAL DÛ = académique + services', rel.total.due);
ok(rel.total.paid === 215000, '17. TOTAL PAYÉ', rel.total.paid);
ok(rel.total.balance === 210000, '18. SOLDE', rel.total.balance);

// ── Un trop-perçu ne se propage pas ─────────────────────────────────────────
// Si un frais est payé au-delà du dû, l'excédent ne doit pas venir effacer la
// dette d'un autre frais : chaque ligne se solde pour elle-même.
const trop = statementByFamily(
  [{ id: 'x', name: 'Cantine', category: 'cantine', amount: 10000 },
   { id: 'y', name: 'Transport', category: 'transport', amount: 10000 }],
  (i) => (i.id === 'x' ? 25000 : 0),
);
ok(trop.service.balance === 10000,
  '19. un trop-perçu sur la cantine n’efface pas la dette du transport', trop.service.balance);

// ── Élève sans aucun frais ──────────────────────────────────────────────────
const vide = statementByFamily([], () => 0);
ok(vide.total.due === 0 && vide.total.balance === 0 && vide.academique.lignes.length === 0,
  '20. un élève sans frais donne un relevé à zéro, pas une erreur', vide.total);

// ── B4 : le dû d'un frais PÉRIODIQUE vient de son échéancier ────────────────
// Sans injection, `amount` fait foi — et `amount` est le prix d'UNE période. Une
// cantine à 15 000/mois payée trois mois afficherait « dû 15 000, payé 45 000 » :
// un relevé impossible à présenter à un parent.
const periodiques = [
  { id: 'c1', name: 'Cantine', category: 'cantine', amount: 15000, status: 'active' },
  { id: 'i1', name: 'Inscription', category: 'inscription', amount: 50000, status: 'active' },
];
const payeDe = (i) => (i.id === 'c1' ? 45000 : 50000);
const duDe = (i) => (i.id === 'c1' ? 120000 : 50000);   // 8 mois facturés

const sansInjection = statementByFamily(periodiques, payeDe);
ok(sansInjection.service.due === 15000,
  '21. sans injection, le dû reste `amount` — comportement inchangé des frais à versement unique', sansInjection.service.due);

const avecInjection = statementByFamily(periodiques, payeDe, duDe);
ok(avecInjection.service.due === 120000,
  '22. avec l’échéancier injecté, la cantine doit l’année, pas un mois', avecInjection.service.due);
ok(avecInjection.service.balance === 75000,
  '23. et son solde est celui que la famille doit vraiment', avecInjection.service.balance);
ok(avecInjection.academique.due === 50000,
  '24. un frais non périodique n’est pas affecté par l’injection', avecInjection.academique.due);
ok(avecInjection.total.due === 170000 && avecInjection.total.balance === 75000,
  '25. les totaux suivent', avecInjection.total);

// Une période exemptée sort du dû : c'est l'appelant qui l'a retirée (moteur
// d'échéancier), et le relevé doit le refléter sans le recalculer lui-même.
const exempte = statementByFamily(periodiques, payeDe, (i) => (i.id === 'c1' ? 105000 : 50000));
ok(exempte.service.balance === 60000,
  '26. un mois exempté allège le solde de la famille, il ne le gonfle pas', exempte.service.balance);

console.log(ko === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${ko}`);
process.exitCode = ko === 0 ? 0 : 1;
