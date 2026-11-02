// PLUSIEURS ÉVALUATIONS D'UNE COMPÉTENCE DANS LE TRIMESTRE
//
// Consigne du 2026-11-01, reprise cas par cas :
//
//   « 1 compétence → 2 évaluations, note du trimestre = moyenne des deux ;
//     si une seule est saisie, note provisoire + "1 évaluation sur 2 saisie".
//     2 compétences → une évaluation par compétence, règle de calcul ACTUELLE
//     inchangée. 3 compétences → trois évaluations, comportement conservé.
//     Les matières qui ont déjà plusieurs compétences ne changent pas. »
//
// Ce banc garde aussi les deux choses qui peuvent faire perdre des notes :
//   • la CAPACITÉ (n compétences × 2 séquences). Deux colonnes qui désignent la
//     même case, c'est la seconde qui écrase la première — l'incident
//     `prim_notes` du 2026-09-28 ;
//   • la RÈGLE DE MOYENNE, extraite du bulletin et non réécrite : barèmes
//     identiques → moyenne brute, barèmes différents → moyenne des proportions.
//
//   node src/core/_apcEvaluations.test.mjs
import {
  moyenneEvaluations, capaciteEvaluations, nombreEvaluationsParDefaut, nombreEvaluations,
  colonnesEvaluations, etatSaisie, indicateurSaisie,
  cleConfigEvaluations, lireConfigEvaluations, configEvaluationsPour, ecrireConfigEvaluations,
} from './apcEvaluations.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

const C = (id, intitule, ordre) => ({ id, intitule, ordre });
const UNE   = [C('c1', 'Produire un texte', 1)];
const DEUX  = [C('c1', 'Lire', 1), C('c2', 'Écrire', 2)];
const TROIS = [C('c1', 'Lire', 1), C('c2', 'Écrire', 2), C('c3', 'Parler', 3)];
const SEQS  = ['s1', 's2'];           // les deux séquences du trimestre 1

titre('le nombre d evaluations est DEDUIT du nombre de competences');
{
  ok(nombreEvaluationsParDefaut(1) === 2, 'une competence → DEUX evaluations', nombreEvaluationsParDefaut(1));
  ok(nombreEvaluationsParDefaut(2) === 2, 'deux competences → deux evaluations', nombreEvaluationsParDefaut(2));
  ok(nombreEvaluationsParDefaut(3) === 3, 'trois competences → trois evaluations', nombreEvaluationsParDefaut(3));
  ok(nombreEvaluationsParDefaut(5) === 5, 'cinq competences → cinq evaluations (comportement conserve)', nombreEvaluationsParDefaut(5));
  ok(nombreEvaluationsParDefaut(0) === 0, 'aucune competence → rien a saisir');
}

titre('la CAPACITE est une limite dure : n competences x 2 sequences');
{
  ok(capaciteEvaluations(1, 2) === 2, 'une competence, deux sequences → 2 cases');
  ok(capaciteEvaluations(3, 2) === 6, 'trois competences → 6 cases');
  // Une ecole qui demanderait 3 evaluations sur une matiere a UNE competence
  // n aurait que deux cases : la troisieme ecraserait la premiere.
  ok(nombreEvaluations({ nbCompetences: 1, config: 3 }) === 2,
    'une demande au-dela de la capacite est PLAFONNEE (sinon une note en ecrase une autre)',
    nombreEvaluations({ nbCompetences: 1, config: 3 }));
  ok(colonnesEvaluations({ competences: UNE, sequences: SEQS, nombre: 9 }).length === 2,
    'et les colonnes aussi', colonnesEvaluations({ competences: UNE, sequences: SEQS, nombre: 9 }).length);
  // Une seule sequence connue (referentiel incomplet) : une seule case.
  ok(colonnesEvaluations({ competences: UNE, sequences: ['s1'] }).length === 1,
    'avec une seule sequence, une seule colonne — on n invente pas de case');
}

titre('UNE competence : deux colonnes, la MEME competence, deux sequences');
{
  const cols = colonnesEvaluations({ competences: UNE, sequences: SEQS });
  ok(cols.length === 2, 'deux colonnes', cols.length);
  ok(cols[0].competence.id === 'c1' && cols[1].competence.id === 'c1',
    'les deux portent la meme competence — c est ce qui est demande', cols.map((c) => c.competence.id));
  ok(cols[0].sequenceId === 's1' && cols[1].sequenceId === 's2',
    'mais DEUX sequences : deux cases distinctes en base', cols.map((c) => c.sequenceId));
  ok(cols[0].repetitions === 2 && cols[0].repetition === 1 && cols[1].repetition === 2,
    'l ecran sait qu il s agit de la 1re et de la 2e evaluation de cette competence', cols);
}

titre('DEUX competences : une evaluation chacune, dans la premiere sequence');
{
  const cols = colonnesEvaluations({ competences: DEUX, sequences: SEQS });
  ok(cols.length === 2, 'deux colonnes', cols.length);
  ok(cols[0].competence.id === 'c1' && cols[1].competence.id === 'c2',
    'une colonne par competence', cols.map((c) => c.competence.id));
  ok(cols.every((c) => c.sequenceId === 's1'),
    'toutes dans la premiere sequence du trimestre — la ou la saisie ecrit depuis le 2026-10-03',
    cols.map((c) => c.sequenceId));
  ok(cols.every((c) => c.repetitions === 1), 'aucune competence n est repetee');
}

titre('TROIS competences : trois evaluations, comportement conserve');
{
  const cols = colonnesEvaluations({ competences: TROIS, sequences: SEQS });
  ok(cols.length === 3 && cols.map((c) => c.competence.id).join(',') === 'c1,c2,c3',
    'une colonne par competence, dans l ordre officiel', cols.map((c) => c.competence.id));
  ok(cols.every((c) => c.sequenceId === 's1'), 'toutes dans la premiere sequence');
}

titre('la generalisation ne cree aucun cas particulier');
{
  // Deux competences evaluees deux fois chacune : les quatre cases existent.
  const cols = colonnesEvaluations({ competences: DEUX, sequences: SEQS, nombre: 4 });
  ok(cols.length === 4, 'quatre colonnes', cols.length);
  ok(cols.map((c) => `${c.competence.id}/${c.sequenceId}`).join(' ') === 'c1/s1 c2/s1 c1/s2 c2/s2',
    'chaque colonne designe une case DIFFERENTE', cols.map((c) => `${c.competence.id}/${c.sequenceId}`));
  const cases = new Set(cols.map((c) => `${c.competence.id}|${c.sequenceId}`));
  ok(cases.size === cols.length, 'aucune collision : rien ne peut en ecraser une autre');
}

titre('L INDICATEUR : « 1 evaluation sur 2 saisie »');
{
  const cols = colonnesEvaluations({ competences: UNE, sequences: SEQS });
  const magasin = { 'c1|s1': { note: '14', max: 20 } };          // une seule des deux
  const etat = etatSaisie({ colonnes: cols, noteDe: (cid, sid) => magasin[`${cid}|${sid}`] });

  ok(etat.saisies === 1 && etat.attendues === 2, 'une saisie sur deux attendues', etat);
  ok(etat.provisoire === true, 'la note est PROVISOIRE');
  ok(etat.complet === false, 'et le trimestre n est pas complet');
  ok(etat.valeur.note === 14, 'la note provisoire est affichable (14), on ne la cache pas', etat.valeur);
  ok(indicateurSaisie(etat) === '1 évaluation sur 2 saisie', 'la phrase demandee, mot pour mot', indicateurSaisie(etat));
  ok(indicateurSaisie(etat, { en: true }) === '1 of 2 assessments entered', 'et sa traduction', indicateurSaisie(etat, { en: true }));

  magasin['c1|s2'] = { note: '16', max: 20 };
  const complet = etatSaisie({ colonnes: cols, noteDe: (cid, sid) => magasin[`${cid}|${sid}`] });
  ok(complet.complet === true && complet.provisoire === false, 'les deux saisies : la note devient definitive', complet);
  ok(complet.valeur.note === 15, 'et c est la MOYENNE des deux (14 et 16 → 15)', complet.valeur);
  ok(indicateurSaisie(complet) === '', 'plus d indicateur quand tout est saisi');

  const vide = etatSaisie({ colonnes: cols, noteDe: () => null });
  ok(vide.vide && vide.valeur === null && !vide.provisoire,
    'aucune saisie : aucune note, et AUCUN indicateur (on n alerte pas sur une case jamais ouverte)', vide);
}

titre('la regle de moyenne est celle du bulletin, pas une seconde regle');
{
  // Barèmes identiques → moyenne BRUTE, barème conservé.
  const m1 = moyenneEvaluations([{ note: '2', max: 3 }, { note: '3', max: 3 }]);
  ok(m1.note === 2.5 && m1.max === 3, '2/3 et 3/3 → 2.5/3 (l echelle reelle survit)', m1);

  // Barèmes différents → moyenne des PROPORTIONS, exprimée sur /20.
  const m2 = moyenneEvaluations([{ note: '2', max: 3 }, { note: '14', max: 20 }]);
  const attendu = Math.round(((2 / 3 + 14 / 20) / 2) * 20 * 100) / 100;
  ok(m2.note === attendu && m2.max === 20, `2/3 et 14/20 → ${attendu}/20 (jamais une addition brute)`, m2);

  ok(moyenneEvaluations([null, { note: '12' }]).note === 12,
    'une case vide ne compte pas pour zero', moyenneEvaluations([null, { note: '12' }]));
  ok(moyenneEvaluations([]) === null && moyenneEvaluations(null) === null, 'rien de saisi → null');
  ok(moyenneEvaluations([{ note: '0', max: 20 }]).note === 0, 'un ZERO saisi est une note, pas une absence');
}

titre('la regle de moyenne est bien la MEME que celle du bulletin');
{
  // On relit la formule du bulletin dans son fichier : si quelqu un la modifie
  // d un cote sans l autre, ce banc tombe. C est tout l objet de l extraction.
  const { readFileSync } = await import('node:fs');
  const doc = readFileSync(new URL('../lib/apcBulletinDoc.js', import.meta.url), 'utf8');
  ok(/moyenneEvaluations/.test(doc), 'le bulletin appelle la fonction extraite, il n en garde pas une copie');
  ok(!/evals\.reduce\(\(a, v\) => a \+ v\.note, 0\)/.test(doc),
    'l ancienne formule recopiee a bien disparu du bulletin');
}

titre('configurable par matiere, et seulement en exception');
{
  ok(cleConfigEvaluations('6e', 'francais') === '6e|francais', 'la cle porte la classe ET la matiere');
  ok(configEvaluationsPour(null, '6e', 'francais') === null, 'sans configuration : on deduit');
  ok(configEvaluationsPour('{"6e|francais":3}', '6e', 'francais') === 3, 'une exception se lit', configEvaluationsPour('{"6e|francais":3}', '6e', 'francais'));
  ok(configEvaluationsPour('{"6e|francais":3}', '3e', 'francais') === null,
    'et ne vaut que pour SA classe — une matiere peut demander 2 en 6e et 3 en 3e');
  ok(configEvaluationsPour('pas du json', '6e', 'francais') === null, 'une valeur illisible ne casse rien');
  ok(Object.keys(lireConfigEvaluations(null)).length === 0, 'aucune ecole n a rien a configurer par defaut');

  // Écriture : une exception qui vaut la règle est RETIRÉE, pas enregistrée.
  const avec = ecrireConfigEvaluations(null, '6e', 'francais', 3, { nbCompetences: 2 });
  ok(JSON.parse(avec)['6e|francais'] === 3, 'trois evaluations pour deux competences : exception gardee', avec);
  const sans = ecrireConfigEvaluations(avec, '6e', 'francais', 2, { nbCompetences: 2 });
  ok(sans === null, 'revenir a la deduction EFFACE la cle (une liste qui enfle cache ce qu elle contient)', sans);
  const plafonne = ecrireConfigEvaluations(null, '6e', 'francais', 9, { nbCompetences: 1 });
  ok(JSON.parse(plafonne)['6e|francais'] === 2, 'et l ecriture plafonne a la capacite', plafonne);
}

titre('aucune entree ne fait tomber le module');
{
  ok(colonnesEvaluations().length === 0, 'aucun argument');
  ok(colonnesEvaluations({ competences: null, sequences: null }).length === 0, 'des listes nulles');
  ok(colonnesEvaluations({ competences: [null], sequences: [null] }).length === 0, 'des listes de rien');
  ok(etatSaisie().attendues === 0, 'un etat sans colonnes');
  ok(indicateurSaisie(null) === '', 'un etat nul');
}

console.log(`\n${echecs === 0 ? 'TOUS LES CONTROLES PASSENT' : `${echecs} ECHEC(S)`}`);
process.exit(echecs === 0 ? 0 : 1);
