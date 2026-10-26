// LA CLASSE BILINGUE PORTE LES DEUX PROGRAMMES — ce que ce test fixe.
//
// Demande de THE GENIUS (2026-10-19) : les quatre classes bilingues du primaire
// (`SIL BIL`, `CP BIL`, `CE1 BIL`, `CE2 BIL`) ne portent que les onze matières
// francophones, relevé fait sur la base de production. Les unités
// d'apprentissage des matières anglophones ne pouvaient donc pas s'y afficher :
// le périmètre du référentiel se déduit des lignes `subjects`.
//
// Ce que la fusion doit tenir :
//   • les deux troncs, francophone ET anglophone, pour le même niveau ;
//   • chaque côté garde SON barème (/20 et /100 — décision du responsable) ;
//   • aucune matière retirée d'office : l'école coche et décoche, et on lui dit
//     seulement quelle matière anglophone recouvre quelle matière francophone ;
//   • jamais deux matières de même libellé dans une classe ;
//   • sur une classe qui EXISTE, on n'ajoute que ce qui manque — on ne touche
//     ni aux matières en place, ni donc aux notes qui y pendent.
//
// Lancer : node src/core/_bilingualSubjects.test.mjs
import {
  bilingualSubjectChoices, buildSubjectsForBilingualClass, missingBilingualSubjects,
  isBilingualClass, mergeBilingualCatalog, BAREME_FR, BAREME_EN,
  siblingClassCandidates, mergeFromSiblingClass, missingFromSiblingClass,
  niveauPartage, defaultSiblingClass, memeMatiere,
} from './bilingualSubjects.js';
// Le moteur classique, INCHANGÉ : c'est lui qui doit rester juste avec deux barèmes.
import { calcFR } from './bulletinEngine.js';

// Même normalisation que le module, pour vérifier les dédoublonnages.
const norm_ = (s) => String(s ?? '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

let pass = 0, fail = 0;
const ok = (c, label, got) => {
  if (c) { console.log(`✅ ${label}`); pass++; }
  else { console.log(`❌ ${label} (obtenu: ${JSON.stringify(got)})`); fail++; }
};
let n = 0;
const makeId = () => `s${++n}`;

// Les quatre classes réelles de THE GENIUS : system FR, cycle primaire.
const SIL_BIL  = { id: 'c-sil',  school_id: 'ecole', name: 'SIL BIL',  level: 'SIL', system: 'FR' };
const CE2_BIL  = { id: 'c-ce2',  school_id: 'ecole', name: 'CE2 BIL',  level: 'CE2', system: 'FR' };
const SIXIEME  = { id: 'c-6e',   school_id: 'ecole', name: '6eme BIL', level: '6ème', system: 'FR' };
const FORM1    = { id: 'c-f1',   school_id: 'ecole', name: 'FORM1',    level: 'Form 1', system: 'EN' };

// ── 1. Les deux troncs sont là, chacun avec son barème ─────────────────────
{
  const choix = bilingualSubjectChoices(SIL_BIL);
  const fr = choix.filter((c) => c.cote === 'FR');
  const en = choix.filter((c) => c.cote === 'EN');

  ok(fr.length > 0 && en.length > 0, 'une classe bilingue du primaire propose les deux côtés',
    { fr: fr.length, en: en.length });
  ok(fr.every((c) => c.max === BAREME_FR), 'les matières francophones sont sur /20', fr.map((c) => c.max));
  ok(en.every((c) => c.max === BAREME_EN), 'les matières anglophones sont sur /100', en.map((c) => c.max));
  ok(choix.every((c) => c.retenue === true), 'rien n’est décoché d’office : « fusionne les deux »',
    choix.filter((c) => !c.retenue));
  ok(en.some((c) => /english/i.test(c.name)), 'English est proposée sur une classe FR bilingue', en.map((c) => c.name));
  ok(fr.some((c) => /fran/i.test(c.name)), 'Français reste proposé', fr.map((c) => c.name));
}

// ── 2. Aucun doublon de libellé, et les équivalences sont signalées ────────
{
  const choix = bilingualSubjectChoices(SIL_BIL);
  const libelles = choix.map((c) => c.name.toLowerCase());
  ok(new Set(libelles).size === libelles.length, 'jamais deux matières de même libellé', libelles);

  const maths = choix.find((c) => c.name === 'Mathematics');
  ok(maths?.equivalent === 'Mathématiques', 'Mathematics est signalée comme équivalente de Mathématiques', maths);
  const anglais = choix.find((c) => c.name === 'Anglais');
  ok(anglais?.equivalent && /english/i.test(anglais.equivalent),
    'Anglais est signalée comme équivalente de la matière anglophone de langue', anglais);
  const eps = choix.find((c) => c.name === 'Physical Education');
  ok(eps?.equivalent === 'EPS', 'Physical Education renvoie à EPS', eps);
  ok(choix.filter((c) => c.equivalent).length >= 6,
    'les recouvrements sont nommés, pas devinés par l’école', choix.filter((c) => c.equivalent).length);
}

// ── 3. Le secondaire marche aussi (classique comme APC) ───────────────────
{
  const choix6 = bilingualSubjectChoices(SIXIEME);
  ok(choix6.some((c) => c.cote === 'FR') && choix6.some((c) => c.cote === 'EN'),
    'une 6ème bilingue propose les deux troncs du premier cycle',
    { fr: choix6.filter((c) => c.cote === 'FR').length, en: choix6.filter((c) => c.cote === 'EN').length });

  // Une classe déclarée EN donne la MÊME fusion : le côté de la classe ne
  // décide plus de ce qu'elle peut porter.
  const choixF1 = bilingualSubjectChoices(FORM1);
  ok(choixF1.some((c) => c.cote === 'FR') && choixF1.some((c) => c.cote === 'EN'),
    'une Form 1 bilingue propose aussi les deux troncs',
    { fr: choixF1.filter((c) => c.cote === 'FR').length, en: choixF1.filter((c) => c.cote === 'EN').length });
}

// ── 4. Lignes `subjects` prêtes à écrire ──────────────────────────────────
{
  n = 0;
  const rows = buildSubjectsForBilingualClass({ cls: CE2_BIL, makeId });
  ok(rows.length === bilingualSubjectChoices(CE2_BIL).length, 'une ligne par matière retenue', rows.length);
  ok(rows.every((r) => r.class_id === 'c-ce2' && r.school_id === 'ecole'),
    'chaque ligne porte la classe et l’école', rows[0]);
  ok(rows.map((r) => r.position).join(',') === rows.map((_, i) => i).join(','),
    'les positions sont consécutives et dans l’ordre proposé', rows.map((r) => r.position));
  ok(rows.every((r) => r.coef >= 1), 'aucun coefficient nul', rows.map((r) => r.coef));
  ok(new Set(rows.map((r) => r.id)).size === rows.length, 'des identifiants distincts', rows.map((r) => r.id));

  // L'école retire ce qu'elle n'enseigne pas, et surcharge un coefficient.
  const choisi = buildSubjectsForBilingualClass({
    cls: CE2_BIL, makeId, keep: ['Français', 'Mathématiques', 'English', 'Mathematics'],
    coefs: { English: 5 },
  });
  ok(choisi.length === 4, 'seules les matières cochées sont créées', choisi.map((r) => r.name));
  ok(choisi.find((r) => r.name === 'English')?.coef === 5, 'le coefficient saisi par l’école est respecté', choisi);
  ok(choisi.find((r) => r.name === 'English')?.max === BAREME_EN
     && choisi.find((r) => r.name === 'Français')?.max === BAREME_FR,
    'chaque matière garde le barème de son côté même après tri', choisi);
}

// ── 5. Sur une classe QUI EXISTE : on n'ajoute que ce qui manque ──────────
{
  // État réel de SIL BIL en production : onze matières francophones.
  const existing = [
    'Français', 'Mathématiques', 'Anglais', 'Éveil scientifique / SVT', 'Histoire-Géographie',
    'Éducation Civique et Morale', 'TIC', 'Arts / Dessin', 'EPS', 'Musique', 'Chinois',
  ].map((name, i) => ({ id: `old${i}`, name, class_id: 'c-sil', max: 20, position: i }));

  n = 0;
  const ajouts = missingBilingualSubjects({ cls: SIL_BIL, existing, makeId });
  ok(ajouts.length > 0, 'il y a bien des matières anglophones à ajouter', ajouts.length);
  ok(ajouts.every((r) => r.cote === undefined), 'les ajouts sont des lignes `subjects`, pas des choix', ajouts[0]);
  ok(ajouts.every((a) => !existing.some((e) => e.name.toLowerCase() === a.name.toLowerCase())),
    'aucune matière déjà présente n’est recréée (donc aucune note menacée)', ajouts.map((r) => r.name));
  ok(ajouts.every((r) => r.max === BAREME_EN), 'les matières ajoutées sont anglophones, sur /100', ajouts.map((r) => r.max));
  ok(ajouts[0].position === existing.length, 'les ajouts se rangent APRÈS les matières en place', ajouts[0].position);
  ok(ajouts.some((r) => /english/i.test(r.name)) && ajouts.some((r) => /mathematics/i.test(r.name)),
    'English et Mathematics entrent — ce sont elles qui portent les UA anglophones', ajouts.map((r) => r.name));

  // Rejouer le geste ne doit rien recréer.
  const deuxieme = missingBilingualSubjects({
    cls: SIL_BIL, existing: [...existing, ...ajouts], makeId,
  });
  ok(deuxieme.length === 0, 'le geste est idempotent : deux fois ne double rien', deuxieme.map((r) => r.name));
}

// ── 6. Reconnaître une classe déjà bilingue, sans colonne en base ─────────
{
  const frSeules = ['Français', 'Mathématiques', 'Anglais'].map((name, i) => ({ id: `f${i}`, name }));
  const lesDeux  = [...frSeules, { id: 'e1', name: 'English' }, { id: 'e2', name: 'Mathematics' }];

  ok(isBilingualClass(SIL_BIL, frSeules) === false,
    'une classe qui ne porte que le programme francophone n’est pas bilingue', false);
  ok(isBilingualClass(SIL_BIL, lesDeux) === true,
    'une classe qui porte les deux programmes est reconnue bilingue', true);
  ok(isBilingualClass(SIL_BIL, []) === false, 'une classe sans matière n’est pas bilingue', false);
  ok(isBilingualClass(null, lesDeux) === false, 'aucune classe : pas bilingue', false);
}

// ── 7. Catalogue fusionné : chaque libellé avec le barème de son monde ────
{
  const catalogueFr = ['Français', 'Mathématiques', 'Musique', 'Arts / Dessin'];
  const catalogueEn = ['English', 'Mathematics', 'Music', 'Arts'];

  const fusion = mergeBilingualCatalog({ cls: SIL_BIL, catalogueFr, catalogueEn });
  const parNom = Object.fromEntries(fusion.map((e) => [e.name, e]));

  ok(fusion[0].cote === 'FR', 'sur une classe FR, le catalogue francophone vient en tête', fusion[0]);
  ok(parNom['English']?.max === BAREME_EN && parNom['Français']?.max === BAREME_FR,
    'chaque libellé porte le barème de son sous-système', { en: parNom['English'], fr: parNom['Français'] });
  ok(fusion.filter((e) => norm_(e.name) === 'music').length <= 1
     && fusion.length === new Set(fusion.map((e) => norm_(e.name))).size,
    'aucun libellé proposé deux fois', fusion.map((e) => e.name));
  ok(parNom['Mathematics'] && parNom['Mathématiques'],
    'les deux libellés de mathématiques restent proposables : c’est le point du bilinguisme',
    Object.keys(parNom));

  const fusionEn = mergeBilingualCatalog({ cls: FORM1, catalogueFr, catalogueEn });
  ok(fusionEn[0].cote === 'EN', 'sur une classe EN, le catalogue anglophone vient en tête', fusionEn[0]);

  ok(mergeBilingualCatalog({ cls: SIL_BIL, catalogueFr: [], catalogueEn: [] }).length === 0,
    'catalogues vides : rien à proposer', []);
}

// ── 8. Cas limites ────────────────────────────────────────────────────────
{
  ok(bilingualSubjectChoices(null).length === 0, 'aucune classe : aucune proposition', null);
  ok(buildSubjectsForBilingualClass({ cls: null, makeId }).length === 0, 'aucune classe : aucune ligne', null);
  ok(bilingualSubjectChoices({ name: 'Aula 1', level: 'Primero', system: 'ES' }).length === 0,
    'système ES : pas de fusion bilingue (aucun tronc classique défini)', 'ES');
}

// ── 9. LE BULLETIN EST LE MÊME, avec deux barèmes dans la même colonne ────
//
// « C'est le même bulletin, juste bilingue : certaines matières en FR et
// d'autres en EN » (THE GENIUS, 2026-10-19). Il n'y a donc PAS de maquette à
// écrire — mais il faut prouver que la moyenne reste juste quand une classe
// porte des matières /20 ET des matières /100. `calcFR` normalise chaque note
// par le barème de SA matière avant de remettre à l'échelle de sortie : c'est
// ce qui rend la fusion possible sans toucher au moteur. Ce test verrouille ce
// comportement — s'il tombe, les bulletins bilingues deviennent faux en silence.
{
  const subs = [
    { id: 'fr1', name: 'Français', coef: 4, max: 20 },
    { id: 'en1', name: 'English', coef: 4, max: 100 },
  ];
  // 15/20 et 75/100 : exactement 75 % des deux côtés.
  const moy = calcFR({ fr1: '15', en1: '75' }, subs, 20);
  ok(moy === 15, 'deux matières à 75 % donnent 15/20, quel que soit leur barème', moy);

  // Un 100/100 ne doit pas peser comme un 100/20 : sans normalisation, la
  // moyenne exploserait (c'était le risque de la fusion).
  const moy2 = calcFR({ fr1: '10', en1: '100' }, subs, 20);
  ok(moy2 === 15, 'un 100/100 vaut 20/20, pas davantage', moy2);

  // Une matière anglophone non notée n'entre ni au numérateur ni au dénominateur.
  const moy3 = calcFR({ fr1: '12' }, subs, 20);
  ok(moy3 === 12, 'une matière anglophone non évaluée ne pénalise pas l’élève', moy3);

  // Le coefficient joue son rôle, côtés mélangés.
  const pondere = calcFR({ fr1: '20', en1: '50' }, [
    { id: 'fr1', name: 'Français', coef: 3, max: 20 },
    { id: 'en1', name: 'English', coef: 1, max: 100 },
  ], 20);
  ok(pondere === 17.5, 'les coefficients pondèrent les deux barèmes ensemble', pondere);
}

// ── 10. LA VRAIE FUSION : les matières des deux classes jumelles ──────────
//
// « CE1 BIL = fusion des matières de Class 1 + CE1 » (THE GENIUS, 2026-10-19).
// Donc PAS un tronc type : les matières telles que l'école les a posées, avec
// SES coefficients, SES barèmes, et jusqu'aux matières qui ne figurent à aucun
// référentiel. Les trois listes ci-dessous sont celles de la production.
{
  const ce1Bil = ['Anglais|2|20', 'Arts / Dessin|1|20', 'Éducation Civique et Morale|1|20',
    'EPS|1|20', 'Éveil scientifique / SVT|2|20', 'Français|4|20', 'Histoire-Géographie|2|20',
    'Mathématiques|4|20', 'Musique|1|20', 'TIC|1|20', 'Travaux Pratiques|1|20']
    .map((x, k) => { const [name, coef, max] = x.split('|'); return { id: `b${k}`, name, coef: +coef, max: +max }; });
  const class1 = ['Arts|1|100', 'Chinois|1|100', 'Citizenship|1|100', 'Computer Studies|1|100',
    'English|4|100', 'French|2|100', 'French Language|1|100', 'Mathematics|4|100', 'Music|1|100',
    'Physical Education|1|100', 'Science|2|100', 'Social Studies|2|100']
    .map((x, k) => { const [name, coef, max] = x.split('|'); return { id: `a${k}`, name, coef: +coef, max: +max }; });

  const cls = { id: 'c-ce1bil', school_id: 'ecole', name: 'CE1 BIL', level: 'CE1', cycle: 'primaire', system: 'FR', current_year: '2026-2027' };
  const jum = { id: 'c-class1', school_id: 'ecole', name: 'Class 1 A', level: 'Class 1', cycle: 'primaire', system: 'EN', current_year: '2026-2027' };

  const fusion = mergeFromSiblingClass({ cls, classSubjects: ce1Bil, sibling: jum, siblingSubjects: class1 });
  ok(fusion.length === 23, 'les 11 matières de CE1 BIL + les 12 de Class 1 font 23 lignes', fusion.length);
  ok(fusion.filter((f) => f.origine === 'classe').length === 11
     && fusion.filter((f) => f.origine === 'jumelle').length === 12,
    'chaque ligne sait d’où elle vient', fusion.map((f) => f.origine).join(','));
  ok(fusion.find((f) => f.name === 'Travaux Pratiques') && fusion.find((f) => f.name === 'Chinois'),
    'les matières HORS RÉFÉRENTIEL traversent la fusion', fusion.map((f) => f.name));
  ok(fusion.find((f) => f.name === 'English')?.max === 100
     && fusion.find((f) => f.name === 'English')?.coef === 4,
    'une matière de la jumelle garde SON coefficient et SON barème', fusion.find((f) => f.name === 'English'));
  ok(fusion.find((f) => f.name === 'Mathématiques')?.max === 20
     && !fusion.some((f) => f.name === 'Mathematics' && f.deja),
    'Mathématiques /20 reste, Mathematics /100 s’ajoute : les deux coexistent',
    fusion.filter((f) => /math/i.test(f.name)));

  n = 0;
  const ajouts = missingFromSiblingClass({ cls, classSubjects: ce1Bil, sibling: jum, siblingSubjects: class1, makeId });
  ok(ajouts.length === 12, 'douze matières à ajouter, pas une de plus', ajouts.length);
  ok(ajouts.every((a) => !ce1Bil.some((e) => e.name.toLowerCase() === a.name.toLowerCase())),
    'aucune matière déjà portée n’est recréée', ajouts.map((a) => a.name));
  ok(ajouts[0].position === 11, 'les ajouts se rangent après les matières en place', ajouts[0].position);
  ok(ajouts.every((a) => a.class_id === 'c-ce1bil' && a.school_id === 'ecole'), 'rattachées à la bonne classe', ajouts[0]);

  const rejoue = missingFromSiblingClass({ cls, classSubjects: [...ce1Bil, ...ajouts], sibling: jum, siblingSubjects: class1, makeId });
  ok(rejoue.length === 0, 'rejouer la fusion ne double rien', rejoue.map((a) => a.name));

  const choisi = missingFromSiblingClass({ cls, classSubjects: ce1Bil, sibling: jum, siblingSubjects: class1, makeId,
    keep: ['English', 'Mathematics', 'Science'] });
  ok(choisi.length === 3, 'l’école ne retient que ce qu’elle enseigne', choisi.map((a) => a.name));
}

// ── 11. LES VRAIES CORRESPONDANCES DE NIVEAU ──────────────────────────────
//
// « C'est un exemple, à toi de trouver les vraies correspondances » (THE GENIUS,
// 2026-10-19). Elles ne sont pas inventées ici : `engineResolver` les porte
// déjà, parce que les référentiels nationaux en dépendent — un seul slug pour
// « Class 3 » et « CE1 ». Ce test les CONSTATE, et verrouille la seule que ce
// module ajoute : le premier cycle, où FR et EN gardent des slugs distincts.
{
  const paires = [
    [{ name: 'SIL', level: 'SIL' },            { name: 'Class 1 A', level: 'Class 1' }],
    [{ name: 'CP', level: 'CP' },              { name: 'Class 2', level: 'Class 2' }],
    [{ name: 'CE1 BIL', level: 'CE1' },        { name: 'Class 3', level: 'Class 3' }],
    [{ name: 'CE2 BIL', level: 'CE2' },        { name: 'Class 4', level: 'Class 4' }],
    [{ name: 'CM1', level: 'CM1' },            { name: 'Class 5', level: 'Class 5' }],
    [{ name: 'CM2', level: 'CM2' },            { name: 'Class 6', level: 'Class 6' }],
    [{ name: 'PRE-MATERNELLE A', level: 'Petite Section' }, { name: 'NURSERY 1 B', level: 'Nursery 1' }],
    [{ name: 'MS', level: 'Moyenne Section' }, { name: 'NURSERY 2 A', level: 'Nursery 2' }],
    [{ name: '6eme', level: '6ème' },          { name: 'FORM1', level: 'Form 1' }],
    [{ name: '5eme', level: '5ème' },          { name: 'FORM2', level: 'Form 2' }],
    [{ name: '3eme', level: '3ème' },          { name: 'FORM4', level: 'Form 4' }],
    [{ name: '2nde', level: '2nde' },          { name: 'FORM5', level: 'Form 5' }],
    [{ name: '1ere A', level: '1ère' },        { name: 'Lower Sixth', level: 'Lower Sixth' }],
    [{ name: 'Tle D', level: 'Terminale' },    { name: 'Upper Sixth', level: 'Upper Sixth' }],
  ];
  for (const [fr, en] of paires) {
    const a = niveauPartage(fr), b = niveauPartage(en);
    ok(a !== null && a === b, `${fr.name} ↔ ${en.name} : même niveau (${a})`, { fr: a, en: b });
  }
  // Et ce qui ne doit PAS s'apparier.
  ok(niveauPartage({ name: 'CE1', level: 'CE1' }) !== niveauPartage({ name: 'Class 1', level: 'Class 1' }),
    'CE1 n’est PAS Class 1 — Class 1 est la SIL', {
      ce1: niveauPartage({ name: 'CE1', level: 'CE1' }),
      class1: niveauPartage({ name: 'Class 1', level: 'Class 1' }),
    });
  ok(niveauPartage({ name: 'CRECHES', level: '' }) === 'mat:ps',
    'une crèche est rattachée au niveau le plus jeune du référentiel', niveauPartage({ name: 'CRECHES', level: '' }));
  ok(niveauPartage({ name: 'Groupe A', level: '' }) === null,
    'un libellé que nul référentiel ne reconnaît n’a pas de niveau partagé', niveauPartage({ name: 'Groupe A', level: '' }));
}

// ── 12. Quelle jumelle l'écran propose, et ce qu'il laisse choisir ────────
{
  // Les classes réelles de THE GENIUS, primaire et maternelle confondus.
  const classes = [
    { id: 'c1', name: 'CE1', level: 'CE1', cycle: 'primaire', system: 'FR', current_year: '2026-2027' },
    { id: 'c2', name: 'Class 1 A', level: 'Class 1', cycle: 'primaire', system: 'EN', current_year: '2026-2027' },
    { id: 'c3', name: 'Class 3', level: 'Class 3', cycle: 'primaire', system: 'EN', current_year: '2026-2027' },
    { id: 'c4', name: 'NURSERY 2 A', level: 'Nursery 2', cycle: 'maternelle', system: 'EN', current_year: '2026-2027' },
    { id: 'c5', name: 'Class 6', level: 'Class 6', cycle: 'primaire', system: 'EN', current_year: '2025-2026' },
    { id: 'c6', name: 'CE1 BIL', level: 'CE1', cycle: 'primaire', system: 'FR', current_year: '2026-2027' },
  ];
  const cls = classes.find((c) => c.name === 'CE1 BIL');
  const cands = siblingClassCandidates(cls, classes);
  const noms = cands.map((c) => c.name);

  ok(noms.includes('Class 1 A') && noms.includes('Class 3'),
    'toutes les classes anglophones du même cycle restent proposées', noms);
  ok(!noms.includes('NURSERY 2 A'), 'une classe d’un AUTRE cycle n’est pas proposée', noms);
  ok(!noms.includes('Class 6'), 'une classe d’une autre année n’est pas proposée', noms);
  ok(!noms.includes('CE1') && !noms.includes('CE1 BIL'),
    'ni la classe elle-même ni une classe de son propre sous-système', noms);
  ok(noms[0] === 'Class 3', 'le niveau ÉQUIVALENT vient en tête de liste', noms);
  ok(cands.find((c) => c.name === 'Class 3')?.equivalent === true
     && cands.find((c) => c.name === 'Class 1 A')?.equivalent === false,
    'l’écran peut dire laquelle est au bon niveau', cands.map((c) => [c.name, c.equivalent]));

  const parDefaut = defaultSiblingClass(cls, classes);
  ok(parDefaut?.name === 'Class 3', 'CE1 BIL propose Class 3 par défaut, pas Class 1', parDefaut?.name);

  // Aucune classe du niveau équivalent : on ne propose RIEN plutôt que les
  // matières d'un autre niveau.
  const sansEquiv = classes.filter((c) => c.name !== 'Class 3');
  ok(defaultSiblingClass(cls, sansEquiv) === null,
    'pas de jumelle au bon niveau ⇒ aucune proposition par défaut', defaultSiblingClass(cls, sansEquiv));
  ok(siblingClassCandidates(cls, sansEquiv).some((c) => c.name === 'Class 1 A'),
    '… mais l’école garde la main pour apparier autrement',
    siblingClassCandidates(cls, sansEquiv).map((c) => c.name));
}

// ── LA MATIÈRE DÉJÀ PORTÉE SOUS UN AUTRE NOM N'EST PAS REPROPOSÉE ──────────
//
// Mesuré chez THE GENIUS le 2026-10-26 : FORM1 et FORM2 portaient ICT (41 et 15
// notes), Literature in English (21 et 17) et ML, et « Ajouter le programme
// manquant » avait posé À CÔTÉ Computer Science, English Literature et Manual
// Labour, vides. Le bulletin imprimait les deux lignes, la copie en ABS ;
// l'école décochait la copie et elle revenait, parce que le rapprochement se
// faisait sur le LIBELLÉ EXACT.
{
  ok(memeMatiere('ICT', 'Computer Science'), 'ICT et Computer Science = le même enseignement');
  ok(memeMatiere('Computer Studies', 'ict'), 'Computer Studies aussi, dans les deux sens');
  ok(memeMatiere('Literature in English', 'English Literature'), 'Literature in English = English Literature');
  ok(memeMatiere('ML', 'Manual Labour'), 'ML = Manual Labour');
  ok(memeMatiere('Mathematics', 'Mathematics'), 'identité de libellé : inchangé');
  ok(!memeMatiere('Mathematics', 'Mathématiques'), 'les deux langues restent DEUX matières');

  // Le point qui ne doit pas bouger : une classe bilingue peut enseigner les
  // deux français. On SIGNALE l'équivalence (EQUIVALENCES), on ne la confond pas.
  ok(!memeMatiere('Français intensif', 'French Language'),
    'Français intensif et French Language ne sont pas fusionnés');
  ok(!memeMatiere('Biology', 'Chemistry'), 'deux matières différentes le restent');
  ok(!memeMatiere('', 'Biology') && !memeMatiere('Biology', null), 'libellé vide : jamais une correspondance');

  const clsF2 = { id: 'c1', school_id: 's1', name: 'FORM2', level: 'Form 2', system: 'FR', cycle: 'secondaire' };
  const porte = (noms) => noms.map((name, i) => ({ id: 's' + i, class_id: 'c1', name }));

  // Avant : « Computer Science » était reproposée alors qu’ICT portait 15 notes.
  const avecIct = missingBilingualSubjects({ cls: clsF2, existing: porte(['ICT']), makeId: (n) => n });
  ok(!avecIct.some((r) => norm_(r.name) === 'computer science'),
    'ICT en place ⇒ Computer Science n’est plus reproposée',
    avecIct.map((r) => r.name).join(' | '));

  // … et ce qui manque VRAIMENT reste proposé : le geste garde son sens.
  ok(avecIct.some((r) => norm_(r.name) === 'mathematics'),
    'les matières réellement absentes restent proposées');

  // Sans la matière, rien ne change : le comportement d'origine est conservé.
  const sansRien = missingBilingualSubjects({ cls: clsF2, existing: [], makeId: (n) => n });
  ok(sansRien.some((r) => norm_(r.name) === 'computer science'),
    'classe vide ⇒ Computer Science est bien proposée');

  // Rejouer le geste ne doit RIEN ajouter : c’est ce qui fabriquait les doublons.
  const apres = porte(['ICT'].concat(sansRien.filter((r) => norm_(r.name) !== 'computer science').map((r) => r.name)));
  const reste = missingBilingualSubjects({ cls: clsF2, existing: apres, makeId: (n) => n });
  ok(reste.length === 0, 'programme complet (ICT comprise) ⇒ plus rien à ajouter',
    reste.map((r) => r.name).join(' | '));
}

// … ET LA FUSION DEPUIS LA CLASSE JUMELLE SUIT LA MÊME RÈGLE ─────────────
// C'est l'autre chemin qui pose des matières : si la jumelle anglophone porte
// « Computer Science » et la classe « ICT », proposer la première refait le
// doublon. Ce qui manque vraiment reste proposé.
{
  const cls = { id: 'c-bil', school_id: 'ecole', name: 'FORM2', level: 'Form 2', system: 'FR', cycle: 'secondaire' };
  const jum = { id: 'c-en', school_id: 'ecole', name: 'Form 2 EN', level: 'Form 2', system: 'EN', cycle: 'secondaire' };
  const aMoi = [{ id: 'a1', name: 'ICT', coef: 2, max: 20 }];
  const chezElle = [{ id: 'b1', name: 'Computer Science', coef: 2, max: 100 },
                    { id: 'b2', name: 'Mathematics', coef: 4, max: 100 }];
  const ajouts = missingFromSiblingClass({
    cls, classSubjects: aMoi, sibling: jum, siblingSubjects: chezElle, makeId: (n) => n,
  });
  ok(!ajouts.some((a) => norm_(a.name) === 'computer science'),
    'jumelle : Computer Science n’est pas ajoutée à une classe qui a déjà ICT',
    ajouts.map((a) => a.name).join(' | '));
  ok(ajouts.some((a) => norm_(a.name) === 'mathematics'),
    'jumelle : ce qui manque vraiment est toujours ajouté',
    ajouts.map((a) => a.name).join(' | '));
  const fusion = mergeFromSiblingClass({ cls, classSubjects: aMoi, sibling: jum, siblingSubjects: chezElle });
  ok(fusion.filter((f) => memeMatiere(f.name, 'Computer Science')).length === 1,
    'la fusion montre UNE seule ligne pour cet enseignement',
    fusion.map((f) => f.name + (f.deja ? ' (déjà)' : '')).join(' | '));
}

console.log(`\n${pass} ok, ${fail} ko`);
process.exit(fail ? 1 : 0);
