// LE DOSSIER ÉLÈVE SURVIT-IL À UN ALLER-RETOUR EXPORT → IMPORT ?
//
// Trois questions, une par chemin de données :
//   1. l'import TABLEUR (parseStudentsSheet) range-t-il les colonnes AJOUTÉES
//      — quartier de résidence, ancien établissement, statut établissement,
//      aptitude sportive — dans le bon champ, sans voler celles des voisins ?
//   2. l'import PIVOT (buildImportRecords, reprise depuis un autre logiciel)
//      reporte-t-il TOUT le dossier, et plus seulement l'identité ?
//   3. les en-têtes que l'écran Élèves EXPORTE sont-ils tous relus à l'import,
//      c'est-à-dire le fichier exporté est-il réimportable ?
//
// POURQUOI CE FICHIER. Les champs ajoutés tombent dans des pièges déjà
// documentés dans ce module :
//   • « Statut établissement » CONTIENT « statut » ; sans exclusion, le statut
//     de CLASSE capturait la colonne de l'ÉTABLISSEMENT, recevait « ancien »,
//     valeur rejetée → champ présent mais vide → écrasement au réimport ;
//   • « Établissement d'origine » contient « établissement » : le piège joue
//     dans l'autre sens, et le statut lisait un NOM D'ÉCOLE ;
//   • « Pays d'origine » contient « origine » et n'est pas une école ;
//   • quartier et adresse sont deux colonnes distinctes qu'un fichier porte
//     souvent ensemble — les confondre ruine le GROUP BY par quartier, seule
//     raison d'être de la colonne.
// Chacun est vérifié ci-dessous sur l'en-tête réel qui le déclenche.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImportRecords } from './dataImportCore.js';

const ici = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(ici, 'exportCsv.js'), 'utf8');

// Même technique que _importStudents.test.mjs : `rawRowsToStudents` est interne
// (le module touche au DOM ailleurs). On l'extrait et on lui injecte les
// normaliseurs RÉELS extraits du même fichier — ici on teste le mapping ET la
// normalisation, puisque les valeurs attendues en dépendent.
function extraire(nom) {
  const debut = src.indexOf(`function ${nom}`);
  if (debut < 0) throw new Error(`${nom} introuvable dans exportCsv.js`);
  const fin = src.indexOf('\nfunction ', debut + 10);
  return src.slice(debut, fin > 0 ? fin : undefined);
}
const fabrique = (nom) => new Function(`${extraire(nom)}; return ${nom};`)();

const normalizeStatut     = fabrique('normalizeStatut');
const normalizeStatutEtab = fabrique('normalizeStatutEtab');
const normalizeAptitude   = fabrique('normalizeAptitude');
const normalizeDate       = fabrique('normalizeDate');
const normalizeGender     = fabrique('normalizeGender');

const rawRowsToStudents = new Function(
  'msg', 'normalizeGender', 'normalizeStudentName', 'normalizeDate',
  'normalizeStatut', 'normalizeStatutEtab', 'normalizeAptitude',
  `${extraire('rawRowsToStudents')}; return rawRowsToStudents;`,
)(() => 'erreur', normalizeGender, (x) => x, normalizeDate,
  normalizeStatut, normalizeStatutEtab, normalizeAptitude);

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const importe = (headers, valeurs) => rawRowsToStudents([headers, valeurs]).rows?.[0] || {};
const titre = (s) => console.log(`\n-- ${s} --`);

const ORIG = 'EP DE BASTOS';

// ── 1. Ancien établissement, sur les en-têtes que les écoles écrivent ──────
titre('Ancien etablissement / ecole d origine');
for (const [libelle, entete] of [
  ['modèle fourni par l’application', 'ancienEtablissement'],
  ['libellé français complet',        'Ancien établissement'],
  ['tournure « ancienne école »',     'Ancienne école'],
  ['tournure « origine »',            "École d'origine"],
  ['tournure « établissement »',      "Établissement d'origine"],
  ['tournure « provenance »',         'École de provenance'],
  ['en-tête anglais',                 'Previous school'],
  ['en-tête espagnol',                'escuelaAnterior'],
]) {
  const r = importe(['Matricule', 'Nom', entete], ['S1', 'ABEGA', ORIG]);
  ok(r.ecole_origine === ORIG, `« ${entete} » (${libelle}) -> ecole_origine`, r.ecole_origine);
}

// « Pays d'origine » n'est PAS une école : le candidat générique « origine »
// doit être écarté, sinon la nationalité atterrit dans l'établissement.
const pays = importe(['Matricule', 'Nom', "Pays d'origine"], ['S1', 'ABEGA', 'CAMEROUN']);
ok(!pays.ecole_origine, '« Pays d origine » n est pas pris pour une ecole d origine', pays.ecole_origine);

// ── 2. Quartier de résidence, distinct de l'adresse ────────────────────────
titre('Quartier de residence');
for (const [libelle, entete] of [
  ['modèle fourni par l’application', 'quartier'],
  ['libellé français complet',        'Quartier de résidence'],
  ['en-tête anglais',                 'Neighbourhood'],
  ['en-tête espagnol',                'barrio'],
]) {
  const r = importe(['Matricule', 'Nom', entete], ['S1', 'ABEGA', 'BASTOS']);
  ok(r.quartier === 'BASTOS', `« ${entete} » (${libelle}) -> quartier`, r.quartier);
}
const quartierEtAdresse = importe(
  ['Matricule', 'Nom', 'Quartier de résidence', 'Adresse'],
  ['S1', 'ABEGA', 'BASTOS', 'Rue 1.234, Yaoundé'],
);
ok(quartierEtAdresse.quartier === 'BASTOS',
  'quartier et adresse ensemble -> quartier correct', quartierEtAdresse.quartier);
ok(quartierEtAdresse.adresse === 'Rue 1.234, Yaoundé',
  'quartier et adresse ensemble -> adresse correcte', quartierEtAdresse.adresse);
const adresseSeule = importe(['Matricule', 'Nom', 'Adresse'], ['S1', 'ABEGA', 'Bastos, Yaoundé']);
ok(!('quartier' in adresseSeule), 'adresse seule -> aucun quartier invente', adresseSeule.quartier);

// ── 3. Les DEUX statuts ne se volent pas leur colonne ──────────────────────
titre('Statut classe vs statut etablissement');
const lesDeux = importe(
  ['Matricule', 'Nom', 'Statut établissement', 'Statut classe'],
  ['S1', 'ABEGA', 'ancien', 'redoublant'],
);
ok(lesDeux.statut_etablissement === 'ancien',
  'les deux colonnes presentes -> statut etablissement correct', lesDeux.statut_etablissement);
ok(lesDeux.statut === 'redoublant',
  'les deux colonnes presentes -> statut classe correct', lesDeux.statut);

// LE défaut que l'exclusion ferme : fichier avec la SEULE colonne établissement.
// Sans exclusion, `statutIdx` la capturait, lisait « ancien », que
// `normalizeStatut` rejette -> statut = '' -> écrasement du statut enregistré.
const seulEtab = importe(['Matricule', 'Nom', 'Statut établissement'], ['S1', 'ABEGA', 'ancien']);
ok(seulEtab.statut_etablissement === 'ancien',
  'colonne etablissement seule -> elle est lue', seulEtab.statut_etablissement);
ok(!seulEtab.statut,
  'colonne etablissement seule -> le statut de CLASSE reste vide, pas ecrase', seulEtab.statut);

// Le piège symétrique : « Établissement d'origine » contient « établissement ».
const origPasStatut = importe(['Matricule', 'Nom', "Établissement d'origine"], ['S1', 'ABEGA', ORIG]);
ok(origPasStatut.ecole_origine === ORIG,
  '« Etablissement d origine » -> ecole_origine', origPasStatut.ecole_origine);
ok(origPasStatut.statut_etablissement === undefined,
  '« Etablissement d origine » n est PAS lu comme un statut', origPasStatut.statut_etablissement);

// Traductions : pas d'équivalent « redoublant »/« transféré » côté établissement.
ok(normalizeStatutEtab('redoublant') === 'ancien',  'redoublant => ancien dans l etablissement', normalizeStatutEtab('redoublant'));
ok(normalizeStatutEtab('transfere')  === 'nouveau', 'transfere => nouveau dans l etablissement', normalizeStatutEtab('transfere'));
ok(normalizeStatutEtab('Antiguo')    === 'ancien',  'libelle espagnol « antiguo » reconnu', normalizeStatutEtab('Antiguo'));
ok(normalizeStatutEtab('nimporte quoi') === '',     'valeur inconnue => vide (rien n est devine)', normalizeStatutEtab('nimporte quoi'));

// ── 4. Colonne absente ⇒ CLÉ ABSENTE (jamais un vide qui écrase) ───────────
titre('Une colonne absente n efface rien');
const minimal = importe(['Matricule', 'Nom'], ['S1', 'ABEGA']);
ok(!('quartier' in minimal),
  'sans colonne quartier -> la cle est ABSENTE de la ligne importee', Object.keys(minimal));
ok(!('ecole_origine' in minimal),
  'sans colonne ancien etablissement -> la cle est ABSENTE', Object.keys(minimal));
ok(!('statut_etablissement' in minimal),
  'sans colonne statut etablissement -> la cle est ABSENTE', Object.keys(minimal));
ok(!('sport_aptitude' in minimal),
  'sans colonne aptitude -> la cle est ABSENTE (colonne NOT NULL en base)', Object.keys(minimal));

// ── 5. Aptitude sportive ───────────────────────────────────────────────────
titre('Aptitude sportive');
const inapte = importe(['Matricule', 'Nom', 'Aptitude sportive'], ['S1', 'ABEGA', 'inapte']);
ok(inapte.sport_aptitude === 'inapte', '« inapte » est repris', inapte.sport_aptitude);
const aptitudeFloue = importe(['Matricule', 'Nom', 'Aptitude sportive'], ['S1', 'ABEGA', 'à voir']);
ok(!('sport_aptitude' in aptitudeFloue),
  'valeur non reconnue -> aucune cle ecrite (on ne declare pas inapte par erreur)', aptitudeFloue);

// ── 6. Aller-retour : les en-têtes EXPORTÉS sont tous relus ────────────────
// Les en-têtes ci-dessous sont ceux de `handleExport` (src/pages/Students.jsx),
// recopiés à l'identique. Si quelqu'un renomme une colonne de l'export sans
// apprendre le nouveau libellé à l'import, ce bloc tombe.
titre('Aller-retour export -> import');
const ENTETES_EXPORT = ['Nom', 'Matricule', 'Genre', 'Date de naissance', 'Lieu de naissance',
  'Âge', 'Classe', 'Statut établissement', 'Statut classe', 'Ancien établissement',
  'Téléphone', "Contact d'urgence", 'Quartier de résidence', 'Adresse',
  'Nom du père', 'Profession père', 'Nom de la mère', 'Profession mère',
  'Tuteur légal', 'Aptitude sportive'];
const VALEURS_EXPORT = ['ABEGA Sandrine', 'S1', 'Feminin', '2012-03-04', 'YAOUNDE',
  '13', 'CM2 A', 'ancien', 'redoublant', ORIG,
  '699000000', '677000001', 'BASTOS', 'Rue 1.234, Yaoundé',
  'ABEGA Bernard', 'Enseignant', 'NGONO Marie', 'Infirmière',
  'ABEGA Paul', 'inapte'];
const aller = importe(ENTETES_EXPORT, VALEURS_EXPORT);
const attendu = {
  matricule: 'S1', gender: 'Feminin', date_naissance: '2012-03-04',
  lieu_naissance: 'YAOUNDE', class_name: 'CM2 A',
  statut_etablissement: 'ancien', statut: 'redoublant', ecole_origine: ORIG,
  parent_phone: '699000000', contact_urgence: '677000001',
  quartier: 'BASTOS', adresse: 'Rue 1.234, Yaoundé',
  nom_pere: 'ABEGA Bernard', profession_pere: 'Enseignant',
  nom_mere: 'NGONO Marie', profession_mere: 'Infirmière',
  tuteur: 'ABEGA Paul', sport_aptitude: 'inapte',
};
for (const [champ, valeur] of Object.entries(attendu)) {
  ok(aller[champ] === valeur, `export -> import : ${champ} = ${JSON.stringify(valeur)}`, aller[champ]);
}
ok(String(aller.name || '').includes('ABEGA'), 'export -> import : le nom de l eleve', aller.name);

// ── 7. Import PIVOT : tout le dossier, pas seulement l'identité ────────────
titre('Import pivot (reprise depuis un autre logiciel)');
const bundle = {
  format: 'notescam-import/v1',
  years: [{
    year: '2025-2026',
    classes: [{
      name: 'CM2 A',
      students: [{
        name: 'ABEGA Sandrine', matricule: 'S1', gender: 'F',
        date_naissance: '2012-03-04', statut: 'redoublant', statut_etablissement: 'ancien',
        lieu_naissance: 'YAOUNDE', quartier: 'BASTOS', adresse: 'Rue 1.234, Yaoundé',
        parent_phone: '699000000', contact_urgence: '677000001',
        nom_pere: 'ABEGA Bernard', profession_pere: 'Enseignant',
        nom_mere: 'NGONO Marie', profession_mere: 'Infirmière',
        tuteur: 'ABEGA Paul', ecole_origine: ORIG, sport_aptitude: 'inapte',
      }],
    }],
  }],
};
const { out } = buildImportRecords(bundle, 'ecole-1');
const eleve = out.students[0] || {};
const attenduPivot = {
  matricule: 'S1', gender: 'Feminin', statut: 'redoublant', statut_etablissement: 'ancien',
  date_naissance: '2012-03-04', lieu_naissance: 'YAOUNDE',
  quartier: 'BASTOS', adresse: 'Rue 1.234, Yaoundé',
  parent_phone: '699000000', contact_urgence: '677000001',
  nom_pere: 'ABEGA Bernard', profession_pere: 'Enseignant',
  nom_mere: 'NGONO Marie', profession_mere: 'Infirmière',
  tuteur: 'ABEGA Paul', ecole_origine: ORIG, sport_aptitude: 'inapte',
};
for (const [champ, valeur] of Object.entries(attenduPivot)) {
  ok(eleve[champ] === valeur, `pivot : ${champ} = ${JSON.stringify(valeur)}`, eleve[champ]);
}

// `sport_aptitude` est NOT NULL DEFAULT 'apte' en base : un bundle muet sur ce
// champ ne doit JAMAIS produire null, sinon l'élève entier échoue à l'insertion.
const bundleMuet = {
  years: [{ year: '2025-2026', classes: [{ name: 'CM2 A', students: [{ name: 'MUET Jean' }] }] }],
};
const muet = buildImportRecords(bundleMuet, 'ecole-1').out.students[0] || {};
ok(muet.sport_aptitude === 'apte', 'pivot sans aptitude -> « apte » et non null (NOT NULL)', muet.sport_aptitude);
ok(muet.ecole_origine === null, 'pivot sans ancien etablissement -> null (non renseigne)', muet.ecole_origine);
ok(muet.quartier === null, 'pivot sans quartier -> null (non renseigne)', muet.quartier);

// Un logiciel d'origine peut nommer le champ « ancien_etablissement » : la clé
// alternative doit être acceptée, sinon la reprise perd la provenance.
const bundleAlias = {
  years: [{ year: '2025-2026', classes: [{ name: 'CM2 A',
    students: [{ name: 'ALIAS Jean', ancien_etablissement: ORIG }] }] }],
};
const alias = buildImportRecords(bundleAlias, 'ecole-1').out.students[0] || {};
ok(alias.ecole_origine === ORIG, 'pivot : la cle « ancien_etablissement » est acceptee', alias.ecole_origine);

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\nECHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
