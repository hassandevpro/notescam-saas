// LE BARÈME D'UNE COLONNE DE SAISIE — les règles que l'écran applique.
//
// Ces règles vivaient dans le composant, donc hors de portée de tout test. Elles
// couvrent ici, point par point, ce qui a été demandé en recette :
//   • le barème tient sur /3, /5, /10, /15, /20 ;
//   • une note nouvellement saisie hérite du barème de son évaluation ;
//   • baisser le barème est REFUSÉ si une note existante le dépasse ;
//   • un ZÉRO est une note, pas une absence ;
//   • rien d'existant n'est converti en silence.
//
// Lancer : node src/core/_primColumnBareme.test.mjs
import { baremeEnVigueur, notesHorsBareme, notesSaisies, baremeRecevable } from './primColumnBareme.js';
import { competencePointsTotal, primCote } from './primEngine.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

// ── 7. Le barème tient sur toutes les échelles demandées ────────────────────
for (const b of [3, 5, 10, 15, 20]) {
  ok(baremeRecevable(b), `barème /${b} recevable`);
  ok(baremeEnVigueur([{ note: 1, points_max: b }], 20, undefined) === b,
     `/${b} : une note qui le porte fait foi`, baremeEnVigueur([{ note: 1, points_max: b }], 20, undefined));
}
for (const mauvais of [0, -5, 2000, 'abc', null, undefined]) {
  ok(!baremeRecevable(mauvais), `barème ${JSON.stringify(mauvais)} refusé`);
}

// ── Déduction du barème d'une colonne ───────────────────────────────────────
ok(baremeEnVigueur([], 15, undefined) === 15, 'colonne vide, rien de posé → barème officiel');
ok(baremeEnVigueur([], 15, 5) === 5, 'colonne VIDE avec un barème posé → ce barème');
ok(baremeEnVigueur([null, undefined, {}], 15, 5) === 5, 'élèves non notés : ignorés, le posé tient');
ok(baremeEnVigueur([{ note: 12 }], 15, 5) === 15,
   'note ANCIENNE sans barème → officiel (elle en vient), pas le posé', baremeEnVigueur([{ note: 12 }], 15, 5));
ok(baremeEnVigueur([{ note: 4, points_max: 5 }], 15, undefined) === 5,
   'note portant son barème → ce barème');
ok(baremeEnVigueur([null, { note: 4, points_max: 5 }], 15, undefined) === 5,
   'un élève non noté en tête ne masque pas le barème des suivants');
ok(baremeEnVigueur([{ note: 0, points_max: 5 }], 15, undefined) === 5,
   'un ZÉRO est une note : son barème compte');
ok(baremeEnVigueur([{ note: 4, points_max: 0 }], 15, undefined) === 15,
   'barème corrompu sur la note → repli sur l’officiel');

// ── 8. Une note nouvellement saisie hérite du barème de son évaluation ──────
// C'est le défaut « il faut changer le barème deux fois » : la colonne est posée
// à /5, un élève est noté ensuite, et sa note doit NAÎTRE à /5 — sinon la colonne
// se remet d'elle-même à l'officiel.
{
  const officiel = 20;
  const colonneVide = [];
  const posé = baremeEnVigueur(colonneVide, officiel, 5);
  ok(posé === 5, 'colonne posée à /5 avant toute note', posé);
  // L'écran enregistre la note AVEC ce barème (pointsMax: baremeFor(...)).
  const apresSaisie = [{ note: 4, points_max: posé }];
  ok(baremeEnVigueur(apresSaisie, officiel, 5) === 5,
     'la note saisie ensuite porte /5 : la colonne RESTE à /5',
     baremeEnVigueur(apresSaisie, officiel, 5));
  // Le défaut que ce test verrouille : sans héritage, la note naissait sans
  // barème et la colonne retombait à l'officiel.
  ok(baremeEnVigueur([{ note: 4 }], officiel, 5) === officiel,
     'témoin : sans héritage, la colonne retombait à l’officiel');
}

// ── 9. Baisser le barème est refusé si une note le dépasse ──────────────────
const porteurs = [
  { id: 'a', name: 'AYDEN', note: 11 },
  { id: 'b', name: 'BIBI', note: 3 },
  { id: 'c', name: 'CHLOE', note: '' },
  { id: 'd', name: 'DIDI', note: null },
  { id: 'e', name: 'EVE', note: 'ABS' },
];
{
  const trop = notesHorsBareme(porteurs, 5);
  ok(trop.length === 1 && trop[0].name === 'AYDEN',
     '/5 refusé : une note (11) le dépasse, et on sait laquelle', trop.map((x) => x.name));
  ok(notesHorsBareme(porteurs, 15).length === 0, '/15 accepté : aucune note ne dépasse');
  ok(notesHorsBareme(porteurs, 11).length === 0, 'une note ÉGALE au barème ne le dépasse pas');
  ok(notesHorsBareme(porteurs, 10).length === 1, 'un point de moins et elle dépasse');
  ok(notesHorsBareme([{ id: 'z', name: 'ZED', note: 0 }], 5).length === 0,
     'un zéro ne dépasse aucun barème');
  ok(notesHorsBareme([{ id: 'y', name: 'YA', note: 'ABS' }], 1).length === 0,
     'un ABS n’est pas une note : il ne bloque pas');
}

// ── 10. Le cas 18/30, et des barèmes mélangés ───────────────────────────────
// Oral 3/5, Written 2/5, Practical 11/15, Attitude 2/5 → 18 sur 30.
{
  const criteres = [
    { id: 'oral', points_max: 20 }, { id: 'ecrit', points_max: 20 },
    { id: 'prat', points_max: 20 }, { id: 'att', points_max: 20 },
  ];
  const notes = {
    oral: { note: 3,  max: 5 },
    ecrit:{ note: 2,  max: 5 },
    prat: { note: 11, max: 15 },
    att:  { note: 2,  max: 5 },
  };
  const t = competencePointsTotal(notes, criteres);
  ok(t.achieved === 18 && t.possible === 30, 'le cas signalé vaut bien 18/30', t);
  ok(primCote(t.achieved, t.possible).cote === 'ECA', '18/30 = 60 % → ECA',
     primCote(t.achieved, t.possible).cote);
  // Le défaut évité : sur les barèmes officiels, le même élève tomberait à 18/80.
  ok(competencePointsTotal({ oral: 3, ecrit: 2, prat: 11, att: 2 }, criteres).possible === 80,
     'témoin : sans barème porté par la note, le total serait /80');
}

// ── 12. Rien n'est converti en silence ──────────────────────────────────────
// Une note déjà en base, sans barème propre, garde sa valeur ET son échelle.
{
  const criteres = [{ id: 'oral', points_max: 20 }];
  const t = competencePointsTotal({ oral: 14 }, criteres);
  ok(t.achieved === 14 && t.possible === 20,
     'note héritée : valeur et échelle inchangées', t);
}

// ── 13. REVENIR À ZÉRO : refermer une colonne qu'on avait ouverte ──────────
// Le défaut signalé : « quand je change le barème et que j’essaie de revenir à
// zéro, ça refuse » (essayé sur « Pratique »). Une colonne sans barème national
// naît à zéro, l'école y pose son chiffre — et ne pouvait plus l'enlever.
{
  const COLONNE_VIDE = [null, undefined, {}];
  // Zéro n’est pas un barème : il dit « rien posé ici », donc retour à l’officiel.
  ok(baremeEnVigueur(COLONNE_VIDE, 20, 0) === 20,
     'zéro posé sur un critère OFFICIEL → sa colonne revient au barème MINEDUB',
     baremeEnVigueur(COLONNE_VIDE, 20, 0));
  // Et quand le national ne connaît pas le critère, cet officiel vaut zéro :
  // la colonne se referme, ce qui est exactement le geste demandé.
  ok(baremeEnVigueur(COLONNE_VIDE, 0, 0) === 0,
     'zéro posé sur un critère SANS barème national → colonne refermée',
     baremeEnVigueur(COLONNE_VIDE, 0, 0));
  // Aller-retour complet, tel que l’écran le produit : ouverture à /5, puis
  // remise à zéro — les lignes écrites pour porter le barème repassent à NULL.
  ok(baremeEnVigueur(COLONNE_VIDE, 0, 5) === 5, "ouverture : la colonne vaut /5");
  const apresRemiseAZero = [{ note: null, points_max: null }, { note: null, points_max: null }];
  ok(baremeEnVigueur(apresRemiseAZero, 0, 0) === 0,
     'remise à zéro : les lignes à points_max NULL ne retiennent plus /5',
     baremeEnVigueur(apresRemiseAZero, 0, 0));
}

// ── 14. Une colonne qui porte une saisie ne se referme pas en silence ──────
// Baisser un barème rend une note FAUSSE (18/20 → 18/10) ; refermer la colonne
// la rend INVISIBLE — elle resterait en base sans colonne pour la montrer. Le
// filtre est donc plus large que `notesHorsBareme` : il compte aussi l'ABS et le
// zéro, qui sont des saisies et non des cases vides.
{
  const vides = [null, undefined, {}, { id: 'a', name: 'A', note: null }, { id: 'b', name: 'B', note: '' }];
  ok(notesSaisies(vides).length === 0,
     'colonne sans aucune saisie : la remise à zéro est permise', notesSaisies(vides));
  ok(notesSaisies(null).length === 0, "aucun élève : rien ne bloque");
  ok(notesSaisies([{ id: 'c', name: 'C', note: 12 }]).length === 1,
     'une note chiffrée bloque la remise à zéro');
  ok(notesSaisies([{ id: 'd', name: 'D', note: 0 }]).length === 1,
     'un ZÉRO est une note : il bloque aussi (0 saisi ≠ case vide)');
  ok(notesSaisies([{ id: 'e', name: 'E', note: 'ABS' }]).length === 1,
     'une ABSENCE saisie est une saisie : elle bloque aussi');
  // Témoin du contraste avec la règle de la BAISSE de barème, qui les ignore.
  ok(notesHorsBareme([{ id: 'e', name: 'E', note: 'ABS' }], 5).length === 0,
     'témoin : pour une baisse de barème, un ABS ne dépasse rien');
  // Et le nom des porteurs est rendu, pour que l’enseignant sache qui corriger.
  const porteurs = [{ id: 'f', name: 'FOTSO', note: 3 }, { id: 'g', name: 'GAKA', note: 'ABS' }];
  ok(notesSaisies(porteurs).map((x) => x.name).join(',') === 'FOTSO,GAKA',
     'les porteurs sont nommés, pas seulement comptés',
     notesSaisies(porteurs).map((x) => x.name));
}

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Barème de colonne : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
