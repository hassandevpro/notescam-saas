// Minimal i18n helper.
// Usage : const t = useT(); puis t('Texte FR', 'English text', 'Texto ES').
// Le 3ème argument (espagnol) est optionnel — si absent, on retombe sur le
// dictionnaire FR_TO_ES (couvre la plupart des chaînes courantes), puis sur FR.
import { useUiStore } from '../store/uiStore';
import { FR_TO_ES } from './i18n_es';

export const SUPPORTED_LANGS = ['fr', 'en', 'es'];

// Tente de traduire `fr` en espagnol via le dictionnaire, sinon laisse fr brut.
// Gère aussi les chaînes commençant par un emoji ou un préfixe (ex: "🔒 Verrouillé")
// en essayant le suffixe.
function autoEs(fr) {
  if (!fr) return fr;
  if (FR_TO_ES[fr]) return FR_TO_ES[fr];
  // tentative sans la ponctuation finale courante
  const trimmed = fr.replace(/[.…!?:]+$/, '');
  if (trimmed !== fr && FR_TO_ES[trimmed]) {
    return FR_TO_ES[trimmed] + fr.slice(trimmed.length);
  }
  return fr;
}

export function pickLang(lang, fr, en, es) {
  if (lang === 'en') return en ?? fr;
  if (lang === 'es') return es ?? autoEs(fr);
  return fr;
}

export function useT() {
  const lang = useUiStore((s) => s.uiLang);
  return (fr, en, es) => pickLang(lang, fr, en, es);
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
  return lang === 'es' ? 'es-ES' : lang === 'en' ? 'en-GB' : 'fr-FR';
}
