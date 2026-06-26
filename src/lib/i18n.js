// Minimal i18n helper.
// Usage : const t = useT(); puis t('Texte FR', 'English text', 'Texto ES').
// Le 3ème argument (espagnol) est optionnel — si absent, on retombe sur le
// dictionnaire FR_TO_ES (couvre la plupart des chaînes courantes), puis sur FR.
import { useCallback } from 'react';
import { useUiStore } from '../store/uiStore';
import { FR_TO_ES } from './i18n_es';
import { FR_TO_TR } from './i18n_tr';

export const SUPPORTED_LANGS = ['fr', 'en', 'es', 'tr'];

// Traduit `fr` via un dictionnaire FR→XX, sinon laisse fr brut. Gère aussi la
// ponctuation finale courante (ex: « … », « ! ») en réessayant sans elle.
function autoDict(dict, fr) {
  if (!fr) return fr;
  if (dict[fr]) return dict[fr];
  const trimmed = fr.replace(/[.…!?:]+$/, '');
  if (trimmed !== fr && dict[trimmed]) {
    return dict[trimmed] + fr.slice(trimmed.length);
  }
  return fr;
}

const autoEs = (fr) => autoDict(FR_TO_ES, fr);
const autoTr = (fr) => autoDict(FR_TO_TR, fr);

export function pickLang(lang, fr, en, es) {
  if (lang === 'en') return en ?? fr;
  if (lang === 'es') return es ?? autoEs(fr);
  // Le turc n'a pas d'argument positionnel dédié (comme l'espagnol au départ) :
  // il passe TOUJOURS par le dictionnaire FR→TR, avec repli sur le FR.
  if (lang === 'tr') return autoTr(fr);
  return fr;
}

export function useT() {
  const lang = useUiStore((s) => s.uiLang);
  // Identité stable tant que la langue ne change pas : sinon `t` étant une
  // nouvelle fonction à chaque rendu casse les useCallback/useEffect qui en
  // dépendent (ex. boucle de rendu infinie sur la page Relevés de notes).
  return useCallback((fr, en, es) => pickLang(lang, fr, en, es), [lang]);
}

// Non-hook version for use outside React components
export function getLang() {
  const stored = localStorage.getItem('notescam_ui_lang') || 'fr';
  return SUPPORTED_LANGS.includes(stored) ? stored : 'fr';
}

export function tStatic(fr, en, es) {
  return pickLang(getLang(), fr, en, es);
}

// Locale BCP-47 pour le formatage des dates / nombres selon la langue d'UI.
// fr → fr-FR, en → en-GB, es → es-ES. Sert à ce que toutes les dates affichées
// suivent la langue choisie (ex. interface en espagnol → dates en espagnol).
export function localeForLang(lang = getLang()) {
  return lang === 'es' ? 'es-ES' : lang === 'en' ? 'en-GB' : lang === 'tr' ? 'tr-TR' : 'fr-FR';
}
