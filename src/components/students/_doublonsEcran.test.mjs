// L'ÉCRAN DES DOUBLONS EST-IL VRAIMENT BRANCHÉ ?
//
// Banc de CÂBLAGE : il lit le texte des fichiers, parce que le défaut qu'on
// cherche à empêcher n'est pas une erreur de calcul mais un fil débranché — un
// moteur corrigé que l'écran n'appelle plus, ou un ancien appel resté en place
// qui redonne l'ancien comportement.
//
// Ce qu'il garde, point par point, de la consigne du 2026-11-01 :
//
//   « Alerte, jamais blocage : la secrétaire peut toujours confirmer que ce
//     sont deux élèves différents, et cette décision est mémorisée. »
//   « Détection à la création/import avec un message clair et le choix
//     "Ce n'est pas un doublon" ou "Voir la fiche existante". »
//   « Un scan de toute la base […] exportable. »
//
//   node src/components/students/_doublonsEcran.test.mjs
import { readFileSync } from 'node:fs';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

const lire = (chemin) => readFileSync(new URL(chemin, import.meta.url), 'utf8');
const ECRAN   = lire('../../pages/Students.jsx');
const PANNEAU = lire('./DoublonsPanel.jsx');
const STORE   = lire('../../store/schoolStore.js');
const MOTEUR  = lire('../../core/doublonsEleves.js');
const ADAPT   = lire('../../lib/studentDuplicate.js');

titre('l ecran appelle le NOUVEAU moteur, et plus l ancien chemin');
{
  ok(/from '\.\.\/core\/doublonsEleves'/.test(ECRAN), 'Students.jsx importe le moteur');
  ok(/doublonsPourCandidat\(\{ \.\.\.form, id: editing\?\.id \?\? null \}, registre\)/.test(ECRAN),
    'il interroge le moteur avec le formulaire en cours, fiche exclue d elle-meme');
  ok(/\[\.\.\.students, \.\.\.archivedStudents\]/.test(ECRAN),
    'les eleves ARCHIVES sont dans le registre compare (c est la que nait le doublon)');
  ok(!/duplicateWarning/.test(ECRAN),
    'l avertissement par NOM SEUL a disparu — c etait le bruit que le responsable a signale');
  ok(!/checkDuplicate|DUP\./.test(ECRAN), 'et l ancien verdict a deux niveaux aussi');
}

titre('ALERTE, JAMAIS BLOCAGE');
{
  // Plus un seul window.alert / window.confirm sur le chemin du doublon : une
  // boite systeme ne peut pas porter trois sorties, ni expliquer pourquoi.
  const bloc = ECRAN.slice(ECRAN.indexOf('const handleSave = async'), ECRAN.indexOf('// 2) Photo'));
  ok(!/window\.confirm/.test(bloc), 'handleSave ne pose plus de window.confirm');
  ok(/setAlerteDoublon\(\{ form, photo, candidats/.test(bloc),
    'il met l enregistrement EN ATTENTE, en gardant le formulaire et la photo');
  ok(/<AlerteDoublon/.test(ECRAN), 'l alerte est un vrai dialogue');
  ok(/onConfirmer=\{async \(\) =>/.test(ECRAN) && /enregistrer\(form, photo, \{ confirme: candidats \}\)/.test(ECRAN),
    'repondre « ce n est pas un doublon » REPREND la saisie, sans la perdre');
  ok(/onAnnuler=\{\(\) => setAlerteDoublon\(null\)\}/.test(ECRAN), 'annuler ne fait rien d autre que fermer');
}

titre('les deux choix demandes, mot pour mot');
{
  ok(/Ce n.est pas un doublon/.test(PANNEAU), '« Ce n’est pas un doublon » est propose');
  ok(/Voir la fiche existante/.test(PANNEAU), '« Voir la fiche existante » aussi');
  ok(/Not a duplicate/.test(PANNEAU) && /Open the existing record/.test(PANNEAU),
    'les deux sont traduits (les ecoles anglophones ouvrent le meme ecran)');
  ok(/phraseAlerte\(c, \{ en \}\)/.test(PANNEAU),
    'le message dit POURQUOI la fiche est signalee, il n est pas generique');
  ok(/onOuvrir\(eleve\)/.test(PANNEAU), 'la fiche existante s ouvre depuis l alerte');
  ok(/setEditing\(eleve\)/.test(ECRAN), 'et l ecran ouvre bien cette fiche-la');
}

titre('la decision est MEMORISEE, des deux cotes');
{
  ok(/marquerPaireNonDoublon/.test(ECRAN), 'l ecran enregistre la decision');
  ok(/marquerPaireNonDoublon: async \(idA, idB\)/.test(STORE), 'le store porte l action');
  ok(/for \(const patch of marquerNonDoublon\(a, b\)\)/.test(STORE),
    'il applique les DEUX correctifs rendus par le moteur');
  ok(/non_doublons/.test(MOTEUR), 'la colonne est lue et ecrite par le moteur');
  // L'ordre compte : la paire designe un identifiant, qui n'existe qu'apres la
  // creation de la fiche.
  const i = ECRAN.indexOf('const rec = await addStudent');
  const j = ECRAN.indexOf('for (const c of confirme) await marquerPaireNonDoublon');
  ok(i > 0 && j > i, 'la paire est ecrite APRES la creation (avant, la fiche n a pas d id)', [i, j]);
}

titre('le garde d import n annule pas la decision de l ecran');
{
  ok(/doublonConfirme/.test(ADAPT), 'l adaptateur accepte une confirmation deja donnee');
  ok(/const \{ doublonConfirme, \.\.\.studentData \} = donnees \|\| \{\};/.test(STORE),
    'et le drapeau est RETIRE de la ligne : une colonne inconnue du Cloud ferait rejeter toute la fiche');
  const apres = STORE.slice(STORE.indexOf('const { doublonConfirme, ...studentData }'));
  ok(!/sanitizeStudent\(donnees\)/.test(apres), 'la ligne ecrite ne repart jamais des donnees brutes');
}

titre('le scan de toute la base, et son fichier');
{
  ok(/<ScanDoublons/.test(ECRAN), 'le scan est accessible depuis l ecran');
  ok(/\{t\('Doublons', 'Duplicates'\)\}/.test(ECRAN), 'un bouton le nomme');
  ok(/eleves=\{\[\.\.\.students, \.\.\.archivedStudents\]\}/.test(ECRAN),
    'il balaie les actifs ET les archives, toutes classes confondues');
  ok(/detecterDoublons\(eleves, \{ inclureFratrie: true \}\)/.test(PANNEAU),
    'il demande aussi les fratries, pour les afficher comme information');
  ok(/downloadExcel\(/.test(ECRAN) && /lignesExport\(resultat, \{ classes, t \}\)/.test(ECRAN),
    'et le rapport s exporte en tableur');
  ok(/useMemo\(\(\) => detecterDoublons/.test(PANNEAU),
    'le scan ne se relance pas a chaque frappe (700 eleves, c est un calcul)');
  ok(/sans date/.test(PANNEAU) && /sans lieu de naissance/.test(PANNEAU),
    'l ecran dit combien de fiches n ont pas de quoi etre comparees — sinon « aucun doublon » se lit a tort comme une garantie');
}

titre('aucun blocage ne subsiste cote ecran');
{
  // Le seul refus restant est celui du store, et il ne concerne QUE la meme
  // saisie exacte (meme matricule, ou nom + date + lieu identiques) : un rejeu
  // d import. Tout le reste s affiche et se confirme.
  ok(/estMemeFiche/.test(ADAPT), 'le garde ne refuse que « la meme fiche »');
  ok(/level: DUP\.WARN,\s+\/\/ jamais BLOCK/.test(ADAPT),
    'l adaptateur ne rend plus jamais BLOCK a l ecran');
}

console.log(`\n${echecs === 0 ? 'TOUS LES CONTROLES PASSENT' : `${echecs} ECHEC(S)`}`);
process.exit(echecs === 0 ? 0 : 1);
