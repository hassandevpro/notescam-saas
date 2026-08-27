// Test du moteur de rétention d'un élève — supprimer ou archiver ?
//
// Le cas qui a motivé ces tests, rapporté en production le 27/08/2026 :
// « quand je supprime un élève je veux qu'il soit supprimé de la liste ».
// L'élève partait de l'écran et REVENAIT au rechargement suivant, indéfiniment.
//
// Mécanique du défaut : l'élève portait des écritures de caisse, le backend
// refusait donc le DELETE. Ce refus n'étant pas RECONNU comme un refus métier,
// il était traité comme une panne réseau et remis dans la file hors-ligne — où
// il était rejoué à chaque chargement, sans jamais pouvoir aboutir. L'élève
// restait présent côté serveur et remontait à chaque synchronisation.
//
// Les deux backends refusent, mais ne le disent PAS de la même façon : le LAN
// écrit une phrase, le cloud renvoie une violation de clé étrangère. Les deux
// doivent être compris — c'est ce que vérifient les cas C ci-dessous.
//
//   node src/lib/_studentRetention.test.mjs
import {
  paymentTrail, retentionDecision, RETENTION, isRetentionRefusal, cashDeletionWarning,
  isArchived, splitArchived,
} from './studentRetention.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── A. Le verdict : de l'argent est passé ⇒ on n'efface pas ──────────────────
const versements = [
  { id: 'p1', student_id: 'e1', amount: 50000, academic_year: '2025-2026' },
  { id: 'p2', student_id: 'e1', amount: -50000, academic_year: '2025-2026', reversal_of: 'p1' },
  { id: 'p3', student_id: 'e2', amount: 25000, academic_year: '2026-2027' },
];

const t1 = paymentTrail('e1', versements);
ok(t1.entries === 2, 'A1. deux écritures comptées pour e1', t1);
ok(t1.net === 0, 'A2. le solde de e1 est nul (versement contre-passé)', t1);
ok(t1.reversals === 1, 'A3. la contre-passation est comptée comme telle', t1);

ok(retentionDecision('e1', versements).action === RETENTION.ARCHIVE,
  'A4. solde NUL mais deux pièces comptables -> ARCHIVAGE, pas suppression');
ok(retentionDecision('e2', versements).action === RETENTION.ARCHIVE,
  'A5. un simple versement suffit à imposer l\'archivage');
ok(retentionDecision('e3', versements).action === RETENTION.DELETE,
  'A6. aucune écriture -> suppression classique');
ok(retentionDecision('e3', []).action === RETENTION.DELETE,
  'A7. aucun versement connu du tout -> suppression classique');

// ── B. Un élève archivé quitte les listes actives ───────────────────────────
const effectif = [
  { id: 'e1', name: 'BONGAMAN JOSE ROY', archived_at: '2026-08-27T10:00:00Z' },
  { id: 'e2', name: 'GUJONG ODILIA' },
];
const { active, archived } = splitArchived(effectif);
ok(active.length === 1 && active[0].id === 'e2',
  'B1. l\'élève archivé ne figure plus dans la liste active', active);
ok(archived.length === 1 && archived[0].id === 'e1',
  'B2. il est retrouvable dans la liste des archivés', archived);
ok(isArchived(effectif[0]) === true && isArchived(effectif[1]) === false,
  'B3. `archived_at` est la seule marque qui compte');

// ── C. Reconnaître le REFUS, dans les deux langages de backend ──────────────
// C'est ce test qui garde le symptôme rapporté : un refus non reconnu repart
// dans la file hors-ligne et fait revenir l'élève à chaque chargement.

// C1. Serveur LAN — server/query.js, guardStudentDeletion : une phrase humaine.
ok(isRetentionRefusal({
  message: 'Élève non supprimable : 2 écriture(s) de caisse y sont rattachées. Archivez-le (ses données sont conservées).',
}) === true, 'C1. refus du serveur LAN reconnu');

// C2. Cloud — fee_payments_student_id_fkey est en ON DELETE RESTRICT : PostgreSQL
//     ne dit ni « supprimable », ni « caisse », ni « archivez ». C'est le cas qui
//     manquait, et c'est celui de la production web.
ok(isRetentionRefusal({
  code: '23503',
  message: 'update or delete on table "students" violates foreign key constraint "fee_payments_student_id_fkey" on table "fee_payments"',
  details: 'Key (id)=(0f2c…) is still referenced from table "fee_payments".',
}) === true, 'C2. refus PostgreSQL (clé étrangère) reconnu');

// C3. Le message sans le code : certaines couches ne remontent que le texte.
ok(isRetentionRefusal({
  message: 'violates foreign key constraint "fee_payments_student_id_fkey" on table "fee_payments"',
}) === true, 'C3. reconnu même sans le code SQL');

// C4. Le code sans le texte de table : on n'a pas de quoi conclure, et se
//     tromper ici archiverait un élève au lieu de le supprimer.
ok(isRetentionRefusal({ code: '23503', message: 'violates foreign key constraint' }) === false,
  'C4. violation de clé étrangère SANS fee_payments -> pas un refus de rétention');

// C5. Une panne réseau n'est PAS un refus métier : elle doit repartir dans la
//     file hors-ligne, sinon on archive un élève pour une coupure de wifi.
ok(isRetentionRefusal({ message: 'Failed to fetch' }) === false,
  'C5. panne réseau -> pas un refus de rétention');
ok(isRetentionRefusal({ message: 'NetworkError when attempting to fetch resource.' }) === false,
  'C6. autre libellé réseau -> pas un refus de rétention');
ok(isRetentionRefusal(null) === false, 'C7. absence d\'erreur -> pas un refus');
ok(isRetentionRefusal({}) === false, 'C8. erreur vide -> pas un refus');

// C9. Une cascade sur les notes ne doit jamais déclencher l'archivage : seules
//     les écritures de caisse retiennent l'élève.
ok(isRetentionRefusal({
  code: '23503',
  message: 'violates foreign key constraint "grades_student_id_fkey" on table "grades"',
}) === false, 'C9. contrainte sur les notes -> pas un refus de rétention');

// ── D. Le message qui précède une suppression emportant de l'argent ─────────
// Depuis le 27/08/2026 la suppression est POSSIBLE (demande des écoles). Ce qui
// la rend acceptable, c'est que l'utilisateur voie ce qu'il détruit : sans le
// nombre ET le montant, « des versements » ne veut rien dire.
const money = (n) => new Intl.NumberFormat('fr-FR').format(n) + ' XAF';
const tfr = (fr) => fr;
const msg = cashDeletionWarning('NGONO Gabriella', { entries: 3, net: 150000 }, money, tfr);

ok(msg.includes('NGONO Gabriella'), 'D1. le message nomme l’élève');
ok(msg.includes('3'), 'D2. il donne le NOMBRE d’écritures');
ok(msg.includes('150') && msg.includes('XAF'), 'D3. il donne le MONTANT, dans la devise de l’école', msg);
ok(/archiv/i.test(msg), 'D4. il rappelle que l’archivage existe — sinon personne ne l’utilisera plus');
ok(/trac/i.test(msg), 'D5. il dit que les lignes restent tracées, pour ne pas promettre l’oubli total');

// Sans formateur de devise, on ne doit pas planter : le montant sort nu.
ok(cashDeletionWarning('X', { entries: 1, net: 5000 }, null, tfr).includes('5000'),
  'D6. sans devise, le montant reste affiché');

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
