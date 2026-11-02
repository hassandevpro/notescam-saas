// LA MATERNELLE COTE-T-ELLE PAR UNITÉ D'APPRENTISSAGE, COMME LE PRIMAIRE ?
//
// Consigne du 2026-11-01 : « Aujourd'hui la maternelle saisit les notes par
// Trimestre 1, 2, 3. Elle doit utiliser les mêmes critères que le primaire :
// UA1 à UA8. […] Trimestre 1 = UA1, UA2, UA3 ; Trimestre 2 = UA4, UA5, UA6 ;
// Trimestre 3 = UA7, UA8. »
//
// Ce que ce banc fige :
//   • le découpage est le MÊME objet que celui du primaire — pas une copie ;
//   • l'identité d'une observation est (élève, domaine, UA) ;
//   • la synthèse trimestrielle est la cote DOMINANTE des UA cotées, jamais une
//     moyenne : A/ECA/NA ne s'additionnent pas ;
//   • une UA non cotée ne tire pas la synthèse vers le bas (un enfant qu'on n'a
//     pas encore observé ne vaut pas « non acquis »).
//
//   node src/core/_matUa.test.mjs
import {
  obsNkey, nkeyEstUA, MAT_UAS, UA_PAR_TRIMESTRE, uasDuTrimestre,
  trimestreOfUA, trimestreIdOfUA, estUAValide, syntheseTrimestre, uaLabels,
} from './matEngine.js';
import { UA_PAR_TRIMESTRE as UA_PRIM, trimestreOfUA as trimPrim } from './primEngine.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

titre('le decoupage de la maternelle EST celui du primaire');
{
  // Pas « équivalent » : le MÊME objet. Deux copies finiraient par diverger, et
  // c'est précisément ce que la consigne interdit (« les mêmes critères »).
  ok(UA_PAR_TRIMESTRE === UA_PRIM, 'UA_PAR_TRIMESTRE est partage, pas recopie');
  ok(trimestreOfUA === trimPrim, 'trimestreOfUA est la meme fonction');
  ok(JSON.stringify(UA_PAR_TRIMESTRE) === JSON.stringify({ 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8] }),
    'T1=UA1-3, T2=UA4-6, T3=UA7-8', UA_PAR_TRIMESTRE);
  ok(MAT_UAS.join(',') === '1,2,3,4,5,6,7,8', 'huit UA dans l annee', MAT_UAS);
}

titre('UA -> trimestre, et trimestre -> UA');
{
  ok([1, 2, 3].every((u) => trimestreOfUA(u) === 1), 'UA1-3 sont au trimestre 1');
  ok([4, 5, 6].every((u) => trimestreOfUA(u) === 2), 'UA4-6 sont au trimestre 2');
  ok([7, 8].every((u) => trimestreOfUA(u) === 3), 'UA7-8 sont au trimestre 3');
  ok(trimestreIdOfUA(2) === 't1' && trimestreIdOfUA(5) === 't2' && trimestreIdOfUA(8) === 't3',
    'l identifiant de trimestre est derive de l UA', [trimestreIdOfUA(2), trimestreIdOfUA(5), trimestreIdOfUA(8)]);
  ok(uasDuTrimestre(3).join(',') === '7,8', 'le trimestre 3 ne compte que deux UA', uasDuTrimestre(3));
  ok(uasDuTrimestre(undefined).join(',') === '1,2,3', 'sans trimestre, on retombe sur le premier', uasDuTrimestre(undefined));
}

titre('LE POINT QUI SURPREND : une note saisie en T2 devient UA2, donc T1');
{
  // Le responsable l'a écrit : « Les notes qui étaient saisies en Trimestre 2
  // seront donc rattachées à UA2, c'est-à-dire au Trimestre 1 dans le bulletin.
  // C'est voulu. » Ce banc le FIGE, pour que personne ne le « corrige ».
  ok(trimestreOfUA(2) === 1, 'UA2 compte au trimestre 1', trimestreOfUA(2));
  ok(!uasDuTrimestre(2).includes(2), 'et n apparait PAS dans le trimestre 2', uasDuTrimestre(2));
}

titre('UA valide a l ecriture');
{
  for (const u of [1, 4, 8]) ok(estUAValide(u), `UA${u} est acceptee`);
  for (const u of [0, 9, -1, 1.5, null, undefined, '', 't1', 'ua1', NaN]) {
    ok(!estUAValide(u), `${JSON.stringify(u)} est refusee`, u);
  }
  // Une chaine numerique reste acceptee : les selecteurs HTML rendent du texte.
  ok(estUAValide('3'), 'la chaine « 3 » est acceptee (un <select> rend du texte)');
}

titre('la cle d une observation porte l UA');
{
  ok(obsNkey('e1', 'd1', 2) === 'e1_d1_2', 'nkey = eleve_domaine_ua', obsNkey('e1', 'd1', 2));
  ok(obsNkey('e1', 'd1', 1) !== obsNkey('e1', 'd1', 2),
    'deux UA du meme trimestre ont deux cles distinctes — c est tout l enjeu');
  ok(nkeyEstUA('e1_d1_2'), 'une cle par UA est reconnue');
  ok(!nkeyEstUA('e1_d1_t2'), 'une cle par trimestre (version anterieure) est detectee comme telle');
}

titre('synthese d un trimestre : la cote dominante, jamais une moyenne');
{
  const s1 = syntheseTrimestre([
    { ua: 1, niveau_acquis: 'A' }, { ua: 2, niveau_acquis: 'A' }, { ua: 3, niveau_acquis: 'ECA' },
  ]);
  ok(s1.niveau === 'A', 'deux A et un ECA → A', s1.niveau);
  ok(s1.cotees === 3, 'trois UA cotees', s1.cotees);

  const s2 = syntheseTrimestre([
    { ua: 1, niveau_acquis: 'NA' }, { ua: 2, niveau_acquis: 'ECA' }, { ua: 3, niveau_acquis: 'A' },
  ]);
  // Egalite parfaite : on departage au PLUS FAVORABLE (dominantAcquis), parce
  // qu une cote de maternelle est un encouragement, pas une sanction.
  ok(s2.niveau === 'A', 'a egalite, la cote la plus favorable', s2.niveau);

  const s3 = syntheseTrimestre([{ ua: 1, niveau_acquis: 'ECA' }]);
  ok(s3.niveau === 'ECA' && s3.cotees === 1, 'une seule UA cotee suffit', s3);

  // UNE UA NON COTEE NE COMPTE PAS : sans cela, un enfant observe une seule
  // fois dans le trimestre serait tire vers le bas par deux cases vides.
  const s4 = syntheseTrimestre([
    { ua: 1, niveau_acquis: 'A' }, { ua: 2, niveau_acquis: null }, { ua: 3, niveau_acquis: '' },
  ]);
  ok(s4.niveau === 'A' && s4.cotees === 1, 'les UA non cotees sont ignorees', s4);

  const s5 = syntheseTrimestre([]);
  ok(s5.niveau === null && s5.cotees === 0, 'aucune UA cotee → aucune synthese (case vide au bulletin)', s5);
  ok(syntheseTrimestre(null).niveau === null, 'et une entree nulle ne plante pas');
}

titre('le commentaire retenu est celui de l UA la plus avancee');
{
  const s = syntheseTrimestre([
    { ua: 1, niveau_acquis: 'A', observation: 'debut de trimestre' },
    { ua: 3, niveau_acquis: 'A', observation: 'progres nets' },
    { ua: 2, niveau_acquis: 'A', observation: '   ' },
  ]);
  ok(s.observation === 'progres nets', 'le commentaire de l UA3 l emporte sur celui de l UA1', s.observation);
  const vide = syntheseTrimestre([{ ua: 1, niveau_acquis: 'A', observation: '  ' }]);
  ok(vide.observation === '', 'un commentaire fait d espaces ne compte pas', vide.observation);
}

titre('libelles fournis comme donnees (module pur)');
{
  ok(uaLabels(3).fr === 'UA3' && uaLabels(3).en === 'LU3', 'UA3 / LU3', uaLabels(3));
}

console.log(`\n${echecs === 0 ? 'TOUS LES CONTROLES PASSENT' : `${echecs} ECHEC(S)`}`);
process.exit(echecs === 0 ? 0 : 1);
