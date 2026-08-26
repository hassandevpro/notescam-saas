// CRÈCHE / GARDERIE — une classe qu'aucun périmètre n'atteignait.
//
// Constaté en production (THE GENIUS, 26/08/2026) : la classe « CRECHE » manquait
// au compte du Directeur du Primaire et à celui de sa secrétaire — 19 classes au
// lieu de 20 — alors qu'elle apparaissait bien chez la responsable des affaires
// financières.
//
// Ce n'était pas un problème de droits : `classSectionKey` ne reconnaissant pas
// « crèche », la classe tombait en section 'autre', qui n'appartient à AUCUN cycle
// (`classCycleKey` → null). `scopeAllowsClass` la refusait donc à tout compte borné
// à un secteur, tandis que les comptes à périmètre GLOBAL — la finance — la voyaient
// toujours. D'où l'asymétrie exacte qui a été signalée.
//
// La règle que ce fichier verrouille : toute classe d'accueil pré-scolaire est de la
// MATERNELLE, donc du cycle fondamental, donc visible de qui dirige ce cycle.

import { classSectionKey, isMaternelle, maternelleNiveauSlug } from './engineResolver.js';
import { classCycleKey, scopeAllowsClass, filterClassesByScope } from './surveillantScope.js';
import { parseClassName } from './classNameParser.js';
import { cameroonFr } from '../countries/cameroon_fr.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const cls = (name) => ({ id: name, name, level: name });

// ── 1. Les noms d'accueil pré-scolaire sont de la maternelle ─────────────────
for (const name of ['CRECHE', 'CRÈCHE', 'Creches', 'Crèche A', 'Garderie', 'Nursery', 'Pré-scolaire', 'Preschool']) {
  ok(isMaternelle(name, name) && classSectionKey(cls(name)) === 'maternelle',
    `1. « ${name} » → section maternelle`, classSectionKey(cls(name)));
}

// PS est le niveau le plus jeune du référentiel MINEDUB : c'est là qu'elles vont.
ok(maternelleNiveauSlug('CRECHE', 'CRECHE') === 'ps', '2. la crèche est rattachée au niveau PS');

// ── 3. Et donc : elles entrent dans le périmètre du fondamental ──────────────
const dirPrimaire = { scope_sections: ['maternelle', 'primaire'] };
const fondamental = { scope_cycles: ['fondamental'] };
const college     = { scope_cycles: ['secondaire'] };

ok(classCycleKey(cls('CRECHE')) === 'fondamental', '3. cycle fondamental', classCycleKey(cls('CRECHE')));
ok(scopeAllowsClass(dirPrimaire, cls('CRECHE')), '4. vue par le directeur du primaire (maternelle + primaire)');
ok(scopeAllowsClass(fondamental, cls('CRECHE')), '5. vue par un périmètre « Fondamental »');
ok(!scopeAllowsClass(college, cls('CRECHE')), '6. PAS vue par le collège — le cloisonnement tient');

// ── 7. Le comptage réel signalé : 19 → 20 ───────────────────────────────────
const ecole = ['CRECHE', 'PS', 'MS', 'GS', 'SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'].map(cls);
ok(filterClassesByScope(dirPrimaire, ecole).length === ecole.length,
  '7. aucune classe du fondamental ne manque à l’appel',
  filterClassesByScope(dirPrimaire, ecole).map((c) => c.name));

// ── 8. À la CRÉATION, la classe naît avec le bon cycle ───────────────────────
// Sans cela, `fallbackCycle` la stockait en 'secondaire' : un mauvais cycle écrit
// en base survit à toute correction ultérieure du classement par nom.
ok(parseClassName('CRECHE', cameroonFr).cycle === 'maternelle',
  '8. création : cycle « maternelle », pas le repli « secondaire »',
  parseClassName('CRECHE', cameroonFr).cycle);

// ── 9. Non-régression : rien d'autre ne bascule en maternelle ────────────────
for (const [name, attendu] of [['6e', 'premier_cycle'], ['CM2', 'primaire'], ['Terminale C', 'second_cycle'], ['PS', 'maternelle']]) {
  ok(classSectionKey(cls(name)) === attendu, `9. « ${name} » reste ${attendu}`, classSectionKey(cls(name)));
}

console.log(`\n${fail === 0 ? '✅' : '❌'} Crèche : ${pass} ok, ${fail} ko`);
process.exit(fail === 0 ? 0 : 1);
