// L'EN-TÊTE OFFICIEL ANGLAIS DU CAMEROUN
//
// ── CE QUE CE TEST EMPÊCHE DE REVENIR ───────────────────────────────────────
//
// Relevé sur un rapport de résultats IMPRIMÉ de THE GENIUS (2026-10-22), bloc
// anglais :
//
//     Regional Delegation Ouest
//     Divisional Delegation Mifi
//
// Deux fautes en deux lignes. Le nom de la région n'était pas traduit — les
// deux blocs, français et anglais, lisaient la même valeur stockée — et la
// préposition manquait. L'en-tête officiel anglais s'écrit :
//
//     Regional Delegation for the West
//     Divisional Delegation for Mifi
//
// La RÉGION se traduit (dix noms officiels), le DÉPARTEMENT non (cinquante-huit
// noms propres).
//
//   node src/countries/_enteteOfficielle.test.mjs
import { bulletinOfficials } from './index.js';
import { regionEn } from './cameroonRegions.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { pass++; console.log(`✅ ${label}`); }
  else { fail++; console.log(`❌ ${label}` + (got === undefined ? '' : `  (obtenu: ${JSON.stringify(got)})`)); }
};
const titre = (t) => console.log(`\n-- ${t} --`);

const ecole = (extra = {}) => ({
  country_system: 'cameroon_fr', region: 'Ouest', division: 'Mifi', ...extra,
});
const blocs = (school, opts) => {
  const o = bulletinOfficials(school, opts) || { blocks: [] };
  const par = {};
  for (const b of o.blocks) if (b.lang) par[b.lang] = b;
  return par;
};

titre('Le bloc anglais, tel qu il doit s imprimer');
{
  const { en, fr } = blocs(ecole());
  ok(!!en, 'le bloc anglais est identifiable par sa langue');
  ok(en.lines[0] === 'Regional Delegation for the West',
    'la region est TRADUITE et porte sa preposition', en?.lines?.[0]);
  ok(en.lines[1] === 'Divisional Delegation for Mifi',
    'le departement garde son nom et porte sa preposition', en?.lines?.[1]);
  // Ce qui était imprimé avant, et qui ne doit plus l'être.
  ok(!en.lines.includes('Regional Delegation Ouest'), 'plus de « Regional Delegation Ouest »');
  ok(!en.lines.some((l) => l.includes('Ouest')), 'plus un seul « Ouest » dans le bloc anglais', en?.lines);

  ok(!!fr, 'le bloc francais est identifiable par sa langue');
  ok(fr.lines[0].includes('Ouest'), 'le bloc FRANCAIS garde « Ouest »', fr?.lines?.[0]);
  ok(!fr.lines.some((l) => l.includes('West')), 'et ne parle pas anglais', fr?.lines);
}

titre('La tutelle du FONDAMENTAL (MINEDUB) suit la meme regle');
{
  const { en } = blocs(ecole(), { basic: true });
  ok(en.lines[0] === 'Regional Delegation of Basic Education for the West',
    'region traduite cote MINEDUB aussi', en?.lines?.[0]);
  ok(en.lines[1] === 'Divisional Delegation of Basic Education for Mifi',
    'departement inchange cote MINEDUB aussi', en?.lines?.[1]);
}

titre('Une ecole ANGLOPHONE obtient les memes lignes');
{
  // `cameroon_en` inverse l'ordre des blocs (anglais en primary) : la correction
  // doit valoir dans les DEUX fichiers pays, pas seulement celui qui a servi.
  const { en } = blocs(ecole({ country_system: 'cameroon_en' }));
  ok(en.lines[0] === 'Regional Delegation for the West',
    'cameroon_en : meme ligne regionale', en?.lines?.[0]);
  ok(en.lines[1] === 'Divisional Delegation for Mifi',
    'cameroon_en : meme ligne departementale', en?.lines?.[1]);
}

titre('Les dix regions ont leur nom anglais');
{
  const attendu = {
    Adamaoua: 'Adamawa', Centre: 'Centre', Est: 'East', 'Extrême-Nord': 'Far North',
    Littoral: 'Littoral', Nord: 'North', 'Nord-Ouest': 'North West', Ouest: 'West',
    Sud: 'South', 'Sud-Ouest': 'South West',
  };
  let toutes = true;
  for (const [fr, en] of Object.entries(attendu)) {
    if (regionEn(fr) !== en) { toutes = false; console.log(`   ${fr} -> ${regionEn(fr)} (attendu ${en})`); }
  }
  ok(toutes, 'les dix regions se traduisent');
  // Tolerance d'ecriture : l'ecole saisit comme elle veut.
  ok(regionEn('extreme nord') === 'Far North', 'sans accent ni trait d union', regionEn('extreme nord'));
  ok(regionEn('NORD-OUEST') === 'North West', 'en capitales', regionEn('NORD-OUEST'));
  ok(regionEn('North West') === 'North West', 'deja en anglais : inchangee', regionEn('North West'));
  // Une region inconnue passe TELLE QUELLE : mieux vaut un nom inattendu qu'une
  // ligne vide sur un document officiel — l'ecole voit quoi corriger.
  ok(regionEn('Ngaoundéré') === 'Ngaoundéré', 'une region inconnue n est pas effacee', regionEn('Ngaoundéré'));
  ok(regionEn('') === '' && regionEn(null) === '', 'vide reste vide, sans erreur');
}

titre('Les autres pays ne sont pas touches');
{
  // La Guinée Équatoriale ne déclare AUCUN en-tête officiel : `bulletinOfficials`
  // y rend `null`, et les documents qui la concernent portent leurs propres
  // lignes espagnoles. Ce test fige ce fait, parce qu'il décide du repli des
  // gabarits : un en-tête vide vaut mieux qu'un en-tête camerounais sur un
  // document équato-guinéen.
  const o = bulletinOfficials({ country_system: 'guinea_eq', region: 'Litoral' });
  ok(o === null, 'Guinee Equatoriale : aucun en-tete officiel declare', o);

  // Le Gabon : pays mono-langue avec en-tête. Un seul bloc, aucune traduction.
  const gabon = bulletinOfficials({ country_system: 'gabon', region: 'Estuaire' });
  if (gabon) {
    ok(gabon.bilingual === false, 'Gabon : en-tete mono-bloc', gabon.bilingual);
    ok(!(gabon.blocks[0].lines || []).some((l) => /for the/.test(l)),
      'et aucune preposition anglaise ne s y invite', gabon.blocks[0]?.lines);
  } else {
    ok(true, 'Gabon : aucun en-tete declare non plus — rien a traduire');
  }
}

console.log(`\n${fail ? '❌' : '✅'} En-tête officiel : ${pass} contrôle(s) ok, ${fail} ko`);
process.exitCode = fail ? 1 : 0;
