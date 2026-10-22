// UN MÊME ENFANT PEUT-IL ÊTRE CRÉÉ PLUSIEURS FOIS ?
//
// CE QUE CE TEST FERME. L'écran de saisie appelait `checkDuplicate` avant
// d'enregistrer. L'IMPORT DE FICHIER, non : `ImportPanel` fait
// `for (const row of rows) await onImport(row)` et `onImport` est `addStudent`.
// Aucun contrôle sur ce chemin — réimporter le même fichier créait un dossier de
// plus à chaque passage, et un fichier qui répète une ligne la créait autant de
// fois qu'elle y figure. Six imports, six dossiers pour un enfant : six pensions
// dues, six bulletins, un effectif faux.
//
// `peutCreerEleve` est le garde que `addStudent` consulte désormais. Il est pur,
// donc il se teste ici, sans navigateur ni base.
//
// Lancer : node src/lib/_studentCreationGuard.test.mjs
import { peutCreerEleve, checkDuplicate, DUP } from './studentDuplicate.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => { c ? (console.log(`✅ ${label}`), pass++) : (console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`), fail++); };

const ELEVE = { name: 'MANGA Éric', birth_date: '2014-03-12', class_id: 'cls-6e', parent_phone: '690 00 03 00' };

// ── 1) L'ANCIEN ÉCHEC : six passages d'import, six dossiers ─────────────────
// On rejoue la boucle d'import telle qu'elle était, SANS garde.
{
  const registre = [];
  for (let i = 0; i < 6; i++) registre.push({ ...ELEVE, id: `uuid-${i}` });
  ok(registre.length === 6, 'sans garde : six imports créaient six dossiers', registre.length);
}

// ── 2) LE GARDE : le même enfant n'est créé qu'une fois ────────────────────
{
  const registre = [];
  let crees = 0, ignores = 0;
  for (let i = 0; i < 6; i++) {
    const v = peutCreerEleve({ ...ELEVE, id: `uuid-${i}` }, registre);
    if (v.ok) { registre.push({ ...ELEVE, id: `uuid-${i}` }); crees++; } else ignores++;
  }
  ok(crees === 1, 'avec le garde : un seul dossier créé', crees);
  ok(ignores === 5, 'les cinq passages suivants sont signalés, pas créés', ignores);
  ok(registre.length === 1, 'le registre ne contient qu’un élève', registre.length);
}

// ── 3) CE QUI DOIT RESTER POSSIBLE ─────────────────────────────────────────
const registre = [{ ...ELEVE, id: 'u1' }];

// Un homonyme avec une autre date de naissance : deux enfants peuvent porter le
// même nom. Refuser serait pire que le doublon.
ok(peutCreerEleve({ name: 'MANGA Éric', birth_date: '2015-07-01' }, registre).ok,
  'un homonyme né un autre jour reste inscriptible');

// Des jumeaux : même naissance, même téléphone du parent, prénoms différents.
// Le moteur les classe WARN — l'écran demande confirmation, le garde laisse passer.
const jumelle = { name: 'MANGA Sandrine', birth_date: '2014-03-12', parent_phone: '690 00 03 00' };
ok(checkDuplicate(jumelle, registre).level === DUP.WARN, 'une jumelle est un cas douteux (WARN)');
ok(peutCreerEleve(jumelle, registre).ok, 'et elle reste inscriptible : le garde ne bloque que la certitude');

// Une RÉÉCRITURE de la même ligne (restauration depuis la corbeille, rejeu de la
// file de synchronisation) porte un id déjà connu : ce n'est pas une création.
ok(peutCreerEleve({ ...ELEVE, id: 'u1' }, registre).ok,
  'rejouer la ligne existante (même id) n’est jamais un doublon');

// ── 4) CE QUI DOIT ÊTRE REFUSÉ ─────────────────────────────────────────────
const refus = peutCreerEleve({ ...ELEVE, id: 'u2' }, registre);
ok(!refus.ok, 'le même enfant sous un nouvel id est refusé', refus);
ok(/déjà inscrit/i.test(refus.raison || ''), 'et la raison est dicible à l’utilisateur', refus.raison);
ok(refus.existant?.id === 'u1', 'le dossier existant est désigné, pour pouvoir l’ouvrir', refus.existant?.id);

const memeMatricule = peutCreerEleve(
  { name: 'AUTRE Enfant', birth_date: '2013-01-01', matricule: 'ELV-2025-0097', id: 'u3' },
  [{ ...ELEVE, id: 'u1', matricule: 'ELV-2025-0097' }],
);
ok(!memeMatricule.ok, 'un matricule déjà attribué est refusé', memeMatricule);

// ── 5) LES ARCHIVÉS COMPTENT ───────────────────────────────────────────────
// C'est en réinscrivant quelqu'un qu'on croyait supprimé que le doublon naît.
const avecArchive = peutCreerEleve({ ...ELEVE, id: 'u4' },
  [{ ...ELEVE, id: 'u1', archived_at: '2026-01-10T00:00:00.000Z' }]);
ok(!avecArchive.ok, 'un élève ARCHIVÉ est vu comme déjà inscrit', avecArchive);

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Garde de création d'élève : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
