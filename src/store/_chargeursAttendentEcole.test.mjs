// LE CÂBLAGE : LES CHARGEURS PAR ÉCOLE ATTENDENT L'ÉCOLE
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Signalement du 2026-10-23 : « quand on essaie d'entrer les notes du primaire,
// le référentiel se charge sans cesse ». Cause : `loadPrim` (comme `loadApc`,
// `loadMat` et `loadRefMasques`) commençait par
//
//     const { schoolId } = get();
//     if (!schoolId) return;
//
// et l'écran de saisie le demande À SON MONTAGE, avant que l'effet de App ait
// posé `schoolId` — React exécute les effets des ENFANTS d'abord. La demande
// était donc jetée, et rien ne la rejouait.
//
// Ce test est un test de CÂBLAGE, pas de logique : la règle d'attente est
// vérifiée par core/_attenteValeur.test.mjs. Il existe parce que, le
// 2026-10-22, une correction complète dormait dans le magasin sans qu'aucun
// écran ne l'appelle — « vu du dehors, rien ne change ».
//
//   node src/store/_chargeursAttendentEcole.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ICI = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(ICI, 'schoolStore.js'), 'utf8');
const fp  = readFileSync(join(ICI, '..', 'lib', 'referentielFingerprint.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}${got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`}`); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// Corps d'une entrée du magasin, de son nom jusqu'à `await initDB()` (ou, pour
// les masques, jusqu'au premier `await`) : c'est là que se décide le sort d'une
// demande arrivée trop tôt.
function entete(nom, lignes = 8) {
  const i = src.indexOf(`  ${nom}:`);
  if (i < 0) return null;
  return src.slice(i).split('\n').slice(0, lignes).join('\n');
}

titre('Les trois référentiels par école attendent, ils n’abandonnent plus');
for (const nom of ['loadApc', 'loadPrim', 'loadMat']) {
  const bloc = entete(nom);
  ok(bloc !== null, `${nom} existe toujours`);
  ok(/await attendreSchoolId\(get\)/.test(bloc || ''), `${nom} attend l’école`);
  // La forme fautive : lire schoolId du magasin et repartir sans rien faire.
  ok(!/const \{ schoolId \} = get\(\);\s*\n\s*if \(!schoolId\) return;/.test(bloc || ''),
    `${nom} ne jette plus la demande arrivée trop tôt`);
}

titre('Les masques et libellés de l’école aussi');
{
  const bloc = entete('loadRefMasques', 10);
  ok(/await attendreSchoolId\(get\)/.test(bloc || ''), 'loadRefMasques attend l’école');
  ok(!/const \{ schoolId \} = get\(\);\s*\n\s*if \(!schoolId \|\| !backendOnline\(\)\) return;/.test(bloc || ''),
    'loadRefMasques ne jette plus la demande');
}

titre('L’attente est branchée sur le magasin, pas sur un minuteur');
{
  const i = src.indexOf('function attendreSchoolId');
  const bloc = i < 0 ? '' : src.slice(i, i + 400);
  ok(i > 0, 'attendreSchoolId est défini dans le magasin');
  ok(/attendreValeur\(/.test(bloc), 'il délègue à la règle pure attendreValeur');
  ok(/useSchoolStore\.subscribe\(fn\)/.test(bloc), 'il s’abonne au magasin (pas de scrutation)');
  ok(/lire: \(\) => get\(\)\.schoolId/.test(bloc), 'et relit schoolId à chaque réveil');
}

titre('Les deux chargeurs NATIONAUX n’attendent rien (ils n’ont pas d’école)');
for (const nom of ['loadSc', 'loadBil']) {
  const bloc = entete(nom, 6);
  ok(bloc !== null && !/attendreSchoolId/.test(bloc), `${nom} reste inchangé`, bloc ? 'présent' : 'absent');
}

titre('L’empreinte par comptes ne demande plus une colonne qui n’existe pas');
{
  // Mesuré le 2026-10-23 contre la production :
  //   prim_niveau_competences?select=id  → 400  (clé = niveau_id, competence_id)
  //   prim_niveau_competences?select=*   → 200
  // Un seul compte manquant annule l'empreinte entière : le référentiel du
  // primaire était retéléchargé en entier à chaque montage d'écran.
  ok(/\.select\('\*', \{ count: 'exact', head: true \}\)/.test(fp),
    'countFingerprint compte sur *');
  ok(!/\.select\('id', \{ count: 'exact', head: true \}\)/.test(fp),
    'plus aucun compte sur id');
  // L'empreinte des lignes MAISON, elle, filtre par école : elle DOIT lire
  // school_id, et cette colonne existe sur les deux tables concernées (vérifié
  // en base le 2026-10-23).
  ok(/\.select\('school_id', \{ count: 'exact', head: true \}\)/.test(fp),
    'maisonFingerprint compte toujours sur school_id');
}

console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
