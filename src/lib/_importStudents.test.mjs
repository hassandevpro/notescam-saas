// L'IMPORT D'ÉLÈVES RANGE-T-IL CHAQUE COLONNE DANS LE BON CHAMP ?
//
// Ce fichier existe à cause d'un défaut trouvé le 10/09/2026, en vérifiant une
// plainte de THE GENIUS (« le lieu de naissance ne se récupère pas »).
//
// Le lieu, lui, était bien récupéré. C'est la DATE qui se trompait de colonne.
// `col()` cherche d'abord une correspondance exacte, puis une correspondance
// approximative — et parmi les candidats de la date figure « naissance ». Un
// fichier dont l'en-tête « Lieu de naissance » précède « Date de naissance »
// voyait donc la date capturer la colonne du LIEU : chaque élève importé
// recevait « YAOUNDE » comme date de naissance. En silence, sur toute l'école.
//
// La gravité tenait au contexte : la notice 0.2.5 recommande justement de
// RÉIMPORTER le fichier d'inscription d'origine pour rattraper les informations
// parents perdues. Sans ce correctif, ce rattrapage aurait écrasé les dates de
// naissance de tous les élèves.
//
// Second défaut du même test : « Né(e) le », en-tête courant des listes d'école,
// n'était reconnu par aucun candidat — la date repartait vide.
//
// Ce test n'appelle pas un helper isolé : il fait passer des en-têtes RÉELS par
// la fonction d'import elle-même, et regarde où atterrissent les valeurs.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(ici, 'exportCsv.js'), 'utf8');

// `rawRowsToStudents` n'est pas exportée (elle est interne au module, qui touche
// au DOM ailleurs). On l'extrait et on lui injecte des normaliseurs neutres :
// ce qu'on teste ici est le MAPPING DE COLONNES, pas le formatage des valeurs.
const debut = src.indexOf('function rawRowsToStudents');
const fin   = src.indexOf('\nfunction ', debut + 10);
const corps = src.slice(debut, fin > 0 ? fin : undefined);
const tel   = (x) => x;
const rawRowsToStudents = new Function(
  'msg', 'normalizeGender', 'normalizeStudentName', 'normalizeDate', 'normalizeStatut', 'normalizeStatutEtab',
  `${corps}; return rawRowsToStudents;`,
)(() => 'erreur', tel, tel, tel, tel, tel);

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) { console.log(`✅ ${libelle}`); }
  else { console.log(`❌ ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};

const DATE = '2012-03-04';
const LIEU = 'YAOUNDE';
const importe = (headers, valeurs) => rawRowsToStudents([headers, valeurs]).rows?.[0] || {};

// ── Les en-têtes que les écoles emploient réellement ────────────────────────
const cas = [
  ['modèle fourni par l’application',
    ['matricule', 'prenom', 'nom', 'dateNaissance', 'lieuNaissance'], ['S1', 'Sandrine', 'ABEGA', DATE, LIEU]],
  ['libellés français complets',
    ['Matricule', 'Prénom', 'Nom', 'Date de naissance', 'Lieu de naissance'], ['S1', 'Sandrine', 'ABEGA', DATE, LIEU]],
  ['LIEU placé AVANT la date (le défaut du 10/09)',
    ['Matricule', 'Prénom', 'Nom', 'Lieu de naissance', 'Date de naissance'], ['S1', 'Sandrine', 'ABEGA', LIEU, DATE]],
  ['« Né(e) le » et « Lieu naiss. »',
    ['Matricule', 'Prénom', 'Nom', 'Né(e) le', 'Lieu naiss.'], ['S1', 'Sandrine', 'ABEGA', DATE, LIEU]],
  ['en-têtes anglais',
    ['Student ID', 'First name', 'Last name', 'Date of birth', 'Place of birth'], ['S1', 'Sandrine', 'ABEGA', DATE, LIEU]],
];

for (const [libelle, headers, valeurs] of cas) {
  const r = importe(headers, valeurs);
  ok(r.lieu_naissance === LIEU, `${libelle} → le lieu arrive dans lieu_naissance`, r.lieu_naissance);
  ok(r.date_naissance === DATE, `${libelle} → la date arrive dans date_naissance`, r.date_naissance);
}

// ── Un fichier SANS date ne doit pas inventer une date ──────────────────────
// C'est l'autre moitié du défaut : mieux vaut une date vide qu'une date fausse.
// Une date de naissance erronée voyage jusqu'au bulletin et jusqu'au diplôme.
const sansDate = importe(['Matricule', 'Prénom', 'Nom', 'Lieu de naissance'], ['S1', 'Sandrine', 'ABEGA', LIEU]);
ok(sansDate.lieu_naissance === LIEU, 'fichier sans colonne date → le lieu est quand même repris', sansDate.lieu_naissance);
ok(!sansDate.date_naissance, 'fichier sans colonne date → la date reste VIDE (jamais le lieu)', sansDate.date_naissance);

// ── Témoin : les autres colonnes ne sont pas perturbées ─────────────────────
const complet = importe(
  ['Matricule', 'Prénom', 'Nom', 'Lieu de naissance', 'Date de naissance', 'Nom du père', 'Nom de la mère', 'Téléphone'],
  ['S1', 'Sandrine', 'ABEGA', LIEU, DATE, 'ABEGA Bernard', 'NGONO Marie', '699000000'],
);
ok(complet.nom_pere === 'ABEGA Bernard', 'témoin : le nom du père reste à sa place', complet.nom_pere);
ok(complet.nom_mere === 'NGONO Marie',   'témoin : le nom de la mère reste à sa place', complet.nom_mere);
ok(complet.parent_phone === '699000000', 'témoin : le téléphone reste à sa place', complet.parent_phone);

// ── Les en-têtes ACCENTUÉS, cause du défaut sur les parents ─────────────────
// « Nom du père » normalisé en « nomdupère » ne contenait pas « pere ». Ce sont
// pourtant les libellés qu'une école écrit spontanément.
const accents = importe(
  ['Matricule', 'Prénom', 'Nom', 'Père', 'Mère', 'Profession père', 'Téléphone', 'Élève'],
  ['S1', 'Sandrine', 'ABEGA', 'ABEGA Bernard', 'NGONO Marie', 'Enseignant', '699000000', 'x'],
);
ok(accents.nom_pere === 'ABEGA Bernard', '« Père » accentué est reconnu', accents.nom_pere);
ok(accents.nom_mere === 'NGONO Marie', '« Mère » accentué est reconnu', accents.nom_mere);
ok(accents.profession_pere === 'Enseignant', '« Profession père » est reconnue', accents.profession_pere);
ok(accents.parent_phone === '699000000', '« Téléphone » accentué est reconnu', accents.parent_phone);

// ── Témoin : « Année » ne doit pas être prise pour une date de naissance ────
// C'est la raison pour laquelle « nee » n'est pas un candidat de la date :
// il se retrouve dans « année ».
const annee = importe(['Matricule', 'Nom', 'Année'], ['S1', 'ABEGA', '2025-2026']);
ok(!annee.date_naissance, '« Année » n’est pas prise pour une date de naissance', annee.date_naissance);

// ── Témoin : le nom ne se fait pas voler par « Nom du père » ────────────────
const ordre = importe(['Nom du père', 'Nom', 'Prénom'], ['ABEGA Bernard', 'ABEGA', 'Sandrine']);
ok(ordre.nom_pere === 'ABEGA Bernard', 'le père garde sa colonne même placé en premier', ordre.nom_pere);
ok(String(ordre.name || '').includes('ABEGA'), 'le nom de l’élève reste celui de la colonne « Nom »', ordre.name);

console.log(echecs === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
