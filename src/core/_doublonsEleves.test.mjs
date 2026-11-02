// LES DOUBLONS D'ÉLÈVES — TROIS NIVEAUX, ET CE QUI NE DOIT JAMAIS ALERTER
//
// Consigne du 2026-11-01, reprise cas par cas ci-dessous :
//
//   « Critères : date de naissance + lieu de naissance (obligatoire pour un
//     doublon fort), avec similarité de nom (fautes de frappe, nom/prénom
//     inversés, accents, casse, espaces, tirets), et renforcement par adresse,
//     nom des parents ou tuteurs, téléphone du parent et matricule.
//     […] Les frères et sœurs et les jumeaux ne doivent PAS déclencher une
//     alerte forte. […] Alerte, jamais blocage. »
//
// ET LE DÉFAUT QUI MOTIVE TOUT : l'ancien moteur lisait `birth_date` quand la
// colonne s'appelle `date_naissance`. Il ne voyait donc aucune date, retombait
// sur le nom seul, et REFUSAIT deux homonymes réels. Les deux derniers blocs
// vérifient que ce n'est plus possible — et sur le vrai nom de colonne.
//
//   node src/core/_doublonsEleves.test.mjs
import {
  NIVEAU, normNom, normTel, normDate, normLieu, distance, motsProches, nomsProches,
  comparerDates, comparerLieux, renforts, comparerEleves, estMemeFiche,
  clePaire, lireNonDoublons, pairesNonDoublons, marquerNonDoublon,
  clesRegroupement, detecterDoublons, doublonsPourCandidat, phraseAlerte, lignesExport,
} from './doublonsEleves.js';

let echecs = 0;
const ok = (cond, libelle, obtenu) => {
  if (cond) console.log(`OK   ${libelle}`);
  else { console.log(`KO   ${libelle} (obtenu: ${JSON.stringify(obtenu)})`); echecs++; }
};
const titre = (s) => console.log(`\n-- ${s} --`);

// ── Normalisations ─────────────────────────────────────────────────────────
titre('normalisations : accents, casse, espaces, tirets, telephone, dates');
{
  ok(normNom('  Mbàllá-Jean   Pierre ') === 'MBALLA JEAN PIERRE', 'accents, tirets, espaces doubles', normNom('  Mbàllá-Jean   Pierre '));
  ok(normNom('MBALLA  JEAN') === normNom('mballa jean'), 'la casse ne distingue pas');
  ok(normTel('+237 674 75 36 54') === normTel('674753654'), 'indicatif et espaces ignores', normTel('+237 674 75 36 54'));
  ok(normTel('123') === '', 'un numero trop court ne vaut rien');
  ok(normDate('2015-02-20T00:00:00.000Z') === '2015-02-20', 'un horodatage ISO se reduit a la date');
  ok(normDate('20/02/2015') === '2015-02-20', 'une date saisie a la francaise est comprise', normDate('20/02/2015'));
  ok(normDate('') === '' && normDate('n/a') === '', 'une date illisible ne vaut rien');
  ok(normLieu('Né à Douala') === 'DOUALA', 'le bruit « ne a » disparait', normLieu('Né à Douala'));
  ok(normLieu('DOUALA 3E ARRONDISSEMENT') === 'DOUALA 3E', 'l arrondissement ne distingue pas', normLieu('DOUALA 3E ARRONDISSEMENT'));
}

titre('distance et proximite des mots');
{
  ok(distance('MBALLA', 'MBALLA') === 0, 'deux mots identiques sont a distance 0');
  ok(distance('MBALLA', 'MBALA') === 1, 'une lettre en moins = 1');
  ok(distance('MBALLA', 'TOTALEMENT AUTRE', 2) === 3, 'la distance est abandonnee au-dela du plafond');
  ok(motsProches('MBALLA', 'MBALA'), 'une faute de frappe sur un nom long rapproche');
  ok(!motsProches('ALI', 'ALY'), 'sur trois lettres, une faute change le prenom');
  ok(!motsProches('JEAN', 'JEANNE'), 'JEAN et JEANNE restent deux prenoms (quatre lettres : aucune tolerance)');
  ok(!motsProches('NOM1', 'NOM7'), 'et deux valeurs courtes voisines ne se confondent pas');
  ok(!motsProches('PIERRE', 'MARTINE'), 'deux prenoms differents ne se rapprochent pas');
}

titre('proximite des noms : sans ordre, avec fautes, avec un prenom en plus');
{
  ok(nomsProches('MBALLA JEANNE', 'JEANNE MBALLA').proche, 'nom et prenom inverses');
  ok(nomsProches('MBALLA JEANNE', 'JEANNE MBALLA').inverse, 'et l inversion est signalee comme telle');
  ok(nomsProches('EWODO AYISSI JUAN PAOLO', 'EWODO AYISSI JUAN PAOLO JUNIOR').proche, 'un suffixe ajoute (cas du 26/08/2026)');
  ok(nomsProches('MBALLA JEAN PIERRE', 'MBALA JEAN PIERRE').proche, 'une faute de frappe sur le nom de famille');
  ok(nomsProches('Mbàllá Jean', 'MBALLA  JEAN').identique, 'accents et espaces : noms IDENTIQUES');
  ok(!nomsProches('MBALLA JEANNE', 'MBALLA PIERRE').proche, 'deux enfants d une meme famille ne sont pas proches');
  ok(!nomsProches('MOHAMED', 'MOHAMED ALI').proche, 'un seul mot commun ne prouve rien');
  ok(!nomsProches('NGO BELL', 'NGO BELL MARIE CLAIRE JOSEPHINE').proche, 'trois prenoms d ecart : deux noms differents');
}

// ── Les trois niveaux, cas par cas ─────────────────────────────────────────
const BASE = {
  nom_pere: 'EWODO PAUL', nom_mere: 'AYISSI MARIE',
  adresse: 'BASTOS', parent_phone: '674753654',
};

titre('DOUBLON FORT : meme date + meme lieu + noms tres proches');
{
  const a = { id: 'a', name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2015-02-20', lieu_naissance: 'Douala', ...BASE };
  const b = { id: 'b', name: 'EWODO AYISSI JUAN PAOLO JUNIOR', date_naissance: '2015-02-20', lieu_naissance: 'DOUALA', ...BASE };
  const r = comparerEleves(a, b);
  ok(r.niveau === NIVEAU.FORT, 'niveau FORT', r.niveau);
  ok(r.raisons.includes('même date de naissance') && r.raisons.includes('même lieu de naissance'),
    'les deux criteres obligatoires sont nommes', r.raisons);
  ok(r.renforts.length === 3, 'telephone, parents et adresse renforcent', r.renforts);
  ok(/même enfant/.test(phraseAlerte(r)), 'la phrase d alerte est explicite', phraseAlerte(r));
}

titre('DOUBLON FORT : le matricule est un identifiant, pas un indice');
{
  const r = comparerEleves(
    { id: 'a', name: 'TOUT AUTRE NOM', matricule: 'ELV-001' },
    { id: 'b', name: 'ENCORE UN AUTRE', matricule: 'elv 001' },
  );
  ok(r.niveau === NIVEAU.FORT && r.raisons[0] === 'même matricule', 'meme matricule → FORT', r);
}

titre('A VERIFIER : le lieu manque, ou la date est a un chiffre pres');
{
  // Le cas du 26/08/2026 tel qu'il est VRAIMENT en base : aucun lieu de
  // naissance saisi. Le lieu etant obligatoire pour le niveau fort, la paire
  // ressort « a verifier » — avec trois renforts affiches, donc en tete du
  // rapport. C'est une de-escalade assumee par rapport a l'ancien BLOCK.
  const sansLieu = comparerEleves(
    { id: 'a', name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2015-02-20', ...BASE },
    { id: 'b', name: 'EWODO AYISSI JUAN PAOLO JUNIOR', date_naissance: '2015-02-20', ...BASE },
  );
  ok(sansLieu.niveau === NIVEAU.VERIFIER, 'sans lieu de naissance : A VERIFIER, pas FORT', sansLieu.niveau);
  ok(sansLieu.raisons.some((x) => /lieu de naissance absent/.test(x)), 'et la raison le dit', sansLieu.raisons);
  ok(sansLieu.score > 20, 'le score monte avec les renforts (tri du rapport)', sansLieu.score);

  const jourMois = comparerEleves(
    { id: 'a', name: 'NKOULOU BERTRAND', date_naissance: '2016-03-07', lieu_naissance: 'Yaounde' },
    { id: 'b', name: 'NKOULOU BERTRAND', date_naissance: '2016-07-03', lieu_naissance: 'Yaounde' },
  );
  ok(jourMois.niveau === NIVEAU.VERIFIER, 'jour et mois inverses : A VERIFIER', jourMois.niveau);

  const unChiffre = comparerEleves(
    { id: 'a', name: 'NKOULOU BERTRAND', date_naissance: '2016-03-07' },
    { id: 'b', name: 'NKOULOU BERTRAND', date_naissance: '2016-03-08' },
  );
  ok(unChiffre.niveau === NIVEAU.VERIFIER, 'un chiffre d ecart : A VERIFIER', unChiffre.niveau);

  const aucuneDate = comparerEleves(
    { id: 'a', name: 'MBALLA JEAN PIERRE' },
    { id: 'b', name: 'MBALLA JEAN PIERRE' },
  );
  ok(aucuneDate.niveau === NIVEAU.VERIFIER, 'aucune date nulle part : A VERIFIER', aucuneDate.niveau);
}

titre('AUCUNE ALERTE : les homonymes — le defaut que le responsable a vu');
{
  // « Mêmes noms ou prénoms courants avec date ou lieu de naissance
  // différents » : aucune alerte. L'ancien moteur en faisait un BLOCK.
  const r = comparerEleves(
    { id: 'a', name: 'MOHAMED ALI', date_naissance: '2015-02-20', lieu_naissance: 'Douala' },
    { id: 'b', name: 'MOHAMED ALI', date_naissance: '2017-09-03', lieu_naissance: 'Garoua' },
  );
  ok(r.niveau === NIVEAU.AUCUN, 'deux dates differentes : AUCUNE alerte', r.niveau);
  ok(phraseAlerte(r) === '', 'et aucune phrase a afficher');

  // Meme avec TOUS les renforts : la date tranchee differente ferme le dossier.
  const avecRenforts = comparerEleves(
    { id: 'a', name: 'MOHAMED ALI', date_naissance: '2015-02-20', lieu_naissance: 'Douala', ...BASE },
    { id: 'b', name: 'MOHAMED ALI', date_naissance: '2017-09-03', lieu_naissance: 'Douala', ...BASE },
  );
  ok(avecRenforts.niveau === NIVEAU.AUCUN, 'un renfort ne ressuscite pas une alerte fermee', avecRenforts.niveau);
}

titre('FRATRIE ET JUMEAUX : tout concorde sauf le prenom');
{
  const jumeaux = [
    { id: 'a', name: 'EWODO AYISSI MARIE', date_naissance: '2015-02-20', lieu_naissance: 'Douala', ...BASE },
    { id: 'b', name: 'EWODO AYISSI CLAIRE', date_naissance: '2015-02-20', lieu_naissance: 'Douala', ...BASE },
  ];
  const r = comparerEleves(jumeaux[0], jumeaux[1]);
  ok(r.niveau === NIVEAU.AUCUN, 'des jumeaux ne declenchent AUCUNE alerte', r.niveau);
  ok(r.fratrie === true, 'mais la fratrie est reconnue, et peut etre affichee comme information');

  const scan = detecterDoublons(jumeaux, { inclureFratrie: true });
  ok(scan.paires.length === 0, 'le scan ne signale aucun doublon', scan.paires.length);
  ok(scan.fratries.length === 1, 'et range la paire parmi les fratries', scan.fratries.length);

  const fratrie = comparerEleves(
    { id: 'a', name: 'MBALLA JEANNE', date_naissance: '2014-05-02', lieu_naissance: 'Kribi', ...BASE },
    { id: 'b', name: 'MBALLA PIERRE', date_naissance: '2016-11-30', lieu_naissance: 'Kribi', ...BASE },
  );
  ok(fratrie.niveau === NIVEAU.AUCUN, 'un frere et une soeur non jumeaux : rien non plus', fratrie.niveau);
}

// ── La mémoire des décisions ───────────────────────────────────────────────
titre('« ce n est pas un doublon » se memorise, des deux cotes');
{
  ok(clePaire('b', 'a') === clePaire('a', 'b'), 'la cle de paire ne depend pas de l ordre');

  const a = { id: 'a', name: 'MBALLA JEAN PIERRE' };
  const b = { id: 'b', name: 'MBALLA JEAN PIERRE' };
  ok(doublonsPourCandidat(a, [b]).niveau === NIVEAU.VERIFIER, 'avant decision : la paire est signalee');

  const patchs = marquerNonDoublon(a, b);
  ok(patchs.length === 2, 'deux correctifs : la decision est ecrite sur les deux fiches', patchs);
  ok(JSON.parse(patchs[0].non_doublons)[0] === 'b', 'la fiche a retient b', patchs[0]);

  const a2 = { ...a, non_doublons: patchs[0].non_doublons };
  const b2 = { ...b, non_doublons: patchs[1].non_doublons };
  ok(lireNonDoublons(a2)[0] === 'b', 'la colonne se relit en texte JSON');
  ok(lireNonDoublons({ non_doublons: ['x'] })[0] === 'x', 'et en tableau (IndexedDB)');
  ok(lireNonDoublons({ non_doublons: 'pas du json' }).length === 0, 'une valeur illisible ne casse rien');

  ok(doublonsPourCandidat(a2, [b2]).candidats.length === 0, 'apres decision : plus aucune alerte');
  ok(detecterDoublons([a2, b2]).paires.length === 0, 'le scan complet la respecte aussi');
  ok(pairesNonDoublons([a2, b2]).size === 1, 'une seule paire tranchee, pas deux', pairesNonDoublons([a2, b2]).size);

  ok(marquerNonDoublon(a2, b2).length === 0, 'retrancher la meme paire n ecrit rien');
  // La suppression d'une fiche ne fait pas revenir l'alerte sur l'autre : la
  // decision est portee par les DEUX, donc elle survit a la perte d'une.
  ok(detecterDoublons([b2, { id: 'c', name: 'MBALLA JEAN PIERRE' }]).paires.length === 1,
    'une troisieme fiche, elle, est bien signalee');
}

// ── Le scan de toute la base ───────────────────────────────────────────────
titre('scan complet : toutes classes confondues, sans comparer toutes les paires');
{
  const registre = [
    { id: '1', class_id: 'c1', name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2015-02-20', lieu_naissance: 'Douala' },
    { id: '2', class_id: 'c2', name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2015-02-20', lieu_naissance: 'Douala' },
    { id: '3', class_id: 'c3', name: 'MOHAMED ALI', date_naissance: '2014-01-01', lieu_naissance: 'Garoua' },
    { id: '4', class_id: 'c1', name: 'MOHAMED ALI', date_naissance: '2016-06-06', lieu_naissance: 'Maroua' },
    { id: '5', class_id: 'c2', name: 'NGO BELL SARAH', date_naissance: '2015-09-09' },
    { id: '6', class_id: 'c4', name: 'NGO BELL SARA', date_naissance: '2015-09-09' },
  ];
  const r = detecterDoublons(registre);
  ok(r.paires.length === 2, 'deux paires signalees sur six eleves', r.paires.map((p) => `${p.a.id}-${p.b.id}`));
  ok(r.paires[0].niveau === NIVEAU.FORT, 'le doublon fort arrive en tete', r.paires[0]);
  ok(r.paires[0].a.class_id !== r.paires[0].b.class_id, 'et il traverse deux classes',
    [r.paires[0].a.class_id, r.paires[0].b.class_id]);
  ok(r.paires[1].niveau === NIVEAU.VERIFIER, 'la paire a verifier suit (faute sur SARA/SARAH)', r.paires[1].raisons);
  ok(!r.paires.some((p) => p.a.name === 'MOHAMED ALI'), 'les deux MOHAMED ALI ne sont pas signales');
  ok(r.stats.comparaisons < 15, 'et toutes les paires n ont PAS ete comparees', r.stats.comparaisons);
}

titre('le regroupement reste borne quand la base grandit');
{
  // 700 eleves — la taille reelle de l'ecole du responsable — avec des noms
  // camerounais composes de vraies syllabes, parce que c'est la FORME des noms
  // qui decide de la taille des paquets. (Une premiere version de ce banc
  // nommait les fiches « NOM1 PRENOM1 », « NOM2 PRENOM2 »... : tout le monde
  // tombait dans le meme paquet et le scan refaisait les 244 650 comparaisons.
  // Le banc mesurait alors sa propre maladresse.)
  const FAM = ['MBALLA', 'NKOULOU', 'EWODO', 'NGONO', 'ATANGANA', 'BIYA', 'MOUKOKO', 'ESSOMBA',
    'TCHOUMI', 'KAMGA', 'NJOYA', 'FOTSO', 'ABEGA', 'MANGA', 'ONANA', 'BELLA', 'EYENGA', 'OWONA',
    'SADJO', 'HAMIDOU', 'ALHADJI', 'DJOMO', 'TAGNE', 'WANDJI', 'NDONGO'];
  const PRE = ['JEAN', 'MARIE', 'PAUL', 'CLAIRE', 'BERTRAND', 'SARAH', 'JUSTINE', 'EMMANUEL',
    'LAURE', 'SERGE', 'FATIMA', 'IBRAHIM', 'AICHA', 'OUSMANE', 'CELINE', 'VALERIE', 'ARMAND',
    'DANIELLE', 'LANDRY', 'PATRICIA', 'THEODORE', 'YANNICK', 'BLAISE', 'ROSINE', 'HERVE',
    'CHANTAL', 'DIEUDONNE', 'MIREILLE'];
  const gros = [];
  for (let i = 0; i < 700; i++) {
    const f = FAM[i % FAM.length];
    const p1 = PRE[i % PRE.length];
    const p2 = PRE[(i * 7 + 3) % PRE.length];
    gros.push({
      id: `g${i}`, class_id: `c${i % 13}`, name: `${f} ${p1} ${p2}`,
      // Des dates etalees sur six ans : deux eleves qui partagent un nom
      // partagent rarement la date, et c'est bien ce que le moteur exige.
      date_naissance: `20${10 + (i % 6)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      lieu_naissance: ['DOUALA', 'YAOUNDE', 'BAFOUSSAM', 'GAROUA', 'KRIBI'][i % 5],
    });
  }
  const t0 = Date.now();
  const r = detecterDoublons(gros);
  const ms = Date.now() - t0;
  ok(r.stats.comparaisons < 20000, `comparaisons bornees (${r.stats.comparaisons} au lieu de 244 650)`, r.stats.comparaisons);
  ok(ms < 2000, `le scan tient en moins de 2 s (${ms} ms)`, ms);
  ok(r.paires.length === 0, 'aucun doublon invente sur 700 fiches distinctes', r.paires.map((p) => `${p.a.name} / ${p.b.name}`).slice(0, 5));

  // DES HOMONYMES VOLONTAIRES, puisque c'est le cas que le responsable a vu mal
  // traite : trois « MBALLA JEAN PAUL », trois dates, trois villes.
  const avecHomonymes = [...gros,
    { id: 'h1', name: 'MBALLA JEAN PAUL', date_naissance: '2014-03-02', lieu_naissance: 'DOUALA' },
    { id: 'h2', name: 'MBALLA JEAN PAUL', date_naissance: '2016-09-21', lieu_naissance: 'GAROUA' },
    { id: 'h3', name: 'Mballa  Jean-Paul', date_naissance: '2012-01-30', lieu_naissance: 'KRIBI' },
  ];
  const rh = detecterDoublons(avecHomonymes);
  ok(rh.paires.length === 0, 'trois homonymes de dates et de villes differentes : AUCUNE alerte',
    rh.paires.map((p) => `${p.a.id}/${p.b.id} ${p.niveau}`));

  // Et il trouve l'aiguille : un vrai doublon glisse dans les 700.
  const avecDoublon = [...gros, { ...gros[42], id: 'copie' }];
  const r2 = detecterDoublons(avecDoublon);
  ok(r2.paires.length === 1 && r2.paires[0].niveau === NIVEAU.FORT,
    'le doublon cache dans 700 fiches est trouve', r2.paires.map((p) => p.niveau));

  // LE CAS DEFAVORABLE, pour qu'il soit mesure et non suppose : 300 eleves qui
  // portent TOUS les deux memes noms. Il n'existe plus de cle qui les separe —
  // le paquet vaut toute l'ecole, et le cout redevient quadratique. Le moteur
  // ne s'effondre pas pour autant, et c'est tout ce qu'on lui demande ici.
  const memeFamille = Array.from({ length: 300 }, (_, i) => ({
    id: `f${i}`, name: 'MBALLA JEAN',
    date_naissance: `20${10 + (i % 6)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    lieu_naissance: ['DOUALA', 'YAOUNDE'][i % 2],
  }));
  const t1 = Date.now();
  const rf = detecterDoublons(memeFamille);
  const ms1 = Date.now() - t1;
  ok(ms1 < 3000, `300 homonymes parfaits : ${ms1} ms, sans effondrement`, ms1);
  // Ce qui ressort est exactement ce que la regle prevoit, et rien d autre :
  // FORT quand la date ET le lieu concordent, A VERIFIER quand la date concorde
  // mais pas le lieu. Jamais une paire dont les dates diffèrent.
  ok(rf.paires.every((p) => p.dates === 'identique' || p.dates === 'voisine'),
    'aucune paire signalee dont les dates divergent franchement',
    [...new Set(rf.paires.map((p) => p.dates))]);
  ok(rf.paires.filter((p) => p.niveau === NIVEAU.FORT).every((p) => p.dates === 'identique' && p.lieux !== 'different'),
    'les FORT ont tous la meme date ET un lieu qui concorde',
    rf.paires.filter((p) => p.niveau === NIVEAU.FORT).slice(0, 3).map((p) => [p.dates, p.lieux]));
  ok(rf.paires.filter((p) => p.niveau === NIVEAU.VERIFIER)
    .every((p) => p.dates === 'voisine' || p.lieux === 'different'),
  'les A VERIFIER sont ceux dont la date est a un chiffre pres, ou le lieu diverge',
  rf.paires.filter((p) => p.niveau === NIVEAU.VERIFIER).slice(0, 3).map((p) => [p.dates, p.lieux]));
}

titre('cles de regroupement');
{
  const cles = clesRegroupement({ name: 'MBALLA Jean', date_naissance: '2015-02-20', parent_phone: '674753654' });
  ok(cles.includes('d:2015-02-20'), 'la date est une cle', cles);
  ok(cles.includes('p:JEAN+MBAL'), 'la PAIRE de mots est une cle, triee donc insensible a l ordre', cles);
  ok(cles.includes('t:674753654'), 'le telephone du parent aussi', cles);
  ok(clesRegroupement({ name: 'A B' }).length === 0, 'des mots de moins de 3 lettres ne regroupent rien');
  // La faute de frappe EN FIN de mot ne separe pas les deux fiches.
  const a = clesRegroupement({ name: 'MBALLA JEAN' });
  const b = clesRegroupement({ name: 'MBALA JEAN' });
  ok(a.some((c) => b.includes(c)), 'MBALLA et MBALA tombent dans le meme paquet', [a, b]);
  // Un prenom ajoute non plus.
  const c3 = clesRegroupement({ name: 'MBALLA JEAN PIERRE' });
  ok(a.some((c) => c3.includes(c)), 'un prenom en plus garde une cle commune');
}

// ── Le garde de création (import) ──────────────────────────────────────────
titre('le garde de creation : refuser la MEME saisie, laisser passer le reste');
{
  const existant = { id: 'a', name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2015-02-20', lieu_naissance: 'Douala' };
  ok(estMemeFiche(existant, { id: 'b', ...existant, id: 'b' }), 'la meme ligne reimportee est la meme fiche');
  ok(estMemeFiche({ id: 'a', name: 'X', matricule: 'ELV-1' }, { id: 'b', name: 'Y', matricule: 'elv 1' }),
    'le meme matricule aussi');
  ok(!estMemeFiche(existant, { id: 'b', name: 'EWODO AYISSI JUAN PAOLO JUNIOR', date_naissance: '2015-02-20', lieu_naissance: 'Douala' }),
    'un nom SEULEMENT proche n est pas « la meme fiche » : la secretaire tranche');
  ok(!estMemeFiche(existant, { id: 'b', name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2017-01-01', lieu_naissance: 'Douala' }),
    'deux homonymes de dates differentes ne sont pas la meme fiche');
  ok(!estMemeFiche(existant, { id: 'b', name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2015-02-20', lieu_naissance: 'Garoua' }),
    'meme nom, meme date, DEUX LIEUX : deux enfants differents, on laisse passer');
  ok(estMemeFiche({ id: 'a', name: 'MBALLA JEAN' }, { id: 'b', name: 'mballa  jean' }),
    'sans aucune date ni lieu, le nom identique suffit (ancienne regle, conservee)');
  ok(!estMemeFiche(existant, existant), 'une fiche ne se compare pas a elle-meme');
}

titre('aucune entree ne fait tomber le moteur');
{
  ok(comparerEleves(null, null).niveau === NIVEAU.AUCUN, 'deux nulls');
  ok(comparerEleves({ id: 'a' }, { id: 'b' }).niveau === NIVEAU.AUCUN, 'deux fiches sans nom');
  ok(detecterDoublons(null).paires.length === 0, 'un registre nul');
  ok(detecterDoublons([null, undefined, { name: 'SANS ID' }]).paires.length === 0, 'des lignes sans id');
  ok(doublonsPourCandidat(null, []).niveau === NIVEAU.AUCUN, 'un candidat nul');
  ok(renforts(null, null).length === 0, 'des renforts sur rien');
}


titre('le fichier exporte : ce que le responsable relit');
{
  const registre = [
    { id: '1', class_id: 'c1', name: 'EWODO AYISSI JUAN PAOLO', date_naissance: '2015-02-20', lieu_naissance: 'Douala', matricule: 'ELV-1' },
    { id: '2', class_id: 'c2', name: 'EWODO AYISSI JUAN PAOLO JUNIOR', date_naissance: '2015-02-20', lieu_naissance: 'Douala', parent_phone: '674753654' },
    { id: '3', archived_at: '2026-09-01', name: 'MBALLA JEAN PIERRE' },
    { id: '4', class_id: 'c3', name: 'MBALLA JEAN PIERRE' },
  ];
  const classes = [{ id: 'c1', name: '6e A' }, { id: 'c2', name: 'CM2' }, { id: 'c3', name: '5e B' }];
  const r = detecterDoublons(registre);
  const lignes = lignesExport(r, { classes });

  ok(lignes.length === r.paires.length + 1, 'une ligne d en-tete, puis une par paire', lignes.length);
  ok(lignes[0][0] === 'Niveau' && lignes[0].length === 13, 'treize colonnes, en-tete compris', lignes[0]);
  const fort = lignes.slice(1).find((l) => l[0] === 'Doublon probable');
  ok(!!fort, 'le doublon probable est dans le fichier');
  ok(fort[2] === '6e A' && fort[4] === 'CM2', 'LA CLASSE de chaque fiche y figure — sans elle, on ne peut pas aller voir', [fort[2], fort[4]]);
  ok(/même date de naissance/.test(fort[11]), 'les raisons sont ecrites en clair', fort[11]);

  const archive = lignes.slice(1).find((l) => l[1] === 'MBALLA JEAN PIERRE' || l[3] === 'MBALLA JEAN PIERRE');
  ok(archive && (archive[2] === 'archivé' || archive[4] === 'archivé'),
    'une fiche archivee est annoncee comme telle (c est la cause la plus frequente du doublon)', archive);

  const en = lignesExport(r, { classes, t: (fr, ang) => ang });
  ok(en[0][0] === 'Level', 'la langue de l en-tete est injectee, pas codee dans le moteur', en[0][0]);
  ok(lignesExport(null).length === 1, 'un resultat vide ne rend que l en-tete');
}

console.log(`\n${echecs === 0 ? 'TOUS LES CONTROLES PASSENT' : `${echecs} ECHEC(S)`}`);
process.exit(echecs === 0 ? 0 : 1);
