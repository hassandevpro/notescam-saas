// Minimal i18n helper.
// Usage: const t = useT(); then t('Texte français', 'English text')
import { useUiStore } from '../store/uiStore';

export function useT() {
  const lang = useUiStore((s) => s.uiLang);
  return (fr, en) => lang === 'en' ? en : fr;
}

// Non-hook version for use outside React components
export function getLang() {
  return localStorage.getItem('notescam_ui_lang') || 'fr';
}
