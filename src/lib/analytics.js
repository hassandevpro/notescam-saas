// MESURE D'USAGE (PostHog) — CLOUD UNIQUEMENT, SANS DONNÉE PERSONNELLE
//
// Trois gardes, dans cet ordre. Chacune suffit à tout rendre inerte.
//
//   1. ÉDITION — jamais en LAN. Un poste d'école travaille hors ligne par
//      conception ; lui faire émettre des requêtes vers un service tiers
//      contredit l'argument du produit et ferait sortir de l'école des données
//      qui ne doivent pas en sortir. `IS_LAN` est une constante de build et
//      l'import de `posthog-js` est DYNAMIQUE : la bibliothèque n'entre pas
//      dans le bundle LAN, elle n'est même pas téléchargée.
//
//   2. CLÉ — sans `VITE_POSTHOG_KEY`, rien ne s'initialise, et aucun appel
//      n'est émis. Aucune clé n'est écrite en dur : une clé d'ingestion n'a
//      rien à faire dans le dépôt (le repli en dur de `supabase.js` est un cas
//      à part, c'est une clé anonyme déjà publique côté client).
//
//   3. CONTENU — `autocapture` et le rejeu de session sont COUPÉS. L'autocapture
//      envoie le texte des éléments cliqués, le rejeu envoie l'écran : sur cette
//      application, les deux expédieraient des noms d'élèves, des notes, des
//      montants et des téléphones de parents. Tout ce qui part passe par
//      `analyticsScrub.js`, y compris les propriétés fabriquées par PostHog
//      lui-même (`sanitize_properties`), car l'URL courante porte des
//      identifiants d'élèves.
//
// Hors-ligne : l'initialisation est asynchrone et toute erreur est avalée. Une
// mesure d'usage ne doit JAMAIS retarder ni empêcher l'ouverture de l'app —
// c'est la règle de `supabase.js` (délai + repli) appliquée ici.
import { IS_LAN } from './edition.js';
import { sanitizePath, cheminDeUrl, scrubProps } from './analyticsScrub.js';

const CLE  = import.meta.env?.VITE_POSTHOG_KEY || '';
// Par défaut l'entrée EUROPÉENNE : les écoles clientes sont en Afrique centrale
// et leurs données scolaires n'ont aucune raison de transiter par les États-Unis.
// `VITE_POSTHOG_HOST` permet de pointer une autre instance (ou auto-hébergée).
const HOTE = import.meta.env?.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';

let ph = null;
let demarrage = null;

/** Vrai si la mesure peut fonctionner : édition cloud ET clé fournie. */
export function analyticsActif() { return !IS_LAN && !!CLE; }

/** Charge et initialise PostHog. Idempotent, non bloquant, sans échec visible. */
export function initAnalytics() {
  if (!analyticsActif()) return Promise.resolve(null);
  if (demarrage) return demarrage;
  demarrage = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(CLE, {
        api_host: HOTE,
        autocapture: false,              // (3) le texte des éléments cliqués ne part pas
        disable_session_recording: true, // (3) l'écran non plus
        capture_pageview: false,         // on envoie nous-mêmes un chemin nettoyé
        capture_pageleave: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
        persistence: 'localStorage',     // pas de cookie : rien à demander à l'utilisateur
        person_profiles: 'identified_only',
        sanitize_properties: (props) => {
          const p = { ...props };
          // PostHog renseigne l'URL complète : elle contient l'identifiant de
          // l'élève consulté. On la réduit au chemin, puis on la gabarise.
          if (p.$current_url) p.$current_url = sanitizePath(cheminDeUrl(p.$current_url));
          if (p.$pathname)    p.$pathname    = sanitizePath(p.$pathname);
          if (p.$referrer && p.$referrer !== '$direct') p.$referrer = sanitizePath(cheminDeUrl(p.$referrer));
          return scrubProps(p, { max: 80 });
        },
      });
      ph = posthog;
      return posthog;
    })
    .catch((err) => {
      console.warn('analytics : chargement impossible —', err?.message || err);
      return null;
    });
  return demarrage;
}

/**
 * Rattache les mesures à un COMPTE, par identifiants techniques seulement :
 * jamais le nom, jamais l'adresse e-mail. Le rôle et l'école suffisent à lire
 * un entonnoir ; l'identité de la personne n'apporte rien et coûte cher.
 */
export function identifyUser({ userId, schoolId, role } = {}) {
  if (!ph || !userId) return;
  try { ph.identify(userId, scrubProps({ school_id: schoolId, role })); } catch { /* jamais bloquant */ }
}

/** Déconnexion : on coupe le lien entre l'appareil et le compte précédent. */
export function resetAnalytics() {
  if (!ph) return;
  try { ph.reset(); } catch { /* jamais bloquant */ }
}

/** Un événement métier. `props` est filtré comme tout le reste. */
export function trackEvent(nom, props = {}) {
  if (!ph || !nom) return;
  try { ph.capture(nom, scrubProps(props)); } catch { /* jamais bloquant */ }
}

/** Une vue d'écran, sur le CHEMIN gabarisé (`/app/students/:id`). */
export function trackPageview(pathname) {
  if (!ph) return;
  try { ph.capture('$pageview', { $current_url: sanitizePath(pathname || '') }); } catch { /* jamais bloquant */ }
}
