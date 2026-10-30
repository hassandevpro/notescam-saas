// LES JEUX DE DONNÉES DU CARNET PRIMAIRE — une seule définition.
//
// Deux bancs les utilisent (`bulletin-prim-visual.mjs` pour le rendu et les
// images, `print-capacity-bulletin.mjs` pour la capacité). Les garder en double
// était la garantie qu'un jour l'un prouverait quelque chose que l'autre ne
// voit pas.
//
// AUCUNE donnée d'établissement n'est en dur dans le gabarit : tout ce qui
// suit imite des DONNÉES, telles que l'application les lit de la base.

export const school = {
  id: 'sch-ref', name: 'The Genius International School',
  country_code: 'cameroon', current_year: '2026-2027',
  address: '1443 Bafoussam', phone: '690 56 76 76',
  region: 'Ouest', division: 'Mifi',
};

export const cls = { id: 'cls-ce1', name: 'CE1 BIL', level: 'CE1', system: 'FR' };

export const student = {
  id: 'st-ref', name: 'FOMETHE DIVINA-GRACE ISIS', matricule: 'GEN260118',
  date_naissance: '2019-10-16', lieu_naissance: 'YAOUNDE', gender: 'F',
  nom_pere: 'FOMETHE ANACLET', nom_mere: 'FOMETHE ALEXANDRA LAURE',
  parent_phone: '699541044', statut: '',
};

export const CRITERES = [
  { id: 'cr-o', nom: 'Oral' }, { id: 'cr-e', nom: 'Écrit' },
  { id: 'cr-p', nom: 'Pratique' }, { id: 'cr-s', nom: 'Savoir-être' },
];

// Les 16 lignes du bulletin de référence : 11 nationales + 5 maison, les
// maison intercalées entre 6A et 6B comme sur le modèle de l'école.
export const LIGNES_REF = [
  ['1A', 'Communiquer en français', 'langues'],
  ['1B', 'Communicate in English', 'langues'],
  ['1C', 'Pratiquer une langue nationale', 'langues'],
  ['2A', 'Utiliser les notions de base en mathématiques', 'maths_sciences'],
  ['2B', 'Utiliser les notions de base en sciences et technologies', 'maths_sciences'],
  ['3A', 'Pratiquer les valeurs sociales', 'vie_citoyennete'],
  ['3B', 'Pratiquer les valeurs citoyennes', 'vie_citoyennete'],
  ['4A', "Démontrer l'autonomie, l'esprit d'initiative, la créativité et l'entrepreneuriat", 'autonomie'],
  ['5A', 'Utiliser les concepts de base et les outils des TIC', 'tic'],
  ['6A', 'Pratiquer les activités physiques et sportives', 'arts_sport'],
  ['CH', 'Chinois', null],
  ['EC', 'Economics', null],
  ['MA', 'Management', null],
  ['PW', 'Practical Work', null],
  ['TP', 'Travaux Pratiques', null],
  ['6B', 'Pratiquer les activités artistiques', 'arts_sport'],
];

export const COTE_BAREME = [
  { cote: 'A+', libelle: 'Très bien acquis', seuil_min: 90 },
  { cote: 'A', libelle: 'Acquis', seuil_min: 75 },
  { cote: 'ECA', libelle: "En cours d'acquisition", seuil_min: 55 },
  { cote: 'NA', libelle: 'Non acquis', seuil_min: 0 },
];

/** Construit les lignes. `notees` = faut-il des notes, ou un carnet vierge ? */
export function lignes(def, notees) {
  return def.map(([code, intitule, domaine], i) => {
    const parCritere = {};
    for (const [j, c] of CRITERES.entries()) {
      parCritere[c.id] = notees ? { note: 11 + ((i + j) % 9), max: 20 } : null;
    }
    return {
      code, intitule, domaine, parCritere,
      achieved: notees ? 52 + (i % 9) : null,
      possible: notees ? 80 : null,
      cote: notees ? ['A+', 'A', 'ECA', 'NA'][i % 4] : null,
      nonEvaluee: false,
    };
  });
}

export const base = (rows, extra = {}) => ({
  school, cls, student, sys: 'FR', effectif: 8, periodLabel: 'Trimestre 1',
  critereColumns: CRITERES, rows,
  niveauTotal: 300, groupes: true, coteBareme: COTE_BAREME,
  mentions: { avertissement: 'non', tableauHonneur: 'non', encouragement: 'non' },
  signatureParent: true, titulaire: 'KONGYUY DELPHINE', pt: 9,
  ...extra,
});

/** Un carnet VIERGE : aucune note, toutes les compétences non évaluées. */
export const vierge = (def = LIGNES_REF) => {
  const rows = lignes(def, false);
  return base(rows, {
    overall: { achieved: null, possible: null, pct: null, evaluees: 0, nonEvaluees: rows.length },
    nonEvalueesCodes: rows.map((r) => r.code),
    moyenneGenerale: null, coteGenerale: null, rank: null,
  });
};

/** Entièrement noté, avec tous les blocs de pied que l'école remplit. */
export const note = (def = LIGNES_REF) => {
  const rows = lignes(def, true);
  const ach = rows.reduce((a, r) => a + r.achieved, 0);
  const pos = rows.reduce((a, r) => a + r.possible, 0);
  return base(rows, {
    overall: { achieved: ach, possible: pos, pct: (ach / pos) * 100, evaluees: rows.length, nonEvaluees: 0 },
    nonEvalueesCodes: [],
    moyenneGenerale: 13.68, coteGenerale: 'A', rank: 3,
    appreciationGenerale: 'Travail sérieux et régulier.',
    decision: 'Admise en classe supérieure',
    statsClasse: { premier: 16.9, dernier: 7.1, generale: 12.4 },
  });
};

/** Peu de compétences : le cas qui laissait un tiers de page blanc. */
export const peu = () => {
  const rows = lignes(LIGNES_REF.slice(0, 6), true);
  const ach = rows.reduce((a, r) => a + r.achieved, 0);
  const pos = rows.reduce((a, r) => a + r.possible, 0);
  return base(rows, {
    overall: { achieved: ach, possible: pos, pct: (ach / pos) * 100, evaluees: 6, nonEvaluees: 0 },
    nonEvalueesCodes: [], moyenneGenerale: 14.2, coteGenerale: 'A', rank: 2,
  });
};

/**
 * Cas extrême : noms de parents très longs, un intitulé qui court sur trois
 * lignes, une appréciation longue, la répartition de classe, et les 22 lignes.
 */
export const extreme = () => {
  const def = LIGNES_REF.map((l, i) => (i === 7
    ? [l[0], "Démontrer l'autonomie, l'esprit d'initiative, la créativité et l'esprit "
      + "d'entrepreneuriat dans la conduite de projets personnels et collectifs menés "
      + 'en classe comme en dehors de la classe tout au long de l’année scolaire', l[2]]
    : l));
  const rows = lignes([...def, ...def.slice(0, 6).map((l, i) => [`Z${i}`, l[1], l[2]])], true);
  const ach = rows.reduce((a, r) => a + r.achieved, 0);
  const pos = rows.reduce((a, r) => a + r.possible, 0);
  return base(rows, {
    student: {
      ...student,
      name: 'NGUEMA ONDOA MARIE-CLAIRE JOSÉPHINE BERTHE',
      nom_pere: 'NGUEMA ONDOA JEAN-BAPTISTE EMMANUEL DE LA CROIX',
      nom_mere: 'MBALLA ATANGANA MARIE-THÉRÈSE FRANÇOISE ANGÈLE',
      tuteur: 'ESSOMBA NKOULOU PIERRE-CÉLESTIN',
    },
    overall: { achieved: ach, possible: pos, pct: (ach / pos) * 100, evaluees: rows.length, nonEvaluees: 0 },
    nonEvalueesCodes: [],
    moyenneGenerale: 12.07, coteGenerale: 'ECA', rank: 14,
    appreciationGenerale: 'Élève appliquée et volontaire, qui gagnerait à soigner la '
      + 'présentation de ses travaux écrits et à participer davantage à l’oral.',
    decision: 'Admise en classe supérieure sous réserve du conseil de cycle',
    statsClasse: { premier: 17.8, dernier: 5.4, generale: 11.9 },
    repartition: [
      { label: '[0-4.99]', n: 2 }, { label: '[5-9.99]', n: 6 }, { label: '[10-11.99]', n: 8 },
      { label: '[12-13.99]', n: 9 }, { label: '[14-15.99]', n: 5 }, { label: '[16-20]', n: 2 },
    ],
  });
};

/**
 * Un carnet de `n` compétences, noté. C'est la famille qui prouve le
 * remplissage DANS LES DEUX SENS : 4 lignes doivent remplir la page autant que
 * 22, sans jamais la dépasser.
 */
export const aNLignes = (n) => {
  const def = [];
  for (let i = 0; i < n; i++) {
    const src = LIGNES_REF[i % LIGNES_REF.length];
    def.push([i < LIGNES_REF.length ? src[0] : `X${i}`, src[1], src[2]]);
  }
  return note(def);
};
