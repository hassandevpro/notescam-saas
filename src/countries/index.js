// Registry of educational systems supported by NotesCam.
// Each entry exposes a consistent config interface so the rest of the app
// can render the right cycles, periods, grading scale and bulletin labels
// without hard-coding country/language assumptions.
//
// Adding a new country (Gabon, Sénégal…) = creating a new file here and
// referencing it in COUNTRIES below. No existing module needs to be touched.

import { cameroonFr } from './cameroon_fr';
import { cameroonEn } from './cameroon_en';
import { guineaEq }   from './guinea_eq';
import { ivoryCoast } from './ivory_coast';
import { gabon }      from './gabon';
import { congo }      from './congo';

export const COUNTRIES = {
  cameroon_fr: cameroonFr,
  cameroon_en: cameroonEn,
  guinea_eq:   guineaEq,
  ivory_coast: ivoryCoast,
  gabon:       gabon,
  congo:       congo,
};

export const COUNTRY_OPTIONS = [
  { value: 'cameroon_fr', label: 'Cameroun — Francophone',  flag: '🇨🇲', lang: 'fr' },
  { value: 'cameroon_en', label: 'Cameroon — Anglophone',    flag: '🇨🇲', lang: 'en' },
  { value: 'ivory_coast', label: "Côte d'Ivoire",            flag: '🇨🇮', lang: 'fr' },
  { value: 'gabon',       label: 'Gabon',                     flag: '🇬🇦', lang: 'fr' },
  { value: 'congo',       label: 'Congo — Brazzaville',       flag: '🇨🇬', lang: 'fr' },
  { value: 'guinea_eq',   label: 'Guinea Ecuatorial',         flag: '🇬🇶', lang: 'es' },
];

// Backwards-compat: schools created before country_system existed only had
// a `language` field ('francophone' | 'anglophone' | 'bilingue').
// Map it transparently so legacy data keeps working.
//
// Resolution order :
//   1. school.country_system (canonical, depuis la DB)
//   2. localStorage notescam_country_<schoolId> (filet si la colonne DB n'existe pas encore)
//   3. inférence depuis school.language
export function resolveCountryCode(school) {
  if (!school) return 'cameroon_fr';
  if (school.country_system && COUNTRIES[school.country_system]) {
    return school.country_system;
  }
  try {
    if (school.id) {
      const stored = localStorage.getItem(`notescam_country_${school.id}`);
      if (stored && COUNTRIES[stored]) return stored;
    }
  } catch (_) { /* localStorage indisponible */ }
  if (school.language === 'anglophone') return 'cameroon_en';
  if (school.language === 'bilingue')   return 'cameroon_fr';
  return 'cameroon_fr';
}

export function getCountry(school) {
  return COUNTRIES[resolveCountryCode(school)];
}

// Convenience: which UI language a country defaults to.
export function defaultLangForCountry(countryCode) {
  const c = COUNTRIES[countryCode];
  return c?.uiLang || 'fr';
}

// Construit l'en-tête officiel du bulletin pour l'école, à partir du PAYS
// choisi à la configuration. Retourne { bilingual, blocks: [block, …] } où
// chaque block = { republic, motto, ministry, lines: [string], establishment }.
// {region}/{division} sont remplis depuis l'établissement ; le numéro de
// l'établissement (school.establishment_no) est ajouté SOUS les délégations.
// opts.basic : bulletin du FONDAMENTAL (maternelle / primaire) → tutelle MINEDUB
// (Ministère de l'Éducation de Base) au lieu du MINESEC par défaut, si le pays
// fournit des variantes `ministryBasic`/`delegationsBasic`.
export function bulletinOfficials(school, opts = {}) {
  const off = getCountry(school)?.officials;
  if (!off) return null;
  const basic = !!opts.basic;

  const fill = (s) => String(s ?? '')
    .replace(/\{region\}/g,   school?.region   || '—')
    .replace(/\{division\}/g, school?.division || '—');

  const buildBlock = (b) => {
    if (!b) return null;
    const delegations = basic && b.delegationsBasic ? b.delegationsBasic : b.delegations;
    const ministry    = basic && b.ministryBasic    ? b.ministryBasic    : b.ministry;
    const lines = (delegations || []).map(fill);
    const establishment = school?.establishment_no
      ? `${b.estLabel || 'N° :'} ${school.establishment_no}`
      : null;
    return {
      republic: b.republic,
      motto:    b.motto,
      ministry,
      lines,
      establishment,
    };
  };

  const blocks = [buildBlock(off.primary), buildBlock(off.secondary)].filter(Boolean);
  return { bilingual: !!off.secondary, blocks };
}
