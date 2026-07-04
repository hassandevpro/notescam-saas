// Installe les variables CSS de dimensionnement (catégorie « standard ») sur
// :root, à partir du DocumentScaleManager. Les feuilles bulletin.css / conseil.css
// les consomment via var(--doc-*, <repli>). Importé une fois au démarrage (App).
// Ainsi les bulletins (rendus par CSS) sont pilotés par le même moteur que les
// autres documents — aucune taille fixe en dur.

import { createDocumentScale, pageDimsPx } from './documentScale';

export function installDocumentScaleVars() {
  if (typeof document === 'undefined') return;
  const S = createDocumentScale({ category: 'standard', orientation: 'portrait', ...pageDimsPx('portrait') });
  const root = document.documentElement.style;
  root.setProperty('--doc-logo', `${S.logo}px`);
  root.setProperty('--doc-logo-sm', `${S.logoSm}px`);
  root.setProperty('--doc-stamp', `${S.stamp}px`);
  root.setProperty('--doc-signature', `${S.signatureHeight}px`);
  root.setProperty('--doc-medal', `${S.medal}px`);
}

export default installDocumentScaleVars;
