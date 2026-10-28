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

// ── 9. LE BRANCHEMENT RÉEL : competencePointsTotal ─────────────────────────
// Le module ci-dessus est pur et juste, mais il ne sert à rien tant que le
// moteur ne l'appelle pas. Ces contrôles-là sont ceux qui cassent si quelqu'un
// « simplifie » competencePointsTotal un jour.
{
  const { competencePointsTotal, celluleDeNote } = await import('./primEngine.js');
  const titre2 = (t) => console.log(`\n-- ${t} --`);

  // Compétence 1A du CP : Oral 20 + Écrit 15 + Savoir-être 5 = 40.
  const CRIT = [
    { id: 'oral',        points_max: 20 },
    { id: 'ecrit',       points_max: 15 },
    { id: 'savoir_etre', points_max: 5 },
  ];

  titre2('Sans réglage, rien ne change pour les écoles qui n ont rien demandé');
  {
    const t1 = competencePointsTotal({ ecrit: { note: 12, max: 15 } }, CRIT);
    ok(t1.achieved === 12 && t1.possible === 15,
      'un seul critère noté : 12/15, les deux autres ignorés', t1);
  }

  titre2('Avec le réglage, les critères non saisis entrent au dénominateur');
  {
    const t2 = competencePointsTotal({ ecrit: { note: 12, max: 15 } }, CRIT, { zeroSiManquante: true });
    ok(t2.achieved === 12 && t2.possible === 40,
      '12/40 — Oral et Savoir-être comptent 0 sur leur barème officiel', t2);
  }

  titre2('L absence justifiée tient bon, même avec le réglage allumé');
  {
    const t3 = competencePointsTotal(
      { ecrit: { note: 12, max: 15 }, oral: { note: null, statut: 'absent' } },
      CRIT, { zeroSiManquante: true },
    );
    ok(t3.possible === 20, 'Oral (20) sort du dénominateur : 15 + 5 = 20', t3);
    ok(t3.achieved === 12, 'et le 12 reste acquis', t3);
  }

  titre2('Une compétence non évaluée ne compte nulle part et se signale');
  {
    const t4 = competencePointsTotal({ ecrit: { note: 12, max: 15 } }, CRIT,
      { zeroSiManquante: true, nonEvaluee: true });
    ok(t4.achieved === null && t4.possible === null, 'aucun total', t4);
    ok(t4.nonEvaluee === true,
      'et le drapeau remonte — sans lui le carnet ne saurait pas écrire « - - - - »', t4);
  }

  titre2('celluleDeNote : le piège tendu quatre fois');
  {
    ok(celluleDeNote({ note: 12, points_max: 15 }, 20)?.note === 12, 'une note ordinaire passe');
    ok(celluleDeNote({ note: 12 }, 20)?.max === 20, 'sans barème propre, le barème officiel');
    // LE CŒUR : une cellule ABSENTE porte note = NULL. Les appelants la
    // jetaient avec un `if (r?.note != null)`, et elle redevenait un zéro.
    ok(celluleDeNote({ note: null, statut: 'absent' }, 20)?.statut === 'absent',
      'une cellule ABSENTE n est pas jetée malgré sa note nulle',
      celluleDeNote({ note: null, statut: 'absent' }, 20));
    ok(celluleDeNote({ note: null }, 20) === undefined, 'une cellule vraiment vide n apporte rien');
    ok(celluleDeNote(null, 20) === undefined, 'une ligne absente non plus');
  }

  titre2('Le bulletin passe bien le réglage, la saisie jamais');
  {
    const bul = readFileSync('src/pages/Bulletins.jsx', 'utf8');
    ok(/zeroSiManquante: !!school\?\.notes_manquantes_zero/.test(bul),
      'Bulletins.jsx lit le réglage de l école');
    ok(bul.includes('celluleDeNote'), 'Bulletins.jsx lit les cellules absentes');
    ok(bul.includes('nonEvalKey'), 'Bulletins.jsx sait quelles compétences sont non évaluées');

    const ws = readFileSync('src/components/grades/PrimCompetenceWorkspace.jsx', 'utf8');
    ok(!/zeroSiManquante/.test(ws),
      'l ÉCRAN DE SAISIE ne connaît pas le réglage — une case vide y reste vide');
    ok(ws.includes("statut: s"), 'l écran sait déclarer une absence');
    ok(ws.includes('setPrimNonEvalueeAction'), 'et déclarer une compétence non évaluée');
  }
}

console.log(`\n${fail ? '❌' : '✅'} TOTAL avec le branchement : ${pass} ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;

// ── 10. BULLETIN, RAPPORT ET PV DOIVENT DIRE LE MÊME CHIFFRE ──────────────
// Le commentaire de `primCompetenceAvg` l'affirme depuis sa première ligne :
// « pour que rapport et bulletin ne divergent jamais ». Il l'affirmait en
// passant à côté des deux nouveaux états — le rapport et le PV ignoraient le
// réglage, donc un parent et le conseil de classe lisaient deux moyennes
// différentes pour le même élève. Ces contrôles ferment ça.
{
  const titre3 = (t) => console.log(`\n-- ${t} --`);
  titre3('Les trois documents reçoivent les deux états');

  const cre = readFileSync('src/lib/classReportEngine.js', 'utf8');
  ok(/primNonEvaluees = \[\], zeroSiManquante = false/.test(cre),
    'classReportEngine : buildClassReport accepte les deux');
  ok(cre.includes('celluleDeNote('), 'classReportEngine : ne jette plus les cellules absentes');
  ok(/nonEvaluee: classId \? nonEvaluees\.includes/.test(cre),
    'classReportEngine : les passe au total');

  const pv = readFileSync('src/lib/pvEngine.js', 'utf8');
  ok(/primNonEvaluees = \[\], zeroSiManquante = false/.test(pv),
    'pvEngine : buildClassPv accepte les deux');
  ok(pv.includes('celluleDeNote('), 'pvEngine : ne jette plus les cellules absentes');
  ok(/nonEvaluee: classId \? nonEvaluees\.includes/.test(pv), 'pvEngine : les passe au total');

  const rep = readFileSync('src/pages/Reports.jsx', 'utf8');
  ok(/zeroSiManquante: !!school\?\.notes_manquantes_zero/.test(rep),
    'Rapports : lit le réglage de l école');
  ok(rep.includes('s.primNonEvaluees'), 'Rapports : lit les compétences non évaluées');

  const pvw = readFileSync('src/components/documents/PvWorkspace.jsx', 'utf8');
  ok(/zeroSiManquante: !!school\?\.notes_manquantes_zero/.test(pvw), 'PV : lit le réglage');
  ok(pvw.includes('s.primNonEvaluees'), 'PV : lit les compétences non évaluées');

  titre3('UNE SEULE définition de la clé, sinon les documents divergent');
  {
    const svc = readFileSync('src/lib/primService.js', 'utf8');
    ok(/export \{ nonEvalKey \} from '\.\.\/core\/primEngine\.js'/.test(svc),
      'primService réexporte la clé du moteur au lieu d en garder une copie');
    const eng = readFileSync('src/core/primEngine.js', 'utf8');
    ok((eng.match(/export const nonEvalKey/g) || []).length === 1,
      'et le moteur la définit une fois, exactement');
    // Le moteur doit rester PUR : les rapports tournent sous Node dans les
    // tests, et un import de `supabase` les rendrait intestables.
    ok(!/from '.*supabase/.test(eng), 'le moteur n importe pas supabase — il doit tourner sous Node');
    // On vise l'IMPORT, pas la mention : `classReportEngine` cite
    // « primService.primNkey » dans un commentaire d'explication, et une
    // recherche trop large ferait échouer ce test sur une phrase.
    const importeLeService = (src) => /^\s*import\s[^\n]*primService/m.test(src);
    ok(!importeLeService(cre) && !importeLeService(pv),
      'ni le rapport ni le PV ne traversent le service pour une clé');
  }
}

console.log(`\n${fail ? '❌' : '✅'} TOTAL — états, branchement et convergence : ${pass} ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
