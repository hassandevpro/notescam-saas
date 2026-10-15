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
const sansZero            = fabrique('sansZero');
// Ces deux-là s'appuient sur `normalizeDate` : on les reconstruit donc avec la
// VRAIE fonction en portée, sinon elles la trouveraient indéfinie à l'appel.
const normalizeRegistreDate = new Function('normalizeDate',
  `${extraire('normalizeRegistreDate')}; return normalizeRegistreDate;`)(normalizeDate);
const splitDateLieu = new Function('normalizeDate',
  `${extraire('splitDateLieu')}; return splitDateLieu;`)(normalizeDate);

const rawRowsToStudents = new Function(
  'msg', 'normalizeGender', 'normalizeStudentName', 'normalizeDate',
  'normalizeStatut', 'normalizeStatutEtab', 'normalizeAptitude',
  'normalizeRegistreDate', 'splitDateLieu', 'sansZero',
  `${extraire('rawRowsToStudents')}; return rawRowsToStudents;`,
)(() => 'erreur', normalizeGender, (x) => x, normalizeDate,
  normalizeStatut, normalizeStatutEtab, normalizeAptitude,
  normalizeRegistreDate, splitDateLieu, sansZero);

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

// ── 5 bis. Colonne COMBINÉE « date et lieu de naissance » ──────────────────
//
// Forme du registre matricule manuscrit recopié dans un tableur. Avant la
// scission, ce fichier perdait les DEUX informations : l'en-tête contient le
// mot « lieu », donc la date l'écartait (exclusion `['lieu']`) et le lieu
// recevait la chaîne entière — « 28/03/2013 à Yaoundé » comme lieu de
// naissance, et aucune date.
titre('Colonne combinee « date et lieu de naissance »');
const combine = importe(
  ['no', "nom de l'élève", 'sexe', 'date et lieu de naissance'],
  ['1', 'ABAKOURA RAMAT', 'M', '28/03/2013 à Yaoundé'],
);
ok(combine.date_naissance === '2013-03-28', 'colonne combinee -> date ISO', combine.date_naissance);
ok(combine.lieu_naissance === 'Yaoundé', 'colonne combinee -> lieu seul', combine.lieu_naissance);

// Variantes réelles du séparateur et des lieux composés.
for (const [cellule, date, lieu] of [
  ['05/07/2015 à Galim-Tignère', '2015-07-05', 'Galim-Tignère'],
  ["11/04/2013 à N'Djaména",     '2013-04-11', "N'Djaména"],
  ['12/10/2013 a Yaoundé',       '2013-10-12', 'Yaoundé'],
  ['01/01/2013',                 '2013-01-01', ''],
]) {
  const r = importe(['Nom', 'date et lieu de naissance'], ['ABEGA', cellule]);
  ok(r.date_naissance === date && r.lieu_naissance === lieu,
    `« ${cellule} » -> ${date} + « ${lieu} »`, [r.date_naissance, r.lieu_naissance]);
}

// Une DATE ILLISIBLE avec un lieu lisible : le lieu est gardé, la date reste
// vide. Cas réel du classeur (« 18/1182011 », coquille de frappe). Inventer une
// date à partir d'une coquille serait pire que de laisser le champ vide.
const coquille = importe(['Nom', 'date et lieu de naissance'], ['ABEGA', "18/1182011 à N'Djaména"]);
ok(coquille.date_naissance === null, 'date illisible -> aucune date inventee', coquille.date_naissance);
ok(coquille.lieu_naissance === "N'Djaména", 'date illisible -> le lieu est quand meme garde', coquille.lieu_naissance);

// Cellule qui ne porte QU'UN LIEU, sans séparateur : elle reste un lieu.
const lieuSeulDansCombine = importe(['Nom', 'date et lieu de naissance'], ['ABEGA', 'Yaoundé']);
ok(lieuSeulDansCombine.lieu_naissance === 'Yaoundé',
  'cellule sans date ni separateur -> lieu conserve', lieuSeulDansCombine.lieu_naissance);

// Une colonne DÉDIÉE présente par ailleurs reste prioritaire sur la combinée.
const combineEtDediees = importe(
  ['Nom', 'date et lieu de naissance', 'Date de naissance', 'Lieu de naissance'],
  ['ABEGA', '28/03/2013 à Yaoundé', '2014-01-02', 'DOUALA'],
);
ok(combineEtDediees.date_naissance === '2014-01-02',
  'colonne date dediee prioritaire sur la combinee', combineEtDediees.date_naissance);
ok(combineEtDediees.lieu_naissance === 'DOUALA',
  'colonne lieu dediee prioritaire sur la combinee', combineEtDediees.lieu_naissance);

// ── 5 ter. Registre matricule : entrée / sortie ────────────────────────────
titre('Registre matricule (entree / sortie)');

// Les en-têtes RÉELS du registre portent leur légende. Celui de la sortie ne
// contient même pas le mot « sortie » — c'est ce qui a imposé un candidat
// générique « motif », et l'exclusion d'« entree » pour qu'il ne capture pas
// la colonne d'entrée.
const ENTETE_MOTIF_ENTREE = "motif d'entrée: ED=étudedossier, ET=étudedossier+test";
const ENTETE_MOTIF_SORTIE = 'motif: NM=normale, EX=exclusion, TF=transfert, DM=démission, LM=longuemaladie, DC=décès';
const registre = importe(
  ['Nom', "date d'entrée", ENTETE_MOTIF_ENTREE, 'date de sortie', ENTETE_MOTIF_SORTIE],
  ['ABEGA', '2024', 'concours', '2026', 'TF'],
);
ok(registre.date_entree === '2024', 'en-tete reel -> date d entree', registre.date_entree);
ok(registre.motif_entree === 'concours', 'en-tete a legende -> motif d entree', registre.motif_entree);
ok(registre.date_sortie === '2026', 'en-tete reel -> date de sortie', registre.date_sortie);
ok(registre.motif_sortie === 'TF', 'en-tete « motif: NM=… » -> motif de SORTIE', registre.motif_sortie);

// LE défaut que l'ordre des exclusions ferme : avec le seul en-tête de sortie
// (« motif: … »), le motif d'ENTRÉE doit rester absent, et réciproquement.
const seulMotifSortie = importe(['Nom', ENTETE_MOTIF_SORTIE], ['ABEGA', 'EX']);
ok(seulMotifSortie.motif_sortie === 'EX', 'motif de sortie seul -> il est lu', seulMotifSortie.motif_sortie);
ok(!('motif_entree' in seulMotifSortie),
  'motif de sortie seul -> le motif d ENTREE reste absent', Object.keys(seulMotifSortie));
const seulMotifEntree = importe(['Nom', ENTETE_MOTIF_ENTREE], ['ABEGA', 'ED']);
ok(seulMotifEntree.motif_entree === 'ED', 'motif d entree seul -> il est lu', seulMotifEntree.motif_entree);
ok(!('motif_sortie' in seulMotifEntree),
  'motif d entree seul -> le motif de SORTIE reste absent', Object.keys(seulMotifEntree));

// L'ANNÉE SEULE ne doit PAS passer par `normalizeDate`, qui y verrait un numéro
// de série Excel : « 2024 » serait devenu 1905-07-15. C'est le piège principal
// de ces deux colonnes, et il est invisible à la relecture d'une liste.
ok(normalizeRegistreDate('2024') === '2024', 'annee seule gardee telle quelle (pas un serie Excel)', normalizeRegistreDate('2024'));
ok(normalizeRegistreDate('2024-2025') === '2024-2025', 'annee scolaire conservee', normalizeRegistreDate('2024-2025'));
ok(normalizeRegistreDate('2024/2025') === '2024-2025', 'annee scolaire « 2024/2025 » normalisee', normalizeRegistreDate('2024/2025'));
ok(normalizeRegistreDate('15/09/2024') === '2024-09-15', 'date complete normalisee en ISO', normalizeRegistreDate('15/09/2024'));
ok(normalizeRegistreDate('0') === '', '« 0 » du registre = case vide', normalizeRegistreDate('0'));
ok(normalizeRegistreDate('') === '', 'cellule vide -> vide', normalizeRegistreDate(''));

// « 0 » comme marque de case vide, sur les colonnes du registre.
const zeros = importe(
  ['Nom', "date d'entrée", ENTETE_MOTIF_ENTREE, 'Profession'],
  ['ABEGA', '0', '0', '0'],
);
ok(zeros.date_entree === '', '« 0 » -> date d entree vide', zeros.date_entree);
ok(zeros.motif_entree === '', '« 0 » -> motif vide, pas le texte « 0 »', zeros.motif_entree);
ok(zeros.profession_tuteur === '', '« 0 » -> profession vide', zeros.profession_tuteur);

// Colonnes absentes ⇒ clés absentes (jamais un vide qui écrase).
for (const champ of ['date_entree', 'motif_entree', 'date_sortie', 'motif_sortie', 'profession_tuteur']) {
  ok(!(champ in minimal), `sans colonne -> ${champ} est ABSENT de la ligne`, Object.keys(minimal));
}

// ── 5 quater. « Nom du parent » sans père ni mère nommés ───────────────────
//
// Beaucoup de registres ne portent qu'UN responsable, « nom du parent », sans
// dire s'il s'agit du père, de la mère ou d'un tuteur. Le ranger dans
// `nom_pere` affirmerait une paternité que le registre n'affirme pas : sur le
// classeur repris, plusieurs de ces responsables portent un prénom féminin
// (« fadimatou bachirou », « salma hafsa »). Il va donc dans `tuteur`.
titre('« Nom du parent » -> tuteur, « profession » -> profession tuteur');
const parentSeul = importe(
  ['Nom', 'nom du parent', 'profession'],
  ['ABEGA', 'fadimatou bachirou', 'commerçant'],
);
ok(parentSeul.tuteur === 'fadimatou bachirou', '« nom du parent » -> tuteur', parentSeul.tuteur);
ok(parentSeul.profession_tuteur === 'commerçant', '« profession » -> profession_tuteur', parentSeul.profession_tuteur);
ok(!parentSeul.nom_pere, '« nom du parent » n est PAS pris pour le pere', parentSeul.nom_pere);
ok(!parentSeul.profession_pere, '« profession » seule n est PAS celle du pere', parentSeul.profession_pere);

// Le piège du candidat générique « parent » : un en-tête de TÉLÉPHONE ne doit
// jamais être lu comme un nom. Sans exclusion, « Téléphone parent » devenait le
// nom du tuteur, et un numéro s'affichait à la place d'une personne.
const telParent = importe(['Nom', 'Téléphone parent'], ['ABEGA', '699000000']);
ok(telParent.parent_phone === '699000000', '« Telephone parent » -> telephone', telParent.parent_phone);
ok(!telParent.tuteur, '« Telephone parent » n est PAS lu comme un nom de tuteur', telParent.tuteur);

// Le piège symétrique sur la profession : « Profession du père » ne doit pas
// être lue DEUX fois (père + tuteur).
//
// Ce bloc a révélé DEUX défauts préexistants, indépendants des colonnes
// ajoutées ici : « Profession du père » (avec l'article) n'était reconnue par
// aucun candidat, et le candidat générique « pere » de la colonne NOM la
// capturait — « Ingénieur » s'affichait comme nom du père.
const profPere = importe(['Nom', 'Profession du père'], ['ABEGA', 'Ingénieur']);
ok(profPere.profession_pere === 'Ingénieur', '« Profession du pere » -> profession_pere', profPere.profession_pere);
ok(!profPere.nom_pere, '« Profession du pere » n est PAS lue comme le NOM du pere', profPere.nom_pere);
ok(!profPere.profession_tuteur, '« Profession du pere » n est pas aussi celle du tuteur', profPere.profession_tuteur);
const profMere = importe(['Nom', 'Profession de la mère'], ['ABEGA', 'Infirmière']);
ok(profMere.profession_mere === 'Infirmière', '« Profession de la mere » -> profession_mere', profMere.profession_mere);
ok(!profMere.nom_mere, '« Profession de la mere » n est PAS lue comme le NOM de la mere', profMere.nom_mere);
const jobPere = importe(['Nom', 'fatherJob'], ['ABEGA', 'Engineer']);
ok(jobPere.profession_pere === 'Engineer', '« fatherJob » seul -> profession_pere', jobPere.profession_pere);
ok(!jobPere.nom_pere, '« fatherJob » seul n est PAS lu comme le nom du pere', jobPere.nom_pere);

// Et les en-têtes anglais / espagnols du modèle fourni par l'application.
for (const [entete, attenduTuteur, attenduProf] of [
  ['guardian',       'ABEGA Paul', undefined],
  ['guardianJob',    undefined,    'Seamstress'],
  ['tutor',          'ABEGA Paul', undefined],
  ['profesionTutor', undefined,    'Costurera'],
]) {
  const valeur = attenduTuteur ?? attenduProf;
  const r = importe(['Nom', entete], ['ABEGA', valeur]);
  ok(r.tuteur === (attenduTuteur || '') && (r.profession_tuteur ?? undefined) === attenduProf,
    `« ${entete} » -> ${attenduTuteur ? 'tuteur' : 'profession_tuteur'}`, [r.tuteur, r.profession_tuteur]);
}

// ── 6. Aller-retour : les en-têtes EXPORTÉS sont tous relus ────────────────
// Les en-têtes ci-dessous sont ceux de `handleExport` (src/pages/Students.jsx),
// recopiés à l'identique. Si quelqu'un renomme une colonne de l'export sans
// apprendre le nouveau libellé à l'import, ce bloc tombe.
titre('Aller-retour export -> import');
const ENTETES_EXPORT = ['Nom', 'Matricule', 'Genre', 'Date de naissance', 'Lieu de naissance',
  'Âge', 'Classe', 'Statut établissement', 'Statut classe', 'Ancien établissement',
  'Téléphone', "Contact d'urgence", 'Quartier de résidence', 'Adresse',
  'Nom du père', 'Profession père', 'Nom de la mère', 'Profession mère',
  'Tuteur légal', 'Profession tuteur', 'Aptitude sportive',
  "Date d'entrée", "Motif d'entrée", 'Date de sortie', 'Motif de sortie'];
const VALEURS_EXPORT = ['ABEGA Sandrine', 'S1', 'Feminin', '2012-03-04', 'YAOUNDE',
  '13', 'CM2 A', 'ancien', 'redoublant', ORIG,
  '699000000', '677000001', 'BASTOS', 'Rue 1.234, Yaoundé',
  'ABEGA Bernard', 'Enseignant', 'NGONO Marie', 'Infirmière',
  'ABEGA Paul', 'Couturière', 'inapte',
  '2024', 'ED', '2026-06-30', 'TF'];
const aller = importe(ENTETES_EXPORT, VALEURS_EXPORT);
const attendu = {
  matricule: 'S1', gender: 'Feminin', date_naissance: '2012-03-04',
  lieu_naissance: 'YAOUNDE', class_name: 'CM2 A',
  statut_etablissement: 'ancien', statut: 'redoublant', ecole_origine: ORIG,
  parent_phone: '699000000', contact_urgence: '677000001',
  quartier: 'BASTOS', adresse: 'Rue 1.234, Yaoundé',
  nom_pere: 'ABEGA Bernard', profession_pere: 'Enseignant',
  nom_mere: 'NGONO Marie', profession_mere: 'Infirmière',
  tuteur: 'ABEGA Paul', profession_tuteur: 'Couturière', sport_aptitude: 'inapte',
  date_entree: '2024', motif_entree: 'ED',
  date_sortie: '2026-06-30', motif_sortie: 'TF',
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
        tuteur: 'ABEGA Paul', profession_tuteur: 'Couturière',
        ecole_origine: ORIG, sport_aptitude: 'inapte',
        date_entree: '2024', motif_entree: 'ED',
        date_sortie: '2026-06-30', motif_sortie: 'TF',
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
  tuteur: 'ABEGA Paul', profession_tuteur: 'Couturière',
  ecole_origine: ORIG, sport_aptitude: 'inapte',
  date_entree: '2024', motif_entree: 'ED',
  date_sortie: '2026-06-30', motif_sortie: 'TF',
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
ok(muet.date_sortie === null, 'pivot sans date de sortie -> null (toujours inscrit)', muet.date_sortie);
ok(muet.motif_entree === null, 'pivot sans motif d entree -> null (non renseigne)', muet.motif_entree);
ok(muet.profession_tuteur === null, 'pivot sans profession tuteur -> null', muet.profession_tuteur);

// Clés alternatives acceptées : les logiciels d'origine nomment ces champs
// « annee_entree » ou « motif_admission » aussi souvent que « date_entree ».
const bundleRegistre = {
  years: [{ year: '2025-2026', classes: [{ name: 'CM2 A',
    students: [{ name: 'ALIAS Jean', annee_entree: '2024', motif_admission: 'concours',
      annee_sortie: '2026', motif_depart: 'DM' }] }] }],
};
const aliasReg = buildImportRecords(bundleRegistre, 'ecole-1').out.students[0] || {};
ok(aliasReg.date_entree === '2024', 'pivot : « annee_entree » acceptee', aliasReg.date_entree);
ok(aliasReg.motif_entree === 'concours', 'pivot : « motif_admission » acceptee', aliasReg.motif_entree);
ok(aliasReg.date_sortie === '2026', 'pivot : « annee_sortie » acceptee', aliasReg.date_sortie);
ok(aliasReg.motif_sortie === 'DM', 'pivot : « motif_depart » acceptee', aliasReg.motif_sortie);

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
