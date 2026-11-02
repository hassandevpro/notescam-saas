// ════════════════════════════════════════════════════════════════════════════
// DOUBLONS D'ÉLÈVES — LE MÊME ENFANT DANS DEUX CLASSES
// ════════════════════════════════════════════════════════════════════════════
// Moteur PUR : aucun store, aucun réseau, aucune dépendance. Banc : _doublonsEleves.test.mjs
//
// POURQUOI CE MODULE EXISTE ALORS QUE `lib/studentDuplicate.js` EXISTAIT DÉJÀ.
// L'ancien moteur lisait `candidat.birth_date` et `s.birth_date`. La colonne
// s'appelle `date_naissance`. Il ne voyait donc JAMAIS une date de naissance, et
// se rabattait sur la seule règle qui restait : « même nom, aucune date des deux
// côtés → BLOCK ». D'où les deux symptômes rapportés par le responsable :
//
//   • la détection semblait porter sur le nom seul — c'était le cas ;
//   • deux VRAIS homonymes, nés à deux dates et dans deux villes différentes,
//     étaient REFUSÉS à l'inscription.
//
// Son banc d'essai passait parce que ses jeux d'essai écrivaient `birth_date`,
// comme le code. Deux erreurs d'accord qui se validaient l'une l'autre.
//
// ── LES TROIS NIVEAUX, tels que le responsable les a posés le 2026-11-01 ────
//
//   FORT      même date de naissance + même lieu de naissance + noms très
//             proches. Ou le même matricule, qui est un identifiant.
//             Le lieu est OBLIGATOIRE pour ce niveau : sans lui, on ne monte pas.
//
//   VERIFIER  noms très proches, mais la date ou le lieu manque, ou diffère d'un
//             cran (faute de frappe, jour et mois inversés, orthographe du lieu).
//
//   AUCUN     noms proches mais date ET lieu renseignés et différents : ce sont
//             deux homonymes, et « MOHAMED » est un prénom courant. Aucune
//             alerte : une alerte qui se déclenche pour rien finit ignorée, puis
//             le vrai doublon passe avec les autres.
//
// ── LA FRATRIE ET LES JUMEAUX NE SONT PAS DES DOUBLONS ─────────────────────
// Deux jumeaux partagent la date, le lieu, l'adresse, les parents et le
// téléphone. Tout concorde SAUF le prénom. C'est pourquoi la proximité des noms
// est un PRÉALABLE à toute alerte, et non un indice parmi d'autres : sans elle,
// on ne monte même pas à VERIFIER. La comparaison le dit explicitement
// (`fratrie: true`), pour que l'écran puisse l'afficher comme une information.
//
// ── CE QUE LE MODULE NE FAIT PAS ───────────────────────────────────────────
// Il ne FUSIONNE pas. Rapprocher des notes, des versements et des abonnements
// sous une seule fiche, puis archiver l'autre, se décide fiche par fiche et se
// relit : cette version SIGNALE et laisse la secrétaire ouvrir les deux fiches.
// Une fusion automatique qui se trompe coûte plus cher que le doublon.
// ════════════════════════════════════════════════════════════════════════════

export const NIVEAU = Object.freeze({
  AUCUN:    'aucun',
  VERIFIER: 'verifier',
  FORT:     'fort',
});

// Majuscules, sans accents, sans ponctuation, espaces réduits. Couvre d'un coup
// la casse, les accents, les tirets, les espaces doubles.
export function normNom(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

// Les neuf derniers chiffres : « +237 674 75 36 54 » et « 674753654 » sont le
// même numéro, et c'est sous ces deux formes qu'était saisi le doublon de 2026.
export function normTel(v) {
  const d = String(v ?? '').replace(/\D+/g, '');
  return d.length >= 8 ? d.slice(-9) : '';
}

// Une date comparable : la partie date d'un ISO, ou JJ/MM/AAAA tel que saisi à
// la main dans les fichiers d'import.
export function normDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (fr) return `${fr[3]}-${String(fr[2]).padStart(2, '0')}-${String(fr[1]).padStart(2, '0')}`;
  return '';
}

// Un lieu de naissance est saisi à la main, donc écrit de dix façons. On retire
// le bruit qui ne distingue rien : « né à », l'arrondissement, le département.
const BRUIT_LIEU = /\b(NE|NEE|A|AU|AUX|DE|DU|DES|LA|LE|LES|VILLE|ARRONDISSEMENT|ARR|QUARTIER|DEPARTEMENT|REGION|CAMEROUN|CMR)\b/g;
export function normLieu(v) {
  return normNom(v).replace(BRUIT_LIEU, ' ').replace(/\s+/g, ' ').trim();
}

export const motsNom = (v) => normNom(v).split(' ').filter(Boolean);

// Distance de Levenshtein, abandonnée dès qu'elle dépasse `max` : inutile de
// savoir que deux noms sont à sept corrections l'un de l'autre.
export function distance(a, b, max = 2) {
  const s = String(a ?? ''), t = String(b ?? '');
  if (s === t) return 0;
  if (Math.abs(s.length - t.length) > max) return max + 1;
  let prec = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cour = [i];
    let mini = i;
    for (let j = 1; j <= t.length; j++) {
      const coup = s[i - 1] === t[j - 1] ? 0 : 1;
      cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + coup);
      if (cour[j] < mini) mini = cour[j];
    }
    if (mini > max) return max + 1;   // toute la ligne dépasse : inutile de continuer
    prec = cour;
  }
  return prec[t.length];
}

// Deux MOTS sont-ils le même, à la frappe près ? La tolérance suit la longueur,
// et elle est VOLONTAIREMENT AVARE sur les mots courts : sur quatre lettres, une
// faute change le mot — « ALI » et « ALY », « PAUL » et « RAUL », « NOM1 » et
// « NOM7 » sont des valeurs différentes, pas des fautes de frappe. C'est le banc
// d'essai qui a tranché : avec une tolérance d'une faute dès quatre lettres, un
// registre de 700 élèves produisait 121 fausses alertes.
//
// Le prix : « ABDOU » saisi « ABDU » ne se rapproche plus. Assumé — une alerte
// qui se déclenche pour rien finit ignorée, et c'est le vrai doublon qui passe.
export function motsProches(a, b) {
  const x = String(a ?? ''), y = String(b ?? '');
  if (!x || !y) return false;
  if (x === y) return true;
  const n = Math.min(x.length, y.length);
  const [court, long] = x.length <= y.length ? [x, y] : [y, x];

  // LA LETTRE FINALE QUI MANQUE est le cas le plus fréquent de tous :
  // « SARA » / « SARAH », « FATIMA » / « FATIMAH », « ABDOU » / « ABDOUL ».
  // Un mot entièrement contenu au DÉBUT de l'autre, à une lettre près, est le
  // même prénom. Une lettre REMPLACÉE, elle, ne l'est pas — et deux lettres
  // ajoutées non plus (« JEAN » et « JEANNE » sont deux prénoms).
  if (n >= 4 && long.length - court.length === 1 && long.startsWith(court)) return true;
  if (n <= 4) return false;

  const tolerance = n <= 7 ? 1 : 2;
  return distance(x, y, tolerance) <= tolerance;
}

// Deux NOMS sont-ils très proches ? Comparaison SANS ORDRE : « MBALLA JEANNE »
// et « JEANNE MBALLA » sont le même enfant saisi par deux secrétaires. Chaque
// mot du nom le plus court doit retrouver un mot du plus long, à la frappe près.
//
// Deux mots au minimum : un seul mot commun ne prouve rien (« MOHAMED »).
// Deux mots d'écart au maximum : au-delà, ce sont deux noms différents.
export function nomsProches(a, b) {
  const ta = motsNom(a), tb = motsNom(b);
  if (!ta.length || !tb.length) return { proche: false, identique: false, ecart: 0 };
  const [court, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const ecart = long.length - court.length;
  if (court.length < 2 || ecart > 2) {
    return { proche: false, identique: false, ecart };
  }
  const reste = [...long];
  let fautes = 0;
  for (const mot of court) {
    let i = reste.indexOf(mot);
    if (i === -1) {
      i = reste.findIndex((m) => motsProches(m, mot));
      if (i === -1) return { proche: false, identique: false, ecart };
      fautes++;
    }
    reste.splice(i, 1);
  }
  return {
    proche: true,
    identique: ta.length === tb.length && fautes === 0 && normNom(a) === normNom(b),
    ecart,
    fautes,
    inverse: fautes === 0 && ecart === 0 && normNom(a) !== normNom(b),
  };
}

// ── DATES ───────────────────────────────────────────────────────────────────
// « d'un cran » (le mot du responsable) couvre ce qui arrive vraiment : une
// faute de frappe sur un chiffre, et le jour et le mois inversés — 03/07 saisi
// 07/03, l'erreur classique entre un fichier anglophone et un fichier
// francophone, dans un pays qui tient les deux.
export function comparerDates(a, b) {
  const x = normDate(a), y = normDate(b);
  if (!x || !y) return 'inconnue';
  if (x === y) return 'identique';
  const [ax, mx, jx] = x.split('-');
  const [ay, my, jy] = y.split('-');
  if (ax === ay && mx === jy && jx === my) return 'voisine';   // jour et mois inversés
  if (distance(x.replace(/-/g, ''), y.replace(/-/g, ''), 1) <= 1) return 'voisine';
  return 'differente';
}

// ── LIEUX ───────────────────────────────────────────────────────────────────
// « DOUALA » et « DOUALA 3E » désignent la même naissance. L'un contenu dans
// l'autre vaut donc « voisin », pas « différent ».
export function comparerLieux(a, b) {
  const x = normLieu(a), y = normLieu(b);
  if (!x || !y) return 'inconnu';
  if (x === y) return 'identique';
  const tx = x.split(' '), ty = y.split(' ');
  const [court, long] = tx.length <= ty.length ? [tx, ty] : [ty, tx];
  if (court.every((m) => long.some((n) => motsProches(n, m)))) return 'voisin';
  if (distance(x, y, 2) <= 2) return 'voisin';
  return 'different';
}

// ── RENFORTS ────────────────────────────────────────────────────────────────
// Ce qui ne déclenche RIEN tout seul mais qui, une fois les noms rapprochés,
// dit à la secrétaire pourquoi deux fiches se ressemblent. Les renforts ne font
// pas monter le niveau : le responsable a posé le lieu de naissance comme
// condition du doublon fort, et un renfort ne remplace pas une condition. Ils
// servent à CLASSER le rapport : la paire la plus renforcée se lit en premier.
const champ = (e, ...noms) => {
  for (const n of noms) {
    const v = e?.[n];
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v);
  }
  return '';
};

export function renforts(a, b) {
  const liste = [];
  const tel = [normTel(champ(a, 'parent_phone', 'phone')), normTel(champ(b, 'parent_phone', 'phone'))];
  if (tel[0] && tel[0] === tel[1]) liste.push('telephone');

  const pere = [normNom(champ(a, 'nom_pere')), normNom(champ(b, 'nom_pere'))];
  const mere = [normNom(champ(a, 'nom_mere')), normNom(champ(b, 'nom_mere'))];
  const tuteur = [normNom(champ(a, 'tuteur')), normNom(champ(b, 'tuteur'))];
  if ((pere[0] && pere[0] === pere[1]) || (mere[0] && mere[0] === mere[1])
      || (tuteur[0] && tuteur[0] === tuteur[1])) liste.push('parents');

  const adr = [normNom(champ(a, 'adresse', 'quartier')), normNom(champ(b, 'adresse', 'quartier'))];
  if (adr[0] && adr[0] === adr[1]) liste.push('adresse');

  return liste;
}

// ── LA COMPARAISON DE DEUX FICHES ───────────────────────────────────────────
// Rend le niveau, les raisons EN FRANÇAIS (l'écran les affiche telles quelles)
// et de quoi trier un rapport. Ne lit QUE les colonnes réelles de `students` :
// `date_naissance`, `lieu_naissance`, `matricule`, `parent_phone`, `adresse`,
// `quartier`, `nom_pere`, `nom_mere`, `tuteur`.
export function comparerEleves(a, b) {
  const vide = { niveau: NIVEAU.AUCUN, raisons: [], renforts: [], fratrie: false, score: 0 };
  if (!a || !b || a.id === b.id) return vide;

  const matA = normNom(champ(a, 'matricule')), matB = normNom(champ(b, 'matricule'));
  const dates = comparerDates(champ(a, 'date_naissance'), champ(b, 'date_naissance'));
  const lieux = comparerLieux(champ(a, 'lieu_naissance'), champ(b, 'lieu_naissance'));
  const noms = nomsProches(a.name, b.name);
  const renf = renforts(a, b);

  // LE MATRICULE EST UN IDENTIFIANT, pas un indice : deux fiches qui le
  // partagent sont la même inscription, quels que soient les noms saisis.
  if (matA && matA === matB) {
    return {
      niveau: NIVEAU.FORT, dates, lieux, renforts: renf, fratrie: false,
      raisons: ['même matricule'], score: 100,
    };
  }

  // LA FRATRIE : tout concorde sauf le nom. On le dit, sans alerter.
  if (!noms.proche) {
    const memeFoyer = dates === 'identique' && lieux === 'identique'
      && renf.includes('parents') && renf.includes('adresse');
    return { ...vide, dates, lieux, renforts: renf, fratrie: memeFoyer };
  }

  const raisons = [];
  if (noms.identique) raisons.push('nom identique');
  else if (noms.inverse) raisons.push('nom et prénoms dans un autre ordre');
  else if (noms.fautes) raisons.push('nom à une faute de frappe près');
  else raisons.push(noms.ecart ? 'nom avec un prénom en plus' : 'nom très proche');

  let niveau = NIVEAU.VERIFIER;
  if (dates === 'identique') {
    raisons.push('même date de naissance');
    if (lieux === 'identique' || lieux === 'voisin') {
      raisons.push(lieux === 'identique' ? 'même lieu de naissance' : 'lieu de naissance très proche');
      niveau = NIVEAU.FORT;
    } else if (lieux === 'inconnu') {
      raisons.push("lieu de naissance absent d'une des deux fiches");
    } else {
      raisons.push('lieu de naissance différent');
    }
  } else if (dates === 'voisine') {
    raisons.push('date de naissance à un chiffre près');
  } else if (dates === 'inconnue') {
    raisons.push("date de naissance absente d'une des deux fiches");
    if (lieux === 'identique') raisons.push('même lieu de naissance');
  } else {
    // Date renseignée des deux côtés et DIFFÉRENTE : deux homonymes. C'est le
    // cas que le responsable a vu refuser à tort — il ne doit plus rien
    // déclencher, même si tout le reste concorde.
    return { ...vide, dates, lieux, renforts: renf, fratrie: false };
  }

  // Le score ne sert qu'à l'ORDRE du rapport : le plus suspect en haut.
  const score = (niveau === NIVEAU.FORT ? 60 : 20)
    + (noms.identique ? 10 : 0)
    + renf.length * 5
    + (dates === 'identique' ? 10 : 0);

  return { niveau, raisons, renforts: renf, dates, lieux, fratrie: false, score };
}

// Deux fiches sont-elles LA MÊME SAISIE, sans discussion ? Même matricule, ou
// nom identique au caractère près + même date + même lieu. C'est la seule chose
// qu'on refuse sans demander : un import rejoué ne doit pas recréer l'élève.
// Tout le reste s'affiche et se confirme — « alerte, jamais blocage ».
export function estMemeFiche(a, b) {
  if (!a || !b || a.id === b.id) return false;
  const matA = normNom(champ(a, 'matricule')), matB = normNom(champ(b, 'matricule'));
  if (matA && matA === matB) return true;
  if (normNom(a.name) !== normNom(b.name) || !normNom(a.name)) return false;
  const d = comparerDates(champ(a, 'date_naissance'), champ(b, 'date_naissance'));
  const l = comparerLieux(champ(a, 'lieu_naissance'), champ(b, 'lieu_naissance'));
  if (d === 'identique' && (l === 'identique' || l === 'inconnu')) return true;
  // Ni date ni lieu nulle part : il ne reste que le nom. C'était l'ancienne
  // règle, et elle est conservée — sinon un import rejoué sur une base sans
  // dates de naissance recrée tout le registre.
  return d === 'inconnue' && l === 'inconnu';
}

// ════════════════════════════════════════════════════════════════════════════
// « CE N'EST PAS UN DOUBLON » — LA DÉCISION DE LA SECRÉTAIRE SE MÉMORISE
// ════════════════════════════════════════════════════════════════════════════
// Sans mémoire, la même alerte revient à chaque ouverture de fiche et à chaque
// scan. Au bout de trois fois, on clique sans lire — et l'alerte ne protège
// plus rien.
//
// OÙ C'EST RANGÉ, et pourquoi là. La décision vit dans une COLONNE de
// `students` (`non_doublons`, un tableau d'identifiants en JSON), pas dans une
// table nouvelle. Trois raisons :
//   • `students` est déjà synchronisée : la décision suit l'école sur le LAN et
//     en ligne sans un seul branchement de plus, et une table neuve aurait
//     demandé de la déclarer dans huit endroits et de redéployer les fonctions
//     Edge — donc une autorisation de mise en production pour une préférence ;
//   • la décision disparaît avec la fiche, ce qui est le comportement voulu ;
//   • la paire est écrite DES DEUX CÔTÉS : supprimer une fiche ne fait pas
//     réapparaître l'alerte sur l'autre.
//
// Ce que ça coûte, et c'est assumé : deux secrétaires qui tranchent la même
// paire en même temps, chacune hors ligne, écrasent l'une l'autre (dernier
// écrit gagne, comme le reste de la fiche). Conséquence : une alerte revient
// une fois. Aucune donnée scolaire n'est en jeu.
export const clePaire = (idA, idB) => [String(idA), String(idB)].sort().join('|');

// Tolérant : la colonne peut arriver en tableau (IndexedDB) ou en texte JSON
// (SQLite et Postgres). Une valeur illisible ne doit pas casser l'écran.
export function lireNonDoublons(eleve) {
  const v = eleve?.non_doublons;
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    try {
      const j = JSON.parse(v);
      return Array.isArray(j) ? j.map(String).filter(Boolean) : [];
    } catch { return []; }
  }
  return [];
}

// L'ensemble des paires déjà tranchées, lu sur le registre lui-même.
export function pairesNonDoublons(eleves = []) {
  const set = new Set();
  for (const e of eleves || []) {
    if (!e?.id) continue;
    for (const autre of lireNonDoublons(e)) set.add(clePaire(e.id, autre));
  }
  return set;
}

// Les deux écritures à faire quand la secrétaire dit « ce n'est pas un doublon ».
// Rend des correctifs, pas des effets : l'appelant les passe à `updateStudent`.
export function marquerNonDoublon(eleveA, eleveB) {
  const ajout = (e, autreId) => {
    const liste = lireNonDoublons(e);
    if (liste.includes(String(autreId))) return null;          // déjà tranchée
    return { id: e.id, non_doublons: JSON.stringify([...liste, String(autreId)]) };
  };
  return [ajout(eleveA, eleveB?.id), ajout(eleveB, eleveA?.id)].filter(Boolean);
}

// ════════════════════════════════════════════════════════════════════════════
// LE SCAN DE TOUTE LA BASE
// ════════════════════════════════════════════════════════════════════════════
// SANS COMPARER TOUTES LES PAIRES. Sur 700 élèves, 244 650 comparaisons
// passeraient encore ; sur les 5 000 d'un groupe scolaire, 12 millions
// bloqueraient l'écran. On regroupe donc d'abord, et on ne compare qu'à
// l'intérieur des groupes.
//
// LA CLÉ EST UNE PAIRE DE MOTS, pas un mot. Une première version indexait
// chaque mot du nom sur ses trois premières lettres : dans un registre où les
// noms se ressemblent, un seul paquet avalait tout le monde et on retombait sur
// les 244 650 comparaisons qu'on voulait éviter. Le banc d'essai l'a montré sur
// 700 fiches.
//
// Une alerte exige que TOUS les mots du nom le plus court se retrouvent dans
// l'autre, donc deux fiches candidates partagent au moins DEUX mots. On indexe
// donc chaque PAIRE de mots (quatre premières lettres, triées) : bien plus
// sélectif, et insensible à l'ordre comme à un prénom ajouté.
//
// S'y ajoutent la date de naissance et le téléphone du parent, qui rattrapent le
// cas où c'est le DÉBUT d'un mot qui est mal orthographié — la seule faute que la
// clé de nom ne pardonne pas. Une faute de début ET une date absente échappent
// au scan : c'est la limite assumée de tout regroupement, faute de comparer les
// 244 650 paires à chaque ouverture d'écran.
export function clesRegroupement(e) {
  const cles = [];
  const d = normDate(champ(e, 'date_naissance'));
  if (d) cles.push(`d:${d}`);
  const tel = normTel(champ(e, 'parent_phone', 'phone'));
  if (tel) cles.push(`t:${tel}`);
  const pfx = [...new Set(motsNom(e?.name).filter((m) => m.length >= 3).map((m) => m.slice(0, 4)))].sort();
  for (let i = 0; i < pfx.length; i++) {
    for (let j = i + 1; j < pfx.length; j++) cles.push(`p:${pfx[i]}+${pfx[j]}`);
  }
  return cles;
}

/**
 * Passe tout le registre au crible, toutes classes confondues.
 * @param {Array} eleves   élèves actifs ET archivés (c'est en réinscrivant un
 *                         archivé que le doublon naît)
 * @param {object} options { nonDoublons?: Set, inclureFratrie?: boolean }
 * @returns {{ paires: Array, stats: object }} paires triées, le plus suspect d'abord
 */
export function detecterDoublons(eleves = [], options = {}) {
  const liste = (eleves || []).filter((e) => e && e.id);
  const tranchees = options.nonDoublons ?? pairesNonDoublons(liste);
  const inclureFratrie = !!options.inclureFratrie;

  const paquets = new Map();
  for (const e of liste) {
    for (const cle of clesRegroupement(e)) {
      if (!paquets.has(cle)) paquets.set(cle, []);
      paquets.get(cle).push(e);
    }
  }

  const vues = new Set();
  const paires = [];
  const fratries = [];
  let comparaisons = 0;
  for (const groupe of paquets.values()) {
    if (groupe.length < 2) continue;
    for (let i = 0; i < groupe.length; i++) {
      for (let j = i + 1; j < groupe.length; j++) {
        const cle = clePaire(groupe[i].id, groupe[j].id);
        if (vues.has(cle)) continue;                 // deux clés communes : une seule comparaison
        vues.add(cle);
        if (tranchees.has(cle)) continue;            // « ce n'est pas un doublon », déjà dit
        comparaisons++;
        const r = comparerEleves(groupe[i], groupe[j]);
        if (r.niveau !== NIVEAU.AUCUN) paires.push({ cle, a: groupe[i], b: groupe[j], ...r });
        else if (r.fratrie && inclureFratrie) fratries.push({ cle, a: groupe[i], b: groupe[j], ...r });
      }
    }
  }

  paires.sort((x, y) => y.score - x.score
    || String(x.a.name).localeCompare(String(y.a.name), undefined, { sensitivity: 'base' }));

  return {
    paires,
    fratries,
    stats: {
      eleves: liste.length,
      comparaisons,
      paquets: paquets.size,
      forts: paires.filter((p) => p.niveau === NIVEAU.FORT).length,
      aVerifier: paires.filter((p) => p.niveau === NIVEAU.VERIFIER).length,
      tranchees: tranchees.size,
    },
  };
}

// ── À LA SAISIE ET À L'IMPORT ───────────────────────────────────────────────
// Le candidat n'est pas encore dans le registre : on ne compare que lui, à ceux
// qui partagent une de ses clés de regroupement.
export function doublonsPourCandidat(candidat, registre = [], options = {}) {
  if (!candidat) return { niveau: NIVEAU.AUCUN, candidats: [] };
  const tranchees = options.nonDoublons ?? pairesNonDoublons(registre);
  const dejaDit = lireNonDoublons(candidat).map(String);
  const cles = new Set(clesRegroupement(candidat));

  const vus = new Set();
  const candidats = [];
  for (const s of registre || []) {
    if (!s?.id || s.id === candidat.id || vus.has(s.id)) continue;
    if (dejaDit.includes(String(s.id))) continue;
    if (candidat.id && tranchees.has(clePaire(candidat.id, s.id))) continue;
    if (!clesRegroupement(s).some((c) => cles.has(c))) continue;
    vus.add(s.id);
    const r = comparerEleves(candidat, s);
    if (r.niveau !== NIVEAU.AUCUN) candidats.push({ eleve: s, ...r });
  }
  candidats.sort((x, y) => y.score - x.score);
  return {
    niveau: candidats.some((c) => c.niveau === NIVEAU.FORT) ? NIVEAU.FORT
      : candidats.length ? NIVEAU.VERIFIER : NIVEAU.AUCUN,
    candidats,
  };
}

// Phrase d'alerte, en français et en anglais, construite à partir des raisons
// réelles de la comparaison — pas un message générique. La secrétaire doit
// pouvoir trancher sans appeler personne.
export function phraseAlerte(comparaison, { en = false } = {}) {
  if (!comparaison || comparaison.niveau === NIVEAU.AUCUN) return '';
  const fort = comparaison.niveau === NIVEAU.FORT;
  const tete = en
    ? (fort ? 'This is very probably the same child' : 'A very similar student already exists')
    : (fort ? 'Il s’agit très probablement du même enfant' : 'Un élève très proche est déjà inscrit');
  const raisons = (comparaison.raisons || []).join(', ');
  const renf = (comparaison.renforts || []).length
    ? (en ? ` — also matching: ${comparaison.renforts.join(', ')}`
      : ` — concordent aussi : ${comparaison.renforts.join(', ')}`)
    : '';
  return `${tete} : ${raisons}${renf}.`;
}

// ── LE FICHIER QUE LE RESPONSABLE RELIT ────────────────────────────────────
// Les lignes du rapport exportable demandé le 2026-11-01 : « un scan de toute
// la base […] qui produit un rapport de doublons probables entre toutes les
// classes, exportable ». Fonction pure, donc éprouvée seule — c'est ce tableau
// qui circule, pas l'écran.
//
// `ou` : la CLASSE de chaque fiche, ou « archivé ». Sans elle, le rapport ne
// permet pas d'aller voir, et un rapport qu'on ne peut pas instruire ne sert à
// rien. `t` reste injecté : le moteur ne connaît pas la langue de l'écran.
export function lignesExport(resultat, { classes = [], t = (fr) => fr } = {}) {
  const ou = (s) => (s?.archived_at
    ? t('archivé', 'archived')
    : (classes.find((c) => c.id === s?.class_id)?.name || t('sans classe', 'no class')));
  return [
    [t('Niveau', 'Level'), t('Élève 1', 'Student 1'), t('Classe 1', 'Class 1'),
      t('Élève 2', 'Student 2'), t('Classe 2', 'Class 2'), t('Naissance 1', 'Birth 1'),
      t('Naissance 2', 'Birth 2'), t('Lieu 1', 'Place 1'), t('Lieu 2', 'Place 2'),
      t('Matricule 1', 'ID 1'), t('Matricule 2', 'ID 2'), t('Raisons', 'Reasons'),
      t('Concordances', 'Also matching')],
    ...(resultat?.paires || []).map((p) => [
      p.niveau === NIVEAU.FORT ? t('Doublon probable', 'Likely duplicate') : t('À vérifier', 'To check'),
      p.a.name, ou(p.a), p.b.name, ou(p.b),
      p.a.date_naissance || '', p.b.date_naissance || '',
      p.a.lieu_naissance || '', p.b.lieu_naissance || '',
      p.a.matricule || '', p.b.matricule || '',
      (p.raisons || []).join(' ; '), (p.renforts || []).join(' ; '),
    ]),
  ];
}
