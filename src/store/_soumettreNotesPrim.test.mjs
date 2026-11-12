// LE BOUTON « SOUMETTRE » DIT-IL LA VÉRITÉ ? — garde-fou de CODE.
//
// Demandé par l'école le 2026-11-05 : « mets un bouton soumettre après avoir saisi les
// notes et teste si ça persiste dans la base ». La saisie s'enregistrait déjà au fil de la
// frappe, mais rien ne RÉPONDAIT : une enseignante n'avait aucun geste pour savoir si ses
// notes étaient arrivées, et le refus du serveur n'allait qu'à la console.
//
// Le comportement est vérifié sur l'écran réel (édition LAN, Chromium, refus 42703 simulé).
// Ce banc garde ce qu'un écran ne peut pas dire tout seul : que le motif du serveur est bien
// REMONTÉ jusqu'à l'affichage, que l'ORDRE des déclarations ne laisse pas l'écran blanc, et
// que l'ancienne signature d'`upsertPrimNote` n'a pas changé sous ses autres appelants.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const store = lire('./schoolStore.js');
const svc = lire('../lib/primService.js');
const ecran = lire('../components/grades/PrimCompetenceWorkspace.jsx');

test('le service REND le motif du refus au lieu de le jeter dans la console', () => {
  assert.match(svc, /export async function upsertPrimNoteDetaille/);
  assert.match(svc, /return \{ ok: false, erreur:/);
  // Le code PostgreSQL est conservé : c'est lui qui nomme la migration manquante.
  assert.ok(svc.includes('const code = error.code ? `${error.code} ` : \'\';'),
    'le code du serveur (42P10, 42703) doit figurer dans le motif');
});

test('l’ANCIENNE signature reste intacte pour ses autres appelants', () => {
  // `sendOrQueue` et la file de rejeu attendent un booléen. Changer ce contrat sous eux
  // ferait croire à un succès sur chaque refus — l'inverse exact du but.
  assert.match(svc, /export async function upsertPrimNote\(record, opts\) \{/);
  assert.ok(svc.includes('return (await upsertPrimNoteDetaille(record, opts)).ok;'));
});

test('l’action du magasin compte, et rapporte le PREMIER motif', () => {
  assert.match(store, /soumettrePrimNotes: async \(nkeys\) => \{/);
  assert.match(store, /return \{ total: aEnvoyer\.length, envoyees, refusees, premierRefus \};/);
  assert.match(store, /if \(!premierRefus\) premierRefus = erreur;/);
  // Hors ligne, on ne prétend pas avoir envoyé.
  assert.match(store, /if \(!backendOnline\(\)\) return \{ error: 'offline' \};/);
  // Et la liste d'attente suit chaque note, une par une.
  assert.match(store, /attente = majAttenteNkeys\(attente, record\.nkey, !ok\);/);
});

test('la FRAPPE aussi retient le motif, sans attendre qu’on clique', () => {
  assert.match(store, /if \(!r\.ok && r\.erreur\) set\(\{ primNotesRefus: r\.erreur \}\);/);
  assert.match(store, /primNotesRefus: null,/);
});

test('l’écran ne soumet QUE les notes qu’il affiche', () => {
  // Renvoyer les 2 000 notes de l'école pour un geste que l'enseignante croit local
  // ferait attendre une minute, et elle recliquerait.
  assert.match(ecran, /const nkeysDeLEcran = useMemo\(\(\) => \{/);
  assert.ok(ecran.includes('const r = await soumettrePrimNotes(vueGrille ? nkeysGrille : nkeysDeLEcran);'));
  assert.match(ecran, /\}, \[classStudents, referentiel, competenceId, ua, primNotes\]\);/);
});

test('l’écran AFFICHE le motif exact, et ne se contente pas d’un échec', () => {
  assert.ok(ecran.includes('Motif exact : ${r.premierRefus'), 'la version française');
  assert.ok(ecran.includes('Exact reason: ${r.premierRefus'), 'la version anglaise');
  assert.match(ecran, /\{t\('Motif du serveur : ', 'Server reason: '\)\}\{primNotesRefus\}/);
  assert.match(ecran, /role="status"/);
  // Et il rassure : la note n'est pas perdue.
  assert.ok(ecran.includes('Elles sont gardées ici'));
});

test('le bouton existe, se désactive, et dit combien il va soumettre', () => {
  assert.match(ecran, /onClick=\{soumettre\}/);
  assert.match(ecran, /disabled=\{envoi \|\| !nkeysDeLEcran\.length\}/);
  assert.ok(ecran.includes('`Soumettre les notes (${nkeysDeLEcran.length})`'));
  // Et il ne ment pas sur ce qu'il fait : la note est déjà gardée avant le clic.
  assert.ok(ecran.includes('Les notes sont gardées à la frappe'));
});

test('l’ORDRE des déclarations : le bloc de soumission suit `classStudents`', () => {
  // Le tableau de dépendances d'un useMemo est évalué à sa ligne. Placé au-dessus de
  // `classStudents`, il lève « Cannot access before initialization » et la page reste
  // BLANCHE — relevé deux fois le 2026-11-05, invisible au build comme aux bancs de texte.
  const iEleves = ecran.indexOf('const classStudents = useMemo');
  const iNkeys = ecran.indexOf('const nkeysDeLEcran = useMemo');
  const iGeste = ecran.indexOf('const soumettre = async');
  assert.ok(iEleves > 0, 'classStudents doit exister');
  assert.ok(iNkeys > iEleves, `nkeysDeLEcran (${iNkeys}) doit suivre classStudents (${iEleves})`);
  assert.ok(iGeste > iNkeys, `soumettre (${iGeste}) doit suivre nkeysDeLEcran (${iNkeys})`);
});
