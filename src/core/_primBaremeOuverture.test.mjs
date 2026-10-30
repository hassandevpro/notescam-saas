// « MET LEUR BARÈME MAIS ILS PEUVENT MODIFIER QUAND ILS LE VEULENT »
// « ET DÉSACTIVE LES CRITÈRES QU'ILS N'UTILISENT PAS »
//
// LE DÉFAUT, mesuré le 2026-10-29 sur l'édition LAN montée. Une compétence
// ajoutée par l'école n'a aucune ligne dans `prim_bareme_criteres` — table
// NATIONALE, clé (niveau, compétence), sans `school_id`. Ses quatre colonnes
// naissaient donc à zéro, et une colonne à zéro a ses cases DÉSACTIVÉES. Relevé
// à l'écran, compte enseignant, classe CE1, matière « Espagnol » :
//
//     barèmes  : [0, 0, 0, 0]
//     ELEVE PROF 01  [—, —, —, —]   (les quatre cases inactives)
//
// Il fallait deviner qu'on tape d'abord un chiffre dans la petite case du
// barème, en en-tête, avant que l'écran ne serve à quelque chose.
//
// ── LE BARÈME N'EST PAS INVENTÉ ─────────────────────────────────────────────
//
// Sept bulletins réels de THE GENIUS (2025/2026) montrent qu'il n'est pas une
// constante nationale, et que l'école s'écarte du MINEDUB quand elle le juge
// bon : le national donne 1A=30 en CE1, GENIUS écrit 40. D'où l'ordre « ce que
// l'école fait déjà », puis « le gabarit officiel du niveau », puis 20.
//
// CE QUE CES TESTS PROTÈGENT SURTOUT : qu'on ne touche JAMAIS au barème d'une
// compétence que le référentiel connaît déjà, et qu'on n'ouvre JAMAIS les
// quatre colonnes d'office — une matière évaluée sur une seule épreuve ne doit
// pas réclamer quatre notes par élève.
import { readFileSync } from 'node:fs';
import { baremeOuverture, totalNationalModal, baremeEnVigueur } from './primColumnBareme.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

const QUATRE = ['oral', 'ecrit', 'pratique', 'savoir_etre'];

// Le vrai contenu de `prim_bareme_criteres`, relevé dans la base le 2026-10-29.
// SIL : six compétences sur douze totalisent 20 — c'est le gabarit modal.
const NATIONAL = [
  ...[['1a', 20, 15, 0, 5], ['1b', 20, 15, 0, 5]].flatMap(([c, o, e, p, s]) =>
    [['oral', o], ['ecrit', e], ['pratique', p], ['savoir_etre', s]]
      .filter(([, v]) => v > 0)
      .map(([crit, v]) => ({ niveau_id: 'sil', competence_id: c, critere_id: crit, points_max: v, aptitude: 'apte' }))),
  ...[['1c', 10, 5, 3, 2], ['2a', 5, 20, 0, 5], ['2b', 5, 5, 15, 5],
    ['3a', 3, 3, 10, 4], ['3b', 5, 5, 8, 2], ['4a', 5, 3, 10, 2],
    ['5a', 3, 3, 10, 4], ['6a', 3, 3, 10, 4], ['6b', 4, 3, 10, 3]].flatMap(([c, o, e, p, s]) =>
    [['oral', o], ['ecrit', e], ['pratique', p], ['savoir_etre', s]]
      .filter(([, v]) => v > 0)
      .map(([crit, v]) => ({ niveau_id: 'sil', competence_id: c, critere_id: crit, points_max: v, aptitude: 'apte' }))),
];

titre('le gabarit officiel du niveau, relu et non devine');
{
  // sil : 1a=40, 1b=40, 2a=30, 2b=30, et 1c/3a/3b/4a/5a/6a/6b = 20 → 20 l'emporte.
  ok(totalNationalModal(NATIONAL, 'sil') === 20, 'SIL → 20, le total le plus frequent',
    totalNationalModal(NATIONAL, 'sil'));
  ok(totalNationalModal(NATIONAL, 'ce1') === null, 'un niveau absent de la table ne rend rien',
    totalNationalModal(NATIONAL, 'ce1'));
  ok(totalNationalModal([], 'sil') === null, 'referentiel vide → rien, pas un zero');
  ok(totalNationalModal(null, 'sil') === null, 'referentiel non charge → rien');
}

titre('une competence NATIONALE n est jamais touchee');
{
  // 1A en SIL : oral 20, ecrit 15, savoir_etre 5. Le referentiel a parle.
  const officiel = (id) => ({ oral: 20, ecrit: 15, savoir_etre: 5, pratique: 0 })[id] || 0;
  const r = baremeOuverture({
    critereIds: QUATRE, officielPour: officiel, baremesEcole: () => [40, 40],
    baremeCriteres: NATIONAL, niveauSlug: 'sil',
  });
  ok(Object.keys(r).length === 0, 'aucune proposition : on ne discute pas le MINEDUB', r);
}

titre('une competence AJOUTEE PAR L ECOLE s ouvre sur ce que l ecole fait deja');
{
  // GENIUS CE1 : ses matieres sont sur 40, 40, 40, 30, 30, 20, 20, 20, 20, 20, 20.
  // Le mode est 20 — et le CHINOIS du bulletin reel est bien sur 20.
  const r = baremeOuverture({
    critereIds: QUATRE, officielPour: () => 0,
    baremesEcole: () => [40, 40, 40, 30, 30, 20, 20, 20, 20, 20, 20],
    baremeCriteres: NATIONAL, niveauSlug: 'sil',
  });
  ok(r.ecrit === 20, 'le barème le plus fréquent de l école l emporte', r);
  ok(Object.keys(r).length === 1, 'et UNE seule colonne s ouvre', Object.keys(r));
  ok(r.oral === undefined && r.pratique === undefined && r.savoir_etre === undefined,
    'Oral, Pratique et Savoir-etre restent fermes — « desactive les criteres qu ils n utilisent pas »', r);
}
{
  // Une ecole qui met tout sur /50 (CLASS V : English 1/2 50, French 50, General I/II 50).
  const r = baremeOuverture({
    critereIds: QUATRE, officielPour: () => 0, baremesEcole: () => [50, 50, 50, 70, 30, 20, 20],
    baremeCriteres: NATIONAL, niveauSlug: 'sil',
  });
  ok(r.ecrit === 50, 'une ecole sur /50 ouvre sur /50, pas sur 20', r);
}
{
  // A egalite, le PLUS GRAND : un bareme plus large ne refuse aucune note deja
  // saisie, l'inverse si (c'est tout l'objet de `notesHorsBareme`).
  const r = baremeOuverture({
    critereIds: QUATRE, officielPour: () => 0, baremesEcole: () => [20, 40],
    baremeCriteres: NATIONAL, niveauSlug: 'sil',
  });
  ok(r.ecrit === 40, 'a egalite, le plus large — il ne refuse aucune note existante', r);
}

titre('et quand l ecole n a encore rien pose');
{
  const r = baremeOuverture({
    critereIds: QUATRE, officielPour: () => 0, baremesEcole: () => [],
    baremeCriteres: NATIONAL, niveauSlug: 'sil',
  });
  ok(r.ecrit === 20, 'le gabarit officiel du niveau prend le relais', r);
}
{
  const r = baremeOuverture({
    critereIds: QUATRE, officielPour: () => 0, baremesEcole: () => [],
    baremeCriteres: [], niveauSlug: 'sil',
  });
  ok(r.ecrit === 20, 'referentiel non charge → 20, l echelle du carnet primaire', r);
}

titre('les cas ou il ne faut rien proposer du tout');
{
  ok(Object.keys(baremeOuverture({
    critereIds: ['oral', 'pratique'], officielPour: () => 0, baremesEcole: () => [20],
    baremeCriteres: NATIONAL, niveauSlug: 'sil',
  })).length === 0, 'pas de colonne « Ecrit » affichee → rien a ouvrir');
  ok(Object.keys(baremeOuverture({
    critereIds: [], officielPour: () => 0, baremesEcole: () => [20],
    baremeCriteres: NATIONAL, niveauSlug: 'sil',
  })).length === 0, 'aucun critere → rien');
  ok(Object.keys(baremeOuverture({
    critereIds: QUATRE, officielPour: () => 0, baremesEcole: () => [0, -5, NaN, null],
    baremeCriteres: [], niveauSlug: 'sil',
  })).length === 1, 'des valeurs d ecole inutilisables ne font pas echouer la proposition');
}

titre('le bareme pose se relit comme n importe quel autre');
{
  // Ce que le produit fait du barème une fois posé : `setBareme` écrit une ligne
  // par élève, `baremeEnVigueur` la relit. Une proposition n'est donc pas un
  // statut à part — elle devient un barème d'école ordinaire.
  ok(baremeEnVigueur([{ note: null, points_max: 20 }], 0, undefined) === 20,
    'une colonne ouverte a 20 vaut bien 20, meme sans aucune note');
  ok(baremeEnVigueur([], 0, undefined) === 0,
    'une colonne jamais ouverte vaut toujours 0 — donc fermee');
  ok(baremeEnVigueur([{ note: null, points_max: null }], 0, undefined) === 0,
    'une colonne REFERMEE par l ecole (points_max NULL) reste fermee');
  ok(baremeEnVigueur([{ note: null, points_max: 20 }], 0, 50) === 20,
    'et ce qui est ecrit l emporte sur une saisie en cours');
}

// ── LE CÂBLAGE ──────────────────────────────────────────────────────────────
titre('l ecran de saisie primaire s en sert vraiment');
{
  const src = readFileSync(new URL('../components/grades/PrimCompetenceWorkspace.jsx', import.meta.url), 'utf8');
  ok(/baremeOuverture\(/.test(src), 'il appelle baremeOuverture');
  ok(/setBareme\(critereId, valeur\)/.test(src),
    'et il pose le bareme par setBareme — meme chemin que la frappe de l enseignant, '
    + 'donc meme refus si une note le depasse, et meme persistance pour toute la colonne');
  ok(/const neufs = Object\.entries\(aOuvrir\)\.filter/.test(src)
    && /!classStudents\s*\n?\s*\.some\(\(stu\) => primNotes\[primNkey\(stu\.id, competenceId, critereId, ua\)\]\)/.test(src),
    'on n ouvre QUE ce qui n a aucune ligne — une colonne refermee par l ecole le reste');
  ok(/const criteresActifs = criteres\.filter\(\(c\) => baremeFor\(c\.id\) > 0\);/.test(src),
    'une colonne existe quand elle a un bareme');
  ok(/const criteresFermes = criteres\.filter\(\(c\) => baremeFor\(c\.id\) <= 0\);/.test(src),
    'et les autres sont nommees pour pouvoir etre rouvertes');
  // « à définir » ne doit plus être RENDU — il subsiste en commentaire, pour
  // expliquer ce qui a disparu et pourquoi.
  ok(!/t\('à définir'/.test(src),
    'le reperage « a definir » n est plus affiche : plus aucune colonne vide au tableau');
  ok(/onClick=\{\(\) => ouvrirColonne\(c\.id\)\}/.test(src),
    'la porte de reouverture existe — « desactiver » n est pas « supprimer »');
  // Les colonnes RENDUES et la navigation clavier doivent compter pareil, sinon
  // une flèche saute dans le vide.
  ok(/const cr = criteresActifs\[col\];/.test(src) && /cols: criteresActifs\.length/.test(src),
    'la navigation clavier suit les colonnes reellement affichees');
  // Cinq endroits consomment les colonnes : export/import Excel, en-tête
  // téléphone, liste téléphone, en-tête du tableau, cellules du tableau. Un
  // seul oublié et l'export porterait des colonnes que l'écran n'affiche pas.
  ok((src.match(/criteresActifs\.map\(/g) || []).length === 5,
    'les cinq rendus (Excel, entete tel., liste tel., entete tableau, cellules) sont alignes',
    (src.match(/criteresActifs\.map\(/g) || []).length);
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\nECHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
