// UNE MATIÈRE DE CLASSE NE DOIT JAMAIS RECEVOIR UN IDENTIFIANT AU HASARD.
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Audit de la production du 2026-10-21, 44 écoles : 32 matières de classe en
// double, dont 8 chez THE GENIUS (27 notes posées dessus) et 8 chez BRIGHT
// CONTINENT. Les copies portaient des identifiants sans rapport entre eux.
//
// LE MÉCANISME. L'auto-configuration d'une classe se gardait du doublon en
// regardant `get().subjects` — le cache du poste. Un poste qui n'avait pas
// encore descendu les matières (serveur LAN après remise à zéro du curseur,
// navigateur vidé, second appareil) voyait une classe vide, reconfigurait, et
// tirait de NOUVEAUX identifiants. La base accueillait une seconde série
// complète, et l'enseignante saisissait ses notes sur l'une ou l'autre selon ce
// que son écran lui montrait ce jour-là.
//
// LA PARADE, et c'est elle qu'on verrouille ici : l'identifiant est dérivé de
// (classe, nom normalisé). Pour que ce soit POSSIBLE, chaque constructeur doit
// demander son identifiant AVEC LE NOM de la matière — `makeId(nom)` et non
// `makeId()`. Un seul `makeId()` nu suffit à rouvrir la porte, dans un fichier
// que personne ne relit : d'où le contrôle statique ci-dessous.
//
//   node src/core/_idMatiereDeterministe.test.mjs
import { readFileSync } from 'node:fs';
import { subjectsFromApcReferentiel } from './apcEngine.js';
import { subjectsFromReferentiel } from './scEngine.js';

let failed = false;
const ok = (c, msg, got) => {
  console.log(`${c ? '✅' : '❌'} ${msg}${c || got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`);
  if (!c) failed = true;
};

// ── 1. CONTRÔLE STATIQUE : plus aucun `id: makeId()` nu ────────────────────
const FICHIERS = [
  'src/core/apcEngine.js',
  'src/core/bilEngine.js',
  'src/core/bilingualSubjects.js',
  'src/core/classicSubjects.js',
  'src/core/matEngine.js',
  'src/core/primEngine.js',
  'src/core/scEngine.js',
];
for (const f of FICHIERS) {
  const src = readFileSync(f, 'utf8');
  const nus = (src.match(/id:\s*makeId\(\s*\)/g) || []).length;
  const nommes = (src.match(/id:\s*makeId\([^)\s]/g) || []).length;
  ok(nus === 0, `${f} : aucun identifiant tiré au hasard`, `${nus} appel(s) makeId() nu(s)`);
  ok(nommes > 0, `${f} : l'identifiant est demandé AVEC le nom`, `${nommes} appel(s) nommé(s)`);
}

// Et le magasin ne doit plus passer un générateur aveugle.
{
  const src = readFileSync('src/store/schoolStore.js', 'utf8');
  ok(!/makeId:\s*uuid\b/.test(src),
    'schoolStore : plus un seul « makeId: uuid » pour construire des matières');
  ok(/idMatiereClasse\(cls\.id, nom\)/.test(src),
    'schoolStore : l\'identifiant vient de (classe, nom)');
}

// ── 2. CONTRÔLE FONCTIONNEL : le nom arrive bien au générateur ─────────────
// Sans cela, le contrôle statique pourrait passer sur un nom constant.
{
  const rows = [
    { matiere_id: 'svteehb', nom: 'SVT', coef: 2, ordre: 1 },
    { matiere_id: 'pct', nom: 'PCT', coef: 2, ordre: 2 },
  ];
  const vus = [];
  const subs = subjectsFromApcReferentiel(rows, {
    schoolId: 'e1', classId: 'c1', makeId: (nom) => { vus.push(nom); return `id:${nom}`; },
  });
  ok(vus.join(',') === 'SVT,PCT', 'APC : chaque ligne demande son id avec SON nom', vus);
  ok(subs.map((s) => s.id).join(',') === 'id:SVT,id:PCT', 'APC : l\'id rendu est bien posé', subs.map((s) => s.id));

  const vus2 = [];
  const subs2 = subjectsFromReferentiel(rows, {
    schoolId: 'e1', classId: 'c1', makeId: (nom) => { vus2.push(nom); return `id:${nom}`; },
  });
  ok(vus2.join(',') === 'SVT,PCT', 'second cycle : idem', vus2);
  ok(subs2.length === 2, 'second cycle : les deux lignes sont construites', subs2.length);
}

// ── 3. DEUX CONFIGURATIONS DE SUITE DONNENT LES MÊMES LIGNES ──────────────
// C'est la propriété qui compte sur le terrain : rejouer ne double pas.
{
  const rows = [{ matiere_id: 'svteehb', nom: 'SVT', coef: 2, ordre: 1 }];
  const deterministe = (classId) => (nom) => `sub:${classId}:${String(nom).toLowerCase().trim()}`;
  const a = subjectsFromApcReferentiel(rows, { schoolId: 'e1', classId: 'c1', makeId: deterministe('c1') });
  const b = subjectsFromApcReferentiel(rows, { schoolId: 'e1', classId: 'c1', makeId: deterministe('c1') });
  ok(a[0].id === b[0].id, 'deux passages, le MÊME identifiant — donc un upsert, pas un doublon', [a[0].id, b[0].id]);
  const autre = subjectsFromApcReferentiel(rows, { schoolId: 'e1', classId: 'c2', makeId: deterministe('c2') });
  ok(autre[0].id !== a[0].id, 'une autre classe garde sa propre ligne', autre[0].id);
}

console.log(failed ? '\n❌ échecs' : '\n✅ tout passe');
process.exitCode = failed ? 1 : 0;
