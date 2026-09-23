// LA TUTELLE IMPRIMÉE SUR UN DOCUMENT OFFICIEL
//
// Un bulletin de FORM1 qui annoncerait le Ministère de l'Éducation de Base est
// un faux, et il est distribué aux familles avant que quiconque le remarque.
// Ces contrôles fixent la frontière entre les deux ministères, avec les VRAIS
// noms de classes de l'école qui a demandé le changement (THE GENIUS, relevés
// dans le cloud le 23/09/2026).
//
// Lancer : node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_tutelle.test.mjs
import { isBasicClass, isBasicSchool, tutelleBasic } from './tutelle.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── Les classes réelles de THE GENIUS ──────────────────────────────────────
const FONDAMENTAL = [
  { name: 'CRECHES', cycle: 'maternelle' },
  { name: 'NURSERY 1', cycle: 'maternelle' },
  { name: 'PRE-MATERNELLE', level: 'Petite Section', cycle: 'maternelle' },
  { name: 'SIL', cycle: 'primaire' },
  { name: 'C P', level: 'CP', cycle: 'primaire' },
  { name: 'CE1 BIL', level: 'CE1', cycle: 'primaire' },
  { name: 'CM2', level: 'CM2', cycle: 'primaire' },
  { name: 'Class 6', level: 'Class 6', cycle: 'primaire' },
];
const SECONDAIRE = [
  { name: '5eme', level: '5ème', cycle: 'secondaire' },
  { name: '6eme BILINGUE', level: '6ème', cycle: 'secondaire' },
  { name: 'FORM1', level: 'Form 1', cycle: 'secondaire' },
  { name: 'FORM2', level: 'Form 2', cycle: 'secondaire' },
];

for (const c of FONDAMENTAL) {
  ok(isBasicClass(c) === true, `1. MINEDUB : ${c.name}`, isBasicClass(c));
}
for (const c of SECONDAIRE) {
  ok(isBasicClass(c) === false, `2. MINESEC : ${c.name}`, isBasicClass(c));
}

// ── Cas limites ────────────────────────────────────────────────────────────
ok(isBasicClass(null) === false, '3. aucune classe → MINESEC (défaut d’avant)');
ok(isBasicClass({ name: 'Terminale A4', cycle: 'secondaire' }) === false, '4. lycée → MINESEC');
ok(isBasicClass({ name: 'Groupe B' }) === false,
  '5. classe non reconnue et sans cycle → MINESEC, jamais de MINEDUB par défaut');
ok(isBasicClass({ name: 'Groupe B', cycle: 'primaire' }) === true,
  '6. classe non reconnue mais cycle primaire → MINEDUB (repli conservé)');

// ── L'école entière (documents sans classe) ────────────────────────────────
ok(isBasicSchool(FONDAMENTAL) === true, '7. école uniquement fondamentale → MINEDUB partout');
ok(isBasicSchool([...FONDAMENTAL, ...SECONDAIRE]) === false,
  '8. école MIXTE → MINESEC sur les documents d’ensemble (aucun des deux ordres n’est rendu faux)');
ok(isBasicSchool(SECONDAIRE) === false, '9. école uniquement secondaire → MINESEC');
ok(isBasicSchool([]) === false, '10. aucune classe connue → MINESEC (comportement d’avant)');
ok(isBasicSchool([null, undefined]) === false, '11. liste de trous → MINESEC, sans planter');

// ── L'entrée unique des générateurs de documents ───────────────────────────
ok(tutelleBasic({ cls: FONDAMENTAL[0] }) === true, '12. une classe fondamentale décide seule');
ok(tutelleBasic({ cls: SECONDAIRE[0], classes: FONDAMENTAL }) === false,
  '13. la CLASSE prime sur la composition de l’école');
ok(tutelleBasic({ classes: FONDAMENTAL }) === true, '14. sans classe, la composition décide');
ok(tutelleBasic({ cls: SECONDAIRE[0], basic: true }) === true, '15. surcharge explicite respectée');
ok(tutelleBasic({}) === false, '16. rien de fourni → MINESEC, comme avant ce chantier');

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
