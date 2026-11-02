// Banc de `colonneAbsente.js`. Ce qui est éprouvé ici garde de l'ARGENT :
// l'incident du 2026-10-31 a fait rejeter des versements entiers parce qu'une
// colonne accessoire manquait au Cloud.
import {
  CODE_COLONNE_ABSENTE, COLONNES_ABANDONNABLES,
  colonneManquante, estAbandonnable, sansColonnes, decisionEcriture,
} from './colonneAbsente.js';

let ko = 0;
const ok = (c, libelle, obtenu) => {
  if (c) { console.log(`✅ ${libelle}`); }
  else { console.log(`❌ ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); ko++; }
};

console.log('— 1. Lire le nom de la colonne dans l’erreur —');
// Le message EXACT reçu en production.
const reel = {
  code: CODE_COLONNE_ABSENTE,
  message: "Could not find the 'method' column of 'fee_payments' in the schema cache",
};
ok(colonneManquante(reel) === 'method',
  'le message réel du 2026-10-31 est lu', colonneManquante(reel));
ok(colonneManquante({ code: CODE_COLONNE_ABSENTE, message: "Could not find the 'payer_name' column of 'fee_payments' in the schema cache" }) === 'payer_name',
  'payer_name aussi');
ok(colonneManquante({ message: 'column "reference" of relation "fee_payments" does not exist' }) === 'reference',
  'l’ancienne formulation Postgres est lue aussi');
ok(colonneManquante(null) === null && colonneManquante(undefined) === null,
  'pas d’erreur -> null, sans lever');
ok(colonneManquante({ message: 'network timeout' }) === null,
  'une panne réseau n’est pas une colonne absente');
ok(colonneManquante({ code: '23505', message: 'duplicate key value violates unique constraint' }) === null,
  'un doublon de clé n’est pas une colonne absente');
// Un code inattendu SANS indice textuel ne doit pas être interprété.
ok(colonneManquante({ code: '42501', message: "new row violates row-level security policy" }) === null,
  'un refus RLS n’est pas une colonne absente — on ne retire rien dans ce cas');

console.log('\n— 2. La liste blanche —');
ok(estAbandonnable('fee_payments', 'method'), 'method est accessoire');
ok(estAbandonnable('fee_payments', 'payer_name') && estAbandonnable('fee_payments', 'reference'),
  'payer_name et reference aussi');
// LE POINT QUI COMPTE : jamais une colonne qui porte le sens de l'écriture.
ok(!estAbandonnable('fee_payments', 'amount'),
  'amount n’est JAMAIS abandonnable : une ligne sans montant serait un versement fantôme');
ok(!estAbandonnable('fee_payments', 'student_id'), 'student_id non plus');
ok(!estAbandonnable('fee_payments', 'fee_schedule_item_id'),
  'fee_schedule_item_id non plus : sans lui, le mois payé est perdu');
ok(!estAbandonnable('students', 'method'), 'la liste est par TABLE, pas globale');
ok(!estAbandonnable(null, 'method') && !estAbandonnable('fee_payments', null), 'arguments absents -> non');
ok(COLONNES_ABANDONNABLES.fee_payments.length === 3,
  'trois colonnes seulement, et il faut un test pour en ajouter une quatrième');

console.log('\n— 3. Retirer sans abîmer l’original —');
const ligne = { id: 'p1', amount: 15000, method: 'especes', payer_name: 'Papa', reference: 'MM42' };
const nue = sansColonnes(ligne, ['method', 'payer_name', 'reference']);
ok(nue.amount === 15000 && nue.id === 'p1', 'ce qui compte reste');
ok(!('method' in nue) && !('payer_name' in nue) && !('reference' in nue), 'les accessoires sont partis');
ok(ligne.method === 'especes',
  'l’ORIGINAL est intact : la base locale, elle, connaît les colonnes', ligne.method);
ok(Object.keys(sansColonnes(null, ['x'])).length === 0, 'null -> objet vide, sans lever');
ok(sansColonnes(ligne, []).method === 'especes', 'aucune colonne à retirer -> copie fidèle');

console.log('\n— 4. La décision —');
const d1 = decisionEcriture({ table: 'fee_payments', error: reel });
ok(d1.action === 'reessayer' && d1.colonne === 'method', 'method absente -> réessayer sans elle');
ok(d1.abandons.join(',') === 'method', 'et on retient ce qu’on a abandonné', d1.abandons);

const d2 = decisionEcriture({
  table: 'fee_payments',
  error: { code: CODE_COLONNE_ABSENTE, message: "Could not find the 'payer_name' column of 'fee_payments' in the schema cache" },
  dejaAbandonnees: ['method'],
});
ok(d2.action === 'reessayer' && d2.abandons.join(',') === 'method,payer_name',
  'les abandons s’accumulent : trois colonnes manquantes = trois essais, pas un échec',
  d2.abandons);

// LA BOUCLE : la même colonne qui revient après avoir été retirée veut dire que
// le serveur parle d'autre chose. On s'arrête plutôt que de réessayer sans fin.
const d3 = decisionEcriture({ table: 'fee_payments', error: reel, dejaAbandonnees: ['method'] });
ok(d3.action === 'echouer', 'une colonne déjà retirée qui revient -> on s’arrête, pas de boucle');

const d4 = decisionEcriture({
  table: 'fee_payments',
  error: { code: CODE_COLONNE_ABSENTE, message: "Could not find the 'amount' column of 'fee_payments' in the schema cache" },
});
ok(d4.action === 'echouer' && d4.colonne === 'amount',
  'amount absente -> on ÉCHOUE : mieux vaut une erreur visible qu’un versement sans montant');

ok(decisionEcriture({ table: 'fee_payments', error: { message: 'timeout' } }).action === 'echouer',
  'une autre erreur n’est pas traitée ici');
ok(decisionEcriture({ table: 'fee_payments', error: null }).colonne === null, 'pas d’erreur -> rien à décider');

console.log(ko === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${ko}`);
process.exitCode = ko === 0 ? 0 : 1;
