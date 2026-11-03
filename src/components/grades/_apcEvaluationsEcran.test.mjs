// L'ÉCRAN DE SAISIE DU PREMIER CYCLE PORTE-T-IL VRAIMENT LES ÉVALUATIONS ?
//
// Banc de CÂBLAGE : il lit le texte des fichiers. Le moteur est éprouvé seul
// (`src/core/_apcEvaluations.test.mjs`) ; ce qui peut encore échouer ici, c'est
// un fil : une grille restée sur les compétences, une moyenne qui ignore la
// seconde évaluation, un export dont les deux colonnes portent le même en-tête.
//
// Consigne du 2026-11-01, point par point :
//
//   « Garder "Trimestre 1/2/3" comme sélecteur principal, ajouter des colonnes
//     d'évaluation numérotées (Éval. 1, Éval. 2, Éval. 3), chacune portant le
//     nom de la compétence évaluée. […] Pour une matière à une compétence, les
//     deux colonnes portent le même nom de compétence. […] Si une seule des
//     deux est saisie, afficher la note provisoire sans calculer la moyenne
//     définitive, avec un indicateur. […] Les moyennes de matière et de
//     trimestre, le classement et les statistiques de classe doivent utiliser
//     cette note de trimestre. […] Respecter les verrous de période existants. »
//
//   node src/components/grades/_apcEvaluationsEcran.test.mjs
import { readFileSync } from 'node:fs';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

const lire = (c) => readFileSync(new URL(c, import.meta.url), 'utf8');
const ECRAN   = lire('./ApcCompetenceWorkspace.jsx');
const BULLE   = lire('../../lib/apcBulletinDoc.js');
const MOTEUR  = lire('../../core/apcEvaluations.js');
const DB      = lire('../../../server/db.js');
const SQL     = lire('../../../supabase_apc_evaluations.sql');

titre('le trimestre reste le selecteur principal');
{
  ok(/Trimestre', 'Term'\)\}<\/span>/.test(ECRAN) || /\{t\('Trimestre', 'Term'\)\}/.test(ECRAN),
    'le selecteur « Trimestre » est toujours la');
  ok(!/\{t\('Séquence', 'Sequence'\)\}/.test(ECRAN),
    'et AUCUN selecteur de sequence n est revenu (decision du 2026-10-03, commit 1f3d066)');
}

titre('la grille affiche des EVALUATIONS, plus des competences');
{
  ok(/colonnes\.map\(\(col\) => \(/.test(ECRAN), 'l en-tete itere sur les colonnes d evaluation');
  ok(/colonnes\.map\(\(col, ci\) => \{/.test(ECRAN), 'les cellules aussi');
  ok(/\{t\('Éval\.', 'Assess\.'\)\} \{col\.rang\}/.test(ECRAN), 'chaque colonne est NUMEROTEE');
  ok(/\{col\.competence\.intitule\}/.test(ECRAN),
    'et porte le NOM DE LA COMPETENCE evaluee — « pour que l enseignant n ait pas besoin d explication »');
  ok(/cols: colonnes\.length/.test(ECRAN), 'la navigation au clavier couvre toutes les colonnes');
}

titre('une colonne = une CASE en base (competence + sequence)');
{
  ok(/const cleEval = \(competenceId, sequenceId\)/.test(ECRAN),
    'l identifiant de colonne porte la competence ET la sequence');
  ok(/function decoupeEval\(col, sequenceParDefaut\)/.test(ECRAN), 'et se redecoupe a l ecriture');
  ok(/if \(i < 0\) return \{ competenceId: s, seqId: sequenceParDefaut \};/.test(ECRAN),
    'un identifiant de competence NU reste accepte : tout ce qui a ete saisi avant reste lisible');
  ok(/sequenceId: seqId,/.test(ECRAN), 'la note part sur la sequence de SA colonne');
  ok(/const \{ competenceId, seqId \} = decoupeEval\(col, sequenceId\);/.test(ECRAN),
    'l ecriture passe par le decoupage, elle ne devine pas');
}

titre('LA MOYENNE DE L ECRAN EST CELLE DU BULLETIN');
{
  // C'est le point qui fait la valeur de tout le reste : si l'écran moyennait
  // autrement, l'enseignant verrait une note et le parent une autre.
  ok(/moyenneEvaluations\(/.test(ECRAN), 'l ecran appelle la regle partagee');
  ok(/moyenneEvaluations\(/.test(BULLE), 'le bulletin appelle la MEME');
  ok(/export function moyenneEvaluations/.test(MOTEUR), 'et elle n existe qu une fois');
  ok(/colonnes\.filter\(\(x\) => x\.competence\.id === c\.id\)\.map\(\(x\) => recordFor\(eleveId, x\.id\)\)/.test(ECRAN),
    'une competence evaluee deux fois compte pour la MOYENNE de ses deux notes, pas pour la derniere saisie');
  ok(/matiereAverage\(notes, competencesAffichees\)/.test(ECRAN),
    'puis la regle de matiere, INCHANGEE — la consigne dit de ne pas y toucher');
}

titre('L INDICATEUR de saisie partielle');
{
  ok(/indicateurSaisie\(etat, \{ en: getLang\(\) === 'en' \}\)/.test(ECRAN), 'l indicateur est affiche');
  ok(/etat\.provisoire \? 'text-amber-700' : 'text-gray-700'/.test(ECRAN),
    'la note provisoire est distinguee a l oeil, pas seulement en texte');
  ok(/\{etat\.provisoire \? '—' : cote\.code\}/.test(ECRAN),
    'et la COTE n est pas annoncee tant que la moyenne est provisoire — une cote est un jugement, il attend la note definitive');
  ok(/La moyenne du trimestre sera recalculée quand toutes les évaluations seront saisies/.test(ECRAN),
    'une infobulle dit ce qui va se passer');
  ok(/`\$\{e\.saisies\}\/\$\{e\.attendues\}`/.test(ECRAN),
    'le classeur exporte aussi l etat de saisie (sinon l information meurt a l export)');
}

titre('l export ne produit pas deux colonnes identiques');
{
  ok(/\$\{t\('Éval\.', 'Assess\.'\)\} \$\{col\.rang\} — \$\{col\.competence\.intitule\} \/\$\{baremeFor\(col\.id\)\}/.test(ECRAN),
    'l en-tete exporte porte le numero, l intitule ET le bareme');
  ok(/columns=\{colonnes\.map/.test(ECRAN), 'les colonnes exportees sont les evaluations');
  const mobile = ECRAN.slice(ECRAN.indexOf('<MobileEntryList'));
  ok(/code: `\$\{t\('Éval\.', 'Assess\.'\)\} \$\{col\.rang\}`/.test(mobile),
    'le telephone numerote aussi ses champs');
}

titre('le bareme est celui de CHAQUE evaluation');
{
  ok(/const baremeFor = \(col\) => \{/.test(ECRAN), 'le bareme se lit par colonne');
  ok(/onCommit=\{\(n\) => setBareme\(col\.id, n\)\}/.test(ECRAN), 'et se change par colonne');
  // La même compétence peut être notée /3 puis /20 : le bulletin sait moyenner
  // deux barèmes différents par les proportions.
  ok(/moyenne des PROPORTIONS/.test(MOTEUR), 'deux baremes differents se moyennent par les proportions');
}

titre('les verrous de periode sont respectes');
{
  ok(/disabled=\{locked\}/.test(ECRAN), 'une periode verrouillee ferme les cellules');
  ok(/isSequenceLocked\(schoolId, classId, sequence\)/.test(ECRAN),
    'le verrou est lu la ou il vit (lib/lockService), il n est pas redefini ici');
  ok(/\(role === 'admin' \|\| role === 'censeur'\)/.test(ECRAN),
    'et le nombre d evaluations ne se change qu a la direction — un enseignant qui le bougerait deplacerait les colonnes de ses collegues');
}

titre('le nombre d evaluations : deduit, configurable, PLAFONNE');
{
  ok(/configEvaluationsPour\(school\?\.apc_evaluations, classeSlug, matiereId\)/.test(ECRAN),
    'la configuration de l ecole est lue');
  ok(/ecrireConfigEvaluations\(/.test(ECRAN) && /updateSchool\(\{ apc_evaluations: json \}\)/.test(ECRAN),
    'et ecrite sur l ecole');
  ok(/capaciteEvaluations\(competences\.length, sequencesDuTrimestre\.length\)/.test(ECRAN),
    'le choix est borne par la CAPACITE : au-dela, une colonne ecraserait une autre case');
  ok(/nombreEvaluationsParDefaut\(competences\.length, sequencesDuTrimestre\.length\)/.test(ECRAN),
    'et la valeur deduite est signalee comme « par defaut »');
}

titre('la colonne de reglage est declaree des deux cotes de la synchro');
{
  ok(/ensureColumn\('schools',\s+'apc_evaluations', 'apc_evaluations TEXT'\);/.test(DB),
    'LAN : la colonne est creee au demarrage');
  ok(/ADD COLUMN IF NOT EXISTS apc_evaluations text;/.test(SQL), 'Cloud : la migration existe');
  ok(/ORDRE D'EXÉCUTION — ce fichier D'ABORD/.test(SQL),
    'et elle rappelle l ordre : une colonne inconnue du Cloud fait rejeter TOUTE la ligne (PGRST204)');
}

titre('ce que les notes deja saisies deviennent');
{
  ok(/notesHorsColonnes/.test(ECRAN),
    'les notes qu aucune colonne ne couvre sont DENOMBREES, pas oubliees');
  ok(/comptent toujours dans la moyenne du bulletin/.test(ECRAN),
    'et l ecran dit qu elles pesent toujours au bulletin');
  ok(!/du temps où l'écran le permettait/.test(ECRAN),
    'l ancien message (« saisies sur une autre sequence ») a disparu : la seconde sequence est de nouveau saisissable');
}

titre('le bulletin montre les deux notes ET leur moyenne');
{
  ok(/const evalDetailHtml = \(c, sys\) => \{/.test(BULLE), 'le detail des evaluations est rendu');
  ok(/if \(!c\.evaluations \|\| c\.evaluations\.length < 2\) return '';/.test(BULLE),
    'seulement quand il y a plusieurs evaluations — sinon on repeterait la note sous son propre intitule');
  ok(/evaluations: evaluations\.length > 1 \? evaluations : null,/.test(BULLE),
    'et l assembleur ne les transporte que dans ce cas');
  // L'INTENTION EST INCHANGÉE : le détail vit DANS la cellule de la compétence,
  // il n'ajoute aucune colonne. La FORME a changé le 2026-11-02 : l'intitulé est
  // désormais enveloppé dans un div borné à deux lignes (clamp), et le détail
  // reste EN DEHORS de ce div — un chiffre ne se tronque pas.
  ok(/<div style="\$\{CLAMP2\}">\$\{esc\(c\.intitule\)\}<\/div>\$\{evalDetailHtml\(c, sys\)\}/.test(BULLE),
    'le detail suit l intitule, dans la MEME cellule : aucune colonne ajoutee');
  ok(/e\.max === APC_DEFAULT_MAX \? fix2\(e\.note\) : `\$\{fix2\(e\.note\)\}\/\$\{fix2\(e\.max\)\}`/.test(BULLE),
    'une evaluation hors bareme par defaut affiche son denominateur');

  // ── LE BUDGET D'UNE PAGE A4 — mesure, pas preference ────────────────────
  // Chaque detail ajoute des lignes. Sur une matiere a 4 competences toutes
  // evaluees deux fois, le banc d'impression passe de 3 pages a 4 et rompt le
  // contrat « une feuille = une page » (I27/D28). Le detail est donc reserve
  // aux matieres de 1 ou 2 competences : exactement le cas demande, et il
  // tient a pleine taille.
  ok(/if \(c\.nbCompetencesMatiere > 2\) return '';/.test(BULLE),
    'le detail est reserve aux matieres de 1 ou 2 competences');
  ok(/nbCompetencesMatiere: comps\.length,/.test(BULLE),
    'l assembleur porte le nombre de competences de la matiere jusqu au rendu');
  const BANC = lire('../../../scripts/test-print.mjs');
  ok(/\[14, 4\], \[14, 1\]/.test(BANC),
    'et le banc d impression mesure le cas demande a pleine taille : 14 matieres a UNE competence');

  // L'ECRAN ET LE PAPIER sont deux rendus des MEMES donnees : s'ils divergent,
  // le parent lit deux bulletins.
  const ECRAN_BUL = lire('../bulletins/BulletinApcOfficial.jsx');
  ok(/c\.evaluations\?\.length > 1 && c\.nbCompetencesMatiere <= 2/.test(ECRAN_BUL),
    'le bulletin a l ecran porte le meme detail, sous la MEME condition que le papier');
}
console.log(`\n${echecs === 0 ? 'TOUS LES CONTROLES PASSENT' : `${echecs} ECHEC(S)`}`);
process.exit(echecs === 0 ? 0 : 1);
