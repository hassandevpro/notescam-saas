// Test des builders de reçu (A5 + ticket 80 mm). Fonctions PURES : aucun DOM,
// aucun store, aucun réseau. Lancer : node src/lib/_receiptDoc.test.mjs
//
// Ce que ce test protège, et pourquoi :
//   • un reçu doit ressortir À L'IDENTIQUE des années plus tard (n° stable) ;
//   • le reçu porte le caissier d'ORIGINE, jamais celui qui réimprime ;
//   • une réimpression est marquée DUPLICATA (sinon elle vaut second paiement).
import { receiptNumberFor, buildReceiptHtml, buildTicketHtml } from './receiptDoc.js';

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

const school  = { name: 'Collège La Réussite', current_year: '2025-2026', currency: 'XAF', phone: '699 00 00 00' };
const student = { name: 'NGONO Marie', matricule: 'STU0421' };

const payment = {
  id: 'a1b2c3d4-0000-4000-8000-00000000f7c9',
  date: '2026-01-14',
  created_at: '2026-01-14T09:12:33.000Z',
  amount: 75000,
  note: 'Cantine',
  recorded_by_name: 'ATANGANA Paul',
};

const base = {
  school, student, className: '3e A',
  versement: 75000, newTotal: 175000, fraisAnnuels: 400000,
  date: payment.date, mode: 'echelonne',
  cashierName: payment.recorded_by_name, designation: 'Cantine',
  payment,
};

// ── N° de reçu : STABLE dans le temps ────────────────────────────────────────
const n1 = receiptNumberFor(payment, student.matricule);
const n2 = receiptNumberFor(payment, student.matricule);
ok(n1 === n2, `même versement → même n° (${n1})`);
ok(n1 === '20260114-STU042-F7C9', 'n° = AAAAMMJJ-MATRICULE(6)-4 derniers de l\'id');

// Le n° ne doit dépendre NI de l'heure d'impression, NI du cumul, NI du montant.
const laterPrint = receiptNumberFor({ ...payment }, student.matricule);
ok(laterPrint === n1, 'n° indépendant du moment de l\'impression');

// Deux versements du MÊME élève le MÊME jour restent distinguables.
const sameDay = receiptNumberFor({ ...payment, id: 'zzzzzzzz-0000-4000-8000-000000001234' }, student.matricule);
ok(sameDay !== n1, 'deux versements le même jour → deux n° différents');

// Élève sans matricule : le n° reste émis (jamais de reçu sans numéro).
ok(/^20260114-STU-/.test(receiptNumberFor(payment, null)), 'sans matricule → repli « STU », n° tout de même émis');

// ── N° SÉQUENTIEL serveur : c'est lui qui rend un reçu manquant visible ──────
const seq = { ...payment, receipt_no: 47, academic_year: '2025-2026' };
ok(receiptNumberFor(seq, student.matricule) === '2025-00047', 'n° séquentiel serveur prioritaire sur le dérivé d\'uuid');
ok(receiptNumberFor({ ...seq, receipt_no: 3 }, student.matricule) === '2025-00003', 'numéro zéro-paddé (série lisible, trous repérables)');
ok(buildTicketHtml({ ...base, payment: seq }).includes('2025-00047'), 'le ticket imprime le n° séquentiel');

// ── Ticket 80 mm ─────────────────────────────────────────────────────────────
const ticket = buildTicketHtml(base);
ok(ticket.includes('80mm auto'), 'ticket : page rouleau 80 mm, hauteur libre');
ok(ticket.includes('COLLÈGE LA RÉUSSITE') || ticket.includes('Collège La Réussite'), 'ticket : nom de l\'établissement');
ok(ticket.includes(n1), 'ticket : porte le n° de reçu stable');
ok(ticket.includes('ATANGANA Paul'), 'ticket : porte le caissier');
ok(ticket.includes('NGONO Marie'), 'ticket : porte l\'élève');
ok(ticket.includes('Cantine'), 'ticket : porte la désignation du frais payé');
ok(!ticket.includes('DUPLICATA'), 'ticket original : pas de mention duplicata');

// ── Duplicata : la réimpression ne doit pas pouvoir passer pour un 2e paiement ─
const dup = buildTicketHtml({ ...base, duplicate: true, reprintBy: 'MBALLA Rose' });
ok(dup.includes('DUPLICATA'), 'réimpression : marquée DUPLICATA');
ok(dup.includes('MBALLA Rose'), 'réimpression : mentionne qui réimprime');
ok(dup.includes('ATANGANA Paul'), 'réimpression : le CAISSIER reste celui d\'origine');
ok(dup.includes(n1), 'réimpression : même n° que l\'original');

// ── Reçu A5 : mêmes garanties ────────────────────────────────────────────────
const a5 = buildReceiptHtml(base);
ok(a5.includes(n1), 'A5 : même n° stable que le ticket');
ok(a5.includes('ATANGANA Paul'), 'A5 : caissier d\'origine');
// On teste le BANDEAU rendu (`class="dup"`), pas le mot « Duplicata » : celui-ci
// apparaît aussi dans le commentaire CSS, donc il ne prouverait rien.
ok(!a5.includes('class="dup"'), 'A5 original : pas de bandeau duplicata');
const a5dup = buildReceiptHtml({ ...base, duplicate: true, reprintBy: 'MBALLA Rose' });
ok(a5dup.includes('class="dup"'), 'A5 réimprimé : bandeau duplicata rendu');
ok(a5dup.includes('MBALLA Rose'), 'A5 réimprimé : mentionne qui réimprime');

// ── Caissier inconnu (versements antérieurs à la traçabilité) ────────────────
// On affiche « — », jamais l'utilisateur courant : mieux vaut vide que faux.
const legacy = buildTicketHtml({ ...base, cashierName: null, reprintBy: 'MBALLA Rose', duplicate: true });
ok(legacy.includes('—'), 'caissier inconnu → « — »');
ok(!/Caissier<\/span><span class="v">MBALLA/.test(legacy), 'caissier inconnu : le réimprimeur n\'usurpe pas la place du caissier');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ Tous les tests passent');
process.exit(failed ? 1 : 0);
