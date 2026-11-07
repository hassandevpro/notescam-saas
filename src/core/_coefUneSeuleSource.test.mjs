// GARDE-FOU : le coefficient d'une matière APC a UNE source côté école.
//   node src/core/_coefUneSeuleSource.test.mjs
//
// Le défaut : « Modifier la classe » écrit subjects.coef (SVTEEHB = 3), mais la saisie, le
// bulletin, le PV et le rapport de classe lisaient le coefficient national (2, ou 1 si la matière
// n'est pas rattachée au niveau) — la même matière portait trois coefficients selon l'écran.
//
// Ce balayage refuse tout nouvel appelant du moteur APC qui lirait la table nationale sans passer
// par `apcClasseMatieresEcole`. Pour en ajouter un légitime, l'inscrire dans EXCEPTIONS AVEC SA RAISON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const CONSOMMATEURS = /\b(coefFor|assemblePeriod|assembleApcAnnual)\(/;

// Fichiers qui DÉFINISSENT ces fonctions ou ne font que les relayer : le choix de la table se fait chez l'appelant.
const EXCEPTIONS = {
  'core/apcEngine.js': 'définit coefFor et reçoit la table en paramètre',
  'lib/apcBulletinDoc.js': 'définit assemblePeriod / assembleApcAnnual ; lit la table du référentiel reçu',
};

function sources(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'packaging') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(js|jsx|mjs)$/.test(n) && !/\.test\.mjs$|\.hooks\.mjs$/.test(n)) out.push(p);
  }
  return out;
}

test('tout appelant du moteur APC passe par apcClasseMatieresEcole', () => {
  const fautifs = [];
  for (const f of sources(SRC)) {
    const rel = relative(SRC, f).replace(/\\/g, '/');
    if (EXCEPTIONS[rel]) continue;
    const txt = readFileSync(f, 'utf8');
    if (!CONSOMMATEURS.test(txt)) continue;
    if (!txt.includes('apcClasseMatieresEcole')) fautifs.push(rel);
  }
  assert.deepEqual(fautifs, [],
    'Ces fichiers lisent le coefficient APC national sans le coefficient de l\'école :\n  • ' + fautifs.join('\n  • ')
    + '\nPasser la table par apcClasseMatieresEcole(referentiel, classeSlug, matieresDeLaClasse), ou inscrire le fichier dans EXCEPTIONS avec sa raison.');
});

test('chaque exception a une raison écrite', () => {
  for (const [f, raison] of Object.entries(EXCEPTIONS)) assert.ok(raison && raison.length > 10, f);
});

test('le balayage voit bien les appelants connus (il ne passe pas à vide)', () => {
  const vus = sources(SRC).map((f) => relative(SRC, f).replace(/\\/g, '/'))
    .filter((r) => CONSOMMATEURS.test(readFileSync(join(SRC, r), 'utf8')));
  for (const attendu of ['lib/pvEngine.js', 'pages/Bulletins.jsx', 'lib/classReportEngine.js', 'components/grades/ApcCompetenceWorkspace.jsx']) {
    assert.ok(vus.includes(attendu), attendu + ' devrait être balayé');
  }
});
