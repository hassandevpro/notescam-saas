// ─────────────────────────────────────────────────────────────────────────────
// REGISTRE MATRICULE (une feuille par classe) → FICHIER D'IMPORT ÉLÈVES
// ─────────────────────────────────────────────────────────────────────────────
// Convertit le classeur que tiennent les secrétariats — UNE FEUILLE PAR CLASSE,
// aux colonnes du registre matricule MINESEC — en UN SEUL tableau importable par
// l'écran Élèves.
//
// Usage :
//   node scripts/registre-classes-to-import.mjs "<source.xlsx>" "<sortie.xlsx>"
//
// ── POURQUOI UNE CONVERSION, ET PAS UN IMPORT DIRECT ────────────────────────
// Trois obstacles, dont le premier est rédhibitoire :
//
//   1. `parseSpreadsheet` ne lit QUE LA PREMIÈRE FEUILLE du classeur
//      (wb.SheetNames[0]). Importer un classeur de 14 feuilles n'aurait repris
//      que la première classe, SANS rien signaler — 382 élèves manquants sur
//      436, et un écran qui annonce « 54 élèves importés avec succès ».
//   2. Le registre emploie « 0 » comme marque de case VIDE. Gardé tel quel, un
//      quartier devient « 0 » et un motif de sortie devient « 0 ».
//   3. La colonne « téléphone » porte parfois DEUX numéros séparés par « / ».
//
// La scission de « date et lieu de naissance » et la lecture des colonnes du
// registre, elles, sont désormais comprises par l'import lui-même
// (src/lib/exportCsv.js) : ce script s'appuie dessus et n'a pas à les refaire.
//
// ── CE QUE CE SCRIPT NE FAIT PAS ────────────────────────────────────────────
// Il n'invente rien et ne supprime personne.
//   • une date illisible reste vide (jamais une date devinée) ;
//   • un élève en DOUBLE dans le registre reste en double dans la sortie — le
//     rapport le nomme, et c'est à l'école de trancher ;
//   • aucun statut (nouveau/ancien, redoublant) n'est déduit de l'année
//     d'entrée : le registre ne le dit pas, l'application ne l'inventera pas ;
//   • la colonne « âge » est écartée : elle se calcule à partir de la date de
//     naissance, et l'import l'ignore de toute façon. Deux lignes du classeur
//     portent d'ailleurs un âge qui contredit l'autre pour le même élève.
//
// La CLASSE retenue est le NOM DE LA FEUILLE, pas la valeur de la cellule :
// les cellules des feuilles de série écrivent « 2ndeA » là où l'onglet dit
// « 2ndeA4 » (A4 est le code officiel de la série littéraire), et « tleA » en
// minuscules sur deux lignes. Le nom de l'onglet est la seule désignation
// homogène des 14 classes.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const [, , SOURCE, SORTIE] = process.argv;
if (!SOURCE || !SORTIE) {
  console.error('Usage : node scripts/registre-classes-to-import.mjs "<source.xlsx>" "<sortie.xlsx>"');
  process.exit(2);
}

// Index des colonnes du registre, dans l'ordre où l'administration les fixe.
const COL = {
  no: 0, nom: 1, sexe: 2, classe: 3, dateLieu: 4, age: 5, matricule: 6,
  dateEntree: 7, motifEntree: 8, dateSortie: 9, motifSortie: 10,
  parent: 11, telephone: 12, profession: 13, quartier: 14,
};

// « 0 » = case vide dans ces registres (cf. en-tête du fichier). On le traite
// comme un vide, SAUF s'il s'agit d'un vrai texte commençant par 0 — un numéro
// de téléphone, par exemple, que `tel()` gère séparément.
const txt = (v) => {
  const s = String(v ?? '').trim();
  return s === '0' ? '' : s;
};

// Date d'entrée / de sortie : l'ANNÉE SEULE est conservée telle quelle. Ce
// registre ne porte que des années (2020, 2023, 2024, 2026) ; les convertir en
// dates aurait inventé un mois et un jour.
const anneeOuDate = (v) => {
  const s = txt(v);
  if (!s) return '';
  if (/^(19|20)\d{2}$/.test(s)) return s;
  const jms = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (jms) return `${jms[3]}-${jms[2].padStart(2, '0')}-${jms[1].padStart(2, '0')}`;
  return s;   // forme inattendue : on la laisse voir plutôt que de la jeter
};

// « 28/03/2013 à Yaoundé » → { date: '2013-03-28', lieu: 'Yaoundé' }.
// Même règle que `splitDateLieu` (src/lib/exportCsv.js) : une date illisible
// avec un lieu lisible rend le lieu et PAS de date.
const scinderDateLieu = (v) => {
  const s = txt(v);
  if (!s) return { date: '', lieu: '' };
  const m = s.match(/^(.*?)\s+(?:à|a|au|en)\s+(.+)$/i);
  const brut = (m ? m[1] : s).trim();
  const jms = brut.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  const date = jms ? `${jms[3]}-${jms[2].padStart(2, '0')}-${jms[1].padStart(2, '0')}` : '';
  if (!date && !m) return { date: '', lieu: s };
  return { date, lieu: m ? m[2].trim() : '' };
};

// « 677163334/693873599 » → deux numéros. Le premier va au téléphone du parent,
// le second au contact d'urgence : c'est exactement ce qu'un second numéro EST
// pour l'école — quelqu'un d'autre à joindre quand le premier ne répond pas.
// Les laisser collés dans un seul champ rendait les deux inappelables.
const tels = (v) => {
  const s = String(v ?? '').trim();
  if (!s || s === '0') return ['', ''];
  const parts = s.split(/[/;,]/).map((p) => p.replace(/\s+/g, '')).filter(Boolean);
  return [parts[0] || '', parts[1] || ''];
};

// En-têtes de SORTIE : ceux que `rawRowsToStudents` reconnaît exactement.
// Ne pas les renommer sans vérifier src/lib/exportCsv.js — une correspondance
// seulement approximative peut capturer la colonne d'un champ voisin.
const ENTETES = ['matricule', 'nom', 'sexe', 'dateNaissance', 'lieuNaissance', 'classe',
  'dateEntree', 'motifEntree', 'dateSortie', 'motifSortie',
  'tuteur', 'professionTuteur', 'telephone', 'contactUrgence', 'quartier'];

const wb = XLSX.readFile(SOURCE);
const sortie = [ENTETES];
const parClasse = [];
const signale = { datesIllisibles: [], sansDate: 0, sansTel: 0, telsDoubles: 0, matriculesTextuels: [] };
const vus = new Map();

for (const feuille of wb.SheetNames) {
  const lignes = XLSX.utils.sheet_to_json(wb.Sheets[feuille], { header: 1, blankrows: false, defval: null });
  let n = 0;
  lignes.slice(1).forEach((r, i) => {
    const nom = txt(r[COL.nom]);
    if (!nom) return;                       // ligne de remplissage / total
    n++;
    const { date, lieu } = scinderDateLieu(r[COL.dateLieu]);
    const [tel1, tel2] = tels(r[COL.telephone]);
    const matricule = txt(r[COL.matricule]);

    if (!date && txt(r[COL.dateLieu])) signale.datesIllisibles.push(`${feuille} « ${nom} » : ${txt(r[COL.dateLieu])}`);
    if (!date) signale.sansDate++;
    if (!tel1) signale.sansTel++;
    if (tel2) signale.telsDoubles++;
    if (matricule && !/^\d+$/.test(matricule)) signale.matriculesTextuels.push(`${feuille} « ${nom} » : ${matricule}`);

    const cle = `${feuille}::${nom.toUpperCase()}`;
    vus.set(cle, [...(vus.get(cle) || []), lignes.indexOf(r) + 1]);

    sortie.push([
      matricule,
      nom,
      txt(r[COL.sexe]),
      date,
      lieu,
      feuille,                              // la classe = le nom de l'onglet
      anneeOuDate(r[COL.dateEntree]),
      txt(r[COL.motifEntree]),
      anneeOuDate(r[COL.dateSortie]),
      txt(r[COL.motifSortie]),
      txt(r[COL.parent]),
      txt(r[COL.profession]),
      tel1,
      tel2,
      txt(r[COL.quartier]),
    ]);
  });
  parClasse.push([feuille, n]);
}

const ws = XLSX.utils.aoa_to_sheet(sortie);
// Largeurs de colonnes : le fichier est relu à l'œil avant d'être importé.
ws['!cols'] = [{ wch: 12 }, { wch: 42 }, { wch: 5 }, { wch: 12 }, { wch: 18 }, { wch: 9 },
  { wch: 11 }, { wch: 12 }, { wch: 11 }, { wch: 12 },
  { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
ws['!freeze'] = { xSplit: 0, ySplit: 1 };
const out = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(out, ws, 'Eleves');
XLSX.writeFile(out, SORTIE);

// ── Rapport ────────────────────────────────────────────────────────────────
const total = sortie.length - 1;
console.log(`\nÉcrit : ${SORTIE}`);
console.log(`${total} élèves sur une seule feuille, ${parClasse.length} classes.\n`);
console.log('CLASSES À CRÉER DANS L\'APPLICATION (noms EXACTS attendus par le fichier) :');
parClasse.forEach(([c, n]) => console.log(`  ${c.padEnd(10)} ${String(n).padStart(3)} élèves`));

const remplissage = (col) => {
  const i = ENTETES.indexOf(col);
  return sortie.slice(1).filter((r) => r[i] !== '' && r[i] != null).length;
};
console.log('\nREMPLISSAGE PAR COLONNE :');
for (const c of ENTETES) {
  const n = remplissage(c);
  console.log(`  ${c.padEnd(18)} ${String(n).padStart(3)}/${total}  ${String(Math.round(n / total * 100)).padStart(3)} %`);
}

console.log('\nÀ VÉRIFIER AVANT D\'IMPORTER :');
const doublons = [...vus].filter(([, l]) => l.length > 1);
if (doublons.length) {
  console.log(`  ${doublons.length} nom(s) présent(s) DEUX FOIS dans la même classe — conservés tels quels :`);
  doublons.forEach(([cle, l]) => console.log(`    ${cle.replace('::', ' / ')} (lignes source ${l.join(', ')})`));
} else {
  console.log('  aucun nom en double dans une même classe.');
}
if (signale.datesIllisibles.length) {
  console.log(`  ${signale.datesIllisibles.length} date(s) de naissance illisible(s) — le LIEU est gardé, la date reste vide :`);
  signale.datesIllisibles.forEach((d) => console.log(`    ${d}`));
}
if (signale.matriculesTextuels.length) {
  console.log(`  ${signale.matriculesTextuels.length} matricule(s) non numérique(s), repris tels quels :`);
  signale.matriculesTextuels.forEach((m) => console.log(`    ${m}`));
}
console.log(`  ${signale.sansDate} élève(s) sans date de naissance, ${signale.sansTel} sans téléphone.`);
console.log(`  ${signale.telsDoubles} ligne(s) à deux numéros : le second est passé en contact d'urgence.`);
