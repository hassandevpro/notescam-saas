// TEST D'IMPRESSION — le bulletin « APC REPORT CARD » tient-il sur le nombre de pages attendu ?
//
// Rendu RÉEL (Chromium, média print, PDF) pour chaque cas, nombre de pages compté dans le
// PDF. Ce test n'est pas dans `npm test` : il lui faut un build (`npm run build`) et un
// navigateur, donc plusieurs dizaines de secondes.
//
//   npm run build
//   npm run test:impression
//
// Ce qui est vérifié, cas par cas :
//   • le nombre de pages (1 page tant que le plancher de lisibilité le permet, sinon 2) ;
//   • la lisibilité : texte secondaire ≥ 7 pt, notes et moyennes ≥ 8 pt ;
//   • les DONNÉES : le texte du bulletin est identique quelle que soit la densité (0, 0,5, 1),
//     donc la mise en page ne change ni une note, ni un coefficient, ni un rang, ni une mention.
import { spawnSync } from 'node:child_process';

const BANC = 'scripts/bulletin-une-page.mjs';
const run = (args) => {
  const r = spawnSync(process.execPath,
    ['--experimental-loader', './scripts/lib/jsx-resolve.mjs', BANC, ...args, '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ligne = (r.stdout || '').split('\n').find((l) => l.startsWith('{'));
  if (!ligne) throw new Error(`banc muet pour ${args.join(' ')} :\n${r.stderr?.slice(-600)}`);
  return JSON.parse(ligne);
};

// [libellé, arguments, pages attendues]
const CAS = [
  ['Form 1 (16 matières, photo)', ['--classe', 'form1'], 1],
  ['Form 1 sans photo', ['--classe', 'form1', '--sans-photo'], 1],
  ['Form 1, beaucoup de « ABS »', ['--classe', 'form1', '--beaucoup-abs'], 1],
  ['Class 5 (27 matières)', ['--classe', 'class5'], 1],
  ['41 matières — dernier cas d\'une page', ['--matieres', '41'], 1],
  ['42 matières — première bascule en 2 pages', ['--matieres', '42'], 2],
  ['CE1 BIL (44 matières)', ['--classe', 'ce1bil'], 2],
];

let ko = 0;
const ok = (c, msg) => { console.log(`  ${c ? '✅' : '❌'} ${msg}`); if (!c) ko++; };

for (const [nom, args, attendu] of CAS) {
  const r = run(args);
  console.log(`\n${nom}`);
  ok(r.pages === attendu, `${attendu} page(s) A4 (obtenu : ${r.pages})`);
  ok(r.taillesPt[0] >= 7, `texte le plus petit ≥ 7 pt (obtenu : ${r.taillesPt[0]} pt)`);
  ok(r.minNotePt == null || r.minNotePt >= 8, `notes et moyennes ≥ 8 pt (obtenu : ${r.minNotePt} pt)`);
}

// Les données ne dépendent pas de la densité.
console.log('\nLes données sont identiques quelle que soit la densité');
const t0 = run(['--classe', 'form1', '--d', '0']).texte;
const t5 = run(['--classe', 'form1', '--d', '0.5']).texte;
const t1 = run(['--classe', 'form1', '--d', '1']).texte;
ok(t0 === t5 && t5 === t1, `texte identique à d=0, 0,5 et 1 (${t0.length} caractères)`);

// Le logo en filigrane est imprimé sur CHAQUE page (élément global de la page Bulletins, reproduit
// par le banc avec un logo rouge à 6 % : on compte les pixels rosés du PDF rasterisé).
console.log('\nLe logo en filigrane est imprimé sur chaque page');
for (const [nom, args, pages] of [['1 page (Form 1)', ['--classe', 'form1'], 1], ['2 pages (CE1 BIL)', ['--classe', 'ce1bil'], 2]]) {
  const r = run([...args, '--filigrane']);
  ok(r.pages === pages && r.rosesParPage.length === pages && r.rosesParPage.every((n) => n > 1000),
    `${nom} : filigrane sur ${pages} page(s) (pixels rosés par page : ${r.rosesParPage.join(', ')})`);
}

console.log(ko ? `\n❌ ${ko} vérification(s) en échec` : '\n✅ Tous les cas d\'impression passent');
process.exit(ko ? 1 : 0);
