// « CA DOIT VARIER » — EN FONCTION DU TRAVAIL DE L'ÉLÈVE.
//
// Les cinq champs du bas du carnet (Appréciation, Avertissement conditionnel,
// Tableau d'honneur, Encouragement, Félicitations) sortaient IDENTIQUES pour
// tous les élèves d'une même cote : l'appréciation était le libellé de la cote
// APC (« Enfant Expert »), et « Félicitations » n'était même pas imprimée.
//
// CE QUE CE TEST PROTÈGE SURTOUT, c'est la frontière : ce module PROPOSE, il
// n'écrit pas. Les cas « la proposition ne doit RIEN écraser » sont donc aussi
// nombreux ici que les cas de dérivation — une appréciation écrite par
// l'enseignant ne doit jamais disparaître sous une mention calculée.
import { readFileSync } from 'node:fs';
import {
  SEUILS_CONSEIL, CLES_CONSEIL, propositionsConseil, appreciationProposee,
  valeurAEcrire, valeurSaisie, ecartsConseil, lotConseil,
} from './conseilPropositions.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

// ── 1. L'ÉLÈVE DU CARNET PAPIER ────────────────────────────────────────────
// Class 2/CP de THE GENIUS : 242 + 260 = 502 / 560, moyenne 17,29/20 (86,45 %).
// Le papier porte : Very good · No · Yes · Yes · Yes.
titre('l eleve du carnet papier (17.29/20, classe anglophone)');
{
  const p = propositionsConseil(17.29, 20, { sys: 'EN' });
  ok(p !== null, 'une proposition est rendue');
  ok(p.pct === 86.45, 'pourcentage du bareme', p.pct);
  ok(p.avertissement === 0, 'avertissement conditionnel : No', p.avertissement);
  ok(p.tableauHonneur === true, 'tableau d honneur : Yes', p.tableauHonneur);
  ok(p.encouragement === true, 'encouragement : Yes', p.encouragement);
  ok(p.felicitation === true, 'felicitations : Yes', p.felicitation);
  ok(p.appreciation === 'Excellent', 'appreciation lue sur l echelle anglophone', p.appreciation);
}

// LE PIÈGE DE LA CONVERSION. `enGrade` lit un POURCENTAGE ; le carnet du
// primaire est sur 20. Sans la mise à l'échelle, 17,29 tombait dans « F9 / Fail »
// — l'élève le mieux noté de la classe aurait reçu « Fail » sur son carnet.
titre('le piege de la conversion de bareme');
{
  ok(appreciationProposee(17.29, 20, { sys: 'EN' }) === 'Excellent',
    '17.29/20 anglophone n est PAS un echec');
  ok(appreciationProposee(7, 20, { sys: 'EN' }) === 'Fail',
    'mais 7/20 l est bien', appreciationProposee(7, 20, { sys: 'EN' }));
  ok(appreciationProposee(86.45, 100, { sys: 'EN' }) === 'Excellent',
    'et une classe deja notee sur 100 donne le meme mot');
  // Le barème francophone PAR DÉFAUT du produit est le vocabulaire APC
  // (« Expert », « Acquis »…), pas celui de `frApp`. On interroge donc l'échelle
  // de l'école, jamais une table parallèle — sinon le bas du carnet et le reste
  // du bulletin finiraient par se contredire sur le même élève.
  ok(appreciationProposee(15, 20, { sys: 'FR' }) === 'Acquis',
    'cote francophone : 15/20 lu sur le bareme du produit', appreciationProposee(15, 20, { sys: 'FR' }));
}

// ── 2. ÇA VARIE ────────────────────────────────────────────────────────────
// Le reproche exact : deux élèves de cote différente sortaient le même bas de
// carnet. On vérifie donc qu'une échelle de moyennes rend des lots DISTINCTS.
titre('deux eleves de travail different ne recoivent pas le meme bas de carnet');
{
  const lots = [19, 16.5, 14.5, 12.5, 10.5, 7].map((m) => {
    const p = propositionsConseil(m, 20, { sys: 'FR' });
    return [p.appreciation, p.avertissement, p.tableauHonneur, p.encouragement, p.felicitation].join('|');
  });
  ok(new Set(lots).size === lots.length, 'six moyennes, six bas de carnet differents', lots);
}

titre('chaque seuil tient sur sa borne, et pas un demi-point avant');
{
  const pct = (p) => propositionsConseil(p / 5, 20, { sys: 'FR' });  // p% du /20
  ok(pct(80).felicitation === true && pct(79.9).felicitation === false,
    'felicitations a 80 % exactement (16/20 — borne « Tres Bien » de frApp)');
  ok(pct(70).encouragement === true && pct(69.9).encouragement === false,
    'encouragement a 70 % (14/20 — borne « Bien »)');
  ok(pct(60).tableauHonneur === true && pct(59.9).tableauHonneur === false,
    'tableau d honneur a 60 % (12/20 — borne « Assez Bien »)');
  ok(pct(50).avertissement === 0 && pct(49.9).avertissement === 1,
    'avertissement conditionnel SOUS le seuil de reussite (bareme / 2)');
  ok(SEUILS_CONSEIL.tableauHonneur < SEUILS_CONSEIL.encouragement
    && SEUILS_CONSEIL.encouragement < SEUILS_CONSEIL.felicitation,
    'la hierarchie du carnet : honneur, puis encouragement, puis felicitation');
  const p = propositionsConseil(19, 20, { sys: 'FR' });
  ok(p.tableauHonneur && p.encouragement && p.felicitation,
    'un eleve felicite est aussi au tableau d honneur — comme honor() l ecrit deja');
}

titre('les seuils d une ecole remplacent les notres, ils ne s y ajoutent pas');
{
  const p = propositionsConseil(13, 20, { sys: 'FR', seuils: { felicitation: 60 } });
  ok(p.felicitation === true, 'felicitation abaissee a 60 % : 13/20 y entre', p.felicitation);
  ok(p.encouragement === false, 'et les autres seuils restent ceux du produit', p.encouragement);
}

// ── 3. RIEN POUR UN CARNET VIERGE ──────────────────────────────────────────
// Un bulletin sans note ne doit proposer NI mention NI distinction. C'est le
// défaut déjà relevé sur le carnet CE1 BIL vierge : tant qu'il n'y a pas de
// moyenne, il n'y a rien à annoncer.
titre('un carnet sans note ne propose rien');
{
  ok(propositionsConseil(null, 20) === null, 'moyenne absente');
  ok(propositionsConseil(undefined, 20) === null, 'moyenne indefinie');
  ok(propositionsConseil(12, 0) === null, 'bareme nul (division impossible)');
  ok(propositionsConseil(12, null) === null, 'bareme absent');
  ok(appreciationProposee(null, 20) === '', 'aucune appreciation sans moyenne');
  ok(ecartsConseil(null, {}).length === 0, 'aucun ecart a appliquer');
  ok(Object.keys(lotConseil(null, {})).length === 0, 'aucun champ a ecrire');
}

// ── 4. LA FRONTIÈRE : PROPOSER N'EST PAS ÉCRIRE ────────────────────────────
titre('les conventions d ecriture sont celles que getAbsCond relit');
{
  const p = propositionsConseil(17.29, 20, { sys: 'EN' });
  ok(valeurAEcrire('tableauHonneur', p) === 'true', 'distinction vraie → la chaine « true »');
  ok(valeurAEcrire('felicitation', propositionsConseil(11, 20, { sys: 'FR' })) === 'false',
    'distinction fausse → « false », jamais undefined');
  ok(valeurAEcrire('avertissement', propositionsConseil(8, 20, { sys: 'FR' })) === '1',
    'avertissement → un entier en chaine');
  ok(valeurAEcrire('appreciation', p) === 'Excellent', 'appreciation → la mention telle quelle');
  ok(CLES_CONSEIL.appreciation === '__appreciation__'
    && CLES_CONSEIL.avertissement === '__aver_travail__'
    && CLES_CONSEIL.tableauHonneur === '__th__'
    && CLES_CONSEIL.encouragement === '__encouragement__'
    && CLES_CONSEIL.felicitation === '__felicitation__',
    'et elles se rangent sous les cles que student_absences porte DEJA');
}

titre('une saisie deja conforme ne declenche aucune ecriture');
{
  const p = propositionsConseil(17.29, 20, { sys: 'EN' });
  const dejaLa = {
    __appreciation__: 'Excellent', __aver_travail__: '0',
    __th__: 'true', __encouragement__: 'true', __felicitation__: 'true',
  };
  ok(ecartsConseil(p, dejaLa).length === 0, 'aucun ecart', ecartsConseil(p, dejaLa));
  ok(Object.keys(lotConseil(p, dejaLa)).length === 0, 'et donc aucun champ ecrit');
}

titre('un carnet jamais saisi : tous les ecarts, et rien d autre');
{
  const p = propositionsConseil(17.29, 20, { sys: 'EN' });
  const ecarts = ecartsConseil(p, {});
  // `__aver_travail__` absent se lit « 0 », et la proposition est « 0 » aussi :
  // ce n'est donc PAS un écart. Un élève sans reproche ne doit pas se voir
  // proposer d'écrire un zéro qui y est déjà.
  ok(!ecarts.includes('avertissement'), 'le zero deja implicite n est pas un ecart', ecarts);
  ok(ecarts.includes('tableauHonneur') && ecarts.includes('encouragement')
    && ecarts.includes('felicitation') && ecarts.includes('appreciation'),
    'les quatre autres sont a appliquer', ecarts);
  const lot = lotConseil(p, {});
  ok(lot.__th__ === 'true' && lot.__felicitation__ === 'true' && lot.__appreciation__ === 'Excellent',
    'le lot porte les bonnes valeurs', lot);
  ok(!('__aver_travail__' in lot), 'et pas de champ sans ecart', Object.keys(lot));
}

titre('une appreciation ecrite par l enseignant ne disparait pas sous une mention calculee');
{
  const p = propositionsConseil(17.29, 20, { sys: 'EN' });
  const ecrite = { __appreciation__: 'Bon trimestre, continue en lecture.' };
  ok(ecartsConseil(p, ecrite).includes('appreciation'),
    'l ecart est SIGNALE (l ecran proposera)', ecartsConseil(p, ecrite));
  ok(!('__appreciation__' in lotConseil(p, ecrite, ['tableauHonneur'])),
    'mais appliquer une AUTRE distinction ne touche pas le texte',
    lotConseil(p, ecrite, ['tableauHonneur']));
}

titre('une appreciation proposee VIDE n effacerait qu un texte : jamais un ecart');
{
  // Moyenne nulle réelle : `getAppreciation` rend un mot, donc on force le cas
  // en privant l'échelle de toute mention — ce que fait une école qui a vidé
  // son `grade_scale`.
  const vide = appreciationProposee(12, 20, { sys: 'FR', gradeScale: [] });
  ok(vide !== '', 'l echelle par defaut prend le relais d un grade_scale vide', vide);
  const faux = { pct: 60, appreciation: '', avertissement: 0, tableauHonneur: true, encouragement: false, felicitation: false };
  ok(!ecartsConseil(faux, { __appreciation__: 'Texte de l enseignant' }).includes('appreciation'),
    'une proposition vide ne reclame rien');
  ok(!('__appreciation__' in lotConseil(faux, {})), 'et ne s ecrit pas', lotConseil(faux, {}));
}

titre('l echelle de l ecole prime sur celle du produit');
{
  const echelle = [{ min: 0, max: 9.99, mention: 'A revoir', couleur: '#f00' },
    { min: 10, max: 20, mention: 'Satisfaisant', couleur: '#0f0' }];
  ok(appreciationProposee(15, 20, { sys: 'FR', gradeScale: echelle }) === 'Satisfaisant',
    'la mention vient de school.grade_scale',
    appreciationProposee(15, 20, { sys: 'FR', gradeScale: echelle }));
  ok(appreciationProposee(15, 20, { sys: 'FR' }) === 'Acquis',
    'et sans echelle d ecole, celle du produit');
}

titre('valeurSaisie relit exactement ce que le magasin ecrit');
{
  ok(valeurSaisie('tableauHonneur', { __th__: 'true' }) === 'true', 'distinction posee');
  ok(valeurSaisie('tableauHonneur', {}) === 'false', 'distinction absente = false');
  ok(valeurSaisie('tableauHonneur', { __th__: 'oui' }) === 'false',
    'seule la chaine « true » compte — meme convention que getAbsCond');
  ok(valeurSaisie('avertissement', { __aver_travail__: '2' }) === '2', 'avertissement compte');
  ok(valeurSaisie('avertissement', {}) === '0', 'avertissement absent = 0');
  ok(valeurSaisie('appreciation', {}) === '', 'appreciation absente = chaine vide');
}

// ── 5. LE CÂBLAGE — un moteur juste que personne n'appelle ne corrige rien ──
titre('le carnet imprime bien les CINQ champs');
{
  const compact = readFileSync(new URL('../components/bulletins/BulletinPrimCompact.jsx', import.meta.url), 'utf8');
  ok(/mentions\.felicitation/.test(compact),
    'BulletinPrimCompact porte « Felicitations » — elle manquait alors que les photos la portent');
  ok(/mentions\.avertissement/.test(compact) && /mentions\.tableauHonneur/.test(compact)
    && /mentions\.encouragement/.test(compact), 'et les trois autres distinctions');
  const ua = readFileSync(new URL('../components/bulletins/BulletinPrimAnnualUA.jsx', import.meta.url), 'utf8');
  ok(/mentions\.felicitation/.test(ua), 'la disposition detaillee par UA aussi — sinon les deux divergent');
}

titre('l ecran de saisie propose, et le carnet lit la saisie');
{
  const page = readFileSync(new URL('../pages/Bulletins.jsx', import.meta.url), 'utf8');
  ok(/felicitation: a\.felicitation \? oui : non/.test(page),
    'primMentionsFor expose enfin la quatrieme distinction');
  ok(/propositionsConseil/.test(page), 'la page calcule la proposition');
  ok(/primAppreciationFor/.test(page),
    'et l appreciation du carnet passe par la SAISIE avant de retomber sur la cote');
  const conseil = readFileSync(new URL('../pages/ConseilDeClasse.jsx', import.meta.url), 'utf8');
  ok(/propositionsConseil/.test(conseil), 'l assistant du conseil la calcule aussi');
  ok(/lotConseil/.test(conseil), 'et applique un LOT, jamais champ par champ a l aveugle');
  ok(/ecartsConseil/.test(conseil), 'en ne touchant que les champs qui different');
}

console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT' : `\nECHEC : ${echecs}`);
process.exitCode = echecs === 0 ? 0 : 1;
