// L'ÉTAT D'UN SERVICE, AUX DEUX PORTÉES : un mois, ou l'année entière
//
// Demande du responsable (2026-10-31) : « ajoute pdf de chaque service » puis
// « en fonction du mois et l'année entière ». Ce qui se vérifie ici, c'est le
// DOCUMENT : la règle de pastille, elle, est déjà couverte par
// _cantineEngine.test.mjs, et on ne la re-teste pas — on vérifie qu'elle est
// bien celle qui décide ce qui s'imprime.
//
// Lancer : node --experimental-loader ./scripts/lib/esm-resolve.mjs src/lib/_serviceDoc.test.mjs
import { buildServiceEtatHtml, abrege, SIGNES } from './serviceDoc.js';

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};

const ECOLE = {
  id: 'e1', name: 'THE GENIUS INTERNATIONAL SCHOOL', current_year: '2026-2027',
  country: 'cameroon', currency: 'XAF', director_name: 'MBALLA Jean',
};
const SERVICE = { id: 's1', name: 'Cantine', quote_part: 15 };

const ENTETE = [
  { period_key: '2026-09', label: 'Septembre 2026' },
  { period_key: '2026-10', label: 'Octobre 2026' },
  { period_key: '2026-11', label: 'Novembre 2026' },
];

// Trois élèves, trois situations : soldé partout, partiel en octobre, et un
// élève qui n'est inscrit QU'EN novembre — le cas « à la carte ».
const ABONNES = [
  {
    student_id: 'a1', name: 'ATANGANA Marie', matricule: 'MAT001', className: '6eme A', section: 'secondaire_1',
    cellules: [
      { convention: 'inscrit', statut: 'paid', montantDu: 15000, paye: 15000, reste: 0 },
      { convention: 'inscrit', statut: 'paid', montantDu: 15000, paye: 15000, reste: 0 },
      { convention: 'inscrit', statut: 'due', montantDu: 15000, paye: 0, reste: 15000 },
    ],
    du: 45000, paye: 30000, reste: 15000,
  },
  {
    student_id: 'a2', name: 'ABEGA Loic', matricule: 'MAT002', className: '5eme B', section: 'secondaire_1',
    cellules: [
      { convention: 'inscrit', statut: 'due', montantDu: 15000, paye: 5000, reste: 10000 },
      { convention: 'exempte', statut: 'exempt', montantDu: 0, paye: 0, reste: 0 },
      { convention: 'abandon', statut: 'dropped', montantDu: 0, paye: 0, reste: 0 },
    ],
    du: 15000, paye: 5000, reste: 10000,
  },
  {
    student_id: 'a3', name: 'NKOMO Paul', matricule: 'MAT003', className: '6eme A', section: 'secondaire_1',
    cellules: [
      { convention: 'non_inscrit' },
      { convention: 'non_inscrit' },
      { convention: 'inscrit', statut: 'due', montantDu: 15000, paye: 0, reste: 15000 },
    ],
    du: 15000, paye: 0, reste: 15000,
  },
];

const PAR_MOIS = [
  { inscrits: 2, attendu: 30000, encaisse: 20000, impaye: 10000, quotePart: 4500 },
  { inscrits: 1, attendu: 15000, encaisse: 15000, impaye: 0, quotePart: 2250 },
  { inscrits: 2, attendu: 30000, encaisse: 0, impaye: 30000, quotePart: 4500 },
];
const TOTAL = { inscrits: 5, attendu: 75000, encaisse: 35000, impaye: 40000, quotePart: 11250 };

const base = { school: ECOLE, service: SERVICE, entete: ENTETE, abonnes: ABONNES, parMois: PAR_MOIS, total: TOTAL, quotePart: 15, tarifPlein: 15000 };

// ── 1. L'ANNÉE ENTIÈRE ──────────────────────────────────────────────────────
console.log('\n— État de l’année —');
{
  const h = buildServiceEtatHtml(base);
  ok(h.startsWith('<!DOCTYPE html>'), 'document HTML complet');
  ok(h.includes('landscape'), 'l’année s’imprime en PAYSAGE (jusqu’à 12 colonnes de mois)');
  ok(h.includes('THE GENIUS INTERNATIONAL SCHOOL'), 'le nom de l’école vient des données, pas du code');
  ok(h.includes('Cantine'), 'le service est nommé');
  ok(h.includes('2026-2027'), 'l’année scolaire est portée');
  // LES TROIS ÉLÈVES, ET LES TROIS MOIS.
  ok(ABONNES.every((a) => h.includes(a.name)), 'les trois élèves figurent');
  ok(h.includes('Sep') && h.includes('Oct') && h.includes('Nov'), 'les mois abrégés en colonnes');
  ok(h.includes('Septembre 2026'), 'le libellé entier reste dans le tableau par mois');
  // LA LÉGENDE EST OBLIGATOIRE : sans elle, les signes ne veulent rien dire.
  ok(h.includes('Non souscrit') && h.includes('Exempté') && h.includes('Abandon'),
    'la légende nomme tous les états');
  ok(Object.values(SIGNES).every((d) => h.includes(d.signe)), 'chaque signe est présent');
  // LA QUOTE-PART N'EST LÀ QUE SI LE SERVICE EN A UNE.
  ok(h.includes('Quote-part'), 'la quote-part apparaît quand le service en a une');
  const sans = buildServiceEtatHtml({ ...base, quotePart: null });
  ok(!sans.includes('Quote-part'), 'et disparaît complètement quand il n’en a pas');
}

// ── 2. UN MOIS ──────────────────────────────────────────────────────────────
console.log('\n— État d’un mois —');
{
  const h = buildServiceEtatHtml({ ...base, moisCible: '2026-10' });
  ok(h.includes('portrait'), 'un mois s’imprime en PORTRAIT (huit colonnes y tiennent)');
  ok(h.includes('Octobre 2026'), 'le mois est nommé');
  ok(h.includes('Émargement'), 'une colonne d’émargement : c’est une feuille qu’on signe');
  // LE CŒUR DU CAS À LA CARTE : NKOMO n'est pas inscrit en octobre, il ne doit
  // PAS figurer sur la feuille d'octobre.
  ok(h.includes('ATANGANA Marie'), 'l’élève inscrit en octobre figure');
  ok(!h.includes('NKOMO Paul'), 'l’élève NON inscrit en octobre ne figure pas sur la feuille du mois',
    h.includes('NKOMO Paul'));
  // ABEGA est exempté en octobre : il reste sur la feuille, avec son état.
  ok(h.includes('ABEGA Loic') && h.includes('Exempté'),
    'un élève exempté reste sur la feuille, avec son état écrit');
  // LES TOTAUX SONT CEUX DU MOIS, PAS DE L'ANNÉE.
  ok(h.includes('Total du mois'), 'le total porte le mois');
  // La feuille du mois ne porte RIEN de l'année : ni la grille des douze mois,
  // ni les cartes annuelles. Vérifié sur les intitulés, et non sur un montant —
  // chercher « 75 » dans la page trouvait la couleur CSS #475569.
  ok(!h.includes('Par élève et par mois'), 'la grille annuelle n’est pas sur la feuille d’un mois');
  ok(!h.includes('Total attendu') && !h.includes('Reste à encaisser'),
    'les cartes de l’année non plus');
}

// ── 3. CE QUI NE DOIT JAMAIS ARRIVER ───────────────────────────────────────
console.log('\n— Les refus —');
{
  // Une clé de mois inconnue ne produit PAS une feuille vide trompeuse.
  const h = buildServiceEtatHtml({ ...base, moisCible: '2099-01' });
  ok(h.includes('landscape') && h.includes('Par élève et par mois'),
    'un mois inconnu retombe sur l’année entière, qui est toujours vraie');

  // Service sans aucun abonné : un message, pas un tableau vide.
  const vide = buildServiceEtatHtml({ ...base, abonnes: [], parMois: [], total: {} });
  ok(vide.includes('Aucun élève abonné'), 'aucun abonné → le document le dit');
  ok(!vide.includes('NaN') && !vide.includes('undefined'),
    'aucun NaN ni undefined dans un document vide');

  // Le filtre est ÉCRIT : un état partiel ne doit pas passer pour l'état entier.
  const filtre = buildServiceEtatHtml({ ...base, filtre: 'Section : Secondaire' });
  ok(filtre.includes('Section : Secondaire') && filtre.includes('pas sur tout le service'),
    'un filtre actif est imprimé, avec son avertissement');
  ok(!buildServiceEtatHtml(base).includes('pas sur tout le service'),
    'et rien n’est dit quand aucun filtre n’est posé');

  // L'ÉCHAPPEMENT : un nom d'élève n'est pas du HTML.
  const xss = buildServiceEtatHtml({
    ...base,
    abonnes: [{ ...ABONNES[0], name: '<script>alert(1)</script>' }],
  });
  ok(!xss.includes('<script>alert'), 'un nom d’élève est échappé, jamais interprété');
  ok(xss.includes('&lt;script&gt;'), 'et il reste lisible, échappé');
}

// ── 4. L'ABRÉVIATION DES MOIS ───────────────────────────────────────────────
console.log('\n— Abréviation —');
{
  ok(abrege('Septembre 2026') === 'Sep', 'Septembre 2026 → Sep');
  ok(abrege('January 2027') === 'Jan', 'January 2027 → Jan');
  ok(abrege('Février 2027') === 'Fév', 'les accents survivent', abrege('Février 2027'));
  ok(abrege('2026-09') === '202', 'une clé brute est coupée, pas inventée', abrege('2026-09'));
  ok(abrege('') === '—' && abrege(null) === '—', 'rien → tiret, jamais "undefined"');
}

console.log(ko() === 0 ? '\n✅ Tous les tests passent' : `\n❌ ÉCHEC : ${ko()}`);
function ko() { return fail; }
if (fail > 0) process.exit(1);
