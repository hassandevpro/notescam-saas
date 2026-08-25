// Logo effectif de l'établissement : établissement OU unité du complexe.
import { resolveSchoolLogo, hasSchoolLogo } from './schoolLogo.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const ECOLE = { id: 'sch1', name: 'THE GENIUS' };

// Le logo de l'établissement prime : c'est l'identité globale.
ok(resolveSchoolLogo({ ...ECOLE, logo_url: '/ecole.png' },
  [{ school_id: 'sch1', logo_url: '/unite.png', position: 0 }]) === '/ecole.png',
  "logo de l'établissement prioritaire sur celui d'une unité");

// Le cas qui motivait le correctif : rien sur l'école, tout sur le complexe.
const unites = [
  { school_id: 'sch1', logo_url: '/college.png', position: 1 },
  { school_id: 'sch1', logo_url: '/primaire.png', position: 0 },
];
ok(resolveSchoolLogo({ ...ECOLE, logo_url: null }, unites) === '/primaire.png',
  "logo repris de l'unité, dans l'ordre d'affichage (position)",
  resolveSchoolLogo({ ...ECOLE, logo_url: null }, unites));
ok(hasSchoolLogo({ ...ECOLE, logo_url: null }, unites) === true,
  "l'étape « logo téléversé » ne se redemande plus");

// Unités sans logo : on ne prétend pas en avoir un.
ok(resolveSchoolLogo({ ...ECOLE, logo_url: null },
  [{ school_id: 'sch1', logo_url: null, position: 0 }]) === null,
  'aucune unité avec logo → null');
ok(hasSchoolLogo({ ...ECOLE, logo_url: null }, []) === false, 'aucune unité → étape encore à faire');
ok(hasSchoolLogo({ ...ECOLE, logo_url: null }, undefined) === false, 'unités non chargées → pas de faux positif');
ok(resolveSchoolLogo(null, null) === null, 'aucune donnée → null (pas de plantage)');

// Cloisonnement : le logo d'une autre école ne doit jamais s'afficher ici.
ok(resolveSchoolLogo({ ...ECOLE, logo_url: null },
  [{ school_id: 'AUTRE', logo_url: '/autre-ecole.png', position: 0 }]) === null,
  "l'unité d'une AUTRE école ne fournit jamais le logo");
ok(resolveSchoolLogo({ ...ECOLE, logo_url: null }, [
  { school_id: 'AUTRE', logo_url: '/autre.png', position: 0 },
  { school_id: 'sch1', logo_url: '/moi.png', position: 5 },
]) === '/moi.png', "on retient l'unité de SON école même si une autre vient avant");

// Unité sans position (donnée ancienne) : pas de plantage au tri.
ok(resolveSchoolLogo({ ...ECOLE, logo_url: null },
  [{ school_id: 'sch1', logo_url: '/sans-position.png' }]) === '/sans-position.png',
  'unité sans `position` : traitée comme position 0');

console.log(`\n=== ${fail === 0 ? 'OK' : 'ÉCHEC'} : ${pass} ok, ${fail} ko ===`);
process.exitCode = fail === 0 ? 0 : 1;
