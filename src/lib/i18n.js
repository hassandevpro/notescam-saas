// Minimal i18n helper.
// Usage : const t = useT(); puis t('Texte FR', 'English text', 'Texto ES').
// Le 3ème argument (espagnol) est optionnel — si absent, on retombe sur le
// dictionnaire FR_TO_ES (couvre la plupart des chaînes courantes), puis sur FR.
//
// LES DICTIONNAIRES SONT CHARGÉS À LA DEMANDE. Ils étaient importés
// statiquement : comme `useT()` est utilisé par presque toutes les pages, les
// tables espagnole (25 Ko gzip) et turque (39 Ko gzip) atterrissaient dans le
// morceau d'entrée. Une école francophone téléchargeait donc 64 Ko d'espagnol et
// de turc avant d'afficher l'écran de connexion. Seule la langue active est
// désormais chargée, et le chargement démarre dès le boot pour ne pas faire
// clignoter l'interface.
import { useCallback, useEffect, useState } from 'react';
import { useUiStore } from '../store/uiStore';

export const SUPPORTED_LANGS = ['fr', 'en', 'es', 'tr'];

// Dictionnaires chargés (null tant qu'ils ne le sont pas). FR et EN vivent dans
// le code même : aucun dictionnaire à charger pour eux.
const dicts = { es: null, tr: null };
const pending = {};
const listeners = new Set();

/**
 * Charge le dictionnaire d'une langue, une seule fois. Renvoie une promesse
 * résolue quand il est disponible (immédiate pour fr/en).
 */
export function ensureDict(lang) {
  if (lang !== 'es' && lang !== 'tr') return Promise.resolve();
  if (dicts[lang]) return Promise.resolve();
  if (!pending[lang]) {
    pending[lang] = (lang === 'es'
      ? import('./i18n_es').then((m) => { dicts.es = m.FR_TO_ES; })
      : import('./i18n_tr').then((m) => { dicts.tr = m.FR_TO_TR; })
    )
      .then(() => { for (const l of listeners) l(); })
      .catch((e) => { console.warn('i18n', lang, e); pending[lang] = null; });
  }
  return pending[lang];
}

// Traduit `fr` via un dictionnaire FR→XX, sinon laisse fr brut. Gère aussi la
// ponctuation finale courante (ex: « … », « ! ») en réessayant sans elle.
function autoDict(dict, fr) {
  if (!fr || !dict) return fr;
  if (dict[fr]) return dict[fr];
  const trimmed = fr.replace(/[.…!?:]+$/, '');
  if (trimmed !== fr && dict[trimmed]) {
    return dict[trimmed] + fr.slice(trimmed.length);
  }
  return fr;
}

const autoEs = (fr) => autoDict(dicts.es, fr);
const autoTr = (fr) => autoDict(dicts.tr, fr);

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
  const loaded = !!dicts[lang];
  const [, bump] = useState(0);

  // Déclenche le chargement de la langue active et redessine quand il arrive.
  useEffect(() => {
    if (lang !== 'es' && lang !== 'tr') return undefined;
    if (dicts[lang]) return undefined;
    const notify = () => bump((n) => n + 1);
    listeners.add(notify);
    ensureDict(lang);
    return () => listeners.delete(notify);
  }, [lang]);

  // Identité stable tant que la langue (et la disponibilité du dictionnaire) ne
  // changent pas : sinon `t` étant une nouvelle fonction à chaque rendu casse
  // les useCallback/useEffect qui en dépendent (ex. boucle de rendu infinie sur
  // la page Relevés de notes).
  return useCallback((fr, en, es) => pickLang(lang, fr, en, es), [lang, loaded]);
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

// Démarrage du chargement dès l'import du module : pour une école hispanophone
// ou turcophone, le dictionnaire arrive en parallèle du reste de l'application
// au lieu d'attendre le premier rendu traduit.
if (typeof window !== 'undefined') ensureDict(getLang());
