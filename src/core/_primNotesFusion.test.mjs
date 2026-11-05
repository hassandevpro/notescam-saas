// « J'AJOUTE LES NOTES ICI, ÇA NE PERSISTE PAS » — le banc de la cause, 2026-11-05.
//
// Deux mécanismes distincts faisaient disparaître une note du primaire :
//   1. le chargement REMPLAÇAIT la carte par ce que le serveur rendait, effaçant de
//      l'écran toute note pas encore acceptée (refus de contrainte, migration Cloud
//      manquante, coupure) — sans un mot ;
//   2. régler un barème réécrivait TOUTE la colonne depuis l'état en mémoire, posant
//      `note: null` sur chaque élève que cet état ne connaissait pas.
//
// Ce banc tient le premier. Le second est tenu dans _primBaremeEcriture.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fusionnerNotesServeur, recordsAEcrireEnCache, nkeysEnAttente,
  ligneDeRejeu, lotRejouableEnBloc,
  majAttenteNkeys,
} from './primNotesFusion.js';

const ligne = (nkey, note) => ({ nkey, note, eleve_id: nkey.split('|')[0] });

test('REPRODUCTION : la note en attente n’est plus effacée par ce que le serveur rend', () => {
  const serveur = { 'e1|1a|oral|1': ligne('e1|1a|oral|1', 7) };          // le serveur ignore e2
  const local = {
    'e1|1a|oral|1': ligne('e1|1a|oral|1', 7),
    'e2|1a|oral|1': ligne('e2|1a|oral|1', 9),                             // tapée, refusée, en file
  };
  const avant = { ...serveur };                                           // l'ancien comportement
  assert.equal(avant['e2|1a|oral|1'], undefined, 'avant : la note de e2 disparaissait');

  const apres = fusionnerNotesServeur(serveur, local, ['e2|1a|oral|1']);
  assert.equal(apres['e2|1a|oral|1']?.note, 9, 'après : elle reste à l’écran');
  assert.equal(apres['e1|1a|oral|1']?.note, 7, 'et le serveur reste la référence pour le reste');
});

test('le serveur gagne sur ce qui N’EST PAS en attente : la saisie d’une collègue arrive', () => {
  const serveur = { k: ligne('k', 15) };                                  // corrigée par la collègue
  const local = { k: ligne('k', 12) };                                    // notre vieille valeur
  assert.equal(fusionnerNotesServeur(serveur, local, []).k.note, 15);
  assert.equal(fusionnerNotesServeur(serveur, local, ['autre']).k.note, 15);
});

test('une note en attente ABSENTE de la mémoire ne fabrique rien', () => {
  const out = fusionnerNotesServeur({ a: ligne('a', 1) }, {}, ['fantome']);
  assert.deepEqual(Object.keys(out), ['a']);
  assert.equal('fantome' in out, false);
});

test('entrées absentes : jamais d’exception', () => {
  assert.deepEqual(fusionnerNotesServeur(null, null, null), {});
  assert.deepEqual(fusionnerNotesServeur(undefined, undefined, undefined), {});
  assert.deepEqual(fusionnerNotesServeur({}, {}, new Set()), {});
});

test('la carte rendue n’est jamais une des entrées (pas de mutation à distance)', () => {
  const serveur = { a: ligne('a', 1) };
  const out = fusionnerNotesServeur(serveur, {}, []);
  out.b = ligne('b', 2);
  assert.equal('b' in serveur, false);
});

test('LE CACHE LOCAL non plus ne doit pas écraser la note en attente', () => {
  // Le cache est ce qui reste au redémarrage hors ligne : y recopier la version du
  // serveur ferait perdre la saisie POUR DE BON, bien après que l'écran l'a montrée.
  const records = [ligne('a', 1), ligne('b', null), ligne('c', 3)];
  const gardes = recordsAEcrireEnCache(records, ['b']);
  assert.deepEqual(gardes.map((r) => r.nkey), ['a', 'c']);
  assert.equal(recordsAEcrireEnCache(records, []).length, 3, 'sans attente, tout est caché');
  assert.deepEqual(recordsAEcrireEnCache(null, ['b']), []);
});

test('les nkey en attente se lisent dans la file, sans doublon et dans l’ordre', () => {
  const file = [
    { table: 'grades', nkey: 'pas-une-note' },
    { table: 'prim_notes', nkey: 'b' },
    { table: 'prim_notes', payload: { nkey: 'a' } },          // ancienne forme : nkey dans la charge
    { table: 'prim_notes', nkey: 'b' },                       // rejouée : une seule fois
    { table: 'prim_notes' },                                  // sans clé : ignorée
    null,
  ];
  assert.deepEqual(nkeysEnAttente(file), ['b', 'a']);
  assert.deepEqual(nkeysEnAttente(null), []);
});

test('la liste d’attente se pose et se retire sans doublon', () => {
  assert.deepEqual(majAttenteNkeys([], 'a', true), ['a']);
  assert.deepEqual(majAttenteNkeys(['a'], 'a', true), ['a'], 'deux échecs de suite = une entrée');
  assert.deepEqual(majAttenteNkeys(['a', 'b'], 'a', false), ['b'], 'l’envoi réussi la retire');
  assert.deepEqual(majAttenteNkeys(null, 'a', false), []);
});

test('BOUT EN BOUT : tapée, refusée, rechargée, puis acceptée', () => {
  const nkey = 'e2|1a|oral|1';
  let attente = [];
  let ecran = { 'e1|1a|oral|1': ligne('e1|1a|oral|1', 7) };

  // 1. L'enseignante tape 9. L'écran la montre.
  ecran = { ...ecran, [nkey]: ligne(nkey, 9) };
  // 2. Le serveur refuse. La note entre dans la file, et l'écran le dit.
  attente = majAttenteNkeys(attente, nkey, true);
  assert.equal(attente.length, 1, 'l’écran a de quoi afficher « 1 note pas encore enregistrée »');
  // 3. Rechargement : le serveur ne connaît toujours que e1.
  const duServeur = { 'e1|1a|oral|1': ligne('e1|1a|oral|1', 7) };
  ecran = fusionnerNotesServeur(duServeur, ecran, attente);
  assert.equal(ecran[nkey]?.note, 9, 'LA NOTE EST TOUJOURS LÀ — c’est tout le défaut signalé');
  // 4. Le renvoi aboutit. Le serveur la connaît, l’attente se vide, le rouge s’éteint.
  attente = majAttenteNkeys(attente, nkey, false);
  ecran = fusionnerNotesServeur({ ...duServeur, [nkey]: ligne(nkey, 9) }, ecran, attente);
  assert.equal(attente.length, 0);
  assert.equal(ecran[nkey]?.note, 9);
});

// ── LE TROISIÈME MÉCANISME, relevé le 2026-11-05 sur les captures de l'école ───────
//
// Deux captures à une minute d'intervalle, avant et après actualisation : sur six
// cellules, DEUX se vident. Ni un refus global (tout serait vide), ni un réseau coupé
// (rien ne serait parti). La cause est au rejeu de la file : régler un barème y met une
// opération qui NE PARLE PAS de la note — `sansNote: true` — mais dont la charge porte
// `note: null`, parce qu'un record de note est toujours complet. Le chemin direct retire
// la colonne ; le rejeu ne lisait pas le drapeau et renvoyait tout. `SET note = NULL`
// par-dessus la saisie d'une collègue, sans erreur — donc l'opération quittait la file.
//
// L'effet sur le vrai moteur SQL est prouvé dans server/_rejeu_file_bareme.test.mjs.

test('REPRODUCTION : la ligne rejouée d’un barème ne porte plus la colonne `note`', () => {
  const charge = { nkey: 'e1|1a|oral|1', id: 'n1', eleve_id: 'e1', note: null, points_max: 20 };
  const row = ligneDeRejeu({ sansNote: true, payload: charge });
  assert.ok(!('note' in row), 'la colonne `note` doit être absente, pas à null');
  assert.ok(!('nkey' in row), '`nkey` est local : il n’existe pas en base');
  assert.equal(row.points_max, 20, 'le barème, lui, doit bien partir');
});

test('une vraie saisie rejouée garde sa note, y compris un zéro', () => {
  const row = ligneDeRejeu({ sansNote: false, payload: { nkey: 'k', note: 0, points_max: 10 } });
  assert.equal(row.note, 0, 'zéro est une note, pas une absence');
  assert.ok('note' in row);
});

test('une opération sans drapeau se comporte comme avant (rien ne change pour les autres)', () => {
  const row = ligneDeRejeu({ payload: { nkey: 'k', note: 12 } });
  assert.equal(row.note, 12);
});

test('un lot ne mêle JAMAIS les deux sortes d’écriture', () => {
  // Un upsert groupé n'a qu'un jeu de colonnes pour toutes ses lignes : `note` serait
  // imposée à celles qui doivent l'omettre, ou retirée à celles qui doivent l'écrire.
  assert.equal(lotRejouableEnBloc([{ sansNote: false }, { sansNote: false }]), true);
  assert.equal(lotRejouableEnBloc([{ sansNote: false }, { sansNote: true }]), false);
  assert.equal(lotRejouableEnBloc([{ sansNote: true }]), false);
  assert.equal(lotRejouableEnBloc([]), true, 'un lot vide ne pose aucun problème');
});

test('LE REJEU EST BIEN BRANCHÉ DESSUS — les deux chemins, pas seulement l’unitaire', async () => {
  // Le défaut tenait à ce que `sansNote` n'apparaissait pas UNE SEULE FOIS dans
  // tout lib/sync.js. Un correctif qui ne brancherait qu'un des deux chemins
  // laisserait l'autre effacer des notes.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../lib/sync.js', import.meta.url), 'utf8');
  assert.ok(src.includes('ligneDeRejeu(item)'), 'le rejeu unitaire doit passer par le cœur pur');
  assert.ok(src.includes('ligneDeRejeu(op || { payload: p })'), 'le rejeu groupé aussi');
  assert.ok(src.includes('spec.rows(it.payload, it)'), 'le lot doit recevoir l’opération, pas seulement sa charge');
  assert.ok(src.includes('if (spec.groupable && !spec.groupable(items)) return false;'),
    'un lot mêlé doit repasser élément par élément');
});
