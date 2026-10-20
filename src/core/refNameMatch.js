// RAPPROCHEMENT MATIÈRE LOCALE ↔ LIGNE DE RÉFÉRENTIEL, PAR LE NOM
//
// ── LE DÉFAUT QUE CE MODULE FERME ──────────────────────────────────────────
//
// Les bulletins du SECOND CYCLE (GROUPE 1 / GROUPE 2 de l'arrêté) et du
// PROGRAMME BILINGUE SPÉCIAL (domaines d'apprentissage) partent des lignes
// `subjects` de la classe, puis vont chercher dans le référentiel national le
// GROUPE, le COEFFICIENT et la CHARGE HORAIRE de chaque matière. Ce
// rapprochement se faisait par égalité EXACTE du nom, une fois minuscules et
// accents retirés (`normName`).
//
// Or les écoles n'écrivent pas les noms officiels. « Maths » pour
// Mathématiques, « S.V.T » pour SVT, « Philo » pour Philosophie, « Info » pour
// Informatique. Aucun de ces noms ne tombait sur sa ligne de référentiel : la
// matière perdait son groupe (elle atterrissait sous AUTRES MATIÈRES), son
// coefficient officiel et sa charge horaire — sur un bulletin OFFICIEL, et sans
// que rien ne le signale.
//
// ── LA RÈGLE : CERTAIN OU RIEN ─────────────────────────────────────────────
//
// On place une matière quand on en est SÛR, et on la laisse hors groupe quand on
// ne l'est pas. Sur un document officiel, une matière visiblement rangée à part
// est un défaut qui se voit et se corrige ; une matière glissée dans le mauvais
// groupe réglementaire est une faute qui ne se voit pas. D'où trois essais, du
// plus sûr au moins sûr, le premier qui répond gagne — et aucun essai « au plus
// proche » :
//
//   1. nom EXACT (après minuscules, accents et espaces normalisés) ;
//   2. nom SANS PONCTUATION : « S.V.T » → « svt », « Hist-Géo » → « histgeo » ;
//   3. PRÉFIXE NON AMBIGU : « Maths » → « Mathématiques », mais seulement s'il
//      n'existe qu'UN SEUL candidat. « Sciences » face à « Sciences Physiques »
//      ET « Sciences de la Vie » ne tranche pas : on ne place pas.
//
// Le préfixe exige 4 caractères au minimum : en dessous, « Ar » ou « Mu »
// désignerait n'importe quoi.

const MIN_PREFIXE = 4;

/** Minuscules, sans accents, espaces réduits. Même normalisation que l'app. */
export function normName(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clé « lâche » : plus aucune ponctuation ni espace. « S.V.T » → « svt ». */
export function looseKey(s) {
  return normName(s).replace(/[^a-z0-9]/g, '');
}

/**
 * Ligne de référentiel correspondant à une matière locale, ou `null`.
 *
 * @param localName nom de la ligne `subjects`
 * @param rows      lignes du référentiel
 * @param nomOf     (row) => nom officiel de la ligne
 * @returns la ligne, ou `null` si rien de SÛR
 */
export function matchRefRow(localName, rows, nomOf = (r) => r?.nom) {
  const liste = (rows || []).filter(Boolean);
  if (!liste.length) return null;
  const n = normName(localName);
  if (!n) return null;

  // 1) Nom exact.
  const exact = liste.find((r) => normName(nomOf(r)) === n);
  if (exact) return exact;

  // 2) Sans ponctuation. On ne retient que si c'est NON AMBIGU : deux lignes de
  //    référentiel peuvent se réduire à la même clé lâche.
  const k = looseKey(localName);
  if (k) {
    const laches = liste.filter((r) => looseKey(nomOf(r)) === k);
    if (laches.length === 1) return laches[0];
    if (laches.length > 1) return null;   // ambigu : on ne devine pas
  }

  // 3) Préfixe non ambigu, dans les deux sens (« Math » ⊂ « Mathematiques »,
  //    et « Mathematiques appliquees » ⊃ « Mathematiques »).
  //
  //    Le pluriel est toléré : « Maths » ne préfixe PAS « mathematiques » (le
  //    `s` tombe au mauvais endroit), alors que c'est l'abréviation que les
  //    écoles écrivent le plus. On réessaie donc sans le `s` final.
  for (const essai of [k, k.endsWith('s') ? k.slice(0, -1) : null]) {
    if (!essai || essai.length < MIN_PREFIXE) continue;
    const candidats = liste.filter((r) => {
      const rk = looseKey(nomOf(r));
      if (rk.length < MIN_PREFIXE) return false;
      return rk.startsWith(essai) || essai.startsWith(rk);
    });
    if (candidats.length === 1) return candidats[0];
  }

  // 4) MOT À MOT, chaque mot abrégé : « Hist-Géo » → « Histoire-Géographie »,
  //    « Ed Civique » → « Éducation Civique », « Sci Phy » → « Sciences
  //    Physiques ». Même nombre de mots, et chaque mot local préfixe le mot
  //    officiel de même rang. Toujours sous contrainte de non-ambiguïté.
  const motsLocaux = motsDe(localName);
  if (motsLocaux.length >= 2) {
    const candidats = liste.filter((r) => {
      const motsRef = motsDe(nomOf(r));
      if (motsRef.length !== motsLocaux.length) return false;
      return motsLocaux.every((m, i) => m.length >= MIN_MOT && motsRef[i].startsWith(m));
    });
    if (candidats.length === 1) return candidats[0];
  }

  return null;
}

const MIN_MOT = 3;

// Mots d'un nom, ponctuation comprise comme séparateur : « Hist-Géo » → deux
// mots, pas un. Les mots de liaison (« et », « de », « la », « du », « des »)
// sont retirés : « Histoire et Géographie » doit se comparer à « Hist-Géo ».
const LIAISONS = new Set(['et', 'de', 'du', 'des', 'la', 'le', 'les', 'and', 'of', 'the', 'a', 'l', 'd']);
function motsDe(s) {
  return normName(s)
    .split(/[^a-z0-9]+/)
    .filter((m) => m && !LIAISONS.has(m));
}

// ── LE CRÉNEAU « LANGUE VIVANTE » DU SECOND CYCLE ──────────────────────────
//
// L'arrêté ne nomme PAS la langue : il ouvre un créneau « Langue vivante II »
// (et « Langue vivante III » en série A5), que l'établissement remplit avec
// l'allemand, l'espagnol, l'italien… La matière de l'école s'appelle donc
// « Espagnol » et la ligne du référentiel « Langue vivante II » : AUCUNE règle
// de nom — ni exacte, ni par préfixe, ni mot à mot — ne pourra jamais les
// rapprocher. L'espagnol et l'allemand tombaient donc hors groupe, sous AUTRES
// MATIÈRES, sur toutes les séries A2, A4, A5 et ABI.
//
// Ce n'est pas rattrapable par le nom : c'est un créneau à REMPLIR, pas un nom à
// reconnaître. D'où cette règle à part.
//
// POURQUOI C'EST SÛR, MÊME EN A5 OÙ IL Y A DEUX CRÉNEAUX. Relevé dans
// `supabase_sc_referentiel_data.sql` : les 15 lignes « Langue vivante » du
// référentiel se résument à UN SEUL triplet — groupe `g1`, coefficient 3,
// charge 3. Savoir si l'espagnol occupe le créneau II ou le III ne change donc
// ni le groupe, ni le coefficient, ni la charge de la matière : les trois seules
// choses que l'enrichissement recopie. On n'a donc rien à deviner.
//
// Le garde-fou le vérifie quand même à l'exécution : si un référentiel futur
// distinguait les créneaux, la règle se désactiverait d'elle-même plutôt que de
// choisir à la place de l'école.

// Langues que l'établissement peut poser dans un créneau. Volontairement
// EXPLICITE et courte : latin, grec, anglais, français et les langues
// nationales portent leur propre ligne au référentiel et se rapprochent déjà
// par le nom — ils n'ont rien à faire ici.
const LANGUES_VIVANTES = [
  'allemand', 'german', 'espagnol', 'espanol', 'spanish', 'italien', 'italian',
  'portugais', 'portuguese', 'chinois', 'chinese', 'arabe', 'arabic',
  'russe', 'russian', 'japonais', 'japanese',
];

/** La matière locale est-elle une langue vivante posée par l'école ? */
export function estLangueVivante(name) {
  const mots = motsDe(name);
  return mots.some((m) => LANGUES_VIVANTES.includes(m));
}

/**
 * Créneau « Langue vivante » du référentiel pour une matière de langue, ou
 * `null`.
 *
 * Rend `null` — donc ne place rien — si le référentiel n'ouvre aucun créneau
 * pour cette série, ou si ses créneaux ne s'accordent pas sur (groupe,
 * coefficient, charge) : dans ce dernier cas le choix appartient à l'école, qui
 * le fait par le menu « Groupe » de « Modifier la classe ».
 */
export function matchLangueVivanteSlot(localName, rows, nomOf = (r) => r?.nom) {
  if (!estLangueVivante(localName)) return null;
  const creneaux = (rows || []).filter((r) => r && /langue vivante/i.test(nomOf(r) || ''));
  if (!creneaux.length) return null;
  // L'empreinte couvre les DEUX moteurs : le second cycle range par
  // `groupe_ordre` (GROUPE 1 / 2 de l'arrêté), le programme bilingue par
  // `domaine_ordre` (domaine d'apprentissage). Ne comparer que l'un des deux
  // laisserait le garde-fou aveugle sur l'autre bulletin.
  const empreinte = (r) => [
    r.groupe_ordre, r.domaine_ordre, r.coefficient, r.charge_horaire,
  ].join('|');
  const distinctes = new Set(creneaux.map(empreinte));
  if (distinctes.size !== 1) return null;   // les créneaux divergent : à l'école de trancher
  return creneaux[0];
}

/**
 * Matières de la classe qu'AUCUNE ligne de référentiel ne réclame — donc sans
 * groupe officiel, sans coefficient officiel et sans charge horaire.
 *
 * Elles s'impriment sous AUTRES MATIÈRES. L'écran les NOMME, pour que l'école
 * corrige l'orthographe au lieu de découvrir le classement devant un parent.
 */
export function unmatchedAgainstRef(classSubjects, rows, nomOf = (r) => r?.nom) {
  if (!(rows || []).length) return [];
  return (classSubjects || [])
    .filter((s) => s && s.name
      && !matchRefRow(s.name, rows, nomOf)
      && !matchLangueVivanteSlot(s.name, rows, nomOf));
}

/**
 * Ligne de référentiel d'une matière, créneau de langue vivante compris.
 * C'est ce que les bulletins appellent : le nom d'abord, le créneau ensuite.
 */
export function resolveRefRow(localName, rows, nomOf = (r) => r?.nom) {
  return matchRefRow(localName, rows, nomOf)
    || matchLangueVivanteSlot(localName, rows, nomOf);
}
