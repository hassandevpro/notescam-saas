// LE MODÈLE DU CARNET PAPIER DE THE GENIUS — une ligne par ÉPREUVE.
//
// Les sept bulletins photographiés (SIL, CE1, CM1, CLASS I, CLASS III, CLASS V,
// Class 2/CP — relevés le 2026-10-29) portent les colonnes
//
//     COMPETENCES | L.U. / U.A. | Bar. | Mark / Note | Grade / Cote
//
// une ligne par épreuve passée, puis un bandeau par regroupement officiel avec
// « Total », « Moyenne » ET « Cote ».
//
// ── CE QUI EST VÉRIFIÉ, ET POURQUOI C'EST VÉRIFIABLE ───────────────────────
// Le pied du bulletin de CLASS V dit « Total 380 / 430 », et les barèmes
// imprimés sur ses onze lignes sont 20, 50, 50, 50, 70, 30, 50, 50, 20, 20, 20
// — somme 430. Le dénominateur du document EST donc la somme des barèmes des
// épreuves, ce qui permet d'éprouver la lecture au lieu de la supposer.
//
// Lancer : node src/core/_primCarnetEpreuves.test.mjs
import { lignesParEpreuve, groupesDe, buildCompactRows } from './primCompactRows.js';
import { criteresDeSecours } from './primEngine.js';
import { avecFamilleDeduite } from './refClassScope.js';

let failed = false;
const ok = (cond, msg, extra) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}${cond || extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`);
  if (!cond) failed = true;
};

const COLS = [
  { id: 'oral', nom: 'Oral' }, { id: 'ecrit', nom: 'Écrite' },
  { id: 'pratique', nom: 'Pratique' }, { id: 'savoir_etre', nom: 'Savoir-être' },
];

// ── UNE LIGNE PAR ÉPREUVE PASSÉE, DANS L'ORDRE DU RÉFÉRENTIEL ──────────────
{
  // Le cas exact du carnet de CM1 : « 5- TIC » y occupe DEUX lignes,
  // Pratique /10 puis Écrite /20.
  const rows = [{
    code: '5A', intitule: 'TIC', cote: 'A',
    parCritere: {
      ecrit: { note: 18, max: 20 },
      pratique: { note: 9, max: 10 },
      oral: null,
      savoir_etre: null,
    },
  }];
  const [tic] = lignesParEpreuve(rows, COLS);
  ok(tic.epreuves.length === 2, 'TIC : deux épreuves, pas quatre lignes vides', tic.epreuves.length);
  ok(tic.epreuves.map((e) => e.nom).join('|') === 'Écrite|Pratique',
    'l’ordre est celui du référentiel (Écrit avant Pratique), pas celui de la saisie',
    tic.epreuves.map((e) => e.nom));
  ok(tic.epreuves[0].max === 20 && tic.epreuves[0].note === 18,
    'chaque épreuve porte SON barème — la colonne « Bar. » du carnet');
  ok(tic.code === '5A' && tic.cote === 'A',
    'la ligne garde son code et sa cote : le gabarit les fusionne sur les deux lignes');
}

// ── UNE COMPÉTENCE SANS AUCUNE NOTE GARDE SA LIGNE ────────────────────────
// Règle du responsable : « je ne veux pas voir une seule matière cochée dans
// une classe qui ne soit dans le bulletin ou à la saisie des notes. »
{
  const rows = [{ code: 'CH', intitule: 'Chinois', cote: null, parCritere: {} }];
  const [ch] = lignesParEpreuve(rows, COLS);
  ok(ch !== undefined, 'une matière jamais notée reste une ligne du bulletin');
  ok(ch.epreuves.length === 0, 'elle n’annonce aucune épreuve — le gabarit y écrit « — »');
}

// ── UNE NOTE DE ZÉRO N'EST PAS UNE ABSENCE DE NOTE ────────────────────────
{
  const rows = [{ code: '1A', intitule: 'Français', cote: 'NA',
    parCritere: { ecrit: { note: 0, max: 40 } } }];
  const [fr] = lignesParEpreuve(rows, COLS);
  ok(fr.epreuves.length === 1 && fr.epreuves[0].note === 0,
    'un zéro réellement attribué garde sa ligne et sa valeur', fr.epreuves);
}

// ── ENTRÉES VIDES ─────────────────────────────────────────────────────────
{
  ok(lignesParEpreuve([], COLS).length === 0, 'aucune ligne ⇒ rien');
  ok(lignesParEpreuve(null, null).length === 0, 'entrées nulles ⇒ rien');
  const [sansCol] = lignesParEpreuve([{ code: 'X', parCritere: { ecrit: { note: 5, max: 10 } } }], []);
  ok(sansCol.epreuves.length === 0, 'sans colonne de critère, aucune épreuve n’est inventée');
}

// ── LE DÉNOMINATEUR DU CARNET EST LA SOMME DES BARÈMES (CLASS V) ──────────
{
  // Les onze lignes du bulletin de CLASS V, avec leurs barèmes imprimés.
  const BAREMES = [20, 50, 50, 50, 70, 30, 50, 50, 20, 20, 20];
  const compRows = BAREMES.map((max, i) => ({
    code: `S${i}`, intitule: `Matière ${i}`, domaine: null,
    criteres: [{ id: 'ecrit', nom: 'Écrite', points_max: max }],
    uas: [{ ua: 1, notesByCritere: { ecrit: max }, baremes: { ecrit: max }, achieved: max, possible: max, cote: 'A+' }],
    totalAchieved: max, totalPossible: max, totalCote: 'A+',
  }));
  const { rows, overall } = buildCompactRows(compRows);
  ok(overall.possible === 430,
    'somme des barèmes du carnet de CLASS V = 430, le dénominateur imprimé', overall.possible);
  const lignes = lignesParEpreuve(rows, COLS);
  ok(lignes.length === 11 && lignes.every((l) => l.epreuves.length === 1),
    'onze matières, onze lignes, une épreuve chacune',
    { lignes: lignes.length });
}

// ── LE BANDEAU DE REGROUPEMENT PORTE AUSSI SA COTE ────────────────────────
{
  const BAREME = [
    { cote: 'A+', libelle: 'Très bien acquis', seuil_min: 90 },
    { cote: 'A', libelle: 'Acquis', seuil_min: 70 },
    { cote: 'ECA', libelle: 'En cours', seuil_min: 50 },
    { cote: 'NA', libelle: 'Non acquis', seuil_min: 0 },
  ];
  const rows = [
    { code: '1A', intitule: 'Français', domaine: 'langues', achieved: 36, possible: 40, cote: 'A' },
    { code: '1B', intitule: 'English', domaine: 'langues', achieved: 18, possible: 40, cote: 'NA' },
  ];
  const [g] = groupesDe(rows, 'FR', BAREME);
  ok(g.achieved === 54 && g.possible === 80, 'le total du groupe est la somme de ses lignes', g);
  ok(g.moyenne === 13.5, 'la moyenne du groupe est ramenée sur 20', g.moyenne);
  // 54/80 = 67,5 % → sous le seuil 70 de « A », donc ECA.
  ok(g.cote === 'ECA', 'la cote du groupe sort du barème de l’école, pas d’une table à part', g.cote);

  // SANS barème fourni — les deux appels existants — le champ reste null et
  // aucun bulletin déjà livré ne change.
  const [sansBareme] = groupesDe(rows, 'FR');
  ok(sansBareme.cote === null, 'sans barème passé, pas de cote : zéro régression', sansBareme.cote);
  ok(sansBareme.achieved === 54 && sansBareme.moyenne === 13.5,
    'et le total comme la moyenne restent ceux d’avant');
}

// ── LE BARÈME D'UNE COMPÉTENCE D'ÉCOLE SE LIT SUR LES NOTES ───────────────
// `prim_bareme_criteres` est NATIONALE : 38 compétences d'école chez THE GENIUS,
// 0 barème (mesuré en production le 2026-10-29). Sans ce repli, une note
// réellement saisie n'apparaissait sur aucun bulletin.
{
  const CRITERES = [
    { id: 'oral', nom: 'Oral', ordre: 1 }, { id: 'ecrit', nom: 'Écrit', ordre: 2 },
    { id: 'pratique', nom: 'Pratique', ordre: 3 }, { id: 'savoir_etre', nom: 'Savoir-être', ordre: 4 },
  ];
  const notes = { ecrit: [{ note: 44, points_max: 50 }], pratique: [{ note: 8, points_max: 10 }] };
  const trouves = criteresDeSecours(CRITERES, (id) => notes[id] || []);
  ok(trouves.length === 2, 'seules les colonnes réellement saisies deviennent des épreuves', trouves.length);
  ok(trouves[0].id === 'ecrit' && trouves[0].points_max === 50,
    'le barème vient de la NOTE (points_max), jamais d’une constante', trouves[0]);
  ok(trouves[1].id === 'pratique' && trouves[1].points_max === 10,
    'une seconde épreuve garde son propre barème', trouves[1]);

  ok(criteresDeSecours(CRITERES, () => []).length === 0,
    'aucune note ⇒ aucune épreuve annoncée : le bulletin ne promet pas une épreuve qui n’a pas eu lieu');
  ok(criteresDeSecours(CRITERES, (id) => (id === 'ecrit' ? [{ note: 12, points_max: 0 }] : [])).length === 0,
    'un barème à zéro n’ouvre pas de colonne — il ferait diviser par zéro plus loin');
  ok(criteresDeSecours(null, null).length === 0, 'entrées nulles ⇒ rien');
}

// ── UNE COMPÉTENCE D'ÉCOLE REJOINT LA FAMILLE DE CELLE QU'ELLE DOUBLE ─────
// Mesuré en production : 38 compétences d'école, `domaine` NULL pour toutes.
// Sans famille, elles s'imprimaient sous aucun des six bandeaux officiels.
{
  const NAT = [
    { id: '1a', code: '1A', intitule: 'Communiquer en français', domaine: 'langues' },
    { id: '1b', code: '1B', intitule: 'Communicate in English', domaine: 'langues' },
    { id: '2a', code: '2A', intitule: 'Utiliser les notions de base en mathématiques', domaine: 'maths_sciences' },
    { id: '6b', code: '6B', intitule: 'Pratiquer les activités artistiques', domaine: 'arts_sport' },
  ];
  const MAISONS = [
    { id: 'ge:english', code: 'EN', intitule: 'English', domaine: null, school_id: 'ge' },
    { id: 'ge:maths', code: 'MA2', intitule: 'Mathematics', domaine: null, school_id: 'ge' },
    { id: 'ge:music', code: 'MU', intitule: 'Music', domaine: null, school_id: 'ge' },
    { id: 'ge:chinois', code: 'CH', intitule: 'Chinois', domaine: null, school_id: 'ge' },
  ];
  const out = avecFamilleDeduite([...NAT, ...MAISONS]);
  const par = Object.fromEntries(out.map((c) => [c.id, c.domaine]));
  ok(par['ge:english'] === 'langues', 'English rejoint la famille 1 (langues)', par['ge:english']);
  ok(par['ge:maths'] === 'maths_sciences', 'Mathematics rejoint la famille 2', par['ge:maths']);
  ok(par['ge:music'] === 'arts_sport', 'Music rejoint la famille 6', par['ge:music']);
  ok(par['ge:chinois'] == null,
    'Chinois ne tombe sur aucune nationale : il reste SANS famille, pas rangé de force',
    par['ge:chinois']);
  ok(par['1a'] === 'langues' && par['2a'] === 'maths_sciences',
    'les compétences nationales ne sont pas touchées');

  // Un domaine réellement choisi par l'école fait foi.
  const pose = avecFamilleDeduite([...NAT,
    { id: 'ge:en2', code: 'EN2', intitule: 'English', domaine: 'tic', school_id: 'ge' }]);
  ok(pose.find((c) => c.id === 'ge:en2').domaine === 'tic',
    'un domaine posé par l’école n’est jamais écrasé');

  // Et une fois la famille connue, la ligne entre dans le bon regroupement.
  const rows = [
    { code: '1A', intitule: 'Français', domaine: 'langues', achieved: 36, possible: 40, cote: 'A' },
    { code: 'EN', intitule: 'English', domaine: par['ge:english'], achieved: 45, possible: 50, cote: 'A' },
  ];
  const groupes = groupesDe(rows, 'FR');
  ok(groupes.length === 1, 'les deux lignes ne forment plus qu’UN regroupement', groupes.length);
  ok(groupes[0].achieved === 81, 'et son total les compte toutes les deux', groupes[0].achieved);
}

console.log(failed ? '\n❌ ÉCHEC' : '\n✅ tout passe');
process.exit(failed ? 1 : 0);
