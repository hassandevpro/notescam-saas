// TEXTES DES TABLEAUX D'HONNEUR — FR / EN / bilingue (logique pure).
//
// Règles (cahier des charges, 2026-11-18) :
//   • Langue d'une page : réglage de l'établissement (auto | bilingue | fr | en), remplaçable à
//     la génération. « auto » = langue de la CLASSE (FR → tout français, EN → tout anglais) :
//     un lot mêlant les deux sections met chaque page dans la langue de sa classe.
//   • 100 % anglais : TOUT en anglais, en-tête compris. 100 % français : AUCUN mot anglais,
//     y compris sous le titre. Bilingue : français principal + ligne anglaise.
//   • « HONOUR ROLL » (orthographe britannique, usage camerounais), jamais « HONOR ROLL ».
//   • Textes personnalisés en deux champs (FR / EN) ; un champ vide prend le texte par défaut.
//   • Dates à l'heure de Douala, au format de la langue.

import { libellePeriode } from '../../core/honorPeriod.js';

export const T = {
  republique:   { fr: 'RÉPUBLIQUE DU CAMEROUN', en: 'REPUBLIC OF CAMEROON' },
  devise:       { fr: 'Paix – Travail – Patrie', en: 'Peace – Work – Fatherland' },
  minesec:      { fr: 'MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES', en: 'MINISTRY OF SECONDARY EDUCATION', sigle: 'MINESEC' },
  minedub:      { fr: "MINISTÈRE DE L'ÉDUCATION DE BASE", en: 'MINISTRY OF BASIC EDUCATION', sigle: 'MINEDUB' },
  titre: {
    th:  { fr: "TABLEAU D'HONNEUR", en: 'HONOUR ROLL' },
    enc: { fr: 'ENCOURAGEMENTS', en: 'ENCOURAGEMENTS' },
    fel: { fr: 'FÉLICITATIONS', en: 'CONGRATULATIONS' },
  },
  decerne:      { fr: 'Décerné à', en: 'Awarded to' },
  decernePrim:  { fr: "Ce tableau d'honneur est fièrement décerné à", en: 'This honour roll is proudly awarded to' },
  classe:       { fr: 'Classe', en: 'Class' },
  periode:      { fr: 'Période', en: 'Term' },
  moyenne:      { fr: 'Moyenne', en: 'Average' },
  rang:         { fr: 'Rang', en: 'Position' },
  sur20:        { fr: 'SUR 20', en: 'OUT OF 20' },
  anneeScol:    { fr: 'Année scolaire', en: 'Academic Year' },
  profPrincipal:{ fr: 'Le Professeur principal', en: 'Class Master' },
  chefEtab:     { fr: "Le Chef d'établissement", en: 'Principal' },
  enseignant:   { fr: "L'Enseignant(e)", en: 'Class Teacher' },
  directeur:    { fr: 'Le Directeur / La Directrice', en: 'Head Teacher' },
  felicitations: {
    fr: 'en reconnaissance de son travail sérieux, de sa régularité et de ses très bons résultats scolaires.',
    en: 'in recognition of outstanding effort, consistency and academic achievement.',
  },
  felicitationsPrim: {
    fr: 'Bravo pour tes efforts et tes très bons résultats ! Continue comme ça !',
    en: 'Well done for your hard work and great results! Keep it up!',
  },
  sceau:        { fr: "TABLEAU D'HONNEUR • EXCELLENCE •", en: 'HONOUR ROLL • EXCELLENCE •' },
  palmares:     { fr: 'Palmarès', en: 'Honour list' },
  nom:          { fr: 'Nom et prénoms', en: 'Full name' },
  mention:      { fr: 'Mention', en: 'Distinction' },
};

/** Langue d'une page : 'fr' | 'en' | 'bi'. `mode` = réglage (auto | bilingue | fr | en). */
export function langueDePage(mode, sysClasse) {
  if (mode === 'bilingue' || mode === 'bi') return 'bi';
  if (mode === 'fr' || mode === 'en') return mode;
  return sysClasse === 'EN' ? 'en' : 'fr';
}

/** { principal, second } pour une entrée du dictionnaire. `second` n'existe qu'en bilingue. */
export function txt(entree, lang) {
  if (!entree) return { principal: '', second: '' };
  if (lang === 'en') return { principal: entree.en, second: '' };
  if (lang === 'bi') return { principal: entree.fr, second: entree.en === entree.fr ? '' : entree.en };
  return { principal: entree.fr, second: '' };
}

/** Texte personnalisé FR/EN avec repli sur le texte par défaut (jamais de champ vide). */
export function txtPerso(frPerso, enPerso, defaut, lang) {
  const fr = String(frPerso || '').trim() || defaut.fr;
  const en = String(enPerso || '').trim() || defaut.en;
  return txt({ fr, en }, lang);
}

const langPrincipale = (lang) => (lang === 'en' ? 'en' : 'fr');

/** 12,00 (fr) / 12.00 (en). */
export function nombre(n, lang) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const s = Number(n).toFixed(2);
  return langPrincipale(lang) === 'en' ? s : s.replace('.', ',');
}

export function rang(n, lang) {
  if (n == null) return '';
  if (langPrincipale(lang) === 'en') {
    const v = n % 100;
    return `${n}${v >= 11 && v <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
  }
  return n === 1 ? '1er' : `${n}e`;
}

/** Date du jour à Douala : « 20 novembre 2026 » / « 20 November 2026 ». */
export function dateDuJour(lang, d = new Date()) {
  return d.toLocaleDateString(langPrincipale(lang) === 'en' ? 'en-GB' : 'fr-FR',
    { timeZone: 'Africa/Douala', day: 'numeric', month: 'long', year: 'numeric' });
}

export function faitA(lieu, lang, d = new Date()) {
  const l = String(lieu || '').trim();
  if (langPrincipale(lang) === 'en') return l ? `Done at ${l}, on ${dateDuJour('en', d)}` : `Done on ${dateDuJour('en', d)}`;
  return l ? `Fait à ${l}, le ${dateDuJour('fr', d)}` : `Fait le ${dateDuJour('fr', d)}`;
}

export function periode(key, lang) {
  return libellePeriode(key, langPrincipale(lang));
}

/** Échappement HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
