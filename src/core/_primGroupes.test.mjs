// LES SIX REGROUPEMENTS DU CARNET MINEDUB — pourquoi ce test existe.
//
// Le bulletin que THE GENIUS remet aux parents (modèle SIL photographié le
// 2026-10-20) ne liste pas onze compétences à plat : il les range sous SIX
// intitulés numérotés, chacun suivi d'un « Total » et d'une « Moyenne ».
// Notre gabarit compact affichait les onze lignes sans ces regroupements.
//
// La donnée existait déjà : `prim_competences.domaine` porte exactement ces six
// familles (relevé en production), et le numéro est le chiffre du code.
// Rien n'est donc deviné à partir d'un libellé.
//
// Lancer :
//   node src/core/_primGroupes.test.mjs
import { groupesDe } from './primCompactRows.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}` + (got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`)); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

// Les onze compétences nationales, avec les domaines RÉELS de la production.
const REELLES = [
  { code: '1A', domaine: 'langues', achieved: 36, possible: 40 },
  { code: '1B', domaine: 'langues', achieved: 34, possible: 40 },
  { code: '1C', domaine: 'langues', achieved: 38, possible: 40 },
  { code: '2A', domaine: 'maths_sciences', achieved: 28, possible: 30 },
  { code: '2B', domaine: 'maths_sciences', achieved: 27, possible: 30 },
  { code: '3A', domaine: 'vie_citoyennete', achieved: 19, possible: 20 },
  { code: '3B', domaine: 'vie_citoyennete', achieved: 18, possible: 20 },
  { code: '4A', domaine: 'autonomie', achieved: 18, possible: 20 },
  { code: '5A', domaine: 'tic', achieved: 20, possible: 20 },
  { code: '6A', domaine: 'arts_sport', achieved: 19, possible: 20 },
  { code: '6B', domaine: 'arts_sport', achieved: 17.5, possible: 20 },
];

titre('Les six regroupements, dans l ordre du carnet');
{
  const g = groupesDe(REELLES, 'FR');
  ok(g.length === 6, 'six regroupements, ni plus ni moins', g.length);
  ok(g.map((x) => x.numero).join(',') === '1,2,3,4,5,6',
    'numerotes 1 a 6, lus sur le CODE de la competence', g.map((x) => x.numero));
  ok(g[0].codes.join(',') === '1A,1B,1C', 'le premier porte 1A, 1B, 1C', g[0].codes);
  ok(/COMMUNIQUER EN FRANÇAIS ET EN ANGLAIS/.test(g[0].intitule),
    'avec l intitule officiel, pas le slug du domaine', g[0].intitule);
}

titre('Le TOTAL et la MOYENNE de chaque regroupement');
{
  const g = groupesDe(REELLES, 'FR');
  const par = Object.fromEntries(g.map((x) => [x.numero, x]));
  ok(par[1].achieved === 108 && par[1].possible === 120, 'groupe 1 : 108 / 120', [par[1].achieved, par[1].possible]);
  ok(par[1].moyenne === 18, 'groupe 1 : moyenne 18 sur 20', par[1].moyenne);
  // Le chiffre exact lu sur le modele imprime : « Total: 36.5 ».
  ok(par[6].achieved === 36.5, 'groupe 6 : 36.5 — le chiffre du carnet imprime', par[6].achieved);
  ok(par[5].moyenne === 20, 'un groupe d une seule competence se calcule pareil', par[5].moyenne);
}

titre('Une competence NON EVALUEE ne fausse pas le total');
{
  // Elle ne doit ni compter 0, ni gonfler le denominateur : sinon la moyenne du
  // groupe baisse pour une epreuve qui n a pas eu lieu.
  const avecTrou = REELLES.map((r) => (r.code === '3B' ? { ...r, achieved: null, possible: null } : r));
  const g3 = groupesDe(avecTrou, 'FR').find((x) => x.numero === 3);
  ok(g3.achieved === 19 && g3.possible === 20,
    'seule la competence evaluee entre dans le total', [g3.achieved, g3.possible]);
  ok(g3.moyenne === 19, 'et la moyenne reste celle de l epreuve faite', g3.moyenne);

  // Groupe ENTIEREMENT non evalue : pas de 0, pas de division par zero.
  const rien = [{ code: '5A', domaine: 'tic', achieved: null, possible: null }];
  const g5 = groupesDe(rien, 'FR')[0];
  ok(g5.achieved === null && g5.moyenne === null,
    'un groupe sans aucune note ne vaut pas zero', [g5.achieved, g5.moyenne]);
}

titre('Une competence MAISON : rangee par son numero, jamais de force');
{
  // « CHINOIS » sur le modele : ajoutee par l ecole. Si son code porte un
  // numero, elle rejoint ce regroupement ; sinon elle reste dehors plutot que
  // d atterrir dans une famille qui n est pas la sienne.
  const avecNum = [...REELLES, { code: '1D', domaine: null, achieved: 18, possible: 20 }];
  const g1 = groupesDe(avecNum, 'FR').find((x) => x.numero === 1);
  ok(g1.codes.includes('1D'), 'une maison numerotee 1D rejoint le groupe 1', g1.codes);
  ok(g1.achieved === 126, 'et son total entre dans celui du groupe', g1.achieved);

  const sansNum = [...REELLES, { code: 'CHINOIS', domaine: null, achieved: 18, possible: 20 }];
  const tous = groupesDe(sansNum, 'FR');
  ok(tous.length === 6, 'une maison SANS numero ne cree pas un groupe fantome', tous.length);
  ok(!tous.some((x) => x.codes.includes('CHINOIS')),
    'et elle n est rangee de force dans aucune famille', tous.map((x) => x.codes));
}

titre('Langue des intitules : le carnet est bilingue');
{
  const en = groupesDe(REELLES, 'EN');
  ok(/COMMUNICATE IN FRENCH AND ENGLISH/.test(en[0].intitule),
    'en EN, l intitule officiel anglais', en[0].intitule);
  ok(en.length === 6, 'et toujours six regroupements');
}

titre('Entrees abimees : aucune exception');
{
  ok(groupesDe([], 'FR').length === 0, 'liste vide -> aucun groupe');
  ok(groupesDe(null, 'FR').length === 0, 'null -> aucun groupe, pas une erreur');
  ok(groupesDe([null, {}, { code: '' }], 'FR').length === 0, 'lignes abimees -> ignorees');
  // Domaine inconnu du produit : on n invente pas d intitule, on montre les codes.
  const inconnu = groupesDe([{ code: '9A', domaine: 'astronomie', achieved: 10, possible: 20 }], 'FR');
  ok(inconnu.length === 1 && inconnu[0].intitule === '9A',
    'un domaine inconnu garde les codes pour libelle, sans titre invente', inconnu[0]?.intitule);
}

console.log(fail ? `\n❌ ${fail} échec(s) sur ${pass + fail}` : `\n✅ Regroupements du carnet primaire : tout passe (${pass})`);
process.exit(fail ? 1 : 0);
