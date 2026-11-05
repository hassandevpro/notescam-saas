// IMPORT D'UN REGISTRE DE SERVICE — critères d'acceptation, un par un
//
// Ce qui se vérifie ici, c'est surtout ce que le module REFUSE : rattacher un
// homonyme au hasard, accepter un export pour un modèle, réécrire un paiement
// déjà importé, ou laisser les totaux dériver.
//
// Lancer : node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_serviceImportEngine.test.mjs
import {
  ENTETES_MODELE, genererModele, estUnExport, lireImport, resoudreMois, resoudreClasse,
  planifierImport, nouveauLot, dateReprise, lignesAReimporter, MESSAGE_EXPORT,
} from './serviceImportEngine.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const annee = '2026-2027';
const mois = [
  { period_key: '2026-09', label: 'Septembre 2026' }, { period_key: '2026-10', label: 'Octobre 2026' },
  { period_key: '2026-11', label: 'Novembre 2026' }, { period_key: '2026-12', label: 'Décembre 2026' },
  { period_key: '2027-01', label: 'Janvier 2027' },
];
const classes = ['FORM1', 'FORM2', '5eme', 'CE1 BIL', 'Class 1 A', 'NURSERY 1 A', 'PRE-MATERNELLE A']
  .map((name, i) => ({ id: `c${i}`, name }));
const service = { id: 'svc', name: 'Cantine', amount: 15000 };

// ── 1. LE MODÈLE ───────────────────────────────────────────────────────────
console.log('\n— Modèle —');
const feuilles = genererModele({ service, annee, classes, mois });
ok(feuilles.map((f) => f.name).join() === 'Import,Instructions,Listes', 'trois feuilles : Import, Instructions, Listes');
ok(feuilles[0].rows[0].join('|') === ENTETES_MODELE.join('|'), 'en-tête fixe en ligne 1, sans titre décoratif');
ok(feuilles[0].rows.length === 3, 'deux lignes d\'exemple, aucune ligne Total', feuilles[0].rows.length);
ok(feuilles[0].rows.slice(1).every((r) => /^EXEMPLE/.test(r[2])), 'exemples marqués à supprimer');
ok(feuilles[2].rows.map((r) => r[0]).includes('PRE-MATERNELLE A'), 'Listes porte les noms exacts de classes');
const relu = lireImport(feuilles[0].rows);
ok(!relu.ok && relu.ignorees.length === 2 && /exemple/.test(relu.erreur), 'le modèle resté vide est refusé : exemples ignorés, rien d\'importé', relu);

// ── 2. UN EXPORT EST REFUSÉ, AVEC LA BONNE PHRASE ──────────────────────────
console.log('\n— Export refusé —');
const exportMois = [
  ['Service', 'Cantine'], ['Année', '2026-2027'], ['Novembre 2026', 'Novembre 2026'], ['Exporté le', '2026-11-03'], [],
  ['N°', 'Élève', 'Matricule', 'Classe', 'Section', 'Dû (XAF)', 'Payé (XAF)', 'Reste (XAF)', 'État'],
  [1, 'DUPONT MARIE', 'M1', 'FORM1', 'EN', 15000, 15000, '', 'Payé'],
  [], ['', 'Total du mois', '', '', '', 15000, 15000, '', ''],
];
ok(estUnExport(exportMois), 'l\'export du mois est reconnu comme export');
const r = lireImport(exportMois);
ok(!r.ok && r.estExport && r.erreur === MESSAGE_EXPORT, 'refus avec le message qui renvoie au modèle', r.erreur);
ok(estUnExport([['Service', 'Cantine'], ['Année', '2026']]), 'le seul bloc Service/Année suffit');
ok(!estUnExport(feuilles[0].rows), 'le modèle n\'est pas pris pour un export');
const sansEntete = lireImport([['Nom', 'Montant'], ['A', '1']]);
ok(!sansEntete.ok && /manquante/.test(sansEntete.erreur) && !sansEntete.estExport, 'en-tête non conforme : colonnes manquantes nommées', sansEntete.erreur);

// ── 3. LES MOIS ────────────────────────────────────────────────────────────
console.log('\n— Mois —');
const R = (t) => resoudreMois(t, { mois, annee }).cle;
ok(R('novembre 2026') === '2026-11' && R('Nov 2026') === '2026-11' && R('2026-11') === '2026-11' && R('11/2026') === '2026-11', 'quatre écritures du même mois');
ok(R('Novembre 2026') === '2026-11', 'le libellé exact du service');
ok(R('janvier') === '2027-01' && R('octobre') === '2026-10', 'sans année : déduite de l\'année scolaire (sept-déc = 1re année)');
ok(R('juin 2027') === null && /n'est pas un mois/.test(resoudreMois('juin 2027', { mois, annee }).raison), 'mois hors service refusé avec raison');
ok(R('blabla') === null && R('') === null, 'texte inconnu ou vide refusé');
ok(R('46327') === '2026-11' || R('46327') === '2026-10' || R('46327') === null, 'une date Excel ne fait pas planter');

// ── 4. LES CLASSES ET LEURS ALIAS ──────────────────────────────────────────
console.log('\n— Classes —');
const C = (t, al) => resoudreClasse(t, classes, al).classe?.name || null;
ok(C('Form 1') === 'FORM1' && C('Form1') === 'FORM1' && C('F1') === 'FORM1' && C('form1 ') === 'FORM1', 'Form 1 / Form1 / F1 → FORM1');
ok(C('5ème') === '5eme' && C('5EME') === '5eme', '5ème → 5eme');
ok(C('CE1/BIL') === 'CE1 BIL' && C('ce1 bil') === 'CE1 BIL', 'CE1/BIL → CE1 BIL');
ok(C('Class1A') === 'Class 1 A' && C('Nursery 1A') === 'NURSERY 1 A' && C('PRE MATERNELLE A') === 'PRE-MATERNELLE A', 'formes compactées');
ok(C('Terminale X') === null, 'classe inconnue : pas de devinette');
ok(C('CM2', { CM2: 'FORM2' }) === 'FORM2', 'alias défini par l\'administrateur');
const ambig = resoudreClasse('F1', [{ id: 'a', name: 'FORM1' }, { id: 'b', name: 'FORM 1' }]);
ok(ambig.classe === null, 'deux classes pour une même forme compacte : aucune n\'est choisie', ambig);

// ── 5. UN FICHIER DE 95 ÉLÈVES × 2 MOIS ────────────────────────────────────
console.log('\n— 95 élèves, 2 mois —');
const eleves = [];
for (let i = 1; i <= 95; i++) {
  eleves.push({ id: `s${i}`, name: `ELEVE${String.fromCharCode(65 + (i % 26))}${i} PRENOM${i}`, className: classes[i % 4].name, matricule: i <= 50 ? `MAT${i}` : '' });
}
// Deux homonymes parfaits, dans la même classe : indiscernables par le nom.
eleves.push({ id: 'h1', name: 'HAMZAH ABDOU', className: 'FORM1', matricule: '' });
eleves.push({ id: 'h2', name: 'HAMZAH ABDOU', className: 'FORM1', matricule: '' });
// Deux homonymes de classes différentes : la classe les départage.
eleves.push({ id: 'k1', name: 'KAMGA JEAN', className: 'FORM1', matricule: '' });
eleves.push({ id: 'k2', name: 'KAMGA JEAN', className: '5eme', matricule: '' });

const rows = [[...ENTETES_MODELE]];
let attenduDu = 0; let attenduPaye = 0;
for (let i = 1; i <= 95; i++) {
  const e = eleves[i - 1];
  [['Octobre 2026', 15000], ['Novembre 2026', 15000]].forEach(([m, du], k) => {
    const paye = (i + k) % 3 === 0 ? 0 : (i % 2 ? du : 7500);
    // Variantes d'écriture : espaces, casse, ordre nom/prénom, classe abrégée.
    const nom = i % 5 === 0 ? `  ${e.name.split(' ').reverse().join('  ').toLowerCase()} ` : e.name;
    const classe = e.className === 'FORM1' ? (i % 2 ? 'Form1' : 'F1') : (e.className === '5eme' ? '5ème' : e.className);
    rows.push([m, e.matricule, nom, classe, '', 'Cantine', du, paye]);
    attenduDu += du; attenduPaye += paye;
  });
}
const lu = lireImport(rows);
ok(lu.ok && lu.lignes.length === 190 && lu.rejets.length === 0, '190 lignes lues, aucune rejetée à la lecture', [lu.lignes?.length, lu.rejets?.length]);

const plan1 = planifierImport({ lignes: lu.lignes, eleves, classes, mois, annee, service });
ok(plan1.resume.rapprochees === 190, '190 lignes rapprochées', plan1.resume);
ok(plan1.resume.nouvelles === 190 && plan1.resume.abonnementsACreer === 95, '190 nouvelles échéances, 95 abonnements à créer', plan1.resume);
ok(plan1.resume.totalDu === attenduDu, `total dû du plan = total du fichier (${attenduDu})`, plan1.resume.totalDu);
ok(plan1.resume.totalPayeFichier === attenduPaye && plan1.resume.totalAEcrire === attenduPaye, `total payé du plan = total du fichier (${attenduPaye})`, plan1.resume);
ok(plan1.retenues.filter((x) => x.passe === 'matricule').length === 100, 'les 50 premiers élèves sont pris par matricule', plan1.resume);

// ── 6. IDEMPOTENCE : RÉIMPORTER LE MÊME FICHIER ────────────────────────────
console.log('\n— Réimport —');
const abonnements = plan1.retenues.map((x) => ({ id: `ab-${x.student_id}`, student_id: x.student_id, status: 'active' }))
  .filter((a, i, t) => t.findIndex((b) => b.id === a.id) === i);
const echeances = plan1.retenues.map((x, i) => ({ id: `e${i}`, student_id: x.student_id, period_key: x.period_key, amount_due: x.du, status: 'due' }));
const versees = new Map(plan1.retenues.map((x, i) => [`e${i}`, x.versement]));
const plan2 = planifierImport({
  lignes: lu.lignes, eleves, classes, mois, annee, service, abonnements, echeances,
  payeDe: (id) => versees.get(id) || 0,
});
ok(plan2.resume.identiques === 190 && plan2.resume.totalAEcrire === 0, 'même fichier : 190 identiques, 0 franc à écrire', plan2.resume);
ok(plan2.resume.nouvelles === 0 && plan2.resume.abonnementsACreer === 0, 'aucun abonnement ni échéance recréés');

// La base a déjà plus payé que le fichier : on ne retire rien en silence.
const plusPaye = planifierImport({
  lignes: lu.lignes.slice(0, 1), eleves, classes, mois, annee, service,
  abonnements, echeances, payeDe: () => 15000,
});
ok(plusPaye.rejets[0]?.etat === 'deja_plus' || plusPaye.resume.identiques === 1, 'payé en base > fichier : rejeté, jamais retiré', plusPaye.rejets);
// Le fichier ajoute un paiement : seul l'écart part.
const complement = planifierImport({
  lignes: [{ ...lu.lignes[0], paye: 15000 }], eleves, classes, mois, annee, service,
  abonnements, echeances, payeDe: () => 5000,
});
ok(complement.retenues[0]?.versement === 10000 && complement.retenues[0].statut === 'maj', 'mise à jour : seul l\'écart (10 000) est à écrire', complement.retenues[0]);
// Dû divergent
const duDiff = planifierImport({
  lignes: [{ ...lu.lignes[0], du: 20000, paye: 0 }], eleves, classes, mois, annee, service,
  abonnements, echeances, payeDe: () => 0,
});
ok(duDiff.rejets[0]?.etat === 'du_different', 'dû différent de la base : rejeté avec les deux valeurs', duDiff.rejets);

// ── 7. HOMONYMES ET REJETS ─────────────────────────────────────────────────
console.log('\n— Ambiguïtés et rejets —');
const L = (o) => ({ ligne: 2, moisTexte: 'Novembre 2026', matricule: '', nom: '', classeTexte: '', section: '', serviceTexte: '', du: 15000, paye: 0, ...o });
const edge = planifierImport({
  eleves, classes, mois, annee, service,
  lignes: [
    L({ ligne: 2, nom: 'HAMZAH ABDOU', classeTexte: 'FORM1' }),             // deux candidats, même classe
    L({ ligne: 3, nom: 'abdou hamzah' }),                                    // idem, ordre inversé
    L({ ligne: 4, nom: 'Kamga  Jean', classeTexte: '5ème' }),                // la classe tranche
    L({ ligne: 5, nom: 'KAMGA JEAN' }),                                      // sans classe : ambigu
    L({ ligne: 6, nom: 'INCONNU Zoé' }),                                     // absent
    L({ ligne: 7, nom: 'ELEVEB1 PRENOM1', classeTexte: 'Terminale X' }),     // classe inconnue
    L({ ligne: 8, matricule: 'ZZZ', nom: 'ELEVEB1 PRENOM1' }),               // matricule inconnu
    L({ ligne: 9, nom: 'ELEVEB1 PRENOM1', moisTexte: 'juin 2027' }),         // mois hors service
    L({ ligne: 10, nom: 'ELEVEB1 PRENOM1', serviceTexte: 'Transport' }),     // autre service
    L({ ligne: 11, matricule: 'MAT1', nom: 'peu importe' }),                 // matricule prioritaire
  ],
});
ok(edge.ambigus.length === 3, 'homonymes : 3 lignes mises de côté (2 HAMZAH + KAMGA sans classe)', edge.ambigus.map((a) => a.ligne));
ok(edge.retenues.map((x) => x.student_id).sort().join() === 's1,k2'.split(',').sort().join(), 'la classe tranche KAMGA → 5eme ; le matricule prime sur un nom différent', edge.retenues.map((x) => x.student_id));
ok(edge.ambigus.every((a) => a.candidats.length >= 2), 'chaque ambigu liste ses candidats');
const etats = Object.fromEntries(edge.rejets.map((x) => [x.ligne, x.etat]));
ok(etats[6] === 'absent' && etats[7] === 'classe' && etats[8] === 'matricule' && etats[9] === 'mois' && etats[10] === 'service',
  'absent / classe / matricule / mois / service : chacun rejeté pour la bonne raison', etats);

// ── 8. VALIDATIONS DE LECTURE ──────────────────────────────────────────────
console.log('\n— Validations —');
const v = lireImport([[...ENTETES_MODELE],
  ['Novembre 2026', '', 'A', '', '', '', '15 000', '20000'],     // payé > dû
  ['Novembre 2026', '', 'B', '', '', '', '-5', '0'],             // négatif
  ['Novembre 2026', '', 'C', '', '', '', 'abc', '0'],            // texte
  ['Novembre 2026', '', 'D', '', '', '', '15000', ''],           // payé manquant
  ['Novembre 2026', '', 'E', '', '', '', '15000 XAF', '0'],      // devise collée
  ['', '', 'Total', '', '', '', 30000, 0],                        // ligne Total
  ['Novembre 2026', '', 'F', '', '', '', '15000', '1500.50'],    // décimales
]);
ok(v.rejets.length === 5, 'cinq lignes invalides détectées', v.rejets.map((x) => x.ligne));
ok(v.rejets.find((x) => x.ligne === 2)?.erreurs[0].colonne === 'Montant payé', 'ligne n°, colonne et message précis', v.rejets[0]);
ok(v.lignes.length === 1 && v.lignes[0].du === 15000, '« 15000 XAF » lu comme 15000', v.lignes);
ok(v.ignorees.some((x) => /Total/.test(x.raison)), 'ligne Total ignorée, pas comptée');

// ── 9. LOT, DATE, RAPPORT ──────────────────────────────────────────────────
console.log('\n— Lot et rapport —');
ok(/^IMPORT-\d{8}-\d{4}-[0-9A-Z]{3}$/.test(nouveauLot(new Date(2026, 10, 3, 9, 5), () => 0.5)), 'identifiant de lot lisible', nouveauLot());
ok(dateReprise('2026-11') === '2026-11-01' && dateReprise('2026-T1') === null, 'versement de reprise daté du 1er du mois');
const reimp = lignesAReimporter(edge);
ok(reimp[0].join() === ENTETES_MODELE.join() && reimp.length === 1 + 3 + 5, 'le fichier de correction reprend le format du modèle', reimp.length);

console.log(`\n${pass} ok / ${fail} ko`);
process.exit(fail ? 1 : 0);
