// UNE ÉPREUVE DE L'ÉCOLE DOIT COMPTER DANS LE TOTAL DE SA FAMILLE.
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Le carnet du primaire ne liste pas onze compétences à plat : il les range
// sous SIX familles numérotées, chacune suivie d'un « Total » et d'une
// « Moyenne ». Une ligne NATIONALE y est rattachée par le chiffre de son code
// (« 1A » → famille 1).
//
// Une ligne MAISON n'en a pas : `codeMaison` refuse de produire un code qui
// commence par un chiffre, pour qu'on ne la confonde jamais avec un code du
// ministère — « Dictée - Question » devient « DQ ». Elle restait donc hors de
// toute famille.
//
// LE DÉGÂT, RELEVÉ SUR LE CM1 DE THE GENIUS (2025/2026, capture du 2026-10-27).
// L'école avait ajouté six épreuves — Dictée-Question, Étude de texte,
// Production d'écrits, Calcul Rapide, Problèmes, Connaissances générales — plus
// « CHINOIS ». Elles s'imprimaient, elles comptaient dans le total général et
// dans la moyenne générale, mais elles MANQUAIENT au total de leur famille. Le
// bulletin remis aux parents affichait donc, sous « 1) COMMUNIQUER EN
// FRANÇAIS… », un total qui ne faisait pas la somme des lignes imprimées
// au-dessus. Personne ne peut vérifier un carnet qui ne s'additionne pas.
//
// ET LE PIÈGE EN FACE : poser `domaine = 'langues'` sur l'épreuve ne suffisait
// pas. La clé de regroupement d'une nationale est « num:1 », celle d'un domaine
// est « langues » — deux clés pour une même famille. Le carnet imprimait alors
// le bandeau « 1) COMMUNIQUER… » DEUX fois, chacun avec un bout du total.
//
//   node src/core/_primFamillesMaison.test.mjs
import { readFileSync } from 'node:fs';
import { groupesDe, FAMILLES_PRIMAIRE, familleLabel } from './primCompactRows.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}` + (got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`)); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// Le CM1 de THE GENIUS, relevé sur la capture : trois compétences nationales de
// la famille 1, et les trois épreuves de français que l'école a ajoutées.
const NAT = [
  { code: '1A', intitule: 'Communiquer en Français',        domaine: 'langues', achieved: 45, possible: 50 },
  { code: '1B', intitule: 'Communicate in English',         domaine: 'langues', achieved: 44, possible: 50 },
  { code: '1C', intitule: 'Pratiquer une langue nationale', domaine: 'langues', achieved: 18, possible: 20 },
];
const EP = [
  { code: 'DQ', intitule: 'Dictée - Question',   domaine: 'langues', achieved: 36, possible: 40 },
  { code: 'ET', intitule: 'Etude de texte',      domaine: 'langues', achieved: 27, possible: 30 },
  { code: 'PE', intitule: "Production d'écrits", domaine: 'langues', achieved: 24, possible: 30 },
];
const sansFamille = (r) => ({ ...r, domaine: null });
const somme = (rows, k) => rows.reduce((a, r) => a + r[k], 0);

// ── 1. LE CŒUR : le total de famille fait la somme de ce qui est imprimé ────
titre('Le total de la famille 1 additionne les six lignes imprimées sous elle');
{
  const rows = [...NAT, ...EP];
  const g = groupesDe(rows, 'FR');
  ok(g.length === 1, 'un seul groupe — pas de septième famille fantôme', g.map((x) => x.cle));
  ok(g[0].achieved === somme(rows, 'achieved'),
    `total obtenu = ${somme(rows, 'achieved')}`, g[0].achieved);
  ok(g[0].possible === somme(rows, 'possible'),
    `barème de famille = ${somme(rows, 'possible')}`, g[0].possible);
  ok(g[0].codes.join(',') === '1A,1B,1C,DQ,ET,PE',
    'les six codes appartiennent au groupe', g[0].codes);
  ok(g[0].numero === 1, 'le groupe garde son numéro', g[0].numero);
  ok(/^COMMUNIQUER EN FRANÇAIS/.test(g[0].intitule),
    'et son intitulé officiel', g[0].intitule.slice(0, 30));
}

// ── 2. LE DÉFAUT D'ORIGINE : sans famille, l'épreuve manque au total ────────
titre('Une épreuve SANS famille reste hors du total — et c est visible');
{
  const g = groupesDe([...NAT, ...EP.map(sansFamille)], 'FR');
  ok(g.length === 1, 'elle ne crée pas de groupe à elle seule');
  ok(g[0].achieved === somme(NAT, 'achieved'),
    'le total ne porte que les nationales : 107', g[0].achieved);
  // C'est bien un MANQUE, pas un choix : l'écran le signale à l'école
  // (bandeau « ne sont rattachées à aucune famille »), et c'est le geste que
  // `setRefFamille` répare. On verrouille le chiffre pour que le jour où le
  // comportement change, le test le dise.
  ok(somme(EP, 'achieved') === 87, '87 points obtenus restent hors famille');
}

// ── 3. LE PIÈGE DU SEPTIÈME GROUPE ─────────────────────────────────────────
titre('Le domaine et le numéro désignent UNE famille, pas deux');
{
  // Une seule épreuve suffisait à dédoubler le bandeau.
  const g = groupesDe([...NAT, EP[0]], 'FR');
  ok(g.length === 1, 'un bandeau, pas deux', g.map((x) => x.intitule.slice(0, 20)));
  const titres = g.map((x) => x.intitule);
  ok(new Set(titres).size === titres.length, 'aucun intitulé imprimé en double');
}

// ── 4. L ÉPREUVE EN TÊTE DE FAMILLE ────────────────────────────────────────
titre('Une épreuve placée AVANT les nationales ne coûte pas son numéro au groupe');
{
  // Sur le CM1, « Calcul Rapide » s'imprime avant 2B. Le numéro se lisait sur la
  // PREMIÈRE ligne du groupe : il devenait nul, et le bandeau perdait son « 2) ».
  const g = groupesDe([
    { code: 'CR', intitule: 'Calcul Rapide', domaine: 'maths_sciences', achieved: 18, possible: 20 },
    { code: '2A', intitule: 'Mathématiques', domaine: 'maths_sciences', achieved: 45, possible: 50 },
  ], 'FR');
  ok(g.length === 1 && g[0].numero === 2, 'le groupe est numéroté 2', g[0]?.numero);
  ok(/^UTILISER LES NOTIONS DE BASE/.test(g[0].intitule), 'et porte le bon intitulé');
}

// ── 5. ON NE RANGE PERSONNE DE FORCE ───────────────────────────────────────
titre('Un domaine que le national ne porte pas garde son propre groupe');
{
  const g = groupesDe([...NAT,
    { code: 'CH', intitule: 'CHINOIS', domaine: 'langues_etrangeres', achieved: 16, possible: 20 },
  ], 'FR');
  ok(g.length === 2, 'deux groupes : la famille 1 et celui de l école', g.map((x) => x.cle));
  ok(g[1].cle === 'langues_etrangeres' && g[1].numero === null,
    'le groupe de l école n emprunte pas un numéro qui n est pas le sien', [g[1].cle, g[1].numero]);
  ok(g[0].achieved === somme(NAT, 'achieved'),
    'et la famille 1 n a pas absorbé le chinois', g[0].achieved);
}

// ── 6. NON-RÉGRESSION : un carnet sans ligne maison ne bouge pas ────────────
titre('Les six familles nationales sont rendues comme avant');
{
  const nationales = [
    { code: '1A', domaine: 'langues',         achieved: 18, possible: 20 },
    { code: '2A', domaine: 'maths_sciences',  achieved: 28, possible: 30 },
    { code: '3A', domaine: 'vie_citoyennete', achieved: 19, possible: 20 },
    { code: '4',  domaine: 'autonomie',       achieved: 17, possible: 20 },
    { code: '5',  domaine: 'tic',             achieved: 20, possible: 20 },
    { code: '6A', domaine: 'arts_sport',      achieved: 15, possible: 20 },
  ];
  const g = groupesDe(nationales, 'FR');
  ok(g.length === 6, 'six familles', g.length);
  ok(g.map((x) => x.numero).join(',') === '1,2,3,4,5,6', 'numérotées 1 à 6', g.map((x) => x.numero));
  ok(g.every((x) => x.codes.length === 1), 'chacune avec sa compétence');
  // Une ligne sans code ET sans domaine n'appartient à rien : inchangé.
  ok(groupesDe([{ code: null, domaine: null, achieved: 1, possible: 2 }], 'FR').length === 0,
    'une ligne sans code ni domaine ne forme aucun groupe');
}

// ── 7. LA LISTE PROPOSÉE À L ÉCOLE EST CELLE DU CARNET ─────────────────────
titre('Les familles proposées à l école sont celles qui s impriment');
{
  ok(FAMILLES_PRIMAIRE.length === 6, 'six familles proposées', FAMILLES_PRIMAIRE.length);
  ok(FAMILLES_PRIMAIRE[0] === 'langues' && FAMILLES_PRIMAIRE[5] === 'arts_sport',
    'dans l ordre du carnet', [FAMILLES_PRIMAIRE[0], FAMILLES_PRIMAIRE[5]]);
  // L'intitulé proposé est MOT POUR MOT celui du bandeau : une école qui choisit
  // « 1) COMMUNIQUER… » doit retrouver ce texte exact sur le bulletin.
  const g = groupesDe(NAT, 'FR');
  ok(familleLabel('langues', 'FR') === g[0].intitule,
    'et leur intitulé est celui du bandeau imprimé');
  ok(familleLabel('langues', 'EN') !== familleLabel('langues', 'FR'),
    'une classe anglophone les lit en anglais');
  ok(familleLabel('inconnu', 'FR') === null, 'un domaine inconnu n invente pas d intitulé');
}

// ── 8. CÂBLAGE : le geste existe à l écran et dans le store ────────────────
titre('L école peut ranger ses lignes sans SQL');
{
  const store = readFileSync('src/store/schoolStore.js', 'utf8');
  ok(/setRefFamille:\s*async/.test(store), 'schoolStore : setRefFamille existe');
  ok(/if \(ligne\.school_id !== schoolId\) return \{ error: 'nationale' \}/.test(store),
    'schoolStore : une ligne NATIONALE est refusée — son domaine vient du ministère');

  const ws = readFileSync('src/components/grades/PrimCompetenceWorkspace.jsx', 'utf8');
  ok(ws.includes('familles={famillesPrim}'), 'l écran du primaire propose les familles');
  ok(/onAdd=\{\(nom, famille\)/.test(ws), 'et les propose DÈS l ajout, pas seulement après');
  ok(ws.includes("setRefFamille('prim'"), 'et sait déplacer une ligne déjà créée');

  const ed = readFileSync('src/components/grades/ReferentielEditor.jsx', 'utf8');
  ok(/familles = null/.test(ed),
    'l éditeur partagé reste INCHANGÉ pour la maternelle et l APC (familles absent)');
  ok(ed.includes('orphelines'), 'et prévient quand une ligne maison n a pas de famille');
  ok(/familles && !estNational\(l\)/.test(ed),
    'le choix n est offert que sur une ligne MAISON');
}

console.log(`\n${fail ? '❌' : '✅'} Familles des lignes maison : ${pass} contrôle(s) ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
