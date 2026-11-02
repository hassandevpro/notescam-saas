// MONTANT EN TOUTES LETTRES — français, anglais, espagnol.
//
// Pourquoi un reçu en porte un : les chiffres se retouchent. « 15 000 » devient
// « 75 000 » d'un trait de stylo sur un talon papier ; « quinze mille francs »
// ne se retouche pas. C'est la raison pour laquelle tout reçu de caisse, ici
// comme ailleurs, double le chiffre par la lettre — et la raison pour laquelle
// les deux doivent être produits par le MÊME calcul, jamais ressaisis.
//
// FRANÇAIS DE FRANCE, et c'est un choix. Le Cameroun écrit « soixante-dix »,
// « quatre-vingts », « quatre-vingt-dix », et non « septante / huitante /
// nonante ». Les trois accords qui font trébucher :
//
//   • VINGT et CENT prennent un s au pluriel SEULEMENT s'ils finissent le
//     nombre : « quatre-vingts » mais « quatre-vingt-un », « deux cents » mais
//     « deux cent un ». C'est la faute la plus fréquente sur un reçu.
//   • MILLE est toujours invariable : « deux mille », jamais « deux milles ».
//   • UN devant mille ne se dit pas : « mille », et non « un mille ». Mais il
//     se dit devant million : « un million ».
//
// La réforme de 1990 autorise les traits d'union partout ; on garde l'usage
// traditionnel (« vingt et un », sans traits), celui des pièces comptables.
//
// Les montants sont des ENTIERS : le franc CFA n'a pas de subdivision en usage.
// Un décimal passé ici est tronqué, jamais arrondi — arrondir un montant sur un
// reçu, c'est écrire en lettres autre chose que ce que la caisse a encaissé.

const UNITES = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
];
const DIZAINES = [
  '', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante',
  'soixante', 'quatre-vingt', 'quatre-vingt',
];

// `suivi` = quelque chose suit ce groupe DANS LE MÊME nombre, et ce quelque
// chose est le mot « mille ». C'est la distinction que l'accord exige :
//
//   « quatre-vingts »          seul        → s
//   « quatre-vingt mille »     + mille     → PAS de s, car mille est un simple
//                                            multiplicateur invariable
//   « quatre-vingts millions » + millions  → s, car « million » est un NOM
//
// Même règle pour « cent » : « deux cent mille », mais « deux cents millions ».
// Les deux premiers cas étaient faux avant que le banc ne les attrape.
//
// 0 → 99. Le cœur des irrégularités françaises tient ici.
function sousCent(n, suivi = false) {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;

  // 70-79 et 90-99 se disent « soixante-dix » et « quatre-vingt-dix » : la
  // dizaine reste celle d'en dessous et l'unité monte jusqu'à 19.
  if (d === 7 || d === 9) {
    const base = DIZAINES[d];
    const reste = UNITES[10 + u];
    // « soixante et onze », mais « quatre-vingt-onze » : le « et » ne survit
    // que dans la série des soixante.
    return d === 7 && u === 1 ? `${base} et ${reste}` : `${base}-${reste}`;
  }

  if (u === 0) {
    // QUATRE-VINGTS prend son s, sauf si « mille » le suit.
    return d === 8 ? (suivi ? 'quatre-vingt' : 'quatre-vingts') : DIZAINES[d];
  }
  // « vingt et un », « trente et un »… mais « quatre-vingt-un », sans « et ».
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

// 0 → 999.
function sousMille(n, suivi = false) {
  if (n < 100) return sousCent(n, suivi);
  const c = Math.floor(n / 100);
  const reste = n % 100;
  // « cent », et non « un cent ».
  const tete = c === 1 ? 'cent' : `${UNITES[c]} cent`;
  if (reste === 0) {
    // DEUX CENTS prend son s, sauf si « mille » le suit. « deux cent un » ne
    // l'a pas davantage : un nombre le suit.
    return c === 1 ? 'cent' : (suivi ? tete : `${tete}s`);
  }
  // Le reste hérite du même « suivi » : dans « deux cent quatre-vingt mille »,
  // c'est bien « vingt » que mille suit.
  return `${tete} ${sousMille(reste, suivi)}`;
}

// Échelles. `mille` est invariable ; les autres s'accordent.
const ECHELLES = [
  { valeur: 1e9, sing: 'milliard', pluriel: 'milliards' },
  { valeur: 1e6, sing: 'million',  pluriel: 'millions' },
  { valeur: 1e3, sing: 'mille',    pluriel: 'mille' },
];

function entierEnLettresFr(n) {
  if (n === 0) return 'zéro';
  let reste = n;
  const morceaux = [];
  for (const e of ECHELLES) {
    const part = Math.floor(reste / e.valeur);
    if (part === 0) continue;
    reste %= e.valeur;
    if (e.valeur === 1e3) {
      // « mille », jamais « un mille ». Et `suivi = true` : c'est mille qui
      // suit, donc « quatre-vingt mille » et « deux cent mille », sans s.
      morceaux.push(part === 1 ? 'mille' : `${sousMille(part, true)} mille`);
    } else {
      // « million » et « milliard » sont des NOMS : l'accord revient.
      // « deux cents millions », « quatre-vingts millions ».
      morceaux.push(`${sousMille(part)} ${part === 1 ? e.sing : e.pluriel}`);
    }
  }
  if (reste > 0) morceaux.push(sousMille(reste));
  return morceaux.join(' ');
}

// ── Anglais ────────────────────────────────────────────────────────────────
const EN_UNITES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const EN_DIZAINES = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enSousMille(n) {
  if (n < 20) return EN_UNITES[n];
  if (n < 100) {
    const d = Math.floor(n / 10); const u = n % 10;
    return u ? `${EN_DIZAINES[d]}-${EN_UNITES[u]}` : EN_DIZAINES[d];
  }
  const c = Math.floor(n / 100); const reste = n % 100;
  return reste ? `${EN_UNITES[c]} hundred and ${enSousMille(reste)}` : `${EN_UNITES[c]} hundred`;
}

function entierEnLettresEn(n) {
  if (n === 0) return 'zero';
  let reste = n;
  const morceaux = [];
  for (const [valeur, mot] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
    const part = Math.floor(reste / valeur);
    if (!part) continue;
    reste %= valeur;
    morceaux.push(`${enSousMille(part)} ${mot}`);
  }
  if (reste > 0) morceaux.push(enSousMille(reste));
  return morceaux.join(' ');
}

// ── Espagnol ───────────────────────────────────────────────────────────────
const ES_UNITES = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis',
  'diecisiete', 'dieciocho', 'diecinueve',
];
const ES_DIZAINES = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const ES_CENTAINES = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
];

function esSousMille(n) {
  if (n < 20) return ES_UNITES[n];
  if (n < 30) return n === 20 ? 'veinte' : `veinti${ES_UNITES[n % 10]}`;
  if (n < 100) {
    const d = Math.floor(n / 10); const u = n % 10;
    return u ? `${ES_DIZAINES[d]} y ${ES_UNITES[u]}` : ES_DIZAINES[d];
  }
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100); const reste = n % 100;
  return reste ? `${ES_CENTAINES[c]} ${esSousMille(reste)}` : ES_CENTAINES[c];
}

function entierEnLettresEs(n) {
  if (n === 0) return 'cero';
  let reste = n;
  const morceaux = [];
  for (const [valeur, sing, plur] of [[1e9, 'mil millones', 'mil millones'], [1e6, 'millón', 'millones']]) {
    const part = Math.floor(reste / valeur);
    if (!part) continue;
    reste %= valeur;
    morceaux.push(part === 1 ? `un ${sing}` : `${esSousMille(part)} ${plur}`);
  }
  const milliers = Math.floor(reste / 1000);
  if (milliers) { morceaux.push(milliers === 1 ? 'mil' : `${esSousMille(milliers)} mil`); reste %= 1000; }
  if (reste > 0) morceaux.push(esSousMille(reste));
  return morceaux.join(' ');
}

/**
 * Un entier en toutes lettres.
 *
 * Négatif accepté et préfixé : une contre-passation est un montant négatif, et
 * son reçu d'annulation doit pouvoir s'écrire. Le masquer rendrait l'annulation
 * illisible sur le papier, c'est-à-dire exactement là où elle doit se voir.
 */
export function entierEnLettres(n, langue = 'fr') {
  const v = Math.trunc(Number(n) || 0);
  const abs = Math.abs(v);
  if (!Number.isFinite(abs) || abs > 999999999999) return '';
  const mots = langue === 'en' ? entierEnLettresEn(abs)
    : langue === 'es' ? entierEnLettresEs(abs)
      : entierEnLettresFr(abs);
  if (v >= 0) return mots;
  return langue === 'en' ? `minus ${mots}` : langue === 'es' ? `menos ${mots}` : `moins ${mots}`;
}

// Nom de la devise en toutes lettres. Au-delà du franc CFA, parce qu'une école
// hors zone CEMAC ne doit pas voir « francs CFA » sur ses reçus.
const DEVISES = {
  XAF: { fr: ['franc CFA', 'francs CFA'], en: ['CFA franc', 'CFA francs'], es: ['franco CFA', 'francos CFA'] },
  XOF: { fr: ['franc CFA', 'francs CFA'], en: ['CFA franc', 'CFA francs'], es: ['franco CFA', 'francos CFA'] },
  EUR: { fr: ['euro', 'euros'],           en: ['euro', 'euros'],           es: ['euro', 'euros'] },
  USD: { fr: ['dollar', 'dollars'],       en: ['dollar', 'dollars'],       es: ['dólar', 'dólares'] },
};

/**
 * « quinze mille francs CFA » — ce qui s'écrit sur la ligne « arrêté la présente
 * quittance à la somme de… ».
 *
 * La devise s'accorde sur la valeur ABSOLUE et seulement au-delà de 1 : « un
 * franc CFA », « zéro franc CFA », « deux francs CFA ».
 */
export function montantEnLettres(n, { devise = 'XAF', langue = 'fr' } = {}) {
  const v = Math.trunc(Number(n) || 0);
  const mots = entierEnLettres(v, langue);
  if (!mots) return '';
  const noms = DEVISES[String(devise).toUpperCase()]?.[langue];
  if (!noms) return `${mots} ${devise}`.trim();
  return `${mots} ${Math.abs(v) > 1 ? noms[1] : noms[0]}`;
}
