// LE CLASSEUR DES BULLETINS DU SECOND CYCLE — logique pure, sans React.
//
// L'écran (`components/bulletins/ScBulletinExcelIO.jsx`) ne fait que brancher
// les magasins, traduire les libellés et afficher l'aperçu ; tout ce qui DÉCIDE
// est ici, et c'est ici que `_scBulletinSheet.test.mjs` l'éprouve.
//
// Deux sens, une seule forme de grille :
//
//   • `buildScWorkbook` écrit un récapitulatif de classe (matières rangées par
//     GROUPE, comme le bulletin officiel) PUIS une feuille par séquence, dont
//     l'en-tête est exactement celui que l'écran Notes exporte — « Élève,
//     Matière /max, … ». Le classeur est donc relu par le même découpage
//     (`rawRowsToGrades` d'exportCsv.js), et réimportable des deux côtés.
//
//   • `planScSheetImport` relit ces feuilles et rend un PLAN : ce qui sera
//     écrit, ce qui remplacerait une note différente déjà en base, et ce qui
//     n'est pas rattaché. Il n'écrit rien : l'écran montre le plan, et
//     l'administration tranche.
//
// Ce module ne tire que `gradeEntry` (fonctions pures). Il n'importe PAS
// exportCsv.js, qui réveille le store d'auth et le client Supabase : le
// découpage des lignes est fait par l'appelant et passé déjà fait, ce qui garde
// ce fichier testable hors navigateur.

import { validateGrade, gradeCell } from './gradeEntry';

// Comparaison tolérante d'un libellé écrit à la main (élève, matière) : sans
// accents, sans casse, sans ponctuation ni espaces. « Histoire-Géo » ==
// « histoire geo ». C'est la même règle que l'import des enseignants.
export const normLibelle = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

// Numéro de séquence porté par le NOM d'une feuille : « Séquence 3 », « Seq 3 »,
// « Séq3 », « 3 »… Rend null si la feuille n'annonce aucun numéro, ou un numéro
// qui n'est pas une séquence (1 à 6).
//
// C'est ce qui protège le récapitulatif : il ne porte pas de numéro, donc il
// n'est jamais relu comme une grille de notes. Ses colonnes contiennent des
// MOYENNES DE PÉRIODE — les réécrire en base fabriquerait des notes que
// personne n'a saisies.
export function sequenceFromSheetName(name) {
  const m = String(name || '').match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n >= 1 && n <= 6 ? n : null;
}

// ── Colonnes du récapitulatif ───────────────────────────────────────────────
// L'ordre des matières et leurs groupes ne sont PAS recalculés ici : ils sont
// lus dans le bulletin déjà assemblé (`assembleScBulletin`), celui-là même qui
// s'imprime. Un classeur dont les colonnes ne suivraient pas le bulletin
// imprimé serait pire qu'absent : on comparerait deux documents qui ne disent
// pas la même chose.
export function scSheetColumns({ students = [], scDataById = {}, subjects = [], defaultMax = 20 }) {
  const premier = students.map((s) => scDataById[s.id]?.data).find(Boolean);
  if (!premier) return { groupes: [], matieres: [] };
  const maxById = new Map(subjects.map((s) => [s.id, s.max]));
  return {
    groupes: premier.groups.map((g) => ({ nom: g.nom, span: g.rows.length })),
    matieres: premier.groups.flatMap((g) => g.rows.map((r) => ({
      id: r.id, nom: r.nom, coef: r.coef, max: maxById.get(r.id) ?? defaultMax,
    }))),
  };
}

// Élèves rangés comme sur le bulletin : par rang général quand il est calculé,
// par nom sinon (une classe sans note n'a pas de rang).
export function orderScStudents(students, scDataById = {}) {
  return [...students].sort((a, b) => {
    const ra = scDataById[a.id]?.data?.generalRank;
    const rb = scDataById[b.id]?.data?.generalRank;
    if (ra && rb && ra !== rb) return ra - rb;
    if (ra && !rb) return -1;
    if (!ra && rb) return 1;
    return String(a.name).localeCompare(String(b.name));
  });
}

// ── Export : les feuilles du classeur ───────────────────────────────────────
// `labels` porte les libellés déjà traduits par l'écran (aucun texte d'interface
// n'est écrit ici), `seqLabel(n)` nomme la feuille d'une séquence.
export function buildScWorkbook({
  students = [], scDataById = {}, subjects = [], gradeMap = {}, classId, seqs = [],
  labels = {}, seqLabel = (n) => `Séquence ${n}`, defaultMax = 20,
}) {
  const L = {
    rang: 'Rang', matricule: 'Matricule', eleve: 'Élève', moyenne: 'Moyenne',
    moyenneGenerale: 'Moyenne générale', appreciation: 'Appréciation',
    decision: 'Décision', recapitulatif: 'Récapitulatif', ...labels,
  };
  const colonnes = scSheetColumns({ students, scDataById, subjects, defaultMax });
  const eleves = orderScStudents(students, scDataById);

  // Ligne de GROUPES, posée au-dessus des en-têtes et alignée sur elles : les
  // trois premières colonnes sont vides, puis chaque nom de groupe occupe la
  // colonne de sa première matière. C'est la lecture du bulletin officiel, mise
  // à l'horizontale.
  const ligneGroupes = ['', '', ''];
  for (const g of colonnes.groupes) {
    ligneGroupes.push(g.nom);
    for (let i = 1; i < g.span; i++) ligneGroupes.push('');
  }

  const enTetes = [
    L.rang, L.matricule, L.eleve,
    ...colonnes.matieres.map((m) => `${m.nom} /${m.max}${m.coef ? ` (×${m.coef})` : ''}`),
    ...colonnes.groupes.map((g) => `${L.moyenne} ${g.nom}`),
    L.moyenneGenerale, L.appreciation, L.decision,
  ];

  const recap = [ligneGroupes, enTetes];
  for (const e of eleves) {
    const entree = scDataById[e.id];
    const data = entree?.data;
    const parMatiere = new Map((data?.groups || []).flatMap((g) => g.rows.map((r) => [r.id, r])));
    recap.push([
      data?.generalRank || '',
      e.matricule || '',
      e.name,
      ...colonnes.matieres.map((m) => gradeCell(parMatiere.get(m.id)?.moyenne ?? '')),
      ...(data?.groups || []).map((g) => gradeCell(g.moyenne ?? '')),
      gradeCell(data?.moyenneGenerale ?? ''),
      data?.appreciation || '',
      entree?.decision || '',
    ]);
  }

  // Une feuille par séquence : la GRILLE DE SAISIE. Son en-tête est celui que
  // l'écran Notes exporte, au caractère près — c'est ce qui la rend relisible
  // par le découpage commun, ici comme là-bas.
  const feuillesSeq = seqs.map((seq) => ({
    name: seqLabel(seq),
    rows: [
      [L.eleve, ...colonnes.matieres.map((m) => `${m.nom} /${m.max}`)],
      ...eleves.map((e) => {
        const scores = gradeMap[`${classId}_${e.id}_${seq}`] || {};
        return [e.name, ...colonnes.matieres.map((m) => gradeCell(scores[m.id] ?? ''))];
      }),
    ],
  }));

  return [{ name: L.recapitulatif, rows: recap }, ...feuillesSeq];
}

// ── Import : le PLAN, sans aucune écriture ──────────────────────────────────
// `feuilles` : [{ nom, lignes, erreur }] où `lignes` est ce que rend le
// découpage commun d'exportCsv.js (`rawRowsToGrades`) : [{ studentName,
// grades: { <nom de matière>: '<valeur brute>' } }]. Le découpage est fait par
// l'appelant — voir l'en-tête de ce fichier.
export function planScSheetImport({
  feuilles = [], classStudents = [], subjects = [], gradeMap = {}, classId,
}) {
  const parEleve   = new Map(classStudents.map((s) => [normLibelle(s.name), s]));
  const parMatiere = new Map(subjects.map((s) => [normLibelle(s.name), s]));

  const ecritures = [];
  const lues = [];
  const ignorees = [];
  const elevesInconnus = new Set();
  const matieresInconnues = new Set();
  let horsBareme = 0;

  for (const { nom, lignes, erreur } of feuilles) {
    const seq = sequenceFromSheetName(nom);
    if (seq == null) { ignorees.push(String(nom)); continue; }
    if (erreur) { ignorees.push(`${nom} — ${erreur}`); continue; }

    let notes = 0, remplacements = 0;
    for (const ligne of lignes || []) {
      const student = parEleve.get(normLibelle(ligne.studentName));
      if (!student) {
        if (String(ligne.studentName || '').trim()) elevesInconnus.add(ligne.studentName);
        continue;
      }
      const dejaEnBase = gradeMap[`${classId}_${student.id}_${seq}`] || {};
      for (const [nomMatiere, brut] of Object.entries(ligne.grades || {})) {
        const sub = parMatiere.get(normLibelle(nomMatiere));
        if (!sub) { matieresInconnues.add(nomMatiere); continue; }
        const valeur = validateGrade(brut, sub.max);
        // Hors barème : rejetée, JAMAIS tronquée au maximum. Une note de 25/20
        // ramenée à 20 serait une note inventée, et personne ne la retrouverait.
        if (valeur === null) { horsBareme++; continue; }
        // Cellule vide : on ne touche à rien. Un classeur rempli matière par
        // matière a forcément des colonnes vides ; les traiter comme un
        // effacement viderait les notes des autres enseignants.
        if (valeur === '') continue;
        const ancienne = dejaEnBase[sub.id];
        if (String(ancienne ?? '') === String(valeur)) continue;   // déjà identique
        if (ancienne !== undefined && ancienne !== '') remplacements++;
        ecritures.push({ seq, student, subjectId: sub.id, valeur, ancienne });
        notes++;
      }
    }
    lues.push({ nom: String(nom), seq, notes, remplacements });
  }

  return {
    ecritures, feuilles: lues, ignorees,
    elevesInconnus: [...elevesInconnus],
    matieresInconnues: [...matieresInconnues],
    horsBareme,
    remplacements: lues.reduce((a, f) => a + f.remplacements, 0),
  };
}

// Écritures regroupées par (élève, séquence) : `saveGrade` enregistre une ligne
// de notes d'un coup. Un appel par note multiplierait les écritures — et la
// file de synchronisation hors-ligne avec elles.
export function groupScWrites(ecritures = []) {
  const paquets = new Map();
  for (const e of ecritures) {
    const cle = `${e.student.id}_${e.seq}`;
    if (!paquets.has(cle)) paquets.set(cle, { student: e.student, seq: e.seq, scores: {} });
    paquets.get(cle).scores[e.subjectId] = e.valeur;
  }
  return [...paquets.values()];
}
