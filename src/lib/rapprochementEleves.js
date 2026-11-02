// ════════════════════════════════════════════════════════════════════════════
// RAPPROCHER DES NOMS D'UN CLASSEUR AVEC LES ÉLÈVES DE LA BASE
// ════════════════════════════════════════════════════════════════════════════
//
// Le registre transport de THE GENIUS ne porte AUCUN matricule : 211 lignes qui
// ne disent qu'un nom et une classe. Pour écrire quoi que ce soit, il faut les
// relier aux élèves de la base — et c'est là que les imports font des dégâts.
//
// ── LA RÈGLE : UN DOUTE N'EST PAS UN RAPPROCHEMENT ─────────────────────────
//
// Un homonyme mal rattaché, c'est un abonnement transport facturé au mauvais
// enfant, et un parent qui reçoit une créance qui n'est pas la sienne. Ce
// module refuse donc de choisir dès qu'il y a plusieurs candidats : il rend
// `ambigu`, avec la liste, pour qu'un humain tranche. L'école reconnaît ses
// élèves en une seconde ; un algorithme qui parie se trompe silencieusement.
//
// Dans le fichier réel, trois lignes portent « HAMZAH » et vingt-deux noms
// apparaissent plusieurs fois. Le doute est la règle, pas l'exception.
//
// ── POURQUOI TROIS PASSES, ET DANS CET ORDRE ───────────────────────────────
//
// 1. LE NOM NORMALISÉ, à l'identique. Accents, casse, espaces doubles, tirets
//    et apostrophes écrasés — « MBASSI  MANDA YANNIS » et « Mbassi Manda
//    Yannis » sont le même enfant.
// 2. LES MOTS DANS N'IMPORTE QUEL ORDRE. Les écoles écrivent « NOM Prénom » ou
//    « Prénom NOM » selon le secrétaire et selon l'année ; les deux désignent
//    la même personne, et aucune des deux n'est fautive.
// 3. AVEC LA CLASSE EN RENFORT. Si deux élèves portent le même nom, la classe
//    du classeur peut les départager — et seulement si elle en désigne UN seul.
//
// On s'arrête à la première passe qui donne UN candidat. Jamais de passe
// « approchante » (distance d'édition) : sur des noms camerounais, elle
// confond des familles entières, et une quasi-correspondance présentée comme
// une correspondance est pire qu'un rejet.

/** Nom réduit à sa forme comparable. Ne sert JAMAIS d'affichage. */
export function normaliser(nom) {
  return String(nom ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/['’`-]/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Les mots du nom, triés : « NDJOUELA CHLOE » et « CHLOE NDJOUELA » coïncident. */
export function cleMots(nom) {
  const mots = normaliser(nom).split(' ').filter(Boolean);
  return mots.slice().sort().join(' ');
}

// La classe, réduite de la même manière. « CE2/BIL », « CE2 BIL » et « ce2/bil »
// sont la même classe ; « CL4 » et « CL4/BIL » ne le sont pas, et c'est voulu —
// la section bilingue est une classe distincte dans l'école.
export function cleClasse(c) {
  return normaliser(c).replace(/\s*\/\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Indexe les élèves de la base, une fois, pour n rapprochements.
 * @param {Array} eleves [{ id, name, matricule, className }]
 */
export function indexerEleves(eleves = []) {
  const parNom = new Map();
  const parMots = new Map();
  for (const e of eleves || []) {
    if (!e?.id) continue;
    const n = normaliser(e.name);
    if (!n) continue;
    parNom.set(n, [...(parNom.get(n) || []), e]);
    const k = cleMots(e.name);
    parMots.set(k, [...(parMots.get(k) || []), e]);
  }
  return { parNom, parMots, total: (eleves || []).length };
}

/**
 * Rapproche UNE ligne du classeur.
 * @returns {{ etat: 'trouve'|'ambigu'|'absent', eleve?: object, candidats?: Array, passe?: string }}
 */
export function rapprocher(ligne, index) {
  const nom = ligne?.nom ?? ligne?.name ?? '';
  if (!normaliser(nom)) return { etat: 'absent', candidats: [], passe: 'nom_vide' };

  const essais = [
    ['nom_exact', index.parNom.get(normaliser(nom)) || []],
    ['mots_memes', index.parMots.get(cleMots(nom)) || []],
  ];

  for (const [passe, trouves] of essais) {
    if (trouves.length === 1) return { etat: 'trouve', eleve: trouves[0], passe };
    if (trouves.length > 1) {
      // La classe en renfort, et seulement si elle désigne UN seul élève.
      const c = cleClasse(ligne?.classe);
      if (c) {
        const affines = trouves.filter((e) => cleClasse(e.className) === c);
        if (affines.length === 1) return { etat: 'trouve', eleve: affines[0], passe: passe + '_classe' };
      }
      return { etat: 'ambigu', candidats: trouves, passe };
    }
  }
  return { etat: 'absent', candidats: [], passe: 'aucune' };
}

/**
 * Rapproche TOUT un plan, et rend de quoi écrire — et de quoi envoyer à l'école.
 *
 * @param {Array} lignes  les lignes du plan (`aEcrire`)
 * @param {Array} eleves  les élèves de la base
 */
export function rapprocherPlan(lignes = [], eleves = []) {
  const index = indexerEleves(eleves);
  const prets = [];
  const aTrancher = [];
  // UN ÉLÈVE NE DOIT ÊTRE PRIS QU'UNE FOIS. Deux lignes du classeur qui
  // tombent sur le même élève, c'est deux abonnements au même enfant — et la
  // contrainte UNIQUE(student_id, fee_catalog_id, academic_year) ferait échouer
  // la seconde écriture au milieu du lot. Mieux vaut le voir avant.
  const pris = new Map();

  for (const l of lignes || []) {
    const r = rapprocher(l, index);
    if (r.etat !== 'trouve') {
      aTrancher.push({ ...l, etat: r.etat, candidats: (r.candidats || []).map((c) => ({ id: c.id, name: c.name, className: c.className, matricule: c.matricule })) });
      continue;
    }
    const dejaPris = pris.get(r.eleve.id);
    if (dejaPris) {
      aTrancher.push({
        ...l, etat: 'deja_pris', passe: r.passe,
        candidats: [{ id: r.eleve.id, name: r.eleve.name, className: r.eleve.className }],
        message: `déjà rapproché à la ligne ${dejaPris.source?.ligne ?? '?'} (« ${dejaPris.nom} »)`,
      });
      continue;
    }
    pris.set(r.eleve.id, l);
    prets.push({
      ...l,
      student_id: r.eleve.id,
      eleveBase: { name: r.eleve.name, className: r.eleve.className, matricule: r.eleve.matricule },
      passe: r.passe,
      // Un rapprochement dont la CLASSE diverge est juste quant à l'élève, mais
      // il mérite un œil : l'enfant a pu changer de classe, ou c'est un
      // homonyme que la base ne distingue pas encore.
      classeDiverge: Boolean(l.classe) && cleClasse(l.classe) !== cleClasse(r.eleve.className),
    });
  }

  return {
    prets,
    aTrancher,
    resume: {
      lignes: (lignes || []).length,
      elevesEnBase: index.total,
      prets: prets.length,
      absents: aTrancher.filter((x) => x.etat === 'absent').length,
      ambigus: aTrancher.filter((x) => x.etat === 'ambigu').length,
      dejaPris: aTrancher.filter((x) => x.etat === 'deja_pris').length,
      classeDiverge: prets.filter((x) => x.classeDiverge).length,
      parPasse: prets.reduce((m, x) => ({ ...m, [x.passe]: (m[x.passe] || 0) + 1 }), {}),
    },
  };
}
