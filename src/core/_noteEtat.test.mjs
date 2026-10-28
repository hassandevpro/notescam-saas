// UNE MOYENNE DOIT DIRE LA VÉRITÉ SUR CE QUI A ÉTÉ FAIT.
//
// Ce test verrouille les deux pièges de ce module :
//   · un zéro doit entrer au DÉNOMINATEUR, sinon il ne change rien ;
//   · une case vide ne devient zéro QU'À L'IMPRESSION, jamais à la saisie —
//     sinon un enseignant qui a saisi 5 élèves sur 30 vient d'en couler 25.
//
//   node src/core/_noteEtat.test.mjs
import { readFileSync } from 'node:fs';
import { etatDeNote, pointsDeNote, marqueDeNote, MARQUE_NON_EVALUEE, MARQUE_ABSENT } from './noteEtat.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}` + (got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`)); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

const SAISIE   = {};                            // écran de saisie : jamais de zéro
const BULLETIN = { zeroSiManquante: true };     // impression, école qui l'a demandé

// ── 1. LE CŒUR : une case vide ne devient zéro QU AU BULLETIN ──────────────
titre('Une case vide ne devient zéro qu à l impression, et seulement si l école le veut');
{
  ok(etatDeNote({ note: '' }, SAISIE) === 'vide', 'à la saisie, une case vide reste vide');
  ok(etatDeNote({ note: null }, SAISIE) === 'vide', 'null aussi');
  ok(etatDeNote({}, SAISIE) === 'vide', 'une cellule sans note du tout aussi');
  ok(etatDeNote({ note: '' }, BULLETIN) === 'zero', 'au bulletin, elle compte 0');
  // Le réglage éteint = comportement HISTORIQUE, intact.
  ok(etatDeNote({ note: '' }, { zeroSiManquante: false }) === 'vide',
    'réglage éteint : rien ne change pour les écoles qui n ont rien demandé');
}

// ── 2. LE PIÈGE : un zéro doit compter AU DÉNOMINATEUR ─────────────────────
titre('Un zéro entre au dénominateur, sinon il ne sert à rien');
{
  const p = pointsDeNote('zero', null, 20);
  ok(p && p.obtenu === 0, 'zéro obtenu', p);
  ok(p && p.possible === 20, 'SUR 20 — pas sur 0', p);
  // La démonstration par le total : 15/20 et une case vide.
  const cellules = [{ note: 15 }, { note: '' }];
  const total = (ctx) => cellules
    .map((c) => pointsDeNote(etatDeNote(c, ctx), c.note, 20))
    .filter(Boolean)
    .reduce((a, x) => ({ obtenu: a.obtenu + x.obtenu, possible: a.possible + x.possible }), { obtenu: 0, possible: 0 });
  const avant = total(SAISIE), apres = total(BULLETIN);
  ok(avant.obtenu === 15 && avant.possible === 20, 'sans le réglage : 15/20 (la case vide est ignorée)', avant);
  ok(apres.obtenu === 15 && apres.possible === 40, 'avec le réglage : 15/40 — la moyenne tombe de moitié', apres);
}

// ── 3. L ABSENCE JUSTIFIÉE RESTE HORS MOYENNE ──────────────────────────────
titre('« Absent » ne devient jamais zéro — c est tout l intérêt du bouton');
{
  ok(etatDeNote({ note: '', statut: 'absent' }, BULLETIN) === 'absent',
    'même au bulletin, même avec le réglage allumé');
  ok(pointsDeNote('absent', null, 20) === null, 'et il ne compte ni au numérateur ni au dénominateur');
  // Le 'ABS' historique vaut absence : sinon des bulletins d'il y a deux ans
  // changeraient de moyenne tout seuls.
  ok(etatDeNote({ note: 'ABS' }, BULLETIN) === 'absent', "le 'ABS' déjà en base vaut absence");
  ok(etatDeNote({ note: 'abs' }, BULLETIN) === 'absent', 'quelle que soit la casse');
  ok(etatDeNote({ note: ' ABS ' }, BULLETIN) === 'absent', 'et les espaces autour');
}

// ── 4. « NON ÉVALUÉE » GAGNE SUR TOUT ──────────────────────────────────────
titre('Une compétence non évaluée s imprime « - - - - » et ne compte pas');
{
  const ctx = { nonEvaluee: true, zeroSiManquante: true };
  ok(etatDeNote({ note: '' }, ctx) === 'non_evaluee', 'une case vide n y devient pas zéro');
  ok(etatDeNote({ note: '', statut: 'absent' }, ctx) === 'non_evaluee',
    'et la question de l absence ne se pose plus');
  // Même une note DÉJÀ SAISIE s'efface : la compétence est déclarée non
  // évaluée pour cette classe à cette UA, le chiffre ne doit plus s'imprimer.
  ok(etatDeNote({ note: 14 }, ctx) === 'non_evaluee', 'une note déjà saisie cesse de compter');
  ok(pointsDeNote('non_evaluee', 14, 20) === null, 'et ne pèse sur aucun total');
  ok(marqueDeNote('non_evaluee') === MARQUE_NON_EVALUEE, 'elle s imprime bien « - - - - »', marqueDeNote('non_evaluee'));
}

// ── 5. UNE VRAIE NOTE RESTE UNE VRAIE NOTE ─────────────────────────────────
titre('Ce qui est saisi n est jamais réinterprété');
{
  ok(etatDeNote({ note: 14 }, BULLETIN) === 'note', 'un nombre');
  ok(etatDeNote({ note: '14' }, BULLETIN) === 'note', 'un nombre écrit en texte');
  ok(etatDeNote({ note: '12.5' }, BULLETIN) === 'note', 'un décimal');
  // ZÉRO SAISI N EST PAS UNE CASE VIDE. C est une note, et elle doit le rester.
  ok(etatDeNote({ note: 0 }, SAISIE) === 'note', 'un ZÉRO saisi est une note, pas une absence');
  ok(etatDeNote({ note: '0' }, SAISIE) === 'note', 'y compris écrit « 0 »');
  const p = pointsDeNote('note', 0, 20);
  ok(p && p.obtenu === 0 && p.possible === 20, 'et il compte 0/20', p);
  ok(marqueDeNote('note') === null, 'une note s imprime telle quelle');
}

// ── 6. CE QUI S IMPRIME DANS LA CASE ───────────────────────────────────────
titre('Les marques imprimées');
{
  ok(marqueDeNote('absent') === MARQUE_ABSENT, `absent → « ${MARQUE_ABSENT} »`);
  ok(marqueDeNote('zero') === '0', 'zéro → « 0 », pas une case vide');
  ok(marqueDeNote('vide') === '', 'vide → rien');
  ok(MARQUE_NON_EVALUEE.includes('-'), 'la marque « non évaluée » est bien faite de tirets');
}

// ── 7. ENTRÉES ABERRANTES ──────────────────────────────────────────────────
titre('Rien ne jette');
{
  ok(etatDeNote(null, SAISIE) === 'vide', 'cellule nulle');
  ok(etatDeNote(undefined, BULLETIN) === 'zero', 'cellule absente au bulletin : c est bien un zéro');
  ok(etatDeNote({ note: 'bonjour' }, SAISIE) === 'vide', 'une note illisible ne devient pas une note');
  ok(pointsDeNote('note', 'bonjour', 20).obtenu !== undefined, 'pointsDeNote rend toujours un objet ou null');
  ok(pointsDeNote('zero', null, null)?.possible === 0, 'un barème absent vaut 0, pas NaN',
    pointsDeNote('zero', null, null));
}

// ── 8. LE RÉGLAGE EST BIEN ÉTEINT PAR DÉFAUT ───────────────────────────────
titre('Par défaut, aucune école ne voit son bulletin changer');
{
  ok(etatDeNote({ note: '' }, {}) === 'vide', 'contexte vide = comportement historique');
  const src = readFileSync('src/core/noteEtat.js', 'utf8');
  ok(/zeroSiManquante \? 'zero' : 'vide'/.test(src),
    'le zéro est conditionné, jamais inconditionnel');
}

console.log(`\n${fail ? '❌' : '✅'} États d'une note : ${pass} contrôle(s) ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
