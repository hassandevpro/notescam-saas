// ════════════════════════════════════════════════════════════════════════════
// DEVISES — module centralisé multi-devises
// ════════════════════════════════════════════════════════════════════════════
// Toute somme financière de l'application (frais, paiements, reçus, factures,
// rapports, tableaux de bord, exports) DOIT être formatée via ce module afin de
// garantir un affichage uniforme dans la devise de l'établissement.
//
// Principe : les montants sont stockés bruts (entiers), SANS devise. Seul
// l'AFFICHAGE dépend de school.currency → changer la devise n'altère jamais les
// montants historiques (point « Paramètres »).
//
// Extensibilité : ajouter une devise = ajouter une entrée dans CURRENCIES,
// aucune autre modification de code nécessaire.
// ════════════════════════════════════════════════════════════════════════════

// position : 'before' (€1 250,50) | 'after' (250 000 XAF)
// locale   : pour le groupement des milliers et le séparateur décimal
// decimals : nombre de décimales affichées
export const CURRENCIES = [
  { code: 'XAF', name: 'Franc CFA (Afrique Centrale)', symbol: 'XAF', position: 'after',  decimals: 0, locale: 'fr-FR' },
  { code: 'XOF', name: "Franc CFA (Afrique de l'Ouest)", symbol: 'XOF', position: 'after', decimals: 0, locale: 'fr-FR' },
  { code: 'EUR', name: 'Euro',                          symbol: '€',   position: 'before', decimals: 2, locale: 'fr-FR' },
  { code: 'USD', name: 'Dollar américain',             symbol: '$',   position: 'before', decimals: 2, locale: 'en-US' },
  { code: 'GBP', name: 'Livre sterling',               symbol: '£',   position: 'before', decimals: 2, locale: 'en-GB' },
  { code: 'CAD', name: 'Dollar canadien',              symbol: 'CA$', position: 'before', decimals: 2, locale: 'en-CA' },
  { code: 'TRY', name: 'Livre turque',                 symbol: '₺',   position: 'before', decimals: 0, locale: 'tr-TR' },
  { code: 'MAD', name: 'Dirham marocain',              symbol: 'MAD', position: 'after',  decimals: 2, locale: 'fr-FR' },
  { code: 'DZD', name: 'Dinar algérien',               symbol: 'DZD', position: 'after',  decimals: 2, locale: 'fr-FR' },
  { code: 'TND', name: 'Dinar tunisien',               symbol: 'TND', position: 'after',  decimals: 3, locale: 'fr-FR' },
  { code: 'GNF', name: 'Franc guinéen',                symbol: 'GNF', position: 'after',  decimals: 0, locale: 'fr-FR' },
  { code: 'CDF', name: 'Franc congolais',              symbol: 'CDF', position: 'after',  decimals: 0, locale: 'fr-FR' },
  { code: 'NGN', name: 'Naira nigérian',               symbol: '₦',   position: 'before', decimals: 0, locale: 'en-NG' },
  { code: 'GHS', name: 'Cedi ghanéen',                 symbol: '₵',   position: 'before', decimals: 2, locale: 'en-GH' },
  { code: 'ZAR', name: 'Rand sud-africain',            symbol: 'R',   position: 'before', decimals: 2, locale: 'en-ZA' },
];

export const DEFAULT_CURRENCY = 'XAF';

const _byCode = new Map(CURRENCIES.map((c) => [c.code, c]));

// Définition d'une devise (avec repli sûr sur la devise par défaut).
export function getCurrency(code) {
  return _byCode.get(code) || _byCode.get(DEFAULT_CURRENCY);
}

// Code devise d'un établissement (repli défaut). Accepte un objet école ou un code.
export function currencyCode(schoolOrCode) {
  if (!schoolOrCode) return DEFAULT_CURRENCY;
  if (typeof schoolOrCode === 'string') return _byCode.has(schoolOrCode) ? schoolOrCode : DEFAULT_CURRENCY;
  return schoolOrCode.currency && _byCode.has(schoolOrCode.currency) ? schoolOrCode.currency : DEFAULT_CURRENCY;
}

// Formate un montant complet AVEC symbole/code selon les conventions de la devise.
//   formatMoney(250000, 'XAF') → "250 000 XAF"
//   formatMoney(1250.5, 'EUR') → "€1 250,50"
//   formatMoney(2350.75, 'USD') → "$2,350.75"
export function formatMoney(amount, code = DEFAULT_CURRENCY) {
  const c = getCurrency(code);
  const n = formatAmount(amount, code);
  return c.position === 'before' ? `${c.symbol}${n}` : `${n} ${c.symbol}`;
}

// Formate UNIQUEMENT le nombre (sans symbole) selon la locale/décimales de la
// devise — utile quand le symbole est affiché à part (en-têtes de colonnes…).
export function formatAmount(amount, code = DEFAULT_CURRENCY) {
  const c = getCurrency(code);
  return new Intl.NumberFormat(c.locale, {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  }).format(Number(amount || 0));
}

// Symbole/étiquette courte d'une devise (ex. en-tête « Montant (XAF) »).
export function currencySymbol(code = DEFAULT_CURRENCY) {
  return getCurrency(code).symbol;
}
