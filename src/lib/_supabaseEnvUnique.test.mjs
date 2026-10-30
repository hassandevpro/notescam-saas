// LA CLÉ ANONYME N'EST ÉCRITE QU'UNE FOIS, ET AUCUN CLIENT NE PART SANS ELLE.
//
// POURQUOI CES CONTRÔLES EXISTENT (I29). `createClient()` est appelé au
// CHARGEMENT du module, et supabase-js lève `supabaseKey is required.` sur une
// clé vide. Quand quatre modules recopient la même valeur de repli, il suffit
// qu'une copie dérive vers `''` pour qu'ouvrir un écran — `/app/students` —
// fasse tomber l'application entière avant la moindre ligne de code métier.
// C'est exactement ce qui est arrivé.
//
// Ces contrôles sont STATIQUES : ils lisent le source. C'est voulu. Le défaut
// ne se voit qu'à l'exécution d'un écran précis, en édition cloud, sur un poste
// dont le `.env.local` est incomplet — trois conditions qu'aucune suite ne
// réunit par hasard. Un grep, lui, le voit toujours.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_UNIQUE = 'lib/supabaseEnv.js';

function fichiersSource(dossier = SRC, acc = []) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) fichiersSource(chemin, acc);
    else if (/\.(js|jsx|mjs)$/.test(nom) && !/\.test\.mjs$/.test(nom)) acc.push(chemin);
  }
  return acc;
}

const fichiers = fichiersSource().map((chemin) => ({
  nom: relative(SRC, chemin).replace(/\\/g, '/'),
  texte: readFileSync(chemin, 'utf8'),
}));

test('la clé anonyme n’est écrite QU’À UN SEUL endroit', () => {
  const porteurs = fichiers
    .filter((f) => f.texte.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'))
    .map((f) => f.nom);
  assert.deepEqual(porteurs, [SOURCE_UNIQUE],
    `la clé est recopiée hors de ${SOURCE_UNIQUE} : ${porteurs.join(', ')}\n`
    + 'Une copie qui dérive vers \'\' fait tomber l\'application au chargement (I29).');
});

test('aucun createClient() ne reçoit une clé vide', () => {
  // `createClient(url, '')` et `createClient(url, "")`, sur une ou plusieurs
  // lignes : c'est la forme exacte qui a cassé /app/students.
  const fautifs = fichiers
    .filter((f) => /createClient\([^)]*?,\s*(''|"")\s*[,)]/s.test(f.texte))
    .map((f) => f.nom);
  assert.deepEqual(fautifs, [],
    `clé vide passée à createClient() dans : ${fautifs.join(', ')}`);
});

test('les clients secondaires lisent la source unique', () => {
  // Tout module qui appelle createClient() doit prendre ses constantes dans
  // supabaseEnv.js — sauf l'adaptateur LAN, qui FOURNIT createClient.
  const appelants = fichiers.filter(
    (f) => /(^|[^.\w])createClient\(/.test(f.texte)
      && f.nom !== SOURCE_UNIQUE
      && f.nom !== 'lib/localClient.js',
  );
  assert.ok(appelants.length >= 4, `attendu au moins 4 appelants, vu ${appelants.length}`);
  for (const f of appelants) {
    assert.match(f.texte, /from '\.{1,2}\/(lib\/)?supabaseEnv'/,
      `${f.nom} appelle createClient() sans importer supabaseEnv.js`);
  }
});
