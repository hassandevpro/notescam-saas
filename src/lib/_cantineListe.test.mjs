// Tests — LA LISTE DES ABONNÉS, COMPARÉE AU JEU D'ESSAI CHAMP PAR CHAMP.
//
//   node src/lib/_cantineListe.test.mjs
//
// CE QUE CECI VERROUILLE. La règle des quatre états (`Rien dû`, `À jour`,
// `Partiel`, `Impayé`) vivait dans un `useMemo` de `src/pages/Cantine.jsx`.
// Déplacée dans le moteur, elle doit rendre EXACTEMENT les mêmes valeurs — et
// « exactement » se prouve, il ne s'affirme pas.
//
// Le juge est `docs/refonte-registre-services/registre-services.fixture.json`,
// produit par `scripts/export-registre-services.mjs`. On ne compare pas la
// nouvelle fonction à elle-même : on reconstruit la grille depuis les ENTRÉES
// brutes (fee_schedule_items, fee_payments) et on exige l'égalité avec les
// dérivées livrées au développeur front. Si l'une des deux bouge sans l'autre,
// ce test tombe.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  grilleCantine, etatsMensuels, moisDuService, tarifPleinDe,
  etatAbonne, listeAbonnes, filtrerAbonnes, trierAbonnes, ETATS_ABONNE,
  projeterSurPeriode,
} from './cantineEngine.js';

const here = dirname(fileURLToPath(import.meta.url));
const lire = (nom) => JSON.parse(readFileSync(
  join(here, '..', '..', 'docs', 'refonte-registre-services', nom), 'utf8'));

const fixture = lire('registre-services.fixture.json');
const volume = lire('registre-services.volume.json');

let failed = false;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) failed = true; };

// ── On refait le chemin de la page, depuis les entrées brutes ──────────────
const { service_affiche, catalogue, eleves, abonnements, echeances, paiements } = fixture.entrees;
const service = catalogue.find((c) => c.id === service_affiche);
const annee = service.academic_year;

const mois = moisDuService(service, annee);
const tarifPlein = tarifPleinDe(service);

const idsAbo = new Set(abonnements.filter((a) => a.fee_catalog_id === service.id).map((a) => a.id));
const echeancesDuService = echeances.filter((l) => idsAbo.has(l.student_fee_item_id));

const elevesGrille = eleves.map((e) => ({
  id: e.id, name: e.name, className: e.class_name, matricule: e.matricule,
}));
const tarifParEleve = Object.fromEntries(abonnements
  .filter((a) => a.fee_catalog_id === service.id && a.status !== 'removed' && a.amount > 0)
  .map((a) => [a.student_id, a.amount]));

const grille = grilleCantine({
  eleves: elevesGrille, echeances: echeancesDuService, paiements,
  mois, tarifPlein, tarifParEleve,
});

ok(mois.length === fixture.derivees.mois.length
  && mois.every((m, i) => m === fixture.derivees.mois[i]),
  `les ${mois.length} périodes sont celles du jeu d’essai`);

// ── 1. La grille reconstruite == la grille livrée, champ par champ ─────────
const attendue = fixture.derivees.grille;
let ecartsGrille = 0;
let cellulesComparees = 0;
for (let i = 0; i < Math.max(grille.length, attendue.length); i++) {
  const a = grille[i], b = attendue[i];
  if (!a || !b) { ecartsGrille++; continue; }
  for (const champ of ['student_id', 'name', 'className', 'matricule', 'du', 'paye', 'reste']) {
    if (a[champ] !== b[champ]) {
      ecartsGrille++;
      console.log(`   ↳ ligne ${i} champ ${champ} : ${a[champ]} ≠ ${b[champ]}`);
    }
  }
  for (let j = 0; j < Math.max(a.cellules.length, b.cellules.length); j++) {
    const ca = a.cellules[j], cb = b.cellules[j];
    if (!ca || !cb) { ecartsGrille++; continue; }
    cellulesComparees++;
    for (const champ of ['period_key', 'echeance_id', 'convention', 'statut',
      'montantDu', 'paye', 'reste', 'texte']) {
      if (ca[champ] !== cb[champ]) {
        ecartsGrille++;
        console.log(`   ↳ ligne ${i} case ${ca.period_key} champ ${champ} : ${ca[champ]} ≠ ${cb[champ]}`);
      }
    }
  }
}
ok(ecartsGrille === 0,
  `la grille reconstruite est identique aux dérivées (${grille.length} lignes, ${cellulesComparees} cases)`);

// ── 2. `listeAbonnes` == la liste livrée (statut, moisCrees) ───────────────
const sections = Object.fromEntries(eleves.map((e) => [e.id, e.cycle || 'autre']));
const liste = trierAbonnes(listeAbonnes({ grille, sections }), 'nom');
const listeAttendue = fixture.derivees.abonnes;

let ecartsListe = 0;
for (let i = 0; i < Math.max(liste.length, listeAttendue.length); i++) {
  const a = liste[i], b = listeAttendue[i];
  if (!a || !b) { ecartsListe++; continue; }
  for (const champ of ['student_id', 'name', 'statut', 'moisCrees', 'du', 'paye', 'reste']) {
    if (a[champ] !== b[champ]) {
      ecartsListe++;
      console.log(`   ↳ ${a.name} champ ${champ} : ${a[champ]} ≠ ${b[champ]}`);
    }
  }
}
ok(ecartsListe === 0, `la liste des abonnés est identique aux dérivées (${liste.length} lignes)`);

// ── 3. Les quatre états sont tous représentés, et dans le bon ordre de test ─
const vus = new Set(liste.map((a) => a.statut));
ok(ETATS_ABONNE.every((e) => vus.has(e)),
  `les 4 états sont présents dans le jeu d’essai (${[...vus].sort().join(', ')})`);

// L'ordre des tests est la règle : « rien dû » passe AVANT « à jour ». Un
// élève sans dette qui n'a rien versé ne doit pas être annoncé comme à jour.
ok(etatAbonne({ du: 0, paye: 0, reste: 0 }) === 'sans_dette',
  'du = 0 → « Rien dû », et non « À jour »');
ok(etatAbonne({ du: 15000, paye: 15000, reste: 0 }) === 'a_jour', 'soldé → « À jour »');
ok(etatAbonne({ du: 15000, paye: 7000, reste: 8000 }) === 'partiel', 'versé en partie → « Partiel »');
ok(etatAbonne({ du: 15000, paye: 0, reste: 15000 }) === 'impaye', 'rien versé → « Impayé »');
// Une contre-passation ramène le versé à zéro : l'échéance redevient un impayé,
// et surtout pas un « partiel » qui laisserait croire qu'il reste un acompte.
ok(etatAbonne({ du: 15000, paye: 0, reste: 15000 }) === 'impaye',
  'après contre-passation, l’échéance redevient « Impayé »');

// ── 4. Les cas du jeu d'essai sont bien ceux annoncés ──────────────────────
const parNom = Object.fromEntries(liste.map((a) => [a.name, a]));
ok(parNom['HAMADOU BELLO Idrissou']?.statut === 'sans_dette',
  'l’abonné sans aucun mois facturé est « Rien dû » (bouton Encaisser inactif)');
ok(parNom['BIKOI MANGA Thierry']?.statut === 'impaye', 'l’impayé total est « Impayé »');
ok(parNom['FOUDA NKOA Serge']?.statut === 'sans_dette',
  'l’exempté toute l’année ne doit RIEN : exempter n’est pas devoir');
ok(parNom['EYENGA ATANGANA Clarisse']?.statut === 'a_jour',
  'l’abandon de janvier ne crée pas d’impayé sur les mois suivants');
ok(parNom['JIOFACK TCHOUTA Blandine']?.du === 30000
  && parNom['JIOFACK TCHOUTA Blandine']?.paye === 15000,
  'la contre-passation a bien retiré son versement du total payé');
const homonymes = liste.filter((a) => a.name === 'KAMGA NJIKE Christian');
ok(homonymes.length === 2 && homonymes[0].matricule !== homonymes[1].matricule,
  'les deux homonymes ne se départagent que par le matricule');
ok(parNom['NANA SILEYAH Grâce']?.className === '',
  'l’élève sans classe porte une classe vide (l’écran affiche « — »)');
const longName = liste.find((a) => a.name.length >= 38);
ok(!!longName, `un nom d’au moins 38 caractères est présent (${longName?.name.length || 0})`);

// ── 5. Le filtre, commun aux trois onglets ─────────────────────────────────
const classeDe = (id) => eleves.find((e) => e.id === id)?.class_id || '';
ok(filtrerAbonnes(liste, { texte: 'M260102' }).length === 1,
  'la recherche trouve par matricule');
ok(filtrerAbonnes(liste, { texte: 'ce2' }).length >= 1,
  'la recherche trouve par classe, sans respecter la casse');
ok(filtrerAbonnes(liste, { texte: 'kamga' }).length === 2,
  'la recherche par nom rend les deux homonymes');
ok(filtrerAbonnes(liste, { etat: 'impaye' }).every((a) => a.statut === 'impaye'),
  'le filtre par état ne laisse passer que cet état');
ok(filtrerAbonnes(liste, { etat: 'sans_dette' }).length === 2,
  'le filtre « Rien dû » rend les 2 abonnés sans dette');
ok(filtrerAbonnes(liste, { classe: 'c-ce2', classeDe }).length === 1,
  'le filtre par classe passe par la résolution de classe, pas par le libellé');
ok(filtrerAbonnes(liste, {}).length === liste.length,
  'aucun filtre posé → la liste entière');
ok(filtrerAbonnes(liste, { texte: 'ZZZZ' }).length === 0,
  'une recherche sans résultat rend une liste vide, pas la liste entière');

// ── 6. Le tri ──────────────────────────────────────────────────────────────
const parStatut = trierAbonnes(liste, 'statut');
ok(parStatut[0].statut === 'impaye' && parStatut[parStatut.length - 1].statut === 'sans_dette',
  'le tri par état remonte les impayés et renvoie « Rien dû » en bas');
const parReste = trierAbonnes(liste, 'reste');
ok(parReste.every((a, i) => i === 0 || parReste[i - 1].reste >= a.reste),
  'le tri par reste est décroissant');
// Stabilité : deux lignes de même reste doivent sortir dans le même ordre d'un
// affichage à l'autre, sinon la liste bouge sous la main entre deux encaissements.
const a1 = trierAbonnes(liste, 'reste').map((a) => a.student_id).join(',');
const a2 = trierAbonnes([...liste].reverse(), 'reste').map((a) => a.student_id).join(',');
ok(a1 === a2, 'le tri est stable : le nom départage toujours en dernier ressort');

// ── 7. Les totaux suivent le filtre ────────────────────────────────────────
const quotePart = service.quote_part ?? null;
const complet = etatsMensuels({ grille, mois, quotePart });
const filtree = filtrerAbonnes(liste, { etat: 'impaye' });
const partiel = etatsMensuels({ grille: filtree, mois, quotePart });
ok(partiel.total.attendu > 0 && partiel.total.attendu < complet.total.attendu,
  `un filtre posé réduit bien les totaux (${partiel.total.attendu} < ${complet.total.attendu})`);
ok(complet.total.attendu === fixture.derivees.total.attendu
  && complet.total.encaisse === fixture.derivees.total.encaisse
  && complet.total.impaye === fixture.derivees.total.impaye
  && complet.total.quotePart === fixture.derivees.total.quotePart,
  'les totaux non filtrés sont identiques aux dérivées');

// Un mois que l'école ne facture à personne n'est pas un mois à zéro impayé.
const vides = complet.parMois.filter((m) => m.moisSansService);
ok(vides.length > 0 && vides.every((m) => m.impaye === 0),
  `les ${vides.length} mois sans service ne portent aucun impayé`);

// ── 8. Le volume : 320 abonnés ─────────────────────────────────────────────
const gros = listeAbonnes({ grille: volume.grille });
ok(gros.length === 320, `le jeu de volume porte ${gros.length} abonnés`);
let ecartsVolume = 0;
for (let i = 0; i < gros.length; i++) {
  if (gros[i].statut !== volume.abonnes.find((a) => a.student_id === gros[i].student_id)?.statut) {
    ecartsVolume++;
  }
}
ok(ecartsVolume === 0, 'les 320 états du jeu de volume sont identiques aux dérivées');

const t0 = Date.now();
for (let i = 0; i < 20; i++) trierAbonnes(filtrerAbonnes(gros, { texte: 'a' }), 'statut');
const ms = Date.now() - t0;
ok(ms < 2000, `20 filtres + tris sur 320 lignes en ${ms} ms`);

// ── 9. LA LENTILLE D'UN MOIS ───────────────────────────────────────────────
//
// Le défaut que ceci verrouille. Tant qu'une école n'avait facturé que le mois
// courant, le `reste` annuel ÉTAIT le mois courant. THE GENIUS a créé ses dix
// mois d'avance le 2026-11-04 : le même chiffre est devenu le solde annuel, et
// la liste ne répondait plus à « qui n'a pas payé novembre ? ».
const listeNov = trierAbonnes(
  listeAbonnes({ grille, sections, periode: '2026-11' }), 'nom');
const parNomNov = Object.fromEntries(listeNov.map((a) => [a.name, a]));

ok(listeNov.length === liste.length,
  'la lentille ne retire personne de la liste : elle change ce qu’on lit');

// ABENA NGOLO est à jour sur tous ses mois : novembre inclus, elle doit 0.
ok(parNomNov['ABENA NGOLO Pélagie'].du === 15000
  && parNomNov['ABENA NGOLO Pélagie'].reste === 0
  && parNomNov['ABENA NGOLO Pélagie'].statut === 'a_jour',
  'novembre payé → dû 15 000, reste 0, « À jour »');

// BIKOI MANGA ne paie rien : sur l'année il doit 90 000, sur novembre 15 000.
ok(parNom['BIKOI MANGA Thierry'].reste === 90000
  && parNomNov['BIKOI MANGA Thierry'].reste === 15000,
  `le même élève doit 90 000 sur l’année et 15 000 sur novembre`);

// CHOUNA TAGNE a un partiel en OCTOBRE et rien en novembre : la lentille doit
// montrer l'impayé du mois regardé, pas le partiel du mois d'à côté.
const listeOct = listeAbonnes({ grille, sections, periode: '2026-10' });
const chounaOct = listeOct.find((a) => a.name === 'CHOUNA TAGNE Mireille');
ok(chounaOct.du === 15000 && chounaOct.paye === 7000 && chounaOct.reste === 8000
  && chounaOct.statut === 'partiel',
  'octobre partiel → dû 15 000, versé 7 000, reste 8 000, « Partiel »');
ok(parNomNov['CHOUNA TAGNE Mireille'].statut === 'impaye',
  'le même élève est « Impayé » sur novembre : chaque mois se juge seul');

// Un mois EXEMPTÉ ne doit rien. Il ne doit surtout pas sortir en impayé quand
// la secrétaire demande « qui n'a pas payé ».
const exempte = listeNov.find((a) => a.name === 'FOUDA NKOA Serge');
ok(exempte.du === 0 && exempte.statut === 'sans_dette' && exempte.convention === 'exempte',
  'un mois exempté ne doit rien, et se distingue d’un mois non inscrit');

// Un mois ABANDONNÉ non plus — janvier, pour EYENGA ATANGANA.
const abandon = listeAbonnes({ grille, sections, periode: '2027-01' })
  .find((a) => a.name === 'EYENGA ATANGANA Clarisse');
ok(abandon.du === 0 && abandon.statut === 'sans_dette' && abandon.convention === 'abandon',
  'un mois abandonné ne doit rien : ce n’est pas un défaut de paiement');

// Un mois NON INSCRIT (abonnée en novembre : septembre n'existe pas pour elle).
const pasEncore = listeAbonnes({ grille, sections, periode: '2026-09' })
  .find((a) => a.name === 'GWETH NDOUMBE Sandrine');
ok(pasEncore.du === 0 && pasEncore.statut === 'sans_dette'
  && pasEncore.convention === 'non_inscrit',
  'un mois antérieur à l’abonnement ne doit rien');

// DÉCEMBRE n'est facturé à personne dans le jeu d'essai : personne ne doit
// rien, et surtout personne n'apparaît en impayé.
const decembre = listeAbonnes({ grille, sections, periode: '2026-12' });
ok(decembre.every((a) => a.du === 0 && a.statut === 'sans_dette'),
  'un mois sans service ne met personne en défaut');

// « QUI N'A PAS PAYÉ NOVEMBRE » — la question du guichet, en une ligne.
const impayesNov = filtrerAbonnes(listeNov, { etat: 'impaye' });
ok(impayesNov.length > 0 && impayesNov.every((a) => a.reste > 0 && a.paye === 0),
  `« qui n’a pas payé novembre » rend ${impayesNov.length} élèves, tous à zéro versé`);

// La somme réclamable sur le mois : c'est le chiffre que la secrétaire annonce.
const duNov = listeNov.reduce((s, a) => s + a.reste, 0);
const duAn = liste.reduce((s, a) => s + a.reste, 0);
ok(duNov > 0 && duNov < duAn,
  `le reste de novembre (${duNov}) est une part du reste annuel (${duAn})`);

// Sans période, rien ne change : la lentille est une option, pas un détour.
const sansLentille = listeAbonnes({ grille, sections, periode: '' });
ok(sansLentille.every((a, i) => a.du === listeAttendue.find(
  (b) => b.student_id === a.student_id).du),
  'sans période demandée, la liste reste celle de l’année entière');

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ OK');
process.exit(failed ? 1 : 0);
