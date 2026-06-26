// ─────────────────────────────────────────────────────────────────────────────
// MODÈLES ACADÉMIQUES — REGISTRE
// ─────────────────────────────────────────────────────────────────────────────
// Source unique des modèles d'établissement. Ajouter un pays/type = ajouter un
// fichier de données dans templates/<pays>/ puis l'enregistrer ici. AUCUN code
// métier à modifier (le moteur src/lib/templateEngine.js est générique).
//
// Forme d'un modèle (voir ./validate.js pour les invariants) :
//   {
//     id: 'cameroon_general',            // identifiant unique
//     country: 'cameroon',               // code pays (groupe l'assistant)
//     type: 'general',                   // type d'établissement
//     label: { fr, en, es },             // libellé affiché
//     description?: { fr, en, es },
//     defaultSystem: 'FR',               // 'FR' | 'EN' | 'ES'
//     classes: [
//       { name, level?, section?, system?, cycle?, max_students?,
//         subjects: [
//           { name, coef, max?, calc_method?, formula?,
//             components?: [ { name, coef?, max? } ] }   // Phase 2 (composites)
//         ] }
//     ]
//   }
// ─────────────────────────────────────────────────────────────────────────────

import cameroonGeneral            from './cameroon/general';
import cameroonPrimary            from './cameroon/primary';
import cameroonTechnicalIndustrial from './cameroon/technicalIndustrial';
import cameroonTechnicalCommercial from './cameroon/technicalCommercial';
import cameroonBilingual          from './cameroon/bilingual';

export const TEMPLATES = [
  cameroonGeneral,
  cameroonPrimary,
  cameroonTechnicalIndustrial,
  cameroonTechnicalCommercial,
  cameroonBilingual,
];

// Pays disposant d'au moins un modèle (alimente l'étape 1 de l'assistant).
// L'ordre détermine l'affichage. `available:false` = à venir (affiché grisé).
export const TEMPLATE_COUNTRIES = [
  { code: 'cameroon',     flag: '🇨🇲', label: { fr: 'Cameroun', en: 'Cameroon', es: 'Camerún' }, available: true },
  { code: 'france',       flag: '🇫🇷', label: { fr: 'France', en: 'France', es: 'Francia' }, available: false },
  { code: 'senegal',      flag: '🇸🇳', label: { fr: 'Sénégal', en: 'Senegal', es: 'Senegal' }, available: false },
  { code: 'cote_ivoire',  flag: '🇨🇮', label: { fr: "Côte d'Ivoire", en: "Côte d'Ivoire", es: 'Costa de Marfil' }, available: false },
  { code: 'maroc',        flag: '🇲🇦', label: { fr: 'Maroc', en: 'Morocco', es: 'Marruecos' }, available: false },
  { code: 'turquie',      flag: '🇹🇷', label: { fr: 'Turquie', en: 'Turkey', es: 'Turquía' }, available: false },
];

export function listTemplates(country) {
  return country ? TEMPLATES.filter((t) => t.country === country) : TEMPLATES;
}

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}
